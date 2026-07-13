# Horizon — everything staged, waiting on "push"

## Your 2-minute part (do anytime, before or after push)
Create the Discord webhook:
1. In your Discord server (make a private one if needed): right-click a channel → **Edit Channel → Integrations → Webhooks → New Webhook** → name it "Horizon" → **Copy Webhook URL**.
2. Add it as a secret at https://supabase.com/dashboard/project/esithnapkqxwpsfvfwgr/functions/secrets:
   `DISCORD_WEBHOOK_URL` = the copied URL
(Treat the URL like a password — anyone holding it can post to that channel.)

## What happens when you say "push" (Claude does all of this)
1. Deploy `edge-send-msg.ts` as edge function **send-msg** (Discord delivery, hook-key auth).
2. Deploy `edge-plan.ts` as edge function **plan** (stores/serves the structured daily plan for the iPhone Shortcut).
3. Run `migrations-pending.sql` ('week' horizon, notes column, plans table) — then advisors check.
4. Update scheduled task **horizon-daily-itinerary** with `prompt-7am-discord.md` (Discord + calendar-aware + stores plan JSON).
5. Create scheduled task **horizon-evening-checkin** (9pm, `prompt-9pm-checkin.md`).
6. Deploy `index-v2.html` to Vercel — built and functionally verified by the overnight run (visual animation pass still owed; done at push time).
7. Fire one end-to-end Discord test message + verify the plan endpoint round-trip.

## Your iPhone part (after push, ~10 min)
Follow `SHORTCUT-SETUP.md` — a Shortcuts automation at 7:15am pulls the stored
plan and creates Reminders in a "Horizon" list. No Apple credentials involved.

## Explicitly parked
- Twilio SMS: optional second channel; needs your account upgrade + toll-free verification. Auth token you pasted in chat on 7/12 should be rotated regardless.
- Two-way replies (`done 1,3`, `add: ...`): Next phase — needs a Discord bot application (slash commands → edge function), not just a webhook.
- Always-on triggers (pg_cron, no desktop dependency): Later phase.

## Current state (2026-07-13)
- Live: v1 app (horizon-nu-orcin.vercel.app), board + send-sms functions, 7am task (will fail at Twilio send until channel swap — expected).
- Queued: overnight-build task (kept per user) → builds index-v2.html locally (week horizon, notes, drag-reorder, rem sizing, ?demo=1).
- Roadmap decisions: Discord = primary channel; personal-use now, portfolio-piece later; evening check-in 9pm (unconfirmed but defaulted).
