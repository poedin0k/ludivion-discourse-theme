import Component from "@glimmer/component";
import { service } from "@ember/service";
import { apiInitializer } from "discourse/lib/api";

class LudivionCommunityShell extends Component {
  @service router;

  get currentPath() {
    return this.router.currentURL || "/";
  }

  get isAdmin() {
    return this.currentPath.startsWith("/admin");
  }

  get isHomepage() {
    return (
      this.currentPath === "/" ||
      this.currentPath.startsWith("/latest") ||
      this.currentPath.startsWith("/categories")
    );
  }

  <template>
    {{#unless this.isAdmin}}
      <section class="ludivion-forum-hero">
        <div class="ludivion-forum-hero__eyebrow">
          LUDIVION COMMUNITY NETWORK
        </div>

        <h1>THE CITY SPEAKS</h1>

        <p>
          Knowledge, strategy and voices from across Ludivion.
        </p>

        <div class="ludivion-forum-hero__line"></div>

        <span>
          DISCUSS · EXPLORE · BUILD · BELONG
        </span>
      </section>

      {{#if this.isHomepage}}
        <section class="ludivion-halls">
          <header class="ludivion-halls__header">
            <div class="ludivion-halls__eyebrow">
              COMMUNITY HALLS
            </div>

            <h2>CHOOSE YOUR HALL</h2>

            <p>
              Every hall carries a different voice of the City.
            </p>
          </header>

          <div class="ludivion-halls__grid">

            <article class="ludivion-hall-card ludivion-hall-card--oracle">
              <div class="ludivion-hall-card__sigil">
			  <span>I</span>
			</div>

              <div class="ludivion-hall-card__body">
                <span class="ludivion-hall-card__code">ORI // 01</span>

                <h3>ORI'S PROPHECY</h3>

                <p>
                  Official knowledge, announcements, rules and visions of Ludivion.
                </p>
              </div>
            </article>

            <article class="ludivion-hall-card ludivion-hall-card--journey">
              <div class="ludivion-hall-card__sigil">II</div>

              <div class="ludivion-hall-card__body">
                <span class="ludivion-hall-card__code">PATH // 02</span>

                <h3>JOURNEY THROUGH LUDIVION</h3>

                <p>
                  Progression, quests, events, achievements, currencies and relics.
                </p>
              </div>
            </article>

            <article class="ludivion-hall-card ludivion-hall-card--seekers">
              <div class="ludivion-hall-card__sigil">III</div>

              <div class="ludivion-hall-card__body">
                <span class="ludivion-hall-card__code">SEEK // 03</span>

                <h3>SEEKERS' HALL</h3>

                <p>
                  Guides, answers, strategies and knowledge gathered by the community.
                </p>
              </div>
            </article>

            <article class="ludivion-hall-card ludivion-hall-card--technical">
              <div class="ludivion-hall-card__sigil">IV</div>

              <div class="ludivion-hall-card__body">
                <span class="ludivion-hall-card__code">SYSTEM // 04</span>

                <h3>TECHNICAL DISCUSSIONS</h3>

                <p>
                  Developer notes, technical help, bug reports and product feedback.
                </p>
              </div>
            </article>

            <article class="ludivion-hall-card ludivion-hall-card--commons">
              <div class="ludivion-hall-card__sigil">V</div>

              <div class="ludivion-hall-card__body">
                <span class="ludivion-hall-card__code">CITY // 05</span>

                <h3>THE COMMONS</h3>

                <p>
                  The social heart of Ludivion: discussion, stories and milestones.
                </p>
              </div>
            </article>

          </div>
        </section>
      {{/if}}
    {{/unless}}
  </template>
}

export default apiInitializer((api) => {
  api.renderInOutlet("below-site-header", LudivionCommunityShell);
});