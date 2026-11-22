// Precache everything so the app opens with no network after the first visit.
const CACHE = "lookspeak-__VERSION__";
const FILES = __FILES__;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      // only our own old versions: the language model's cache must survive app updates
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("lookspeak-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // lm/ (28 MB) is only downloaded by people who turn the language model on;
  // keep it once fetched so it works offline too. The model weights themselves
  // are cached by the model library.
  const optional = new URL(e.request.url).pathname.includes("/lm/");
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(e.request).then((r) => {
          if (optional && r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return r;
        }),
    ),
  );
});
