"use client";

import { useState, useRef, useEffect } from "react";
import { MoreVertical, Edit2, Share2, Trash2, Info } from "lucide-react";
import { getChatRenameStatus } from "@/lib/chatStorage";

export interface ChatMenuProps {
    chatId: string;
    currentTitle: string;
    onRenamed: (newTitle: string) => void;
    onDeleted: () => void;
    onShare: () => void;
    onInfo: () => void;
    onStartRename?: () => void;
}

export function ChatMenu({
    chatId,
    currentTitle,
    onRenamed,
    onDeleted,
    onShare,
    onInfo,
    onStartRename,
}: ChatMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on outside click or Escape
    useEffect(() => {
        if (!isOpen) return;

        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen]);

    const renameStatus = getChatRenameStatus(chatId);

    return (
        <div className="relative inline-block text-left" ref={menuRef}>
            {/* ⋮ Trigger Button */}
            <button
                type="button"
                aria-label="Chat options"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen((prev) => !prev);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800/60 text-neutral-300 backdrop-blur-sm transition-all duration-200 hover:bg-neutral-800 hover:text-white active:scale-95"
            >
                <MoreVertical className="h-4 w-4" />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
                >
                    {/* Rename Row */}
                    {renameStatus.canRename ? (
                        <button
                            type="button"
                            onClick={() => {
                                setIsOpen(false);
                                if (onStartRename) {
                                    onStartRename();
                                }
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
                        >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span>Rename</span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-400 opacity-50 cursor-not-allowed"
                        >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span>Rename ({Math.ceil(renameStatus.retryAfterMs / 60000)}m left)</span>
                        </button>
                    )}

                    {/* Share Row */}
                    <button
                        type="button"
                        onClick={() => {
                            setIsOpen(false);
                            onShare();
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
                    >
                        <Share2 className="h-3.5 w-3.5" />
                        <span>Share</span>
                    </button>

                    {/* Info Row */}
                    <button
                        type="button"
                        onClick={() => {
                            setIsOpen(false);
                            onInfo();
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
                    >
                        <Info className="h-3.5 w-3.5" />
                        <span>Info</span>
                    </button>

                    {/* Delete Row */}
                    <button
                        type="button"
                        onClick={() => {
                            setIsOpen(false);
                            onDeleted();
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                    </button>
                </div>
            )}
        </div>
    );
}
