// Sends a Web Push 24 hours before a match of a followed team (#61). Called every 15 minutes by pg_cron
// (public.run_follow_starts) with the shared secret NOTIFY_SECRET (header x-notify-secret). The meetings come from
// upcoming_meetings (filled by sync-upcoming). Players with a "yes" answer for the match are skipped: they get the
// player reminder (notify-reminders). Each user is notified once per meeting and kick-off (sent_follow_starts).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { followStartText, ownMatchFor } from "../_shared/follow-push.ts";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) return reply(401, { error: "not allowed" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
  const now = Date.now();
  const { data: rows, error } = await db.from("upcoming_meetings").select("group_id, home, guest, start")
    .gt("start", new Date(now).toISOString()).lte("start", new Date(now + 24 * 3600_000).toISOString());
  if (error) return reply(500, { error: error.message });
  const { data: own } = await db.from("upcoming_matches").select("team_slug, season, game_key, home, guest, start")
    .gt("start", new Date(now).toISOString()).lte("start", new Date(now + 24 * 3600_000).toISOString());

  let sent = 0, failed = 0, notified = 0;
  const gone = new Set<string>();
  for (const r of rows ?? []) {
    const m = { group: r.group_id as number, home: r.home as string, guest: r.guest as string, start: new Date(r.start).toISOString() };
    // user -> [path, team] of the first followed team
    const follows = new Map<string, { path: string; team: string }>();
    for (const team of new Set([m.home, m.guest])) {
      const { data: followers } = await db.from("team_subscriptions").select("user_id, path").eq("group_id", m.group).eq("team", team);
      for (const f of followers ?? []) if (!follows.has(f.user_id)) follows.set(f.user_id, { path: (f.path as string) || "", team });
    }
    if (!follows.size) continue;
    const mine = ownMatchFor({ home: m.home, guest: m.guest, start: m.start }, (own ?? []).map((o) => ({ ...o, start: new Date(o.start).toISOString() })));
    if (mine) {
      const { data: yes } = await db.from("game_answers").select("user_id")
        .eq("team_slug", mine.team_slug).eq("season", mine.season).eq("game_key", mine.game_key).eq("state", "yes");
      for (const y of yes ?? []) follows.delete(y.user_id);
    }
    const ids = [...follows.keys()];
    if (!ids.length) continue;
    // Claim first: a retry or the next cron run can't send twice.
    const { data: claimed } = await db.from("sent_follow_starts")
      .upsert(ids.map((id) => ({ user_id: id, group_id: m.group, home: m.home, guest: m.guest, start: m.start })),
        { onConflict: "user_id,group_id,home,guest,start", ignoreDuplicates: true })
      .select("user_id");
    const todo = (claimed ?? []).map((c) => c.user_id as string);
    if (!todo.length) continue;
    notified += todo.length;
    const { data: subs } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", todo);
    await Promise.all((subs ?? []).map(async (s) => {
      const f = follows.get(s.user_id)!;
      const { title, body } = followStartText(m, f.team);
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body, path: f.path }), { TTL: 60 * 60 * 12 });
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
  console.log("notify-follow-starts", JSON.stringify({ notified, sent, failed }));
  return reply(200, { notified, sent, failed });
});
