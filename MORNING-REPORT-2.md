# Horizon overnight build 2 — morning report (2026-07-14)

All three build items done, verified, committed, and pushed to GitHub
(`kaarizhussain/horizon`, main: `ea3d999` → `5fbf8fd`, 3 commits, one per
feature). Nothing deployed — no Vercel deploy, no edge function deploy, no
migration applied, no scheduled tasks touched, no messages sent.

## What was built

**1. Deep-work protection** (`a1ba9b6`). A weekly deep-work-hours target
field in the Assistant Briefing panel (small number input under the
textarea, 0–80, blank = off). `profiles.deep_work_target_hours` staged in
`migrations-4-pending.sql`; `board.ts` returns it. `prompt-7am-discord.md`
now: reserves a single protected ≥90min deep-work block ahead of other
generated tasks when a free stretch exists today (STEP 3b-dw), and — if a
calendar tool is available — reads the rest of the week's events to
estimate how many of the target hours are still open, calling it out in
the Discord message only when meetings are meaningfully crowding it
(STEP 2b/4). Judgment call: with no calendar tool the whole thing degrades
silently to a no-op, same as the existing calendar-optional pattern.

**2. Sunday digest** (`127097a`). Rather than a new edge function, added a
read-only `{action:"recap"}` branch to the existing `board` function
(mirrors the `seed`/`seed_day` action-dispatch pattern already there) —
returns 7-day done/total/pct, best weekday, and streak, same aggregation
shape as the app's own Insights panel. `prompt-sunday-planning.md` fetches
it first and opens the weekly review with the numbers before the
qualitative wins/slipped summary. Judgment call: I chose extending `board`
over a new endpoint per your instruction to judge based on simplest/most
consistent — a new edge function would've meant a second secret-handling
path for no real benefit.

**3. pg_cron always-on fallback** (`5fbf8fd`, Phase 3, stretch item since 1
and 2 both landed with runway left). Staged in `migrations-5-pending.sql`:
a `SECURITY DEFINER` function that runs every 15 minutes via `pg_cron`,
only acts inside 07:15–07:45 ET (gated on local time inside the function
so it never needs UTC/DST math in the cron expression itself), and only
fires if `plans` has no row for today — i.e. only when the desktop 7am
task never ran. It reads today's open goals directly, sends an unformatted
list through the existing `send-msg` function, and writes a `plans` row so
it doesn't repeat and the iPhone Shortcut still has something to read.

## What was verified, and how

- **Deep-work field**: `preview_start` on the existing `horizon-v2`
  launch.json entry (untouched, reused as instructed), `index.html?demo=1`
  in the Browser pane. Confirmed the field loads the demo profile's sample
  value (10), `form_input` + click-through the save flow updates it and
  flashes the saved indicator, no console errors. Sanity-checked the
  clamp/parse logic (empty→null, negative→0, >80→80, fractional→rounded)
  against the exact function used in the page. Did not fire a real 7am run
  (can't, and wasn't asked to) — verified the prompt logic by careful
  re-reading against the existing calendar-optional pattern it extends.
- **Sunday digest**: code review only (no way to demo-verify a scheduled
  prompt or a server-side SQL aggregation without a live run). Traced the
  `recap` branch's query shape against the app's `loadInsights`/
  `renderInsights` to confirm matching semantics (created_at-windowed,
  done_at for weekday bucketing).
- **pg_cron fallback**: `deno` isn't installed in this environment (per
  your instructions, skipped rather than assumed), so this is careful code
  review only, cross-checked against the **live** project via read-only
  Supabase MCP calls (`list_extensions`, `list_tables`, `list_migrations`)
  before writing the migration — confirmed `pg_cron`/`pg_net` aren't
  installed yet, `supabase_vault` already is, and the `plans` table shape
  matches what `edge-plan.ts` expects. No writes of any kind to the live
  project.

## Judgment calls worth your review

- Deep-work default assumption when `profile.context` doesn't state work
  hours: 9am–6pm weekdays only. Adjust the prompt if that's wrong for you.
- The "crowding" callout threshold is `<70% of target hours open` — a
  guess at what's actually worth surfacing vs. noise. Easy to tune once
  you see it in practice.
- pg_cron fallback message is deliberately plain/unstyled ("didn't check
  in this morning...") so it reads as visibly different from the real
  Claude-composed itinerary — didn't try to make it sound smart.

## Observation, not a fix

While checking the live DB for the recap/pg_cron work, `public.profiles`
currently has **2 rows**, not 1. Every profile query in this codebase
(app, `board.ts`, `edge-plan.ts`, and now my new `recap`/fallback code)
uses `.limit(1)` with no ordering — pre-existing pattern, not something
this session introduced, but worth a look before it picks the wrong row
someday. Full note in `PUSH-CHECKLIST.md`.

## Deploy steps waiting on your "push"

See the updated `PUSH-CHECKLIST.md` (11 steps now, was 8) — it also has
the one new manual step this session added: creating the `horizon_hook_key`
Vault secret, required before the pg_cron fallback does anything but
silently no-op.
