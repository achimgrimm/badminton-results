import { LEAGUE_NAME, OWN_TEAM } from "../config.ts";

/** Paths are relative to the manifest, so the site works under any base path (e.g. GitHub Pages). */
export function renderManifest(): string {
  return JSON.stringify(
    {
      id: "./",
      name: `${OWN_TEAM} – Ergebnisse`,
      short_name: "OT III",
      description: `Spielplan, Tabelle und Spielberichte von ${OWN_TEAM} in der ${LEAGUE_NAME}`,
      lang: "de",
      start_url: "./",
      scope: "./",
      display: "standalone",
      background_color: "#f5f5f5",
      theme_color: "#0a409f",
      icons: [
        { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  );
}

/**
 * Pages: network first, so results are fresh whenever there is a connection; the cached
 * copy is the offline fallback. Static assets: served from cache, refreshed in the background.
 * The version changes on every build, which replaces the old cache.
 */
export function renderServiceWorker(version: string): string {
  return `const CACHE = "ot-results-${version}";
const PRECACHE = ["./", "index.html", "tabelle.html", "spielplan.html", "spieler.html", "styles.css", "favicon.svg", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Stores a copy of a successful response; the copy must be taken before the body is read. */
function remember(req, res) {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Offline and never visited: send to the cached overview at its own URL, so relative links still work.
    const fallback = () => Response.redirect(new URL("index.html", self.registration.scope).href, 302);
    event.respondWith(
      fetch(req)
        .then((res) => remember(req, res))
        .catch(() => caches.match(req).then((hit) => hit || fallback())),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const update = fetch(req).then((res) => remember(req, res));
      if (hit) update.catch(() => {});
      return hit || update;
    }),
  );
});
`;
}
