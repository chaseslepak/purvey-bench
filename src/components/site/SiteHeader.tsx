"use client";

import { useEffect, useState } from "react";
import { LOGO_SRCSET, LOGO_URL, siteLinks } from "@/lib/site";

/**
 * The purveycpg.com navbar, rebuilt with the exact Webflow markup and
 * classes so the vendored stylesheet renders it identically. webflow.js is
 * not loaded; the menu button toggles the same `w--open`
 * and `data-nav-menu-open` hooks that webflow.js would set.
 */
export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="navbar w-nav bench-chrome" data-animation="default" data-collapse="medium" role="banner">
      <div className="main-wrapper is-nav">
        <div className="padding-global is-navbar">
          <div className="container-large">
            <div className="navbar_content">
              <a href={siteLinks.home} className="navbar_logo-link w-nav-brand" aria-label="Purvey home">
                {/* eslint-disable-next-line @next/next/no-img-element -- must match Webflow's responsive img exactly */}
                <img
                  src={LOGO_URL}
                  srcSet={LOGO_SRCSET}
                  sizes="140px"
                  alt=""
                  className="navbar_logo"
                />
              </a>
              <div className="nav_wrap">
                <nav
                  id="site-menu"
                  role="navigation"
                  className="nav_mobile w-nav-menu"
                  {...(menuOpen ? { "data-nav-menu-open": "" } : {})}
                >
                  <div className="navbar_list">
                    <a href={siteLinks.home} className="nav_links w-nav-link">Home</a>
                    <a href={siteLinks.services} className="nav_links w-nav-link">Services</a>
                    <a href={siteLinks.about} className="nav_links w-nav-link">About</a>
                    <a href={siteLinks.blog} className="nav_link-insights">Insights</a>
                    <a href="/" className="nav_link-insights" aria-current="page">Bench</a>
                  </div>
                </nav>
              </div>
              <div className="nav_buttons-wrap">
                <div className="login-wrap hide-mobile-landscape">
                  <a href={siteLinks.contact} className="button is-small w-button">Book a strategy call</a>
                </div>
                <button
                  type="button"
                  className={`menu-button w-nav-button${menuOpen ? " w--open" : ""}`}
                  aria-label="Menu"
                  aria-controls="site-menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  style={{ border: 0, background: "transparent" }}
                >
                  <div className="nav-button_component">
                    <div className="nav-button_line is-first" />
                    <div className="nav-button_line is-second" />
                    <div className="nav-button_line is-third" />
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
