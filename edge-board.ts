import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Edge function "board". v3 deployed; v4-v7 STAGED (awaiting "push").
// Auth: X-Horizon-Key header must match HORIZON_HOOK_KEY (verify_jwt off).
// v4: POST {action:"seed_day"|"seed", items:["..."]} inserts assistant-
// proposed goals (lets planners schedule the user's day/week/month). Any
// other POST, including empty body, returns the read-only snapshot.
// v5: the snapshot also materializes today's due recurring habits (via the
// sync_todays_habits SQL function — see migrations-3-pending.sql) before
// reading goals, so habit-sourced tasks always appear whichever surface
// calls board first each day (app open, bot /board, or the 7am planner).
// v6 (STAGED): profile now also returns deep_work_target_hours (nullable —
// null/absent means the feature is off). See migrations-4-pending.sql.
// v7 (STAGED): POST {action:"recap"} returns a read-only 7-day summary
// (done vs. total, pct, best weekday, current streak) for the Sunday
// planner's numbers-first recap. Same aggregation shape as the app's
// Insights panel (loadInsights/renderInsights in index.html), just windowed
// to 7 days instead of 30. No new secret/auth path — reuses X-Horizon-Key.

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function localDates(tz: string) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const today = fmt.format(now); // YYYY-MM-DD
  // Monday of the current week, computed on the tz-adjusted date string (UTC-safe)
  const d = new Date(today + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getTime() + diffToMonday * 86400000);
  const weekStart = monday.toISOString().slice(0, 10);
  return { today, weekStart, monthStart: today.slice(0, 8) + "01", yearStart: today.slice(0, 5) + "01-01" };
}

Deno.serve(async (req: Request) => {
  const hookKey = Deno.env.get("HORIZON_HOOK_KEY");
  if (!hookKey) return json({ error: "HORIZON_HOOK_KEY secret not set" }, 500);
  const given = req.headers.get("x-horizon-key") ?? "";
  if (!timingSafeEqual(given, hookKey)) return json({ error: "unauthorized" }, 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const tz = "America/New_York";
  const { today, weekStart, monthStart, yearStart } = localDates(tz);

  // Optional action payload (empty/invalid body = snapshot request)
  let action = "", items: string[] = [], reqHorizon = "", reqPeriod = "";
  try {
    const p = await req.json();
    action = String(p.action ?? "");
    if (Array.isArray(p.items)) items = p.items.map((x: unknown) => String(x)).filter(Boolean);
    reqHorizon = String(p.horizon ?? "");
    reqPeriod = String(p.period ?? "");
  } catch { /* snapshot */ }

  if (action === "seed_day" || action === "seed") {
    // "seed_day" = legacy alias for {action:"seed", horizon:"day"}.
    // "seed" accepts optional horizon (day|week|month|year, default day) and
    // optional period (YYYY-MM-DD, e.g. next Monday for Sunday-night weekly
    // planning; defaults to the current period for that horizon).
    if (!items.length) return json({ error: "seed needs non-empty items" }, 400);
    const horizon = (action === "seed" && ["day", "week", "month", "year"].includes(reqHorizon)) ? reqHorizon : "day";
    const defaults: Record<string, string> = { day: today, week: weekStart, month: monthStart, year: yearStart };
    let period = defaults[horizon];
    if (/^\d{4}-\d{2}-\d{2}$/.test(reqPeriod)) period = reqPeriod;
    const { data: prof, error: profErr } = await sb.from("profiles").select("user_id").order("created_at", { ascending: true }).limit(1);
    if (profErr || !prof?.length) return json({ error: "no profile found to seed for" }, 500);
    const userId = prof[0].user_id;
    // Never exceed 4 proposed items; never duplicate existing ones in the target period
    const { data: existing } = await sb.from("goals").select("text")
      .eq("horizon", horizon).eq("period", period);
    const have = new Set((existing ?? []).map((g) => g.text.toLowerCase().trim()));
    const rows = items.slice(0, 4)
      .map((t) => t.slice(0, 200).trim())
      .filter((t) => t && !have.has(t.toLowerCase()))
      .map((text, i) => ({ user_id: userId, horizon, period, text, position: (existing?.length ?? 0) + i, source: "assistant" }));
    if (!rows.length) return json({ ok: true, seeded: 0, note: "all items already on board" });
    const { error } = await sb.from("goals").insert(rows);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, seeded: rows.length, horizon, period });
  }

  if (action === "recap") {
    // Read-only 7-day summary for the Sunday planner. Same shape as the
    // app's Insights aggregation (done vs. total, best weekday), windowed
    // to the closing week instead of 30 days.
    const { data: prof1 } = await sb.from("profiles").select("user_id, streak").order("created_at", { ascending: true }).limit(1);
    const userId1 = prof1?.[0]?.user_id;
    if (!userId1) return json({ error: "no profile found" }, 500);
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: rows, error: rErr } = await sb.from("goals")
      .select("done, done_at, created_at")
      .eq("user_id", userId1)
      .gte("created_at", since);
    if (rErr) return json({ error: rErr.message }, 500);
    const total = rows?.length ?? 0;
    const doneRows = (rows ?? []).filter((r) => r.done && r.done_at);
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const byDay = [0, 0, 0, 0, 0, 0, 0];
    doneRows.forEach((r) => { byDay[(new Date(r.done_at as string).getUTCDay() + 6) % 7]++; });
    const bestIdx = doneRows.length ? byDay.indexOf(Math.max(...byDay)) : -1;
    return json({
      ok: true,
      since,
      total,
      done: doneRows.length,
      pct: total ? Math.round(doneRows.length / total * 100) : 0,
      best_day: bestIdx >= 0 ? names[bestIdx] : null,
      by_weekday: Object.fromEntries(names.map((n, i) => [n, byDay[i]])),
      streak: prof1[0].streak ?? 0,
    });
  }

  // ---- snapshot (default) ----
  const { data: prof0 } = await sb.from("profiles").select("user_id").order("created_at", { ascending: true }).limit(1);
  const userId = prof0?.[0]?.user_id;

  // Materialize today's due recurring habits as day-goals before reading.
  if (userId) {
    const { error: syncErr } = await sb.rpc("sync_todays_habits", { p_today: today, p_user_id: userId });
    if (syncErr) console.error("sync_todays_habits failed:", syncErr.message); // non-fatal — snapshot still returns
  }

  // Roll unfinished day tasks forward so the plan covers them
  await sb.from("goals").update({ period: today })
    .eq("horizon", "day").eq("done", false).lt("period", today);

  const [goals, profiles] = await Promise.all([
    sb.from("goals").select("horizon, text, done, notes, period, source, estimate_min")
      .or(`and(horizon.eq.day,period.eq.${today}),and(horizon.eq.week,period.eq.${weekStart}),and(horizon.eq.month,period.eq.${monthStart}),and(horizon.eq.year,period.eq.${yearStart})`)
      .order("created_at", { ascending: true }),
    sb.from("profiles").select("streak, last_complete, context, deep_work_target_hours").order("created_at", { ascending: true }).limit(1),
  ]);

  if (goals.error) return json({ error: goals.error.message }, 500);

  const board: Record<string, unknown[]> = { day: [], week: [], month: [], year: [] };
  for (const g of goals.data ?? []) {
    (board[g.horizon] as unknown[])?.push({
      text: g.text, done: g.done, notes: g.notes ?? undefined,
      source: g.source, estimate_min: g.estimate_min ?? undefined,
    });
  }

  return json({
    date: today,
    timezone: tz,
    board,
    profile: profiles.data?.[0] ?? { streak: 0, last_complete: null, context: "", deep_work_target_hours: null },
  });
});
