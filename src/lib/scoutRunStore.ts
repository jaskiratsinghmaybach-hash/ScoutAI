/**
 * scoutRunStore.ts
 *
 * Durable state for the scout pipeline, backed by Supabase. This is
 * what lets the pipeline survive across multiple short-lived Vercel
 * function invocations instead of one long one — each stage reads its
 * input here, writes its output here, and the client polls (or
 * subscribes to) this row for progress instead of holding one
 * long-lived streaming connection open.
 *
 * Uses the anon key (see supabaseClient.ts) — fine here since rows are
 * keyed by an unguessable uuid and short-lived. Server-side routes
 * import this directly; it does not depend on next/headers or any
 * request-scoped context, so it works the same whether called from a
 * route handler or from a fire-and-forget internal fetch.
 */

import { createClient } from "@supabase/supabase-js";
import type { AgentStep, ScoutingPacket, SceneQuery, Location } from "@/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[scoutRunStore] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — the scout pipeline cannot persist run state without these."
  );
}

// Separate client instance from src/lib/supabaseClient.ts on purpose:
// this one is used from server-side route handlers only, never
// imported into client components, so it's fine for it to have its
// own lifecycle.
const db = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseAnonKey || "placeholder");

export type ScoutRunStatus = "running" | "done" | "error";

export interface ScoutRunRow {
  id: string;
  status: ScoutRunStatus;
  current_step: number;
  steps: AgentStep[];
  query: SceneQuery;
  search_queries: string[] | null;
  search_results: Record<string, string> | null;
  candidate_locations: Location[] | null;
  locations: Location[] | null;
  packet: ScoutingPacket | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export async function createScoutRun(query: SceneQuery): Promise<string> {
  const { data, error } = await db
    .from("scout_runs")
    .insert({ query, status: "running", current_step: 0, steps: [] })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`[scoutRunStore] createScoutRun failed: ${error?.message}`);
  }
  return data.id as string;
}

export async function getScoutRun(runId: string): Promise<ScoutRunRow | null> {
  const { data, error } = await db.from("scout_runs").select("*").eq("id", runId).single();
  if (error) {
    console.error("[scoutRunStore] getScoutRun failed:", error.message);
    return null;
  }
  return data as ScoutRunRow;
}

export async function updateScoutRun(
  runId: string,
  patch: Partial<Omit<ScoutRunRow, "id" | "created_at" | "updated_at">>
): Promise<void> {
  const { error } = await db.from("scout_runs").update(patch).eq("id", runId);
  if (error) {
    throw new Error(`[scoutRunStore] updateScoutRun failed: ${error.message}`);
  }
}

// Appends/replaces a step by step number, matching the same merge
// logic ScoutApp.tsx used to do client-side against SSE "step" events —
// kept server-side now since the client only reads finished rows.
//
// Takes and returns a plain AgentStep[] (not a full row) so a stage
// route can thread the latest array through local variables across
// its running -> done writes for the same step, instead of re-reading
// the row from the DB between them (which would risk stomping a
// concurrent write and adds a needless round trip).
export async function pushStep(runId: string, currentSteps: AgentStep[], step: AgentStep): Promise<AgentStep[]> {
  const existingIndex = currentSteps.findIndex((s) => s.step === step.step);
  const newSteps = [...currentSteps];
  if (existingIndex >= 0) {
    newSteps[existingIndex] = step;
  } else {
    newSteps.push(step);
  }
  await updateScoutRun(runId, { steps: newSteps, current_step: step.step });
  return newSteps;
}

export async function markScoutRunError(runId: string, message: string): Promise<void> {
  await updateScoutRun(runId, { status: "error", error: message });
}
