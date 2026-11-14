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
  // A push not tied to a session (POST /notify, the deployment notes) carries its
  // own title and a same-site path to open on tap.
  const url = sameSitePath(payload.url);
  event.waitUntil(
    self.registration.showNotification(payload.title || "aigw", {
      body: payload.message || "New activity",
      data: { session_id: payload.session_id, url },
      tag: payload.session_id || (url ? `aigw-url:${url}` : "aigw"),
    })
  );
});

// Only a path on this site ("/email/"), never another origin.
function sameSitePath(u) {
  if (typeof u !== "string" || !u.startsWith("/") || u.startsWith("//")) return null;
  try {
    const abs = new URL(u, self.location.origin);
    return abs.origin === self.location.origin ? abs.pathname + abs.search + abs.hash : null;
  } catch (e) {
    return null;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data && sameSitePath(event.notification.data.url);
  if (target) {
    event.waitUntil((async () => {
      const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = clientsArr.find((c) => { const u = new URL(c.url); return u.pathname + u.search + u.hash === target; });
      if (open) { try { return await open.focus(); } catch (e) { /* fall through to a new window */ } }
      return self.clients.openWindow(target);
    })());
    return;
  }
  const sessionId = event.notification.data && event.notification.data.session_id;
  const url = sessionId ? `/agents/#${sessionId}` : "/agents/";
  event.waitUntil((async () => {
    const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Prefer the app itself (/agents/) over its helper pages
    // (outbox-browse.html, docs.html, ...) that share this scope.
    const app = clientsArr.find((c) => new URL(c.url).pathname === "/agents/")
      || clientsArr.find((c) => new URL(c.url).pathname.startsWith("/agents/"));
    if (!app) return self.clients.openWindow(url);
    try { await app.focus(); } catch (e) { /* not focusable: still try to open the session */ }
    if (!sessionId) return;
    // The page opens the session itself on this message (app.js). Not
    // WindowClient.navigate() alone: iOS Safari has no navigate(), and the
    // old code called it unguarded, so a tap there did nothing at all
    // (2026-10-04). navigate() is still tried afterwards for a page that
    // predates the message listener; for one that has it, the resulting
    // hashchange finds the session already open and does nothing.
    app.postMessage({ type: "open-session", session_id: sessionId });
    if (typeof app.navigate === "function") {
      try { await app.navigate(url); } catch (e) { /* message above already handled it */ }
    }
  })());
});
