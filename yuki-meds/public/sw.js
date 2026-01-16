/**
 * Yuki Meds Service Worker
 * Provides offline support, caching, and notification badge management for iOS PWA
 */

const CACHE_NAME = 'yuki-meds-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // For API requests, always go to network
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Return offline response for API failures
          return new Response(
            JSON.stringify({ error: 'Offline', offline: true }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }

  // For static assets, try network first, then cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response to cache it
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  let data = { title: 'Yuki Meds', body: 'Medication reminder' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'medication-reminder',
    renotify: true,
    requireInteraction: true,
    data: data.data || {},
    actions: [
      { action: 'confirm', title: 'Confirm' },
      { action: 'snooze', title: 'Snooze' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );

  // Update badge count
  if (data.badgeCount !== undefined) {
    updateBadge(data.badgeCount);
  }
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const notificationData = event.notification.data;

  if (action === 'confirm' && notificationData.id) {
    // Confirm medication via API
    event.waitUntil(
      fetch('/api/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notificationData.id })
      }).then(() => {
        // Refresh badge after confirmation
        return refreshBadge();
      })
    );
  } else if (action === 'snooze') {
    // Handle snooze - could reschedule notification
    console.log('[SW] Snoozed notification');
  }

  // Open the app
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// Message event - handle messages from the main thread
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'UPDATE_BADGE':
      updateBadge(data.count);
      break;
    case 'CLEAR_BADGE':
      clearBadge();
      break;
    case 'REFRESH_BADGE':
      refreshBadge();
      break;
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
  }
});

// Badge API functions (iOS 16.4+ supports app badges)
async function updateBadge(count) {
  try {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        await navigator.setAppBadge(count);
        console.log('[SW] Badge set to:', count);
      } else {
        await navigator.clearAppBadge();
        console.log('[SW] Badge cleared');
      }
    }
  } catch (error) {
    console.warn('[SW] Badge API not supported:', error);
  }
}

async function clearBadge() {
  try {
    if ('clearAppBadge' in navigator) {
      await navigator.clearAppBadge();
      console.log('[SW] Badge cleared');
    }
  } catch (error) {
    console.warn('[SW] Badge API not supported:', error);
  }
}

async function refreshBadge() {
  try {
    const response = await fetch('/api/pending');
    const data = await response.json();
    const count = data.count || 0;
    await updateBadge(count);
    return count;
  } catch (error) {
    console.warn('[SW] Failed to refresh badge:', error);
  }
}

// Periodic background sync for badge updates (when supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-badge') {
    event.waitUntil(refreshBadge());
  }
});
