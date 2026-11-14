// Sends a Web Push to admins and team leads (permission player.link) when an account picks its player for the first
// time (#49). Called by the app after the pick was saved as a pending claim; takes no input: the subject is the caller.
// Each account notifies at most once (admin_signin_notices). Secrets as for notify-lineup.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { shouldNotify, signinPath, signinText } from "../_shared/signin-push.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function done(result: Record<string, unknown>) {
  console.log("notify-new-user", JSON.stringify(result));
  return reply(200, result);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: user } = await asUser.auth.getUser();
  if (!user.user) return reply(401, { error: "sign in first" });
  const me = user.user.id;
  let input: Record<string, unknown> = {};
  try { input = await req.json(); } catch { /* no body */ }
  const path = signinPath(input.team);
  if (!path) return reply(400, { error: "bad team" });
  const { data: perms } = await asUser.rpc("my_permissions");

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const [{ data: claim }, { data: seen }] = await Promise.all([
    db.from("player_claims").select("player_name, status").eq("user_id", me).maybeSingle(),
    db.from("admin_signin_notices").select("user_id").eq("user_id", me).maybeSingle(),
  ]);
  if (!shouldNotify({
    alreadyNotified: !!seen,
    callerCanApprove: Array.isArray(perms) && perms.includes("player.link"),
    hasPendingClaim: claim?.status === "pending",
  })) return done({ sent: 0, reason: "nothing to notify" });

  // Claim the marker first: concurrent tabs or retries can't send twice.
  const { data: marked } = await db.from("admin_signin_notices").upsert({ user_id: me }, { onConflict: "user_id", ignoreDuplicates: true }).select("user_id");
  if (!marked?.length) return done({ sent: 0, reason: "already notified" });

  const { data: roles } = await db.from("role_permissions").select("role").eq("permission", "player.link");
  const { data: holders } = await db.from("user_roles").select("user_id").in("role", (roles ?? []).map((r) => r.role));
  const ids = [...new Set((holders ?? []).map((h) => h.user_id))].filter((id) => id !== me);
  const { data: subs } = ids.length
    ? await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", ids)
    : { data: [] };
  if (!subs?.length) return done({ sent: 0, reason: "no push subscription for approvers", approvers: ids.length });

  const { data: profile } = await db.from("profiles").select("display_name").eq("id", me).maybeSingle();
  const { title, body } = signinText(profile?.display_name ?? null, claim!.player_name);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

  let sent = 0, failed = 0;
  const gone: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, path }), { TTL: 60 * 60 * 24 });
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
