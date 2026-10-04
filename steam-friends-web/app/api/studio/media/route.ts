import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { studioFor, isStudioSlug } from "@/lib/studios";
import { rateLimit } from "@/lib/ratelimit";
import { addMedia, deleteMedia, isMediaId, listMedia, MAX_FILE_BYTES, MAX_STUDIO_BYTES } from "@/lib/media";

/**
 * The studio's media library (lib/media.ts), for its editors.
 *
 *   GET    ?studio=<slug>                       list, plus how much is used
 *   POST   ?studio=<slug>&name=…&duration=…      upload; the body is the file
 *   DELETE ?studio=<slug>&id=<id>               remove
 *
 * The upload is the raw file as the request body rather than a multipart form:
 * one file per request is all the library needs, and it lets the size be
 * checked from Content-Length before anything is read.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

/** The studio this request may touch, or a response saying why not. */
async function gate(req: NextRequest) {
  const steamId = await getSession();
  if (!steamId) return { res: fail("forbidden", 403) };
  const slug = req.nextUrl.searchParams.get("studio");
  if (slug !== null && !isStudioSlug(slug)) return { res: fail("not_found", 404) };
  const studio = await studioFor(steamId, slug);
  // No access and no such studio look the same, as everywhere else.
  if (!studio) return { res: fail("not_found", 404) };
  return { res: null, steamId, studio };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.res) return g.res;
  const { items, used } = await listMedia(g.studio.id);
  return NextResponse.json(
    { ok: true, items, used, maxFile: MAX_FILE_BYTES, maxTotal: MAX_STUDIO_BYTES },
    { headers: NO_STORE },
  );
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.res) return g.res;
  if (!rateLimit(`media:${g.steamId}`, 40, 60).ok) return fail("slow_down", 429);

  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) return fail("too_big", 413);

  const buf = new Uint8Array(await req.arrayBuffer());
  const q = req.nextUrl.searchParams;
  const r = await addMedia(g.studio.id, g.steamId, { name: q.get("name"), duration: q.get("duration"), bytes: buf });
  if (!r.ok) return fail(r.error, r.error === "too_big" ? 413 : r.error === "library_full" ? 409 : 400);
  return NextResponse.json({ ok: true, item: r.item }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
  const g = await gate(req);
  if (g.res) return g.res;
  const id = req.nextUrl.searchParams.get("id");
  if (!isMediaId(id)) return fail("bad_id", 400);
  const gone = await deleteMedia(g.studio.id, id);
  return gone ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : fail("not_found", 404);
}
