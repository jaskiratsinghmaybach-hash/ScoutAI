"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, Copy, Check, Pencil } from "lucide-react";

interface UserMessageProps {
    content: string;
    /**
     * Called when the user saves an edit. The parent owns what happens
     * next (re-sending, branching, etc.) — this component only handles
     * the local text-editing UI.
     */
    onEdit?: (newContent: string) => void;
}

export function UserMessage({ content, onEdit }: UserMessageProps) {
    const [expanded, setExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(content);
    const [copied, setCopied] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const lines = content.split("\n");
    const isLong = content.length > 140 || lines.length > 3;

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            // Place cursor at the end rather than selecting all
            const len = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(len, len);
        }
    }, [isEditing]);

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (err) {
            console.error("Failed to copy message:", err);
        }
    }

    function startEdit() {
        setDraft(content);
        setIsEditing(true);
    }

    function cancelEdit() {
        setDraft(content);
        setIsEditing(false);
    }

    function saveEdit() {
        const trimmed = draft.trim();
        if (trimmed.length === 0 || trimmed === content) {
            setIsEditing(false);
            return;
        }
        onEdit?.(trimmed);
        setIsEditing(false);
    }

    if (isEditing) {
        return (
            <div className="ml-auto w-fit max-w-[85%] min-w-[240px] rounded-3xl bg-surface-raised px-3 py-2 text-sm">
                <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            saveEdit();
                        } else if (e.key === "Escape") {
                            cancelEdit();
                        }
                    }}
                    rows={Math.min(8, Math.max(2, draft.split("\n").length))}
                    className="w-full resize-none bg-transparent text-foreground focus:outline-none"
                />
                <div className="mt-2 flex justify-end gap-2">
                    <button
                        onClick={cancelEdit}
                        className="rounded-full px-3 py-1 text-xs text-foreground-muted hover:bg-neutral-800/60 hover:text-foreground"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={saveEdit}
                        className="rounded-full bg-white px-3 py-1 text-xs font-medium text-black hover:bg-zinc-200"
                    >
                        Save
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="group/message ml-auto flex w-fit max-w-[85%] flex-col items-end">
            <div className="rounded-3xl bg-surface-raised px-3 py-2 text-sm">
                <p className={expanded ? "" : "line-clamp-3"}>{content}</p>
                {isLong && (
                    <button
                        onClick={() => setExpanded((v) => !v)}
                        className="mt-1 flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground"
                    >
                        {expanded ? (
                            <>
                                Show less <ChevronUp className="h-3 w-3" />
                            </>
                        ) : (
                            <>
                                Show more <ChevronDown className="h-3 w-3" />
                            </>
                        )}
                    </button>
                )}
            </div>

            {/* Hover actions — hidden by default, revealed on hover over the message */}
            <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100">
                <button
                    onClick={handleCopy}
                    aria-label="Copy message"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-foreground-muted hover:bg-neutral-800/60 hover:text-foreground"
                >
                    {copied ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                        <Copy className="h-3.5 w-3.5" />
                    )}
                </button>
                {onEdit && (
                    <button
                        onClick={startEdit}
                        aria-label="Edit message"
                        className="flex h-6 w-6 items-center justify-center rounded-full text-foreground-muted hover:bg-neutral-800/60 hover:text-foreground"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}