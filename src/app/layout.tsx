import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { EmbedBridge } from "@/components/site/EmbedBridge";
import { BenchNav } from "@/components/site/BenchNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import "@/styles/webflow.css";
import "@/styles/tokens.css";
import "@/styles/app.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "Purvey Bench | Find food and beverage brokers", template: "%s | Purvey Bench" },
  description:
    "Search food and beverage brokers by the retailers, regions, channels and distributors they actually cover. Free for brands.",
  icons: {
    icon: "https://cdn.prod.website-files.com/665687d713145087b3ce1703/665a4535765980c07e93225b_Group%202942.png",
    apple: "https://cdn.prod.website-files.com/665687d713145087b3ce1703/665a45115482c06bb38d0091_Group%202940.png",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/**
 * Runs before first paint: inside the purveycpg.com iframe (or with
 * ?embed=1) hide our own header and footer, because Webflow shows them.
 */
const EMBED_DETECT = `(function(){var d=document.documentElement;try{if(new URLSearchParams(location.search).get('embed')==='1'||window.top!==window.self){d.setAttribute('data-embed','1')}}catch(e){d.setAttribute('data-embed','1')}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="w-mod-js" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: EMBED_DETECT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Same families and weights the live Webflow site loads. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- must match purveycpg.com's Google Fonts exactly */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap"
        />
      </head>
      <body>
        <a href="#main" className="bench-skip">Skip to content</a>
        <Suspense fallback={null}><EmbedBridge /></Suspense>
        <div className="page-wrapper">
          <SiteHeader />
          <div className="main-wrapper">
            <main id="main" className="bench-main">
              <BenchNav />
              {children}
            </main>
            <SiteFooter />
          </div>
        </div>
      </body>
    </html>
  );
}
