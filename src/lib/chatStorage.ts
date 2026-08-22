import type { SlotState, ConversationTurn, ScoutingPacket, AgentStep } from "@/types";

export interface StoredChatState {
    history: ConversationTurn[];
    slots: SlotState;
    packet: ScoutingPacket | null;
    steps: AgentStep[];
}

function storageKey(chatId: string) {
    return `scoutai:chat:${chatId}`;
}

export function saveChatState(chatId: string, state: StoredChatState) {
    try {
        localStorage.setItem(storageKey(chatId), JSON.stringify(state));
    } catch (err) {
        console.error("Failed to save chat state:", err);
    }
}

export function loadChatState(chatId: string): StoredChatState | null {
    try {
        const raw = localStorage.getItem(storageKey(chatId));
        if (!raw) return null;
        return JSON.parse(raw) as StoredChatState;
    } catch (err) {
        console.error("Failed to load chat state:", err);
        return null;
    }
}

export function generateChatId(): string {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}