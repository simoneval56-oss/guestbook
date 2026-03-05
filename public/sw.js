const VERSION = "v29";
const SHELL_CACHE = `homebook-shell-${VERSION}`;
const ASSET_CACHE = `homebook-assets-${VERSION}`;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const FALLBACK_BYTES = 512 * 1024;
const ALLOWLIST_KEY = "/__offline_allowlist__";
const OFFLINE_TTL_MS = 24 * 60 * 60 * 1000;

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
let cachedAtByUrl = new Map();
let groupsByHomebookId = new Map();
let allowlistLoaded = false;

function parseTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFresh(url) {
  const cachedAt = cachedAtByUrl.get(url);
  if (typeof cachedAt !== "number" || !Number.isFinite(cachedAt)) return false;
  return Date.now() - cachedAt <= OFFLINE_TTL_MS;
}

function markFresh(url) {
  if (!url) return;
  cachedAtByUrl.set(url, Date.now());
}

function clearTrackingForUrls(urls) {
  urls.forEach((url) => {
    allowlist.delete(url);
    cachedAtByUrl.delete(url);
  });
  for (const [homebookId, groupedUrls] of groupsByHomebookId.entries()) {
    urls.forEach((url) => groupedUrls.delete(url));
    if (!groupedUrls.size) {
      groupsByHomebookId.delete(homebookId);
    }
  }
}

function findHomebookIdByUrl(url) {
  for (const [homebookId, groupedUrls] of groupsByHomebookId.entries()) {
    if (groupedUrls.has(url)) return homebookId;
  }
  return null;
}

async function deleteUrlsFromCaches(urls) {
  if (!urls.length) return;
  const shellCache = await caches.open(SHELL_CACHE);
  const assetCache = await caches.open(ASSET_CACHE);
  await Promise.all(
    urls.flatMap((url) => [shellCache.delete(url), assetCache.delete(url)])
  );
}

async function loadAllowlist() {
  const cache = await caches.open(SHELL_CACHE);
  const response = await cache.match(ALLOWLIST_KEY);
  if (!response) {
    allowlist = new Set();
    cachedAtByUrl = new Map();
    groupsByHomebookId = new Map();
    return;
  }
  try {
    const payload = await response.json();
    const urls = Array.isArray(payload?.urls) ? payload.urls : [];
    const rawTimestamps =
      payload?.cachedAt && typeof payload.cachedAt === "object" ? payload.cachedAt : {};
    const rawGroups = payload?.groups && typeof payload.groups === "object" ? payload.groups : {};
    allowlist = new Set(urls.filter(Boolean));
    cachedAtByUrl = new Map();
    Object.entries(rawTimestamps).forEach(([url, rawTimestamp]) => {
      if (!allowlist.has(url)) return;
      const parsed = parseTimestamp(rawTimestamp);
      if (parsed === null) return;
      cachedAtByUrl.set(url, parsed);
    });
    groupsByHomebookId = new Map();
    Object.entries(rawGroups).forEach(([homebookId, rawUrls]) => {
      if (!homebookId || !Array.isArray(rawUrls)) return;
      const filteredUrls = rawUrls.filter((url) => allowlist.has(url));
      if (!filteredUrls.length) return;
      groupsByHomebookId.set(homebookId, new Set(filteredUrls));
    });
  } catch {
    allowlist = new Set();
    cachedAtByUrl = new Map();
    groupsByHomebookId = new Map();
  }
}

async function saveAllowlist() {
  const cache = await caches.open(SHELL_CACHE);
  const cachedAt = {};
  for (const [url, timestamp] of cachedAtByUrl.entries()) {
    if (allowlist.has(url) && Number.isFinite(timestamp)) {
      cachedAt[url] = timestamp;
    }
  }

  const groups = {};
  for (const [homebookId, groupedUrls] of groupsByHomebookId.entries()) {
    const urls = Array.from(groupedUrls).filter((url) => allowlist.has(url));
    if (!urls.length) continue;
    groups[homebookId] = urls;
  }

  const body = JSON.stringify({ urls: Array.from(allowlist), cachedAt, groups });
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
      markFresh(request.url);
      await saveAllowlist();
    }
    if (response && !response.ok && allowlist.has(request.url)) {
      const homebookId = findHomebookIdByUrl(request.url);
      if (homebookId) {
        const groupedUrls = Array.from(groupsByHomebookId.get(homebookId) ?? []);
        clearTrackingForUrls(groupedUrls);
        await deleteUrlsFromCaches(groupedUrls);
      } else {
        clearTrackingForUrls([request.url]);
        await deleteUrlsFromCaches([request.url]);
      }
      await saveAllowlist();
    }
    return response;
  } catch {
    if (allowlist.has(request.url) && isFresh(request.url)) {
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
  if (!isFresh(request.url)) {
    try {
      const response = await fetch(request);
      if (response && response.ok && !isVideoRequest(request)) {
        await cacheResponse(cache, request, response);
        markFresh(request.url);
        await saveAllowlist();
      }
      return response;
    } catch {
      return new Response("", { status: 504, statusText: "offline_cache_expired" });
    }
  }
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isVideoRequest(request)) {
    return response;
  }
  await cacheResponse(cache, request, response);
  markFresh(request.url);
  await saveAllowlist();
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
      const homebookId = typeof data.homebookId === "string" ? data.homebookId.trim() : "";
      const now = Date.now();
      urls.forEach((url) => {
        if (!url) return;
        allowlist.add(url);
        cachedAtByUrl.set(url, now);
      });
      if (homebookId) {
        const groupedUrls = groupsByHomebookId.get(homebookId) ?? new Set();
        urls.forEach((url) => {
          if (!url) return;
          groupedUrls.add(url);
        });
        if (groupedUrls.size) {
          groupsByHomebookId.set(homebookId, groupedUrls);
        }
      }
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
          if (cached) {
            cachedCount += 1;
            markFresh(url);
          } else {
            skipped += 1;
          }
        } catch {
          skipped += 1;
        }
      }
      await saveAllowlist();
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
      const homebookId = typeof data.homebookId === "string" ? data.homebookId.trim() : "";
      const inputUrls = data.urls.filter(Boolean);
      const groupedUrls = homebookId ? Array.from(groupsByHomebookId.get(homebookId) ?? []) : [];
      const urlsToClear = Array.from(new Set([...inputUrls, ...groupedUrls]));
      let cleared = 0;
      if (urlsToClear.length) {
        const assetCache = await caches.open(ASSET_CACHE);
        for (const url of urlsToClear) {
          const assetMatch = await assetCache.match(url);
          if (assetMatch) {
            cleared += 1;
          }
        }
        clearTrackingForUrls(urlsToClear);
        await deleteUrlsFromCaches(urlsToClear);
      }
      await saveAllowlist();
      if (port) {
        port.postMessage({ cleared });
      }
    })()
  );
});
