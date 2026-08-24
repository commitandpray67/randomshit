import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { getSceneByKey, getElements, getSceneVersion } from "@/lib/scene";

/**
 * Scene feed for the OBS browser source.
 *
 * The source polls with ?v=<version it has>. When nothing changed the reply is
 * a few bytes, so a scene that sits still all stream costs one cheap query per
 * poll instead of shipping every element repeatedly.
 *
 * The scene key is the only credential — a browser source can't send a cookie.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const rl = rateLimit(`scene:${key}`, 240, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfter) } },
    );
  }
  const ipRl = rateLimit(`scene-ip:${clientIp(req)}`, 480, 60);
  if (!ipRl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(ipRl.retryAfter) } },
    );
  }

  const have = req.nextUrl.searchParams.get("v");

  // Fast path: caller already has a version, so check the number before
  // loading any elements.
  if (have !== null) {
    const version = await getSceneVersion(key);
    if (version === null) {
      return NextResponse.json(
        { ok: false, error: "unknown_scene" },
        { status: 404, headers: NO_STORE },
      );
    }
    if (String(version) === have) {
      return NextResponse.json({ ok: true, unchanged: true, version }, { headers: NO_STORE });
    }
  }

  const scene = await getSceneByKey(key);
  if (!scene) {
    return NextResponse.json(
      { ok: false, error: "unknown_scene" },
      { status: 404, headers: NO_STORE },
    );
  }

  const elements = await getElements(scene.id);
  return NextResponse.json(
    {
      ok: true,
      version: scene.version,
      canvas: { w: scene.canvasW, h: scene.canvasH },
      elements: elements.filter((e) => !e.hidden),
    },
    { headers: NO_STORE },
  );
}
