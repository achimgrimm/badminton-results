// Sends a Web Push to the team leads when a player cancels ("no") a match whose lineup is already published (#57).
// Called by the app after it synced a "no" (body: { team, season, game }). It waits CANCEL_DELAY_MS and only goes on
// if the answer is still "no" and unchanged, so clicking through the states doesn't spam. Nothing is trusted from the body:
// the answer, the claim and the lineup are read from the database. Recipient: the team lead who published the lineup (published_lineups.published_by).
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT; Supabase URL and keys come from the platform.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { CANCEL_DELAY_MS, cancellationText, inLineup } from "../_shared/cancellation-push.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const text = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
function done(result: Record<string, unknown>) {
  console.log("notify-cancellation", JSON.stringify(result));
  return reply(200, result);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: user } = await asUser.auth.getUser();
  if (!user.user) return reply(401, { error: "sign in first" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "bad json" }); }
  const team = text(body.team, 100), season = text(body.season, 50), game = text(body.game, 200);
  if (!team || !season || !game || !/^[\w.\-]+$/.test(game)) return reply(400, { error: "bad parameters" });

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const me = user.user.id;
  const answer = () => db.from("game_answers").select("state, updated_at")
    .eq("user_id", me).eq("team_slug", team).eq("season", season).eq("game_key", game).maybeSingle();

  const first = (await answer()).data;
  if (first?.state !== "no") return done({ sent: 0, reason: "not cancelled" });
  await new Promise((r) => setTimeout(r, CANCEL_DELAY_MS));
  const row = (await answer()).data;
  if (row?.state !== "no" || row.updated_at !== first.updated_at) return done({ sent: 0, reason: "answer changed" });

  const { data: lineup } = await db.from("published_lineups").select("lineup, published_by")
    .eq("team_slug", team).eq("season", season).eq("game_key", game).maybeSingle();
  if (!lineup) return done({ sent: 0, reason: "no published lineup" });
  const { data: claim } = await db.from("player_claims").select("person, player_name")
    .eq("user_id", me).eq("team_slug", team).eq("season", season).eq("status", "approved").maybeSingle();
  if (!claim || !inLineup(lineup.lineup, claim.person)) return done({ sent: 0, reason: "not in lineup" });

  // Claim first: a retry can't send twice.
  const { data: claimed } = await db.from("sent_cancellations")
    .upsert({ user_id: me, team_slug: team, season, game_key: game, answered_at: row.updated_at },
      { onConflict: "user_id,team_slug,season,game_key,answered_at", ignoreDuplicates: true }).select("user_id");
  if (!claimed?.length) return done({ sent: 0, reason: "already sent" });

  // Only the team lead who published the lineup hears of it.
  const ids = lineup.published_by && lineup.published_by !== me ? [lineup.published_by as string] : [];
  if (!ids.length) return done({ sent: 0, reason: "no publisher to notify" });
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", ids);
  if (!subs?.length) return done({ sent: 0, reason: "no push subscription for the publisher" });

  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
  const { title, body: msg } = cancellationText(claim.player_name, game);
  const path = `${team}/vorschau/${game}.html`;
  let sent = 0, failed = 0;
  const gone: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body: msg, path }), { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.id);
      else console.error("push failed", code, (e as { body?: string }).body ?? String(e));
      failed++;
    }
  }));
  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  return done({ sent, failed, subscriptions: subs.length });
});
