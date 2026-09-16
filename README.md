# Horizon — an AI daily operations manager

Most task apps are a place you write things down. Horizon is the layer above
that: it takes your goals, your standing constraints ("I work 9–5, gym M/W/F,
deep work mornings"), and your calendar, and turns them into a specific plan
for today — then delivers that plan into the tools you'll actually look at.

**Live:** https://horizon-nu-orcin.vercel.app ([demo mode](https://horizon-nu-orcin.vercel.app/?demo=1) — no sign-in needed)

## The core loop

```
Goals + routine/context  →  AI plan  →  structured tasks  →  you execute  →  review
```

Concretely: you set goals across four horizons (today/week/month/year) and
write a standing briefing once. Each morning an AI planner reads that board,
checks your calendar, and composes a realistic day — front-loading deep work,
generating concrete next actions when you're under-scheduled, honoring your
briefing strictly. The plan ships two ways: a Discord message you'll actually
read, and structured JSON an iPhone Shortcut turns into real Reminders. In
the evening, a second pass reviews what got done. You can also ask the
in-app copilot anything about your own board — it answers from your real
data, not a script.

That's the whole product. Everything else exists to support that loop or to
demonstrate it working.

**Product vs. implementation vs. lesson** — worth keeping separate:
- **Product:** an AI daily operations manager. Goals + constraints + calendar in, an actionable plan out.
- **Implementation detail:** Claude scheduled tasks, Supabase, Discord/Shortcuts for delivery. This layer is swappable — it's not the promise, it's one way to keep it.
- **Lesson:** external automation needs monitoring and a *verified* fallback, not just one that exists on paper. See below.

## Why this is interesting as a case study

**The planner is a real scheduler, not a template.** It reserves protected
deep-work blocks around your actual calendar, estimates how much open
deep-work time is left in the week, and only generates filler tasks when
you're genuinely under-scheduled — derived from your week/month/year goals,
in that priority order.

**The copilot is scoped to your real data, with no service-role key
involved.** It's the one function called directly from the browser, so it
authenticates the caller's own Supabase session and runs every query through
a client scoped to that JWT — Postgres row-level security does the
authorization, not application code. Ask it something the data can't answer
and it says so instead of guessing.

**It has already taught me something by failing.** Horizon's morning/evening
planning ran as an external scheduled Claude Code task — separate
infrastructure from the web app, with a pg_cron fallback in the database
specifically built to catch the scheduler going down. Both the primary and
the fallback went silent at the same time. As of this writing they're **still
paused, deliberately** — restarting them was cheap, but doing that before
deciding whether this layer belongs in the finished product would just be
sinking more effort into the exact infrastructure that's in question. Not
hidden here — see `docs/internal/ALWAYS-ON.md` for how the fallback was
designed to work and where the monitoring gap actually was.

## Architecture

| Piece | Tech | Notes |
|---|---|---|
| Web app | Single-file static HTML/JS + supabase-js | `index.html`, deployed on Vercel |
| Database | Supabase Postgres | `goals`, `profiles`, `habits`, `plans` — RLS owner-only |
| Auth | Supabase magic link | passwordless, multi-tenant-ready |
| `board` fn | Deno edge function | snapshot for planners; rolls day-tasks forward |
| `plan` fn | Deno edge function | stores/serves structured daily plan JSON |
| `send-msg` fn | Deno edge function | Discord webhook relay, chunked ≤3 messages |
| `copilot` fn | Deno edge function | real AI (Claude Haiku), scoped to the caller's own data via RLS |
| Morning planner | scheduled Claude Code task (7:05am) | reads board + calendar, composes and delivers the day — **currently paused, see below** |
| Evening check-in | scheduled Claude Code task (9:07pm) | review + streak nudge — **currently paused, see below** |
| iPhone Reminders | Shortcuts automation (7:15am) | pulls `plan`, creates Reminders |

Server-to-server edge functions (`board`/`plan`/`send-msg`) authenticate via
an `X-Horizon-Key` header checked against a secret with a constant-time
compare. The browser-facing `copilot` function instead authenticates the
caller's own Supabase session JWT and never touches a service-role key.
Calendar is **read-only** input to planning — the assistant never writes
time blocks.

## Also in the app (real, daily-use, just not the headline)

Habit tracking, a streak that only advances when every task clears, an
insights panel, weekly/monthly planning prompts, and a design pass audited
against Emil Kowalski's and Apple's animation/motion standards. All live,
all used — kept out of the main pitch because they're elaborations on the
loop above, not the loop itself.

A two-way Discord bot (`edge-discord-bot.ts`) was also built — `/board`,
`/done`, `/add`, `/skip` — but was never armed (no `DISCORD_PUBLIC_KEY` set)
and has never run. Kept as source, not claimed as a feature.

## Repo map

- `index.html` — the app
- `edge-board.ts` / `edge-plan.ts` / `edge-send-msg.ts` / `edge-copilot.ts` — deployed function sources
- `edge-discord-bot.ts` — built, never activated (see above)
- `prompt-7am-discord.md` / `prompt-9pm-checkin.md` — the two scheduled-task prompts that run the loop
- `prompt-sunday-planning.md` / `prompt-monthly-planning.md` — secondary planning cadences
- `SHORTCUT-SETUP.md` / `DISCORD-BOT-SETUP.md` — setup docs
- `migrations-*.sql` — applied database migrations
- `server.js` — tiny local dev server (`node server.js` → :8731)
- `docs/internal/` — build history and internal planning notes, kept for reference

Built collaboratively with Claude.
