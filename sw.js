const cacheName = 'pathweaver-v1.0'; // Increment this (v3, v4) when you update your code
const staticAssets = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './logo.svg'

];

// 1. Install Event: Save files to the phone's memory
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => {
      console.log('Caching shell assets');
      return cache.addAll(staticAssets);
    })
  );
  // Forces the waiting service worker to become the active service worker immediately
  self.skipWaiting();
});

// 2. Activate Event: Clean up old caches and take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== cacheName) {
            console.log('Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // Ensures that the new service worker takes control of the page immediately
  return self.clients.claim();
});

// 3. Fetch Event: Serve files from cache if offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return the cached file, or go to the network if it's not in the cache
      return response || fetch(event.request);
    })
  );
});