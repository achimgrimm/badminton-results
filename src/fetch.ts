const USER_AGENT = "ot-bremen-results/1.0 (+https://github.com/achimgrimm/badminton-results; unofficial mobile view)";
const MIN_INTERVAL_MS = 1000;

let last = 0;

/** Runs a request at most once per second, retrying transient failures. */
async function throttled<T>(url: string, read: (res: Response) => Promise<T>, retries: number, cookie = ""): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "de", ...(cookie ? { Cookie: cookie } : {}) } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await read(res);
    } catch (err) {
      if (attempt >= retries) throw new Error(`fetch failed for ${url}: ${(err as Error).message}`);
      console.warn(`  retry ${attempt}/${retries - 1} after ${(err as Error).message}: ${url}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

/** Fetches a page at most once per second, retrying transient failures. */
export function fetchHtml(url: string, retries = 3): Promise<string> {
  return throttled(url, (res) => res.text(), retries);
}

/** Like fetchHtml, but also returns the session cookie nuLiga sets (see fetchBinary). */
export function fetchHtmlWithCookie(url: string, retries = 3): Promise<{ html: string; cookie: string }> {
  return throttled(
    url,
    async (res) => ({ html: await res.text(), cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") }),
    retries,
  );
}

/**
 * Fetches a file (an image) under the same rate limit; returns its bytes and content type.
 * nuLiga serves uploaded images (club logos) only to the session that got the page linking them,
 * and answers an empty 200 otherwise, so pass that page's cookie.
 */
export function fetchBinary(url: string, cookie = "", retries = 3): Promise<{ data: Buffer; type: string }> {
  return throttled(
    url,
    async (res) => ({ data: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "" }),
    retries,
    cookie,
  );
}
