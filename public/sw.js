const VERSION = "v11";
const SHELL_CACHE = `homebook-shell-${VERSION}`;
const ASSET_CACHE = `homebook-assets-${VERSION}`;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const FALLBACK_BYTES = 512 * 1024;
const ALLOWLIST_KEY = "/__offline_allowlist__";

const ATTACHMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "txt",
  "rtf",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "zip"
]);

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "mkv", "avi"]);

let allowlist = new Set();
let allowlistLoaded = false;

async function loadAllowlist() {
  const cache = await caches.open(SHELL_CACHE);
  const response = await cache.match(ALLOWLIST_KEY);
  if (!response) {
    allowlist = new Set();
    return;
  }
  try {
    const payload = await response.json();
    const urls = Array.isArray(payload?.urls) ? payload.urls : [];
    allowlist = new Set(urls.filter(Boolean));
  } catch {
    allowlist = new Set();
  }
}

async function saveAllowlist() {
  const cache = await caches.open(SHELL_CACHE);
  const body = JSON.stringify({ urls: Array.from(allowlist) });
  await cache.put(
    ALLOWLIST_KEY,
    new Response(body, {
      headers: {
        "Content-Type": "application/json"
      }
    })
  );
}

async function ensureAllowlistLoaded() {
  if (allowlistLoaded) return;
  await loadAllowlist();
  allowlistLoaded = true;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(["/offline.html"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("homebook-") && key !== SHELL_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key))
      );
      await loadAllowlist();
      allowlistLoaded = true;
    })()
  );
  self.clients.claim();
});

function getExtension(url) {
  const clean = url.split("?")[0] || "";
  const parts = clean.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function isVideoRequest(request) {
  if (request.destination === "video") return true;
  const ext = getExtension(request.url);
  return VIDEO_EXTENSIONS.has(ext);
}

function isAttachmentRequest(request) {
  const ext = getExtension(request.url);
  return ATTACHMENT_EXTENSIONS.has(ext);
}

function estimateSize(response) {
  const length = response.headers.get("content-length");
  if (length) {
    const parsed = Number.parseInt(length, 10);
    return Number.isNaN(parsed) ? FALLBACK_BYTES : parsed;
  }
  return FALLBACK_BYTES;
}

async function getCacheUsage(cache) {
  const keys = await cache.keys();
  let total = 0;
  for (const request of keys) {
    const response = await cache.match(request);
    if (!response) continue;
    total += estimateSize(response);
  }
  return total;
}

async function cacheResponse(cache, request, response) {
  if (!response || !response.ok) return false;
  const size = estimateSize(response);
  if (size > MAX_FILE_BYTES) return false;
  const current = await getCacheUsage(cache);
  if (current + size > MAX_TOTAL_BYTES) return false;
  await cache.put(request, response.clone());
  return true;
}

async function handleNavigation(request) {
  await ensureAllowlistLoaded();
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok && allowlist.has(request.url)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (allowlist.has(request.url)) {
      const cached = await cache.match(request);
      return cached || cache.match("/offline.html");
    }
    return cache.match("/offline.html");
  }
}

async function handleAsset(request) {
  await ensureAllowlistLoaded();
  const cache = await caches.open(ASSET_CACHE);
  if (!allowlist.has(request.url)) {
    return fetch(request);
  }
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isVideoRequest(request)) {
    return response;
  }
  await cacheResponse(cache, request, response);
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  const url = new URL(request.url);
  const isStorageAsset = url.pathname.includes("/storage/v1/object/public/");
  const shouldHandle =
    request.destination === "image" ||
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font" ||
    isStorageAsset ||
    isAttachmentRequest(request);

  if (shouldHandle) {
    event.respondWith(handleAsset(request));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "PRECACHE_URLS" || !Array.isArray(data.urls)) return;
  const port = event.ports && event.ports[0];
  event.waitUntil(
    (async () => {
      await ensureAllowlistLoaded();
      const cache = await caches.open(ASSET_CACHE);
      let cachedCount = 0;
      let skipped = 0;
      const urls = data.urls;
      urls.forEach((url) => {
        if (url) allowlist.add(url);
      });
      await saveAllowlist();
      for (const url of urls) {
        try {
          const request = new Request(url, { mode: "cors", credentials: "omit" });
          const exists = await cache.match(request);
          if (exists) continue;
          const response = await fetch(request);
          if (!response || !response.ok || isVideoRequest(request)) {
            skipped += 1;
            continue;
          }
          const cached = await cacheResponse(cache, request, response);
          cached ? cachedCount += 1 : skipped += 1;
        } catch {
          skipped += 1;
        }
      }
      if (port) {
        port.postMessage({ cached: cachedCount, skipped });
      }
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "CLEAR_CACHED_URLS" || !Array.isArray(data.urls)) return;
  const port = event.ports && event.ports[0];
  event.waitUntil(
    (async () => {
      await ensureAllowlistLoaded();
      const assetCache = await caches.open(ASSET_CACHE);
      const shellCache = await caches.open(SHELL_CACHE);
      let cleared = 0;
      for (const url of data.urls) {
        if (!url) continue;
        allowlist.delete(url);
        const assetMatch = await assetCache.match(url);
        if (assetMatch) {
          await assetCache.delete(url);
          cleared += 1;
        }
        const shellMatch = await shellCache.match(url);
        if (shellMatch) {
          await shellCache.delete(url);
        }
      }
      await saveAllowlist();
      if (port) {
        port.postMessage({ cleared });
      }
    })()
  );
});
