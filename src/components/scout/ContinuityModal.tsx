"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ActiveView } from "@/lib/useAuth";
import type { UserProfile } from "@/lib/profile";
import {
    syncLocalToAccount,
    syncAccountToLocal,
    deleteMultipleAccountChats,
    deleteMultipleLocalChats,
} from "@/lib/continuitySync";
import {
    updateDisplayName,
    uploadAvatar,
    removeAvatar,
} from "@/lib/profile";
import { AvatarCropModal } from "@/components/scout/AvatarCropModal";
import {
    Check,
    HardDrive,
    RefreshCw,
    LogOut,
    ArrowRight,
    ArrowLeft,
    Info,
    Camera,
    Trash2,
    Pencil,
    X,
} from "lucide-react";

interface ContinuityModalProps {
    onClose: () => void;
    user: User | null;
    activeView: ActiveView;
    onSelectView: (view: ActiveView) => void;
    localChatCount: number;
    accountChatCount: number;
    onSignIn: () => void;
    onSignOut: () => void;
    onRefreshAccountChats: () => Promise<void>;
    onDeleteConfirmedOnCurrentChat?: (deletedChatId: string) => void;
    profile: UserProfile | null;
    onRefreshProfile: () => Promise<void>;
}

function InfoTooltip({ text }: { text: string }) {
    return (
        <div className="group/tooltip relative inline-flex items-center">
            <Info className="h-3.5 w-3.5 text-neutral-400 hover:text-neutral-200 cursor-pointer transition-colors" />
            <div className="pointer-events-none absolute bottom-full right-0 mb-1.5 w-56 rounded-md bg-neutral-900 border border-neutral-700 p-2.5 text-[11px] leading-relaxed font-normal text-neutral-200 shadow-2xl opacity-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 transition-opacity duration-150 z-50">
                {text}
            </div>
        </div>
    );
}

export function ContinuityModal({
    onClose,
    user,
    activeView,
    onSelectView,
    localChatCount,
    accountChatCount,
    onSignIn,
    onSignOut,
    onRefreshAccountChats,
    onDeleteConfirmedOnCurrentChat,
    profile,
    onRefreshProfile,
}: ContinuityModalProps) {
    const innerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isSyncing, setIsSyncing] = useState(false);
    const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

    // Profile inline edit state
    const [nameInput, setNameInput] = useState(profile?.display_name ?? "");
    const [isEditingName, setIsEditingName] = useState(false);
    const [isSavingName, setIsSavingName] = useState(false);
    const [profileFeedback, setProfileFeedback] = useState<{ text: string; error?: boolean } | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    // Crop step state
    const [cropSrc, setCropSrc] = useState<string | null>(null);

    // Deletion Review Panel state (Addendum 2.B)
    const [deletionReview, setDeletionReview] = useState<{
        direction: "localToAccount" | "accountToLocal";
        candidates: { chatId: string; title: string }[];
    } | null>(null);
    const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());

    // Sync local profile name state when profile updates
    useEffect(() => {
        if (profile?.display_name !== undefined) {
            setNameInput(profile.display_name ?? "");
        }
    }, [profile?.display_name]);

    // Close on Escape
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                onClose();
            }
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    // Identity calculations with fallback order:
    // Avatar: profile.avatar_url > google avatar > initials
    // Name: profile.display_name > google name > email
    const googleAvatar = user?.user_metadata?.avatar_url as string | undefined;
    const googleName = user?.user_metadata?.full_name as string | undefined;

    const effectiveAvatarUrl = profile?.avatar_url ?? googleAvatar;
    const effectiveDisplayName =
        profile?.display_name ?? googleName ?? user?.email ?? "Account";

    const initial = (
        profile?.display_name ??
        googleName ??
        user?.email ??
        "A"
    )
        .charAt(0)
        .toUpperCase();

    const accountShortName = effectiveDisplayName.split(" ")[0];

    const handleSyncLocalToAccount = async () => {
        if (!user || isSyncing) return;
        setIsSyncing(true);
        setSyncFeedback(null);
        try {
            const res = await syncLocalToAccount(user.id);
            await onRefreshAccountChats();
            const count = res.uploaded + res.updated;
            if (count > 0) {
                setSyncFeedback(`Synced ${count} chat(s) from Local to Account.`);
            } else {
                setSyncFeedback("No new chats to sync.");
            }

            if (res.deletionCandidates.length > 0) {
                setDeletionReview({
                    direction: "localToAccount",
                    candidates: res.deletionCandidates,
                });
                setSelectedForDeletion(new Set());
            }
        } catch (err) {
            console.error("Local -> Account sync failed:", err);
            setSyncFeedback("Sync failed. Please try again.");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSyncAccountToLocal = async () => {
        if (!user || isSyncing) return;
        setIsSyncing(true);
        setSyncFeedback(null);
        try {
            const res = await syncAccountToLocal(user.id);
            await onRefreshAccountChats();
            const count = res.uploaded + res.updated;
            if (count > 0) {
                setSyncFeedback(`Synced ${count} chat(s) from Account to Local.`);
            } else {
                setSyncFeedback("No new chats to sync.");
            }

            if (res.deletionCandidates.length > 0) {
                setDeletionReview({
                    direction: "accountToLocal",
                    candidates: res.deletionCandidates,
                });
                setSelectedForDeletion(new Set());
            }
        } catch (err) {
            console.error("Account -> Local sync failed:", err);
            setSyncFeedback("Sync failed. Please try again.");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleConfirmDeletions = async () => {
        if (!deletionReview || !user) return;
        const toDelete = Array.from(selectedForDeletion);

        if (toDelete.length > 0) {
            if (deletionReview.direction === "localToAccount") {
                await deleteMultipleAccountChats(user.id, toDelete);
                await onRefreshAccountChats();
            } else {
                deleteMultipleLocalChats(toDelete);
            }

            for (const id of toDelete) {
                if (onDeleteConfirmedOnCurrentChat) {
                    onDeleteConfirmedOnCurrentChat(id);
                }
            }
            setSyncFeedback(
                `Deleted ${toDelete.length} chat(s) from ${
                    deletionReview.direction === "localToAccount" ? "Account" : "Local"
                }.`
            );
        }

        setDeletionReview(null);
        setSelectedForDeletion(new Set());
    };

    const toggleCandidateSelection = (chatId: string) => {
        setSelectedForDeletion((prev) => {
            const next = new Set(prev);
            if (next.has(chatId)) {
                next.delete(chatId);
            } else {
                next.add(chatId);
            }
            return next;
        });
    };

    // Profile actions
    const handleSaveName = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || isSavingName) return;
        setIsSavingName(true);
        setProfileFeedback(null);

        const res = await updateDisplayName(user.id, nameInput);
        if (res.ok) {
            await onRefreshProfile();
            setIsEditingName(false);
            setProfileFeedback({ text: "Display name updated." });
        } else {
            setProfileFeedback({ text: res.error, error: true });
        }
        setIsSavingName(false);
    };

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        // 1. Validate before opening crop UI (keep raw-file checks)
        const MAX_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            setProfileFeedback({ text: "File size exceeds 5MB limit.", error: true });
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }
        const allowedTypes = [
            "image/jpeg", "image/png", "image/webp",
            "image/avif", "image/heic", "image/heif",
        ];
        if (!allowedTypes.includes(file.type)) {
            setProfileFeedback({ text: "Only JPG, PNG, WebP, AVIF, and HEIC/HEIF images are allowed.", error: true });
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        // 2. Read into an object URL and open the crop UI
        setProfileFeedback(null);
        const objectUrl = URL.createObjectURL(file);
        setCropSrc(objectUrl);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleCropConfirm = async (croppedFile: File) => {
        if (!user) return;
        // Release the object URL now that we're done with it
        if (cropSrc) URL.revokeObjectURL(cropSrc);
        setCropSrc(null);

        setIsUploadingPhoto(true);
        setProfileFeedback(null);

        const res = await uploadAvatar(user.id, croppedFile);
        if (res.ok) {
            await onRefreshProfile();
            setProfileFeedback({ text: "Profile photo updated!" });
        } else {
            setProfileFeedback({ text: res.error, error: true });
        }
        setIsUploadingPhoto(false);
    };

    const handleCropCancel = () => {
        if (cropSrc) URL.revokeObjectURL(cropSrc);
        setCropSrc(null);
    };

    const handleRemovePhoto = async () => {
        if (!user) return;
        setIsUploadingPhoto(true);
        setProfileFeedback(null);

        await removeAvatar(user.id);
        await onRefreshProfile();
        setProfileFeedback({ text: "Custom photo removed." });
        setIsUploadingPhoto(false);
    };

    return (
        <>
        {/* Avatar crop modal — sits above everything else */}
        {cropSrc && (
            <AvatarCropModal
                imageSrc={cropSrc}
                onCancel={handleCropCancel}
                onConfirm={handleCropConfirm}
            />
        )}
        <div
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-start justify-end px-4 pt-14 sm:pt-16"
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

            {/* Modal Card */}
            <div
                ref={innerRef}
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface-raised shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            >
                {deletionReview ? (
                    /* ── Dedicated Deletion Review Panel (Addendum 2.B) ── */
                    <div className="p-5 space-y-4">
                        <div className="space-y-1 border-b border-border pb-3">
                            <div className="text-[11px] font-semibold uppercase tracking-widest text-amber-400">
                                Review Deletions
                            </div>
                            <p className="text-xs text-foreground-muted leading-relaxed">
                                These chats no longer exist on{" "}
                                <span className="font-semibold text-white">
                                    {deletionReview.direction === "localToAccount"
                                        ? "Local"
                                        : effectiveDisplayName}
                                </span>
                                . Delete them from{" "}
                                <span className="font-semibold text-white">
                                    {deletionReview.direction === "localToAccount"
                                        ? effectiveDisplayName
                                        : "Local"}
                                </span>{" "}
                                too?
                            </p>
                        </div>

                        <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                            {deletionReview.candidates.map((candidate) => {
                                const isChecked = selectedForDeletion.has(candidate.chatId);
                                return (
                                    <label
                                        key={candidate.chatId}
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center justify-between rounded-lg border border-border bg-neutral-900/60 p-2.5 text-xs text-foreground hover:bg-neutral-800/80 cursor-pointer transition-colors"
                                    >
                                        <div className="truncate font-medium pr-2">
                                            {candidate.title}
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() =>
                                                toggleCandidateSelection(candidate.chatId)
                                            }
                                            className="h-4 w-4 rounded border-neutral-700 bg-neutral-800 text-amber-500 focus:ring-amber-500/20"
                                        />
                                    </label>
                                );
                            })}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={() => setDeletionReview(null)}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-all active:scale-95"
                            >
                                Keep all
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDeletions}
                                className="rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 transition-all active:scale-95 shadow-sm"
                            >
                                Delete selected ({selectedForDeletion.size})
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ── Standard Account Dropdown ── */
                    <div className="divide-y divide-border max-h-[85vh] overflow-y-auto">
                        {/* Header */}
                        <div className="px-5 py-3.5 bg-neutral-900/40 flex items-center justify-between">
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-widest text-foreground-muted">
                                    Continuity
                                </div>
                                <p className="text-xs font-medium text-foreground">
                                    {user ? "Cloud Sync & Views" : "Offline or Cloud Sync"}
                                </p>
                            </div>
                        </div>

                        {/* Profile Section (only when signed in) */}
                        {user && (
                            <div className="p-3.5 space-y-2.5 bg-neutral-900/20">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                    Profile
                                </div>

                                <div className="flex items-center gap-3">
                                    {/* Avatar preview */}
                                    <div className="relative group shrink-0">
                                        {effectiveAvatarUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={effectiveAvatarUrl}
                                                alt={effectiveDisplayName}
                                                className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
                                            />
                                        ) : (
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-white ring-1 ring-border">
                                                {initial}
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            disabled={isUploadingPhoto}
                                            onClick={() => fileInputRef.current?.click()}
                                            aria-label="Upload photo"
                                            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                                        >
                                            <Camera className="h-4 w-4" />
                                        </button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            onChange={handlePhotoSelect}
                                            className="hidden"
                                        />
                                    </div>

                                    {/* Name + Pencil Edit & Email */}
                                    <div className="flex-1 min-w-0 space-y-0.5">
                                        {isEditingName ? (
                                            <form onSubmit={handleSaveName} className="flex items-center gap-1">
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={nameInput}
                                                    onChange={(e) => setNameInput(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Escape") {
                                                            setIsEditingName(false);
                                                            setNameInput(profile?.display_name ?? "");
                                                        }
                                                    }}
                                                    placeholder="Display name"
                                                    className="w-full min-w-0 rounded bg-neutral-900 border border-neutral-700 px-2 py-0.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={isSavingName}
                                                    title="Save name"
                                                    className="text-emerald-400 hover:text-emerald-300 p-0.5 shrink-0 disabled:opacity-40"
                                                >
                                                    <Check className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsEditingName(false);
                                                        setNameInput(profile?.display_name ?? "");
                                                    }}
                                                    title="Cancel"
                                                    className="text-neutral-400 hover:text-white p-0.5 shrink-0"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </form>
                                        ) : (
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <p className="truncate text-xs font-semibold text-white">
                                                    {effectiveDisplayName}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditingName(true)}
                                                    title="Edit display name"
                                                    className="text-neutral-400 hover:text-neutral-200 transition-colors p-0.5 shrink-0"
                                                >
                                                    <Pencil className="h-3 w-3" />
                                                </button>
                                            </div>
                                        )}
                                        <p className="truncate text-[11px] text-neutral-400">
                                            {user.email}
                                        </p>
                                    </div>

                                    {profile?.avatar_url && (
                                        <button
                                            type="button"
                                            onClick={handleRemovePhoto}
                                            title="Remove custom photo"
                                            className="p-1.5 text-neutral-400 hover:text-red-400 transition-colors shrink-0"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>

                                {profileFeedback && (
                                    <div
                                        className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                                            profileFeedback.error
                                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                        }`}
                                    >
                                        {profileFeedback.text}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Views Section */}
                        <div className="p-2 space-y-1">
                            <div className="px-3 pt-1 pb-1 flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                    Switch View
                                </span>
                            </div>

                            {/* View Entry 1: Local */}
                            <button
                                type="button"
                                onClick={() => onSelectView("local")}
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                                    activeView === "local"
                                        ? "bg-neutral-800 text-white ring-1 ring-border-strong"
                                        : "text-neutral-300 hover:bg-neutral-800/50 hover:text-white"
                                }`}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <HardDrive className="h-4 w-4 shrink-0 text-neutral-400" />
                                    <span className="truncate">Local</span>
                                    <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400 border border-neutral-700/50">
                                        {localChatCount}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <InfoTooltip text="Chats stored only on this device's browser. Never uploaded unless you choose to merge." />
                                    {activeView === "local" && (
                                        <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                                    )}
                                </div>
                            </button>

                            {/* View Entry 2: Account (only when signed in) */}
                            {user && (
                                <button
                                    type="button"
                                    onClick={() => onSelectView("account")}
                                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                                        activeView === "account"
                                            ? "bg-neutral-800 text-white ring-1 ring-border-strong"
                                            : "text-neutral-300 hover:bg-neutral-800/50 hover:text-white"
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        {effectiveAvatarUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={effectiveAvatarUrl}
                                                alt={effectiveDisplayName}
                                                className="h-4 w-4 rounded-full object-cover shrink-0 ring-1 ring-border"
                                            />
                                        ) : (
                                            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-neutral-700 text-[9px] font-bold text-white shrink-0">
                                                {initial}
                                            </div>
                                        )}
                                        <div className="truncate text-left min-w-0">
                                            <span className="truncate block font-medium">
                                                {effectiveDisplayName}
                                            </span>
                                        </div>
                                        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400 border border-neutral-700/50">
                                            {accountChatCount}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <InfoTooltip text="Chats synced to your signed-in Google account, accessible from any device." />
                                        {activeView === "account" && (
                                            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                                        )}
                                    </div>
                                </button>
                            )}
                        </div>

                        {/* Merge Section (only when signed in) */}
                        {user && (
                            <div className="p-2 space-y-1 bg-black/20">
                                <div className="px-3 pt-1 pb-1 flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                        Merge
                                    </span>
                                </div>

                                {/* Row 1: Local -> Account */}
                                <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800/80 transition-all">
                                    <button
                                        type="button"
                                        disabled={isSyncing}
                                        onClick={handleSyncLocalToAccount}
                                        className="flex-1 flex items-center justify-between text-left disabled:opacity-50 pr-2"
                                    >
                                        <span className="truncate">Local → {accountShortName}</span>
                                        {isSyncing ? (
                                            <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
                                        ) : (
                                            <ArrowRight className="h-3.5 w-3.5 text-neutral-400" />
                                        )}
                                    </button>
                                    <InfoTooltip text="Pushes new or updated local chats to your account. Deleted local chats are never auto-removed from your account — you'll be asked first." />
                                </div>

                                {/* Row 2: Account -> Local */}
                                <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800/80 transition-all">
                                    <button
                                        type="button"
                                        disabled={isSyncing}
                                        onClick={handleSyncAccountToLocal}
                                        className="flex-1 flex items-center justify-between text-left disabled:opacity-50 pr-2"
                                    >
                                        <span className="truncate">{accountShortName} → Local</span>
                                        {isSyncing ? (
                                            <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
                                        ) : (
                                            <ArrowLeft className="h-3.5 w-3.5 text-neutral-400" />
                                        )}
                                    </button>
                                    <InfoTooltip text="Pulls new or updated account chats into this device. Deleted account chats are never auto-removed locally — you'll be asked first." />
                                </div>

                                {syncFeedback && (
                                    <div className="px-3 py-1.5 text-[11px] font-medium text-amber-400 bg-amber-500/10 rounded-md border border-amber-500/20">
                                        {syncFeedback}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Signed Out Sign-In Prompt */}
                        {!user && (
                            <div className="p-4 space-y-3">
                                <p className="text-xs text-neutral-300 leading-relaxed">
                                    Sign in with Google to view and sync your chats across devices.
                                </p>
                                <button
                                    type="button"
                                    id="continuity-google-signin"
                                    onClick={onSignIn}
                                    className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-neutral-900 hover:bg-zinc-100 active:scale-95 transition-all"
                                >
                                    <svg
                                        className="h-4 w-4"
                                        viewBox="0 0 48 48"
                                        fill="none"
                                    >
                                        <path
                                            d="M47.532 24.552c0-1.636-.147-3.2-.416-4.692H24.48v8.864h12.93c-.558 2.998-2.25 5.54-4.794 7.24v6.018h7.762c4.544-4.183 7.154-10.34 7.154-17.43z"
                                            fill="#4285F4"
                                        />
                                        <path
                                            d="M24.48 48c6.494 0 11.944-2.154 15.924-5.832l-7.762-6.018c-2.152 1.443-4.904 2.292-8.162 2.292-6.274 0-11.592-4.234-13.49-9.928H2.974v6.212C6.934 43.62 15.14 48 24.48 48z"
                                            fill="#34A853"
                                        />
                                        <path
                                            d="M10.99 28.514a14.427 14.427 0 010-9.028V13.27H2.974a23.98 23.98 0 000 21.46l8.016-6.216z"
                                            fill="#FBBC05"
                                        />
                                        <path
                                            d="M24.48 9.558c3.54 0 6.716 1.218 9.216 3.604l6.912-6.912C36.416 2.376 30.97 0 24.48 0 15.14 0 6.934 4.38 2.974 10.728l8.016 6.216c1.898-5.694 7.216-9.386 13.49-9.386z"
                                            fill="#EA4335"
                                        />
                                    </svg>
                                    Continue with Google
                                </button>
                            </div>
                        )}

                        {/* Sign Out Row (only when signed in) */}
                        {user && (
                            <div className="p-2">
                                <button
                                    type="button"
                                    onClick={onSignOut}
                                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition-all active:scale-[0.98]"
                                >
                                    <LogOut className="h-4 w-4 text-neutral-400" />
                                    <span>Sign out</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
        </>
    );
}
