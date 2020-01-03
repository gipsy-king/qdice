var CACHE = "cache2";

// INSTALL

self.addEventListener("install", function(evt) {
  evt.waitUntil(preCache());
});
self.addEventListener("activate", function(event) {
  event.waitUntil(self.clients.claim());
});

// PUSH
function getEndpoint() {
  // TODO what is the purpose of this?
  return self.registration.pushManager
    .getSubscription()
    .then(function(subscription) {
      if (subscription) {
        return subscription.endpoint;
      }

      throw new Error("User not subscribed");
    });
}

/**
 * Try to only show the last push as a notification.
 * Otherwise user might get like 10 notifications at the same time,
 * e.g. when he reconnects or the browser does its SW throttling magic.
 */
var queue = [];
function pushQueue(json) {
  return new Promise(function(resolve) {
    queue.push(json);
    setTimeout(resolve, 1000);
  }).then(function() {
    var json = queue.pop();
    if (json) {
      self.registration.showNotification(json.text, {
        icon: "https://qdice.wtf/favicons-2/android-chrome-512x512.png",
        badge: "https://qdice.wtf/assets/monochrome.png",
        vibrate: [50, 100, 50],
        data: json,
      });
      queue = [];
    }
  });
}

self.addEventListener("push", function(event) {
  var json = JSON.parse(event.data.text());
  event.waitUntil(pushQueue(json));
});

// CACHE

function preCache() {
  return caches
    .open(CACHE)
    .then(function(cache) {
      return fetch("mapnames.json")
        .then(function(response) {
          return response.json();
        })
        .then(function(maps) {
          var files = maps
            .concat([
              "./die.svg",
              "./iconfont/MaterialIcons-Regular.woff2",
              "./fonts/rubik-v7-latin-regular.woff2",
              "./fonts/rubik-v7-latin-500.woff2",
            ])
            .concat(
              [
                "kick",
                "start",
                "finish",
                "turn",
                "diceroll",
                "rollSuccess",
                "rollDefeat",
              ].map(function(name) {
                return "./sounds/" + name + ".ogg";
              })
            );
          return cache.addAll(files);
        });
    })
    .then(function() {
      return self.skipWaiting();
    });
}

self.addEventListener("fetch_DISABLED", function(event) {
  var result = event.request.url.match(
    new RegExp("^https?://[^/]+/([^/]+)/?(.*)$")
  );
  if (result === null) {
    fetchFirst(event.request, 500);
    return;
  }

  var matches = result ? Array.prototype.slice.call(result, 1) : null;
  if (matches && matches[1] === "" && matches[0].indexOf(".") === -1) {
    event.respondWith(
      fetchFirst(event.request, 500).catch(function() {
        return fromCache(evt.request);
      })
    );
  } else {
    event.respondWith(cacheFirst(event.request));
  }

  var basePath = matches ? matches[0] : undefined;
  if (["api", "mqtt", "ackee"].indexOf(basePath) === -1) {
    event.waitUntil(update(event.request));
  }
});

function fetchFirst(request, timeout) {
  return new Promise(function(fulfill, reject) {
    var timeoutId = setTimeout(reject, timeout);
    fetch(request).then(function(response) {
      clearTimeout(timeoutId);
      fulfill(response);
    }, reject);
  });
}

function cacheFirst(request) {
  return caches.match(request).then(function(response) {
    if (response) {
      return response;
    }
    return fetch(request);
  });
}

function update(request) {
  return caches.open(CACHE).then(function(cache) {
    return fetch(request).then(function(response) {
      return cache.put(request, response);
    });
  });
}

// NOTIFICATIONS

self.onnotificationclick = function(event) {
  console.log("On notification click: ", event.notification.tag);
  event.notification.close();

  // This looks to see if the current is already open and
  // focuses if it is
  event.waitUntil(
    clients
      .matchAll({
        type: "window",
      })
      .then(function(clientList) {
        var url = event.notification.data ? event.notification.data.link : null;
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if ("focus" in client) {
            client.focus();
            if (url) {
              client.navigate(url);
            }
            return;
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url || "/");
        }
      })
  );
};
