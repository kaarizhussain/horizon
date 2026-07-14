import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// STAGED — deploy as edge function "discord-bot" (verify_jwt OFF; Discord's
// Ed25519 signature is the auth). Discord Interactions endpoint for slash
// commands: /board, /done, /add, /skip.
// Secret needed: DISCORD_PUBLIC_KEY (from the Discord application portal).
// Setup steps: see DISCORD-BOT-SETUP.md.

const TZ = "America/New_York";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifySignature(publicKey: string, signature: string, timestamp: string, body: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(signature), new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}

function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(ymd: string, n: number): string {
  return new Date(new Date(ymd + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
}
function periodFor(horizon: string, today: string): string {
  if (horizon === "day") return today;
  if (horizon === "week") {
    const d = new Date(today + "T00:00:00Z");
    const dow = d.getUTCDay();
    return addDays(today, dow === 0 ? -6 : 1 - dow);
  }
  if (horizon === "month") return today.slice(0, 8) + "01";
  return today.slice(0, 5) + "01-01";
}
function parseNums(s: string, max: number): number[] {
  return [...new Set((s.match(/\d+/g) ?? []).map(Number).filter((n) => n >= 1 && n <= max))].sort((a, b) => a - b);
}
function reply(content: string) {
  return new Response(JSON.stringify({ type: 4, data: { content: content.slice(0, 1900) } }), {
    headers: { "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
type Sb = any;

async function openDayTasks(sb: Sb, today: string) {
  const { data } = await sb.from("goals").select("id, text, done, position")
    .eq("horizon", "day").eq("period", today)
    .order("position", { ascending: true }).order("created_at", { ascending: true });
  const all = data ?? [];
  return { open: all.filter((t: { done: boolean }) => !t.done), all };
}

async function maybeAdvanceStreak(sb: Sb, today: string) {
  const { all } = await openDayTasks(sb, today);
  const allDone = all.length > 0 && all.every((t: { done: boolean }) => t.done);
  if (!allDone) return null;
  const { data: prof } = await sb.from("profiles").select("user_id, streak, last_complete").order("created_at", { ascending: true }).limit(1);
  if (!prof?.length || prof[0].last_complete === today) return null;
  const p = prof[0];
  const streak = (p.last_complete && daysBetween(p.last_complete, today) === 1) ? p.streak + 1 : 1;
  await sb.from("profiles").update({ streak, last_complete: today }).eq("user_id", p.user_id);
  return streak;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const publicKey = Deno.env.get("DISCORD_PUBLIC_KEY");
  if (!publicKey) return new Response("DISCORD_PUBLIC_KEY not set", { status: 500 });

  const signature = req.headers.get("X-Signature-Ed25519") ?? "";
  const timestamp = req.headers.get("X-Signature-Timestamp") ?? "";
  const body = await req.text();
  if (!signature || !timestamp || !(await verifySignature(publicKey, signature, timestamp, body))) {
    return new Response("invalid signature", { status: 401 });
  }

  const interaction = JSON.parse(body);
  if (interaction.type === 1) { // PING → PONG (Discord endpoint validation)
    return new Response(JSON.stringify({ type: 1 }), { headers: { "Content-Type": "application/json" } });
  }
  if (interaction.type !== 2) return reply("Unsupported interaction.");

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = todayLocal();
  const cmd = interaction.data?.name ?? "";
  const opt = (name: string) =>
    interaction.data?.options?.find((o: { name: string }) => o.name === name)?.value as string | undefined;

  // Materialize today's due recurring habits before any command touches the
  // day list — matches board.ts, keeps /board, /done, /skip consistent
  // whichever surface the user opens first this morning.
  {
    const { data: prof } = await sb.from("profiles").select("user_id").order("created_at", { ascending: true }).limit(1);
    if (prof?.length) {
      const { error } = await sb.rpc("sync_todays_habits", { p_today: today, p_user_id: prof[0].user_id });
      if (error) console.error("sync_todays_habits failed:", error.message); // non-fatal
    }
  }

  if (cmd === "board") {
    const { open, all } = await openDayTasks(sb, today);
    const doneList = all.filter((t: { done: boolean }) => t.done);
    const lines = ["**HORIZON — today**"];
    if (!all.length) lines.push("Nothing on today's board yet. `/add` something, or the 7am planner will propose your day.");
    open.forEach((t: { text: string }, i: number) => lines.push(`${i + 1}. ${t.text}`));
    doneList.forEach((t: { text: string }) => lines.push(`✓ ~~${t.text}~~`));
    if (open.length) lines.push(`_Reply /done or /skip with the numbers above._`);
    return reply(lines.join("\n"));
  }

  if (cmd === "done") {
    const { open } = await openDayTasks(sb, today);
    if (!open.length) return reply("Nothing open today — board's already clear. 🌟");
    const nums = parseNums(opt("items") ?? "", open.length);
    if (!nums.length) return reply(`Give me numbers 1–${open.length}, e.g. \`/done items: 1,3\``);
    const picked = nums.map((n) => open[n - 1]);
    const { error } = await sb.from("goals")
      .update({ done: true, done_at: new Date().toISOString() })
      .in("id", picked.map((t: { id: string }) => t.id));
    if (error) return reply("Couldn't save: " + error.message);
    const streak = await maybeAdvanceStreak(sb, today);
    const names = picked.map((t: { text: string }) => `✓ ${t.text}`).join("\n");
    return reply(names + (streak !== null
      ? `\n🔥 **Today is clear — streak is now ${streak} day${streak === 1 ? "" : "s"}.**`
      : `\n${open.length - nums.length} left today.`));
  }

  if (cmd === "add") {
    const text = (opt("text") ?? "").trim().slice(0, 200);
    if (!text) return reply("What should I add? `/add text: call the dentist`");
    const horizon = ["day", "week", "month", "year"].includes(opt("horizon") ?? "") ? opt("horizon")! : "day";
    const { data: prof } = await sb.from("profiles").select("user_id").order("created_at", { ascending: true }).limit(1);
    if (!prof?.length) return reply("No profile found — sign in to the app once first.");
    const { error } = await sb.from("goals").insert({
      user_id: prof[0].user_id, horizon, period: periodFor(horizon, today), text,
    });
    if (error) return reply("Couldn't add: " + error.message);
    return reply(`Added to **${horizon === "day" ? "Today" : "This " + horizon[0].toUpperCase() + horizon.slice(1)}**: ${text}`);
  }

  if (cmd === "skip") {
    const { open } = await openDayTasks(sb, today);
    if (!open.length) return reply("Nothing open to skip.");
    const nums = parseNums(opt("items") ?? "", open.length);
    if (!nums.length) return reply(`Give me numbers 1–${open.length}, e.g. \`/skip items: 2\``);
    const picked = nums.map((n) => open[n - 1]);
    const { error } = await sb.from("goals")
      .update({ period: addDays(today, 1) })
      .in("id", picked.map((t: { id: string }) => t.id));
    if (error) return reply("Couldn't skip: " + error.message);
    return reply(picked.map((t: { text: string }) => `→ ${t.text}`).join("\n") + "\nMoved to tomorrow — the 7am planner will slot them in.");
  }

  return reply("Unknown command.");
});
