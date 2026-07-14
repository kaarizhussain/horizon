# Horizon — push manifest (say "push" and Claude runs the numbered list)

_Last updated: 2026-07-14, overnight session 2 (deep-work protection + Sunday
digest + pg_cron fallback, all staged, none live). Live system is unaffected
until push: 7:05am planner, 9:07pm check-in, Discord delivery all running.
Confirmed against the live DB (read-only check, 2026-07-14): only the
original week/notes/plans migration has actually been applied — everything
below (source, habits, estimates, deep-work target, recap, pg_cron) is
genuinely still local-only, matching what this checklist already implied._

## Claude's steps at "push"
1. Run `migrations-2-pending.sql` (goal provenance: `source` column) → advisors check.
2. Run `migrations-3-pending.sql` (habits table, `goals.habit_id` +
   `estimate_min`, `sync_todays_habits()` fn, `bump_habit_streak()` trigger) →
   advisors check.
3. Run `migrations-4-pending.sql` (`profiles.deep_work_target_hours`) → advisors check.
4. Deploy `edge-board.ts` (cumulative v4-v7) — generalized `seed` action (any
   horizon, explicit period, marks rows `source='assistant'`); `seed_day`
   stays as alias; snapshot now materializes today's due habits first and
   returns `source`/`estimate_min`/`deep_work_target_hours`; new read-only
   `{action:"recap"}` branch (7-day done/total, best weekday, streak) for
   the Sunday digest.
5. Deploy `index.html` to Vercel — adds: 🧭 goal interview wizard, 📈 Insights
   (30-day stats + weekday chart + estimate-accuracy stat once ≥3 samples),
   ✨/🔁 provenance markers, 🔁 Habits panel (add/pause/delete, its own
   streak per habit), ⏱ estimate capture inline with notes, weekly
   deep-work-hours target field in the Assistant Briefing panel.
6. Deploy `edge-discord-bot.ts` as **discord-bot** (waits inert until the
   Discord app secret exists) — also syncs today's habits before /board,
   /done, /add, /skip.
7. Update scheduled task **horizon-daily-itinerary** with the new
   `prompt-7am-discord.md` — reserves a protected deep-work block when
   `deep_work_target_hours` is set, calls out calendar crowding for the week.
8. Create scheduled task **horizon-weekly-planning** (Sundays 7pm,
   `prompt-sunday-planning.md`) — opens with the numbers-first recap, then
   reviews the week, seeds next week's goals.
9. Create scheduled task **horizon-monthly-planning** (8am on the 1st,
   `prompt-monthly-planning.md`) — decomposes year goals into month milestones.
10. (Optional, can wait for its own push) Run `migrations-5-pending.sql` —
    pg_cron always-on fallback. Needs the Vault secret step below FIRST or
    it just no-ops silently; safe to apply anytime after that.
11. Verify: seed round-trip on a scratch item (then delete), habit round-trip
    (add → confirm it appears in board snapshot → delete), wizard + insights +
    habits panel + deep-work field live on production URL, checksum match.

## Your steps (any time)
- **Discord bot** (~5 min, unlocks /board /done /add /skip): `DISCORD-BOT-SETUP.md`
- **iPhone Reminders shortcut** (~10 min): `SHORTCUT-SETUP.md`
- **Link Vercel ↔ GitHub** (1 click): Vercel → project horizon → Settings → Git →
  connect `kaarizhussain/horizon` — future deploys become `git push`
- **Webhook hygiene**: regenerate the Discord webhook (old URL touched chat logs),
  update `DISCORD_WEBHOOK_URL` secret
- **pg_cron fallback secret** (needed before step 10 above does anything):
  Supabase SQL editor, run once —
  `select vault.create_secret('<the real HORIZON_HOOK_KEY value>', 'horizon_hook_key');`

## Decisions parked (see ALWAYS-ON.md)
- Always-on mornings: pg_cron fallback (option D) is now staged in full,
  see step 10 above; GitHub Actions + Claude API (option B) when you're
  ready for API billing.
- Twilio SMS: parked until account upgrade; Discord is primary.
- Noticed while checking the live DB for this session: `profiles` currently
  has 2 rows, not 1 — worth a look before relying on any `limit 1` profile
  query (several already exist in board.ts/edge-plan.ts/the app itself; this
  session didn't introduce that pattern, just inherited it).
