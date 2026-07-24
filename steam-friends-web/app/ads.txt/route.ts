// Serves /ads.txt for Google AdSense. This both works as a verification
// method and is required for ads to serve once approved. Returns 404 until
// NEXT_PUBLIC_ADSENSE_CLIENT is configured.
export const dynamic = "force-dynamic";

export function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT; // e.g. ca-pub-123456...
  if (!client) {
    return new Response("", { status: 404 });
  }
  // ads.txt uses the "pub-..." form (drop the leading "ca-").
  const pub = client.replace(/^ca-/, "");
  const body = `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
