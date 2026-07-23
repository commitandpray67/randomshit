/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Steam avatar/profile images if you render them later.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.steamstatic.com" },
      { protocol: "https", hostname: "avatars.akamai.steamstatic.com" },
    ],
  },
};

export default nextConfig;
