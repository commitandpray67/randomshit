"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ElementView, type RElement } from "./SceneRenderer";
import EmotePicker from "./EmotePicker";
import { isEmbeddable, videoPaused } from "@/lib/embed";
import StreamBackdrop from "./StreamBackdrop";

type Canvas = { w: number; h: number };

/**
 * What the drag fast path writes. The whole transform goes every time, not
 * just the fields the gesture changed: the browser source is handed this
 * payload verbatim (the server never reads the element back), so it has to be
 * complete on its own.
 */
type Transform = { x: number; y: number; w: number; h: number; rotation: number };

// Which edges a handle moves: -1 = min edge, +1 = max edge, 0 = fixed.
const HANDLES: { name: string; sx: -1 | 0 | 1; sy: -1 | 0 | 1; cursor: string }[] = [
  { name: "nw", sx: -1, sy: -1, cursor: "nwse-resize" },
  { name: "n", sx: 0, sy: -1, cursor: "ns-resize" },
  { name: "ne", sx: 1, sy: -1, cursor: "nesw-resize" },
  { name: "e", sx: 1, sy: 0, cursor: "ew-resize" },
  { name: "se", sx: 1, sy: 1, cursor: "nwse-resize" },
  { name: "s", sx: 0, sy: 1, cursor: "ns-resize" },
  { name: "sw", sx: -1, sy: 1, cursor: "nesw-resize" },
  { name: "w", sx: -1, sy: 0, cursor: "ew-resize" },
];

const MIN_SIZE = 8;

function rot(x: number, y: number, deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

/**
 * Screen pixels of parking space kept around the frame at the default zoom.
 *
 * The canvas used to be fitted to fill the viewport, which left nowhere to put
 * an element you aren't using — dragging it off the frame meant dragging it
 * somewhere you couldn't see or reach. Zooming out a little turns the space
 * around the frame into a shelf.
 */
const PARK = 170;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 2;

export default function StudioEditor({
  initialSceneKey,
  initialCanvas,
  initialElements,
  initialVersion,
  siteUrl,
  previewChannel,
}: {
  initialSceneKey: string;
  initialCanvas: Canvas;
  initialElements: RElement[];
  initialVersion: number;
  siteUrl: string;
  previewChannel: string;
}) {
  const [sceneKey, setSceneKey] = useState(initialSceneKey);
  const [canvas, setCanvas] = useState<Canvas>(initialCanvas);
  const [elements, setElements] = useState<RElement[]>(initialElements);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [scale, setScale] = useState(0.4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmotes, setShowEmotes] = useState(false);
  const [copied, setCopied] = useState(false);
  // Keep tracking the viewport until someone picks a zoom of their own.
  const [autoFit, setAutoFit] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const version = useRef(initialVersion);

  const viewportRef = useRef<HTMLDivElement>(null);
  const selected = elements.find((e) => e.id === selectedId) ?? null;
  // A video whose URL is a YouTube/Vimeo page rather than a media file, so it
  // renders as that site's player and some of the controls below don't apply.
  const embedded = selected?.kind === "video" && isEmbeddable(selected.props.url);

  const sceneUrl = `${siteUrl}/scene/${sceneKey}`;


  /** Zoom at which the frame sits in the middle with parking space round it. */
  const fitScale = useCallback(() => {
    const box = viewportRef.current;
    if (!box) return 0.4;
    const sx = (box.clientWidth - PARK * 2) / canvas.w;
    const sy = (box.clientHeight - PARK * 2) / canvas.h;
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(sx, sy)));
  }, [canvas.w, canvas.h]);

  useEffect(() => {
    const apply = () => {
      if (autoFit) setScale(fitScale());
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [autoFit, fitScale]);

  const zoomBy = (factor: number) => {
    setAutoFit(false);
    setScale((s) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s * factor)));
  };
  const zoomToFit = () => {
    setAutoFit(true);
    setScale(fitScale());
  };

  // The stream channel is a personal working aid, not part of the scene, so it
  // is remembered per browser rather than pushed at the other editors.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("studio:preview");
      setPreview(saved === null ? previewChannel : saved);
    } catch {
      setPreview(previewChannel);
    }
  }, [previewChannel]);

  const setPreviewChannel = (name: string) => {
    setPreview(name);
    try {
      localStorage.setItem("studio:preview", name);
    } catch {
      /* private mode; the preview just won't be remembered */
    }
  };

  // --- local (optimistic) edits, flushed to the server on release ---------
  const patchLocal = useCallback((id: number, patch: Partial<RElement>) => {
    setElements((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  /**
   * Edits to existing elements: one request at a time, newest patch per
   * element coalesced behind it, and the response thrown away.
   *
   * Every keystroke in a text box used to fire its own request, and each
   * response replaced the entire element list with the server's snapshot. Type
   * faster than the round trip and those snapshots arrive stale — every one of
   * them resetting the textarea to a version from several characters ago, and
   * throwing away everything typed since. Typing "Hello Juntella!" reliably
   * stored "Hl Jntla!", on screen and in the database both.
   *
   * Two things fix it, and both are needed. Serialising means the writes
   * commit in the order they were made, so the last one to land is the newest.
   * Ignoring the echo means a reply that was already stale when it was sent
   * can't overwrite what has been typed since — the editor applied the change
   * optimistically and is the authority on its own text.
   */
  const queued = useRef(new Map<number, any>());
  const sending = useRef(false);
  /** The element with an update in flight, and the one under the pointer. */
  const sendingId = useRef<number | null>(null);
  const activeId = useRef<number | null>(null);
  /**
   * The scene version each element was last written at *by this editor*.
   *
   * Being busy with an element isn't enough on its own. Between one write
   * completing and the next keystroke queueing there is a gap, and a snapshot
   * built before that write can land inside it — putting the text back as it
   * was two characters ago, so the next keystrokes carry on from there. That
   * is a dropped letter, and with two people editing it happens constantly.
   * Comparing against the version the write landed at is what closes the gap.
   */
  const wroteAt = useRef(new Map<number, number>());
  const drained = useRef<(() => void)[]>([]);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  /** Later wins per field, but props merge rather than replacing wholesale. */
  const mergePatch = (into: any, next: any) => {
    const out = { ...(into ?? {}), ...next };
    if (into?.props || next?.props) {
      out.props = { ...(into?.props ?? {}), ...(next?.props ?? {}) };
    }
    return out;
  };

  const pumpEdits = useCallback(() => {
    if (sending.current) return;

    const first = queued.current.entries().next();
    if (first.done) {
      setSaving(false);
      setJustSaved(true);
      drained.current.splice(0).forEach((fn) => fn());
      return;
    }

    const [id, patch] = first.value as [number, any];
    queued.current.delete(id);
    sending.current = true;
    sendingId.current = id;
    setSaving(true);
    setJustSaved(false);

    void fetch("/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, patch }),
    })
      .then(async (res) => {
        if (!res.ok) {
          setError(`save failed (${res.status})`);
          return;
        }
        setError(null);
        try {
          const d = await res.json();
          if (typeof d?.version === "number") {
            wroteAt.current.set(id, Math.max(wroteAt.current.get(id) ?? 0, d.version));
          }
        } catch {
          /* the write landed; only the bookkeeping is missing */
        }
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => {
        sending.current = false;
        sendingId.current = null;
        pumpEdits();
      });
  }, []);

  const queueUpdate = useCallback(
    (id: number, patch: any) => {
      queued.current.set(id, mergePatch(queued.current.get(id), patch));
      setSaving(true);
      pumpEdits();
    },
    [pumpEdits],
  );

  /**
   * Whether this editor is mid-change on an element, and so should keep its own
   * copy rather than take one from the stream.
   *
   * Three people share one canvas, so everything anyone does arrives here as an
   * update — including the echo of this editor's own writes. Adopting those
   * blindly would yank an element out from under the pointer mid-drag, or
   * reset a text box to the version that was on the server two keystrokes ago.
   * The rule is the same one the save queue uses: whoever is actively changing
   * something is the authority on it until they stop.
   */
  const busyWith = useCallback(
    (id: number) => activeId.current === id || sendingId.current === id || queued.current.has(id),
    [],
  );

  /** Adopt someone else's version of the scene, keeping whatever is in hand. */
  const mergeRemote = useCallback(
    (incoming: RElement[], version = Number.MAX_SAFE_INTEGER) => {
      setElements((prev) => {
        const local = new Map(prev.map((e) => [e.id, e]));
        // The incoming list decides which elements exist — that is how another
        // editor's add or delete arrives — while each element's contents come
        // from whoever changed it most recently.
        return incoming.map((r) => {
          const stale = (wroteAt.current.get(r.id) ?? 0) > version;
          return busyWith(r.id) || stale ? (local.get(r.id) ?? r) : r;
        });
      });
    },
    [busyWith],
  );

  /** Resolves once everything queued has been written. */
  const drainUpdates = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (!sending.current && queued.current.size === 0) return resolve();
        drained.current.push(resolve);
      }),
    [],
  );

  /**
   * Call the mutation API and adopt the returned state.
   *
   * For structural changes only — adding, deleting, reordering, resizing the
   * canvas — where the server decides something the editor can't know, like a
   * new element's id or the z-order after a shuffle. Edits to an element that
   * already exists go through `queueUpdate` instead and deliberately ignore
   * what comes back; see the note there.
   */
  const call = useCallback(async (payload: any) => {
    // Any queued edits have to land first, or the element list echoed back
    // here would be from before them and would undo them on arrival.
    await drainUpdates();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data?.error ?? `request failed (${res.status})`);
        return null;
      }
      if (data.elements) mergeRemote(data.elements);
      if (data.canvas) setCanvas(data.canvas);
      if (data.sceneKey) setSceneKey(data.sceneKey);
      return data;
    } catch (e: any) {
      setError(String(e?.message ?? e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [mergeRemote, drainUpdates]);

  // Closing the tab mid-word would otherwise drop whatever hadn't been sent
  // yet. A beacon outlives the page; a fetch at this point does not.
  useEffect(() => {
    const flush = () => {
      for (const [id, patch] of queued.current) {
        try {
          navigator.sendBeacon?.(
            "/api/studio",
            new Blob([JSON.stringify({ action: "update", id, patch })], {
              type: "application/json",
            }),
          );
        } catch {
          /* nothing useful to do while the page is going away */
        }
      }
      queued.current.clear();
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  // Let "saved" fade rather than sit there claiming credit forever.
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 1600);
    return () => clearTimeout(t);
  }, [justSaved]);

  /**
   * Floor on how often a drag may push. There is no ceiling: the next push
   * goes out when the last one comes back, which paces the drag to whatever
   * the connection is actually doing rather than to a guess made here.
   */
  const DRAG_MIN_MS = 33;

  // One request at a time, and only the newest position per element waiting
  // behind it.
  //
  // These used to be fired off as fast as the pointer produced them, and that
  // is its own source of stutter: two overlapping requests commit in whatever
  // order the platform gets to them, so a position from 60ms ago can land
  // *after* the current one and the browser source jerks backwards. Nothing
  // downstream can repair that — the database genuinely holds the older
  // position, and it was the last thing written. Serialising is what makes the
  // order the cursor moved in the order everything else sees.
  const inFlight = useRef(false);
  const pending = useRef(new Map<number, Transform>());
  const lastSent = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pump = useCallback(() => {
    if (inFlight.current || pending.current.size === 0) return;

    const wait = DRAG_MIN_MS - (Date.now() - lastSent.current);
    if (wait > 0) {
      if (!timer.current) {
        timer.current = setTimeout(() => {
          timer.current = null;
          pump();
        }, wait);
      }
      return;
    }

    const [id, t] = pending.current.entries().next().value as [number, Transform];
    pending.current.delete(id);
    inFlight.current = true;
    lastSent.current = Date.now();

    // Positions during a drag are throwaway: the next one supersedes this one,
    // so a failure needs no retry and no busy state. Going through `call`
    // would re-render the whole editor on every push.
    void fetch("/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `ts` rides along untouched to the browser source, which spaces its
      // playback by it. Without it the overlay can only go on when each
      // position *arrived*, and renders the network's jitter as the element
      // speeding up and slowing down.
      body: JSON.stringify({ action: "transform", id, t, ts: Math.round(performance.now()) }),
    })
      .then(async (res) => {
        // Noted for the same reason a text edit is: it marks everything
        // published before this point as older than what this editor already
        // has, so a snapshot from mid-drag can't pull the element backwards.
        try {
          const d = await res.json();
          if (typeof d?.version === "number") {
            wroteAt.current.set(id, Math.max(wroteAt.current.get(id) ?? 0, d.version));
          }
        } catch {
          /* the move landed; only the bookkeeping is missing */
        }
      })
      .catch(() => {})
      .finally(() => {
        inFlight.current = false;
        pump();
      });
  }, []);

  /**
   * Queue the newest transform for an element.
   *
   * Keyed by element rather than a single slot, so releasing one element and
   * immediately grabbing another can't drop the first one's final position.
   */
  const flush = useCallback(
    (id: number, t: Transform) => {
      pending.current.set(id, t);
      pump();
    },
    [pump],
  );

  // --- what the other editors are doing -----------------------------------
  //
  // The same stream the browser source listens to. Without it, three people on
  // one canvas would each be editing a snapshot from whenever they opened the
  // page, and the last to touch anything would silently undo the rest.
  useEffect(() => {
    let stopped = false;
    let es: EventSource | null = null;
    let reopen: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const open = () => {
      if (stopped) return;
      try {
        es = new EventSource(`/api/scene/${sceneKey}/stream?v=${version.current}`);
      } catch {
        return;
      }

      es.addEventListener("scene", (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          if (typeof d.version === "number") version.current = d.version;
          if (d.canvas) setCanvas((c) => (c.w === d.canvas.w && c.h === d.canvas.h ? c : d.canvas));
          if (Array.isArray(d.elements)) mergeRemote(d.elements, d.version);
        } catch {
          /* ignore a malformed frame */
        }
        failures = 0;
      });

      es.addEventListener("motion", (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          if (typeof d.v === "number") version.current = d.v;
          if (!Array.isArray(d.m)) return;
          const [id, x, y, w, h, rotation] = d.m as number[];
          // No easing here, unlike the browser source: an editor wants to see
          // exactly where the other person has put it, not a smoothed version
          // trailing behind them.
          if (busyWith(id)) return;
          // Same test as mergeRemote: a movement published before this editor
          // last moved the element is history, not news.
          if ((wroteAt.current.get(id) ?? 0) > d.v) return;
          patchLocal(id, { x, y, w, h, rotation });
        } catch {
          /* ignore a malformed frame */
        }
        failures = 0;
      });

      es.addEventListener("bye", () => {
        es?.close();
        es = null;
        if (!stopped) reopen = setTimeout(open, 50);
      });

      es.onerror = () => {
        es?.close();
        es = null;
        if (stopped) return;
        failures++;
        reopen = setTimeout(open, Math.min(failures, 5) * 500);
      };
    };

    open();
    return () => {
      stopped = true;
      es?.close();
      clearTimeout(reopen);
    };
  }, [sceneKey, mergeRemote, busyWith, patchLocal]);

  /**
   * Wholly outside the frame — parked on the shelf around the canvas, and so
   * not on stream. Worth saying out loud, because an element sitting in the
   * margin looks exactly like one that is simply near the edge.
   */
  const offFrame = useCallback(
    (el: RElement) =>
      el.x + el.w <= 0 || el.y + el.h <= 0 || el.x >= canvas.w || el.y >= canvas.h,
    [canvas.w, canvas.h],
  );

  /** Pointer position in canvas coordinates. */
  const toCanvas = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      const box = viewportRef.current?.querySelector(".st-canvas") as HTMLElement | null;
      if (!box) return { x: 0, y: 0 };
      const r = box.getBoundingClientRect();
      return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    },
    [scale],
  );

  const startDrag = useCallback(
    (e: React.PointerEvent, el: RElement) => {
      if (el.locked) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedId(el.id);
      // Claim it, so an update from another editor doesn't move it out from
      // under the pointer half way through the gesture.
      activeId.current = el.id;

      const start = toCanvas(e);
      const x0 = el.x;
      const y0 = el.y;
      // Size and rotation are fixed for the duration of a drag, so they can be
      // read once and carried on every frame.
      const fixed = { w: el.w, h: el.h, rotation: el.rotation };

      const move = (ev: PointerEvent) => {
        const p = toCanvas(ev);
        const nx = Math.round(x0 + (p.x - start.x));
        const ny = Math.round(y0 + (p.y - start.y));
        patchLocal(el.id, { x: nx, y: ny });
        flush(el.id, { ...fixed, x: nx, y: ny });
      };
      const up = (ev: PointerEvent) => {
        const p = toCanvas(ev);
        const nx = Math.round(x0 + (p.x - start.x));
        const ny = Math.round(y0 + (p.y - start.y));
        flush(el.id, { ...fixed, x: nx, y: ny });
        activeId.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [toCanvas, patchLocal, flush],
  );

  const startResize = useCallback(
    (e: React.PointerEvent, el: RElement, sx: -1 | 0 | 1, sy: -1 | 0 | 1) => {
      e.preventDefault();
      e.stopPropagation();
      activeId.current = el.id;

      const start = toCanvas(e);
      const { x: x0, y: y0, w: w0, h: h0, rotation } = el;
      const cx0 = x0 + w0 / 2;
      const cy0 = y0 + h0 / 2;

      const compute = (ev: PointerEvent) => {
        const p = toCanvas(ev);
        // Work in the element's own frame so a rotated box resizes along its
        // own axes and the opposite edge stays put.
        const ld = rot(p.x - start.x, p.y - start.y, -rotation);

        const nw = Math.max(MIN_SIZE, w0 + ld.x * sx);
        const nh = Math.max(MIN_SIZE, h0 + ld.y * sy);
        const dw = nw - w0;
        const dh = nh - h0;

        // Moving one edge shifts the centre by half that edge's growth.
        const shift = rot((sx * dw) / 2, (sy * dh) / 2, rotation);
        const cx = cx0 + shift.x;
        const cy = cy0 + shift.y;

        return {
          w: Math.round(nw),
          h: Math.round(nh),
          x: Math.round(cx - nw / 2),
          y: Math.round(cy - nh / 2),
          rotation,
        };
      };

      const move = (ev: PointerEvent) => {
        const next = compute(ev);
        patchLocal(el.id, next);
        flush(el.id, next);
      };
      const up = (ev: PointerEvent) => {
        flush(el.id, compute(ev));
        activeId.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [toCanvas, patchLocal, flush],
  );

  const startRotate = useCallback(
    (e: React.PointerEvent, el: RElement) => {
      e.preventDefault();
      e.stopPropagation();
      activeId.current = el.id;
      const cx = el.x + el.w / 2;
      const cy = el.y + el.h / 2;

      const angleAt = (ev: PointerEvent | React.PointerEvent) => {
        const p = toCanvas(ev);
        return (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      };
      const a0 = angleAt(e);
      const r0 = el.rotation;

      // A rotation moves nothing else, so the rest of the transform is fixed.
      const fixed = { x: el.x, y: el.y, w: el.w, h: el.h };

      const move = (ev: PointerEvent) => {
        let next = Math.round(r0 + (angleAt(ev) - a0));
        // Shift snaps to 15° increments.
        if (ev.shiftKey) next = Math.round(next / 15) * 15;
        next = ((next % 360) + 360) % 360;
        patchLocal(el.id, { rotation: next });
        flush(el.id, { ...fixed, rotation: next });
      };
      const up = (ev: PointerEvent) => {
        let next = Math.round(r0 + (angleAt(ev) - a0));
        if (ev.shiftKey) next = Math.round(next / 15) * 15;
        next = ((next % 360) + 360) % 360;
        flush(el.id, { ...fixed, rotation: next });
        activeId.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [toCanvas, patchLocal, flush],
  );

  // Keyboard: delete, nudge.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (!selected || selected.locked) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        void call({ action: "delete", id: selected.id });
        setSelectedId(null);
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const d = moves[e.key];
      if (d) {
        e.preventDefault();
        const nx = Math.round(selected.x + d[0]);
        const ny = Math.round(selected.y + d[1]);
        patchLocal(selected.id, { x: nx, y: ny });
        flush(selected.id, {
          x: nx,
          y: ny,
          w: selected.w,
          h: selected.h,
          rotation: selected.rotation,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, call, patchLocal, flush]);

  const setProp = (key: string, value: unknown) => setProps({ [key]: value });

  /** Several props at once, so a change that implies another lands together. */
  const setProps = (patch: Record<string, unknown>) => {
    if (!selected) return;
    patchLocal(selected.id, { props: { ...selected.props, ...patch } });
    queueUpdate(selected.id, { props: patch });
  };

  /**
   * The same bounds the server applies. Kept in step deliberately: nothing
   * reads the server's reply any more, so a value it would have clamped has to
   * be clamped here too, or the editor would go on showing a number that was
   * never actually stored.
   */
  const LIMITS: Partial<Record<keyof RElement, [number, number]>> = {
    x: [-20000, 20000],
    y: [-20000, 20000],
    w: [1, 20000],
    h: [1, 20000],
    rotation: [-360, 360],
    opacity: [0, 1],
    zIndex: [-9999, 9999],
  };

  const setField = (key: keyof RElement, value: unknown) => {
    if (!selected) return;
    const bound = LIMITS[key];
    let v = value;
    if (bound) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      v = Math.min(bound[1], Math.max(bound[0], n));
    }
    patchLocal(selected.id, { [key]: v } as any);
    queueUpdate(selected.id, { [key]: v });
  };

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(sceneUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* input is selectable as a fallback */
    }
  }

  return (
    <div className="st-root">
      {/* ------------------------------- toolbar */}
      <div className="st-toolbar">
        {/* Centred on the toolbar itself rather than placed between the two
            groups, so it stays in the middle whatever they happen to be wide. */}
        <p className="st-credit">
          made with <span className="st-heart" role="img" aria-label="love">♥</span>,
          for Juntella, by mochi
        </p>
        <div className="st-add">
          <button className="btn" onClick={() => call({ action: "add", kind: "text" })}>+ Text</button>
          <button className="btn" onClick={() => call({ action: "add", kind: "image" })}>+ Image</button>
          <button className="btn" onClick={() => call({ action: "add", kind: "video" })}>+ Video</button>
          <button className="btn" onClick={() => call({ action: "add", kind: "widget" })}>+ Widget</button>
          <button className="btn btn-ghost" onClick={() => setShowEmotes(true)}>+ 7TV emote</button>
        </div>
        <div className="st-spacer" />
        <label className="st-canvas-size">
          <span>Canvas</span>
          <input
            type="number" min={16} max={7680} value={canvas.w}
            onChange={(e) => setCanvas({ ...canvas, w: Number(e.target.value) })}
            onBlur={() => call({ action: "canvas", w: canvas.w, h: canvas.h })}
          />
          <span>×</span>
          <input
            type="number" min={16} max={4320} value={canvas.h}
            onChange={(e) => setCanvas({ ...canvas, h: Number(e.target.value) })}
            onBlur={() => call({ action: "canvas", w: canvas.w, h: canvas.h })}
          />
        </label>
        {busy || saving ? (
          <span className="st-busy">saving…</span>
        ) : justSaved ? (
          <span className="st-busy st-saved">saved</span>
        ) : null}
        {error && <span className="st-error">{error}</span>}
      </div>

      <div className="st-body">
        {/* ----------------------------- canvas */}
        <div className="st-viewport" ref={viewportRef} onPointerDown={() => setSelectedId(null)}>
          {/* A box big enough for the frame plus a margin of parking space, so
              the viewport has something to scroll and elements dragged off the
              frame land somewhere reachable rather than off into nothing. */}
          <div
            className="st-world"
            style={{
              width: canvas.w * scale + PARK * 2,
              height: canvas.h * scale + PARK * 2,
            }}
          >
            <div className="st-frame-label" style={{ top: PARK - 22, left: PARK }}>
              {canvas.w} × {canvas.h} — only what&apos;s inside goes on stream
            </div>
            <div
              className="st-canvas"
              style={{
                position: "absolute",
                left: PARK,
                top: PARK,
                width: canvas.w,
                height: canvas.h,
                transform: `scale(${scale})`,
                // Top-left, because the box is placed by the world above rather
                // than centred by flex — so the scaled result occupies exactly
                // the rectangle starting at the parking margin. toCanvas()
                // reads the post-transform rect, so it stays correct either way.
                transformOrigin: "top left",
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {preview && (
                <StreamBackdrop channel={preview} width={canvas.w} height={canvas.h} />
              )}
              {elements.map((el) => (
              <div
                key={el.id}
                onPointerDown={(e) => startDrag(e, el)}
                style={{
                  position: "absolute",
                  // Transform rather than left/top: the compositor moves the
                  // layer without a layout pass, which keeps dragging at the
                  // display's refresh rate. Handles are children, so they ride
                  // along and need no change.
                  left: 0,
                  top: 0,
                  width: el.w,
                  height: el.h,
                  transform: `translate3d(${el.x}px, ${el.y}px, 0) rotate(${el.rotation}deg)`,
                  transformOrigin: "center center",
                  zIndex: el.zIndex,
                  opacity: el.hidden ? 0.25 : el.opacity,
                  clipPath: el.clip || undefined,
                  outline:
                    el.id === selectedId
                      ? "2px solid #66c0f4"
                      : offFrame(el)
                        ? "1px dashed rgba(226,160,60,0.7)"
                        : "1px dashed rgba(255,255,255,0.18)",
                  outlineOffset: 1,
                  cursor: el.locked ? "not-allowed" : "move",
                }}
              >
                {/* Widgets and videos would swallow the drag, so the content is
                    inert in the editor and only the wrapper takes pointers. */}
                <div style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
                  <ElementView el={el} editing />
                </div>

                {el.id === selectedId && !el.locked && (
                  <>
                    {HANDLES.map((h) => (
                      <div
                        key={h.name}
                        onPointerDown={(e) => startResize(e, el, h.sx, h.sy)}
                        style={{
                          position: "absolute",
                          width: 10 / scale,
                          height: 10 / scale,
                          background: "#66c0f4",
                          border: `${1 / scale}px solid #05131f`,
                          borderRadius: 2 / scale,
                          cursor: h.cursor,
                          left: h.sx === -1 ? -5 / scale : h.sx === 1 ? el.w - 5 / scale : el.w / 2 - 5 / scale,
                          top: h.sy === -1 ? -5 / scale : h.sy === 1 ? el.h - 5 / scale : el.h / 2 - 5 / scale,
                        }}
                      />
                    ))}
                    <div
                      onPointerDown={(e) => startRotate(e, el)}
                      title="Rotate (hold Shift to snap 15°)"
                      style={{
                        position: "absolute",
                        left: el.w / 2 - 6 / scale,
                        top: -34 / scale,
                        width: 12 / scale,
                        height: 12 / scale,
                        borderRadius: "50%",
                        background: "#a4d007",
                        border: `${1 / scale}px solid #05131f`,
                        cursor: "grab",
                      }}
                    />
                  </>
                )}
              </div>
              ))}
            </div>
          </div>

          {/* Floating rather than in the toolbar: it belongs to the canvas, and
              the toolbar is already carrying the add buttons and the size. */}
          <div className="st-zoom" onPointerDown={(e) => e.stopPropagation()}>
            <button className="btn btn-ghost" title="Zoom out" onClick={() => zoomBy(1 / 1.25)}>−</button>
            <span className="st-zoom-level">{Math.round(scale * 100)}%</span>
            <button className="btn btn-ghost" title="Zoom in" onClick={() => zoomBy(1.25)}>+</button>
            <button className="btn btn-ghost" onClick={zoomToFit} title="Fit the frame in the window">
              {autoFit ? "Fit ✓" : "Fit"}
            </button>
          </div>
        </div>

        {/* ----------------------------- right rail */}
        <aside className="st-rail">
          <section className="st-panel">
            <h3>Browser source</h3>
            <div className="st-url-row">
              <input className="st-url" readOnly value={sceneUrl} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={copyUrl}>{copied ? "Copied" : "Copy"}</button>
            </div>
            <p className="st-hint">
              Size the OBS source to your canvas. Keep this URL private — rotating it
              breaks the old one immediately. Everyone on the allowlist edits this
              same canvas and shares this URL.
            </p>
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (confirm("Rotate the scene URL? You'll need to re-paste it into OBS.")) {
                  void call({ action: "rotate_key" });
                }
              }}
            >
              Rotate URL
            </button>
          </section>

          <section className="st-panel">
            <h3>Stream preview</h3>
            <div className="st-url-row">
              <input
                className="st-url"
                placeholder="Twitch channel"
                value={preview ?? ""}
                onChange={(e) => setPreviewChannel(e.target.value)}
              />
              <button
                className="btn btn-ghost"
                onClick={() => setPreviewChannel(preview ? "" : previewChannel)}
              >
                {preview ? "Hide" : "Show"}
              </button>
            </div>
            <p className="st-hint">
              Shown behind the elements so you can place things against the real
              stream. Preview only — it is never part of the browser source, and
              it is remembered in this browser rather than shared.
            </p>
          </section>

          <section className="st-panel">
            <h3>Layers</h3>
            {elements.length === 0 && <p className="st-hint">Nothing yet — add an element above.</p>}
            <ul className="st-layers">
              {[...elements].reverse().map((el) => (
                <li
                  key={el.id}
                  className={el.id === selectedId ? "sel" : ""}
                  onClick={() => setSelectedId(el.id)}
                >
                  <span className="st-kind">{el.kind}</span>
                  <span className="st-label">
                    {labelFor(el)}
                    {offFrame(el) && <span className="st-parked" title="Parked outside the frame — not on stream">off-frame</span>}
                  </span>
                  <button title={el.hidden ? "Show" : "Hide"} onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); patchLocal(el.id, { hidden: !el.hidden }); queueUpdate(el.id, { hidden: !el.hidden }); }}>
                    {el.hidden ? "🚫" : "👁"}
                  </button>
                  <button title={el.locked ? "Unlock" : "Lock"} onClick={(e) => { e.stopPropagation(); patchLocal(el.id, { locked: !el.locked }); queueUpdate(el.id, { locked: !el.locked }); }}>
                    {el.locked ? "🔒" : "🔓"}
                  </button>
                  <button title="Up" onClick={(e) => { e.stopPropagation(); void call({ action: "reorder", id: el.id, direction: "up" }); }}>▲</button>
                  <button title="Down" onClick={(e) => { e.stopPropagation(); void call({ action: "reorder", id: el.id, direction: "down" }); }}>▼</button>
                  <button title="Delete" onClick={(e) => { e.stopPropagation(); void call({ action: "delete", id: el.id }); if (selectedId === el.id) setSelectedId(null); }}>✕</button>
                </li>
              ))}
            </ul>
          </section>

          {selected && (
            <section className="st-panel">
              <h3>{selected.kind} properties</h3>

              <div className="st-grid">
                <label><span>X</span><input type="number" value={Math.round(selected.x)} onChange={(e) => setField("x", Number(e.target.value))} /></label>
                <label><span>Y</span><input type="number" value={Math.round(selected.y)} onChange={(e) => setField("y", Number(e.target.value))} /></label>
                <label><span>W</span><input type="number" value={Math.round(selected.w)} onChange={(e) => setField("w", Number(e.target.value))} /></label>
                <label><span>H</span><input type="number" value={Math.round(selected.h)} onChange={(e) => setField("h", Number(e.target.value))} /></label>
                <label><span>Rotation</span><input type="number" value={Math.round(selected.rotation)} onChange={(e) => setField("rotation", Number(e.target.value))} /></label>
                <label><span>Opacity</span><input type="number" step={0.05} min={0} max={1} value={selected.opacity} onChange={(e) => setField("opacity", Number(e.target.value))} /></label>
              </div>

              <label className="st-row"><span>Clip path</span>
                <input
                  type="text" placeholder="inset(10% 0 0 0)" value={selected.clip ?? ""}
                  onChange={(e) => patchLocal(selected.id, { clip: e.target.value })}
                  onBlur={(e) => queueUpdate(selected.id, { clip: e.target.value.slice(0, 400) })}
                />
              </label>

              {selected.kind === "text" && (
                <>
                  <label className="st-row"><span>Text</span>
                    <textarea rows={3} value={selected.props.text ?? ""} onChange={(e) => setProp("text", e.target.value)} />
                  </label>
                  <div className="st-grid">
                    <label><span>Colour</span><input type="color" value={selected.props.color ?? "#ffffff"} onChange={(e) => setProp("color", e.target.value)} /></label>
                    <label><span>Size</span><input type="number" value={selected.props.fontSize ?? 64} onChange={(e) => setProp("fontSize", Number(e.target.value))} /></label>
                    <label><span>Weight</span><input type="number" step={100} min={100} max={900} value={selected.props.weight ?? 700} onChange={(e) => setProp("weight", Number(e.target.value))} /></label>
                    <label><span>Align</span>
                      <select value={selected.props.align ?? "left"} onChange={(e) => setProp("align", e.target.value)}>
                        <option>left</option><option>center</option><option>right</option>
                      </select>
                    </label>
                  </div>
                  <label className="st-row"><span>Font</span>
                    <input type="text" value={selected.props.fontFamily ?? ""} onChange={(e) => setProp("fontFamily", e.target.value)} />
                  </label>
                  <label className="st-check"><input type="checkbox" checked={selected.props.shadow !== false} onChange={(e) => setProp("shadow", e.target.checked)} /><span>Drop shadow</span></label>
                </>
              )}

              {(selected.kind === "image" || selected.kind === "video") && (
                <>
                  <label className="st-row"><span>URL</span>
                    <input
                      type="url"
                      placeholder={selected.kind === "video" ? "https://… or a YouTube link" : "https://…"}
                      value={selected.props.url ?? ""}
                      onChange={(e) => setProp("url", e.target.value)}
                    />
                  </label>
                  {/* Fit crops or letterboxes the media inside the box, which
                      only means anything for a file we render ourselves. An
                      embedded player fills the box and does its own letterboxing. */}
                  {embedded ? (
                    <p className="st-hint">
                      Playing through the site&apos;s own player. Size the box to the video&apos;s
                      aspect ratio — Fit doesn&apos;t apply, and the player letterboxes
                      anything else with black bars.
                    </p>
                  ) : (
                    <label className="st-row"><span>Fit</span>
                      <select value={selected.props.fit ?? "contain"} onChange={(e) => setProp("fit", e.target.value)}>
                        <option>contain</option><option>cover</option><option>fill</option><option>none</option>
                      </select>
                    </label>
                  )}
                </>
              )}

              {selected.kind === "video" && (
                <>
                  {/* The canvas puts the drag handler on top of the video and a
                      browser source has no cursor at all, so there is nowhere to
                      click a player's own controls. These drive it instead, and
                      because the state lives on the element they drive what's on
                      stream, not just this preview. */}
                  <div className="st-transport">
                    <button
                      className="btn"
                      onClick={() => setProp("paused", !videoPaused(selected.props))}
                    >
                      {videoPaused(selected.props) ? "▶ Play" : "❚❚ Pause"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      title="Play again from the start"
                      onClick={() => {
                        setProp("restartAt", Date.now());
                        if (videoPaused(selected.props)) setProp("paused", false);
                      }}
                    >
                      ↻ Restart
                    </button>
                  </div>

                  <label className="st-check"><input type="checkbox" checked={selected.props.loop !== false} onChange={(e) => setProp("loop", e.target.checked)} /><span>Loop</span></label>
                  <label className="st-check">
                    <input
                      type="checkbox"
                      checked={selected.props.autoplay !== false}
                      // Autoplay is what happens the *next* time the browser
                      // source loads, so pin whatever is playing right now
                      // alongside it — otherwise unticking this pauses a video
                      // mid-play, since an untouched element takes its paused
                      // state from autoplay.
                      onChange={(e) =>
                        setProps({ autoplay: e.target.checked, paused: videoPaused(selected.props) })
                      }
                    />
                    <span>Autoplay on load</span>
                  </label>
                  <label className="st-check"><input type="checkbox" checked={selected.props.muted !== false} onChange={(e) => setProp("muted", e.target.checked)} /><span>Muted</span></label>
                  {selected.props.muted === false && (
                    <label className="st-row"><span>Volume</span>
                      <input
                        type="range" min={0} max={1} step={0.05}
                        value={selected.props.volume ?? 1}
                        onChange={(e) => setProp("volume", Number(e.target.value))}
                      />
                    </label>
                  )}
                  <p className="st-hint">
                    Sound works <strong>in OBS</strong> but not in this preview. A normal
                    browser tab refuses to start audio nobody asked for, so the video
                    always begins muted and is unmuted once it&apos;s actually playing —
                    which OBS allows and this tab doesn&apos;t. In OBS, tick{" "}
                    <em>Control audio via OBS</em> on the browser source to get it into
                    your mixer.
                  </p>
                  <p className="st-hint">
                    <em>Autoplay on load</em> is what happens when the browser source
                    starts; use Play/Pause above to control it now. If OBS has{" "}
                    <em>Shutdown source when not visible</em> ticked, it will stop the
                    video whenever the scene isn&apos;t on screen — untick it to keep
                    playing.
                  </p>
                </>
              )}

              {selected.kind === "widget" && (
                <>
                  <label className="st-row"><span>Mode</span>
                    <select value={selected.props.mode ?? "html"} onChange={(e) => setProp("mode", e.target.value)}>
                      <option value="html">Custom HTML</option>
                      <option value="url">Embed a URL</option>
                    </select>
                  </label>
                  {(selected.props.mode ?? "html") === "url" ? (
                    <label className="st-row"><span>URL</span>
                      <input type="url" placeholder="https://…" value={selected.props.url ?? ""} onChange={(e) => setProp("url", e.target.value)} />
                    </label>
                  ) : (
                    <label className="st-row"><span>HTML / CSS / JS</span>
                      <textarea
                        rows={10} spellCheck={false} className="st-code"
                        placeholder={"<style>body{margin:0;color:#fff}</style>\n<h1>Hello</h1>"}
                        value={selected.props.html ?? ""}
                        onChange={(e) => setProp("html", e.target.value)}
                      />
                    </label>
                  )}
                  <p className="st-hint">
                    Widgets run in a sandboxed iframe with no access to this site.
                  </p>
                </>
              )}
            </section>
          )}
        </aside>
      </div>

      {showEmotes && (
        <EmotePicker
          onClose={() => setShowEmotes(false)}
          onPick={(url, name) => {
            setShowEmotes(false);
            void call({ action: "add", kind: "image", w: 160, h: 160, props: { url, fit: "contain", label: name } });
          }}
        />
      )}
    </div>
  );
}

function labelFor(el: RElement): string {
  const p = el.props ?? {};
  if (el.kind === "text") return String(p.text ?? "").slice(0, 24) || "(empty)";
  if (el.kind === "widget") return (p.mode ?? "html") === "url" ? String(p.url ?? "(no url)") : "custom HTML";
  if (p.label) return String(p.label).slice(0, 24);
  const u = String(p.url ?? "");
  return u ? u.split("/").pop()!.slice(0, 24) : "(no url)";
}
