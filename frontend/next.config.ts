import type { NextConfig } from "next";

const configuredPosterHostnames = process.env.NEXT_IMAGE_REMOTE_HOSTNAMES?.trim();
const posterHostnames = (configuredPosterHostnames || "cdn.example.com,example.com")
  .split(",")
  .map((hostname) => hostname.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: posterHostnames.map((hostname) => ({
      hostname,
      pathname: "/**",
      protocol: "https",
    })),
  },
  output: "standalone",
};

export default nextConfig;
