-- STAGED — run at next push, after migrations-3-pending.sql.
-- Phase 2 of ROADMAP.md: deep-work protection.
-- A weekly target (in hours) the 7am planner defends when composing the day,
-- and flags when the calendar is eating into it. Null = feature off.
alter table public.profiles
  add column if not exists deep_work_target_hours int
  check (deep_work_target_hours is null or deep_work_target_hours between 0 and 80);
