// Tells the Edge Function notify-reminders about the matches starting within 24 hours (#21), so it can remind the
// players who marked them. Live site only; a failure must not stop the site update.
import { ONLINE, SUPABASE_ANON_KEY, SUPABASE_URL } from "../src/config.ts";
import { paths, readJson } from "../src/data.ts";
import type { Upcoming } from "../src/reminders.ts";

const secret = process.env.NOTIFY_SECRET;
const matches = readJson<Upcoming[]>(paths.reminders, []);
if (!ONLINE || !matches.length) {
  console.log(ONLINE ? "no matches in the next 24 hours" : "online features are off, nothing to remind");
} else if (!secret) {
  console.log("NOTIFY_SECRET not set, skipping");
} else {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "x-notify-secret": secret },
    body: JSON.stringify(matches),
  });
  console.log(`notify-reminders: ${res.status} ${await res.text()}`);
  if (!res.ok) process.exitCode = 1;
}
