import type { NextConfig } from "next";

/**
 * Framing policy: the app may be framed only by itself and purveycpg.com
 * (the Webflow /bench page). X-Frame-Options is deliberately NOT set, because
 * it cannot express an allow-list and would block the Webflow embed.
 */
const FRAME_ANCESTORS = "frame-ancestors 'self' https://purveycpg.com https://www.purveycpg.com";

const securityHeaders = [
  { key: "Content-Security-Policy", value: `${FRAME_ANCESTORS}; object-src 'none'; base-uri 'self'` },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.prod.website-files.com" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
