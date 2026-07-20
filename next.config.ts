import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/story", destination: "/", permanent: false }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "digitalhub.fifa.com" },
      { protocol: "https", hostname: "api.fifa.com" },
      { protocol: "https", hostname: "imagecache.365scores.com" },
      { protocol: "https", hostname: "heatmap.365scores.com" },
    ],
  },
};

export default nextConfig;
