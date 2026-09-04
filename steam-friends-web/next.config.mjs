/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Steam avatar/profile images if you render them later.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.steamstatic.com" },
      { protocol: "https", hostname: "avatars.akamai.steamstatic.com" },
    ],
  },

  // The game is a static file in public/jayc/. Next serves public files at
  // their literal path and does not do directory indexes, so /jayc alone
  // would 404 without this.
  async rewrites() {
    return [{ source: "/jayc", destination: "/jayc/index.html" }];
  },
};

export default nextConfig;
