import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOverlayAllowed } from "@/lib/overlay";
import { ensureScene, getElements } from "@/lib/scene";
import StudioEditor from "@/components/StudioEditor";

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

const SITE = process.env.APP_URL || "https://steamfriends.xyz";

// The editor wants the full window, so the site's centred `main` column and the
// footer are suppressed here. Server-rendered, no :has(), same as the overlay.
const RESET = `
  body { display: block !important; }
  .site-footer { display: none !important; }
`;

export default async function StudioPage() {
  const steamId = await getSession();
  if (!steamId) redirect("/");
  if (!isOverlayAllowed(steamId)) notFound();

  const scene = await ensureScene(steamId);
  const elements = await getElements(scene.id);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: RESET }} />
      <StudioEditor
        initialSceneKey={scene.sceneKey}
        initialCanvas={{ w: scene.canvasW, h: scene.canvasH }}
        initialElements={elements as any}
        siteUrl={SITE}
      />
    </>
  );
}
