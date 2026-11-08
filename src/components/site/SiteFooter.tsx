import { FOOTER_COPYRIGHT, FOOTER_TAGLINE, siteLinks } from "@/lib/site";

/** The purveycpg.com footer: same markup, classes, copy and URLs. */
export function SiteFooter() {
  return (
    <section className="footer text-color-quaternary bench-chrome">
      <div className="padding-global padding-section-small">
        <div className="container-large">
          <div className="w-layout-grid footer_top">
            <div id="w-node-e4447d22-3c62-f28e-5bfc-b73af8d4c6da-f8d4c6d5" className="footer-content">
              <div className="text-max is-29rem scroll-into-view">
                <div>{FOOTER_TAGLINE}</div>
              </div>
            </div>
            <div className="footer_column scroll-into-view">
              <a href={siteLinks.home} className="footer_link">Home</a>
              <a href={siteLinks.about} className="footer_link">About Us</a>
            </div>
            <div className="footer_column scroll-into-view">
              <a href={siteLinks.services} className="footer_link">Services</a>
              <a href={siteLinks.clientPortal} className="footer_link">Client Portal</a>
            </div>
            <div className="footer_column scroll-into-view">
              <a href={siteLinks.contact} className="footer_link">Contact</a>
              <a href={siteLinks.blog} className="footer_link">Blogs</a>
            </div>
          </div>
          <div className="section-gap-large" />
          <div className="footer_bottom">
            <div className="footer_pipely scroll-into-view" />
            <div className="footer_bottom_links">
              <div className="text-sm">{FOOTER_COPYRIGHT}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
