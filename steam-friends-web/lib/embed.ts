/**
 * Turning a pasted video link into something a browser source can actually
 * play.
 *
 * A `<video>` element wants a media file — an mp4, a webm. A YouTube watch
 * link is not one: it is an HTML page, so the element fetches it, fails to
 * find a decodable stream, and renders nothing at all. No error, just an empty
 * box, which is exactly what pasting a YouTube URL into the studio used to
 * produce.
 *
 * The players those sites *do* offer are iframes, so links they recognise get
 * turned into a player URL built here, and everything else stays on the plain
 * `<video>` path. The URL is rebuilt from a validated id rather than passed
 * through, so nothing a user pastes reaches an iframe's src intact.
 */

export type EmbedProvider = "youtube" | "vimeo";

export type Embed = { provider: EmbedProvider; src: string };

export type EmbedOptions = {
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
};

/** Video ids across these providers: word characters and dashes, no more. */
const ID = /^[\w-]{6,24}$/;
const VIMEO_ID = /^\d{6,12}$/;

/**
 * A `t` / `start` offset, in any of the forms these links carry it:
 * `90`, `90s`, `1m30s`, `1h2m3s`.
 */
function seconds(raw: string | null): number | null {
  if (!raw) return null;
  const plain = /^\d+$/.exec(raw.trim());
  if (plain) return Number(plain[0]);

  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw.trim().toLowerCase());
  if (!parts || (!parts[1] && !parts[2] && !parts[3])) return null;
  const total = Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0);
  return total > 0 ? total : null;
}

/** The YouTube video id, whichever of its link shapes was pasted. */
function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return ID.test(id) ? id : null;
  }

  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtube-nocookie.com") {
    return null;
  }

  const v = u.searchParams.get("v");
  if (v && ID.test(v)) return v;

  // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  const seg = u.pathname.split("/").filter(Boolean);
  if (seg.length >= 2 && ["embed", "shorts", "live", "v"].includes(seg[0])) {
    return ID.test(seg[1]) ? seg[1] : null;
  }
  return null;
}

function vimeoId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;

  const seg = u.pathname.split("/").filter(Boolean);
  // vimeo.com/<id> and player.vimeo.com/video/<id>
  const id = seg[0] === "video" ? seg[1] : seg[0];
  return id && VIMEO_ID.test(id) ? id : null;
}

/**
 * The player URL for a pasted link, or null when it looks like a direct media
 * file and should go to `<video>` instead.
 *
 * Autoplay is the whole point here — a browser source has nobody to press play
 * — and every one of these providers refuses to autoplay with sound. Asking
 * for autoplay therefore forces mute, because the alternative is a player that
 * silently never starts.
 */
export function videoEmbed(url: string, opts: EmbedOptions = {}): Embed | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  const autoplay = opts.autoplay !== false;
  const loop = opts.loop !== false;
  const muted = opts.muted !== false || autoplay;

  const yt = youtubeId(u);
  if (yt) {
    const p = new URLSearchParams({
      autoplay: autoplay ? "1" : "0",
      mute: muted ? "1" : "0",
      // No cursor in a browser source, so controls are dead chrome that would
      // sit on top of the stream.
      controls: "0",
      modestbranding: "1",
      rel: "0",
      playsinline: "1",
      disablekb: "1",
      iv_load_policy: "3",
    });
    // A single video loops only when it is also named as the playlist; `loop`
    // on its own is silently ignored.
    if (loop) {
      p.set("loop", "1");
      p.set("playlist", yt);
    }
    const start = seconds(u.searchParams.get("t") ?? u.searchParams.get("start"));
    if (start) p.set("start", String(start));

    // The -nocookie host serves the same player without the tracking cookies.
    return { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${yt}?${p}` };
  }

  const vm = vimeoId(u);
  if (vm) {
    const p = new URLSearchParams({
      autoplay: autoplay ? "1" : "0",
      muted: muted ? "1" : "0",
      loop: loop ? "1" : "0",
      title: "0",
      byline: "0",
      portrait: "0",
      controls: "0",
    });
    return { provider: "vimeo", src: `https://player.vimeo.com/video/${vm}?${p}` };
  }

  return null;
}

/** Whether a URL will render as an embedded player rather than a media file. */
export function isEmbeddable(url: unknown): boolean {
  return typeof url === "string" && url.trim() !== "" && videoEmbed(url) !== null;
}
