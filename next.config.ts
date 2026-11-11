import type { NextConfig } from "next";
import { embedOrigins } from "./src/lib/embed";

/**
 * Framing policy: the app may be framed only by itself and purveycpg.com
 * (the Webflow /bench page), plus EMBED_EXTRA_ORIGINS. X-Frame-Options is deliberately NOT set, because
 * it cannot express an allow-list and would block the Webflow embed.
 */
const FRAME_ANCESTORS = `frame-ancestors 'self' ${embedOrigins().join(" ")}`;

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
