// Signal Flow Map - Service Worker
// Network-first 전략: 오프라인 폴백 제공, 온라인일 땐 항상 최신 가져옴
const CACHE = 'signal-flow-v1';
const ASSETS = [
  '/',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 네트워크 우선, 실패 시 캐시
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // API/Supabase 요청은 캐싱 안함
  if (req.url.includes('supabase.co')) return;
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then(res => {
        // 성공 응답은 캐시 업데이트 (same-origin만)
        if (res.ok && req.url.startsWith(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, clone)).catch(() => null);
        }
        return res;
      })
      .catch(() => caches.match(req).then(cached => cached || caches.match('/')))
  );
});
