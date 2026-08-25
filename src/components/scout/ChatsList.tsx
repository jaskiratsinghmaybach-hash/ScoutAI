"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { compressToEncodedURIComponent } from "lz-string";
import {
    listAllChats,
    renameChatState,
    deleteChatState,
    loadChatState,
    type ChatSummary,
} from "@/lib/chatStorage";
import { ChatMenu } from "@/components/scout/ChatMenu";

export function ChatsList({ onClose }: { onClose: () => void }) {
    const router = useRouter();
    const [chats, setChats] = useState<ChatSummary[]>([]);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [infoChatId, setInfoChatId] = useState<string | null>(null);
    const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
    const [shareToast, setShareToast] = useState<{ id: string; message: string } | null>(null);

    const infoRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setChats(listAllChats());
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

    // Handle rename submit
    const handleRenameSubmit = (chatId: string) => {
        if (renamingId !== chatId) return;
        const res = renameChatState(chatId, renameValue);
        if (res.ok) {
            setChats((prev) =>
                prev.map((c) => (c.id === chatId ? { ...c, title: renameValue.trim() } : c))
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
    };

    // Handle delete confirmation
    const handleConfirmDelete = () => {
        if (!confirmDeleteId) return;
        deleteChatState(confirmDeleteId);
        setChats((prev) => prev.filter((c) => c.id !== confirmDeleteId));
        setConfirmDeleteId(null);
    };

    // Handle share chat
    const handleShare = async (chatId: string) => {
        const stored = loadChatState(chatId);
        if (!stored) return;

        try {
            const payload = {
                history: stored.history,
                slots: stored.slots,
                runs: stored.runs,
                title: stored.title,
            };
            const compressed = compressToEncodedURIComponent(JSON.stringify(payload));
            const shareUrl = `${window.location.origin}/share/${compressed}`;
            await navigator.clipboard.writeText(shareUrl);

            setShareToast({ id: chatId, message: "Link copied!" });
            setTimeout(() => setShareToast(null), 2000);
        } catch (err) {
            console.error("Failed to share chat:", err);
        }
    };

    return (
        <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
            <div className="mb-6 flex items-center justify-between px-1">
                {/* Section Label */}
                <span className="inline-flex items-center rounded-full bg-neutral-800/40 px-3 py-1 text-[14px] font-semibold tracking-wider text-neutral-400 backdrop-blur-sm">
                    Your Chats
                </span>

                {/* Back Button */}
                <button
                    onClick={onClose}
                    className="group inline-flex items-center gap-1 font-display rounded-full bg-neutral-800/60 px-3 py-1.5 text-xs font-medium text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
                >
                    {/* Left Arrow Icon */}
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

            {chats.length === 0 && (
                <p className="text-sm text-foreground-muted">No chats yet.</p>
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
                                            setChats((prev) =>
                                                prev.map((c) =>
                                                    c.id === chat.id ? { ...c, title: newTitle } : c
                                                )
                                            );
                                        }}
                                        onDeleted={() => setConfirmDeleteId(chat.id)}
                                        onShare={() => handleShare(chat.id)}
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

                            {/* Inline Share Toast */}
                            {shareToast && shareToast.id === chat.id && (
                                <div className="px-4 text-xs text-success animate-fade-in">
                                    {shareToast.message}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

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
                            Delete this chat?
                        </h3>
                        <p className="text-sm text-foreground-muted leading-relaxed">
                            This action cannot be undone. All messages and scouting results will be
                            permanently removed.
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