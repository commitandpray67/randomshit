"use client";

import { useEffect, useRef, useState } from "react";
import { ElementBox, type RElement } from "./SceneRenderer";

/**
 * Live scene for the OBS browser source.
 *
 * Polls the version number and only pulls elements when it changes, so an
 * untouched scene costs almost nothing while the stream runs.
 *
 * The canvas is scaled to fit the browser source, so a 1920x1080 scene still
 * lines up if the source is sized differently.
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
  const version = useRef(initialVersion);

  // Fit the canvas to the window, preserving aspect ratio.
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
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;

    const tick = async () => {
      try {
        const res = await fetch(`/api/scene/${sceneKey}?v=${version.current}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();

        if (!cancelled && data.ok && !data.unchanged) {
          version.current = data.version;
          if (data.canvas) setCanvas(data.canvas);
          if (Array.isArray(data.elements)) setElements(data.elements);
        }
        failures = 0;
      } catch {
        failures++;
      }
      if (cancelled) return;
      // ~1s while healthy so edits show up promptly; back off when the network
      // or a deploy is misbehaving rather than hammering.
      timer = setTimeout(tick, 1000 + Math.min(failures, 5) * 2000);
    };

    timer = setTimeout(tick, 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sceneKey]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        // Centre the scaled canvas inside the source.
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
          <ElementBox key={el.id} el={el} />
        ))}
      </div>
    </div>
  );
}
