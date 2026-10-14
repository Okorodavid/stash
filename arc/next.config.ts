import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: keep Next's badge away from the phone tab bar at the bottom of the screen.
  devIndicators: { position: "top-right" },
};

export default nextConfig;
