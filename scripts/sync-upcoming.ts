// Sends the own matches of the next days to the Edge Function sync-upcoming (#62), which stores them for the
// reminder push (#21; a pg_cron job calls notify-reminders every 15 minutes). Live site only; a failure must not
// stop the site update. The meetings of all leagues feed the push to followers 24 h ahead (#61). An empty list is sent too, so cancelled matches disappear.
import { ONLINE, SUPABASE_ANON_KEY, SUPABASE_URL } from "../src/config.ts";
import { paths, readJson } from "../src/data.ts";
import type { Upcoming, UpcomingMeeting } from "../src/reminders.ts";

const secret = process.env.NOTIFY_SECRET;
const matches = readJson<Upcoming[]>(paths.reminders, []);
const meetings = readJson<UpcomingMeeting[]>(paths.upcomingMeetings, []);
if (!ONLINE) {
  console.log("online features are off, nothing to sync");
} else if (!secret) {
  console.log("NOTIFY_SECRET not set, skipping");
} else {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-upcoming`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "x-notify-secret": secret },
    body: JSON.stringify({ matches, meetings }),
  });
  console.log(`sync-upcoming (${matches.length} matches, ${meetings.length} meetings): ${res.status} ${await res.text()}`);
  if (!res.ok) process.exitCode = 1;
}
