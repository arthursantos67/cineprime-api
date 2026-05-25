import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: "**",
        pathname: "/**",
        protocol: "https",
      },
    ],
  },
  output: "standalone",
};

export default nextConfig;
