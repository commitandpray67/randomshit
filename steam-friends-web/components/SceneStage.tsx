"use client";

import { useEffect, useRef, useState } from "react";
import { ElementBox, type RElement } from "./SceneRenderer";

/**
 * Live scene for the OBS browser source.
 *
 * Updates arrive over SSE, so an edit shows up in a fraction of a second
 * instead of waiting out a poll. Between updates each element eases to its new
 * transform, which is what turns a handful of positions per second into motion
 * that reads as smooth at the display's refresh rate — the compositor
 * interpolates on the GPU, so there's no cost per element.
 *
 * If SSE can't be established (a proxy that buffers streams, a corporate
 * middlebox), it falls back to the original polling loop rather than showing a
 * frozen scene.
 */
export default function SceneStage({
  sceneKey,
  initialVersion,
  initialCanvas,
  initialElements,
}: {
  sceneKey: string;
  initialVersion: number;
  initialCanvas: { w: number; h: number };
  initialElements: RElement[];
}) {
  const [canvas, setCanvas] = useState(initialCanvas);
  const [elements, setElements] = useState<RElement[]>(initialElements);
  const [scale, setScale] = useState(1);
  const [smoothMs, setSmoothMs] = useState(0);
  const version = useRef(initialVersion);

  // Fit the canvas to the browser source, preserving aspect ratio.
  useEffect(() => {
    const fit = () => {
      const sx = window.innerWidth / canvas.w;
      const sy = window.innerHeight / canvas.h;
      setScale(Math.min(sx, sy) || 1);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [canvas.w, canvas.h]);

  useEffect(() => {
    let stopped = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let reopenTimer: ReturnType<typeof setTimeout> | undefined;
    let sseFailures = 0;
    let gotAnyMessage = false;

    const apply = (data: any) => {
      if (stopped || !data) return;
      if (typeof data.version === "number") version.current = data.version;
      if (data.canvas) setCanvas(data.canvas);
      if (Array.isArray(data.elements)) setElements(data.elements);
    };

    // ---- fallback: the original polling loop -----------------------------
    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/scene/${sceneKey}?v=${version.current}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && !data.unchanged) apply(data);
        }
      } catch {
        /* keep polling */
      }
      if (!stopped) pollTimer = setTimeout(poll, 1000);
    };

    const startPolling = () => {
      if (stopped || pollTimer) return;
      setSmoothMs(1000);
      pollTimer = setTimeout(poll, 500);
    };

    // ---- primary: SSE ----------------------------------------------------
    const openStream = () => {
      if (stopped) return;
      try {
        es = new EventSource(`/api/scene/${sceneKey}/stream?v=${version.current}`);
      } catch {
        startPolling();
        return;
      }

      es.addEventListener("hello", (ev) => {
        gotAnyMessage = true;
        sseFailures = 0;
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          // Ease over slightly longer than the update interval so motion stays
          // continuous even if one update is a touch late.
          if (typeof d.smoothMs === "number") setSmoothMs(Math.round(d.smoothMs * 1.6));
        } catch {
          setSmoothMs(200);
        }
      });

      es.addEventListener("scene", (ev) => {
        gotAnyMessage = true;
        try {
          apply(JSON.parse((ev as MessageEvent).data));
        } catch {
          /* ignore a malformed frame */
        }
      });

      // The server closes near the platform's duration cap and expects us back.
      es.addEventListener("bye", () => {
        es?.close();
        es = null;
        if (!stopped) reopenTimer = setTimeout(openStream, 50);
      });

      es.onerror = () => {
        es?.close();
        es = null;
        if (stopped) return;
        // A stream that never delivered anything suggests SSE is being blocked
        // or buffered somewhere in between — stop trying and poll instead.
        sseFailures++;
        if (!gotAnyMessage && sseFailures >= 3) {
          startPolling();
          return;
        }
        reopenTimer = setTimeout(openStream, Math.min(sseFailures, 5) * 500);
      };
    };

    openStream();

    return () => {
      stopped = true;
      es?.close();
      clearTimeout(pollTimer);
      clearTimeout(reopenTimer);
    };
  }, [sceneKey]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          width: canvas.w,
          height: canvas.h,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flex: "none",
        }}
      >
        {elements.map((el) => (
          <ElementBox key={el.id} el={el} smoothMs={smoothMs} />
        ))}
      </div>
    </div>
  );
}
