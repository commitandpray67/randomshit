"use client";

import { useEffect, useRef, useState } from "react";
import { soundPlaying, soundSrc, soundVolume } from "@/lib/sound";

/**
 * A sound element (see lib/sound.ts). In the browser source it's an invisible
 * <audio> that plays when ▶ is pressed in the studio and stops on ■. In the
 * editor it's a labelled box and never makes a sound: the editor is someone's
 * browser tab, possibly one of several open on the same studio, and the place
 * the sound has to come out of is OBS.
 */
export default function SoundPlayer({ props, editing }: { props: Record<string, any>; editing: boolean }) {
  if (editing) return <SoundBox props={props} />;
  return <SoundOut props={props} />;
}

function SoundOut({ props }: { props: Record<string, any> }) {
  const ref = useRef<HTMLAudioElement>(null);
  const src = soundSrc(props);
  const playAt = Number(props.playAt) || 0;
  const stopAt = Number(props.stopAt) || 0;
  const loop = Boolean(props.loop);
  const volume = soundVolume(props);

  // The stamps this page has already acted on. Whatever they are when it
  // loads is history — except a loop that's still meant to be going.
  const seen = useRef<{ play: number; stop: number; src: string | null } | null>(null);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.volume = volume;
    a.loop = loop;
  }, [volume, loop]);

  useEffect(() => {
    const a = ref.current;
    if (!a || !src) return;
    const start = () => {
      a.currentTime = 0;
      // OBS lets a browser source start sound by itself; an ordinary tab may
      // refuse, and there's nobody there to click, so a refusal is simply
      // ignored rather than retried.
      void a.play().catch(() => {});
    };
    const prev = seen.current;
    seen.current = { play: playAt, stop: stopAt, src };
    if (!prev || prev.src !== src) {
      if (loop && playAt > stopAt) start();
      return;
    }
    if (stopAt > prev.stop && stopAt >= playAt) {
      a.pause();
      a.currentTime = 0;
    } else if (playAt > prev.play) {
      start();
    }
  }, [src, playAt, stopAt, loop]);

  if (!src) return null;
  return <audio ref={ref} src={src} preload="auto" />;
}

function SoundBox({ props }: { props: Record<string, any> }) {
  const playing = soundPlaying(props);
  // Re-render while it's meant to be playing, so the box notices it ending.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [playing]);

  return (
    <div
      style={{
        width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "0 14px", boxSizing: "border-box", overflow: "hidden",
        border: `2px dashed ${playing ? "rgba(120,220,140,0.95)" : "rgba(140,180,255,0.75)"}`,
        borderRadius: 8, background: playing ? "rgba(120,220,140,0.16)" : "rgba(140,180,255,0.10)",
        color: "#fff", font: "600 18px/1.2 system-ui, sans-serif", textShadow: "0 1px 3px rgba(0,0,0,.6)",
      }}
    >
      <span style={{ fontSize: 26 }}>{playing ? "🔊" : "🔈"}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {soundSrc(props) ? String(props.name ?? "Sound") : "Sound — pick a file"}
        {playing && <span style={{ opacity: 0.8, fontWeight: 400 }}> · playing{props.loop ? " (loop)" : ""}</span>}
      </span>
    </div>
  );
}
