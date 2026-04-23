/* ============================================================
 *  Gabinet MM — Service Worker
 *  Wersja: 1.0  |  2026-04-21
 *  Strategia: cache-first (app shell + whitelistowane CDN)
 *             + stale-while-revalidate dla często używanych
 *             + network-only dla Supabase API (nigdy nie cache)
 *             + obsługa powiadomień PWA (pod pkt 4 z roadmapy)
 * ============================================================ */

"use strict";

// BUMPUJ WERSJĘ przy każdej zmianie app-shell żeby wymusić odświeżenie cache
const CACHE_VERSION = "v1.0.8";
const CACHE = "gabinet-mm-" + CACHE_VERSION;

// ------------------------------------------------------------
// App shell — pliki lokalne pre-cache'owane przy instalacji
// ------------------------------------------------------------
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg"
  // icon-192.png / icon-512.png dodaj gdy wygenerujesz pliki PNG
];

// ------------------------------------------------------------
// Whitelist CDN — tylko te hosty/ścieżki są cache'owane
// (wszystko inne z zewnątrz: network-only, bez cache)
// ------------------------------------------------------------
const CDN_WHITELIST = [
  "https://fonts.googleapis.com/",
  "https://fonts.gstatic.com/",
  "https://unpkg.com/@supabase/supabase-js",
  "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/"
];

// ------------------------------------------------------------
// Never-cache — Supabase API, auth itp. (zawsze na żywo)
// ------------------------------------------------------------
const NEVER_CACHE_MATCHERS = [
  ".supabase.co/",
  ".supabase.in/",
  "/auth/v1/",
  "/rest/v1/",
  "/realtime/v1/",
  "/storage/v1/"
];

// ============================================================
// INSTALL — pre-cache app shell
// ============================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll jest atomic — jeden fail = cały install fail.
      // Dlatego dodajemy pojedynczo i tolerujemy braki (np. icon-192.png jeszcze nie istnieje).
      await Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[SW] app-shell cache fail:", url, err.message);
          })
        )
      );
      await self.skipWaiting();
    })()
  );
});

// ============================================================
// ACTIVATE — posprzątaj stare cache'e
// ============================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// ============================================================
// HELPERS
// ============================================================
function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch (_) {
    return false;
  }
}

function isWhitelistedCDN(url) {
  return CDN_WHITELIST.some((prefix) => url.startsWith(prefix));
}

function isNeverCache(url) {
  return NEVER_CACHE_MATCHERS.some((pat) => url.includes(pat));
}

function isCacheableResponse(res) {
  // Akceptuj OK + opaque (cross-origin bez CORS, np. niektóre fonty)
  return !!res && (res.ok || res.type === "opaque");
}

// ============================================================
// FETCH — strategia:
//   1. POST/PUT/DELETE  → network-only (SW pomija)
//   2. Supabase API     → network-only, bez zapisu do cache
//   3. same-origin      → cache-first + tło-revalidate
//   4. whitelisted CDN  → cache-first (długoterminowo)
//   5. reszta           → network-only (nie zaśmiecamy cache)
// ============================================================
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // 1) Tylko GET — mutacje idą bezpośrednio do sieci
  if (req.method !== "GET") return;

  // Pomiń nie-HTTP (chrome-extension://, data:, blob: itp.)
  if (!req.url.startsWith("http")) return;

  // 2) Supabase API — nigdy nie cache
  if (isNeverCache(req.url)) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            JSON.stringify({ error: "offline", message: "Brak połączenia" }),
            {
              status: 503,
              statusText: "Service Unavailable (offline)",
              headers: { "Content-Type": "application/json" }
            }
          )
      )
    );
    return;
  }

  // 3) Same-origin → cache-first z tłem revalidate (SWR-lite)
  if (isSameOrigin(req.url)) {
    event.respondWith(handleSameOrigin(req));
    return;
  }

  // 4) Whitelistowane CDN → cache-first (długie TTL — CDN mają hash w URL)
  if (isWhitelistedCDN(req.url)) {
    event.respondWith(handleCDN(req));
    return;
  }

  // 5) Reszta — network-only, bez ingerencji SW
  // (po prostu pozwalamy przeglądarce obsłużyć normalnie)
});

async function handleSameOrigin(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);

  if (cached) {
    // Oddaj z cache natychmiast, w tle odśwież
    fetchAndUpdate(cache, req).catch(() => {});
    return cached;
  }

  // Pierwszy raz — pobierz i zapisz
  try {
    const res = await fetch(req);
    if (isCacheableResponse(res)) {
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    // Offline fallback: dla nawigacji (HTML) zwróć index.html z cache
    if (req.mode === "navigate" || req.destination === "document") {
      const fallback = await cache.match("./index.html") || await cache.match("./");
      if (fallback) return fallback;
    }
    return new Response("Offline — brak zasobu w cache", {
      status: 504,
      statusText: "Offline"
    });
  }
}

async function handleCDN(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);

  if (cached) return cached; // CDN zasoby się nie zmieniają (wersjonowane URL)

  try {
    const res = await fetch(req);
    if (isCacheableResponse(res)) {
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    return new Response("CDN offline", { status: 504, statusText: "Offline" });
  }
}

async function fetchAndUpdate(cache, req) {
  try {
    const res = await fetch(req);
    if (isCacheableResponse(res)) {
      await cache.put(req, res.clone());
    }
    return res;
  } catch (_) {
    // po cichu — offline, cache dalej ważny
  }
}

// ============================================================
// POWIADOMIENIA — działają z `registration.showNotification()`
// wywoływanym z kodu aplikacji (pełna implementacja planowana
// w punkcie 4 roadmapy: lokalne przypomnienia o jutrzejszych wizytach).
// ============================================================

// Kliknięcie w powiadomienie → otwórz/ustaw focus na aplikację
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "./";

  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      // Jeśli aplikacja jest już otwarta — przywróć focus i wyślij info
      for (const client of list) {
        if ("focus" in client) {
          client.postMessage({
            type: "notification-click",
            data: event.notification.data || {}
          });
          return client.focus();
        }
      }

      // Inaczej otwórz nowe okno
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});

// Kanał komunikacji z aplikacją (app → SW):
//   navigator.serviceWorker.controller.postMessage({type:'show-notification', ...});
self.addEventListener("message", (event) => {
  const msg = event.data || {};

  if (msg.type === "show-notification") {
    const {
      title = "Gabinet MM",
      body = "",
      tag = "gabinet-mm-" + Date.now(),
      data = {},
      requireInteraction = false
    } = msg;

    self.registration.showNotification(title, {
      body,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag,
      data,
      vibrate: [200, 100, 200],
      lang: "pl",
      renotify: false,
      requireInteraction
    });
  } else if (msg.type === "skip-waiting") {
    self.skipWaiting();
  } else if (msg.type === "clear-cache") {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});

// ============================================================
// PERIODIC BACKGROUND SYNC (progresywna ulepsza)
// Jeśli przeglądarka wspiera (Chrome/Android, z zainstalowaną PWA),
// codziennie wywołujemy sprawdzenie jutrzejszych wizyt i wysyłamy
// powiadomienie. Rejestracja przez aplikację:
//   const reg = await navigator.serviceWorker.ready;
//   if ('periodicSync' in reg) {
//     await reg.periodicSync.register('check-reminders', { minInterval: 24*60*60*1000 });
//   }
// ============================================================
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "check-reminders") {
    event.waitUntil(triggerReminderCheck());
  }
});

async function triggerReminderCheck() {
  // SW nie ma dostępu do IndexedDB aplikacji w prosty sposób przy zamkniętej karcie.
  // Dlatego wyślij broadcast — jeśli jakaś karta jest otwarta, ona zrobi check.
  // Pełna implementacja (z IDB w SW) przyjdzie w pkt 4 roadmapy.
  const list = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });
  for (const client of list) {
    client.postMessage({ type: "run-reminder-check" });
  }

  // Fallback: jeśli nie ma otwartej karty, pokaż ogólne powiadomienie-zachętę
  if (list.length === 0) {
    await self.registration.showNotification("Gabinet MM", {
      body: "Sprawdź dzisiejsze i jutrzejsze wizyty — otwórz aplikację.",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: "gabinet-mm-daily",
      data: { url: "./?v=calendar" }
    });
  }
}

// === KONIEC ===
