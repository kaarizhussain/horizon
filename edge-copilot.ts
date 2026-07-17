import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Copilot: the first function in this project called directly from the
// browser (everything else — board/plan/send-msg/discord-bot — is
// server-to-server via the shared X-Horizon-Key). So, unlike those:
// - needs its own CORS handling (no platform default for custom functions)
// - auth is the CALLER'S OWN Supabase session JWT, not the shared hook key —
//   verify_jwt is off at the platform level (matching this codebase's
//   existing convention of custom in-code auth) but every query below runs
//   through a client scoped to that JWT, so RLS restricts it to the
//   caller's own rows automatically. No service-role key involved at all.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function localDates(tz: string) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const today = fmt.format(now);
  const d = new Date(today + "T00:00:00Z");
  const dow = d.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getTime() + diffToMonday * 86400000);
  return {
    today,
    weekStart: monday.toISOString().slice(0, 10),
    monthStart: today.slice(0, 8) + "01",
    yearStart: today.slice(0, 5) + "01-01",
  };
}

function summarizeHorizon(label: string, rows: { text: string; done: boolean }[]): string {
  if (!rows.length) return `${label}: empty.`;
  const done = rows.filter((r) => r.done);
  const open = rows.filter((r) => !r.done);
  const parts = [`${label}: ${done.length} of ${rows.length} done.`];
  if (open.length) parts.push(`Open: ${open.map((r) => `"${r.text}"`).join(", ")}.`);
  if (done.length) parts.push(`Done: ${done.map((r) => `"${r.text}"`).join(", ")}.`);
  return parts.join(" ");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Check config first (matches this codebase's existing pattern of
  // reporting a missing secret before anything else) — this also means a
  // credential-free test call conclusively reveals whether the key exists.
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY secret not set" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userErr } = await sb.auth.getUser();
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  let question = "";
  try {
    const body = await req.json();
    question = String(body.question ?? "").trim().slice(0, 2000);
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!question) return json({ error: "empty question" }, 400);

  const tz = "America/New_York";
  const { today, weekStart, monthStart, yearStart } = localDates(tz);

  const [goalsRes, profRes] = await Promise.all([
    sb.from("goals").select("horizon, text, done")
      .or(`and(horizon.eq.day,period.eq.${today}),and(horizon.eq.week,period.eq.${weekStart}),and(horizon.eq.month,period.eq.${monthStart}),and(horizon.eq.year,period.eq.${yearStart})`),
    sb.from("profiles").select("streak, last_complete, context, deep_work_target_hours").limit(1),
  ]);

  if (goalsRes.error) return json({ error: goalsRes.error.message }, 500);

  const board: Record<string, { text: string; done: boolean }[]> = { day: [], week: [], month: [], year: [] };
  for (const g of goalsRes.data ?? []) board[g.horizon]?.push({ text: g.text, done: g.done });

  const profile = profRes.data?.[0] ?? { streak: 0, last_complete: null, context: "", deep_work_target_hours: null };

  const boardSummary = [
    summarizeHorizon("Today", board.day),
    summarizeHorizon("This Week", board.week),
    summarizeHorizon("This Month", board.month),
    summarizeHorizon("This Year", board.year),
    `Streak: ${profile.streak} day${profile.streak === 1 ? "" : "s"}.`,
    profile.deep_work_target_hours ? `Deep-work target: ${profile.deep_work_target_hours} hrs/week.` : "Deep-work target: not set.",
    profile.context ? `User's standing briefing: "${profile.context}"` : "No briefing set yet.",
  ].join("\n");

  const system = `You are Horizon's copilot — a calm, concise assistant for a personal goal-tracking app (four horizons: Today, This Week, This Month, This Year).

Answer the user's question using ONLY the real facts below. Never invent goals, numbers, or completions that aren't listed. If asked something the data can't answer, say so plainly rather than guessing.

Style: conversational, 2-4 sentences, no markdown headers. You may use **bold** sparingly for the one or two most important words or numbers, and short "- " bullet lines if genuinely clearer than prose. Never guilt-trip about unfinished items.

CURRENT BOARD STATE:
${boardSummary}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 350,
      system,
      messages: [{ role: "user", content: question }],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => String(resp.status));
    return json({ error: "anthropic error", detail: detail.slice(0, 300) }, 502);
  }

  const result = await resp.json();
  const answer = result.content?.[0]?.text ?? "Sorry, I couldn't generate a response.";
  return json({ ok: true, answer });
});
