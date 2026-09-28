import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { resolveForLite } from "@/lib/litescene";
import { getSceneVersion, sceneWithElements } from "@/lib/scene";
import { withLiveMoves } from "@/lib/live";

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

// Readable from any origin. The key is the only credential and no cookie is
// involved, so this exposes nothing; it's what lets a lite page loaded from the
// main site keep polling after its feed is redirected to the studio host.
const NO_STORE = { "Cache-Control": "no-store, max-age=0", "Access-Control-Allow-Origin": "*" };

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

  const found = await sceneWithElements({ key });
  if (!found) {
    return NextResponse.json(
      { ok: false, error: "unknown_scene" },
      { status: 404, headers: NO_STORE },
    );
  }
  const scene = found.scene;
  // Same as the stream: positions already shown live win over a read that
  // predates them.
  const elements = withLiveMoves(scene.version, found.elements);
  // The framework-free renderer has no room for the URL rules, so its feed
  // carries media already resolved. Without this a lite scene renders fine and
  // then breaks on its first update.
  const lite = req.nextUrl.searchParams.get("lite") === "1";
  return NextResponse.json(
    {
      ok: true,
      version: scene.version,
      canvas: { w: scene.canvasW, h: scene.canvasH },
      elements: lite ? resolveForLite(elements) : elements,
    },
    { headers: NO_STORE },
  );
}
