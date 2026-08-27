"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import type { ChatSummary } from "@/lib/chatStorage";
import { supabase } from "@/lib/supabaseClient";
import { fetchAccountChats } from "@/lib/continuitySync";
import { fetchUserProfile, type UserProfile } from "@/lib/profile";

export type SyncStatus = "idle" | "syncing" | "synced" | "pending";
export type ActiveView = "local" | "account";

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
    // activeView is initialized directly from localStorage via useState's
    // lazy initializer, rather than starting at a fixed default and then
    // syncing from localStorage in a mount effect. This reads the "external
    // system" (localStorage) exactly once, before first render, which is
    // both correct behavior and avoids react-hooks/set-state-in-effect —
    // there's no synchronous setState call inside an effect body at all.
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
    const [activeView, setActiveViewRaw] = useState<ActiveView>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("scoutai:active_view") as ActiveView | null;
            if (saved === "local" || saved === "account") {
                return saved;
            }
        }
        return "local";
    });
    const [accountChats, setAccountChats] = useState<ChatSummary[]>([]);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isGlowing, setIsGlowing] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const signedInUserRef = useRef<string | null>(null);
    const hasPendingRef = useRef(false);

    const setActiveView = useCallback((view: ActiveView) => {
        setActiveViewRaw(view);
        if (typeof window !== "undefined") {
            localStorage.setItem("scoutai:active_view", view);
        }
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
                        setActiveViewRaw("account");
                        if (typeof window !== "undefined") {
                            localStorage.setItem("scoutai:active_view", "account");
                        }

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