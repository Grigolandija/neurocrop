const SHELL_CACHE = 'neurocrop-shell-v2'
const STATIC_CACHE = 'neurocrop-static-v2'
const APP_SHELL = ['/', '/manifest.webmanifest', '/pwa-icon.svg', '/pwa-maskable.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL_CACHE, STATIC_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  const isVersionedAsset = url.pathname.startsWith('/assets/')
  const isPwaIcon = url.pathname === '/pwa-icon.svg' || url.pathname === '/pwa-maskable.svg'
  if (isVersionedAsset || isPwaIcon) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()))
        return response
      })),
    )
  }
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data?.json() || {}
  } catch {
    payload = { body: event.data?.text() || '' }
  }
  const title = payload.title || 'NeuroCrop alert'
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || 'A growing condition needs attention.',
    icon: '/pwa-icon.svg',
    badge: '/pwa-icon.svg',
    tag: payload.tag || 'neurocrop-alert',
    renotify: true,
    data: { url: payload.url || '/alerts' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/alerts', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin)
      if (existing) {
        await existing.focus()
        if ('navigate' in existing) await existing.navigate(target)
        return
      }
      await self.clients.openWindow(target)
    }),
  )
})
