import { notFound } from "next/navigation";
import { getConfigByKey } from "@/lib/overlay";
import OverlayStage from "@/components/OverlayStage";

/**
 * The OBS browser source. Reached only via its unguessable key — no login,
 * because a browser source can't carry a session cookie.
 */
export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

/**
 * The root layout paints the site background and renders the site footer on
 * every page, and a browser source needs neither — it has to be transparent so
 * OBS composites it over the scene.
 *
 * Splitting the app into route groups to give the overlay its own root layout
 * would mean moving every existing page, so instead the page ships overrides
 * inline. They're server-rendered into the HTML, so there's no flash of the
 * site chrome before they apply, and they avoid `:has()` — OBS 30 still ships
 * a CEF build that predates it.
 */
const RESET = `
  html, body { background: none transparent !important; }
  body { display: block !important; min-height: 0 !important; overflow: hidden !important; }
  .site-footer { display: none !important; }
`;

export default async function OverlayPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const config = await getConfigByKey(key);
  if (!config) notFound();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: RESET }} />
      <OverlayStage
        overlayKey={config.overlayKey}
        config={{
          position: config.position,
          accent: config.accent,
          showAvatars: config.showAvatars,
          maxEvents: config.maxEvents,
          eventTtlSec: config.eventTtlSec,
          pollSec: config.pollSec,
        }}
      />
    </>
  );
}
