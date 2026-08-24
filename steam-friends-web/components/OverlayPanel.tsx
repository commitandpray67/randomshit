"use client";

import { useState } from "react";
import OverlayStage, { type StageConfig } from "./OverlayStage";

// Declared here rather than imported from lib/overlay, which pulls in postgres
// and node:crypto and must not reach the client bundle. Kept in step with the
// CHECK constraint on overlay_configs.position.
type OverlayPosition = StageConfig["position"];

const POSITIONS: OverlayPosition[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

export type PanelConfig = StageConfig & {
  anonymize: boolean;
  showAdded: boolean;
  showRemoved: boolean;
  showReadded: boolean;
};

/**
 * Settings form for the stream overlay. State lives here so the preview updates
 * as the controls move; the inputs keep their `name` attributes so the same
 * form still posts through the server action on save.
 */
export default function OverlayPanel({
  initial,
  overlayUrl,
  saveAction,
  rotateAction,
}: {
  initial: PanelConfig;
  overlayUrl: string;
  saveAction: (formData: FormData) => void;
  rotateAction: () => void;
}) {
  const [cfg, setCfg] = useState<PanelConfig>(initial);
  const [copied, setCopied] = useState(false);

  function set<K extends keyof PanelConfig>(key: K, value: PanelConfig[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure origin, denied permission) — the input is
      // right there and selectable, so there's nothing to recover from.
    }
  }

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Browser source URL</h2>
        <p className="ov-hint">
          In OBS: <strong>Sources → + → Browser</strong>, paste this URL, and set the
          size to match your canvas (1920×1080 is typical). Leave{" "}
          <em>Shutdown source when not visible</em> unchecked so alerts keep arriving.
        </p>
        <div className="ov-url-row">
          <input className="ov-url" readOnly value={overlayUrl} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="ov-hint ov-warn">
          Anyone with this URL can watch your friend activity. Don&apos;t show it on
          stream — if it leaks, rotate it below.
        </p>
      </div>

      <div className="ov-split">
        <form action={saveAction} className="card ov-settings">
          <h2 style={{ marginTop: 0 }}>Settings</h2>

          <label className="ov-field">
            <span>Corner</span>
            <select
              name="position"
              value={cfg.position}
              onChange={(e) => set("position", e.target.value as OverlayPosition)}
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p.replace("-", " ")}
                </option>
              ))}
            </select>
          </label>

          <label className="ov-field">
            <span>Accent</span>
            <input
              type="color"
              name="accent"
              value={cfg.accent}
              onChange={(e) => set("accent", e.target.value)}
            />
          </label>

          <fieldset className="ov-fieldset">
            <legend>Alert on</legend>
            <label className="ov-check">
              <input
                type="checkbox"
                name="showRemoved"
                checked={cfg.showRemoved}
                onChange={(e) => set("showRemoved", e.target.checked)}
              />
              <span>Unfriends</span>
            </label>
            <label className="ov-check">
              <input
                type="checkbox"
                name="showAdded"
                checked={cfg.showAdded}
                onChange={(e) => set("showAdded", e.target.checked)}
              />
              <span>New friends</span>
            </label>
            <label className="ov-check">
              <input
                type="checkbox"
                name="showReadded"
                checked={cfg.showReadded}
                onChange={(e) => set("showReadded", e.target.checked)}
              />
              <span>Re-adds</span>
            </label>
          </fieldset>

          <fieldset className="ov-fieldset">
            <legend>Privacy</legend>
            <label className="ov-check">
              <input
                type="checkbox"
                name="showAvatars"
                checked={cfg.showAvatars}
                onChange={(e) => set("showAvatars", e.target.checked)}
              />
              <span>Show avatars</span>
            </label>
            <label className="ov-check">
              <input
                type="checkbox"
                name="anonymize"
                checked={cfg.anonymize}
                onChange={(e) => set("anonymize", e.target.checked)}
              />
              <span>
                Hide names — show &ldquo;Someone&rdquo; instead
              </span>
            </label>
          </fieldset>

          <label className="ov-field">
            <span>Max on screen</span>
            <input
              type="number"
              name="maxEvents"
              min={1}
              max={20}
              value={cfg.maxEvents}
              onChange={(e) => set("maxEvents", Number(e.target.value))}
            />
          </label>

          <label className="ov-field">
            <span>Alert duration (s)</span>
            <input
              type="number"
              name="eventTtlSec"
              min={3}
              max={3600}
              value={cfg.eventTtlSec}
              onChange={(e) => set("eventTtlSec", Number(e.target.value))}
            />
          </label>

          <label className="ov-field">
            <span>Check every (s)</span>
            <input
              type="number"
              name="pollSec"
              min={5}
              max={300}
              value={cfg.pollSec}
              onChange={(e) => set("pollSec", Number(e.target.value))}
            />
          </label>
          <p className="ov-hint">
            Steam is only re-checked once a minute no matter how fast the overlay
            polls, so a short interval mainly affects how quickly a detected change
            reaches the screen.
          </p>

          <button className="btn" type="submit">Save settings</button>
        </form>

        <div className="card ov-preview-card">
          <h2 style={{ marginTop: 0 }}>Preview</h2>
          <p className="ov-hint">
            Sample alerts on a checkerboard — the real overlay is transparent.
          </p>
          <div className="ov-preview">
            <OverlayStage
              demo
              config={cfg}
              demoTypes={[
                ...(cfg.showRemoved ? (["removed"] as const) : []),
                ...(cfg.showAdded ? (["added"] as const) : []),
                ...(cfg.showReadded ? (["readded"] as const) : []),
              ]}
            />
          </div>
        </div>
      </div>

      <form action={rotateAction} className="card">
        <h2 style={{ marginTop: 0 }}>Rotate URL</h2>
        <p className="ov-hint">
          Issues a new key and breaks the old URL immediately. You&apos;ll need to
          paste the new one into OBS.
        </p>
        <button className="btn btn-ghost" type="submit">Rotate overlay URL</button>
      </form>
    </>
  );
}
