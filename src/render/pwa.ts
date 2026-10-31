import { CLUB_NAME } from "../config.ts";

/** Paths are relative to the manifest, so the site works under any base path (e.g. GitHub Pages). */
export function renderManifest(): string {
  return JSON.stringify(
    {
      id: "./",
      name: `${CLUB_NAME} Badminton`,
      short_name: "OT Badminton",
      description: `Tabellen, Spielpläne, Spielberichte und Spielerstatistiken aller ${CLUB_NAME}-Mannschaften`,
      lang: "de",
      // The chooser at the root forwards to the last selected team.
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
// Team pages are cached when visited; the chooser and shared assets up front.
const PRECACHE = ["./", "index.html", "styles.css", "favicon.svg", "club-logo.png", "manifest.webmanifest", "icons/icon-192.png"];

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
    // Offline and never visited: redirect to the team's cached overview, so relative links still
    // work; otherwise to the chooser, which doesn't auto-forward with #auswahl (no redirect loop).
    const fallback = () => {
      const scope = self.registration.scope;
      const team = new URL(req.url).href.slice(scope.length).split("/")[0];
      const teamIndex = team && !team.includes(".") ? new URL(team + "/index.html", scope).href : null;
      const chooser = Response.redirect(new URL("index.html#auswahl", scope).href, 302);
      if (!teamIndex) return chooser;
      return caches.match(teamIndex).then((hit) => (hit ? Response.redirect(teamIndex, 302) : chooser));
    };
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
