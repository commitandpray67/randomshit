"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MediaItem = {
  id: string;
  name: string;
  mime: string;
  size: number;
  duration: number | null;
  createdAt: string;
};

const ERRORS: Record<string, string> = {
  too_big: "That file is too big.",
  not_audio: "That doesn't look like an audio file (mp3, ogg, wav, m4a, flac or webm).",
  library_full: "The library is full. Delete something first.",
  empty: "That file is empty.",
  slow_down: "Too many uploads at once. Wait a minute and try again.",
};

function mb(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function clock(s: number | null): string {
  if (s == null) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

/** How long a file plays, as this browser reads it; null if it can't tell quickly. */
function measure(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const t = setTimeout(() => done(null), 4000);
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      clearTimeout(t);
      done(Number.isFinite(a.duration) ? a.duration : null);
    };
    a.onerror = () => {
      clearTimeout(t);
      done(null);
    };
    a.src = url;
  });
}

/**
 * The studio's sounds (lib/media.ts): upload, listen, pick one for a sound
 * element, delete. Listening here plays in this browser only — it's for
 * checking what a file is, not for the stream.
 */
export default function SoundLibrary({
  studio,
  onPick,
  onClose,
}: {
  studio: string;
  onPick: (item: MediaItem) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [used, setUsed] = useState(0);
  const [maxTotal, setMaxTotal] = useState(0);
  const [maxFile, setMaxFile] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [listening, setListening] = useState<string | null>(null);
  const preview = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const base = `/api/studio/media?studio=${encodeURIComponent(studio)}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error ?? `failed (${res.status})`);
      setItems(data.items);
      setUsed(data.used);
      setMaxTotal(data.maxTotal);
      setMaxFile(data.maxFile);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }, [base]);

  useEffect(() => {
    void load();
    return () => preview.current?.pause();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const file of Array.from(files)) {
      if (maxFile && file.size > maxFile) {
        setError(`${file.name}: too big (the limit is ${mb(maxFile)}).`);
        continue;
      }
      setUploading(file.name);
      try {
        const duration = await measure(file);
        const q = new URLSearchParams({ name: file.name });
        if (duration != null) q.set("duration", String(duration));
        const res = await fetch(`${base}&${q}`, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) setError(`${file.name}: ${ERRORS[data?.error] ?? data?.error ?? `failed (${res.status})`}`);
      } catch (e: any) {
        setError(`${file.name}: ${String(e?.message ?? e)}`);
      }
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
    await load();
  }

  function listen(item: MediaItem) {
    const a = (preview.current ??= new Audio());
    if (listening === item.id) {
      a.pause();
      setListening(null);
      return;
    }
    a.src = `/api/media/${item.id}`;
    a.currentTime = 0;
    a.onended = () => setListening(null);
    void a.play().catch(() => setListening(null));
    setListening(item.id);
  }

  async function remove(item: MediaItem) {
    if (!window.confirm(`Delete “${item.name}”? Sound elements using it will go quiet.`)) return;
    if (listening === item.id) {
      preview.current?.pause();
      setListening(null);
    }
    const res = await fetch(`${base}&id=${item.id}`, { method: "DELETE" });
    if (!res.ok) setError(`Couldn't delete “${item.name}”.`);
    await load();
  }

  return (
    <div className="st-modal-backdrop" onClick={onClose}>
      <div className="st-modal" onClick={(e) => e.stopPropagation()}>
        <div className="st-modal-head">
          <h3>Sounds</h3>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>

        <div className="st-sound-upload">
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.ogg,.wav,.m4a,.flac,.webm"
            multiple
            hidden
            onChange={(e) => void upload(e.target.files)}
          />
          <button className="btn" disabled={uploading !== null} onClick={() => fileRef.current?.click()}>
            {uploading ? `Uploading ${uploading}…` : "Upload sounds"}
          </button>
          {maxTotal > 0 && (
            <span className="st-hint">
              {mb(used)} of {mb(maxTotal)} used · up to {mb(maxFile)} a file
            </span>
          )}
        </div>
        {error && <p className="st-error">{error}</p>}

        {items === null && !error && <p className="st-hint">Loading…</p>}
        {items?.length === 0 && (
          <p className="st-hint">No sounds yet. Upload an mp3, ogg, wav or m4a to start.</p>
        )}
        {items && items.length > 0 && (
          <ul className="st-sounds">
            {items.map((m) => (
              <li key={m.id}>
                <button className="btn btn-ghost" title="Listen here (not on stream)" onClick={() => listen(m)}>
                  {listening === m.id ? "■" : "▶"}
                </button>
                <span className="st-sound-name" title={m.name}>{m.name}</span>
                <span className="st-hint">{[clock(m.duration), mb(m.size)].filter(Boolean).join(" · ")}</span>
                <button className="btn" onClick={() => onPick(m)}>Use</button>
                <button className="btn btn-ghost" title="Delete" onClick={() => void remove(m)}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
