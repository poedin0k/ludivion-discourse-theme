import Component from "@glimmer/component";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { tracked } from "@glimmer/tracking";
import { modifier } from "ember-modifier";
import { on } from "@ember/modifier";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import I18n, { i18n } from "discourse-i18n";
import { themePrefix } from "virtual:theme";
import { FORUM_MUSIC_TRACKS } from "../lib/forum-music-player";

const mountControls = modifier((element, [component]) => {
  component.root = element;
  // Publish playback state after Glimmer has finished this render transaction.
  queueMicrotask(() => {
    if (element.isConnected) component.music.ensureStarted();
  });
  const outside = event => {
    if (component.open && !element.contains(event.target)) {
      component.close(false);
    }
  };
  const keyDown = event => {
    if (component.open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      component.close(true);
    }
  };
  const routeChanged = () => component.close(false);
  component.music.router.on("routeDidChange", component, routeChanged);
  element.ownerDocument.addEventListener("pointerdown", outside);
  element.ownerDocument.addEventListener("keydown", keyDown, true);
  return () => {
    component.music.router.off("routeDidChange", component, routeChanged);
    element.ownerDocument.removeEventListener("pointerdown", outside);
    element.ownerDocument.removeEventListener("keydown", keyDown, true);
    component.root = null;
    // The service keeps playback alive when the header is remounted.
  };
});

const focusVolume = modifier(element => element.focus({ preventScroll: true }));

export default class ForumMusic extends Component {
  @service("ludivion-music") music;
  @tracked open = false;
  root = null;

  get snapshot() { return this.music.snapshot; }
  get audible() {
    return this.snapshot.enabled && this.snapshot.volume > 0 &&
      (this.snapshot.status === "playing" || this.snapshot.status === "starting");
  }
  get playLabel() {
    return i18n(themePrefix(this.audible ? "music.pause" : "music.play"));
  }
  get playIcon() { return this.audible ? "pause" : "play"; }
  get trackTitle() { return FORUM_MUSIC_TRACKS[this.snapshot.trackIndex].title; }
  get volumePercent() { return Math.round(this.snapshot.volume * 100); }
  get volumeLabel() {
    return new Intl.NumberFormat(I18n.locale.replace(/_/g, "-"), {
      style: "percent",
      maximumFractionDigits: 0,
    }).format(this.snapshot.volume);
  }
  get statusLabel() {
    if (this.snapshot.status === "error") return i18n(themePrefix("music.unavailable"));
    if (this.snapshot.status === "awaiting-gesture") return i18n(themePrefix("music.awaiting_gesture"));
    if (this.snapshot.switching) return i18n(themePrefix("music.switching"));
    return i18n(themePrefix(this.audible ? "music.on" : "music.off"));
  }
  get shuffleLabel() {
    return i18n(themePrefix(this.snapshot.shuffle ? "music.disable_shuffle" : "music.enable_shuffle"));
  }
  get repeatLabel() {
    return i18n(themePrefix(this.snapshot.repeatOne ? "music.repeat_playlist_instead" : "music.repeat_current"));
  }
  get modeLabel() {
    return i18n(themePrefix("music.mode"), {
      order: i18n(themePrefix(this.snapshot.shuffle ? "music.order_shuffled" : "music.order_sequential")),
      repeat: i18n(themePrefix(this.snapshot.repeatOne ? "music.repeat_track" : "music.repeat_playlist")),
    });
  }

  @action toggle() { this.music.player?.toggle(); }
  @action previous() {
    this.music.player?.unlock();
    void this.music.player?.previous();
  }
  @action next() {
    this.music.player?.unlock();
    void this.music.player?.next();
  }
  @action shuffle() {
    this.music.player?.setShuffle(!this.snapshot.shuffle);
    this.music.player?.unlock();
  }
  @action repeat() {
    this.music.player?.setRepeatOne(!this.snapshot.repeatOne);
    this.music.player?.unlock();
  }
  @action setVolume(event) {
    this.music.player?.setVolume(Number(event.target.value) / 100);
    this.music.player?.unlock();
  }
  @action togglePanel() {
    this.music.player?.unlock();
    if (this.open) this.close(false);
    else this.open = true;
  }
  close(restoreFocus) {
    this.open = false;
    if (restoreFocus) this.root?.querySelector("[data-music-settings]")?.focus({ preventScroll: true });
  }
  @action closePanel() { this.close(true); }

  <template>
    {{#if this.music.isPublic}}
      <div
        class="ludivion-music {{if @outletArgs.topicInfoVisible 'ludivion-music--compact'}}"
        data-ludivion-music
        data-music-status={{this.snapshot.status}}
        {{mountControls this}}
      >
        <div class="ludivion-music__toolbar" role="group" aria-label={{i18n (themePrefix "music.controls")}}>
          <div class="ludivion-music__track-summary" title={{this.trackTitle}}>
            <span>{{i18n (themePrefix "music.now_playing")}}</span>
            <strong>{{this.trackTitle}}</strong>
          </div>
          <button type="button" class="ludivion-music__button ludivion-music__desktop" aria-label={{i18n (themePrefix "music.previous")}} title={{i18n (themePrefix "music.previous")}} disabled={{this.snapshot.switching}} {{on "click" this.previous}}>{{dIcon "backward-step"}}</button>
          <button type="button" class="ludivion-music__button ludivion-music__desktop" aria-label={{this.playLabel}} title={{this.playLabel}} aria-pressed={{this.audible}} {{on "click" this.toggle}}>{{dIcon this.playIcon}}</button>
          <button type="button" class="ludivion-music__button ludivion-music__desktop" aria-label={{i18n (themePrefix "music.next")}} title={{i18n (themePrefix "music.next")}} disabled={{this.snapshot.switching}} {{on "click" this.next}}>{{dIcon "forward-step"}}</button>
          <button type="button" class="ludivion-music__button ludivion-music__settings" data-music-settings aria-label={{i18n (themePrefix "music.settings")}} title={{this.statusLabel}} aria-expanded={{this.open}} aria-controls="ludivion-music-panel" {{on "click" this.togglePanel}}>{{dIcon "music"}}</button>
        </div>
        {{#if this.open}}
          <section id="ludivion-music-panel" class="ludivion-music__panel" aria-label={{i18n (themePrefix "music.settings")}}>
            <div class="ludivion-music__panel-heading">
              <strong>{{i18n (themePrefix "music.title")}}</strong>
              <button type="button" class="ludivion-music__button" aria-label={{i18n (themePrefix "music.close")}} {{on "click" this.closePanel}}>{{dIcon "xmark"}}</button>
            </div>
            <p class="ludivion-music__status" role="status">{{this.statusLabel}}</p>
            <label class="ludivion-music__volume">
              <span>{{i18n (themePrefix "music.volume")}} <output>{{this.volumeLabel}}</output></span>
              <input type="range" min="0" max="100" step="1" value={{this.volumePercent}} aria-label={{i18n (themePrefix "music.volume_label")}} {{on "input" this.setVolume}} {{focusVolume}} />
            </label>
            <div class="ludivion-music__current-track">
              <span>{{i18n (themePrefix "music.current_track")}}</span>
              <strong>{{this.trackTitle}}</strong>
            </div>
            <div class="ludivion-music__transport" role="group" aria-label={{i18n (themePrefix "music.playback_controls")}}>
              <button type="button" class="ludivion-music__button" data-music-action="shuffle" aria-label={{this.shuffleLabel}} title={{this.shuffleLabel}} aria-pressed={{this.snapshot.shuffle}} {{on "click" this.shuffle}}>{{dIcon "shuffle"}}</button>
              <button type="button" class="ludivion-music__button" data-music-action="previous" aria-label={{i18n (themePrefix "music.previous")}} title={{i18n (themePrefix "music.previous")}} disabled={{this.snapshot.switching}} {{on "click" this.previous}}>{{dIcon "backward-step"}}</button>
              <button type="button" class="ludivion-music__button" data-music-action="play" aria-label={{this.playLabel}} title={{this.playLabel}} aria-pressed={{this.audible}} {{on "click" this.toggle}}>{{dIcon this.playIcon}}</button>
              <button type="button" class="ludivion-music__button" data-music-action="next" aria-label={{i18n (themePrefix "music.next")}} title={{i18n (themePrefix "music.next")}} disabled={{this.snapshot.switching}} {{on "click" this.next}}>{{dIcon "forward-step"}}</button>
              <button type="button" class="ludivion-music__button" data-music-action="repeat" aria-label={{this.repeatLabel}} title={{this.repeatLabel}} aria-pressed={{this.snapshot.repeatOne}} {{on "click" this.repeat}}>{{dIcon "repeat"}}</button>
            </div>
            <p class="ludivion-music__modes" aria-live="polite">{{this.modeLabel}}</p>
          </section>
        {{/if}}
      </div>
    {{/if}}
  </template>
}
