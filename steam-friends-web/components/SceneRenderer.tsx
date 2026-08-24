"use client";

export type RElement = {
  id: number;
  kind: "text" | "image" | "video" | "widget";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  zIndex: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  clip: string | null;
  props: Record<string, any>;
};

/**
 * Renders one element. Shared by the OBS browser source and the editor canvas,
 * so what you drag around is the same code that goes on stream.
 */
export function ElementView({ el, editing = false }: { el: RElement; editing?: boolean }) {
  const p = el.props ?? {};

  if (el.kind === "text") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent:
            p.align === "center" ? "center" : p.align === "right" ? "flex-end" : "flex-start",
          color: p.color ?? "#fff",
          fontSize: `${p.fontSize ?? 64}px`,
          fontFamily: p.fontFamily ?? "system-ui, sans-serif",
          fontWeight: p.weight ?? 700,
          lineHeight: 1.15,
          textAlign: p.align ?? "left",
          textShadow: p.shadow ? "0 2px 6px rgba(0,0,0,0.75)" : "none",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflow: "hidden",
        }}
      >
        {p.text ?? ""}
      </div>
    );
  }

  if (el.kind === "image") {
    if (!p.url) return <Placeholder label="Image — set a URL" editing={editing} />;
    return (
      <img
        src={p.url}
        alt=""
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: p.fit ?? "contain", display: "block" }}
      />
    );
  }

  if (el.kind === "video") {
    if (!p.url) return <Placeholder label="Video — set a URL" editing={editing} />;
    return (
      <video
        src={p.url}
        // A browser source has no one to click play, so a video that isn't
        // muted+autoplay simply never starts. Muted is the default for that
        // reason, not an oversight.
        autoPlay={p.autoplay !== false}
        loop={p.loop !== false}
        // Editor previews stay silent regardless, so arranging a scene doesn't
        // blast audio at whoever is building it.
        muted={editing ? true : p.muted !== false}
        playsInline
        style={{ width: "100%", height: "100%", objectFit: p.fit ?? "contain", display: "block" }}
      />
    );
  }

  // widget
  const mode = p.mode ?? "html";
  if (mode === "url") {
    if (!p.url) return <Placeholder label="Widget — set a URL" editing={editing} />;
    return (
      <iframe
        src={p.url}
        // Remote page, so its own origin applies — allow-same-origin here does
        // not hand it anything of ours.
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        allow="autoplay; encrypted-media"
      />
    );
  }

  if (!p.html) return <Placeholder label="Widget — add some HTML" editing={editing} />;
  return (
    <iframe
      srcDoc={p.html}
      // NO allow-same-origin: this is arbitrary HTML/JS the user pasted, and it
      // is served from our own origin. Without that token the frame gets an
      // opaque origin and cannot reach the session cookie or the parent DOM.
      sandbox="allow-scripts"
      style={{ width: "100%", height: "100%", border: 0, display: "block", background: "transparent" }}
      allow="autoplay; encrypted-media"
    />
  );
}

function Placeholder({ label, editing }: { label: string; editing: boolean }) {
  // Never draw placeholder chrome on the live overlay — an unconfigured element
  // should be invisible on stream, not a labelled box.
  if (!editing) return null;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px dashed rgba(255,255,255,0.35)",
        borderRadius: 6,
        color: "rgba(255,255,255,0.55)",
        fontSize: 14,
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
        padding: 8,
      }}
    >
      {label}
    </div>
  );
}

/** Absolute-positioned wrapper carrying the transform. */
export function ElementBox({
  el,
  editing = false,
  selected = false,
  onPointerDown,
  children,
}: {
  el: RElement;
  editing?: boolean;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  children?: React.ReactNode;
}) {
  if (el.hidden && !editing) return null;
  return (
    <div
      data-element-id={el.id}
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        transform: `rotate(${el.rotation}deg)`,
        transformOrigin: "center center",
        zIndex: el.zIndex,
        opacity: el.hidden ? (editing ? 0.25 : 0) : el.opacity,
        clipPath: el.clip || undefined,
        outline: selected ? "2px solid #66c0f4" : undefined,
        outlineOffset: 1,
        cursor: editing ? (el.locked ? "not-allowed" : "move") : undefined,
        // Widgets and videos would otherwise swallow the drag gesture.
        pointerEvents: editing ? "auto" : "none",
      }}
    >
      <div style={{ width: "100%", height: "100%", pointerEvents: editing ? "none" : "auto" }}>
        <ElementView el={el} editing={editing} />
      </div>
      {children}
    </div>
  );
}

/** The whole scene, scaled to fit whatever box it's given. */
export default function SceneRenderer({
  elements,
  canvasW,
  canvasH,
  scale = 1,
}: {
  elements: RElement[];
  canvasW: number;
  canvasH: number;
  scale?: number;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: canvasW,
        height: canvasH,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        overflow: "hidden",
      }}
    >
      {elements.map((el) => (
        <ElementBox key={el.id} el={el} />
      ))}
    </div>
  );
}
