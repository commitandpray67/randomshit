import { NextRequest } from "next/server";
import { getMedia, isMediaId } from "@/lib/media";

/**
 * One file from a studio's media library, for the browser source to play.
 *
 * No login: OBS can't carry one, so the random id is the credential, as with
 * scene keys. A file never changes under its id — replacing a sound means a
 * new upload — so it can be cached for good.
 *
 * Answers range requests, which media elements make as a matter of course and
 * need for seeking (restarting a sound is a seek to 0).
 */
export const dynamic = "force-dynamic";

const HEADERS = {
  "Accept-Ranges": "bytes",
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
  "X-Robots-Tag": "noindex",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMediaId(id)) return new Response("not found", { status: 404 });
  const file = await getMedia(id);
  if (!file) return new Response("not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const size = file.data.length;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    // "bytes=a-b", "bytes=a-" or the last b bytes for "bytes=-b".
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...HEADERS, "Content-Range": `bytes */${size}` } });
    }
    start = Math.max(0, start);
    return new Response(file.data.slice(start, end + 1), {
      status: 206,
      headers: {
        ...HEADERS,
        "Content-Type": file.mime,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
      },
    });
  }

  return new Response(file.data, {
    headers: { ...HEADERS, "Content-Type": file.mime, "Content-Length": String(size) },
  });
}
