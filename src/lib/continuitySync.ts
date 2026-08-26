/**
 * continuitySync.ts
 *
 * All Supabase sync logic for the opt-in "Continuity" feature.
 * This module is only ever called when a user is signed in.
 * Signed-out paths never import or execute any of this code.
 */

import { supabase } from "@/lib/supabaseClient";
import {
    listAllChats,
    loadChatState,
    deleteChatState,
    type StoredChatState,
    type ChatSummary,
} from "@/lib/chatStorage";

const STORAGE_PREFIX = "scoutai:chat:";

function localStorageKey(chatId: string) {
    return `${STORAGE_PREFIX}${chatId}`;
}

function writeLocalRaw(chatId: string, state: StoredChatState) {
    try {
        localStorage.setItem(localStorageKey(chatId), JSON.stringify(state));
    } catch (err) {
        console.error("[Continuity] Failed to write to localStorage:", err);
    }
}

/**
 * Upsert a single chat to the Supabase `chats` table.
 */
export async function upsertChat(
    chatId: string,
    state: StoredChatState
): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // guard: should never be called signed-out

    const lastUpdatedIso = state.lastUpdated
        ? new Date(state.lastUpdated).toISOString()
        : new Date().toISOString();

    const { error } = await supabase.from("chats").upsert(
        {
            user_id: user.id,
            chat_id: chatId,
            data: state,
            last_updated: lastUpdatedIso,
        },
        { onConflict: "user_id,chat_id" }
    );

    if (error) {
        throw new Error(`[Continuity] upsertChat failed: ${error.message}`);
    }
}

/**
 * Fetch all chat summaries for a given user from Supabase.
 */
export async function fetchAccountChats(userId: string): Promise<ChatSummary[]> {
    const { data: rows, error } = await supabase
        .from("chats")
        .select("chat_id, data, last_updated")
        .eq("user_id", userId);

    if (error || !rows) {
        console.error("[Continuity] fetchAccountChats failed:", error?.message);
        return [];
    }

    const summaries: ChatSummary[] = [];
    for (const row of rows) {
        const data = row.data as StoredChatState;
        if (!data || !data.history || data.history.length === 0) continue;
        const firstUserMsg = data.history.find((h) => h.role === "user")?.content;
        if (!firstUserMsg) continue;

        const lastUpdated = row.last_updated
            ? new Date(row.last_updated).getTime()
            : data.lastUpdated ?? 0;

        summaries.push({
            id: row.chat_id,
            title: data.title ?? firstUserMsg.slice(0, 40),
            lastUpdated,
        });
    }

    return summaries.sort((a, b) => b.lastUpdated - a.lastUpdated);
}

/**
 * Fetch a specific chat state from Supabase.
 */
export async function fetchAccountChatState(
    userId: string,
    chatId: string
): Promise<StoredChatState | null> {
    const { data, error } = await supabase
        .from("chats")
        .select("data")
        .eq("user_id", userId)
        .eq("chat_id", chatId)
        .maybeSingle();

    if (error || !data) return null;
    return data.data as StoredChatState;
}

/**
 * Delete a single chat from Supabase for a user.
 */
export async function deleteAccountChat(userId: string, chatId: string): Promise<void> {
    const { error } = await supabase
        .from("chats")
        .delete()
        .eq("user_id", userId)
        .eq("chat_id", chatId);

    if (error) {
        console.error("[Continuity] deleteAccountChat failed:", error.message);
    }
}

/**
 * Delete multiple chats from Supabase for a user.
 */
export async function deleteMultipleAccountChats(
    userId: string,
    chatIds: string[]
): Promise<void> {
    if (chatIds.length === 0) return;
    const { error } = await supabase
        .from("chats")
        .delete()
        .eq("user_id", userId)
        .in("chat_id", chatIds);

    if (error) {
        console.error("[Continuity] deleteMultipleAccountChats failed:", error.message);
    }
}

/**
 * Delete multiple chats from localStorage.
 */
export function deleteMultipleLocalChats(chatIds: string[]): void {
    for (const id of chatIds) {
        deleteChatState(id);
    }
}

export type SyncResult = {
    uploaded: number;
    updated: number;
    skipped: number;
    deletionCandidates: { chatId: string; title: string }[];
};

/**
 * Directional Sync: Local -> Account (push)
 */
export async function syncLocalToAccount(userId: string): Promise<SyncResult> {
    const { data: remoteRows, error } = await supabase
        .from("chats")
        .select("chat_id, data, last_updated")
        .eq("user_id", userId);

    if (error) {
        throw new Error(`Failed to fetch account chats: ${error.message}`);
    }

    const remoteMap = new Map<string, { data: StoredChatState; lastUpdatedMs: number }>();
    for (const row of remoteRows ?? []) {
        const lastUpdatedMs = row.last_updated
            ? new Date(row.last_updated).getTime()
            : 0;
        remoteMap.set(row.chat_id, { data: row.data as StoredChatState, lastUpdatedMs });
    }

    const localSummaries = listAllChats();
    const localIds = new Set(localSummaries.map((c) => c.id));

    let uploaded = 0;
    let updated = 0;
    let skipped = 0;

    for (const summary of localSummaries) {
        const local = loadChatState(summary.id);
        if (!local) continue;

        const localTs = local.lastUpdated ?? 0;

        if (remoteMap.has(summary.id)) {
            const remote = remoteMap.get(summary.id)!;
            if (localTs > remote.lastUpdatedMs) {
                await upsertChat(summary.id, local);
                updated++;
            } else {
                skipped++;
            }
        } else {
            await upsertChat(summary.id, local);
            uploaded++;
        }
    }

    const deletionCandidates: { chatId: string; title: string }[] = [];
    for (const [chatId, remote] of remoteMap.entries()) {
        if (!localIds.has(chatId)) {
            const title =
                remote.data.title ??
                remote.data.history?.find((h) => h.role === "user")?.content?.slice(0, 40) ??
                "Untitled chat";
            deletionCandidates.push({ chatId, title });
        }
    }

    return { uploaded, updated, skipped, deletionCandidates };
}

/**
 * Directional Sync: Account -> Local (pull)
 */
export async function syncAccountToLocal(userId: string): Promise<SyncResult> {
    const { data: remoteRows, error } = await supabase
        .from("chats")
        .select("chat_id, data, last_updated")
        .eq("user_id", userId);

    if (error) {
        throw new Error(`Failed to fetch account chats: ${error.message}`);
    }

    const remoteMap = new Map<string, { data: StoredChatState; lastUpdatedMs: number }>();
    for (const row of remoteRows ?? []) {
        const lastUpdatedMs = row.last_updated
            ? new Date(row.last_updated).getTime()
            : 0;
        remoteMap.set(row.chat_id, { data: row.data as StoredChatState, lastUpdatedMs });
    }

    const localSummaries = listAllChats();
    const localMap = new Map<string, number>();
    for (const s of localSummaries) {
        localMap.set(s.id, s.lastUpdated);
    }

    let uploaded = 0; // pulled
    let updated = 0;
    let skipped = 0;

    for (const [chatId, remote] of remoteMap.entries()) {
        if (localMap.has(chatId)) {
            const localTs = localMap.get(chatId)!;
            if (remote.lastUpdatedMs > localTs) {
                writeLocalRaw(chatId, remote.data);
                updated++;
            } else {
                skipped++;
            }
        } else {
            writeLocalRaw(chatId, remote.data);
            uploaded++;
        }
    }

    const deletionCandidates: { chatId: string; title: string }[] = [];
    for (const summary of localSummaries) {
        if (!remoteMap.has(summary.id)) {
            deletionCandidates.push({ chatId: summary.id, title: summary.title });
        }
    }

    return { uploaded, updated, skipped, deletionCandidates };
}
