"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Background,
  clearBackground,
  findFrames,
  guessBackground,
  layoutStrip,
  uploadScale,
} from "@/lib/spritesheet";

type Sprite = {
  id: string;
  name: string;
  login: string | null;
  everywhere: boolean;
  w: number;
  h: number;
  createdAt: string;
};

type Prepared = { src: string; w: number; h: number; blob: Blob; warnings: string[] };

const ERRORS: Record<string, string> = {
  not_png: "That didn't come out as a picture. Try the sheet again.",
  bad_size: "That comes out too big. Try a smaller size.",
  too_big: "That comes out too big. Try a smaller size.",
  full: "This studio has as many custom pets as it can hold. Delete one first.",
  bad_login: "That isn't a Twitch name (letters, numbers and _ only).",
  admins_only: "Only admins can give a pet to someone in every streamer's chat.",
  slow_down: "Too many uploads at once. Wait a minute and try again.",
};

const SIZES: [number, string][] = [
  [0.75, "Small"],
  [1, "Like a cat"],
  [1.3, "Big"],
  [1.7, "Huge"],
];

function loginOf(s: string): string {
  return s.trim().toLowerCase().replace(/^@/, "");
}

/** The first frame of a strip, as a thumbnail. */
function Thumb({ src, w, h, size = 44 }: { src: string; w: number; h: number; size?: number }) {
  const k = size / Math.max(w, h);
  return (
    <span
      style={{
        display: "inline-block", width: w * k, height: h * k, flex: "none",
        backgroundImage: `url(${src})`, backgroundSize: "400% 100%", backgroundPosition: "0 0", backgroundRepeat: "no-repeat",
      }}
    />
  );
}

/**
 * Chat pets uploaded for this studio's chat (lib/petsprites.ts): add one from
 * a sheet, give it to someone or to the mix, try it, take it away.
 *
 * The sheet is cut in this browser with the same rules as the built-in ones
 * (lib/spritesheet.ts), so what's tested here is exactly what's saved, and
 * only the finished strip is uploaded. The test is the real pets page, sent
 * the unsaved strip by message, so it moves exactly as it will on stream.
 */
export default function PetSprites({
  studio,
  channel,
  petSize,
  onClose,
}: {
  studio: string;
  channel: string | null;
  petSize: number;
  onClose: () => void;
}) {
  const [sprites, setSprites] = useState<Sprite[] | null>(null);
  const [builtIn, setBuiltIn] = useState<{ login: string; sprite: string }[]>([]);
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The sheet being prepared, and how.
  const [sheet, setSheet] = useState<{ name: string; pixels: ImageData } | null>(null);
  const [bg, setBg] = useState<Background>("transparent");
  const [mirror, setMirror] = useState(false);
  const [size, setSize] = useState(1);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [everywhere, setEverywhere] = useState(false);
  const [saving, setSaving] = useState(false);

  /** What the test strip is showing: the sheet being prepared, or a saved one. */
  const [testing, setTesting] = useState<{ src: string; w: number; h: number; name: string } | null>(null);
  const testRef = useRef<HTMLIFrameElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const base = `/api/studio/pets?studio=${encodeURIComponent(studio)}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error ?? `failed (${res.status})`);
      setSprites(data.sprites);
      setBuiltIn(data.builtIn ?? []);
      setAdmin(Boolean(data.admin));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const bmp = await createImageBitmap(file);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      const pixels = ctx.getImageData(0, 0, c.width, c.height);
      setBg(guessBackground(pixels.data, c.width, c.height));
      setMirror(false);
      setSize(1);
      setName(file.name.replace(/\.[a-z0-9]{1,5}$/i, "").slice(0, 40));
      setSheet({ name: file.name, pixels });
    } catch {
      setError("That file couldn't be opened as a picture.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  // Cut the sheet whenever it or an option changes.
  useEffect(() => {
    if (!sheet) {
      setPrepared(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { width: W, height: H } = sheet.pixels;
        const data = new Uint8ClampedArray(sheet.pixels.data);
        clearBackground(data, W, H, bg);
        const { frames, warnings } = findFrames(data, W, H, mirror);
        const scale = uploadScale(frames, size);
        const strip = layoutStrip(frames, scale, mirror);

        const src = document.createElement("canvas");
        src.width = W;
        src.height = H;
        src.getContext("2d")!.putImageData(new ImageData(data, W, H), 0, 0);
        const out = document.createElement("canvas");
        out.width = strip.width;
        out.height = strip.height;
        const ctx = out.getContext("2d")!;
        // Smooth when shrinking, as the built-ins are; crisp blocks when a
        // small pixel-art sheet has to be blown up.
        ctx.imageSmoothingEnabled = scale < 1;
        ctx.imageSmoothingQuality = "high";
        for (const c of strip.cells) {
          ctx.save();
          if (c.flip) {
            ctx.translate(c.left + c.width, c.top);
            ctx.scale(-1, 1);
            ctx.drawImage(src, c.from.left, c.from.top, c.from.width, c.from.height, 0, 0, c.width, c.height);
          } else {
            ctx.drawImage(src, c.from.left, c.from.top, c.from.width, c.from.height, c.left, c.top, c.width, c.height);
          }
          ctx.restore();
        }
        const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
        if (cancelled || !blob) return;
        setPrepared({ src: out.toDataURL("image/png"), w: strip.cellW, h: strip.cellH, blob, warnings });
        setError(null);
      } catch (e: any) {
        if (!cancelled) {
          setPrepared(null);
          setError(`Couldn't find four frames in that sheet: ${String(e?.message ?? e)}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheet, bg, mirror, size]);

  // The sheet being prepared is what the test shows, as soon as it's cut.
  useEffect(() => {
    if (prepared) setTesting({ src: prepared.src, w: prepared.w, h: prepared.h, name: loginOf(login) || name || "new_pet" });
  }, [prepared, login, name]);

  const sendTest = useCallback(() => {
    if (!testing) return;
    testRef.current?.contentWindow?.postMessage(
      { type: "chatpets-test", sprite: { src: testing.src, w: testing.w, h: testing.h }, name: testing.name },
      "*",
    );
  }, [testing]);

  useEffect(() => {
    sendTest();
  }, [sendTest]);

  async function save() {
    if (!prepared) return;
    setSaving(true);
    setError(null);
    try {
      const q = new URLSearchParams({ name: name || "Pet", login: loginOf(login) });
      if (everywhere && loginOf(login)) q.set("everywhere", "1");
      const res = await fetch(`${base}&${q}`, { method: "POST", headers: { "Content-Type": "image/png" }, body: prepared.blob });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(ERRORS[data?.error] ?? data?.error ?? `Saving failed (${res.status}).`);
        return;
      }
      setSheet(null);
      setLogin("");
      setEverywhere(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function patch(s: Sprite, change: Partial<Pick<Sprite, "login" | "everywhere" | "name">>) {
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, ...change }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) setError(ERRORS[data?.error] ?? data?.error ?? `Couldn't change it (${res.status}).`);
    await load();
  }

  async function remove(s: Sprite) {
    if (!window.confirm(`Delete “${s.name}”?${s.login ? ` ${s.login} goes back to an ordinary pet.` : ""}`)) return;
    const res = await fetch(`${base}&id=${s.id}`, { method: "DELETE" });
    if (!res.ok) setError(`Couldn't delete “${s.name}”.`);
    await load();
  }

  function reassign(s: Sprite) {
    const next = window.prompt(
      `Give “${s.name}” to which Twitch name? Leave it empty to put it in everyone's random mix instead.`,
      s.login ?? "",
    );
    if (next === null) return;
    void patch(s, { login: loginOf(next) || null, ...(loginOf(next) ? {} : { everywhere: false }) });
  }

  return (
    <div className="st-modal-backdrop" onClick={onClose}>
      <div className="st-modal st-pets" onClick={(e) => e.stopPropagation()}>
        <div className="st-modal-head">
          <h3>Custom pets{channel ? ` · #${channel}` : ""}</h3>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>

        {/* ---- the test strip: the real pets page */}
        <iframe
          ref={testRef}
          className="st-pets-test"
          src={`/chatpets?test=1&size=${petSize}`}
          sandbox="allow-scripts"
          onLoad={sendTest}
          title="Test"
        />
        <p className="st-hint">
          {testing
            ? `Testing ${testing.name}, next to two ordinary pets at your chat pets' size.`
            : "Pick a sheet, or press Test on one below, to see it walk."}
        </p>

        {/* ---- adding one */}
        <section className="st-pets-add">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickFile(e.target.files?.[0])} />
          {!sheet ? (
            <>
              <button className="btn" onClick={() => fileRef.current?.click()}>Upload a sprite sheet…</button>
              <p className="st-hint">
                A 2×2 sheet: two frames walking right on top, two walking left underneath (or tick
                “all frames face right”). Transparent, black or white background.
              </p>
            </>
          ) : (
            <>
              {prepared && <img className="st-pets-strip" src={prepared.src} alt="The four frames" />}
              {prepared?.warnings.length ? (
                <p className="st-error">A frame touches the edge of its quarter of the sheet; check nothing is cut off.</p>
              ) : null}
              <div className="st-grid">
                <label><span>Background</span>
                  <select value={bg} onChange={(e) => setBg(e.target.value as Background)}>
                    <option value="transparent">Transparent</option>
                    <option value="black">Black</option>
                    <option value="white">White</option>
                  </select>
                </label>
                <label><span>Size</span>
                  <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
                    {SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </div>
              <label className="st-check">
                <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
                <span>All frames face right (flip them to walk left)</span>
              </label>
              <label className="st-row"><span>Name</span>
                <input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="st-row"><span>Give it to (Twitch name)</span>
                <input type="text" placeholder="empty = everyone's random mix" value={login} onChange={(e) => setLogin(e.target.value)} />
              </label>
              {admin && loginOf(login) && (
                <label className="st-check">
                  <input type="checkbox" checked={everywhere} onChange={(e) => setEverywhere(e.target.checked)} />
                  <span>In every streamer&apos;s chat, not just this one</span>
                </label>
              )}
              <div className="st-transport">
                <button className="btn" disabled={!prepared || saving} onClick={() => void save()}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="btn btn-ghost" onClick={() => setSheet(null)}>Cancel</button>
              </div>
            </>
          )}
        </section>
        {error && <p className="st-error">{error}</p>}

        {/* ---- what's there */}
        {sprites && sprites.length > 0 && (
          <ul className="st-sounds st-pets-list">
            {sprites.map((s) => {
              const src = `/api/chatpets/sprite/${s.id}`;
              return (
                <li key={s.id}>
                  <Thumb src={src} w={s.w} h={s.h} />
                  <span className="st-sound-name" title={s.name}>
                    {s.name}
                    <span className="st-hint">
                      {" · "}
                      {s.login ? `${s.login}'s${s.everywhere ? ", every chat" : ""}` : "random mix"}
                    </span>
                  </span>
                  <button className="btn btn-ghost" onClick={() => setTesting({ src, w: s.w, h: s.h, name: s.login ?? s.name })}>Test</button>
                  <button className="btn btn-ghost" onClick={() => reassign(s)}>Give to…</button>
                  {admin && s.login && (
                    <button className="btn btn-ghost" title="Every streamer's chat, or just this one" onClick={() => void patch(s, { everywhere: !s.everywhere })}>
                      {s.everywhere ? "Just here" : "Everywhere"}
                    </button>
                  )}
                  <button className="btn btn-ghost" title="Delete" onClick={() => void remove(s)}>✕</button>
                </li>
              );
            })}
          </ul>
        )}
        {sprites?.length === 0 && !sheet && <p className="st-hint">No custom pets yet.</p>}
        {builtIn.length > 0 && (
          <p className="st-hint">
            Built into the app, in every chat: {builtIn.map((b) => `${b.login} (${b.sprite.split("/").pop()})`).join(", ")}.
            A pet uploaded for one of them here takes over.
          </p>
        )}
        <p className="st-hint">
          Changes reach the stream within a minute, without reloading OBS.
        </p>
      </div>
    </div>
  );
}
