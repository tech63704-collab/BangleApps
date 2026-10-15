// Service worker for noise.html: required by Chrome Android to show notifications
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => {
    for (const c of cs) if (c.url.includes('noise.html')) return c.focus();
    return self.clients.openWindow('noise.html');
  }));
});
