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

## Phase 0 — LIVE as of 2026-07-14

Goal interview wizard · Insights panel · goal provenance (✨) · two-way Discord
bot (inert until Discord app secret is set) · Sunday weekly planning ·
monthly decomposition · generalized seed action. Deployed and verified —
see `PUSH-CHECKLIST.md` for the full manifest and end-to-end verification log.

## Phase 1 — close the two biggest competitive gaps — LIVE as of 2026-07-14

1. **Recurring habits as a first-class type** (matches Reclaim Habits /
   TickTick habit tracker). Built: `habits` table (freq: daily/weekdays/
   custom-days, its own `streak`/`best_streak`), `sync_todays_habits()`
   materializes due habits onto Today from whichever surface asks first
   (app, bot, or the 7am planner), a `bump_habit_streak()` trigger keeps
   per-habit streak logic in one place instead of three. In-app 🔁 Habits
   panel to add/pause/delete. Verified in demo mode: add/pause/delete,
   custom day picker, 🔁 marker on habit-sourced tasks.
2. **Time estimate vs. actual** (Sunsama's signature feature). Built:
   `estimate_min` column, inline capture next to notes, ⏱ badge on the task.
   Insights shows actual-vs-estimate ratio once ≥3 same-day samples exist,
   with a plain-English verdict ("you tend to underestimate — plan ~40% more
   time"). Verified in demo mode.

Both fully staged in `migrations-3-pending.sql` + `edge-board.ts` v7 +
`edge-discord-bot.ts` + `index.html` — see `PUSH-CHECKLIST.md`.

## Phase 2 — protection + reporting — LIVE as of 2026-07-14

3. **Deep-work protection** (Motion's Meeting Defender / Reclaim's Focus
   Time). Built: `profiles.deep_work_target_hours` (migrations-4-pending.sql),
   weekly-hours field in the Assistant Briefing panel, board.ts returns it,
   7am prompt reserves a protected block ahead of filler tasks and calls out
   when the week's calendar is crowding the target. Demo-verified.
4. **Sunday digest**. Built: `board` v7 read-only `{action:"recap"}` branch
   (7-day done/total, best weekday, streak — same shape as the app's own
   Insights aggregation), `prompt-sunday-planning.md` opens with the numbers
   before the qualitative wins/slipped review. Code-review verified (no live
   scheduled-prompt run possible without violating the no-live-infra rule).

Both staged in full — see `PUSH-CHECKLIST.md`.

## Phase 3 — always-on + integrations

5. **pg_cron fallback** (`ALWAYS-ON.md` option D) — LIVE 2026-07-14. Free,
   closes the "laptop must be open" gap proven twice already. Still needs
   the Vault secret (your step, see `PUSH-CHECKLIST.md`) to actually arm —
   no-ops safely without it.
6. **Third-party import** (Sunsama connects to 9 tools) — lowest priority for
   personal use, highest value if/when Horizon becomes the portfolio piece:
   start with one (Google Tasks or GitHub issues) as a proof of concept, not
   a platform.
7. GitHub Actions + Claude API for true desktop-independent planning
   (`ALWAYS-ON.md` option B) — user confirmed OK on API billing 2026-07-14,
   but explicitly asked to hold off arming it. A draft script exists
   locally (`scripts/daily-plan.mjs`, untracked, not committed) but the
   workflow file was never written and nothing is wired up. Resume only
   when the user says so — this is a standing unsupervised, costed,
   recurring automation and deserves its own explicit go-ahead, not a
   generic "keep building."

## Explicitly not doing

- **Auto-rewriting the calendar** (Motion) — conflicts with the read-only
  principle above; the restraint is the feature.
- **Points/levels/karma gamification** (Todoist) — the streak already does
  this cleanly; layering a second system is noise.
- **Full multi-tool task aggregation as a v1 goal** — matches Sunsama, but
  it's the kind of scope that turns a personal tool into a maintenance burden
  before the core loop (goals → plan → execute → learn) is even fully proven.

## Sequencing note

Phases 1-3 item 5 are all staged in full now. Nothing is deployed — see
`PUSH-CHECKLIST.md` for the full manifest. Recommended next after your next
"push": Phase 3 item 6 (third-party import) or item 7 (GitHub Actions +
Claude API) — both are genuinely new plumbing rather than extensions of
existing patterns, worth doing with you in the loop rather than overnight.
