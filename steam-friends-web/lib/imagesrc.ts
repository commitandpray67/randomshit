/**
 * Turning a pasted image link into one an `<img>` can actually load.
 *
 * The same trap as a YouTube link in a video element, and it bites more often:
 * `imgur.com/abc123` is an HTML page *about* an image, not the image. The
 * browser fetches it, finds no decodable bitmap, and shows nothing — no error,
 * just an empty box. The file itself lives on a different host entirely.
 *
 * Rather than rewriting what was pasted, the mapping happens at render time and
 * produces a *list* to try in order. Imgur serves a given hash under several
 * extensions and there is no way to tell from the link which one is real, so
 * guessing once would be a coin flip; trying `.png`, then `.jpeg`, then `.gif`
 * costs a failed request at worst and always lands on the file. See
 * components/ImageElement, which walks the list.
 */

export type ImageSource = {
  /** URLs to try in order. Empty means the link cannot point at a file. */
  candidates: string[];
  /** Shown in the editor: what was changed, or why nothing could be. */
  note?: string;
};

/** Extensions Imgur will serve a still image under, best guess first. */
const IMGUR_EXTS = ["png", "jpeg", "gif"];
const IMGUR_HASH = /^[a-zA-Z0-9]{5,12}$/;

function imgur(u: URL): ImageSource | null {
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "imgur.com" && host !== "i.imgur.com" && host !== "m.imgur.com") return null;

  const seg = u.pathname.split("/").filter(Boolean);

  // An album or gallery is many images behind one link; picking one out of it
  // needs Imgur's API and a key. Say so rather than showing an empty box.
  if (seg[0] === "a" || seg[0] === "gallery" || seg[0] === "t") {
    return {
      candidates: [],
      note: "That's an Imgur album, which doesn't point at a single file. Open the image itself, right-click it, and copy the image address.",
    };
  }

  const last = seg[seg.length - 1] ?? "";
  const dot = last.lastIndexOf(".");
  const hash = dot > 0 ? last.slice(0, dot) : last;
  const ext = dot > 0 ? last.slice(dot + 1).toLowerCase() : null;
  if (!IMGUR_HASH.test(hash)) return null;

  // Whatever extension was on the link goes first — it is the only real
  // evidence of the stored format — then the usual suspects, then the bare
  // hash, which Imgur also answers.
  const exts = ext ? [ext, ...IMGUR_EXTS.filter((e) => e !== ext)] : IMGUR_EXTS;
  const candidates = [
    ...exts.map((e) => `https://i.imgur.com/${hash}.${e}`),
    `https://i.imgur.com/${hash}`,
  ];

  return {
    candidates,
    note:
      host === "i.imgur.com" && ext
        ? undefined
        : "Imgur page link — loading the image itself from i.imgur.com.",
  };
}

function dropbox(u: URL): ImageSource | null {
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "dropbox.com" && host !== "dl.dropboxusercontent.com") return null;
  if (u.searchParams.get("raw") === "1") return null;

  // `dl=0` is the preview page; `raw=1` is the file.
  const direct = new URL(u.toString());
  direct.searchParams.delete("dl");
  direct.searchParams.set("raw", "1");
  return {
    candidates: [direct.toString()],
    note: "Dropbox share link — loading the file itself.",
  };
}

function giphy(u: URL): ImageSource | null {
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "giphy.com" && host !== "media.giphy.com") return null;

  const seg = u.pathname.split("/").filter(Boolean);
  if (seg[0] !== "gifs" && seg[0] !== "clips") return null;
  // The id is the tail of the slug: "funny-cat-l0HlvtIPzPdt2usKs".
  const id = (seg[1] ?? "").split("-").pop() ?? "";
  if (!/^[a-zA-Z0-9]{6,}$/.test(id)) return null;

  return {
    candidates: [`https://i.giphy.com/media/${id}/giphy.gif`],
    note: "Giphy page link — loading the GIF itself.",
  };
}

/**
 * URLs to try for a pasted image link, in order.
 *
 * Anything not recognised is passed through untouched: most links people paste
 * already point straight at a file, and second-guessing them would break more
 * than it fixed.
 */
export function imageCandidates(url: unknown): ImageSource {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return { candidates: [] };

  // Inline data and blobs are already the image; there is nothing to resolve,
  // and `new URL` would only get in the way.
  if (/^(data|blob):/i.test(raw)) return { candidates: [raw] };

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return {
      candidates: [],
      note: "That doesn't look like a URL. It needs to start with https://",
    };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { candidates: [], note: "Only https:// links can be loaded here." };
  }

  return imgur(u) ?? dropbox(u) ?? giphy(u) ?? { candidates: [raw] };
}
