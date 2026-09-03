"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import type { ChatSummary } from "@/lib/chatStorage";
import { supabase } from "@/lib/supabaseClient";
import { fetchAccountChats } from "@/lib/continuitySync";
import { fetchUserProfile, type UserProfile } from "@/lib/profile";

export type SyncStatus = "idle" | "syncing" | "synced" | "pending";
export type ActiveView = "local" | "account";

const ACTIVE_VIEW_KEY = "scoutai:active_view";

function isActiveView(value: string | null): value is ActiveView {
    return value === "local" || value === "account";
}

// activeView is backed by localStorage but read through
// useSyncExternalStore rather than a `typeof window` branch inside a
// useState lazy initializer. That branch was the direct cause of the
// hydration mismatch: the server can only ever render "local" (no
// localStorage there), but a lazy initializer runs during the client's
// first hydration pass too, so if "account" was saved, the client's
// very first paint disagreed with the server-rendered HTML.
// useSyncExternalStore fixes this by using getServerSnapshot ("local")
// for the server render *and* the client's initial hydration render,
// then re-rendering with the real localStorage value right after
// hydration finishes — no mismatch, no effect-based reset needed.
const activeViewListeners = new Set<() => void>();

function subscribeActiveView(listener: () => void) {
    activeViewListeners.add(listener);
    return () => activeViewListeners.delete(listener);
}

function getActiveViewSnapshot(): ActiveView {
    if (typeof window === "undefined") return "local";
    const saved = localStorage.getItem(ACTIVE_VIEW_KEY);
    return isActiveView(saved) ? saved : "local";
}

function getActiveViewServerSnapshot(): ActiveView {
    return "local";
}

function writeActiveView(view: ActiveView) {
    if (typeof window !== "undefined") {
        localStorage.setItem(ACTIVE_VIEW_KEY, view);
    }
    activeViewListeners.forEach((listener) => listener());
}

export interface UseAuthReturn {
    user: User | null;
    loading: boolean;
    syncStatus: SyncStatus;
    activeView: ActiveView;
    setActiveView: (view: ActiveView) => void;
    accountChats: ChatSummary[];
    refreshAccountChats: () => Promise<void>;
    profile: UserProfile | null;
    refreshProfile: () => Promise<void>;
    isGlowing: boolean;
    isDropdownOpen: boolean;
    setIsDropdownOpen: (open: boolean) => void;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    /** Call with the promise from upsertChat() to drive the sync status indicator. */
    reportWrite: (writePromise: Promise<void>) => void;
}

/**
 * useAuth — tracks Supabase auth state, view mode, user profile, and account chats.
 *
 * Sign-in flow: does NOT auto-upload or auto-merge anything.
 * Fetches account chats read-only, sets activeView='account', triggers glow animation,
 * and auto-opens account dropdown after glow animation completes.
 */
export function useAuth(): UseAuthReturn {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
    const activeView = useSyncExternalStore(
        subscribeActiveView,
        getActiveViewSnapshot,
        getActiveViewServerSnapshot,
    );
    const [accountChats, setAccountChats] = useState<ChatSummary[]>([]);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isGlowing, setIsGlowing] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const signedInUserRef = useRef<string | null>(null);
    const hasPendingRef = useRef(false);

    const setActiveView = useCallback((view: ActiveView) => {
        writeActiveView(view);
    }, []);

    const refreshAccountChats = useCallback(async () => {
        const sessionUser = (await supabase.auth.getSession()).data.session?.user;
        if (sessionUser) {
            const chats = await fetchAccountChats(sessionUser.id);
            setAccountChats(chats);
        } else {
            setAccountChats([]);
        }
    }, []);

    const refreshProfile = useCallback(async () => {
        const sessionUser = (await supabase.auth.getSession()).data.session?.user;
        if (sessionUser) {
            const p = await fetchUserProfile(sessionUser.id);
            setProfile(p);
        } else {
            setProfile(null);
        }
    }, []);

    useEffect(() => {
        // Bootstrap: get current session on mount
        supabase.auth.getSession().then(({ data: { session } }) => {
            const u = session?.user ?? null;
            setUser(u);
            signedInUserRef.current = u?.id ?? null;
            if (u) {
                fetchAccountChats(u.id).then(setAccountChats);
                fetchUserProfile(u.id).then(setProfile);
            }
            setLoading(false);
        });

        // Reactively track session changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                const nextUser = session?.user ?? null;
                const prevUserId = signedInUserRef.current;
                setUser(nextUser);
                signedInUserRef.current = nextUser?.id ?? null;
                setLoading(false);

                if (nextUser) {
                    const p = await fetchUserProfile(nextUser.id);
                    setProfile(p);

                    if (event === "SIGNED_IN" && prevUserId !== nextUser.id) {
                        // Fresh sign-in flow:
                        // a. Do NOT auto-upload or auto-merge anything
                        // b. Fetch account's existing Supabase chats (read-only)
                        const chats = await fetchAccountChats(nextUser.id);
                        setAccountChats(chats);

                        // c. Set activeView = 'account'
                        writeActiveView("account");

                        // d. Trigger brief glow/pulse animation on account icon
                        setIsGlowing(true);

                        // e. After glow completes (~750ms), auto-open dropdown
                        setTimeout(() => {
                            setIsGlowing(false);
                            setIsDropdownOpen(true);
                        }, 750);
                    } else {
                        // Refresh session or already signed in
                        const chats = await fetchAccountChats(nextUser.id);
                        setAccountChats(chats);
                    }
                } else {
                    // SIGNED_OUT
                    setAccountChats([]);
                    setProfile(null);
                    setSyncStatus("idle");
                }
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const signInWithGoogle = useCallback(async () => {
        await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: typeof window !== "undefined"
                    ? window.location.origin
                    : undefined,
            },
        });
    }, []);

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
    }, []);

    const reportWrite = useCallback((writePromise: Promise<void>) => {
        setSyncStatus("syncing");
        writePromise
            .then(() => {
                hasPendingRef.current = false;
                setSyncStatus("synced");
            })
            .catch((err) => {
                console.error("[Continuity] Write failed:", err);
                hasPendingRef.current = true;
                setSyncStatus("pending");
            });
    }, []);

    return {
        user,
        loading,
        syncStatus,
        activeView,
        setActiveView,
        accountChats,
        refreshAccountChats,
        profile,
        refreshProfile,
        isGlowing,
        isDropdownOpen,
        setIsDropdownOpen,
        signInWithGoogle,
        signOut,
        reportWrite,
    };
}