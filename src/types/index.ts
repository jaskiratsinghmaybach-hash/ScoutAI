export interface ScoutRun {
  id: string;
  steps: AgentStep[];
  packet: ScoutingPacket | null;
  triggerMessageIndex: number;
  triggerMessageContent: string; // safety net: exact text of the triggering message
}

export interface SceneQuery {
  description: string;
  mood: string;
  era: string;
  budget: "micro" | "indie" | "mid" | "studio";
  region: string;
  requirements: string[];
  priorContext?: string; // summary of previous results + follow-up request
}

export interface LocationImage {
  url: string; // direct hotlinked image URL from Wikimedia Commons
  title: string; // Commons file title, e.g. "File:Golden Temple.jpg"
  author?: string; // best-effort plain-text author/photographer credit
  license?: string; // best-effort short license string, e.g. "CC BY-SA 4.0"
  filePageUrl: string; // link to the Commons file description page
}

export interface Location {
  id: string;
  name: string;
  city: string;
  country: string;
  score: number; // 0-100 match score
  mood_match: string;
  era_match: string;
  permit_info: string;
  permit_url?: string;
  avg_daily_cost: string;
  past_productions: string[];
  weather_notes: string;
  logistics_notes: string;
  search_sources: string[];
  image_query: string; // used to display a representative image
  images?: LocationImage[]; // only populated for the #1-ranked location by the pipeline; every other location fetches its own via /api/images client-side — see ImageryTab.tsx
}

export interface ScoutingPacket {
  query: SceneQuery;
  locations: Location[];
  agent_reasoning: string;
  generated_at: string;
}

export interface AgentStep {
  step: number;
  action: string;
  detail: string;
  status: "pending" | "running" | "done" | "error";
}
export interface SlotState {
  description: string;
  mood: string;
  era: string;
  budget: string;
  region: string;
  duration: string;
  requirements: string;
}

export interface ClarifyQuestion {
  text: string;
  type: "text" | "choice";
  options?: string[];
  slot: keyof SlotState;
}

export type ClarifyMessageType =
  | "greeting"
  | "small_talk"
  | "vague"
  | "off_topic"
  | "scene_brief"
  | "clarifying_answer";

export interface ClarifyResponse {
  message_type?: ClarifyMessageType;
  chat_reply?: string;
  next_question: ClarifyQuestion | null;
  updated_slots: Partial<SlotState>;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}