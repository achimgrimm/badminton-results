// Sends a Web Push to the followers of a team when it has a new result (#48). Called by the hourly scrape
// (scripts/notify-results.ts) with the new results and the shared secret NOTIFY_SECRET (header x-notify-secret).
// Each meeting+score is announced once (notified_results). Secrets: NOTIFY_SECRET and as for notify-lineup.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { parseNewResults, resultText } from "../_shared/result-push.ts";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) return reply(401, { error: "not allowed" });
  let input: unknown;
  try { input = await req.json(); } catch { return reply(400, { error: "bad json" }); }
  const results = parseNewResults(input);
  if (!results) return reply(400, { error: "bad input" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

  let sent = 0, failed = 0, announced = 0;
  const gone = new Set<string>();
  for (const r of results) {
    // Claim first: a retry or a second run can't send twice.
    const { data: marked } = await db.from("notified_results")
      .upsert({ group_id: r.group, meeting: r.meeting, result: r.result.join(":") }, { onConflict: "group_id,meeting,result", ignoreDuplicates: true })
      .select("meeting");
    if (!marked?.length) continue;
    announced++;
    for (const team of new Set([r.home, r.guest])) {
      const { data: followers } = await db.from("team_subscriptions").select("user_id, path").eq("group_id", r.group).eq("team", team);
      const ids = (followers ?? []).map((f) => f.user_id);
      if (!ids.length) continue;
      const pathOf = new Map((followers ?? []).map((f) => [f.user_id, f.path as string]));
      const { data: subs } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", ids);
      const { title, body } = resultText(r, team);
      await Promise.all((subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title, body, path: pathOf.get(s.user_id) || "" }), { TTL: 60 * 60 * 24 });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) gone.add(s.id);
          else console.error("push failed", code, (e as { body?: string }).body ?? String(e));
          failed++;
        }
      }));
    }
  }
  if (gone.size) await db.from("push_subscriptions").delete().in("id", [...gone]);
  console.log("notify-results", JSON.stringify({ announced, sent, failed }));
  return reply(200, { announced, sent, failed });
});
