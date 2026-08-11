// sw.js — Cachea todos los archivos de la app para que funcione sin internet.
// IMPORTANTE: sube el numero de CACHE_VERSION cada vez que publiques cambios
// del codigo, para que los celulares descarguen la version nueva.

const CACHE_VERSION = 'udn-sport-v2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/lib/dexie.min.js',
  './js/data/db.js',
  './js/data/sheets.js',
  './js/features/attendance.js',
  './js/features/config.js',
  './js/app.js',
  './icons/logo-udn.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/3.44.0/tabler-icons.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Las llamadas a Google Apps Script (sincronizacion) siempre van a la red,
  // nunca se cachean, porque necesitan datos frescos.
  if (req.url.includes('script.google.com')) {
    event.respondWith(fetch(req).catch(() => new Response(
      JSON.stringify({ ok: false, error: 'OFFLINE' }),
      { headers: { 'Content-Type': 'application/json' } }
    )));
    return;
  }

  // Estrategia: cache primero, y si no esta, ir a la red y guardarlo para la proxima.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && req.method === 'GET') {
            const resClone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => {
          if (req.mode === 'navigate') return caches.match('./index.html');
        });
    })
  );
});
