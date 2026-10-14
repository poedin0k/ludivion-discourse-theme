import Component from "@glimmer/component";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { tracked } from "@glimmer/tracking";
import { modifier } from "ember-modifier";
import { on } from "@ember/modifier";
import dIcon from "discourse/ui-kit/helpers/d-icon";
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
  get playLabel() { return this.audible ? "Pause music" : "Play music"; }
  get playIcon() { return this.audible ? "pause" : "play"; }
  get trackTitle() { return FORUM_MUSIC_TRACKS[this.snapshot.trackIndex].title; }
  get volumePercent() { return Math.round(this.snapshot.volume * 100); }
  get statusLabel() {
    if (this.snapshot.status === "error") return "Music is temporarily unavailable";
    if (this.snapshot.status === "awaiting-gesture") return "Tap Play to start the music";
    if (this.snapshot.switching) return "Changing track…";
    return this.audible ? "Music is on" : "Music is off";
  }
  get shuffleLabel() { return this.snapshot.shuffle ? "Disable shuffle" : "Enable shuffle"; }
  get repeatLabel() { return this.snapshot.repeatOne ? "Repeat playlist instead" : "Repeat current track"; }
  get modeLabel() {
    return (this.snapshot.shuffle ? "Shuffled" : "In order") + " · " +
      (this.snapshot.repeatOne ? "Repeat track" : "Repeat playlist");
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
        <div class="ludivion-music__toolbar" role="group" aria-label="Music controls">
          <div class="ludivion-music__track-summary" title={{this.trackTitle}}>
            <span>Now playing</span>
            <strong>{{this.trackTitle}}</strong>
          </div>
          <button type="button" class="ludivion-music__button ludivion-music__desktop" aria-label="Previous track" title="Previous track" disabled={{this.snapshot.switching}} {{on "click" this.previous}}>{{dIcon "backward-step"}}</button>
          <button type="button" class="ludivion-music__button ludivion-music__desktop" aria-label={{this.playLabel}} title={{this.playLabel}} aria-pressed={{this.audible}} {{on "click" this.toggle}}>{{dIcon this.playIcon}}</button>
          <button type="button" class="ludivion-music__button ludivion-music__desktop" aria-label="Next track" title="Next track" disabled={{this.snapshot.switching}} {{on "click" this.next}}>{{dIcon "forward-step"}}</button>
          <button type="button" class="ludivion-music__button ludivion-music__settings" data-music-settings aria-label="Music settings" title={{this.statusLabel}} aria-expanded={{this.open}} aria-controls="ludivion-music-panel" {{on "click" this.togglePanel}}>{{dIcon "music"}}</button>
        </div>
        {{#if this.open}}
          <section id="ludivion-music-panel" class="ludivion-music__panel" aria-label="Music settings">
            <div class="ludivion-music__panel-heading">
              <strong>Music</strong>
              <button type="button" class="ludivion-music__button" aria-label="Close music settings" {{on "click" this.closePanel}}>{{dIcon "xmark"}}</button>
            </div>
            <p class="ludivion-music__status" role="status">{{this.statusLabel}}</p>
            <label class="ludivion-music__volume">
              <span>Volume <output>{{this.volumePercent}}%</output></span>
              <input type="range" min="0" max="100" step="1" value={{this.volumePercent}} aria-label="Music volume" {{on "input" this.setVolume}} {{focusVolume}} />
            </label>
            <div class="ludivion-music__current-track">
              <span>Current track</span>
              <strong>{{this.trackTitle}}</strong>
            </div>
            <div class="ludivion-music__transport" role="group" aria-label="Playback controls">
              <button type="button" class="ludivion-music__button" data-music-action="shuffle" aria-label={{this.shuffleLabel}} title={{this.shuffleLabel}} aria-pressed={{this.snapshot.shuffle}} {{on "click" this.shuffle}}>{{dIcon "shuffle"}}</button>
              <button type="button" class="ludivion-music__button" data-music-action="previous" aria-label="Previous track" title="Previous track" disabled={{this.snapshot.switching}} {{on "click" this.previous}}>{{dIcon "backward-step"}}</button>
              <button type="button" class="ludivion-music__button" data-music-action="play" aria-label={{this.playLabel}} title={{this.playLabel}} aria-pressed={{this.audible}} {{on "click" this.toggle}}>{{dIcon this.playIcon}}</button>
              <button type="button" class="ludivion-music__button" data-music-action="next" aria-label="Next track" title="Next track" disabled={{this.snapshot.switching}} {{on "click" this.next}}>{{dIcon "forward-step"}}</button>
              <button type="button" class="ludivion-music__button" data-music-action="repeat" aria-label={{this.repeatLabel}} title={{this.repeatLabel}} aria-pressed={{this.snapshot.repeatOne}} {{on "click" this.repeat}}>{{dIcon "repeat"}}</button>
            </div>
            <p class="ludivion-music__modes" aria-live="polite">{{this.modeLabel}}</p>
          </section>
        {{/if}}
      </div>
    {{/if}}
  </template>
}
