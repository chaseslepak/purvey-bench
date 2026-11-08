import { siteLinks } from "@/lib/site";

/** "Ready to Scale Smarter?" band from purveycpg.com, verbatim. */
export function CtaBand() {
  return (
    <section className="section_joinus bench-chrome">
      <div className="padding-global padding-section-bottom">
        <div className="container-large">
          <div className="w-layout-grid grid-col-2">
            <div id="w-node-_1934b158-c68e-7b97-ef9a-6e0827780280-2778027c" className="join_left">
              <div>
                <div className="text_title scroll-into-view">Join us</div>
                <div className="spacer-medium" />
                <div className="title-max is-32rem scroll-into-view">
                  <h2 className="heading-style-h2">Ready to Scale Smarter?</h2>
                </div>
                <div className="spacer-medium" />
                <div className="text-color-tertiary scroll-into-view">
                  Whether you’re preparing for launch, refining operations, expanding retail distribution, or navigating
                  your next phase of growth, Purvey is built to support modern consumer brands through every stage of the
                  journey.
                </div>
              </div>
              <div className="button_wrap scroll-into-view">
                <a href={siteLinks.contact} className="button is-secondary w-button">Get in Touch</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
