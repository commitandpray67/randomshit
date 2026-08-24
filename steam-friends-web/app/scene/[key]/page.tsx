import { notFound } from "next/navigation";
import { getSceneByKey, getElements } from "@/lib/scene";
import SceneStage from "@/components/SceneStage";

/**
 * The OBS browser source for a studio scene. Reached only via its unguessable
 * key — a browser source can't carry a session cookie.
 *
 * Server-rendered with the current elements so the scene is on screen from the
 * first paint rather than after the first poll.
 */
export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

// Same reasoning as the alert overlay: the root layout paints a background and
// a footer that a browser source must not have. Server-rendered so there's no
// flash, and no :has() since OBS 30 ships a CEF that predates it.
const RESET = `
  html, body { background: none transparent !important; }
  body { display: block !important; min-height: 0 !important; overflow: hidden !important; margin: 0 !important; }
  .site-footer { display: none !important; }
`;

export default async function ScenePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const scene = await getSceneByKey(key);
  if (!scene) notFound();

  const elements = await getElements(scene.id);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: RESET }} />
      <SceneStage
        sceneKey={scene.sceneKey}
        initialVersion={scene.version}
        initialCanvas={{ w: scene.canvasW, h: scene.canvasH }}
        initialElements={elements as any}
      />
    </>
  );
}
