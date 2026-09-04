import type { SlotState, ConversationTurn, ScoutRun } from "@/types";

export interface StoredChatState {
    history: ConversationTurn[];
    slots: SlotState;
    runs: ScoutRun[];
    title?: string;
    titleIsCustom?: boolean;   // true once user has manually renamed
    lastRenamedAt?: number;    // epoch ms, kept for existing saved chats
    renameTimestamps?: number[]; // epoch ms values for rename rate limiting
    lastUpdated?: number;
}

const RENAME_WINDOW_MS = 60 * 60 * 1000;
const MAX_RENAMES_PER_WINDOW = 5;

function storageKey(chatId: string) {
    return `scoutai:chat:${chatId}`;
}

export function saveChatState(chatId: string, state: StoredChatState) {
    if (!state.history || state.history.length === 0) return;
    try {
        const existing = loadChatState(chatId);
        const withTimestamp: StoredChatState = {
            ...existing,
            ...state,
            lastUpdated: Date.now(),
        };
        localStorage.setItem(storageKey(chatId), JSON.stringify(withTimestamp));
    } catch (err) {
        console.error("Failed to save chat state:", err);
    }
}

export function loadChatState(chatId: string): StoredChatState | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(storageKey(chatId));
        if (!raw) return null;
        return JSON.parse(raw) as StoredChatState;
    } catch (err) {
        console.error("Failed to load chat state:", err);
        return null;
    }
}

export function renameChatState(
    chatId: string,
    newTitle: string
): { ok: true } | { ok: false; retryAfterMs: number } {
    if (typeof window === "undefined") return { ok: false, retryAfterMs: 0 };
    const trimmed = newTitle.trim();
    if (!trimmed) {
        return { ok: false, retryAfterMs: 0 };
    }

    const state = loadChatState(chatId);
    if (!state) {
        return { ok: false, retryAfterMs: 0 };
    }

    const now = Date.now();
    const recentRenames = (state.renameTimestamps ?? (state.lastRenamedAt ? [state.lastRenamedAt] : []))
        .filter((timestamp) => now - timestamp < RENAME_WINDOW_MS)
        .sort((a, b) => a - b);

    if (recentRenames.length >= MAX_RENAMES_PER_WINDOW) {
        const remaining = RENAME_WINDOW_MS - (now - recentRenames[0]);
        return { ok: false, retryAfterMs: remaining };
    }

    const updated: StoredChatState = {
        ...state,
        title: trimmed,
        titleIsCustom: true,
        lastRenamedAt: now,
        renameTimestamps: [...recentRenames, now],
        lastUpdated: now,
    };

    try {
        localStorage.setItem(storageKey(chatId), JSON.stringify(updated));
        return { ok: true };
    } catch (err) {
        console.error("Failed to save renamed chat state:", err);
        return { ok: false, retryAfterMs: 0 };
    }
}

export function deleteChatState(chatId: string): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(storageKey(chatId));
    } catch (err) {
        console.error("Failed to delete chat state:", err);
    }
}

export function getChatRenameStatus(
    chatId: string
): { canRename: true } | { canRename: false; retryAfterMs: number } {
    if (typeof window === "undefined") return { canRename: true };
    const state = loadChatState(chatId);
    if (!state) return { canRename: true };

    const now = Date.now();
    const recentRenames = (state.renameTimestamps ?? (state.lastRenamedAt ? [state.lastRenamedAt] : []))
        .filter((timestamp) => now - timestamp < RENAME_WINDOW_MS)
        .sort((a, b) => a - b);

    if (recentRenames.length >= MAX_RENAMES_PER_WINDOW) {
        const remaining = RENAME_WINDOW_MS - (now - recentRenames[0]);
        return { canRename: false, retryAfterMs: remaining };
    }
    return { canRename: true };
}

export function generateChatId(): string {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Pending drafts — a message typed before onboarding is complete.
 *
 * The landing page never blocks typing or submitting. When onboarding
 * isn't done yet, submitting from the landing page still creates the
 * chat and navigates to it, but the message is stashed here instead of
 * being written into `history` (writing it to history would trigger the
 * chat page's auto-ask-next-question effect, i.e. actually send it).
 * The chat page reads the draft back into its composer — visibly
 * sitting in the input, unsent — until onboarding completes and the
 * user presses send themselves.
 */
function draftKey(chatId: string) {
    return `scoutai:draft:${chatId}`;
}

export function savePendingDraft(chatId: string, text: string): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(draftKey(chatId), text);
    } catch (err) {
        console.error("Failed to save pending draft:", err);
    }
}

export function loadPendingDraft(chatId: string): string | null {
    if (typeof window === "undefined") return null;
    try {
        return localStorage.getItem(draftKey(chatId));
    } catch (err) {
        console.error("Failed to load pending draft:", err);
        return null;
    }
}

export function clearPendingDraft(chatId: string): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(draftKey(chatId));
    } catch (err) {
        console.error("Failed to clear pending draft:", err);
    }
}

export interface ChatSummary {
    id: string;
    title: string;
    lastUpdated: number;
}

export function listAllChats(): ChatSummary[] {
    if (typeof window === "undefined") return [];

    const summaries: ChatSummary[] = [];
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith("scoutai:chat:")) continue;

        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw) as StoredChatState;
            const firstUserMsg = parsed.history?.find((h) => h.role === "user")?.content;
            if (!firstUserMsg || parsed.history.length === 0) {
                keysToRemove.push(key);
                continue;
            }

            const id = key.replace("scoutai:chat:", "");
            summaries.push({
                id,
                title: parsed.title ?? firstUserMsg.slice(0, 40),
                lastUpdated: parsed.lastUpdated ?? 0,
            });
        } catch {
            continue;
        }
    }

    // Clean up empty/invalid chat keys
    for (const key of keysToRemove) {
        localStorage.removeItem(key);
    }

    return summaries.sort((a, b) => b.lastUpdated - a.lastUpdated);
}
