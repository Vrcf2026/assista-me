// Service Worker — assista-me PWA
// Versão: 1.0.0

const CACHE_NAME = "assista-me-v1";
const OFFLINE_URL = "/offline.html";

// Ficheiros essenciais para cache
const PRECACHE = ["/", OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Push notifications
self.addEventListener("push", (event) => {
  let data = { title: "assista-me", body: "Nova notificação", link: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-72.png",
      data: { link: data.link },
      vibrate: [200, 100, 200],
      tag: data.link, // agrupa notificações do mesmo ticket
      renotify: true,
    })
  );
});

// Click numa notificação → abre o link
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(link);
      } else {
        clients.openWindow(link);
      }
    })
  );
});

// Fetch — network first, cache fallback
self.addEventListener("fetch", (event) => {
  // Só cachear GET de páginas/assets
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Não cachear API calls
  if (url.pathname.startsWith("/api/") || url.hostname.includes("supabase")) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached ?? caches.match(OFFLINE_URL))
      )
  );
});
