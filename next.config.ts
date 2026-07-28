import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // / is the dataset chooser; the 2026 film lives at /story
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
