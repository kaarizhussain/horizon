-- STAGED — run at next push, BEFORE deploying board v6 and the new index.html.
-- Provenance: who put a goal on the board (user vs the morning planner).
alter table public.goals add column if not exists source text not null default 'user'
  check (source in ('user','assistant'));
