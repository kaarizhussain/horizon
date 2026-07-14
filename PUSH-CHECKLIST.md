# Horizon — push manifest (say "push" and Claude runs the numbered list)

_Last updated: 2026-07-13, night build session (recurring habits + estimates).
Live system is unaffected until push: 7:05am planner, 9:07pm check-in,
Discord delivery all running._

## Claude's steps at "push"
1. Run `migrations-2-pending.sql` (goal provenance: `source` column) → advisors check.
2. Run `migrations-3-pending.sql` (habits table, `goals.habit_id` +
   `estimate_min`, `sync_todays_habits()` fn, `bump_habit_streak()` trigger) →
   advisors check.
3. Deploy `edge-board.ts` as **board** v7 — generalized `seed` action (any
   horizon, explicit period, marks rows `source='assistant'`); `seed_day`
   stays as alias; snapshot now materializes today's due habits first and
   returns `source`/`estimate_min` per item.
4. Deploy `index.html` to Vercel — adds: 🧭 goal interview wizard, 📈 Insights
   (30-day stats + weekday chart + estimate-accuracy stat once ≥3 samples),
   ✨/🔁 provenance markers, 🔁 Habits panel (add/pause/delete, its own
   streak per habit), ⏱ estimate capture inline with notes.
5. Deploy `edge-discord-bot.ts` as **discord-bot** (waits inert until the
   Discord app secret exists) — also syncs today's habits before /board,
   /done, /add, /skip.
6. Create scheduled task **horizon-weekly-planning** (Sundays 7pm,
   `prompt-sunday-planning.md`) — reviews the week, seeds next week's goals.
7. Create scheduled task **horizon-monthly-planning** (8am on the 1st,
   `prompt-monthly-planning.md`) — decomposes year goals into month milestones.
8. Verify: seed round-trip on a scratch item (then delete), habit round-trip
   (add → confirm it appears in board snapshot → delete), wizard + insights +
   habits panel live on production URL, checksum match.

## Your steps (any time)
- **Discord bot** (~5 min, unlocks /board /done /add /skip): `DISCORD-BOT-SETUP.md`
- **iPhone Reminders shortcut** (~10 min): `SHORTCUT-SETUP.md`
- **Link Vercel ↔ GitHub** (1 click): Vercel → project horizon → Settings → Git →
  connect `kaarizhussain/horizon` — future deploys become `git push`
- **Webhook hygiene**: regenerate the Discord webhook (old URL touched chat logs),
  update `DISCORD_WEBHOOK_URL` secret

## Decisions parked (see ALWAYS-ON.md)
- Always-on mornings: recommend pg_cron fallback (option D, free) in a near-term
  push; GitHub Actions + Claude API (option B) when you're ready for API billing.
- Twilio SMS: parked until account upgrade; Discord is primary.
