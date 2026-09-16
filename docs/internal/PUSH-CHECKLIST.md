# Horizon — push manifest (say "push" and Claude runs the numbered list)

_Rewritten 2026-07-15 to a **v3 manifest**, reconciled against a read-only
check of the live DB + edge functions. The old 11-step manifest was stale —
it predated the 2026-07-14 push and assumed nothing was applied. Reality:
the backend is already live. The one real pending deploy is the v3 redesign._

## Verified live as of 2026-07-15 (read-only check)
- Tables `goals`, `profiles`, `plans`, `habits` all exist; `goals` has
  `source`, `estimate_min`, `habit_id`, `notes`, `position`. → migrations
  2–4 schema is applied.
- Edge functions ACTIVE: `board` (v6), `discord-bot` (v1), `plan` (v2),
  `send-msg` (v2), `send-sms` (v3).
- Real data present: 6 goals (job-search ladder), 1 profile with a real
  briefing, the 7am planner is seeding assistant tasks. Loop is running.

## Claude's steps at "push" (v3)
1. Run **`migrations-6-pending.sql`** (`profiles.display_name text`, nullable
   — additive, no backfill needed) → advisors check.
2. **Deploy `index.html` (v3 redesign + display-name field)** to Vercel
   project `horizon` — the whole point of this push. Warm editorial redesign
   on the template; full feature parity with the deployed v2 (auth, board,
   habits, onboarding, insights, briefing, drag, copilot dock, theme morph),
   plus a new "What should Horizon call you?" field in Briefing (falls back
   to the email-derived name if left blank — demo-verified round trip).
3. Checksum-verify the deployed HTML byte-for-byte against local
   `index.html`.
4. Smoke-test the live URL: sign in on the real account, confirm the real
   board renders (year/month/week/day ladder + today's assistant tasks),
   toggle a task, switch a tab, open the copilot dock, flip the theme, set
   a display name and confirm the greeting updates.

## Verify-at-push (drift the reconcile flagged, resolve before/at deploy)
- **`board` deployed slug is v6, docs claimed v7.** Confirm whether the
  read-only `{action:"recap"}` branch (Sunday digest) is actually in the
  deployed code; if not, redeploy `edge-board.ts`. Low urgency — only the
  Sunday digest depends on it.
- **pg_cron always-on fallback** (`migrations-5-pending.sql`): confirm
  whether it was applied and whether the `horizon_hook_key` Vault secret
  exists. It no-ops safely without the secret. Not required for the v3 ship.
- **Migration tracker is empty** (schema applied via raw SQL). Cosmetic;
  register future DDL through `apply_migration` so the history is real.

## Your steps (any time)
- **Link Vercel ↔ GitHub** (1 click, high value): Vercel → project `horizon`
  → Settings → Git → connect `kaarizhussain/horizon`. Future deploys become
  `git push`; kills manual MCP transcription and the doc-drift that caused.
- **Discord bot** (~5 min, unlocks /board /done /add /skip): `DISCORD-BOT-SETUP.md`.
- **iPhone Reminders shortcut** (~10 min): `SHORTCUT-SETUP.md`.
- **Webhook hygiene**: regenerate the Discord webhook (old URL touched chat
  logs), update `DISCORD_WEBHOOK_URL`.
- **pg_cron secret** (only if you want the always-on fallback armed):
  Supabase SQL editor, once —
  `select vault.create_secret('<HORIZON_HOOK_KEY>', 'horizon_hook_key');`

## Parked (see ALWAYS-ON.md / ROADMAP.md)
- GitHub Actions + Claude API always-on planning (option B): the M3
  candidate, needs its own explicit go-ahead (recurring, unsupervised, costed).
- Twilio SMS: parked; Discord is primary.
- Third-party import: deprioritized for single-user.
