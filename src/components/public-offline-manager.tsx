"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "mkv", "avi"]);

type PublicOfflineManagerProps = {
  assets: string[];
  homebookId?: string;
  enabled?: boolean;
};

function normalizeUrl(raw: string) {
  try {
    return new URL(raw, window.location.origin).toString();
  } catch {
    return null;
  }
}

function isVideoUrl(url: string) {
  const clean = url.split("?")[0] || "";
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.has(ext);
}

function formatTimestamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function PublicOfflineManager({ assets, homebookId, enabled = true }: PublicOfflineManagerProps) {
  const [isOffline, setIsOffline] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const syncKey = homebookId ? `homebook:offline:lastSync:${homebookId}` : "homebook:offline:lastSync";

  const assetList = useMemo(() => {
    const set = new Set<string>();
    assets.forEach((raw) => {
      if (!raw) return;
      const normalized = normalizeUrl(raw);
      if (!normalized || isVideoUrl(normalized)) return;
      set.add(normalized);
    });
    if (typeof window !== "undefined") {
      const pageUrl = window.location.href.split("#")[0];
      if (pageUrl) {
        const normalizedPage = normalizeUrl(pageUrl);
        if (normalizedPage) {
          set.add(normalizedPage);
        }
      }
      if (enabled) {
        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .map((node) => node instanceof HTMLLinkElement ? node.href : "")
          .filter(Boolean);
        const scripts = Array.from(document.querySelectorAll("script[src]"))
          .map((node) => node instanceof HTMLScriptElement ? node.src : "")
          .filter(Boolean);
        [...styles, ...scripts].forEach((raw) => {
          const normalized = normalizeUrl(raw);
          if (normalized) set.add(normalized);
        });
      }
    }
    return Array.from(set);
  }, [assets, enabled]);

  useEffect(() => {
    const updateStatus = () => {
      setIsOffline(!navigator.onLine);
      setLastSync(localStorage.getItem(syncKey));
    };
    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, [syncKey]);

  const getWorker = useCallback(async (ensureRegistered: boolean) => {
    if (!("serviceWorker" in navigator)) return null;
    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration && ensureRegistered) {
      registration = await navigator.serviceWorker.register("/sw.js");
    }
    if (!registration) return null;
    if (registration.active) return registration.active;
    if (!ensureRegistered) return null;
    const ready = await navigator.serviceWorker.ready;
    return ready.active ?? null;
  }, []);

  const sendMessage = useCallback(async (payload: any, ensureRegistered: boolean) => {
    const worker = await getWorker(ensureRegistered);
    if (!worker) return null;
    return new Promise<any>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => resolve(event.data ?? {});
      worker.postMessage(payload, [channel.port2]);
    });
  }, [getWorker]);

  const precacheAssets = useCallback(async () => {
    if (!enabled) return;
    if (!navigator.onLine || assetList.length === 0) return;
    const result = await sendMessage(
      {
        type: "PRECACHE_URLS",
        urls: assetList,
        maxFileBytes: MAX_FILE_BYTES,
        maxTotalBytes: MAX_TOTAL_BYTES
      },
      true
    );
    if ((result?.cached ?? 0) >= 0) {
      const now = new Date().toISOString();
      localStorage.setItem(syncKey, now);
      setLastSync(now);
    }
  }, [assetList, enabled, sendMessage, syncKey]);

  useEffect(() => {
    if (enabled) return;
    localStorage.removeItem(syncKey);
    setLastSync(null);
    if (assetList.length === 0) return;
    const run = async () => {
      await sendMessage(
        {
          type: "CLEAR_CACHED_URLS",
          urls: assetList
        },
        false
      );
    };
    run();
  }, [assetList, enabled, sendMessage, syncKey]);

  useEffect(() => {
    if (!enabled) return;
    let isCancelled = false;
    const run = async () => {
      try {
        await precacheAssets();
      } catch {
        if (isCancelled) return;
      }
    };
    run();
    window.addEventListener("online", precacheAssets);
    return () => {
      isCancelled = true;
      window.removeEventListener("online", precacheAssets);
    };
  }, [enabled, precacheAssets]);

  if (!enabled || !isOffline) return null;
  const formatted = formatTimestamp(lastSync);
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <span className="offline-banner__title">Modalità offline</span>
      <span className="offline-banner__meta">
        {formatted ? `Ultima sincronizzazione: ${formatted}` : "Ultima sincronizzazione non disponibile"}
      </span>
    </div>
  );
}
