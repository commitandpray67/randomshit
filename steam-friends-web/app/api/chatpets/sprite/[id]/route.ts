import { NextRequest } from "next/server";
import { isSpriteId, spriteImage } from "@/lib/petsprites";

/**
 * One uploaded sprite strip. A strip never changes under its id (a new upload
 * gets a new one), so it's cached for good, and only ever served as a PNG.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSpriteId(id)) return new Response("not found", { status: 404 });
  const data = await spriteImage(id);
  if (!data) return new Response("not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(data, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
