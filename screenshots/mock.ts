import type { BrowserContext, Page } from "playwright-core";
import { SUPABASE_URL, storageKey } from "../src/config.ts";

/** Who looks at the app: signed out (member) or one of the signed-in roles of the manual. */
export type Persona = "member" | "signed_in" | "player" | "team_lead" | "admin";
export const PERSONAS: Persona[] = ["member", "signed_in", "player", "team_lead", "admin"];

export interface RosterEntry { person: number; name: string }

/** What the mocked backend knows about the page the shot is taken on. */
export interface MockData {
  now: Date;
  roster: RosterEntry[];
  /** The lineup the players of the preview page played most often, per discipline (data-history). */
  history: Record<string, string[]>;
  /** The person the player persona has chosen ("Wer bist Du?"); the other signed-in personas are "Nicht aktiv", so no real name shows up in their menu. */
  me: RosterEntry;
}

const PERMISSIONS: Record<Persona, string[]> = {
  member: [],
  signed_in: [],
  player: [],
  team_lead: ["lineup.write", "answers.read_all", "player.link"],
  admin: ["lineup.write", "answers.read_all", "player.link", "role.manage"],
};
const ROLES: Record<Persona, string[]> = {
  member: [],
  signed_in: ["member"],
  player: ["member", "player"],
  team_lead: ["member", "player", "team_lead"],
  admin: ["member", "player", "admin"],
};

const UID = "00000000-0000-4000-8000-000000000001";
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** A session in the shape supabase-js saves; the token is never checked by the client, only its expiry. */
function session(now: Date) {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + 86400;
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, role: "authenticated", aud: "authenticated", iat, exp, email: "alex@example.org" })}.fake`;
  return {
    access_token: jwt, refresh_token: "fake", token_type: "bearer", expires_in: 86400, expires_at: exp,
    user: { id: UID, aud: "authenticated", role: "authenticated", email: "alex@example.org", app_metadata: { provider: "email" }, user_metadata: { full_name: "Alex Beispiel" }, created_at: now.toISOString() },
  };
}

/** Signs the persona in without a backend and answers every Supabase request the app makes. Anything else fails the run. */
export async function mockSupabase(context: BrowserContext, persona: Persona, data: MockData, unmocked: string[]): Promise<void> {
  if (persona !== "member") {
    await context.addInitScript(
      ([auth, sync, me, meKey, meValue]) => {
        localStorage.setItem(auth[0], auth[1]);
        localStorage.setItem(sync, "1");
        // Without a chosen player the app opens its "Wer bist Du?" dialog by itself.
        if (me) localStorage.setItem(meKey, meValue);
      },
      [
        [storageKey("auth"), JSON.stringify(session(data.now))],
        storageKey(`auth-sync-${UID}`),
        persona === "player",
        storageKey("me"),
        JSON.stringify({ person: data.me.person, name: data.me.name }),
      ] as [string[], string, boolean, string, string],
    );
  }
  const json = (route: import("playwright-core").Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
  const claim = { id: 1, user_id: UID, person: data.me.person, player_name: data.me.name, status: "approved", created_at: data.now.toISOString() };
  // Invented accounts and names throughout: only the club's public roster and lineup history are real data.
  const names = ["Sam Beispiel", "Robin Muster"];
  const players = ["Beispiel, Sam", "Muster, Robin"];
  const pending = names.map((_, i) => ({
    id: 10 + i, user_id: `00000000-0000-4000-8000-00000000001${i}`, person: 9000001 + i, player_name: players[i], status: "pending", created_at: data.now.toISOString(),
  }));
  const answers = data.roster.slice(0, 12).map((r, i) => ({ person: r.person, state: ["yes", "yes", "maybe", "no"][i % 4] }));
  const iso = (daysAgo: number) => new Date(data.now.getTime() - daysAgo * 86400000).toISOString();

  await context.route(`${SUPABASE_URL}/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const path = url.pathname;
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const rpc = /^\/rest\/v1\/rpc\/(.+)$/.exec(path)?.[1];
    const table = /^\/rest\/v1\/([a-z_]+)$/.exec(path)?.[1];
    if (req.method() !== "GET" && req.method() !== "POST") return json(route, null, 204);
    if (path.startsWith("/functions/v1/")) return json(route, {});
    if (path.startsWith("/auth/v1/")) return json(route, {}, 400);
    if (rpc === "my_permissions") return json(route, PERMISSIONS[persona]);
    if (rpc === "verified_players") return json(route, persona === "player" ? [data.me.person] : []);
    if (rpc === "team_answers") return json(route, answers);
    if (rpc === "pending_claim_emails") return json(route, pending.map((p, i) => ({ user_id: p.user_id, email: `${names[i].split(" ")[0].toLowerCase()}@example.org` })));
    if (rpc === "list_users_with_roles") {
      return json(route, [
        { user_id: UID, display_name: "Alex Beispiel", email: "alex@example.org", roles: ["admin"] },
        { user_id: pending[0].user_id, display_name: names[0], email: "sam@example.org", roles: ["team_lead"] },
        { user_id: pending[1].user_id, display_name: names[1], email: "robin@example.org", roles: [] },
      ]);
    }
    if (rpc === "list_user_players") return json(route, [{ user_id: UID, player_name: "Beispiel, Alex" }, ...pending.map((p) => ({ user_id: p.user_id, player_name: p.player_name }))]);
    if (rpc === "list_user_activity") {
      return json(route, [
        { user_id: UID, devices: 2, last_sign_in_at: iso(0), push_devices: 1 },
        { user_id: pending[0].user_id, devices: 1, last_sign_in_at: iso(3), push_devices: 0 },
        { user_id: pending[1].user_id, devices: 0, last_sign_in_at: iso(40), push_devices: 0 },
      ]);
    }
    if (rpc === "list_user_last_seen") return json(route, [{ user_id: UID, last_seen_at: iso(0) }, { user_id: pending[0].user_id, last_seen_at: iso(2) }]);
    if (table === "profiles") {
      if (url.searchParams.get("id")?.startsWith("in.")) return json(route, pending.map((p, i) => ({ id: p.user_id, display_name: names[i] })));
      return single ? json(route, { display_name: "Alex Beispiel", not_a_player: persona !== "player" }) : json(route, [{ display_name: "Alex Beispiel", not_a_player: persona !== "player" }]);
    }
    if (table === "user_roles") return json(route, ROLES[persona].map((role) => ({ role })));
    if (table === "player_claims") {
      if (url.searchParams.get("status") === "eq.pending") return json(route, pending);
      return json(route, persona === "player" ? [claim] : []);
    }
    if (table === "game_answers" || table === "team_subscriptions") return json(route, []);
    if (table === "published_lineups") {
      if (persona === "team_lead" || persona === "admin") return single ? json(route, {}, 406) : json(route, []);
      const lineup: Record<string, string[]> = {};
      for (const [d, ids] of Object.entries(data.history)) lineup[d] = ids;
      return single ? json(route, { lineup, published_at: iso(1) }) : json(route, [{ lineup, published_at: iso(1) }]);
    }
    unmocked.push(`${req.method()} ${path}${url.search}`);
    return json(route, { message: "not mocked" }, 500);
  });
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" };

export type { Page };
