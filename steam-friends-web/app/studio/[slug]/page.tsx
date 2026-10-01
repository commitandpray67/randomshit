import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { sceneWithElements } from "@/lib/scene";
import { withLiveMoves } from "@/lib/live";
import { studiosFor, isStudioAdmin, isStudioSlug } from "@/lib/studios";
import StudioEditor from "@/components/StudioEditor";
import { currentOrigin } from "@/lib/apphost";

/**
 * Overlay studio — the canvas editor, for one streamer's studio.
 *
 * Only for people who may edit this studio (its members, and admins; see
 * lib/studios.ts). Anyone else gets a 404 whether or not the studio exists, so
 * which streamers have one isn't advertised.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Overlay studio",
  robots: { index: false, follow: false },
};

// The editor wants the full window, so the site's centred `main` column and the
// footer are suppressed here. Server-rendered, no :has(), same as the overlay.
const RESET = `
  body { display: block !important; }
  .site-footer { display: none !important; }
`;

export default async function StudioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const steamId = await getSession();
  if (!steamId) redirect("/api/auth/steam?to=studio");
  if (!isStudioSlug(slug)) notFound();

  const studios = await studiosFor(steamId);
  const studio = studios.find((s) => s.slug === slug);
  if (!studio) notFound();

  // Browser-source URLs are built from the host this page was reached on, not
  // from APP_URL: whoever is here needs a URL that loads for them, and the
  // canonical domain is unreachable on some connections.
  const site = await currentOrigin();
  const found = await sceneWithElements({ id: studio.sceneId });
  if (!found) notFound();
  const { scene } = found;
  const elements = withLiveMoves(scene.version, found.elements);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: RESET }} />
      <StudioEditor
        key={studio.slug}
        studio={{ slug: studio.slug, name: studio.name, channel: studio.channel }}
        studios={studios.map((s) => ({ slug: s.slug, name: s.name }))}
        isAdmin={isStudioAdmin(steamId)}
        initialSceneKey={scene.sceneKey}
        initialCanvas={{ w: scene.canvasW, h: scene.canvasH }}
        initialElements={elements as any}
        initialVersion={scene.version}
        siteUrl={site}
      />
    </>
  );
}
