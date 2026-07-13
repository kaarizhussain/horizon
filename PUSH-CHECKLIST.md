# Horizon — push manifest (say "push" and Claude runs the numbered list)

_Last updated: 2026-07-13, evening build session. Live system is unaffected
until push: 7:05am planner, 9:07pm check-in, Discord delivery all running._

## Claude's steps at "push"
1. Run `migrations-2-pending.sql` (goal provenance: `source` column) → advisors check.
2. Deploy `edge-board.ts` as **board** v6 — generalized `seed` action (any horizon,
   explicit period, marks rows `source='assistant'`); `seed_day` stays as alias.
3. Deploy `index.html` to Vercel — adds: 🧭 goal interview wizard (auto-starts on
   empty board), 📈 Insights panel (30-day stats + weekday chart), ✨ markers on
   assistant-proposed tasks.
4. Deploy `edge-discord-bot.ts` as **discord-bot** (waits inert until the
   Discord app secret exists).
5. Create scheduled task **horizon-weekly-planning** (Sundays 7pm,
   `prompt-sunday-planning.md`) — reviews the week, seeds next week's goals.
6. Create scheduled task **horizon-monthly-planning** (8am on the 1st,
   `prompt-monthly-planning.md`) — decomposes year goals into month milestones.
7. Verify: seed round-trip on a scratch item (then delete), wizard + insights
   live on production URL, checksum match.

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
