// Shell and data are cached up front; page images are cached as they are viewed.
const VERSION = "v5";
const SHELL = `shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;
const PRECACHE = ["./", "index.html", "styles.css", "app.js", "reader.js", "voice.js", "data.json", "manifest.webmanifest", "icons/favicon.png", "icons/logo-rd.png", "icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => ![SHELL, RUNTIME].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isData = url.pathname.endsWith("data.json");
  event.respondWith(isData ? networkFirst(event.request) : cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    const cache = await caches.open(RUNTIME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(SHELL)).put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}
