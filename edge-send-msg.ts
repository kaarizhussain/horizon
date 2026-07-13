import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// STAGED — deploy as edge function "send-msg" on user's "push".
// Delivers a message to the user's Discord channel via webhook.
// Auth: X-Horizon-Key header must match HORIZON_HOOK_KEY (verify_jwt off).
// Secret needed: DISCORD_WEBHOOK_URL (user creates the webhook + sets the secret).
// Same request shape as send-sms ({body: string}) so scheduled-task prompts swap cleanly.

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
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const hookKey = Deno.env.get("HORIZON_HOOK_KEY");
  const webhook = Deno.env.get("DISCORD_WEBHOOK_URL");
  if (!hookKey || !webhook) {
    return json({ error: "Missing secrets. Set HORIZON_HOOK_KEY and DISCORD_WEBHOOK_URL." }, 500);
  }

  const given = req.headers.get("x-horizon-key") ?? "";
  if (!timingSafeEqual(given, hookKey)) return json({ error: "unauthorized" }, 401);

  let body = "";
  try {
    const payload = await req.json();
    body = String(payload.body ?? "").trim();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!body) return json({ error: "empty body" }, 400);

  // Discord hard limit is 2000 chars per message; chunk on line boundaries.
  const chunks: string[] = [];
  let cur = "";
  for (const line of body.split("\n")) {
    if ((cur + "\n" + line).length > 1900) { chunks.push(cur); cur = line; }
    else cur = cur ? cur + "\n" + line : line;
  }
  if (cur) chunks.push(cur);

  for (const chunk of chunks.slice(0, 3)) { // never spam more than 3 messages
    const resp = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: chunk }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => String(resp.status));
      return json({ error: "discord error", detail: detail.slice(0, 300) }, 502);
    }
  }
  return json({ ok: true, chunks: Math.min(chunks.length, 3) });
});
