"use client";

import { useEffect, useRef, useState } from "react";
import { LOGO_SRCSET, LOGO_URL, siteLinks } from "@/lib/site";

/**
 * The purveycpg.com navbar, rebuilt with the exact Webflow markup and
 * classes so the vendored stylesheet renders it identically. webflow.js is
 * not loaded; the menu button and MORE dropdown toggle the same `w--open`
 * and `data-nav-menu-open` hooks that webflow.js would set.
 */
export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMoreOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
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
                  sizes="(max-width: 991px) 100vw, 1136px"
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
                    <a href={siteLinks.about} className="nav_links w-nav-link">About</a>
                    <a href={siteLinks.contact} className="nav_links w-nav-link">Contact</a>
                    <div ref={moreRef} className={`nav_dropdown w-dropdown${moreOpen ? " w--open" : ""}`}>
                      <button
                        type="button"
                        className={`nav_links is-dropdown w-dropdown-toggle${moreOpen ? " w--open" : ""}`}
                        aria-haspopup="true"
                        aria-expanded={moreOpen}
                        aria-controls="site-more"
                        onClick={() => setMoreOpen((v) => !v)}
                        style={{ background: "transparent", border: 0 }}
                      >
                        <div className="text-block">MORE</div>
                        <div className="nav_link-icon w-icon-dropdown-toggle" aria-hidden="true" />
                      </button>
                      <nav id="site-more" className={`nav_link-dropdown w-dropdown-list${moreOpen ? " w--open" : ""}`}>
                        <div className="nav_dropdown-wrap">
                          <div className="nav_dropdown-content">
                            <div className="nav_dropdown-column">
                              <a href={siteLinks.blog} className="nav_dropdown-link w-dropdown-link">Blog</a>
                            </div>
                            <div className="nav_dropdown-column">
                              <a href={siteLinks.services} className="nav_dropdown-link w-dropdown-link">Services</a>
                            </div>
                            <div className="nav_dropdown-column">
                              <a href={siteLinks.clientPortal} className="nav_dropdown-link w-dropdown-link">CLIENT PORTAL</a>
                            </div>
                          </div>
                        </div>
                      </nav>
                    </div>
                  </div>
                </nav>
              </div>
              <div className="nav_buttons-wrap">
                <div className="login-wrap hide-mobile-landscape">
                  <a href={siteLinks.contact} className="button is-small w-button">contact</a>
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
