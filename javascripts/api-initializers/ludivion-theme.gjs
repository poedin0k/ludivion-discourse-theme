import Component from "@glimmer/component";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import SearchMenu from "discourse/components/search-menu";
import bodyClass from "discourse/helpers/body-class";
import { apiInitializer } from "discourse/lib/api";
import dIcon from "discourse/ui-kit/helpers/d-icon";

// Consume the URL argument so Ember autotracks in-place topic navigation.
// It runs the destructor before an update and when the element is removed.
const topicReadingProgress = modifier((element, [routeURL]) => {
  if (!routeURL) {
    return;
  }

  const document = element.ownerDocument;
  const viewport = document.defaultView;
  const scrollingElement = document.scrollingElement || document.documentElement;
  let frame = null;

  const update = () => {
    frame = null;
    const distance =
      scrollingElement.scrollHeight - scrollingElement.clientHeight;
    const progress =
      distance > 0
        ? Math.min(1, Math.max(0, scrollingElement.scrollTop / distance))
        : 0;
    element.style.setProperty("--lud-reading-progress", String(progress));
  };
  const schedule = () => {
    if (frame === null) {
      frame = viewport.requestAnimationFrame(update);
    }
  };

  element.style.setProperty("--lud-reading-progress", "0");
  viewport.addEventListener("scroll", schedule, { passive: true });
  viewport.addEventListener("resize", schedule, { passive: true });
  // Posts and image loads may change the document height without a scroll event.
  const observer = viewport.ResizeObserver
    ? new viewport.ResizeObserver(schedule)
    : null;
  observer?.observe(document.body);
  schedule();

  return () => {
    viewport.removeEventListener("scroll", schedule);
    viewport.removeEventListener("resize", schedule);
    observer?.disconnect();
    if (frame !== null) {
      viewport.cancelAnimationFrame(frame);
    }
    element.style.removeProperty("--lud-reading-progress");
  };
});

// Match visible top-level categories supplied by Discourse. The configured
// slugs are hints, not routes or IDs; the live category URL stays authoritative.
const HALLS = [
  {
    number: "I",
    code: "ORI // 01",
    title: "ORI’S PROPHECY",
    description:
      "Official knowledge, announcements, rules and visions of Ludivion.",
    subtitle: "OFFICIAL KNOWLEDGE / ANNOUNCEMENTS / RULES",
    slugs: ["oris-prophecy", "ori-s-prophecy", "ori-prophecy"],
    names: ["ori's prophecy", "ori’s prophecy"],
    identity: "oracle",
  },
  {
    number: "II",
    code: "PATH // 02",
    title: "JOURNEY THROUGH LUDIVION",
    description:
      "Progression, quests, events, achievements, currencies and relics.",
    subtitle: "QUESTS / PROGRESSION / RELICS",
    slugs: ["journey-through-ludivion"],
    names: ["journey through ludivion"],
    identity: "journey",
  },
  {
    number: "III",
    code: "SEEK // 03",
    title: "SEEKERS’ HALL",
    description:
      "Guides, answers, strategies and knowledge gathered by the community.",
    subtitle: "GUIDES / ANSWERS / COMMUNITY KNOWLEDGE",
    slugs: ["seekers-hall", "seekers"],
    names: ["seekers' hall", "seekers’ hall"],
    identity: "seekers",
  },
  {
    number: "IV",
    code: "SYSTEM // 04",
    title: "TECHNICAL DISCUSSIONS",
    description:
      "Developer notes, technical help, bug reports and product feedback.",
    subtitle: "SYSTEMS / SUPPORT / ENGINEERING",
    slugs: ["technical-discussions"],
    names: ["technical discussions"],
    identity: "technical",
  },
  {
    number: "V",
    code: "CITY // 05",
    title: "THE COMMONS",
    description:
      "The social heart of Ludivion: discussion, stories and milestones.",
    subtitle: "STORIES / DISCUSSION / MILESTONES",
    slugs: ["the-commons", "commons"],
    names: ["the commons"],
    identity: "commons",
  },
];

function normalized(value) {
  return (value || "")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

class LudivionHomeLogo extends Component {
  <template>
    <a class="ludivion-home-logo" href="/" aria-label="Ludivion community home">
      <span class="ludivion-home-logo__mark" aria-hidden="true"></span>
      <span class="ludivion-home-logo__wordmark" aria-hidden="true">LUDIVION</span>
    </a>
  </template>
}

class LudivionCommunityShell extends Component {
  @service router;
  @service site;

  get path() {
    return (this.router.currentURL || "/").split(/[?#]/, 1)[0];
  }

  get isAdmin() {
    return (
      this.router.currentRouteName?.startsWith("admin") ||
      /^\/admin(?:\/|$)/.test(this.path)
    );
  }

  get isHomepage() {
    // The Hall composition belongs to Discourse's latest-topic discovery.
    // An explicit /categories page keeps its functional category directory.
    return (
      !this.isAdmin &&
      (this.path === "/" || this.path === "/latest") &&
      this.router.currentRouteName === "discovery.latest"
    );
  }

  get isTopic() {
    return /^topic(?:\.|$)/.test(this.router.currentRouteName || "") || /^\/t\//.test(this.path);
  }

  get isCategory() {
    return this.router.currentRouteName === "discovery.category" || /^\/c\//.test(this.path);
  }

  get hallCards() {
    const categories = this.site.categories || [];

    return HALLS.map((hall) => {
      const category = categories.find(
        (candidate) =>
          !candidate.parent_category_id &&
          (hall.slugs.some((slug) => normalized(slug) === normalized(candidate.slug)) ||
            hall.names.some((name) => normalized(name) === normalized(candidate.name)))
      );
      const count = category?.topic_count;

      return {
        ...hall,
        // A missing/private category still has a working navigation target.
        href: category?.url || (category?.slug ? "/c/" + category.slug : "/categories"),
        categoryPath: category?.path,
        available: Boolean(category),
        // BasicCategorySerializer supplies topic_count, not an active-today count.
        // Missing data stays missing; a genuine zero is still displayed.
        activityLabel:
          Number.isInteger(count) && count >= 0
            ? count.toLocaleString() + (count === 1 ? " TOPIC" : " TOPICS")
            : null,
      };
    });
  }

  get categoryIdentity() {
    if (!this.isCategory) {
      return "";
    }

    const hall = this.hallCards.find(
      (candidate) =>
        candidate.categoryPath &&
        (this.path === candidate.categoryPath ||
          this.path.startsWith(candidate.categoryPath + "/"))
    );

    return hall ? "ludivion-hall-" + hall.identity : "";
  }

  <template>
    {{#unless this.isAdmin}}
      {{bodyClass "ludivion-public"}}
      {{#if settings.show_ludivion_background}}
        <div class="ludivion-backdrop" aria-hidden="true"></div>
      {{/if}}
      {{#if this.isTopic}}
        {{bodyClass "ludivion-topic"}}
        {{#if settings.show_topic_reading_progress}}
          <div
            class="ludivion-topic-reading-progress"
            aria-hidden="true"
            {{topicReadingProgress this.router.currentURL}}
          ></div>
        {{/if}}
      {{/if}}
      {{#if this.isCategory}}
        {{bodyClass "ludivion-category"}}
        {{bodyClass this.categoryIdentity}}
      {{/if}}
      {{#if this.isHomepage}}
        {{bodyClass "ludivion-home"}}
        {{#if settings.show_homepage_hero}}
          <section class="ludivion-forum-hero" aria-labelledby="ludivion-hero-title">
            <div class="ludivion-forum-hero__eyebrow">LUDIVION COMMUNITY NETWORK</div>
            <h1 id="ludivion-hero-title">THE CITY SPEAKS</h1>
            <p>Knowledge, strategy and voices from across Ludivion.</p>
            <div class="ludivion-forum-hero__rule" aria-hidden="true"></div>
            <span class="ludivion-forum-hero__motto">DISCUSS · EXPLORE · BUILD · BELONG</span>
            {{#if this.site.can_search}}
              <div class="ludivion-archive-search {{if settings.show_oracle_terminal 'ludivion-oracle-terminal'}}">
                {{#if settings.show_oracle_terminal}}
                  <span class="ludivion-oracle-terminal__eyebrow">
                    <span class="ludivion-oracle-terminal__status" aria-hidden="true"></span>
                    ORACLE ARCHIVE
                  </span>
                {{/if}}
                <label for="ludivion-archive-search-input">SEARCH THE ARCHIVES</label>
                <div class="ludivion-archive-search__input">
                  {{#if settings.show_oracle_terminal}}
                    <span class="ludivion-oracle-terminal__icon" aria-hidden="true">{{dIcon "magnifying-glass"}}</span>
                  {{/if}}
                  <SearchMenu
                    @location="ludivion-home"
                    @searchInputId="ludivion-archive-search-input"
                  />
                </div>
                {{#if settings.show_oracle_terminal}}
                  <span class="ludivion-oracle-terminal__helper">Query the City's recorded knowledge.</span>
                {{/if}}
              </div>
            {{/if}}
          </section>
        {{/if}}

        {{#if settings.show_hall_cards}}
          <section class="ludivion-halls" aria-labelledby="ludivion-halls-title">
            <header class="ludivion-halls__header">
              <span class="ludivion-halls__eyebrow">COMMUNITY HALLS</span>
              <h2 id="ludivion-halls-title">CHOOSE YOUR HALL</h2>
              <p>Every hall carries a different voice of the City.</p>
            </header>
            <div class="ludivion-halls__grid">
              {{#each this.hallCards as |hall|}}
                <a
                  class="ludivion-hall-card ludivion-hall-card--{{hall.identity}}"
                  href={{hall.href}}
                >
                  {{#if settings.show_ambient_sigils}}
                    <span class="ludivion-hall-card__ambient" aria-hidden="true">{{hall.number}}</span>
                  {{/if}}
                  <span class="ludivion-hall-card__sigil" aria-hidden="true">{{hall.number}}</span>
                  <span class="ludivion-hall-card__body">
                    <span class="ludivion-hall-card__code">{{hall.code}}</span>
                    <span class="ludivion-hall-card__title">{{hall.title}}</span>
                    <span class="ludivion-hall-card__description">{{hall.description}}</span>
                    {{#if settings.show_hall_activity}}
                      {{#if hall.activityLabel}}
                        <span class="ludivion-hall-card__activity">
                          <span class="ludivion-hall-card__pulse" aria-hidden="true"></span>
                          {{hall.activityLabel}}
                        </span>
                      {{/if}}
                    {{/if}}
                    {{#unless hall.available}}
                      <span class="ludivion-hall-card__fallback">Browse all halls →</span>
                    {{/unless}}
                  </span>
                  <span class="ludivion-hall-card__arrow" aria-hidden="true">↗</span>
                </a>
              {{/each}}
            </div>
          </section>
        {{/if}}
      {{/if}}
    {{/unless}}
  </template>
}

class LudivionLatestHeading extends Component {
  @service router;

  get show() {
    const path = (this.router.currentURL || "/").split(/[?#]/, 1)[0];
    return (
      (path === "/" || path === "/latest") &&
      this.router.currentRouteName === "discovery.latest"
    );
  }

  <template>
    {{#if this.show}}
      <div class="ludivion-latest-heading">
        <span>COMMUNITY ARCHIVE // LIVE</span>
        <h2>LATEST FROM THE CITY</h2>
      </div>
    {{/if}}
  </template>
}

class LudivionHallHeading extends Component {
  get hall() {
    const category = this.args.outletArgs?.category;

    if (!category || category.parent_category_id) {
      return null;
    }

    return HALLS.find(
      (hall) =>
        hall.slugs.some((slug) => normalized(slug) === normalized(category.slug)) ||
        hall.names.some((name) => normalized(name) === normalized(category.name))
    );
  }

  <template>
    {{#if this.hall}}
      <div class="ludivion-hall-heading">
        <span class="ludivion-hall-heading__sigil" aria-hidden="true">{{this.hall.number}}</span>
        <div class="ludivion-hall-heading__content">
          <span class="ludivion-hall-heading__code">HALL {{this.hall.code}}</span>
          <h1>{{this.hall.title}}</h1>
          <p class="ludivion-hall-heading__subtitle">{{this.hall.subtitle}}</p>
          <p class="ludivion-hall-heading__description">{{this.hall.description}}</p>
        </div>
      </div>
    {{/if}}
  </template>
}

export default apiInitializer((api) => {
  // Discourse's own display hook removes the generic welcome/search banner
  // only from the branded latest view, without changing a site setting.
  api.registerValueTransformer("welcome-banner-display-for-route", ({ value, context }) =>
    context.currentRouteName === "discovery.latest" ? false : value
  );
  api.renderInOutlet("home-logo", LudivionHomeLogo);
  api.renderInOutlet("below-site-header", LudivionCommunityShell);
  api.renderInOutlet("discovery-list-controls-above", LudivionLatestHeading);
  api.renderInOutlet("category-heading", LudivionHallHeading);
  api.registerValueTransformer("topic-list-item-class", ({ value, context }) =>
    context.topic?.creator?.staff ? [...(value || []), "ludivion-staff-topic"] : value
  );
});
