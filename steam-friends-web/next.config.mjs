/**
 * Where the studio lives, if it isn't here.
 *
 * The studio holds long-lived connections — SSE to every editor and every OBS
 * browser source, and a LISTEN on the database — which serverless handles
 * badly, so it can run on its own host (see DEPLOY-VPS.md). Setting this on
 * the main deployment sends /studio and /scene/* there; unset, nothing moves.
 *
 * Redirects are fixed at build time, so changing it needs a redeploy.
 */
const studioOrigin = (process.env.STUDIO_ORIGIN || "").trim().replace(/\/+$/, "");

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

// Never on the studio host itself. The obvious way to configure the VPS is to
// copy every variable across from Vercel, STUDIO_ORIGIN included, and a studio
// host that redirects /studio to itself is an infinite loop.
const handOffStudio =
  studioOrigin !== "" && hostOf(studioOrigin) !== hostOf(process.env.APP_URL || "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A self-contained server for the Docker image: just the files `next start`
  // needs, rather than all of node_modules. Vercel ignores it.
  output: "standalone",

  // Allow Steam avatar/profile images if you render them later.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.steamstatic.com" },
      { protocol: "https", hostname: "avatars.akamai.steamstatic.com" },
    ],
  },

  async redirects() {
    if (!handOffStudio) return [];
    // Temporary, not permanent: browsers cache a 308 indefinitely, and taking
    // the studio back would then need everyone to clear their cache. OBS
    // follows either kind, so existing browser sources keep working without
    // anyone re-pasting a URL.
    return [
      { source: "/studio", destination: `${studioOrigin}/studio`, permanent: false },
      { source: "/studio/:slug", destination: `${studioOrigin}/studio/:slug`, permanent: false },
      { source: "/scene/:key", destination: `${studioOrigin}/scene/:key`, permanent: false },
      // The lite source too, and the scene feed it polls: once the studio's
      // tables live on its own server, the copy here stops changing, and a
      // lite page loaded from this host would sit on a stale scene without
      // any error. The feed allows cross-origin reads for exactly this case —
      // a lite page opened before the move polls this host and is sent on.
      { source: "/lite/:key", destination: `${studioOrigin}/lite/:key`, permanent: false },
      { source: "/api/scene/:path*", destination: `${studioOrigin}/api/scene/:path*`, permanent: false },
      // Sound files live in the studio's database too.
      { source: "/api/media/:path*", destination: `${studioOrigin}/api/media/:path*`, permanent: false },
    ];
  },

  // The game is a static file in public/jayc/. Next serves public files at
  // their literal path and does not do directory indexes, so /jayc alone
  // would 404 without this.
  async rewrites() {
    return [
      { source: "/jayc", destination: "/jayc/index.html" },
      // The wedding seating planner is a static page too (public/toy/).
      { source: "/toy", destination: "/toy/index.html" },
    ];
  },
};

export default nextConfig;
