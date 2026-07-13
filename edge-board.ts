import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// DEPLOYED as edge function "board" (v3). Read-only board snapshot for the
// planner tasks. Auth: X-Horizon-Key header must match HORIZON_HOOK_KEY
// (verify_jwt off; this custom check replaces it).
// v3: includes the 'week' horizon (Monday-anchored, matching the web app).

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

  // Roll unfinished day tasks forward so the plan covers them
  await sb.from("goals").update({ period: today })
    .eq("horizon", "day").eq("done", false).lt("period", today);

  const [goals, profiles] = await Promise.all([
    sb.from("goals").select("horizon, text, done, notes, period")
      .or(`and(horizon.eq.day,period.eq.${today}),and(horizon.eq.week,period.eq.${weekStart}),and(horizon.eq.month,period.eq.${monthStart}),and(horizon.eq.year,period.eq.${yearStart})`)
      .order("created_at", { ascending: true }),
    sb.from("profiles").select("streak, last_complete, context").limit(1),
  ]);

  if (goals.error) return json({ error: goals.error.message }, 500);

  const board: Record<string, unknown[]> = { day: [], week: [], month: [], year: [] };
  for (const g of goals.data ?? []) {
    (board[g.horizon] as unknown[])?.push({ text: g.text, done: g.done, notes: g.notes ?? undefined });
  }

  return json({
    date: today,
    timezone: tz,
    board,
    profile: profiles.data?.[0] ?? { streak: 0, last_complete: null, context: "" },
  });
});
