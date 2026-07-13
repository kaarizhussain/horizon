-- STAGED — run on user's "push" (via MCP execute_sql or apply_migration).
-- 1. Allow the new 'week' horizon.
alter table public.goals drop constraint goals_horizon_check;
alter table public.goals add constraint goals_horizon_check
  check (horizon in ('day','week','month','year'));

-- 2. Per-goal notes.
alter table public.goals add column if not exists notes text;

-- 3. Stored daily plans (read by the iPhone Shortcut via the 'plan' edge function).
-- No RLS/grants needed for app roles: only edge functions touch it via service role,
-- but enable RLS anyway as defense in depth (no policies = no anon/authenticated access).
create table if not exists public.plans (
  date date primary key,
  items jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.plans enable row level security;
