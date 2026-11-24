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
    // Escrow files are written by strangers: opened directly, they can't run anything (later rules win).
    const sandbox = [{ key: "Content-Security-Policy", value: "default-src 'none'; sandbox; frame-ancestors 'none'" }];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/escrow/media/:name", headers: sandbox },
      { source: "/api/escrow/file", headers: sandbox },
    ];
  },
};

export default nextConfig;
