// Makes the app installable and shows reminder notifications. Caches nothing: the app is live voice and fresh data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // some browsers require a fetch handler for the install prompt

self.addEventListener("push", (e) => {
  let d = { title: "Fasih", body: "Time to talk.", url: "/" };
  try { d = { ...d, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: "/icon.svg", tag: "daily-reminder", data: { url: d.url } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow((e.notification.data && e.notification.data.url) || "/"));
});
