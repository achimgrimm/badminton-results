// Stores the own matches of the next days (#62), posted by the site update (scripts/sync-upcoming.ts) with the
// shared secret NOTIFY_SECRET (header x-notify-secret). notify-reminders reads them when pg_cron calls it.
// The table is replaced by each call, so moved or cancelled matches disappear.
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseUpcoming } from "../_shared/reminder-push.ts";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) return reply(401, { error: "not allowed" });
  let input: unknown;
  try { input = await req.json(); } catch { return reply(400, { error: "bad json" }); }
  const matches = parseUpcoming(input);
  if (!matches) return reply(400, { error: "bad input" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const rows = matches.map((u) => ({ team_slug: u.team, season: u.season, game_key: u.game, home: u.home, guest: u.guest, start: u.start }));
  // Upsert first, then remove what is no longer listed: a failure never leaves the table empty.
  if (rows.length) {
    const { error } = await db.from("upcoming_matches").upsert(rows, { onConflict: "team_slug,season,game_key" });
    if (error) return reply(500, { error: error.message });
  }
  const keep = new Set(rows.map((r) => `${r.team_slug}|${r.season}|${r.game_key}`));
  const { data: old } = await db.from("upcoming_matches").select("team_slug, season, game_key");
  for (const o of (old ?? []).filter((o) => !keep.has(`${o.team_slug}|${o.season}|${o.game_key}`))) {
    await db.from("upcoming_matches").delete().eq("team_slug", o.team_slug).eq("season", o.season).eq("game_key", o.game_key);
  }
  console.log("sync-upcoming", rows.length);
  return reply(200, { stored: rows.length });
});
