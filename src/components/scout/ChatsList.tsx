"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { compressToEncodedURIComponent } from "lz-string";
import type { User } from "@supabase/supabase-js";
import type { ActiveView } from "@/lib/useAuth";
import {
    listAllChats,
    renameChatState,
    deleteChatState,
    loadChatState,
    type ChatSummary,
} from "@/lib/chatStorage";
import {
    deleteAccountChat,
    fetchAccountChatState,
    upsertChat,
} from "@/lib/continuitySync";
import { ChatMenu } from "@/components/scout/ChatMenu";
import { Check, Copy } from "lucide-react";

type ShareDialogState = {
    title: string;
    url: string;
};

interface ChatsListProps {
    onClose: () => void;
    activeView: ActiveView;
    user: User | null;
    accountChats: ChatSummary[];
    onRefreshAccountChats: () => Promise<void>;
    onSignIn: () => void;
    onSwitchToLocal: () => void;
    currentChatId?: string;
    onDeleteConfirmedOnCurrentChat?: (deletedChatId: string) => void;
}

export function ChatsList({
    onClose,
    activeView,
    user,
    accountChats,
    onRefreshAccountChats,
    onSignIn,
    onSwitchToLocal,
    currentChatId,
    onDeleteConfirmedOnCurrentChat,
}: ChatsListProps) {
    const router = useRouter();
    const [localChats, setLocalChats] = useState<ChatSummary[]>([]);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [infoChatId, setInfoChatId] = useState<string | null>(null);
    const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
    const [shareDialog, setShareDialog] = useState<ShareDialogState | null>(null);
    const [shareCopied, setShareCopied] = useState(false);

    const infoRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadTimer = window.setTimeout(() => {
            setLocalChats(listAllChats());
        }, 0);

        return () => window.clearTimeout(loadTimer);
    }, []);

    // Dismiss info popup on outside click
    useEffect(() => {
        if (!infoChatId) return;

        function handleClickOutside(e: MouseEvent) {
            if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
                setInfoChatId(null);
            }
        }

        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                setInfoChatId(null);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [infoChatId]);

    const chats = activeView === "local" ? localChats : accountChats;

    // Handle rename submit
    const handleRenameSubmit = async (chatId: string) => {
        if (renamingId !== chatId) return;
        const trimmed = renameValue.trim();

        if (activeView === "local") {
            const res = renameChatState(chatId, trimmed);
            if (res.ok) {
                setLocalChats((prev) =>
                    prev.map((c) => (c.id === chatId ? { ...c, title: trimmed } : c))
                );
                setRenamingId(null);
            } else {
                setRenamingId(null);
                const msg =
                    res.retryAfterMs === 0
                        ? "Name can't be empty"
                        : `Try again in ${Math.ceil(res.retryAfterMs / 60000)}m`;
                setRowError({ id: chatId, message: msg });
                setTimeout(() => setRowError(null), 2000);
            }
        } else if (activeView === "account" && user) {
            if (!trimmed) {
                setRenamingId(null);
                setRowError({ id: chatId, message: "Name can't be empty" });
                setTimeout(() => setRowError(null), 2000);
                return;
            }
            try {
                const state = await fetchAccountChatState(user.id, chatId);
                if (state) {
                    const updatedState = { ...state, title: trimmed, titleIsCustom: true, lastUpdated: Date.now() };
                    await upsertChat(chatId, updatedState);
                    await onRefreshAccountChats();
                }
                setRenamingId(null);
            } catch (err) {
                console.error("Account rename failed:", err);
                setRenamingId(null);
            }
        }
    };

    // Handle delete confirmation (SCOPED TO ACTIVE VIEW)
    const handleConfirmDelete = async () => {
        if (!confirmDeleteId) return;

        const targetId = confirmDeleteId;
        setConfirmDeleteId(null);

        if (activeView === "local") {
            deleteChatState(targetId);
            setLocalChats((prev) => prev.filter((c) => c.id !== targetId));
        } else if (activeView === "account" && user) {
            await deleteAccountChat(user.id, targetId);
            await onRefreshAccountChats();
        }

        // If deleted chat is currently open, navigate away
        if (targetId === currentChatId && onDeleteConfirmedOnCurrentChat) {
            onDeleteConfirmedOnCurrentChat(targetId);
        }
    };

    // Handle share chat
    const handleShare = async (chat: ChatSummary) => {
        let stored = activeView === "local" ? loadChatState(chat.id) : null;
        if (!stored && activeView === "account" && user) {
            stored = await fetchAccountChatState(user.id, chat.id);
        }
        if (!stored) return;

        try {
            const payload = {
                history: stored.history,
                slots: stored.slots,
                runs: stored.runs,
                title: stored.title,
            };
            const compressed = compressToEncodedURIComponent(JSON.stringify(payload));
            const shareUrl = `${window.location.origin}/share#payload=${compressed}`;
            setShareCopied(false);
            setShareDialog({
                title: chat.title,
                url: shareUrl,
            });
        } catch (err) {
            console.error("Failed to share chat:", err);
        }
    };

    const handleCopyShareLink = async () => {
        if (!shareDialog) return;

        try {
            await navigator.clipboard.writeText(shareDialog.url);
            setShareCopied(true);
            window.setTimeout(() => setShareCopied(false), 1500);
        } catch (err) {
            console.error("Failed to copy share link:", err);
        }
    };

    return (
        <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
            <div className="mb-6 flex items-center justify-between px-1">
                {/* Section Label */}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800/40 px-3 py-1 text-[13px] font-semibold tracking-wider text-neutral-300 backdrop-blur-sm border border-neutral-700/40">
                    <span
                        className={`h-1.5 w-1.5 rounded-full ${
                            activeView === "account" ? "bg-amber-400" : "bg-emerald-400"
                        }`}
                    />
                    {activeView === "account" ? "Account Chats" : "Local Chats"}
                </span>

                {/* Back Button */}
                <button
                    onClick={onClose}
                    className="group inline-flex items-center gap-1 font-display rounded-full bg-neutral-800/60 px-3 py-1.5 text-xs font-medium text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
                >
                    <svg
                        className="h-3.5 w-3.5 text-neutral-400 transition-colors group-hover:text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.75 19.5L8.25 12l7.5-7.5"
                        />
                    </svg>
                    <span>Back</span>
                </button>
            </div>

            {/* Signed-out banner when viewing Account view */}
            {activeView === "account" && !user ? (
                <div className="rounded-xl border border-border bg-neutral-900/60 p-5 space-y-3">
                    <p className="text-sm text-neutral-300 leading-relaxed">
                        You're signed out. Sign in again to access your account chats, or switch to Local.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => {
                                onClose();
                                onSignIn();
                            }}
                            className="rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-900 hover:bg-zinc-100 transition-all active:scale-95"
                        >
                            Sign in
                        </button>
                        <button
                            type="button"
                            onClick={onSwitchToLocal}
                            className="rounded-lg border border-border bg-neutral-800 px-3.5 py-1.5 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-700 transition-all active:scale-95"
                        >
                            Switch to Local
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {chats.length === 0 && (
                        <p className="text-sm text-foreground-muted">
                            {activeView === "account" ? "No account chats yet." : "No local chats yet."}
                        </p>
                    )}

                    <div className="space-y-2">
                        {chats.map((chat) => {
                            const isRenaming = renamingId === chat.id;
                            const isInfoOpen = infoChatId === chat.id;

                            return (
                                <div key={chat.id} className="relative flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        {/* Navigate to Chat / Title Area */}
                                        <div
                                            onClick={() => {
                                                if (!isRenaming) {
                                                    onClose();
                                                    router.push(`/chat/${chat.id}`);
                                                }
                                            }}
                                            className="group flex flex-1 min-w-0 items-center justify-between gap-3 rounded-full bg-neutral-800/60 px-4 py-3 text-left text-sm text-neutral-200 backdrop-blur-sm transition-all duration-200 hover:scale-[1.01] hover:bg-neutral-800 hover:text-white active:scale-95 cursor-pointer"
                                        >
                                            {isRenaming ? (
                                                <input
                                                    autoFocus
                                                    value={renameValue}
                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") {
                                                            handleRenameSubmit(chat.id);
                                                        } else if (e.key === "Escape") {
                                                            setRenamingId(null);
                                                        }
                                                    }}
                                                    onBlur={() => handleRenameSubmit(chat.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-full bg-transparent font-medium text-white border-b border-border-strong focus:outline-none text-sm"
                                                />
                                            ) : (
                                                <div className="truncate font-medium">{chat.title}</div>
                                            )}

                                            {chat.lastUpdated ? (
                                                <div className="shrink-0 text-xs text-neutral-400 group-hover:text-neutral-300">
                                                    {new Date(chat.lastUpdated).toLocaleDateString()}
                                                </div>
                                            ) : null}
                                        </div>

                                        {/* Per-chat ⋮ Menu */}
                                        <div className="shrink-0">
                                            <ChatMenu
                                                chatId={chat.id}
                                                currentTitle={chat.title}
                                                onStartRename={() => {
                                                    setRenamingId(chat.id);
                                                    setRenameValue(chat.title);
                                                }}
                                                onRenamed={(newTitle) => {
                                                    if (activeView === "local") {
                                                        setLocalChats((prev) =>
                                                            prev.map((c) =>
                                                                c.id === chat.id ? { ...c, title: newTitle } : c
                                                            )
                                                        );
                                                    }
                                                }}
                                                onDeleted={() => setConfirmDeleteId(chat.id)}
                                                onShare={() => handleShare(chat)}
                                                onInfo={() =>
                                                    setInfoChatId(infoChatId === chat.id ? null : chat.id)
                                                }
                                            />
                                        </div>
                                    </div>

                                    {/* Floating Info Box */}
                                    {isInfoOpen && (
                                        <div
                                            ref={infoRef}
                                            onClick={(e) => e.stopPropagation()}
                                            className="absolute right-0 top-full mt-1 z-40 w-64 rounded-lg border border-border bg-surface-raised p-3.5 shadow-xl text-xs space-y-1.5"
                                        >
                                            <div className="font-semibold text-neutral-200 truncate">
                                                {chat.title}
                                            </div>
                                            <div className="text-foreground-muted">
                                                Storage:{" "}
                                                <span className="text-amber-400 font-medium capitalize">
                                                    {activeView}
                                                </span>
                                            </div>
                                            <div className="text-foreground-muted">
                                                Last updated:{" "}
                                                <span className="text-neutral-300">
                                                    {chat.lastUpdated
                                                        ? new Date(chat.lastUpdated).toLocaleString()
                                                        : "Unknown"}
                                                </span>
                                            </div>
                                            <div className="pt-1 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => setInfoChatId(null)}
                                                    className="text-xs text-neutral-400 hover:text-white"
                                                >
                                                    Close
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Inline Error Message */}
                                    {rowError && rowError.id === chat.id && (
                                        <div className="px-4 text-xs text-danger animate-fade-in">
                                            {rowError.message}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Share Modal */}
            {shareDialog && (
                <div
                    onClick={() => setShareDialog(null)}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-sm rounded-lg border border-border bg-surface-raised p-6 shadow-2xl space-y-5"
                    >
                        <div className="space-y-2">
                            <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                                Share chat
                            </div>
                            <h3 className="truncate text-base font-semibold text-foreground">
                                {shareDialog.title}
                            </h3>
                        </div>

                        <div className="rounded-lg border border-border bg-black/30 p-3.5">
                            <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                                Viewer access
                            </div>
                            <p className="mt-1.5 text-sm leading-relaxed text-neutral-300">
                                Anyone with this link can view this shared ScoutAI chat and its
                                scouting results.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                                Share link
                            </label>
                            <div className="flex h-11 items-center rounded-lg border border-border bg-surface px-3 focus-within:border-border-strong">
                                <input
                                    readOnly
                                    value={shareDialog.url}
                                    className="selectable min-w-0 flex-1 bg-transparent pr-3 text-sm text-neutral-300 outline-none"
                                    onFocus={(e) => e.currentTarget.select()}
                                />
                                <button
                                    type="button"
                                    onClick={handleCopyShareLink}
                                    aria-label="Copy share link"
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800/60 text-neutral-300 transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
                                >
                                    {shareCopied ? (
                                        <Check className="h-4 w-4 text-success" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setShareDialog(null)}
                                className="rounded-full bg-neutral-800/60 px-4 py-1.5 text-sm text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {confirmDeleteId && (
                <div
                    onClick={() => setConfirmDeleteId(null)}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-sm rounded-lg border border-border bg-surface-raised p-6 shadow-2xl space-y-4"
                    >
                        <h3 className="text-base font-semibold text-foreground">
                            Delete from {activeView === "account" ? "Account" : "Local"}?
                        </h3>
                        <p className="text-sm text-foreground-muted leading-relaxed">
                            {activeView === "account"
                                ? "This chat will be removed from your cloud account. Local copy (if any) will remain untouched."
                                : "This chat will be removed from this browser. Cloud account copy (if any) will remain untouched."}
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-full bg-neutral-800/60 px-4 py-1.5 text-sm text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                className="rounded-full bg-danger/10 px-4 py-1.5 text-sm font-medium text-danger transition-all duration-200 hover:bg-danger/20 active:scale-95"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
