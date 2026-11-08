// Free Supabase projects pause after a week without activity; the hourly workflow reads one row.
import { ONLINE, SUPABASE_ANON_KEY, SUPABASE_URL } from "../src/config.ts";

if (!ONLINE) {
  console.log("online features are off, nothing to ping");
} else {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  console.log(`supabase: ${res.status}`);
  if (!res.ok) process.exitCode = 1;
}
