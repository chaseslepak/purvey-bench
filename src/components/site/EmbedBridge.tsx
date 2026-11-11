"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BREAKOUT, embedOrigins } from "@/lib/embed";

const ORIGINS = embedOrigins(process.env.NEXT_PUBLIC_EMBED_EXTRA_ORIGINS ?? "");
const framed = () => { try { return window.top !== window.self; } catch { return true; } };
const tell = (msg: Record<string, unknown>) => { for (const o of ORIGINS) window.parent.postMessage({ source: "purvey-bench", ...msg }, o); };

/**
 * Inside the purveycpg.com/bench iframe: tell the parent page our height and
 * which page we're on (so its address bar and back button follow along), and
 * open sign-in and the signed-in workspace full-window on bench.purveycpg.com.
 * Messages only go to purveycpg.com origins; does nothing when not framed.
 */
export function EmbedBridge() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (!framed()) return;
    let last = 0;
    const send = () => {
      const h = Math.ceil(document.documentElement.getBoundingClientRect().height);
      if (h !== last) { last = h; tell({ type: "resize", height: h }); }
    };
    const ro = new ResizeObserver(send);
    ro.observe(document.documentElement);
    send();
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !BREAKOUT.test(url.pathname + url.search)) return;
      e.preventDefault();
      e.stopPropagation();
      url.searchParams.delete("embed");
      window.open(url.toString(), "_top");
    };
    document.addEventListener("click", onClick, true);
    return () => { ro.disconnect(); document.removeEventListener("click", onClick, true); };
  }, []);

  useEffect(() => {
    if (!framed()) return;
    const q = new URLSearchParams(search.toString());
    q.delete("embed");
    const path = pathname + (q.toString() ? `?${q}` : "");
    // A page that must not run framed (reached by a redirect) moves to the top window.
    if (BREAKOUT.test(path)) { window.open(location.origin + path, "_top"); return; }
    tell({ type: "navigate", path, title: document.title });
  }, [pathname, search]);

  return null;
}
