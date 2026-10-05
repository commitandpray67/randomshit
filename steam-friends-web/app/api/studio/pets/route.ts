import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { studioFor, isStudioAdmin, isStudioSlug } from "@/lib/studios";
import { rateLimit } from "@/lib/ratelimit";
import {
  addSprite,
  deleteSprite,
  isSpriteId,
  listSprites,
  setDefaultMix,
  updateSprite,
  MAX_SPRITE_BYTES,
} from "@/lib/petsprites";

/**
 * Chat pets for a studio's editors (lib/petsprites.ts).
 *
 *   GET    ?studio=<slug>                               its sprites and the every-chat ones
 *   POST   ?studio=<slug>&name=…&login=…&global=1       upload; the body is the strip PNG
 *   PATCH  ?studio=<slug>   { id, name?, login?, global? }   change a sprite
 *   PATCH  ?studio=<slug>   { defaultMix: boolean }          use the default mix in this chat or not
 *   DELETE ?studio=<slug>&id=<id>
 *
 * Every-chat sprites (global: the default mix, and chatters' pets in every
 * streamer's chat) are for admins to add, change and delete: they show on
 * other streamers' overlays, which their own editors should otherwise be the
 * only ones to touch. A studio's editors see them, read-only.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

async function gate(req: NextRequest) {
  const steamId = await getSession();
  if (!steamId) return { res: fail("forbidden", 403) };
  const slug = req.nextUrl.searchParams.get("studio");
  if (slug !== null && !isStudioSlug(slug)) return { res: fail("not_found", 404) };
  const studio = await studioFor(steamId, slug);
  if (!studio) return { res: fail("not_found", 404) };
  return { res: null, steamId, studio, admin: isStudioAdmin(steamId) };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.res) return g.res;
  const { sprites, defaultMix } = await listSprites(g.studio.id);
  return NextResponse.json(
    { ok: true, sprites, defaultMix, admin: g.admin, maxBytes: MAX_SPRITE_BYTES },
    { headers: NO_STORE },
  );
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.res) return g.res;
  if (!rateLimit(`pets:${g.steamId}`, 30, 60).ok) return fail("slow_down", 429);
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_SPRITE_BYTES) return fail("too_big", 413);

  const q = req.nextUrl.searchParams;
  const global = q.get("global") === "1";
  if (global && !g.admin) return fail("admins_only", 403);
  const r = await addSprite(g.studio.id, g.steamId, {
    name: q.get("name"),
    login: q.get("login"),
    global,
    bytes: new Uint8Array(await req.arrayBuffer()),
  });
  if (!r.ok) return fail(r.error, r.error === "too_big" ? 413 : r.error === "full" ? 409 : 400);
  return NextResponse.json({ ok: true, sprite: r.sprite }, { headers: NO_STORE });
}

export async function PATCH(req: NextRequest) {
  const g = await gate(req);
  if (g.res) return g.res;
  const body = await req.json().catch(() => null);
  if (!body) return fail("bad_request", 400);

  if (typeof body.defaultMix === "boolean") {
    await setDefaultMix(g.studio.id, body.defaultMix);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  if (!isSpriteId(body.id)) return fail("bad_id", 400);
  if (body.global !== undefined && !g.admin) return fail("admins_only", 403);
  const r = await updateSprite(g.studio.id, g.admin, body.id, {
    name: body.name,
    login: body.login,
    global: typeof body.global === "boolean" ? body.global : undefined,
  });
  if (r === "bad_login") return fail("bad_login", 400);
  // Not found and not yours to change look the same.
  if (!r) return fail("not_found", 404);
  return NextResponse.json({ ok: true, sprite: r }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
  const g = await gate(req);
  if (g.res) return g.res;
  const id = req.nextUrl.searchParams.get("id");
  if (!isSpriteId(id)) return fail("bad_id", 400);
  return (await deleteSprite(g.studio.id, g.admin, id))
    ? NextResponse.json({ ok: true }, { headers: NO_STORE })
    : fail("not_found", 404);
}
