// Tells the Edge Function notify-results about the results that appeared in the last scrape (#48), so it can push
// them to the followers of the teams. Live site only; a failure must not stop the site update.
import { ONLINE, SUPABASE_ANON_KEY, SUPABASE_URL } from "../src/config.ts";
import { paths, readJson } from "../src/data.ts";
import type { NewResult } from "../src/new-results.ts";

const secret = process.env.NOTIFY_SECRET;
const results = readJson<NewResult[]>(paths.newResults, []);
if (!ONLINE || !results.length) {
  console.log(ONLINE ? "no new results" : "online features are off, nothing to notify");
} else if (!secret) {
  console.log("NOTIFY_SECRET not set, skipping");
} else {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-results`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "x-notify-secret": secret },
    body: JSON.stringify(results),
  });
  console.log(`notify-results: ${res.status} ${await res.text()}`);
  if (!res.ok) process.exitCode = 1;
}
