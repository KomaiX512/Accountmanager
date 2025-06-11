// Service Worker for Facebook Account Manager
// Based on: https://medium.com/@farmaan30327/implementing-web-push-notifications-in-nextjs-c4b3b4b3a5a5

self.addEventListener("push", (event) => {
  const data = event.data.json();
  const title = data.title;
  const body = data.body;
  const icon = data.icon || "/favicon.ico";
  const url = data.data.url || "/";
  const platform = data.platform || "instagram";

  // Facebook-specific notification styling
  let badge = "/favicon.ico";
  let backgroundColor = "#1a1a3a";
  
  if (platform === "facebook") {
    badge = "/facebook-badge.png";
    backgroundColor = "#1877f2";
  } else if (platform === "instagram") {
    badge = "/instagram-badge.png";
    backgroundColor = "#E4405F";
  } else if (platform === "twitter") {
    badge = "/twitter-badge.png";
    backgroundColor = "#1DA1F2";
  }

  const notificationOptions = {
    body: body,
    tag: `${platform}-notification`, // Unique tag per platform
    icon: icon,
    badge: badge,
    backgroundColor: backgroundColor,
    data: {
      url: url,
      platform: platform,
      timestamp: Date.now()
    },
    actions: [
      {
        action: "reply",
        title: "Reply",
        icon: "/reply-icon.png"
      },
      {
        action: "view",
        title: "View",
        icon: "/view-icon.png"
      }
    ],
    silent: false,
    requireInteraction: true,
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(title, notificationOptions)
  );
});

// Handle notification click events
self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const action = event.action;
  const platform = notification.data.platform;
  const url = notification.data.url;

  notification.close();

  if (action === "reply") {
    // Open reply interface
    event.waitUntil(
      clients.openWindow(`${url}?action=reply&platform=${platform}`)
    );
  } else if (action === "view" || !action) {
    // Open the main dashboard
    event.waitUntil(
      clients.matchAll({ type: "window" }).then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});

// Handle notification close events
self.addEventListener("notificationclose", (event) => {
  console.log("Notification closed:", event.notification.data);
  
  // Track notification dismissal for analytics
  const platform = event.notification.data.platform;
  self.registration.sync?.register(`notification-dismissed-${platform}`);
});

// Background sync for offline functionality
self.addEventListener("sync", (event) => {
  if (event.tag.startsWith("notification-dismissed")) {
    event.waitUntil(
      // Send analytics data when back online
      fetch("/api/analytics/notification-dismissed", {
        method: "POST",
        body: JSON.stringify({
          platform: event.tag.split("-")[2],
          timestamp: Date.now()
        })
      }).catch(() => {
        // Ignore errors for analytics
      })
    );
  }
});

// Install and activate events
self.addEventListener("install", (event) => {
  console.log("Facebook Account Manager Service Worker installed");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Facebook Account Manager Service Worker activated");
  event.waitUntil(clients.claim());
}); 