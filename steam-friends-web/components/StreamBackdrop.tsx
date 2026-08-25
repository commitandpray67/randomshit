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
}: {
  channel: string;
  width: number;
  height: number;
}) {
  const host = useParentHost();
  const name = channel.trim();

  // Nothing until the hostname is known: rendering a `parent`-less URL first
  // would make Twitch refuse, and the retry would cost a second player load.
  if (!host || !name || !/^[\w]{2,25}$/.test(name)) return null;

  const src =
    `https://player.twitch.tv/?channel=${encodeURIComponent(name)}` +
    `&parent=${encodeURIComponent(host)}` +
    // A preview that talks over whoever is arranging the overlay is worse than
    // no preview. Sound belongs in the streamer's own monitor, not here.
    `&muted=true&autoplay=true&controls=false`;

  return (
    <iframe
      title={`${name} — stream preview`}
      src={src}
      // Below every element, and deaf to the pointer: this is a backdrop to
      // drag things against, so clicks have to reach the canvas underneath it.
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        height,
        border: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
      allow="autoplay; encrypted-media"
      sandbox="allow-scripts allow-same-origin allow-popups"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
