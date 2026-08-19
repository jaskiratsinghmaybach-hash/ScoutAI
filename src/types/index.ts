export interface SceneQuery {
  description: string;
  mood: string;
  era: string;
  budget: "micro" | "indie" | "mid" | "studio";
  region: string;
  requirements: string[];
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
