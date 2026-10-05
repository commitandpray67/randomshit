"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ElementView, type RElement } from "./SceneRenderer";
import EmotePicker from "./EmotePicker";
import StudioAdmin from "./StudioAdmin";
import { isEmbeddable, videoPaused } from "@/lib/embed";
import StreamBackdrop from "./StreamBackdrop";
import { imageCandidates } from "@/lib/imagesrc";
import { CHATPETS_DEFAULTS, chatPetsChannel } from "@/lib/chatpets";
import SoundLibrary, { type MediaItem } from "./SoundLibrary";
import PetSprites from "./PetSprites";
import { soundPlaying, soundVolume } from "@/lib/sound";

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
  studio,
  studios,
  isAdmin,
}: {
  initialSceneKey: string;
  initialCanvas: Canvas;
  initialElements: RElement[];
  initialVersion: number;
  siteUrl: string;
  /** The studio being edited: whose canvas, and whose stream and emotes. */
  studio: { slug: string; name: string; channel: string | null };
  /** Every studio this editor may open, for switching between them. */
  studios: { slug: string; name: string }[];
  isAdmin: boolean;
}) {
  // The stream shown behind the canvas, and whose 7TV emotes the picker opens on.
  const previewChannel = studio.channel ?? "";
  const [sceneKey, setSceneKey] = useState(initialSceneKey);
  const [canvas, setCanvas] = useState<Canvas>(initialCanvas);
  const [elements, setElements] = useState<RElement[]>(initialElements);
  /**
   * Everything currently selected. A set rather than one id so a group can be
   * moved, restacked or deleted together; the properties panel still only
   * appears when exactly one thing is picked, since the fields are per-element.
   */
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  /** Elements removed by the last delete, kept so it can be taken back. */
  const [undoable, setUndoable] = useState<RElement[] | null>(null);
  /** Guides drawn while dragging, in canvas coordinates. */
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [scale, setScale] = useState(0.4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmotes, setShowEmotes] = useState(false);
  /** The sound library, open to add a sound element or to change the selected one's file. */
  const [soundPick, setSoundPick] = useState<null | "add" | "swap">(null);
  /** The custom pets dialog, open at this chat pets widget's size. */
  const [petsAt, setPetsAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLite, setCopiedLite] = useState(false);
  // Keep tracking the viewport until someone picks a zoom of their own.
  const [autoFit, setAutoFit] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  /**
   * Whether the preview takes clicks.
   *
   * On by default: a stream the browser declined to autoplay shows a play
   * button, and with the backdrop deaf to the pointer there is no way to press
   * it — which is exactly as useful as no preview at all. Turn it off when the
   * stream starts getting in the way of arranging things over it.
   */
  const [previewLive, setPreviewLive] = useState(true);
  const version = useRef(initialVersion);

  const viewportRef = useRef<HTMLDivElement>(null);
  const selected = selectedIds.length === 1
    ? (elements.find((e) => e.id === selectedIds[0]) ?? null)
    : null;
  const isSelected = useCallback((id: number) => selectedIds.includes(id), [selectedIds]);
  const selectOnly = useCallback((id: number | null) => setSelectedIds(id === null ? [] : [id]), []);
  const toggleSelected = useCallback(
    (id: number) =>
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  );
  // A video whose URL is a YouTube/Vimeo page rather than a media file, so it
  // renders as that site's player and some of the controls below don't apply.
  const embedded = selected?.kind === "video" && isEmbeddable(selected.props.url);
  // Says when a pasted link had to be pointed somewhere else to be loadable,
  // or when it can't be — so a blank element isn't a mystery.
  const imageNote =
    selected?.kind === "image" && selected.props.url ? imageCandidates(selected.props.url).note : undefined;

  const sceneUrl = `${siteUrl}/scene/${sceneKey}`;
  // Framework-free build of the same scene, a few KB in one request. For
  // connections that truncate large responses and so never finish loading
  // the normal page.
  const liteUrl = `${siteUrl}/lite/${sceneKey}`;


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
      // Per studio: a channel picked while working on one streamer's canvas
      // means nothing on another's.
      const saved = localStorage.getItem(`studio:preview:${studio.slug}`);
      setPreview(saved === null ? previewChannel : saved);
      setPreviewLive(localStorage.getItem("studio:preview-live") !== "0");
    } catch {
      setPreview(previewChannel);
    }
  }, [previewChannel, studio.slug]);

  const setPreviewLivePref = (live: boolean) => {
    setPreviewLive(live);
    try {
      localStorage.setItem("studio:preview-live", live ? "1" : "0");
    } catch {
      /* private mode; the choice just won't be remembered */
    }
  };

  const setPreviewChannel = (name: string) => {
    setPreview(name);
    try {
      localStorage.setItem(`studio:preview:${studio.slug}`, name);
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
  const activeIds = useRef<Set<number>>(new Set());
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
      body: JSON.stringify({ action: "update", id, patch, studio: studio.slug }),
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
    (id: number) => activeIds.current.has(id) || sendingId.current === id || queued.current.has(id),
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
        body: JSON.stringify({ ...payload, studio: studio.slug }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data?.error ?? `request failed (${res.status})`);
        return null;
      }
      if (data.elements) mergeRemote(data.elements);
      if (data.canvas) setCanvas(data.canvas);
      if (data.sceneKey) setSceneKey(data.sceneKey);
      if (payload.action === "add" && data.created?.length) {
        // A new element starts parked off the frame (see addElement), which
        // is often past the edge of the viewport. Select it and bring it into
        // view, or it's made somewhere you can't see.
        const id = data.created[0].id;
        setSelectedIds([id]);
        requestAnimationFrame(() => {
          viewportRef.current
            ?.querySelector(`[data-element-id="${id}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        });
      }
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

    // Everything waiting goes in one request: a multi-selection then moves as
    // one on every screen, instead of each element trailing the one before.
    const moves = [...pending.current].map(([id, t]) => ({ id, t }));
    pending.current.clear();
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
      body: JSON.stringify({ action: "transform", moves, ts: Math.round(performance.now()), studio: studio.slug }),
    })
      .then(async (res) => {
        // Noted for the same reason a text edit is: it marks everything
        // published before this point as older than what this editor already
        // has, so a snapshot from mid-drag can't pull the element backwards.
        // The studio's own server answers before the database has the move,
        // so there is no version to note — and none needed: its snapshots
        // already include every position it has published.
        try {
          const d = await res.json();
          if (typeof d?.version === "number") {
            for (const { id } of moves) {
              wroteAt.current.set(id, Math.max(wroteAt.current.get(id) ?? 0, d.version));
            }
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

  /**
   * How close, in canvas pixels, an edge or centre has to be before it snaps.
   * Measured on screen rather than on the canvas, so it feels the same however
   * far you are zoomed out.
   */
  const SNAP_PX = 7;

  /**
   * Nudge a dragged box onto the nearest edge or centre line.
   *
   * Candidates are the canvas edges and middle, plus the edges and middles of
   * every other element. Rotated elements are skipped: their on-screen box
   * isn't the one being compared, so snapping them lines up something the eye
   * cannot see.
   */
  const snapDrag = useCallback(
    (moving: RElement[], nx: number, ny: number) => {
      const tol = SNAP_PX / scale;
      const box = moving[0];
      if (moving.length !== 1 || box.rotation !== 0) {
        return { x: nx, y: ny, v: [] as number[], h: [] as number[] };
      }

      const vs: number[] = [0, canvas.w / 2, canvas.w];
      const hs: number[] = [0, canvas.h / 2, canvas.h];
      for (const e of elements) {
        if (e.id === box.id || e.hidden) continue;
        vs.push(e.x, e.x + e.w / 2, e.x + e.w);
        hs.push(e.y, e.y + e.h / 2, e.y + e.h);
      }

      let bx = nx, by = ny;
      const hitV: number[] = [], hitH: number[] = [];
      // Each of the box's own three lines can land on any candidate.
      for (const [own, adjust] of [[nx, 0], [nx + box.w / 2, box.w / 2], [nx + box.w, box.w]] as const) {
        for (const c of vs) {
          if (Math.abs(own - c) <= tol) { bx = c - adjust; hitV.push(c); break; }
        }
        if (hitV.length) break;
      }
      for (const [own, adjust] of [[ny, 0], [ny + box.h / 2, box.h / 2], [ny + box.h, box.h]] as const) {
        for (const c of hs) {
          if (Math.abs(own - c) <= tol) { by = c - adjust; hitH.push(c); break; }
        }
        if (hitH.length) break;
      }
      return { x: bx, y: by, v: hitV, h: hitH };
    },
    [elements, canvas.w, canvas.h, scale],
  );

  const startDrag = useCallback(
    (e: React.PointerEvent, el: RElement) => {
      if (el.locked) return;
      e.preventDefault();
      e.stopPropagation();

      // Shift/Ctrl extends the selection; clicking something outside it makes
      // it the selection. Clicking inside an existing selection keeps the
      // group, so a group can be dragged without picking it apart.
      let ids: number[];
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        toggleSelected(el.id);
        ids = selectedIds.includes(el.id)
          ? selectedIds.filter((x) => x !== el.id)
          : [...selectedIds, el.id];
      } else if (isSelected(el.id)) {
        ids = selectedIds;
      } else {
        selectOnly(el.id);
        ids = [el.id];
      }

      // Locked elements come along only if they were not what was grabbed.
      const moving = elements.filter((x) => ids.includes(x.id) && !x.locked);
      if (moving.length === 0) return;

      // Claim them, so an update from another editor doesn't move one out from
      // under the pointer half way through the gesture.
      activeIds.current = new Set(moving.map((m) => m.id));

      const start = toCanvas(e);
      const origin = new Map(moving.map((m) => [m.id, { x: m.x, y: m.y, w: m.w, h: m.h, rotation: m.rotation }]));
      const anchor = origin.get(el.id)!;

      const apply = (ev: PointerEvent, final: boolean) => {
        const p = toCanvas(ev);
        let dx = p.x - start.x;
        let dy = p.y - start.y;

        // Snapping is computed for the grabbed element and the same offset is
        // applied to the rest, so a group keeps its internal spacing.
        if (!ev.altKey) {
          const snapped = snapDrag(moving, anchor.x + dx, anchor.y + dy);
          dx = snapped.x - anchor.x;
          dy = snapped.y - anchor.y;
          setGuides(final ? { v: [], h: [] } : { v: snapped.v, h: snapped.h });
        } else {
          setGuides({ v: [], h: [] });
        }

        for (const m of moving) {
          const o = origin.get(m.id)!;
          const nx = Math.round(o.x + dx);
          const ny = Math.round(o.y + dy);
          patchLocal(m.id, { x: nx, y: ny });
          flush(m.id, { w: o.w, h: o.h, rotation: o.rotation, x: nx, y: ny });
        }
      };

      const move = (ev: PointerEvent) => apply(ev, false);
      const done = (ev: PointerEvent) => {
        apply(ev, true);
        endGesture();
      };
      const cancel = () => endGesture();

      const endGesture = () => {
        activeIds.current.clear();
        setGuides({ v: [], h: [] });
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", done);
        window.removeEventListener("pointercancel", cancel);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", done);
      // Without this a cancelled gesture leaves the element claimed for ever,
      // silently ignoring every other editor for the rest of the session.
      window.addEventListener("pointercancel", cancel);
    },
    [toCanvas, patchLocal, flush, elements, selectedIds, isSelected, selectOnly, toggleSelected, snapDrag],
  );

  const startResize = useCallback(
    (e: React.PointerEvent, el: RElement, sx: -1 | 0 | 1, sy: -1 | 0 | 1) => {
      e.preventDefault();
      e.stopPropagation();
      activeIds.current = new Set([el.id]);

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
      const stop = () => {
        activeIds.current.clear();
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", stop);
      };
      const up = (ev: PointerEvent) => {
        flush(el.id, compute(ev));
        stop();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      // A cancelled gesture would otherwise leave the element claimed for ever.
      window.addEventListener("pointercancel", stop);
    },
    [toCanvas, patchLocal, flush],
  );

  const startRotate = useCallback(
    (e: React.PointerEvent, el: RElement) => {
      e.preventDefault();
      e.stopPropagation();
      activeIds.current = new Set([el.id]);
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
        stop();
      };
      const stop = () => {
        activeIds.current.clear();
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", stop);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", stop);
    },
    [toCanvas, patchLocal, flush],
  );

  /**
   * Delete, keeping what was removed so it can be put back.
   *
   * Deleting is instant and shared: it disappears for every editor at once,
   * and before this there was no way back — one stray Backspace over a canvas
   * someone had spent an hour on and it was simply gone.
   */
  const removeElements = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return;
      const res = await call({ action: "delete", ids });
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      if (res?.removed?.length) setUndoable(res.removed as RElement[]);
    },
    [call],
  );

  const undoDelete = useCallback(async () => {
    if (!undoable?.length) return;
    const res = await call({ action: "restore", elements: undoable });
    setUndoable(null);
    if (res?.created?.length) setSelectedIds(res.created.map((e: RElement) => e.id));
  }, [call, undoable]);

  const duplicateSelected = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const res = await call({ action: "duplicate", ids: selectedIds });
    // Select the copies, so the next drag moves them rather than the originals.
    if (res?.created?.length) setSelectedIds(res.created.map((e: RElement) => e.id));
  }, [call, selectedIds]);

  const restackSelected = useCallback(
    (to: "front" | "back") => {
      if (selectedIds.length === 0) return;
      void call({ action: "restack", ids: selectedIds, to });
    },
    [call, selectedIds],
  );

  // An undo offer that sits there for ever would eventually put back something
  // deleted on purpose ten minutes ago.
  useEffect(() => {
    if (!undoable) return;
    const t = setTimeout(() => setUndoable(null), 12000);
    return () => clearTimeout(t);
  }, [undoable]);

  // The drag pump's timer outlives the page without this.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Keyboard: delete, duplicate, undo, nudge, select all.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Typing in a field, or in anything editable, is never a canvas shortcut.
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void undoDelete();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        void duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(elements.filter((el) => !el.locked).map((el) => el.id));
        return;
      }
      // Ahead of the lock check below: with a clickable stream preview behind
      // the canvas, a click on bare canvas may go to the player rather than
      // clearing the selection, so this is the way out.
      if (e.key === "Escape") {
        setSelectedIds([]);
        return;
      }

      const picked = elements.filter((el) => selectedIds.includes(el.id) && !el.locked);
      if (picked.length === 0) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        void removeElements(picked.map((el) => el.id));
        return;
      }
      if (mod && (e.key === "]" || e.key === "[")) {
        e.preventDefault();
        restackSelected(e.key === "]" ? "front" : "back");
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
        for (const el of picked) {
          const nx = Math.round(el.x + d[0]);
          const ny = Math.round(el.y + d[1]);
          patchLocal(el.id, { x: nx, y: ny });
          flush(el.id, { x: nx, y: ny, w: el.w, h: el.h, rotation: el.rotation });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [elements, selectedIds, patchLocal, flush, removeElements, duplicateSelected, undoDelete, restackSelected]);

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

  async function copyLite() {
    try {
      await navigator.clipboard.writeText(liteUrl);
      setCopiedLite(true);
      setTimeout(() => setCopiedLite(false), 1800);
    } catch {
      /* input is selectable as a fallback */
    }
  }

  return (
    <div className="st-root">
      {/* ------------------------------- toolbar */}
      <div className="st-toolbar">
        {/* Centred on the toolbar itself rather than placed between the two
            groups, so it stays in the middle whatever they happen to be wide.
            Which is also why it steps aside while something is selected: the
            selection buttons grow the left group straight through the middle. */}
        {selectedIds.length === 0 && (
          <p className="st-credit">
            made with <span className="st-heart" role="img" aria-label="love">♥</span>,
            for {studio.name}, by mochi
          </p>
        )}
        <div className="st-add">
          <button className="btn" onClick={() => call({ action: "add", kind: "text" })}>+ Text</button>
          <button className="btn" onClick={() => call({ action: "add", kind: "image" })}>+ Image</button>
          <button className="btn" onClick={() => call({ action: "add", kind: "video" })}>+ Video</button>
          <button className="btn" onClick={() => call({ action: "add", kind: "widget" })}>+ Widget</button>
          <button
            className="btn"
            title="A kitten for everyone who types in chat, walking along the bottom of the frame. Selects it if there's one already."
            onClick={() => {
              // One is almost always what's wanted, and a second lands exactly on
              // top of the first, where it can't be seen but doubles every pet.
              // So this finds the one there is. A second one is still possible
              // through + Widget, for another channel say.
              const existing = elements.find((e) => e.kind === "widget" && e.props?.mode === "chatpets");
              if (existing) {
                selectOnly(existing.id);
                return;
              }
              // Full width, parked just below the frame like every new element
              // (see addElement): too wide for the space beside it, and the
              // bottom edge is where it goes anyway, so it's a short drag up.
              const h = 200;
              void call({
                action: "add", kind: "widget", x: 0, y: canvas.h + 40, w: canvas.w, h,
                props: { mode: "chatpets", channel: studio.channel ?? "", ...CHATPETS_DEFAULTS, colors: true },
              });
            }}
          >
            + 🐾 Chat pets
          </button>
          <button className="btn" title="Play your own sounds on stream, from the studio's sound library" onClick={() => setSoundPick("add")}>
            + 🔊 Sound
          </button>
          <button className="btn btn-ghost" onClick={() => setShowEmotes(true)}>+ 7TV emote</button>
          {selectedIds.length > 0 && (
            <>
              <span className="st-sep" />
              <button className="btn btn-ghost" title="Duplicate (Ctrl+D)" onClick={() => void duplicateSelected()}>Duplicate</button>
              <button className="btn btn-ghost" title="Bring to front (Ctrl+])" onClick={() => restackSelected("front")}>Front</button>
              <button className="btn btn-ghost" title="Send to back (Ctrl+[)" onClick={() => restackSelected("back")}>Back</button>
              <button className="btn btn-ghost" title="Delete (Del)" onClick={() => void removeElements(selectedIds)}>Delete</button>
              <span className="st-count">{selectedIds.length} selected</span>
            </>
          )}
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
        {undoable && (
          <div className="st-undo" role="status">
            <span>
              {undoable.length === 1 ? "Element deleted" : `${undoable.length} elements deleted`}
            </span>
            <button className="btn" onClick={() => void undoDelete()}>Undo</button>
            <button className="st-undo-x" title="Dismiss" onClick={() => setUndoable(null)}>✕</button>
          </div>
        )}
        {/* The viewport scrolls; the stage around it doesn't, so what floats
            over the canvas (the zoom bar) stays put when it does. */}
        <div className="st-stage">
        <div className="st-viewport" ref={viewportRef} onPointerDown={() => setSelectedIds([])}>
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
                <StreamBackdrop
                  channel={preview}
                  width={canvas.w}
                  height={canvas.h}
                  interactive={previewLive}
                />
              )}
              {/* Alignment guides, drawn only while a drag is actually snapping. */}
              {guides.v.map((x) => (
              <div key={"v" + x} className="st-guide st-guide-v" style={{ left: x, height: canvas.h }} />
            ))}
              {guides.h.map((y) => (
              <div key={"h" + y} className="st-guide st-guide-h" style={{ top: y, width: canvas.w }} />
            ))}
              {elements.map((el) => (
              <div
                key={el.id}
                data-element-id={el.id}
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
                    isSelected(el.id)
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

                {isSelected(el.id) && selectedIds.length === 1 && !el.locked && (
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
            <h3>Studio</h3>
            {studios.length > 1 ? (
              <label className="st-row">
                <span>Editing</span>
                {/* A full navigation, not a client-side one: each studio is its
                    own canvas, stream and set of editors, and the page is
                    built for one at a time. */}
                <select
                  value={studio.slug}
                  onChange={(e) => {
                    window.location.href = `/studio/${e.target.value}`;
                  }}
                >
                  {studios.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="st-hint">Editing {studio.name}&apos;s overlay.</p>
            )}
            {isAdmin && <StudioAdmin studio={{ slug: studio.slug, name: studio.name }} />}
          </section>

          <section className="st-panel">
            <h3>Browser source</h3>
            <div className="st-url-row">
              <input className="st-url" readOnly value={sceneUrl} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={copyUrl}>{copied ? "Copied" : "Copy"}</button>
            </div>
            <p className="st-hint">
              Size the OBS source to your canvas. Keep this URL private — rotating it
              breaks the old one immediately. Everyone who can edit this studio
              edits this same canvas and shares this URL.
            </p>

            <h3 style={{ marginTop: "1rem" }}>Lite URL</h3>
            <div className="st-url-row">
              <input className="st-url" readOnly value={liteUrl} onFocus={(e) => e.target.select()} />
              <button className="btn btn-ghost" onClick={copyLite}>
                {copiedLite ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="st-hint">
              The same scene in a few KB and one request, instead of ~383 KB across
              eight. Use this when the normal URL never finishes loading — a slow or
              filtered connection that cuts long responses short.
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
            {preview && (
              <label className="st-check">
                <input
                  type="checkbox"
                  checked={previewLive}
                  onChange={(e) => setPreviewLivePref(e.target.checked)}
                />
                <span>Clickable (play, pause, volume)</span>
              </label>
            )}
            <p className="st-hint">
              Shown behind the elements so you can place things against the real
              stream. Preview only — it is never part of the browser source, and
              it is remembered in this browser rather than shared.
            </p>
            <p className="st-hint">
              Clickable lets you press Twitch&apos;s own play button, which you need
              when the browser won&apos;t start it by itself, and reach its volume and
              quality controls. Elements on top still drag either way; only a click
              on bare canvas goes to the player instead of clearing the selection —
              press <kbd>Esc</kbd> for that, or untick this.
            </p>
          </section>

          <section className="st-panel">
            <h3>Layers</h3>
            {elements.length === 0 && <p className="st-hint">Nothing yet — add an element above.</p>}
            <ul className="st-layers">
              {[...elements].reverse().map((el) => (
                <li
                  key={el.id}
                  className={isSelected(el.id) ? "sel" : ""}
                  onClick={(e) =>
                    e.shiftKey || e.ctrlKey || e.metaKey ? toggleSelected(el.id) : selectOnly(el.id)
                  }
                >
                  <span className="st-kind">{el.kind}</span>
                  <span className="st-label">
                    {labelFor(el)}
                    {offFrame(el) && <span className="st-parked" title="Parked outside the frame — not on stream">off-frame</span>}
                  </span>
                  <button title={el.hidden ? "Show" : "Hide"} onClick={(e) => { e.stopPropagation(); selectOnly(el.id); patchLocal(el.id, { hidden: !el.hidden }); queueUpdate(el.id, { hidden: !el.hidden }); }}>
                    {el.hidden ? "🚫" : "👁"}
                  </button>
                  <button title={el.locked ? "Unlock" : "Lock"} onClick={(e) => { e.stopPropagation(); patchLocal(el.id, { locked: !el.locked }); queueUpdate(el.id, { locked: !el.locked }); }}>
                    {el.locked ? "🔒" : "🔓"}
                  </button>
                  <button title="Up" onClick={(e) => { e.stopPropagation(); void call({ action: "reorder", id: el.id, direction: "up" }); }}>▲</button>
                  <button title="Down" onClick={(e) => { e.stopPropagation(); void call({ action: "reorder", id: el.id, direction: "down" }); }}>▼</button>
                  <button title="Delete" onClick={(e) => { e.stopPropagation(); void removeElements([el.id]); }}>✕</button>
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
                  {selected.kind === "image" && imageNote && (
                    <p className="st-hint">{imageNote}</p>
                  )}
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
                    <select
                      value={selected.props.mode ?? "html"}
                      onChange={(e) =>
                        // A widget turned into chat pets starts on this studio's chat.
                        e.target.value === "chatpets" && !selected.props.channel
                          ? setProps({ mode: "chatpets", channel: studio.channel ?? "" })
                          : setProp("mode", e.target.value)
                      }
                    >
                      <option value="html">Custom HTML</option>
                      <option value="url">Embed a URL</option>
                      <option value="chatpets">Chat pets</option>
                      <option value="sound">Sound</option>
                    </select>
                  </label>
                  {selected.props.mode === "sound" ? (
                    <>
                      <div className="st-row"><span>File</span>
                        <div className="st-sound-file">
                          <span>{selected.props.media ? String(selected.props.name ?? "Sound") : "None yet"}</span>
                          <button className="btn btn-ghost" onClick={() => setSoundPick("swap")}>Choose…</button>
                        </div>
                      </div>
                      {/* Stamps, not a flag: see lib/sound.ts. ▶ on a sound
                          that's playing starts it again from the top. */}
                      <div className="st-transport">
                        <button className="btn" disabled={!selected.props.media} onClick={() => setProp("playAt", Date.now())}>
                          ▶ Play
                        </button>
                        <button className="btn btn-ghost" disabled={!soundPlaying(selected.props)} onClick={() => setProp("stopAt", Date.now())}>
                          ■ Stop
                        </button>
                      </div>
                      <label className="st-row"><span>Volume {Math.round(soundVolume(selected.props) * 100)}%</span>
                        <input type="range" min={0} max={100} value={Math.round(soundVolume(selected.props) * 100)} onChange={(e) => setProp("volume", Number(e.target.value) / 100)} />
                      </label>
                      <label className="st-check"><input type="checkbox" checked={Boolean(selected.props.loop)} onChange={(e) => setProp("loop", e.target.checked)} /><span>Loop until stopped</span></label>
                      <p className="st-hint">
                        Plays in OBS, not in this tab — use ▶ in the sound library to listen here.
                        Nothing shows on stream; the box is only in the editor. Hiding the layer
                        silences it. For OBS&apos;s mixer to show it, tick <em>Control audio via OBS</em> on
                        the browser source.
                      </p>
                    </>
                  ) : selected.props.mode === "chatpets" ? (
                    <>
                      <label className="st-row"><span>Twitch channel</span>
                        <input
                          type="text" placeholder={studio.channel ?? "channel"}
                          value={selected.props.channel ?? ""}
                          onChange={(e) => setProp("channel", e.target.value)}
                        />
                      </label>
                      <button className="btn" onClick={() => setPetsAt(Number(selected.props.size) || CHATPETS_DEFAULTS.size)}>
                        Custom pets…
                      </button>
                      <label className="st-row"><span>Pets</span>
                        <select value={selected.props.set === "emoji" || selected.props.set === "round" ? selected.props.set : "walk"} onChange={(e) => setProp("set", e.target.value)}>
                          <option value="walk">Walking cats</option>
                          <option value="round">Round kittens</option>
                          <option value="emoji">Emoji animals</option>
                        </select>
                      </label>
                      <div className="st-grid">
                        <label><span>Pet size</span><input type="number" min={16} max={256} value={selected.props.size ?? CHATPETS_DEFAULTS.size} onChange={(e) => setProp("size", Number(e.target.value))} /></label>
                        <label><span>Leave after (min)</span><input type="number" min={1} max={240} value={selected.props.idle ?? CHATPETS_DEFAULTS.idle} onChange={(e) => setProp("idle", Number(e.target.value))} /></label>
                        <label><span>Most at once</span><input type="number" min={1} max={200} value={selected.props.max ?? CHATPETS_DEFAULTS.max} onChange={(e) => setProp("max", Number(e.target.value))} /></label>
                      </div>
                      <label className="st-check"><input type="checkbox" checked={selected.props.colors !== false} onChange={(e) => setProp("colors", e.target.checked)} /><span>Names in each chatter&apos;s Twitch colour</span></label>
                      <label className="st-row"><span>Never give a pet to</span>
                        <input
                          type="text" placeholder="nightbot, streamelements, … (the usual bots)"
                          value={selected.props.ignore ?? ""}
                          onChange={(e) => setProp("ignore", e.target.value)}
                        />
                      </label>
                      <p className="st-hint">
                        Everyone who types in chat gets a pet (always the same one) that wanders
                        along the bottom of this box and hops when they chat again. The made-up
                        chatters are only here in the editor.
                      </p>
                    </>
                  ) : (selected.props.mode ?? "html") === "url" ? (
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
                  {selected.props.mode !== "sound" && (
                    <p className="st-hint">
                      Widgets run in a sandboxed iframe with no access to this site.
                    </p>
                  )}
                </>
              )}
            </section>
          )}
        </aside>
      </div>

      {petsAt !== null && (
        <PetSprites studio={studio.slug} channel={studio.channel} petSize={petsAt} onClose={() => setPetsAt(null)} />
      )}

      {soundPick && (
        <SoundLibrary
          studio={studio.slug}
          onClose={() => setSoundPick(null)}
          onPick={(m: MediaItem) => {
            const file = { media: m.id, name: m.name, duration: m.duration };
            if (soundPick === "swap" && selected?.kind === "widget" && selected.props.mode === "sound") {
              // A new file isn't the one that was playing, so whatever was is stopped.
              setProps({ ...file, stopAt: Date.now() });
            } else {
              void call({
                action: "add", kind: "widget", w: 360, h: 64,
                props: { mode: "sound", ...file, volume: 1, loop: false, playAt: 0, stopAt: 0 },
              });
            }
            setSoundPick(null);
          }}
        />
      )}

      {showEmotes && (
        <EmotePicker
          defaultChannel={studio.channel ?? undefined}
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
  if (el.kind === "widget" && p.mode === "sound") return `🔊 ${String(p.name ?? "sound").slice(0, 22)}`;
  if (el.kind === "widget" && p.mode === "chatpets") return `chat pets · #${chatPetsChannel(p.channel) || "?"}`;
  if (el.kind === "widget") return (p.mode ?? "html") === "url" ? String(p.url ?? "(no url)") : "custom HTML";
  if (p.label) return String(p.label).slice(0, 24);
  const u = String(p.url ?? "");
  return u ? u.split("/").pop()!.slice(0, 24) : "(no url)";
}
