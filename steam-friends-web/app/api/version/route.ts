import { NextResponse } from "next/server";

/**
 * Which build is actually serving this hostname.
 *
 * Vercel deployment URLs containing a hash are pinned to one build forever, so
 * an old one keeps serving old code and any newly added route 404s there. That
 * looks exactly like a bug until you check what is deployed — this makes the
 * answer a single request, on any hostname.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return NextResponse.json(
    {
      ok: true,
      commit: sha ? sha.slice(0, 7) : "local",
      commitFull: sha,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
      env: process.env.VERCEL_ENV ?? "development",
      deploymentUrl: process.env.VERCEL_URL ?? null,
      productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
      // The VPS isn't Vercel: it names itself with SERVER_NAME instead.
      region: process.env.VERCEL_REGION ?? process.env.SERVER_NAME ?? null,
      // Features added over time. If one you expect is missing, the hostname
      // you asked is serving an older build than you think.
      has: {
        diag: true,
        studio: true,
        sceneStream: true,
        emotes: true,
        hostAwareAuth: true,
      },
      now: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
