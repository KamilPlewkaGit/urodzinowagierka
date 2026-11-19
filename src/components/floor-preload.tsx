"use client";

import { useEffect, useRef, useState } from "react";
import type { TheFloorPreloadManifest, TheFloorPreloadStatus } from "@/lib/types";

const endpoint = "/api/segment/floor/preload";
const heartbeatMs = 6_000;
const parallelImages = 4;
let browserDeviceId: string | undefined;

type FloorPreload = {
  deviceId?: string;
  manifest?: TheFloorPreloadManifest;
  decoded: number;
  failed: string[];
  error: string;
  connected?: TheFloorPreloadStatus;
  confirmed?: boolean;
};

const initial: FloorPreload = { decoded: 0, failed: [], error: "" };

function makeDeviceId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

async function decodeImage(url: string, signal: AbortSignal) {
  const image = new Image();
  const cancel = () => image.removeAttribute("src");
  const timeout = window.setTimeout(cancel, 15_000);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    image.decoding = "async";
    image.src = url;
    await image.decode();
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}

export function useFloorPreload(active: boolean, showConnected = false) {
  const [state, setState] = useState<FloorPreload>(initial);
  const retry = useRef<() => void>(() => {});

  useEffect(() => {
    if (!active && showConnected) return;
    const deviceId = browserDeviceId ??= makeDeviceId();
    const controller = new AbortController();
    const { signal } = controller;
    const decoded = new Set<string>();
    const failed = new Set<string>();
    let manifest: TheFloorPreloadManifest | undefined;
    let reporting = false;
    let reportAgain = false;
    let loading = false;
    let loadError = "";
    let reportError = "";
    let connected: TheFloorPreloadStatus | undefined;
    let confirmed = false;

    function publish() {
      if (signal.aborted || !active) return;
      setState({ deviceId, manifest, decoded: decoded.size, failed: [...failed], error: loadError || reportError, connected, confirmed });
    }

    async function report() {
      if (signal.aborted) return;
      if (reporting) { reportAgain = true; return; }
      reporting = true;
      try {
        const version = manifest?.version ?? null;
        const count = decoded.size;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, version, decoded: count, failed: [...failed].slice(0, 256) }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
        });
        if (response.status === 409 && active) {
          manifest = undefined;
          confirmed = false;
          decoded.clear();
          failed.clear();
          loadError = "Materiały The Floor zostały odświeżone. Ponów wczytywanie.";
          void load();
          return;
        }
        if (!response.ok) throw new Error();
        const status = await response.json() as TheFloorPreloadStatus;
        reportError = "";
        confirmed = version !== null && version === manifest?.version && count === manifest.urls.length;
        if (showConnected) connected = status;
      } catch {
        reportError = "Nie udało się zsynchronizować wczytywania zdjęć. Ponawiamy próbę.";
        connected = undefined;
      } finally {
        reporting = false;
        publish();
        if (reportAgain) { reportAgain = false; void report(); }
      }
    }

    async function load() {
      if (!active || loading || signal.aborted) return;
      loading = true;
      loadError = "";
      try {
        if (!manifest) {
          const response = await fetch(endpoint, {
            cache: "no-store",
            signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
          });
          if (!response.ok) throw new Error();
          manifest = await response.json() as TheFloorPreloadManifest;
        }
        const urls = manifest.urls.filter((url) => !decoded.has(url));
        let index = 0;
        publish();
        await Promise.all(Array.from({ length: Math.min(parallelImages, urls.length) }, async () => {
          while (!signal.aborted && index < urls.length) {
            const url = urls[index++];
            try {
              await decodeImage(url, signal);
              decoded.add(url);
              failed.delete(url);
            } catch {
              failed.add(url);
            }
            publish();
          }
        }));
      } catch {
        loadError = "Nie udało się pobrać listy zdjęć The Floor.";
      } finally {
        loading = false;
        publish();
        void report();
      }
    }

    retry.current = () => void load();
    publish();
    void report();
    void load();
    const heartbeat = window.setInterval(() => {
      void report();
      if (!manifest || failed.size) void load();
    }, heartbeatMs);

    return () => {
      controller.abort();
      window.clearInterval(heartbeat);
      retry.current = () => {};
    };
  }, [active, showConnected]);

  const total = state.manifest?.urls.length;
  const localReady = total !== undefined && state.decoded === total && !state.manifest?.issues.length;
  const ready = localReady && state.confirmed && !state.error &&
    Boolean(state.connected && state.connected.readyDevices === state.connected.devices);
  return { ...state, total, localReady, ready, retry: () => retry.current() };
}

export function FloorPreloadProgress({ preload, admin = false }: { preload: ReturnType<typeof useFloorPreload>; admin?: boolean }) {
  const { connected, decoded, error, failed, localReady, manifest, ready, retry, total } = preload;
  if (!admin && localReady && !error) return null;
  const failedAssets = [...new Set([...failed, ...(connected?.failedAssets ?? [])])];
  return (
    <div className="floor-preload">
      {admin && ready ? <p className="form-success" role="status">Wszystkie zdjęcia zostały wczytane. Możesz rozpocząć grę!</p>
        : <p role="status">Wczytywanie zdjęć The Floor...</p>}
      {total !== undefined && !ready && <p>Zdjęcia: {decoded} / {total} · {total ? Math.floor(decoded * 100 / total) : 100}%</p>}
      {admin && connected && <>
        <p>Gotowi gracze: {connected.readyPlayers} / {connected.players} · Wczytują: {connected.players - connected.readyPlayers}</p>
        {connected.devices !== connected.players && <p>Gotowe urządzenia graczy: {connected.readyDevices} / {connected.devices}</p>}
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {admin && manifest?.issues.map((issue) => <p className="form-error" key={issue}>{issue}</p>)}
      {!admin && Boolean(manifest?.issues.length) && <p className="form-error">Prowadzący musi poprawić materiały The Floor.</p>}
      {failedAssets.map((url) => <p className="form-error" key={url}>Nie udało się wczytać: {manifest?.labels[url] ?? url}</p>)}
      {(error || failed.length > 0) && <button type="button" className="secondary-button" onClick={retry}>Ponów wczytywanie</button>}
    </div>
  );
}
