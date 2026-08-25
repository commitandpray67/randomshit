import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { sql } from "@/lib/db";
import {
  ensureOverlayConfig,
  isOverlayAllowed,
  rotateOverlayKey,
  updateOverlaySettings,
} from "@/lib/overlay";
import OverlayPanel from "@/components/OverlayPanel";
import { currentOrigin } from "@/lib/apphost";

/**
 * Control panel for the stream overlay.
 *
 * Restricted to the SteamIDs in POGLY_ALLOWED_STEAM_IDS. Anyone else — logged
 * in or not — gets a 404 rather than a "forbidden", so the feature isn't
 * advertised to people who can't use it. It's deliberately not in the sitemap,
 * the footer, or any locale routing.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Stream overlay",
  robots: { index: false, follow: false },
};

/** Every action re-checks the allowlist — the page render is not the gate. */
async function requireAllowed(): Promise<string> {
  const steamId = await getSession();
  if (!steamId) redirect("/");
  if (!isOverlayAllowed(steamId)) notFound();
  return steamId;
}

async function save(formData: FormData) {
  "use server";
  const steamId = await requireAllowed();
  await updateOverlaySettings(steamId, {
    position: formData.get("position"),
    accent: formData.get("accent"),
    showAvatars: formData.get("showAvatars"),
    anonymize: formData.get("anonymize"),
    showAdded: formData.get("showAdded"),
    showRemoved: formData.get("showRemoved"),
    showReadded: formData.get("showReadded"),
    maxEvents: formData.get("maxEvents"),
    eventTtlSec: formData.get("eventTtlSec"),
    pollSec: formData.get("pollSec"),
  });
  revalidatePath("/overlay");
}

async function rotate() {
  "use server";
  const steamId = await requireAllowed();
  await rotateOverlayKey(steamId);
  revalidatePath("/overlay");
}

export default async function OverlayControlPanel() {
  const steamId = await requireAllowed();
  const config = await ensureOverlayConfig(steamId);

  const user = (
    await sql`SELECT display_name, api_visibility FROM users WHERE steam_id = ${steamId}`
  )[0];

  // Same reasoning as the studio: hand back a URL on the host in use.
  const overlayUrl = `${await currentOrigin()}/overlay/${config.overlayKey}`;

  return (
    <main>
      <div className="topbar">
        <div className="who">
          <div className="name">Stream overlay</div>
          <div className="meta">{user?.display_name ?? steamId}</div>
        </div>
        <div className="topbar-actions">
          <a className="btn btn-ghost" href="/dashboard">Dashboard</a>
        </div>
      </div>

      {user?.api_visibility === "private" && (
        <div className="notice">
          Your Steam friends list is set to <strong>Private</strong>, so nothing can
          be detected and the overlay will stay empty. Set{" "}
          <em>My friends list</em> to <em>Public</em> in your Steam privacy settings.
        </div>
      )}

      <OverlayPanel
        overlayUrl={overlayUrl}
        saveAction={save}
        rotateAction={rotate}
        initial={{
          position: config.position,
          accent: config.accent,
          showAvatars: config.showAvatars,
          anonymize: config.anonymize,
          showAdded: config.showAdded,
          showRemoved: config.showRemoved,
          showReadded: config.showReadded,
          maxEvents: config.maxEvents,
          eventTtlSec: config.eventTtlSec,
          pollSec: config.pollSec,
        }}
      />
    </main>
  );
}
