/* Service worker : réception des notifications push */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: 'Tâches Famille', body: e.data && e.data.text() }; }
  const title = data.title || 'Tâches Famille';
  const options = {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/badge-96.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || './' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url ? e.notification.data.url : './', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
          c.navigate && c.navigate(target).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
