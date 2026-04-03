const CACHE_VERSION = 'v2.0.0';
const CACHE_NAME = `ultrawork-cache-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/frontend/index.html',
  '/frontend/game-panel.html',
  '/frontend/stream.html',
  '/frontend/manifest.json',
  '/frontend/offline.html',
  '/frontend/service-worker.js'
];

const CACHE_STRATEGIES = {
  STATIC: 'static',
  DYNAMIC: 'dynamic',
  NETWORK_FIRST: 'network-first',
  CACHE_FIRST: 'cache-first'
};

const CACHE_GROUPS = {
  static: {
    strategy: CACHE_STRATEGIES.CACHE_FIRST,
    maxEntries: 50,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    urls: [
      /\.css$/,
      /\.js$/,
      /\.woff2?$/,
      /\.png$/,
      /\.jpg$/,
      /\.svg$/,
      /\.ico$/
    ]
  },
  api: {
    strategy: CACHE_STRATEGIES.NETWORK_FIRST,
    maxEntries: 100,
    maxAge: 5 * 60 * 1000,
    urls: [
      /\/api\//
    ]
  },
  fonts: {
    strategy: CACHE_STRATEGIES.CACHE_FIRST,
    maxEntries: 20,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    urls: [
      /fonts\.googleapis\.com/,
      /fonts\.gstatic\.com/
    ]
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)),
      loadDynamicAssets()
    ]).then(() => self.skipWaiting())
  );
});

async function loadDynamicAssets() {
  try {
    const resp = await fetch('/frontend/cacheable-assets.json');
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data.urls)) {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(data.urls);
      }
    }
  } catch (e) {
    console.log('[SW] Dynamic assets load skipped');
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('ultrawork-cache-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  
  if (req.method !== 'GET') return;
  
  if (req.url.includes('/socket.io/')) return;
  
  const url = new URL(req.url);
  
  if (url.origin !== location.origin) {
    event.respondWith(handleExternalRequest(req));
    return;
  }
  
  const cacheGroup = getCacheGroup(req.url);
  
  switch (cacheGroup) {
    case 'static':
    case 'fonts':
      event.respondWith(cacheFirst(req));
      break;
    case 'api':
      event.respondWith(networkFirst(req));
      break;
    default:
      event.respondWith(staleWhileRevalidate(req));
  }
});

function getCacheGroup(url) {
  for (const [name, group] of Object.entries(CACHE_GROUPS)) {
    if (group.urls.some(pattern => pattern.test(url))) {
      return name;
    }
  }
  return null;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return caches.match('/frontend/offline.html');
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
      trimCache(CACHE_NAME, 100);
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => null);
  
  return cached || fetchPromise || caches.match('/frontend/offline.html');
}

async function handleExternalRequest(request) {
  const cache = await caches.match(request);
  if (cache) return cache;
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return new Response('Offline', { status: 503 });
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    const deleteCount = keys.length - maxEntries;
    for (let i = 0; i < deleteCount; i++) {
      await cache.delete(keys[i]);
    }
  }
}

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'clearCache') {
    event.waitUntil(
      caches.keys().then(names => Promise.all(names.map(caches.delete)))
    );
  }
  
  if (event.data.action === 'cacheUrl') {
    const url = event.data.url;
    caches.open(CACHE_NAME).then(cache => cache.add(url));
  }
});
