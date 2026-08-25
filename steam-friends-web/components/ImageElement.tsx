"use client";

import { useRef, useState } from "react";
import { imageCandidates } from "@/lib/imagesrc";

/**
 * An image element, with somewhere for a bad URL to say so.
 *
 * A plain `<img>` that fails is silent — no error, no console noise, just an
 * empty box that looks exactly like an element you haven't positioned yet. That
 * is what pasting an Imgur page link produced, and there was no way to tell it
 * apart from any other reason nothing was showing.
 *
 * So each candidate URL is tried in turn (see lib/imagesrc for why there is
 * more than one), and when they all fail the editor gets a message saying so.
 * The browser source never does: a broken image on stream should be nothing at
 * all, not a red box explaining itself to the viewers.
 */
export default function ImageElement({
  props: p,
  editing = false,
}: {
  props: Record<string, any>;
  editing?: boolean;
}) {
  const url = String(p.url ?? "");
  const { candidates, note } = imageCandidates(url);

  const [attempt, setAttempt] = useState(0);
  // Start over when the URL changes, or a previous failure would stick to the
  // new one. Adjusted during render rather than in an effect, so a corrected
  // URL never paints one frame of the old failure first.
  const seen = useRef(url);
  if (seen.current !== url) {
    seen.current = url;
    if (attempt !== 0) setAttempt(0);
  }

  const src = candidates[attempt];
  const exhausted = candidates.length > 0 && attempt >= candidates.length;

  if (!url) return <Notice text="Image — set a URL" editing={editing} />;

  if (candidates.length === 0) {
    return <Notice text={note ?? "That URL isn't an image."} editing={editing} />;
  }

  if (exhausted) {
    return (
      <Notice
        editing={editing}
        text={
          note
            ? `Couldn't load it. ${note}`
            : "Couldn't load that image. The link may point at a web page rather than the file — open the image itself and copy its address."
        }
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      // Walk to the next candidate. Imgur answers a hash under more than one
      // extension and the link doesn't say which is real, so a miss here is
      // expected rather than exceptional.
      onError={() => setAttempt((a) => a + 1)}
      style={{ width: "100%", height: "100%", objectFit: p.fit ?? "contain", display: "block" }}
    />
  );
}

function Notice({ text, editing }: { text: string; editing: boolean }) {
  // Never on stream: an element that can't load should be invisible there, not
  // a labelled box in the middle of the overlay.
  if (!editing) return null;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px dashed rgba(226,160,60,0.55)",
        borderRadius: 6,
        background: "rgba(226,160,60,0.06)",
        color: "rgba(226,160,60,0.95)",
        fontSize: 14,
        lineHeight: 1.35,
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
        padding: 10,
        overflow: "hidden",
      }}
    >
      {text}
    </div>
  );
}
