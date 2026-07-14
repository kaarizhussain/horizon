-- STAGED — run at next push, after migrations-4-pending.sql.
-- Phase 3 of ROADMAP.md, item 5: pg_cron always-on fallback.
-- Implements ALWAYS-ON.md Option D — a free, zero-desktop-dependency
-- safety net. It does NOT replace the Claude-composed 7am itinerary; it
-- only fires the "dumb but reliable" template version when nothing has
-- been stored in `plans` by mid-morning, which only happens when the
-- desktop app's scheduled task never ran (laptop closed at 7am — the
-- exact failure mode this project has hit twice already, see
-- horizon-goal-app.md memory).
--
-- Checked against the live project (2026-07-14, read-only): pg_cron and
-- pg_net are NOT yet installed; supabase_vault IS already installed. This
-- migration enables the two missing extensions.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. The fallback itself. SECURITY DEFINER is deliberate here (unlike
--    sync_todays_habits/bump_habit_streak, which are SECURITY INVOKER by
--    design) — a cron job has no authenticated session, so this function
--    must be able to read vault.decrypted_secrets and every user's goals
--    directly. It's scoped tightly: read plans/goals, one outbound POST,
--    one plans upsert. No writes to goals, no destructive action.
create or replace function public.horizon_fallback_check_and_send()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  et_now timestamp := now() at time zone 'America/New_York';
  et_today date := et_now::date;
  v_key text;
  v_hour int := extract(hour from et_now)::int;
  v_min int := extract(minute from et_now)::int;
  v_goal record;
  v_lines text[] := '{}';
  v_items jsonb := '[]'::jsonb;
  v_message text;
  v_user_id uuid;
begin
  -- Only act inside a 30-minute morning window (07:15-07:45 ET). The cron
  -- schedule below fires every 15 minutes all day on purpose — gating here
  -- on local time sidesteps pg_cron's UTC-only schedule and DST entirely,
  -- at the cost of a handful of cheap no-op ticks per day.
  if not (v_hour = 7 and v_min between 15 and 45) then
    return;
  end if;

  -- A real plan already exists for today (desktop 7am run succeeded, or
  -- this fallback already sent earlier in the window) — nothing to do.
  if exists (select 1 from public.plans where date = et_today) then
    return;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'horizon_hook_key' limit 1;
  if v_key is null then
    raise notice 'horizon_fallback_check_and_send: horizon_hook_key not set in Vault, skipping';
    return;
  end if;

  select user_id into v_user_id from public.profiles limit 1;
  if v_user_id is null then
    return;
  end if;

  for v_goal in
    select text from public.goals
    where user_id = v_user_id and horizon = 'day' and period = et_today and done = false
    order by position asc
    limit 5
  loop
    v_lines := array_append(v_lines, '- ' || v_goal.text);
    v_items := v_items || jsonb_build_array(jsonb_build_object('time', '', 'title', v_goal.text));
  end loop;

  v_message := '**HORIZON — fallback plan**' || chr(10) ||
    '(Your assistant didn''t check in this morning — desktop app probably wasn''t open. Here''s today''s board, unplanned:)' || chr(10) ||
    case when array_length(v_lines, 1) is null then 'Nothing on today''s board yet.' else array_to_string(v_lines, chr(10)) end;

  perform net.http_post(
    url := 'https://esithnapkqxwpsfvfwgr.supabase.co/functions/v1/send-msg',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Horizon-Key', v_key),
    body := jsonb_build_object('body', v_message)
  );

  -- Mark today as handled (also doubles as the iPhone Shortcut's plan
  -- source for the day) so later ticks in the same window don't re-send.
  insert into public.plans (date, items) values (et_today, v_items)
    on conflict (date) do nothing;
end;
$$;

-- 2. Schedule it. Re-runnable: drops any prior job of the same name first
--    so this migration can be re-applied without a duplicate-job error.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'horizon-fallback-morning') then
    perform cron.unschedule('horizon-fallback-morning');
  end if;
end $$;

select cron.schedule(
  'horizon-fallback-morning',
  '*/15 * * * *',
  $$select public.horizon_fallback_check_and_send();$$
);

-- ---------------------------------------------------------------------
-- Your step at push time (Claude cannot do this — it's a live secret):
--   Supabase Dashboard -> SQL Editor, run once:
--     select vault.create_secret('<the real HORIZON_HOOK_KEY value>', 'horizon_hook_key');
--   Without this, the function no-ops safely every 15 minutes (checked via
--   the "skipping" raise notice in the function above, visible in logs).
-- ---------------------------------------------------------------------
