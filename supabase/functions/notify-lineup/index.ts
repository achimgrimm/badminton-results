// Sends a Web Push to the players whose place in a published lineup is new, changed or gone (#47).
// Called by the app right after a team lead published (body: { team, season, game, match, path }).
// Only holders of lineup.write may call it; recipients are accounts with an approved player claim.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: contact); the Supabase
// URL, anon key and service role key are provided by the platform.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { lineupNotices, noticeText, type Lineup } from "../_shared/lineup-push.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const text = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: user } = await asUser.auth.getUser();
  if (!user.user) return reply(401, { error: "sign in first" });
  const { data: perms } = await asUser.rpc("my_permissions");
  if (!Array.isArray(perms) || !perms.includes("lineup.write")) return reply(403, { error: "lineup.write required" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "bad json" }); }
  const team = text(body.team, 100), season = text(body.season, 50), game = text(body.game, 200);
  const match = text(body.match, 100), path = text(body.path, 300);
  // The path is opened relative to the site; keep it a plain relative page path.
  if (!team || !season || !game || !match || !path || !/^[\w.\-/]+$/.test(path) || path.startsWith("/") || path.includes("..")) {
    return reply(400, { error: "bad parameters" });
  }

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: row } = await db.from("published_lineups").select("lineup, previous_lineup")
    .eq("team_slug", team).eq("season", season).eq("game_key", game).maybeSingle();
  if (!row) return reply(200, { sent: 0 }); // withdrawn meanwhile
  const notices = lineupNotices(row.previous_lineup as Lineup | null, row.lineup as Lineup);
  if (!notices.length) return reply(200, { sent: 0 });

  const { data: claims } = await db.from("player_claims").select("user_id, person")
    .eq("team_slug", team).eq("season", season).eq("status", "approved")
    .in("person", notices.map((n) => Number(n.person)));
  const byUser = new Map<string, (typeof notices)[number]>();
  for (const c of claims ?? []) {
    const n = notices.find((x) => Number(x.person) === c.person);
    if (n && c.user_id !== user.user.id) byUser.set(c.user_id, n);
  }
  if (!byUser.size) return reply(200, { sent: 0 });

  const { data: subs } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", [...byUser.keys()]);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

  let sent = 0;
  const gone: string[] = [];
  await Promise.all((subs ?? []).map(async (s) => {
    const { title, body: msg } = noticeText(byUser.get(s.user_id)!, match);
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body: msg, path }), { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      // 404/410: the device unsubscribed or the subscription expired.
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.id);
    }
  }));
  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  return reply(200, { sent });
});
