const USER_AGENT = "ot-bremen-results/1.0 (+https://github.com/achimgrimm/badminton-results; unofficial mobile view)";
const MIN_INTERVAL_MS = 1000;

let last = 0;

/** Fetches a page at most once per second, retrying transient failures. */
export async function fetchHtml(url: string, retries = 3): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "de" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= retries) throw new Error(`fetch failed for ${url}: ${(err as Error).message}`);
      console.warn(`  retry ${attempt}/${retries - 1} after ${(err as Error).message}: ${url}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}
