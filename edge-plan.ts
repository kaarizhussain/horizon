import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// STAGED — deploy as edge function "plan" on user's "push".
// POST {date, items:[{time,title}]} — the 7am planner stores today's structured plan.
// GET  — the iPhone Shortcut fetches the latest plan to create Reminders.
// Auth: X-Horizon-Key header (verify_jwt off; custom check replaces it).
// Requires table (in migrations-pending.sql):
//   create table public.plans (date date primary key, items jsonb not null, created_at timestamptz default now());

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

Deno.serve(async (req: Request) => {
  const hookKey = Deno.env.get("HORIZON_HOOK_KEY");
  if (!hookKey) return json({ error: "HORIZON_HOOK_KEY secret not set" }, 500);
  const given = req.headers.get("x-horizon-key") ?? "";
  if (!timingSafeEqual(given, hookKey)) return json({ error: "unauthorized" }, 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (req.method === "POST") {
    let date = "", items: unknown[] = [];
    try {
      const p = await req.json();
      date = String(p.date ?? "");
      items = Array.isArray(p.items) ? p.items : [];
    } catch { return json({ error: "invalid json" }, 400); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !items.length) {
      return json({ error: "need date (YYYY-MM-DD) and non-empty items" }, 400);
    }
    // keep items small and well-shaped: [{time:"09:00", title:"..."}]
    const clean = items.slice(0, 20).map((it) => ({
      time: String((it as Record<string, unknown>).time ?? "").slice(0, 5),
      title: String((it as Record<string, unknown>).title ?? "").slice(0, 200),
    })).filter((it) => it.title);
    const { error } = await sb.from("plans").upsert({ date, items: clean });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, stored: clean.length });
  }

  if (req.method === "GET") {
    const { data, error } = await sb.from("plans")
      .select("date, items").order("date", { ascending: false }).limit(1);
    if (error) return json({ error: error.message }, 500);
    if (!data?.length) return json({ date: null, items: [] });
    return json(data[0]);
  }

  return json({ error: "method not allowed" }, 405);
});
