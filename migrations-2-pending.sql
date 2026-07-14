-- STAGED — run at next push, BEFORE deploying board v6 and the new index.html.
-- Provenance: who put a goal on the board (user vs the morning planner).
-- 'habit' included alongside 'user'/'assistant' — sync_todays_habits() in
-- migrations-3-pending.sql inserts rows with source='habit'; without it here
-- that insert would fail the check constraint the moment a habit fires.
alter table public.goals add column if not exists source text not null default 'user'
  check (source in ('user','assistant','habit'));
