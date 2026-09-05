export interface ScoutRun {
  id: string;
  serverRunId?: string;
  steps: AgentStep[];
  packet: ScoutingPacket | null;
  triggerMessageIndex: number;
  triggerMessageContent: string; // safety net: exact text of the triggering message
  // "search" = a fresh scout dispatch (normal scene description).
  // "refine" = triggered by "find more like this" from a referenced
  // card in chat — same pipeline, but the agent-activity UI shows a
  // distinct set of step labels so it doesn't misleadingly look like
  // a brand-new, from-scratch search. See AgentTrace.tsx/
  // AgentActivityMiniPill.tsx. Defaults to "search" for older runs
  // that predate this field (optional, not required).
  runKind?: "search" | "refine";
  status?: "running" | "done" | "error";
  error?: string | null;
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

export interface Location {
  id: string;
  name: string;
  city: string;
  country: string;
  score: number; // 0-100 match score
  mood_match: string;
  era_match: string;
  // Numeric 0-100 fit scores the agent assigns explicitly (separate from
  // the mood_match/era_match prose explanations above). null when the
  // agent didn't return a valid number for this location, so the UI can
  // show an honest empty state instead of a fabricated percentage.
  mood_fit_percent: number | null;
  era_fit_percent: number | null;
  permit_info: string;
  permit_url?: string;
  avg_daily_cost: string;
  past_productions: string[];
  weather_notes: string;
  logistics_notes: string;
  search_sources: string[];
  image_query: string; // no longer displayed (Imagery tab removed) — kept so Gemini's existing output schema doesn't need a parallel schema change
  scene_description: string; // environment/setting description — what the place looks and feels like to shoot in, shown on the Scene tab
}

export interface ScoutingPacket {
  query: SceneQuery;
  locations: Location[];
  agent_reasoning: string;
  generated_at: string;
  // Set only when locations.length ends up below what Gemini originally
  // proposed because one or more candidates couldn't be confirmed as
  // real, findable places during verification (see agent.ts's
  // filterToRealLocations). Shown in the UI in place of a silently-
  // smaller result, so the shortfall reads as an honest constraint.
  narrowing_note?: string;
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

// Response shape for POST /api/card-chat — see route.ts. One Gemini
// call classifies intent AND, when the intent is "answer", produces
// the answer itself in the same pass (kept as one call rather than
// classify-then-answer as two, to keep latency down for what's meant
// to be a fast, conversational follow-up).
export interface CardChatResponse {
  intent: "similar" | "answer";
  answer?: string; // only present when intent === "answer"
  refinement_context?: string; // only present when intent === "similar" — a ready-to-use priorContext string for dispatchScout
}