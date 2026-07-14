# Horizon — Roadmap

_Living doc. Updated 2026-07-13 after a competitive pass on Motion, Sunsama,
Reclaim.ai, TickTick/Todoist, Strides, and Rocky.ai/Fostera. See PR/commit
history for the research writeup. Working mode: build + plan locally in
batches, deploy only on explicit "push realized as `git push` once linked)."_

## Where Horizon already stands vs. the market

No competitor combines all of these — this is the actual differentiator, not
a feature checklist:

- **Multi-horizon goal ladder** (day/week/month/year) that the planner
  connects, not four disconnected lists.
- **Two-way chat control** (Discord bot, staged) — nobody in the AI-scheduler
  category (Motion, Reclaim, Sunsama) ships this; they're all open-the-app tools.
- **Persistent briefing as memory** — solves the exact failure mode Fostera's
  research calls out ("most AI coaches don't remember what you committed to").
- **Read-only calendar by design** — Motion/Reclaim auto-rewrite your calendar;
  Horizon deliberately doesn't. Keep this as a stated principle, not a gap to close.

## Phase 0 — current push (already staged, unchanged)

Goal interview wizard · Insights panel · goal provenance (✨) · two-way Discord
bot · Sunday weekly planning · monthly decomposition · generalized seed action.
Full list: `PUSH-CHECKLIST.md`. Ships as soon as you say the word.

## Phase 1 — close the two biggest competitive gaps

1. **Recurring habits as a first-class type** (matches Reclaim Habits /
   TickTick habit tracker — the most-repeated feature across every competitor
   researched). A goal gets `recurring: {freq, days}`; the planner stops
   regenerating "workout" from scratch each morning and instead tracks a
   per-habit streak alongside the daily streak. Natural extension of the
   `source` provenance column already staged.
2. **Time estimate vs. actual** (Sunsama's signature feature). Optional
   estimate on a task; `done_at - created_at`-adjacent actual captured
   automatically. Feeds Insights: "you estimate 30 min, it's usually 90" —
   turns the panel predictive instead of descriptive, and lets the planner
   stop overpacking days.

## Phase 2 — protection + reporting

3. **Deep-work protection** (Motion's Meeting Defender / Reclaim's Focus
   Time) — set a weekly deep-work-hours target in the briefing; the planner
   defends that time in the itinerary and calls out when the calendar is
   eating it. Reuses the existing read-only calendar check — no new plumbing.
4. **Sunday digest** — pair the already-staged weekly planning message with a
   numbers-first recap (done vs. planned, best day, streak) ahead of the
   "next week" proposal. Reuses the Insights query.

## Phase 3 — always-on + integrations

5. **pg_cron fallback** (`ALWAYS-ON.md` option D) — free, closes the
   "laptop must be open" gap proven twice already.
6. **Third-party import** (Sunsama connects to 9 tools) — lowest priority for
   personal use, highest value if/when Horizon becomes the portfolio piece:
   start with one (Google Tasks or GitHub issues) as a proof of concept, not
   a platform.
7. GitHub Actions + Claude API for true desktop-independent planning
   (`ALWAYS-ON.md` option B) — when ready for API billing.

## Explicitly not doing

- **Auto-rewriting the calendar** (Motion) — conflicts with the read-only
  principle above; the restraint is the feature.
- **Points/levels/karma gamification** (Todoist) — the streak already does
  this cleanly; layering a second system is noise.
- **Full multi-tool task aggregation as a v1 goal** — matches Sunsama, but
  it's the kind of scope that turns a personal tool into a maintenance burden
  before the core loop (goals → plan → execute → learn) is even fully proven.

## Sequencing note

Phase 1 item 1 (recurring habits) is the recommended next build after the
current push ships — it's the highest-frequency competitor feature, lowest
new-infrastructure cost, and most directly reduces the manual-input problem
that started this whole project.
