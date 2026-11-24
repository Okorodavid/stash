import type { NextConfig } from "next";

// Sent with every page. They stop other sites from framing Stash (a fake site could otherwise lay
// its own buttons over a real vault), stop browsers guessing file types, and keep full links out of
// the referrer sent to other sites. HTTPS-only (HSTS) is already set by the host.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Dev only: keep Next's badge away from the phone tab bar at the bottom of the screen.
  devIndicators: { position: "top-right" },
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
