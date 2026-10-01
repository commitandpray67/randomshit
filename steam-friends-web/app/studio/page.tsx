import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { studiosFor, isStudioAdmin } from "@/lib/studios";
import StudioAdmin from "@/components/StudioAdmin";

/**
 * /studio on its own: straight on to the first studio this person may edit
 * (see lib/studios.ts). Everything else lives at /studio/<slug>.
 *
 * Anyone with no studio gets a 404 rather than a "forbidden", so the studio
 * isn't advertised to people who can't use it — except an admin, who gets the
 * form to create the first one. Not in the sitemap, the footer, or locale
 * routing.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Overlay studio",
  robots: { index: false, follow: false },
};

export default async function StudioHome() {
  const steamId = await getSession();
  // Straight to Steam and back here, rather than to the home page: on the
  // studio's own host there is nothing on the home page you came for.
  if (!steamId) redirect("/api/auth/steam?to=studio");

  const studios = await studiosFor(steamId);
  if (studios.length > 0) redirect(`/studio/${studios[0].slug}`);
  if (!isStudioAdmin(steamId)) notFound();

  return (
    <main style={{ maxWidth: 520, margin: "3rem auto", padding: "0 16px" }}>
      <h1>Overlay studio</h1>
      <p className="st-hint">No studios yet. Create the first one.</p>
      <StudioAdmin studio={null} />
    </main>
  );
}
