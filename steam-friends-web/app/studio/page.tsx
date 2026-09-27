import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOverlayAllowed } from "@/lib/overlay";
import { studioScene, getElements } from "@/lib/scene";
import StudioEditor from "@/components/StudioEditor";
import { currentOrigin } from "@/lib/apphost";

/**
 * Overlay studio — the canvas editor.
 *
 * Same gate as the alert overlay: restricted to POGLY_ALLOWED_STEAM_IDS, and
 * anyone else gets a 404 rather than a "forbidden", so it isn't advertised to
 * people who can't use it. Not in the sitemap, the footer, or locale routing.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Overlay studio",
  robots: { index: false, follow: false },
};

// The channel the canvas shows behind the elements while you arrange them, so
// you're positioning against the actual stream rather than against nothing.
const PREVIEW_CHANNEL =
  process.env.STUDIO_PREVIEW_CHANNEL || process.env.SEVENTV_DEFAULT_CHANNEL || "juntella";

// The editor wants the full window, so the site's centred `main` column and the
// footer are suppressed here. Server-rendered, no :has(), same as the overlay.
const RESET = `
  body { display: block !important; }
  .site-footer { display: none !important; }
`;

export default async function StudioPage() {
  const steamId = await getSession();
  // Straight to Steam and back here, rather than to the home page: on the
  // studio's own host there is nothing on the home page you came for.
  if (!steamId) redirect("/api/auth/steam?to=studio");
  if (!isOverlayAllowed(steamId)) notFound();

  // Browser-source URLs are built from the host this page was reached on, not
  // from APP_URL: whoever is here needs a URL that loads for them, and the
  // canonical domain is unreachable on some connections.
  const site = await currentOrigin();
  const scene = await studioScene(steamId);
  const elements = await getElements(scene.id);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: RESET }} />
      <StudioEditor
        initialSceneKey={scene.sceneKey}
        initialCanvas={{ w: scene.canvasW, h: scene.canvasH }}
        initialElements={elements as any}
        initialVersion={scene.version}
        siteUrl={site}
        previewChannel={PREVIEW_CHANNEL}
      />
    </>
  );
}
