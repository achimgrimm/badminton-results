// Sends a Web Push reminder to the players who marked a match with "Ich spiele" (#21). Called every 15 minutes by
// pg_cron (public.run_reminders, #62) with the shared secret NOTIFY_SECRET (header x-notify-secret); the matches
// starting within 24 hours come from upcoming_matches (filled by sync-upcoming). Each user is reminded once per match and kick-off time (sent_reminders). Accounts can
// turn it off (reminder_settings). Secrets: NOTIFY_SECRET and as for notify-lineup.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { reminderText, type Upcoming } from "../_shared/reminder-push.ts";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) return reply(401, { error: "not allowed" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = Date.now();
  const { data: rows, error: readError } = await db.from("upcoming_matches").select("team_slug, season, game_key, home, guest, start")
    .gt("start", new Date(now).toISOString()).lte("start", new Date(now + 24 * 3600_000).toISOString());
  if (readError) return reply(500, { error: readError.message });
  const matches: Upcoming[] = (rows ?? []).map((r) => ({ team: r.team_slug, season: r.season, game: r.game_key, home: r.home, guest: r.guest, start: new Date(r.start).toISOString() }));
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

  let sent = 0, failed = 0, reminded = 0;
  const gone = new Set<string>();
  for (const u of matches) {
    const { data: answers } = await db.from("game_answers").select("user_id")
      .eq("team_slug", u.team).eq("season", u.season).eq("game_key", u.game).eq("state", "yes");
    let ids = (answers ?? []).map((a) => a.user_id as string);
    if (!ids.length) continue;
    const { data: off } = await db.from("reminder_settings").select("user_id").eq("enabled", false).in("user_id", ids);
    const offIds = new Set((off ?? []).map((o) => o.user_id));
    ids = ids.filter((id) => !offIds.has(id));
    if (!ids.length) continue;
    // Claim first: a retry or the next cron run can't send twice.
    const { data: claimed } = await db.from("sent_reminders")
      .upsert(ids.map((id) => ({ user_id: id, team_slug: u.team, season: u.season, game_key: u.game, start: u.start })),
        { onConflict: "user_id,team_slug,season,game_key,start", ignoreDuplicates: true })
      .select("user_id");
    const todo = (claimed ?? []).map((c) => c.user_id as string);
    if (!todo.length) continue;
    reminded += todo.length;
    const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", todo);
    const { title, body } = reminderText(u);
    const path = `${u.team}/vorschau/${u.game}.html`;
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body, path }), { TTL: 60 * 60 * 12 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.add(s.id);
        else console.error("push failed", code, (e as { body?: string }).body ?? String(e));
        failed++;
      }
    }));
  }
  if (gone.size) await db.from("push_subscriptions").delete().in("id", [...gone]);
  console.log("notify-reminders", JSON.stringify({ reminded, sent, failed }));
  return reply(200, { reminded, sent, failed });
});
