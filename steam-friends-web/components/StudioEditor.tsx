"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ElementView, type RElement } from "./SceneRenderer";
import EmotePicker from "./EmotePicker";

type Canvas = { w: number; h: number };

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

export default function StudioEditor({
  initialSceneKey,
  initialCanvas,
  initialElements,
  siteUrl,
}: {
  initialSceneKey: string;
  initialCanvas: Canvas;
  initialElements: RElement[];
  siteUrl: string;
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
  const [copiedLite, setCopiedLite] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const selected = elements.find((e) => e.id === selectedId) ?? null;

  const sceneUrl = `${siteUrl}/scene/${sceneKey}`;
  // Framework-free build of the same scene, a few KB in one request. For
  // connections that truncate large responses and so never finish loading
  // the normal page.
  const liteUrl = `${siteUrl}/lite/${sceneKey}`;

  /** Call the mutation API and adopt the returned state. */
  const call = useCallback(async (payload: any) => {
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
      if (data.elements) setElements(data.elements);
      if (data.canvas) setCanvas(data.canvas);
      if (data.sceneKey) setSceneKey(data.sceneKey);
      return data;
    } catch (e: any) {
      setError(String(e?.message ?? e));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  // Fit the canvas into the viewport whenever either changes.
  useEffect(() => {
    const fit = () => {
      const box = viewportRef.current;
      if (!box) return;
      const pad = 32;
      const sx = (box.clientWidth - pad) / canvas.w;
      const sy = (box.clientHeight - pad) / canvas.h;
      setScale(Math.max(0.05, Math.min(sx, sy)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [canvas.w, canvas.h]);

  // --- local (optimistic) edits, flushed to the server on release ---------
  const patchLocal = useCallback((id: number, patch: Partial<RElement>) => {
    setElements((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  /**
   * Push interval while dragging. The browser source eases between whatever it
   * receives, so this sets how closely OBS tracks the cursor — 80ms (~12/sec)
   * reads as continuous once interpolated, without a write per mouse event.
   */
  const DRAG_PUSH_MS = 80;

  const lastSent = useRef(0);
  const pending = useRef<{ id: number; patch: any } | null>(null);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback(
    (id: number, patch: any) => {
      lastSent.current = Date.now();
      // Position updates during a drag are throwaway: the next one supersedes
      // this one, so a failure here needs no retry and no busy state. Going
      // through `call` would re-render the whole editor on every push.
      void fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, patch }),
      }).catch(() => {});
    },
    [],
  );

  const flush = useCallback(
    (id: number, patch: any, force = false) => {
      const now = Date.now();
      if (force) {
        if (trailing.current) clearTimeout(trailing.current);
        trailing.current = null;
        pending.current = null;
        send(id, patch);
        return;
      }
      if (now - lastSent.current >= DRAG_PUSH_MS) {
        send(id, patch);
        return;
      }
      // Too soon — remember the latest and fire once the window opens, so the
      // element never stops short of where the cursor actually is.
      pending.current = { id, patch };
      if (!trailing.current) {
        trailing.current = setTimeout(() => {
          trailing.current = null;
          const p = pending.current;
          pending.current = null;
          if (p) send(p.id, p.patch);
        }, DRAG_PUSH_MS - (now - lastSent.current));
      }
    },
    [send],
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

      const start = toCanvas(e);
      const x0 = el.x;
      const y0 = el.y;

      const move = (ev: PointerEvent) => {
        const p = toCanvas(ev);
        const nx = Math.round(x0 + (p.x - start.x));
        const ny = Math.round(y0 + (p.y - start.y));
        patchLocal(el.id, { x: nx, y: ny });
        flush(el.id, { x: nx, y: ny });
      };
      const up = (ev: PointerEvent) => {
        const p = toCanvas(ev);
        const nx = Math.round(x0 + (p.x - start.x));
        const ny = Math.round(y0 + (p.y - start.y));
        flush(el.id, { x: nx, y: ny }, true);
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
        };
      };

      const move = (ev: PointerEvent) => {
        const next = compute(ev);
        patchLocal(el.id, next);
        flush(el.id, next);
      };
      const up = (ev: PointerEvent) => {
        flush(el.id, compute(ev), true);
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
      const cx = el.x + el.w / 2;
      const cy = el.y + el.h / 2;

      const angleAt = (ev: PointerEvent | React.PointerEvent) => {
        const p = toCanvas(ev);
        return (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      };
      const a0 = angleAt(e);
      const r0 = el.rotation;

      const move = (ev: PointerEvent) => {
        let next = Math.round(r0 + (angleAt(ev) - a0));
        // Shift snaps to 15° increments.
        if (ev.shiftKey) next = Math.round(next / 15) * 15;
        next = ((next % 360) + 360) % 360;
        patchLocal(el.id, { rotation: next });
        flush(el.id, { rotation: next });
      };
      const up = (ev: PointerEvent) => {
        let next = Math.round(r0 + (angleAt(ev) - a0));
        if (ev.shiftKey) next = Math.round(next / 15) * 15;
        next = ((next % 360) + 360) % 360;
        flush(el.id, { rotation: next }, true);
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
        flush(selected.id, { x: nx, y: ny }, true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, call, patchLocal, flush]);

  const setProp = (key: string, value: unknown) => {
    if (!selected) return;
    patchLocal(selected.id, { props: { ...selected.props, [key]: value } });
    void call({ action: "update", id: selected.id, patch: { props: { [key]: value } } });
  };

  const setField = (key: keyof RElement, value: unknown) => {
    if (!selected) return;
    patchLocal(selected.id, { [key]: value } as any);
    void call({ action: "update", id: selected.id, patch: { [key]: value } });
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
        {busy && <span className="st-busy">saving…</span>}
        {error && <span className="st-error">{error}</span>}
      </div>

      <div className="st-body">
        {/* ----------------------------- canvas */}
        <div className="st-viewport" ref={viewportRef} onPointerDown={() => setSelectedId(null)}>
          <div
            className="st-canvas"
            style={{
              width: canvas.w,
              height: canvas.h,
              transform: `scale(${scale})`,
              // Must be center, not top-left: the viewport centres this box at
              // its *unscaled* size, so scaling from the top-left corner drags
              // the whole canvas off to negative coordinates. Scaling about the
              // centre keeps it where flex put it. toCanvas() reads the
              // post-transform bounding rect, so it stays correct either way.
              transformOrigin: "center center",
              flex: "none",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
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
                  outline: el.id === selectedId ? "2px solid #66c0f4" : "1px dashed rgba(255,255,255,0.18)",
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
              breaks the old one immediately.
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
                  <span className="st-label">{labelFor(el)}</span>
                  <button title={el.hidden ? "Show" : "Hide"} onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); patchLocal(el.id, { hidden: !el.hidden }); void call({ action: "update", id: el.id, patch: { hidden: !el.hidden } }); }}>
                    {el.hidden ? "🚫" : "👁"}
                  </button>
                  <button title={el.locked ? "Unlock" : "Lock"} onClick={(e) => { e.stopPropagation(); patchLocal(el.id, { locked: !el.locked }); void call({ action: "update", id: el.id, patch: { locked: !el.locked } }); }}>
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
                  onBlur={(e) => call({ action: "update", id: selected.id, patch: { clip: e.target.value } })}
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
                    <input type="url" placeholder="https://…" value={selected.props.url ?? ""} onChange={(e) => setProp("url", e.target.value)} />
                  </label>
                  <label className="st-row"><span>Fit</span>
                    <select value={selected.props.fit ?? "contain"} onChange={(e) => setProp("fit", e.target.value)}>
                      <option>contain</option><option>cover</option><option>fill</option><option>none</option>
                    </select>
                  </label>
                </>
              )}

              {selected.kind === "video" && (
                <>
                  <label className="st-check"><input type="checkbox" checked={selected.props.loop !== false} onChange={(e) => setProp("loop", e.target.checked)} /><span>Loop</span></label>
                  <label className="st-check"><input type="checkbox" checked={selected.props.autoplay !== false} onChange={(e) => setProp("autoplay", e.target.checked)} /><span>Autoplay</span></label>
                  <label className="st-check"><input type="checkbox" checked={selected.props.muted !== false} onChange={(e) => setProp("muted", e.target.checked)} /><span>Muted</span></label>
                  <p className="st-hint">
                    Browsers refuse to autoplay audio with no user gesture, and a browser
                    source has nobody to click. Unmuting usually means the video never
                    starts — route sound through a separate OBS source instead.
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
