# Horizon — a visual daily planner

Horizon helps turn a task list into a realistic day: capture a thought, add it to Today or Tomorrow, estimate the work, preview a schedule, and adjust what remains.

**Try it:** [demo](https://horizon-nu-orcin.vercel.app/?demo=1). The production link may show the previous workspace until this PR is merged and deployed. PR previews may require Vercel access.

## The current workspace

- **Today and Tomorrow:** task titles, notes, estimates, completion, and moves between days.
- **Inbox:** capture unscheduled thoughts and promote them into a day.
- **Manual planning:** preview blocks in list order within a chosen start/finish window and buffer. Tasks without estimates remain unscheduled; work that does not fit is shown explicitly.
- **Replanning:** retain completed blocks and place remaining work after the current time.
- **Focus:** explicitly start, pause, and save recorded time. Insights compares saved focus time with estimates; it does not infer productivity from an open tab.
- **Goals, Habits, and Routine:** supporting views retained from the earlier product.

The timeline is Horizon's own task schedule. It is not a connected calendar.

## What persists

| Data | Storage | Limits |
|---|---|---|
| Dated tasks and goals | Supabase for existing signed-in accounts | Browser-to-database acceptance testing is still pending |
| Inbox drafts, accepted schedules, focus records | This browser, scoped to account | No cross-device sync; clearing browser data removes them |
| Demo changes | Memory | Sample data resets on reload |

Public account creation is disabled. Visitors use the demo. Existing accounts use email/password sign-in. The new email-link/code flow is deferred until delivery, redirect, and session recovery have been verified.

## Product decisions worth showing

**Preview before committing.** Scheduling is explicit and reversible. Estimates and available time determine what fits, and omitted work remains visible.

**Keep Today and Tomorrow separate.** Moving a task saves its edits and destination together. Account-switch guards prevent late responses from overwriting another account's workspace.

**Measure only recorded work.** Focus time is saved deliberately, and browser-local records are distinguished from account-synced tasks.

**Reduce the promise to what can be verified.** Earlier AI scheduling and delivery infrastructure remains source material, not a claim that the redesigned workspace automatically plans or delivers your day.

## Validation and release status

Run the dependency-free checks:

```sh
node --test tests/*.test.mjs
node server.js
```

The server listens on port 8731. Open `/?demo=1` for sample data.

The 21 Node tests cover scheduling boundaries, missing estimates, plan invalidation, browser storage, focus accounting, date rollover, and mocked account-switch behavior. A rollback-only database check also passed authenticated task creation/edit/move/completion/readback and cross-owner isolation. These checks do not establish successful real browser sign-in, email delivery, or cross-device persistence.

See [release verification](docs/release-verification.md) for completed checks and the remaining acceptance gate.

## Earlier automation and lessons

Horizon originally used scheduled Claude tasks plus Supabase edge functions to compose a day from goals, routine, and calendar input, then deliver it through Discord and iPhone Shortcuts. Morning/evening automation is paused. The primary scheduler and intended database fallback both went silent; a fallback needs independent monitoring and a verified recovery path.

The in-app assistant and historical integrations are not the headline of this release. Demo assistant answers are built in, and live assistant behavior is not newly verified by this PR. The Discord bot source was never activated.

## Architecture

| Piece | Role |
|---|---|
| `index.html` | Static app entry point, account-backed task operations, retained supporting views |
| `planner.css` | Planner layout and responsive styles |
| `planner-model.mjs` | Scheduling, rollover, storage validation, and focus calculations |
| `planner-workspace.mjs` | Workspace interactions and browser-local drafts |
| Supabase | Existing account authentication and owner-scoped tasks/profiles |
| Vercel | Static hosting |
| `tests/` | Node model and mocked account/rollover checks |
| `edge-*.ts`, `prompt-*.md`, `migrations-*.sql` | Earlier integration sources and database history |
| `docs/internal/` | Build history and internal planning notes |

Built collaboratively with AI tools.
