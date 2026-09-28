"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ElementBox, type RElement } from "./SceneRenderer";
import { MotionBuffer, applyMotion, motionOf, type Motion } from "./sceneMotion";

/**
 * Live scene for the OBS browser source.
 *
 * Two things happen here, and they are deliberately separate. React owns the
 * *shape* of the scene — which elements exist, their kind, their content — and
 * re-renders only when that actually changes. Everything that moves is driven
 * by a requestAnimationFrame loop that writes transforms straight to the DOM
 * out of a motion buffer, so dragging an element re-renders nothing at all.
 *
 * That split is the point. The scene used to re-render every element on every
 * update and hand the result to a fixed-length CSS transition; in OBS's
 * off-screen renderer both of those land on the main thread at exactly the
 * moment the next frame needed to be composited. See sceneMotion.ts for why
 * the transition could not have been made smooth at any duration.
 *
 * If SSE can't be established (a proxy that buffers streams, a corporate
 * middlebox), it falls back to the original polling loop rather than showing a
 * frozen scene. The buffer doesn't care which is feeding it — it adapts to
 * whatever cadence it actually sees.
 */

/**
 * Everything about an element except where it is. Re-render on this changing,
 * and only on this: position, size, rotation and opacity are the animated
 * fields, and they belong to the frame loop.
 */
function shapeOf(els: RElement[]): string {
  return els
    .map((e) => `${e.id}${e.kind}${e.zIndex}${e.clip ?? ""}${JSON.stringify(e.props)}`)
    .join("");
}

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

  const buffer = useMemo(() => new MotionBuffer(), []);
  const nodes = useRef(new Map<number, HTMLElement>());
  const written = useRef(new Map<number, Motion>());
  const shape = useRef(shapeOf(initialElements));

  // Seed the buffer during render rather than in an effect: the ref callbacks
  // below run before the first paint and need something to write, or every
  // element flashes at the canvas origin for a frame.
  const seeded = useRef(false);
  if (!seeded.current) {
    seeded.current = true;
    buffer.replace(initialElements.map((e) => [e.id, motionOf(e)] as [number, Motion]));
  }

  /**
   * Place a node the moment it exists, then leave it to the frame loop.
   *
   * Cached per element: React detaches and reattaches a ref whose callback
   * identity changed, so a fresh closure each render would throw away what was
   * written and re-apply it on every re-render.
   */
  const refs = useRef(new Map<number, (node: HTMLElement | null) => void>());
  const register = useCallback(
    (id: number) => {
      let cb = refs.current.get(id);
      if (!cb) {
        cb = (node: HTMLElement | null) => {
          if (!node) {
            nodes.current.delete(id);
            written.current.delete(id);
            return;
          }
          nodes.current.set(id, node);
          const m = buffer.latestOf(id);
          if (m) applyMotion(node, id, m, written.current);
        };
        refs.current.set(id, cb);
      }
      return cb;
    },
    [buffer],
  );

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

  // ---- the frame loop ---------------------------------------------------
  useEffect(() => {
    let raf = 0;
    let prev = performance.now();

    const write = (id: number, m: Motion) => {
      const node = nodes.current.get(id);
      if (node) applyMotion(node, id, m, written.current);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // Clamped: OBS stops calling rAF for a source that isn't being rendered,
      // and the first frame back would otherwise advance the playback clock by
      // however long the source was away.
      const dt = Math.min(100, now - prev);
      prev = now;
      const t = buffer.advance(dt);
      if (t !== null) buffer.sample(t, write);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [buffer]);

  // ---- the feed ---------------------------------------------------------
  useEffect(() => {
    let stopped = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let reopenTimer: ReturnType<typeof setTimeout> | undefined;
    let sseFailures = 0;
    let gotAnyMessage = false;

    /** A whole scene: shape into React, motion into the buffer. */
    const applyScene = (data: any) => {
      if (stopped || !data) return;
      if (typeof data.version === "number") version.current = data.version;
      if (data.canvas) {
        setCanvas((c) => (c.w === data.canvas.w && c.h === data.canvas.h ? c : data.canvas));
      }
      if (!Array.isArray(data.elements)) return;

      const els = data.elements as RElement[];
      buffer.replace(els.map((e) => [e.id, motionOf(e)] as [number, Motion]));

      // On the polling fallback every reply is a full scene even when only a
      // position moved, so this guard is what stops a drag re-rendering the
      // whole tree once a second.
      const next = shapeOf(els);
      if (next !== shape.current) {
        shape.current = next;
        setElements(els);
      }
    };

    /**
     * A movement, complete in the payload: [id, x, y, w, h, rotation]. Or no
     * movement at all, just the version the database has caught up to — the
     * studio's own server sends movements ahead of the database, and then
     * this, so a reconnect knows it's current.
     */
    const applyMovement = (data: any) => {
      if (stopped || !data) return;
      // Versions are handed out in commit order, so one going backwards means
      // a stale frame — a reconnection replaying, most likely. Applying it
      // would drag the element back to where it used to be.
      if (typeof data.v === "number") {
        if (data.v <= version.current) return;
        version.current = data.v;
      }
      if (!Array.isArray(data.m)) return;
      const [id, x, y, w, h, rot] = data.m as number[];
      // Opacity only ever changes through the slow path, so carry the last
      // known value forward rather than resetting it.
      const op = buffer.latestOf(id)?.op ?? 1;
      const sentAt = typeof data.ts === "number" ? data.ts : undefined;
      buffer.merge([[id, { x, y, w, h, rot, op }]], performance.now(), sentAt);
    };

    // ---- fallback: the original polling loop ----------------------------
    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/scene/${sceneKey}?v=${version.current}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && !data.unchanged) applyScene(data);
        }
      } catch {
        /* keep polling */
      }
      if (!stopped) pollTimer = setTimeout(poll, 1000);
    };

    const startPolling = () => {
      if (stopped || pollTimer) return;
      pollTimer = setTimeout(poll, 500);
    };

    // ---- primary: SSE ---------------------------------------------------
    const openStream = () => {
      if (stopped) return;
      try {
        es = new EventSource(`/api/scene/${sceneKey}/stream?v=${version.current}`);
      } catch {
        startPolling();
        return;
      }

      es.addEventListener("hello", () => {
        gotAnyMessage = true;
        sseFailures = 0;
      });

      es.addEventListener("scene", (ev) => {
        gotAnyMessage = true;
        try {
          applyScene(JSON.parse((ev as MessageEvent).data));
        } catch {
          /* ignore a malformed frame */
        }
      });

      es.addEventListener("motion", (ev) => {
        gotAnyMessage = true;
        try {
          applyMovement(JSON.parse((ev as MessageEvent).data));
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
  }, [sceneKey, buffer]);

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
          // Clip to the frame. The studio lets elements be parked in the space
          // around the canvas, and an absolutely positioned child outside its
          // parent still paints — so without this, something dropped just off
          // the edge would go out on stream anyway. Clipping happens in the
          // element's own coordinates, before the scale, so it lands exactly on
          // the canvas bounds whatever the browser source is sized to.
          overflow: "hidden",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flex: "none",
        }}
      >
        {elements.map((el) => (
          <ElementBox key={el.id} el={el} managed nodeRef={register(el.id)} />
        ))}
      </div>
    </div>
  );
}
