"use client";

import { useEffect, useState } from "react";

/**
 * The live stream, behind the elements on the editor canvas.
 *
 * Arranging an overlay against an empty rectangle is guesswork — whether a
 * label clears the webcam, whether an emote lands on somebody's face. Putting
 * the stream itself underneath makes the canvas show what the viewer will
 * actually see.
 *
 * Editor only, and never rendered into a browser source: OBS is already
 * capturing the stream this is a preview of, so putting it in the overlay
 * would composite the stream on top of itself.
 *
 * Whether it takes the pointer is the caller's call. Deaf to the pointer it is
 * pure backdrop, and a click on empty canvas still deselects — but then
 * Twitch's own play button can't be reached either, and a stream the browser
 * declined to autoplay has no way to be started. Live, it can be played,
 * paused and unmuted like any other embed.
 */

/**
 * Twitch refuses to embed unless `parent` names the page's own hostname, and
 * it has to match exactly — no port, no scheme. Read from the browser rather
 * than from APP_URL so the preview works on localhost and on the deployed
 * domain without either being configured.
 */
function useParentHost(): string | null {
  const [host, setHost] = useState<string | null>(null);
  useEffect(() => setHost(window.location.hostname), []);
  return host;
}

export default function StreamBackdrop({
  channel,
  width,
  height,
  interactive = false,
}: {
  channel: string;
  width: number;
  height: number;
  /** Let clicks reach the player, so it can be started and controlled. */
  interactive?: boolean;
}) {
  const host = useParentHost();
  const name = channel.trim();

  // Nothing until the hostname is known: rendering a `parent`-less URL first
  // would make Twitch refuse, and the retry would cost a second player load.
  if (!host || !name || !/^[\w]{2,25}$/.test(name)) return null;

  // Controls are always on, and interactivity is toggled with pointer-events
  // instead. Putting `controls` in the URL would mean rebuilding it to change
  // your mind, and rebuilding the URL reloads the player — the same trap the
  // video element had. Locked, they simply never appear, because nothing can
  // hover them.
  const src =
    `https://player.twitch.tv/?channel=${encodeURIComponent(name)}` +
    `&parent=${encodeURIComponent(host)}` +
    // A preview that talks over whoever is arranging the overlay is worse than
    // no preview. Sound belongs in the streamer's own monitor, not here — and
    // muted is also what lets it autoplay at all, where the browser allows it.
    `&muted=true&autoplay=true&controls=true`;

  return (
    <iframe
      title={`${name} — stream preview`}
      src={src}
      // Below every element either way — the elements come later in the DOM, so
      // they paint above it and keep taking their own drags whichever mode
      // this is in. Only clicks on bare canvas change hands.
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        height,
        border: 0,
        zIndex: 0,
        pointerEvents: interactive ? "auto" : "none",
      }}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
