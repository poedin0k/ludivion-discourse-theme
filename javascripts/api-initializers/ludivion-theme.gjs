import Component from "@glimmer/component";
import { apiInitializer } from "discourse/lib/api";

export default apiInitializer((api) => {
  api.renderInOutlet(
    "below-site-header",

    class LudivionHero extends Component {
      <template>
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
      </template>
    }
  );
});