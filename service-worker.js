// Dock Talk service worker v3 — offline shell + last-seen public feed + push alerts.
// Bump CACHE_VERSION to force every phone to drop old caches.
const CACHE_VERSION = 'dt-v3';
const C_STATIC = CACHE_VERSION + '-static';
const C_DATA   = CACHE_VERSION + '-data';
const C_IMG    = CACHE_VERSION + '-img';
const SUPA = 'zqosmuwittjelbeggqdy.supabase.co';
const IMG_MAX = 50;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(C_STATIC)
      // one missing file must not break the whole install
      .then(c => Promise.allSettled(['/', '/index.html', '/manifest.json'].map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('dt-') && ![C_STATIC, C_DATA, C_IMG].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Only public feed data is ever cached. Logins, favorites, admin lists and
// anything that carries an email are never touched.
function isPublicData(u){
  if(u.hostname !== SUPA || !u.pathname.startsWith('/rest/v1/')) return false;
  const t = u.pathname.split('/')[3];
  if(t === 'specials' || t === 'recurring_deals') return true;
  if(t === 'restaurants') return u.search.includes('status=eq.approved') || u.search.includes('id=eq.') || u.search.includes('id=in.');
  return false;
}
const isSupaImg = u => u.hostname === SUPA && u.pathname.startsWith('/storage/v1/object/public/');
const isLib = u => u.hostname === 'cdn.jsdelivr.net' && u.pathname.includes('supabase');
const isFont = u => u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';

async function trim(cache, max){
  const keys = await cache.keys();
  for(let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
async function networkFirst(req, cacheName, fallbackUrl){
  const cache = await caches.open(cacheName);
  try{
    const res = await fetch(req);
    if(res && res.ok) cache.put(req, res.clone());
    return res;
  }catch(err){
    const hit = await cache.match(req) || (fallbackUrl && await cache.match(fallbackUrl));
    if(hit) return hit;
    throw err;
  }
}
async function cacheFirst(req, cacheName, max){
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if(hit) return hit;
  const res = await fetch(req);
  if(res && (res.ok || res.type === 'opaque')){ cache.put(req, res.clone()); if(max) trim(cache, max); }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const u = new URL(req.url);

  if(req.mode === 'navigate' && u.origin === location.origin){
    e.respondWith(networkFirst(req, C_STATIC, '/index.html'));
  } else if(u.origin === location.origin){
    e.respondWith(networkFirst(req, C_STATIC));
  } else if(isPublicData(u)){
    e.respondWith(networkFirst(req, C_DATA));
  } else if(isSupaImg(u)){
    e.respondWith(cacheFirst(req, C_IMG, IMG_MAX));
  } else if(isLib(u) || isFont(u)){
    e.respondWith(cacheFirst(req, C_STATIC));
  }
  // everything else (auth, favorites, admin, analytics) goes straight to the network
});


// ── Push alerts ──────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Dock Talk', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Dock Talk', {
    body: d.body || '',
    icon: '/images/icon-192.png',
    badge: '/images/icon-96.png',
    tag: d.tag || undefined,
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) { try { c.navigate(url); } catch (_) {} return c.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
