# Decision doc: making Horizon's mornings fire without the desktop app

**The problem, proven twice already:** scheduled tasks run inside the Claude
desktop app. Laptop closed at 7:05 = no morning text until next launch (the
overnight build on 7/13 fired 4 hours late for exactly this reason).

## Options

| | How | Planning quality | Cost | Effort |
|---|---|---|---|---|
| **A. Status quo** | Desktop app scheduler | Full Claude | $0 | none |
| **B. GitHub Actions cron → Claude API** ⭐ | Workflow in the horizon repo runs at 7:05 UTC-shifted, calls the Anthropic API with the planner prompt + board JSON, posts to send-msg | Full Claude | ~$0.01–0.05/day on API billing | ~1 session |
| C. Supabase pg_cron → edge function | Postgres cron invokes a function that formats the board with a fixed template | Template only — no real planning | $0 | small |
| D. Hybrid: C as fallback | pg_cron fires ONLY if no plan was stored by 7:30 (checks `plans` table) — sends the dumb-but-reliable version when the desktop missed | Claude when possible, template when not | $0 | small |

## Recommendation
**B** when you're ready to put a payment method on an Anthropic API account
(the key would live in GitHub repo secrets — set by you, never through Claude).
**D** is a worthwhile stopgap before that: zero cost, and mornings never
silently fail — worth including in the next push.

## What B needs from you when we build it
1. console.anthropic.com → create API key → add to GitHub repo secrets as `ANTHROPIC_API_KEY`
2. That's it — the workflow file, prompt, and plumbing are Claude's job.

## D — STAGED 2026-07-14 (`migrations-5-pending.sql`)

Built: `horizon_fallback_check_and_send()`, a SECURITY DEFINER function that
enables `pg_cron` + `pg_net` (checked against the live project — neither was
installed yet; `supabase_vault` already was) and schedules a job every 15
minutes. It only acts inside the 07:15–07:45 ET window (gating on local time
in-function rather than a UTC cron expression, so it doesn't need seasonal
DST adjustment) and only if `public.plans` has no row for today — i.e. only
when the desktop 7am task never ran. When it fires: reads today's open day
goals directly, sends an unformatted list via the same `send-msg` function
the real planner uses, and writes a `plans` row so it doesn't re-send and so
the iPhone Shortcut still has something to pull. Fully self-contained — no
new edge function needed.

**Your step at push (not something Claude can do — it's a live secret):**
run once in the Supabase SQL editor:
```sql
select vault.create_secret('<the real HORIZON_HOOK_KEY value>', 'horizon_hook_key');
```
Without it the function no-ops safely (logs a notice) every 15 minutes.
