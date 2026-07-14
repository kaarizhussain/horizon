-- STAGED — run at next push, after migrations-2-pending.sql.
-- Phase 1 of ROADMAP.md: recurring habits + time estimate vs. actual.

-- 1. Habits: the recurring template. A habit generates one 'day' goal per due
--    date (via sync_todays_habits below), tracked separately from the
--    all-or-nothing daily streak so missing one habit doesn't zero the others.
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  freq text not null default 'daily' check (freq in ('daily','weekdays','custom')),
  days int[] not null default '{}',   -- 0=Sun..6=Sat, only read when freq='custom'
  active boolean not null default true,
  streak int not null default 0,
  best_streak int not null default 0,
  last_complete date,
  created_at timestamptz not null default now()
);
alter table public.habits enable row level security;
create policy "habits select own" on public.habits for select to authenticated using ((select auth.uid()) = user_id);
create policy "habits insert own" on public.habits for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "habits update own" on public.habits for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habits delete own" on public.habits for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.habits to authenticated;

-- 2. Link a goal back to the habit that generated it, and let a goal carry an
--    optional time estimate (Phase 1 item 2 — feeds Insights' accuracy stat).
alter table public.goals add column if not exists habit_id uuid references public.habits(id) on delete set null;
alter table public.goals add column if not exists estimate_min int check (estimate_min is null or estimate_min between 1 and 600);
create index if not exists goals_habit_lookup on public.goals (habit_id) where habit_id is not null;

-- 3. Materialize today's due habits as day-goals. SECURITY INVOKER (default):
--    called by the web app with no p_user_id -> runs as the authenticated
--    user, RLS-enforced. Called by edge functions (service role) with an
--    explicit p_user_id -> service role already bypasses RLS, same trust
--    boundary as the existing `seed` action in board.ts.
create or replace function public.sync_todays_habits(p_today date, p_user_id uuid default null)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := coalesce(p_user_id, auth.uid());
  h record;
  dow int := extract(dow from p_today)::int; -- 0=Sun..6=Sat
  n int := 0;
begin
  if uid is null then
    return 0;
  end if;
  for h in
    select * from public.habits
    where user_id = uid and active = true
      and (
        freq = 'daily'
        or (freq = 'weekdays' and dow between 1 and 5)
        or (freq = 'custom' and dow = any(days))
      )
  loop
    if not exists (select 1 from public.goals where habit_id = h.id and period = p_today) then
      insert into public.goals (user_id, horizon, period, text, source, habit_id, position)
      values (uid, 'day', p_today, h.text, 'habit', h.id, 0);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
grant execute on function public.sync_todays_habits(date, uuid) to authenticated, service_role;

-- 4. Bump the habit's own streak when its linked goal is completed. Centralized
--    here so the web app, the Discord bot, and the 7am planner all get correct
--    per-habit streaks without reimplementing the date-gap logic three times.
--    Mirrors the app's forgiving daily-streak behavior: unchecking does not
--    decrement (avoids streak-gaming edge cases), only forward progress bumps it.
create or replace function public.bump_habit_streak()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  h public.habits%rowtype;
  gap int;
  new_streak int;
begin
  if new.habit_id is not null and new.done = true and coalesce(old.done, false) = false then
    select * into h from public.habits where id = new.habit_id;
    if h.id is null then
      return new;
    end if;
    gap := case when h.last_complete is null then null else new.period - h.last_complete end;
    new_streak := case when gap = 1 then h.streak + 1 else 1 end;
    update public.habits
      set streak = new_streak,
          best_streak = greatest(h.best_streak, new_streak),
          last_complete = new.period
      where id = h.id;
  end if;
  return new;
end;
$$;

drop trigger if exists goals_bump_habit_streak on public.goals;
create trigger goals_bump_habit_streak
  after update of done on public.goals
  for each row execute function public.bump_habit_streak();
