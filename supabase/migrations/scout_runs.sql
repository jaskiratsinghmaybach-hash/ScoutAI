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

-- Rows are short-lived (a run finishes in well under a minute of total
-- pipeline time) and keyed by an unguessable uuid, so this stays open
-- for read/write via the anon key without per-user auth — same trust
-- model as an ephemeral job id. Tighten this if you want per-user
-- ownership later (e.g. add user_id + RLS matching auth.uid()).
alter table public.scout_runs enable row level security;

create policy "anyone can read/write scout_runs by id"
  on public.scout_runs
  for all
  using (true)
  with check (true);

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
