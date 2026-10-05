// Bump CACHE whenever you change this file -> old caches are removed automatically.
const CACHE = "gate-v3";
const SHELL = ["/", "/notes", "/flashcards", "/error-log", "/syllabus", "/todo-list", "/today", "/pdf.worker.min.js", "/manifest.json"];

self.addEventListener("install", (e) => {
  // One missing page must not break the whole install (addAll is all-or-nothing)
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache API data, and never cache partial (Range) PDF responses
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || e.request.headers.has("range")) return;

  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && r.type === "basic") {
          const copy = r.clone();
          caches.open(CACHE).then((x) => x.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
