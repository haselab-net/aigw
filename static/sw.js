// Minimal service worker: exists mainly so the browser considers this a
// installable PWA (required by most browsers alongside the manifest) and so
// we have a place to receive Web Push events. No offline caching -- this is
// a live control panel, not a static site.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { session_id: null, message: "New activity" };
  try {
    payload = event.data.json();
  } catch (e) {
    // ignore malformed payloads
  }
  event.waitUntil(
    self.registration.showNotification("aigw", {
      body: payload.message || "New activity",
      data: { session_id: payload.session_id },
      tag: payload.session_id || "aigw",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const sessionId = event.notification.data && event.notification.data.session_id;
  const url = sessionId ? `/agents/#${sessionId}` : "/agents/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
