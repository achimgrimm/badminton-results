// Stores the own matches of the next days (#62), posted by the site update (scripts/sync-upcoming.ts) with the
// shared secret NOTIFY_SECRET (header x-notify-secret). notify-reminders reads them when pg_cron calls it.
// The table is replaced by each call, so moved or cancelled matches disappear.
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseUpcoming } from "../_shared/reminder-push.ts";
import { parseMeetings } from "../_shared/follow-push.ts";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) return reply(401, { error: "not allowed" });
  let input: unknown;
  try { input = await req.json(); } catch { return reply(400, { error: "bad json" }); }
  // { matches, meetings } (#61); a plain list of matches (#62) is still accepted.
  const obj = input as { matches?: unknown; meetings?: unknown } | null;
  const matches = parseUpcoming(Array.isArray(input) ? input : obj?.matches);
  const meetings = Array.isArray(input) ? null : parseMeetings(obj?.meetings ?? []);
  if (!matches || (!Array.isArray(input) && !meetings)) return reply(400, { error: "bad input" });

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

  if (meetings) {
    const mrows = meetings.map((x) => ({ group_id: x.group, meeting: x.meeting, home: x.home, guest: x.guest, start: x.start }));
    for (let i = 0; i < mrows.length; i += 500) {
      const { error } = await db.from("upcoming_meetings").upsert(mrows.slice(i, i + 500), { onConflict: "group_id,meeting" });
      if (error) return reply(500, { error: error.message });
    }
    const keepM = new Set(mrows.map((r) => `${r.group_id}|${r.meeting}`));
    const { data: oldM } = await db.from("upcoming_meetings").select("group_id, meeting");
    for (const o of (oldM ?? []).filter((o) => !keepM.has(`${o.group_id}|${o.meeting}`))) {
      await db.from("upcoming_meetings").delete().eq("group_id", o.group_id).eq("meeting", o.meeting);
    }
  }
  console.log("sync-upcoming", rows.length, meetings?.length ?? "-");
  return reply(200, { stored: rows.length, meetings: meetings?.length ?? 0 });
});
