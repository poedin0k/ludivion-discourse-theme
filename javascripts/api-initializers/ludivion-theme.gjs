import Component from "@glimmer/component";
import { getOwner } from "@ember/owner";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import SearchMenu from "discourse/components/search-menu";
import bodyClass from "discourse/helpers/body-class";
import { apiInitializer } from "discourse/lib/api";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import I18n, { i18n } from "discourse-i18n";
import { themePrefix } from "virtual:theme";
import categoryTopicCount from "../lib/category-topic-count";
import ForumMusicService from "../lib/forum-music-service";
import ForumMusic from "../components/forum-music";

// The single MP4 contains forward + reverse frames, both retimed to half speed.
// Native looping repeats that sequence without runtime seeking or rate changes.
const homepageBackdropVideo = modifier((video, [uploads]) => {
  const document = video.ownerDocument;
  const motion = document.defaultView.matchMedia("(prefers-reduced-motion: reduce)");
  const source = uploads?.forum_hero_video;
  const supported = source && video.canPlayType("video/mp4");
  let failed = false;
  let disposed = false;
  let request = 0;

  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.defaultPlaybackRate = 1;
  video.playbackRate = 1;
  video.playsInline = true;
  video.poster = uploads?.forum_hero || "";

  const hide = () => video.classList.remove("is-playing");
  const reveal = () => {
    if (!disposed && !motion.matches && !document.hidden) {
      video.classList.add("is-playing");
    }
  };
  const play = () => {
    if (disposed || failed || motion.matches || document.hidden || !supported) {
      return;
    }
    const currentRequest = ++request;
    video.muted = true;
    video.play().catch(() => {
      if (!disposed && request === currentRequest) {
        hide(); // Autoplay restrictions leave the static background usable.
      }
    });
  };
  const load = () => {
    hide();
    if (motion.matches || !supported) {
      return;
    }
    video.src = source;
    video.load();
    play();
  };
  const playbackFailed = () => {
    failed = true;
    request++;
    hide();
    video.pause();
  };
  const visibilityChanged = () => {
    if (document.hidden) {
      request++;
      video.pause();
    } else {
      play();
    }
  };
  const motionChanged = () => {
    request++;
    if (motion.matches) {
      hide();
      video.pause();
      video.removeAttribute("src");
      video.load();
    } else {
      failed = false;
      load();
    }
  };

  video.addEventListener("playing", reveal);
  video.addEventListener("error", playbackFailed);
  document.addEventListener("visibilitychange", visibilityChanged);
  motion.addEventListener("change", motionChanged);
  load();

  return () => {
    disposed = true;
    request++;
    video.removeEventListener("playing", reveal);
    video.removeEventListener("error", playbackFailed);
    document.removeEventListener("visibilitychange", visibilityChanged);
    motion.removeEventListener("change", motionChanged);
    video.pause();
    video.removeAttribute("src");
    video.load();
    hide();
  };
});

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
    slugs: ["oris-prophecy", "ori-s-prophecy", "ori-prophecy"],
    names: ["ori's prophecy", "ori’s prophecy"],
    identity: "oracle",
  },
  {
    number: "II",
    slugs: ["journey-through-ludivion"],
    names: ["journey through ludivion"],
    identity: "journey",
  },
  {
    number: "III",
    slugs: ["seekers-hall", "seekers"],
    names: ["seekers' hall", "seekers’ hall"],
    identity: "seekers",
  },
  {
    number: "IV",
    slugs: ["technical-discussions"],
    names: ["technical discussions"],
    identity: "technical",
  },
  {
    number: "V",
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

// Keep category identity/routing independent of translated display labels.
function localizeHall(hall) {
  return {
    ...hall,
    code: i18n(themePrefix(`halls.${hall.identity}.code`)),
    title: i18n(themePrefix(`halls.${hall.identity}.title`)),
    description: i18n(themePrefix(`halls.${hall.identity}.description`)),
    subtitle: i18n(themePrefix(`halls.${hall.identity}.subtitle`)),
  };
}

class LudivionHomeLogo extends Component {
  <template>
    <a class="ludivion-home-logo" href="/" aria-label={{i18n (themePrefix "brand.home_label")}}>
      <span class="ludivion-home-logo__mark" aria-hidden="true"></span>
      <span class="ludivion-home-logo__wordmark" aria-hidden="true">LUDIVION</span>
    </a>
  </template>
}

class LudivionCommunityState extends Component {
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
      const count = categoryTopicCount(category, categories);

      return {
        ...localizeHall(hall),
        // A missing/private category still has a working navigation target.
        href: category?.url || (category?.slug ? "/c/" + category.slug : "/categories"),
        categoryPath: category?.path,
        available: Boolean(category),
        // Include visible descendants; missing data stays missing, not zero.
        activityLabel:
          Number.isInteger(count) && count >= 0
            ? i18n(themePrefix("halls.topic_count"), {
                count,
                formatted_count: count.toLocaleString(I18n.locale.replace(/_/g, "-")),
              })
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
}

class LudivionCommunityShell extends LudivionCommunityState {
  <template>
    {{#unless this.isAdmin}}
      {{bodyClass "ludivion-public"}}
      {{#if settings.show_ludivion_background}}
        <div class="ludivion-backdrop" aria-hidden="true">
          {{#if this.isHomepage}}
            <video
              class="ludivion-backdrop__video"
              muted
              loop
              playsinline
              preload="none"
              tabindex="-1"
              {{homepageBackdropVideo settings.theme_uploads}}
            ></video>
          {{/if}}
        </div>
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
      {{/if}}
    {{/unless}}
  </template>
}

// Render the introduction inside the same content column as the topic list.
// The shell above the grid contains only route classes and decorative layers.
class LudivionHome extends LudivionCommunityState {
  <template>
    {{#if this.isHomepage}}
      <div class="ludivion-home-intro">
        {{#if settings.show_homepage_hero}}
          <section class="ludivion-forum-hero" aria-labelledby="ludivion-hero-title">
            <div class="ludivion-forum-hero__eyebrow">{{i18n (themePrefix "hero.eyebrow")}}</div>
            <h1 id="ludivion-hero-title">{{i18n (themePrefix "hero.title")}}</h1>
            <p>{{i18n (themePrefix "hero.description")}}</p>
            <div class="ludivion-forum-hero__rule" aria-hidden="true"></div>
            <span class="ludivion-forum-hero__motto">{{i18n (themePrefix "hero.motto")}}</span>
            {{#if this.site.can_search}}
              <div class="ludivion-archive-search {{if settings.show_oracle_terminal 'ludivion-oracle-terminal'}}">
                {{#if settings.show_oracle_terminal}}
                  <span class="ludivion-oracle-terminal__eyebrow">
                    <span class="ludivion-oracle-terminal__status" aria-hidden="true"></span>
                    {{i18n (themePrefix "archive.eyebrow")}}
                  </span>
                {{/if}}
                <label for="ludivion-archive-search-input">{{i18n (themePrefix "archive.label")}}</label>
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
                  <span class="ludivion-oracle-terminal__helper">{{i18n (themePrefix "archive.helper")}}</span>
                {{/if}}
              </div>
            {{/if}}
            <nav class="ludivion-home-social" aria-label={{i18n (themePrefix "social.label")}}>
              <a
                class="ludivion-home-social__link"
                href="https://x.com/ludivion_hub"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={{i18n (themePrefix "social.x")}}
                title="X"
              >
                <span class="ludivion-home-social__icon ludivion-home-social__icon--x" aria-hidden="true"></span>
              </a>
              <a
                class="ludivion-home-social__link"
                href="https://discord.gg/ludivion"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={{i18n (themePrefix "social.discord")}}
                title="Discord"
              >
                <span class="ludivion-home-social__icon ludivion-home-social__icon--discord" aria-hidden="true"></span>
              </a>
              <a
                class="ludivion-home-social__link"
                href="https://ludivion.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={{i18n (themePrefix "social.website")}}
                title="Ludivion"
              >
                <span class="ludivion-home-social__icon ludivion-home-social__icon--ludivion" aria-hidden="true"></span>
              </a>
            </nav>
          </section>
        {{/if}}

        {{#if settings.show_hall_cards}}
          <section class="ludivion-halls" aria-labelledby="ludivion-halls-title">
            <header class="ludivion-halls__header">
              <span class="ludivion-halls__eyebrow">{{i18n (themePrefix "halls.eyebrow")}}</span>
              <h2 id="ludivion-halls-title">{{i18n (themePrefix "halls.title")}}</h2>
              <p>{{i18n (themePrefix "halls.description")}}</p>
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
                      <span class="ludivion-hall-card__fallback">{{i18n (themePrefix "halls.browse_all")}}</span>
                    {{/unless}}
                  </span>
                  <span class="ludivion-hall-card__arrow" aria-hidden="true">↗</span>
                </a>
              {{/each}}
            </div>
          </section>
        {{/if}}
      </div>
    {{/if}}
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
        <span>{{i18n (themePrefix "latest.eyebrow")}}</span>
        <h2>{{i18n (themePrefix "latest.title")}}</h2>
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

    const hall = HALLS.find(
      (hall) =>
        hall.slugs.some((slug) => normalized(slug) === normalized(category.slug)) ||
        hall.names.some((name) => normalized(name) === normalized(category.name))
    );
    return hall ? localizeHall(hall) : null;
  }

  <template>
    {{#if this.hall}}
      <div class="ludivion-hall-heading">
        <span class="ludivion-hall-heading__sigil" aria-hidden="true">{{this.hall.number}}</span>
        <div class="ludivion-hall-heading__content">
          <span class="ludivion-hall-heading__code">{{i18n (themePrefix "halls.heading_code") code=this.hall.code}}</span>
          <h1>{{this.hall.title}}</h1>
          <p class="ludivion-hall-heading__subtitle">{{this.hall.subtitle}}</p>
          <p class="ludivion-hall-heading__description">{{this.hall.description}}</p>
        </div>
      </div>
    {{/if}}
  </template>
}

export default apiInitializer((api) => {
  const owner = getOwner(api.container.lookup("service:router"));
  if (!owner.hasRegistration("service:ludivion-music")) {
    owner.register("service:ludivion-music", ForumMusicService);
  }
  owner.lookup("service:ludivion-music").configure(settings.theme_uploads);
  api.renderInOutlet("before-header-panel", ForumMusic);
  // Discourse's own display hook removes the generic welcome/search banner
  // only from the branded latest view, without changing a site setting.
  api.registerValueTransformer("welcome-banner-display-for-route", ({ value, context }) =>
    context.currentRouteName === "discovery.latest" ? false : value
  );
  api.renderInOutlet("home-logo", LudivionHomeLogo);
  api.renderInOutlet("below-site-header", LudivionCommunityShell);
  api.renderInOutlet("above-main-container", LudivionHome);
  api.renderInOutlet("discovery-list-controls-above", LudivionLatestHeading);
  api.renderInOutlet("category-heading", LudivionHallHeading);
  api.registerValueTransformer("topic-list-item-class", ({ value, context }) =>
    context.topic?.creator?.staff ? [...(value || []), "ludivion-staff-topic"] : value
  );
});
