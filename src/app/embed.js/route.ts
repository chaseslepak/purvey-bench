import { APP_URL } from "@/lib/site";

/**
 * The script the purveycpg.com /bench page loads. Paste into Webflow:
 *   <div id="purvey-bench"></div>
 *   <script src="https://bench.purveycpg.com/embed.js" async></script>
 * Optional: data-path="/find" on the div picks the first page.
 * Deep links: purveycpg.com/bench?path=/brokers/acme opens that page.
 */
const SCRIPT = (app: string) => `/* Purvey Bench embed */
(function () {
  // The app's origin is wherever this script was loaded from.
  var me = document.currentScript;
  var APP = me && me.src ? new URL(me.src).origin : ${JSON.stringify(app)};
  var BREAKOUT = /^\\/(app|admin|sign-in|sign-up|auth|invite|unsubscribed)(\\/|$|\\?|#)/;
  function safe(p) { return p && p.charAt(0) === "/" && p.charAt(1) !== "/" && !/[\\\\\\s]/.test(p) && p.length <= 500 ? p : "/"; }
  function start() {
    var mount = document.getElementById("purvey-bench");
    if (!mount || mount.getAttribute("data-ready")) return;
    mount.setAttribute("data-ready", "1");
    var params = new URLSearchParams(location.search);
    var path = safe(params.get("path") || mount.getAttribute("data-path") || "/");
    if (BREAKOUT.test(path)) { location.replace(APP + path); return; }
    var src = new URL(APP + path);
    src.searchParams.set("embed", "1");
    var frame = document.createElement("iframe");
    frame.src = src.toString();
    frame.title = "Purvey Bench: find food and beverage brokers";
    frame.setAttribute("allow", "clipboard-write");
    frame.style.cssText = "display:block;width:100%;min-height:600px;height:900px;border:0;background:transparent";
    mount.appendChild(frame);
    var first = true;
    window.addEventListener("message", function (e) {
      if (e.origin !== APP || e.source !== frame.contentWindow || !e.data || e.data.source !== "purvey-bench") return;
      if (e.data.type === "resize" && typeof e.data.height === "number") {
        frame.style.height = Math.max(400, Math.min(e.data.height, 50000)) + "px";
      } else if (e.data.type === "navigate" && typeof e.data.path === "string") {
        var p = safe(e.data.path), url = new URL(location.href);
        if (p === "/") url.searchParams.delete("path"); else url.searchParams.set("path", p);
        if (url.toString() !== location.href) history.replaceState(history.state, "", url.toString());
        if (!first && frame.getBoundingClientRect().top < 0) frame.scrollIntoView({ block: "start" });
        first = false;
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
`;

export function GET() {
  return new Response(SCRIPT(APP_URL.replace(/\/$/, "")), {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
}
