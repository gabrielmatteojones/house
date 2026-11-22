// Service worker: mostra le notifiche push e riporta in primo piano il portale al clic.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (_) {}
  e.waitUntil((async () => {
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const visible = wins.filter((w) => w.visibilityState === "visible");
    visible.forEach((w) => w.postMessage({ type: "refresh" })); // la pagina aperta aggiorna l'elenco e suona da sola
    await self.registration.showNotification(d.title || "Jones Mail", {
      body: d.body || "", tag: d.tag, icon: "/assets/icon.svg", badge: "/assets/icon.svg",
      silent: visible.length > 0, data: { url: "/posta/" }
    });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins[0]) return wins[0].focus();
    return clients.openWindow("/posta/");
  })());
});
