# Horizon — Goal Command Center

A personal productivity system where an AI assistant actually runs the loop:
you set goals across four horizons, and every morning a Claude agent reads your
board, plans a realistic day around your routine, and delivers the itinerary to
Discord — with structured data an iPhone Shortcut turns into Reminders.

**Live:** https://horizon-nu-orcin.vercel.app ([demo mode](https://horizon-nu-orcin.vercel.app/?demo=1) — no sign-in needed)

## The loop

```
        you                       the assistant
  ┌──────────────┐        ┌───────────────────────────┐
  │ set goals on │  7:05  │ reads board + briefing +  │
  │ the board    │──am───▶│ calendar → composes plan  │
  └──────▲───────┘        └──────┬──────────┬─────────┘
         │                       ▼          ▼
         │                Discord message   plan JSON
         │                (the narrative)   (→ iPhone Reminders
         │                                    via Shortcuts)
         │  9:07pm  ┌────────────────────┐
         └──────────│ evening check-in:  │
                    │ what got done?     │
                    └────────────────────┘
```

## Features

- **Four horizons** — Today / This Week / This Month / This Year, each with its
  own signature color and progress ring. Unfinished day-tasks roll forward
  automatically.
- **Streak** — advances only when *every* Today task is cleared; lapses
  forgivingly.
- **Assistant briefing** — a free-text panel ("I work 9–5, gym M/W/F, deep work
  mornings") that the morning planner honors strictly.
- **Per-goal notes, drag-to-reorder** (pointer events, velocity-aware settle),
  light/dark themes, reduced-motion and touch support throughout.
- **Design system (v3)** — warm editorial palette (cream/paper ground,
  terracotta accent, sage green), Newsreader serif + Hanken Grotesk body,
  sidebar app shell with a right-side copilot dock; motion audited against
  Emil Kowalski's animation standards and Apple's design principles
  (ease-out tokens, sub-300ms durations, press feedback, reduced-motion and
  touch support throughout).

## Architecture

| Piece | Tech | Notes |
|---|---|---|
| Web app | Single-file static HTML/JS + supabase-js | `index.html`, deployed on Vercel |
| Database | Supabase Postgres | `goals`, `profiles`, `plans` — RLS owner-only |
| Auth | Supabase magic link | passwordless, multi-tenant-ready |
| `board` fn | Deno edge function | snapshot for planners; rolls day-tasks forward |
| `send-msg` fn | Deno edge function | Discord webhook relay, chunked ≤3 messages |
| `plan` fn | Deno edge function | stores/serves structured daily plan JSON |
| Morning planner | Claude Code scheduled task (7:05am) | composes the day; genuinely written, not templated |
| Evening check-in | Claude Code scheduled task (9:07pm) | review + streak nudge |
| iPhone Reminders | Shortcuts automation (7:15am) | pulls `plan`, creates Reminders |

Edge functions authenticate callers via an `X-Horizon-Key` header checked
against the `HORIZON_HOOK_KEY` secret (constant-time compare); Supabase
`verify_jwt` is off for these routes. Calendar is **read-only** input to
planning — the assistant never writes time blocks.

### Secrets (Supabase → Edge Functions → Secrets)

| Key | Purpose |
|---|---|
| `HORIZON_HOOK_KEY` | authorizes the planners + Shortcut |
| `DISCORD_WEBHOOK_URL` | delivery channel |
| `TWILIO_*`, `SMS_TO` | optional SMS channel (parked; US A2P rules) |

## Repo map

- `index.html` — production app (v3, warm editorial redesign)
- `legacy-v1.html` — pre-week-horizon build, kept for reference
- `edge-board.ts` / `edge-plan.ts` / `edge-send-msg.ts` — deployed function sources
- `migrations-pending.sql` — applied 2026-07-13 (week horizon, notes, plans)
- `prompt-7am-discord.md` / `prompt-9pm-checkin.md` — scheduled-task prompts (keys redacted)
- `SHORTCUT-SETUP.md` — iPhone Reminders setup
- `server.js` — tiny local dev server (`node server.js` → :8731)

Built collaboratively with Claude.
