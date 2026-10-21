/*
 * Minimal service worker: makes the site installable (Add to Home Screen) and
 * keeps a copy of the app shell for flaky connections.
 *
 * Strategy: network first for everything on this site, so a new deploy shows
 * up on the next open; the cached copy is only used when the network fails.
 * Firebase / Google / CDN requests are never touched.
 */
const CACHE = "bb-shell-v2";
const SHELL = ["/", "/index.html", "/css/gate.css", "/js/firebase-shim.js", "/js/firebase-config.js", "/js/codec.js", "/manifest.webmanifest", "/icons/icon-192.png?v=2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase, fonts, CDNs: straight to network
  if (url.pathname.startsWith("/__/")) return;     // Firebase Hosting reserved URLs (auth handler, init.js)

  const isPage = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  e.respondWith(
    // "no-cache" = always ask the server, but a 304 (unchanged) costs almost nothing.
    // (A navigation Request can't be re-used with options, so pages are fetched by URL.)
    (isPage ? fetch(url.href, { cache: "no-cache", credentials: "same-origin" }) : fetch(req))
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(isPage ? "/index.html" : req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(isPage ? "/index.html" : req).then((hit) => hit || Response.error()))
  );
});
