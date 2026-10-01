# Release verification — visual planner workspace

Checked on 2026-10-01. This record distinguishes direct verification from the original PR's reports.

## Completed in this review

- Re-ran all 21 Node tests successfully after deferring email-link/code sign-in.
- Parsed the extracted inline app module with `node --check`.
- Confirmed the unverified email-link/code handlers and controls were removed; existing password sign-in and demo entry remain.
- Inspected the live Supabase task/profile schema: task notes and estimates exist, task ownership defaults to `auth.uid()`, and owner policies/RLS are enabled.
- Ran task insert, edit, estimate update, move to tomorrow/back, complete/uncomplete, and readback as the database's authenticated role using a simulated request identity. A second simulated identity could neither see nor update the test row. The entire transaction was rolled back. No accounts were created and no user tasks were changed.
- Updated the README to describe manual planning and distinguish account-backed tasks, browser-local workspace state, and ephemeral demo data.

## Evidence inherited from the original PR

- Local demo and Vercel preview were reported to render without browser errors.
- The reviewed original commit had a successful Vercel deployment status.
- These browser results were not independently repeated in this review.

## Access limitations

The Vercel preview redirected this review browser to Vercel sign-in. The connected Vercel fetch tool also denied access to the deployment. The browser blocked the local development URL. No live browser acceptance result is claimed.

## Remaining merge gate for the account-enabled app

Use one existing account on the updated preview:

1. Sign in with the existing password.
2. Create a uniquely named test task in Today.
3. Save a title, note, and estimate; reload and confirm all three.
4. Move it to Tomorrow; reload, then move it back to Today.
5. Complete it, reload, uncomplete it, and reload again.
6. Sign out/in and confirm the task remains.
7. Simulate a failed save and confirm an error is visible and the last saved state remains recoverable.

Do not test against or alter existing personal tasks. A rollback database test and mocked account tests do not replace this browser/auth/Data API round trip.

## Remaining portfolio demo gate

On desktop and a narrow/mobile viewport, verify capture → promote to Today → estimate → preview/accept → complete → replan → start/pause/save focus time. Check all supporting tabs, dialog keyboard use, and overflow. Confirm demo changes reset on reload and the UI does not promise calendar connection or automatic delivery.

Capture current workspace screenshots only after this gate; the old README animation was removed because it represented the previous interface.

## Deferred intentionally

- Public account creation remains disabled.
- Email-link/code sign-in is not shipped in this release; reintroduce only after successful delivery, redirect, expiry, and session persistence checks.
- Calendar-aware automatic planning, scheduler recovery, and delivery integrations are outside the verified scope.
- Inbox drafts, accepted schedules, and focus records remain browser-local.

The PR remains open. Merge is held until the browser gates above pass, or the release is explicitly limited to a demo-only portfolio build.
