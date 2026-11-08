import type { MetadataRoute } from "next";
import { APP_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/auth", "/api", "/invite", "/sign-in", "/sign-up"] }],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
