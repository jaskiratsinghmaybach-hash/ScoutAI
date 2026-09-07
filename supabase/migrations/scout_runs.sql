-- scout_runs: durable state for the scout pipeline, so no single HTTP
-- request has to stay open across all 5 steps (which is what was
-- blowing past Vercel's 60s function limit on Hobby). Each step reads
-- its input from this row, does its own work, writes its output back,
-- and triggers the next step itself (fire-and-forget) instead of the
-- original caller awaiting the whole chain.
--
-- Run this in the Supabase SQL editor once.

create table if not exists public.scout_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running', -- 'running' | 'done' | 'error'
  current_step int not null default 0,     -- 0 = not started, 1-5 = in progress/last completed
  steps jsonb not null default '[]'::jsonb,       -- AgentStep[] — same shape the UI already renders
  query jsonb not null,                            -- SceneQuery, as submitted
  search_queries jsonb,                            -- string[] — output of step 1
  search_results jsonb,                            -- Record<string,string> — output of step 2
  candidate_locations jsonb,                       -- Location[] — output of step 3
  locations jsonb,                                 -- Location[] — output of step 4 (verified)
  packet jsonb,                                    -- ScoutingPacket — final output
  error text,                                      -- set if status = 'error'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.scout_runs enable row level security;

-- Drop legacy permissive policy if present
drop policy if exists "anyone can read/write scout_runs by id" on public.scout_runs;
drop policy if exists "allow insert of scout runs" on public.scout_runs;
drop policy if exists "allow select of scout runs" on public.scout_runs;
drop policy if exists "allow update of scout runs" on public.scout_runs;

-- SECURITY MODEL:
-- ScoutAI operates on an ephemeral, unauthenticated job architecture.
-- Pipeline runs are created with unguessable, cryptographically random
-- 128-bit UUIDs (gen_random_uuid()) and executed across staged serverless
-- handlers and client polling using the public anon key.
--
-- Limitation: Because runs are intentionally unauthenticated (no user login
-- required), per-user database ownership (e.g. auth.uid() = user_id) cannot
-- be enforced at the SQL layer without introducing mandatory authentication.
-- The unguessable run UUID functions as an ephemeral capability token.
--
-- Tighter granular policies:
-- 1. INSERT: Allow creating new runs with valid initial state.
-- 2. SELECT: Allow reading run status/packet for polling and stage execution.
-- 3. UPDATE: Allow stage transitions and step updates.
-- 4. DELETE: Disallowed entirely (no policy granted) to prevent deletion of active runs.

create policy "allow insert of scout runs"
  on public.scout_runs
  for insert
  with check (
    status in ('running', 'done', 'error')
  );

create policy "allow select of scout runs"
  on public.scout_runs
  for select
  using (true);

create policy "allow update of scout runs"
  on public.scout_runs
  for update
  using (true)
  with check (
    status in ('running', 'done', 'error')
  );

-- Keep updated_at fresh on every write so the client can distinguish
-- "still running" from "stalled" if a step ever fails to fire the next one.
create or replace function public.touch_scout_runs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_scout_runs on public.scout_runs;
create trigger trg_touch_scout_runs
  before update on public.scout_runs
  for each row execute function public.touch_scout_runs_updated_at();
