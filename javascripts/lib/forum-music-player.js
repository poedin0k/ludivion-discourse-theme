// Adapted from ludivion-web launchMusicPlayer; retain the two-deck audio clock.
import { ForumMusicQueue } from "./forum-music-queue.js";
export const FORUM_MUSIC_STORAGE_KEY = "ludivion_forum_music_v1";
export const FORUM_MUSIC_DEFAULT_VOLUME = 0.2;
export const FORUM_MUSIC_FADE_IN_SECONDS = 2.5;
export const FORUM_MUSIC_CROSSFADE_SECONDS = 5;
export const FORUM_MUSIC_TRACKS = [
  {
    asset: "music_treasury_chamber",
    src: "/music/TreasuryChamber.mp3",
    title: "Treasury Chamber",
  },
  {
    asset: "music_shadowy_reverberation",
    src: "/music/ShadowyReverberation.mp3",
    title: "Shadowy Reverberation",
  },
  {
    asset: "music_roulette_ticking",
    src: "/music/RouletteTicking.mp3",
    title: "Roulette Ticking",
  },
  {
    asset: "music_nocturnal_salon",
    src: "/music/NocturnalSalon.mp3",
    title: "Nocturnal Salon",
  },
  {
    asset: "music_quietly_dangerous",
    src: "/music/QuietlyDangerous.mp3",
    title: "Quietly Dangerous",
  },
  {
    asset: "music_obsidian_core",
    src: "/music/ObsidianCore.mp3",
    title: "Obsidian Core",
  },
];
export function parseForumMusicSettings(raw) {
  const defaults = {
    enabled: true,
    volume: FORUM_MUSIC_DEFAULT_VOLUME,
    shuffle: false,
    repeatOne: false,
  };
  if (!raw) return defaults;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 && value?.version !== 2) return defaults;
    return {
      enabled: typeof value.enabled === "boolean" ? value.enabled : true,
      volume:
        typeof value.volume === "number" && Number.isFinite(value.volume)
          ? Math.min(1, Math.max(0, value.volume))
          : FORUM_MUSIC_DEFAULT_VOLUME,
      shuffle: typeof value.shuffle === "boolean" ? value.shuffle : false,
      repeatOne: typeof value.repeatOne === "boolean" ? value.repeatOne : false,
    };
  } catch {
    return defaults;
  }
}
function storedTrackIndex(raw) {
  try {
    const value = JSON.parse(raw ?? "null");
    if (value?.version !== 2) return 0;
    const index = FORUM_MUSIC_TRACKS.findIndex(
      (track) => track.src === value.trackSrc,
    );
    return index >= 0 ? index : 0;
  } catch {
    return 0;
  }
}
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function createBrowserAudioContext() {
  const audioWindow = window;
  const AudioContextClass =
    window.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextClass) throw new Error("WEB_AUDIO_UNAVAILABLE");
  return new AudioContextClass();
}
export class ForumMusicPlayer {
  storage;
  audio;
  createContext;
  onChange;
  removeListeners = [];
  failedTracks = new Set();
  primedDecks = new Set();
  primingDecks = new Set();
  queue;
  settings;
  context = null;
  master = null;
  gains = null;
  deckTracks = [-1, -1];
  activeDeck = 0;
  trackIndex = 0;
  restartOnPlay = false;
  status = "starting";
  switching = false;
  visible = true;
  ducked = false;
  disposed = false;
  operation = 0;
  transitionTimer = null;
  pauseTimer = null;
  constructor(options) {
    this.storage =
      options.storage === undefined ? browserStorage() : options.storage;
    let stored = null;
    try {
      stored = this.storage?.getItem(FORUM_MUSIC_STORAGE_KEY) ?? null;
    } catch {}
    this.settings = parseForumMusicSettings(stored);
    this.trackIndex = storedTrackIndex(stored);
    this.queue = new ForumMusicQueue({
      count: FORUM_MUSIC_TRACKS.length,
      initialIndex: this.trackIndex,
      shuffle: this.settings.shuffle,
      random: options.random,
    });
    this.trackUrls =
      options.trackUrls ?? FORUM_MUSIC_TRACKS.map((track) => track.src);
    this.onChange = options.onChange;
    this.createContext = options.createContext ?? createBrowserAudioContext;
    const createAudio = options.createAudio ?? (() => new Audio());
    this.audio = [createAudio(), createAudio()];
    this.audio.forEach((audio, deck) => {
      audio.crossOrigin = "anonymous";
      audio.preload = "none";
      audio.loop = false;
      const timeUpdate = () => {
        if (
          deck !== this.activeDeck ||
          !this.shouldPlay() ||
          this.status !== "playing"
        )
          return;
        const remaining = audio.duration - audio.currentTime;
        if (!Number.isFinite(remaining)) return;
        if (remaining <= 20 && !this.switching) this.prepareNext();
        if (remaining <= FORUM_MUSIC_CROSSFADE_SECONDS && !this.switching)
          void this.advanceAutomatically();
      };
      const ended = () => {
        if (deck === this.activeDeck && this.shouldPlay() && !this.switching)
          void this.advanceAutomatically();
      };
      const error = () => {
        if (this.disposed || this.deckTracks[deck] < 0) return;
        this.failedTracks.add(this.deckTracks[deck]);
        if (deck === this.activeDeck && this.shouldPlay())
          this.skipFailedTrack();
      };
      audio.addEventListener("timeupdate", timeUpdate);
      audio.addEventListener("ended", ended);
      audio.addEventListener("error", error);
      this.removeListeners.push(() => {
        audio.removeEventListener("timeupdate", timeUpdate);
        audio.removeEventListener("ended", ended);
        audio.removeEventListener("error", error);
      });
    });
  }
  getSnapshot() {
    return {
      ...this.settings,
      status: this.status,
      trackIndex: this.trackIndex,
      switching: this.switching,
    };
  }
  start(visible = true) {
    this.visible = visible;
    if (this.shouldPlay()) this.playCurrent(FORUM_MUSIC_FADE_IN_SECONDS);
    else this.updateStatus("paused");
  }
  unlock() {
    if (
      this.shouldPlay() &&
      (this.status === "awaiting-gesture" || this.status === "starting")
    ) {
      this.playCurrent(FORUM_MUSIC_FADE_IN_SECONDS);
    }
    this.primeSpareDeck();
  }
  toggle() {
    if (
      this.settings.enabled &&
      this.settings.volume > 0 &&
      (this.status === "playing" || this.status === "starting")
    ) {
      this.setEnabled(false);
    } else {
      if (this.settings.volume === 0)
        this.settings.volume = FORUM_MUSIC_DEFAULT_VOLUME;
      if (this.status === "error") this.deckTracks[this.activeDeck] = -1;
      this.failedTracks.clear();
      this.setEnabled(true);
      this.primeSpareDeck();
    }
  }
  setEnabled(enabled) {
    this.settings.enabled = enabled;
    this.persist();
    if (this.shouldPlay()) this.playCurrent(FORUM_MUSIC_FADE_IN_SECONDS);
    else this.pause(false);
  }
  setVolume(volume) {
    if (!Number.isFinite(volume)) return;
    this.settings.volume = Math.min(1, Math.max(0, volume));
    this.persist();
    if (!this.shouldPlay()) this.pause(false);
    else if (this.status !== "playing")
      this.playCurrent(FORUM_MUSIC_FADE_IN_SECONDS);
    else {
      this.ramp(this.master.gain, this.targetVolume(), 0.15);
      this.emit();
    }
  }
  setDucked(ducked) {
    this.ducked = ducked;
    if (this.status === "playing" && this.master)
      this.ramp(this.master.gain, this.targetVolume(), 0.8);
  }
  setShuffle(shuffle) {
    if (this.disposed || this.settings.shuffle === shuffle) return;
    this.settings.shuffle = shuffle;
    this.queue.setShuffle(shuffle);
    this.persist();
    this.emit();
  }
  setRepeatOne(repeatOne) {
    if (this.disposed || this.settings.repeatOne === repeatOne) return;
    this.settings.repeatOne = repeatOne;
    this.persist();
    this.emit();
  }
  setVisible(visible) {
    if (this.visible === visible || this.disposed) return;
    this.visible = visible;
    if (!visible) this.pause(true);
    else if (this.shouldPlay()) this.playCurrent(1.2);
  }
  restoreSettings(raw) {
    this.settings = parseForumMusicSettings(raw);
    this.queue.setShuffle(this.settings.shuffle);
    if (!this.shouldPlay()) this.pause(false);
    else if (this.status === "playing" && this.master) {
      this.ramp(this.master.gain, this.targetVolume(), 0.3);
      this.emit();
    } else this.playCurrent(FORUM_MUSIC_FADE_IN_SECONDS);
  }
  async next() {
    await this.switchTrack(this.queue.peekNext(this.failedTracks), "next");
  }
  async previous() {
    await this.switchTrack(
      this.queue.peekPrevious(this.failedTracks),
      "previous",
    );
  }
  async advanceAutomatically() {
    const repeating =
      this.settings.repeatOne && !this.failedTracks.has(this.trackIndex);
    await this.switchTrack(
      this.automaticTrackIndex(),
      repeating ? "repeat" : "next",
    );
  }
  async switchTrack(nextIndex, direction) {
    if (this.disposed || this.switching) return;
    if (nextIndex === null) {
      this.pause(true, "error");
      return;
    }
    if (!this.shouldPlay() || this.status !== "playing") {
      this.commitTrack(nextIndex, direction);
      this.restartOnPlay = true;
      this.audio[this.activeDeck].pause();
      if (this.shouldPlay()) this.playCurrent(FORUM_MUSIC_FADE_IN_SECONDS);
      else this.emit();
      return;
    }
    const outgoing = this.activeDeck;
    const incoming = 1 - outgoing;
    const operation = ++this.operation;
    this.switching = true;
    this.emit();
    this.setDeckTrack(incoming, nextIndex);
    this.audio[incoming].currentTime = 0;
    this.setGain(this.gains[incoming].gain, 0);
    try {
      await this.audio[incoming].play();
      if (operation !== this.operation || !this.shouldPlay()) {
        if (
          !this.shouldPlay() ||
          (incoming !== this.activeDeck && !this.switching)
        )
          this.audio[incoming].pause();
        return;
      }
      this.activeDeck = incoming;
      this.commitTrack(nextIndex, direction);
      const remaining =
        this.audio[outgoing].duration - this.audio[outgoing].currentTime;
      const duration = this.audio[outgoing].ended
        ? FORUM_MUSIC_FADE_IN_SECONDS
        : Number.isFinite(remaining)
          ? Math.min(FORUM_MUSIC_CROSSFADE_SECONDS, Math.max(0.1, remaining))
          : FORUM_MUSIC_CROSSFADE_SECONDS;
      this.ramp(this.gains[outgoing].gain, 0, duration);
      this.ramp(this.gains[incoming].gain, 1, duration);
      this.transitionTimer = window.setTimeout(() => {
        this.transitionTimer = null;
        this.audio[outgoing].pause();
        this.switching = false;
        this.emit();
      }, duration * 1000);
      this.emit();
    } catch (error) {
      if (operation !== this.operation || this.disposed) return;
      this.switching = false;
      if (error instanceof DOMException && error.name === "NotAllowedError")
        this.pause(true, "awaiting-gesture");
      else {
        this.failedTracks.add(nextIndex);
        if (this.failedTracks.size >= FORUM_MUSIC_TRACKS.length)
          this.pause(true, "error");
        else {
          this.emit();
          this.prepareNext();
        }
      }
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.operation += 1;
    this.clearTimers();
    this.removeListeners.forEach((remove) => remove());
    if (this.master) this.ramp(this.master.gain, 0, 0.2);
    const context = this.context;
    window.setTimeout(() => {
      this.audio.forEach((audio) => {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      });
      if (context && context.state !== "closed")
        void context.close().catch(() => {});
    }, 220);
  }
  shouldPlay() {
    return (
      !this.disposed &&
      this.visible &&
      this.settings.enabled &&
      this.settings.volume > 0
    );
  }
  targetVolume() {
    return this.settings.volume * (this.ducked ? 0.5 : 1);
  }
  initializeContext() {
    if (this.context) return;
    const context = this.createContext();
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    const gains = this.audio.map((audio) => {
      const gain = context.createGain();
      gain.gain.value = 0;
      context.createMediaElementSource(audio).connect(gain);
      gain.connect(master);
      return gain;
    });
    this.context = context;
    this.master = master;
    this.gains = gains;
  }
  playCurrent(fade) {
    if (!this.shouldPlay()) return;
    if (
      this.status === "playing" &&
      !this.audio[this.activeDeck].paused &&
      this.context?.state === "running"
    ) {
      this.emit();
      return;
    }
    this.clearTimers();
    this.switching = false;
    const operation = ++this.operation;
    const deck = this.activeDeck;
    try {
      this.initializeContext();
      this.audio[1 - deck].pause();
      this.setDeckTrack(deck, this.trackIndex);
      if (this.restartOnPlay) {
        this.audio[deck].currentTime = 0;
        this.restartOnPlay = false;
      }
      this.setGain(this.master.gain, 0);
      this.setGain(this.gains[deck].gain, 1);
      this.updateStatus(
        this.context.state === "running" ? "starting" : "awaiting-gesture",
      );
      const resumed =
        this.context.state === "running"
          ? Promise.resolve()
          : this.context.resume();
      void Promise.all([resumed, this.audio[deck].play()])
        .then(() => {
          if (this.disposed || !this.shouldPlay()) {
            this.audio[deck].pause();
            return;
          }
          if (operation !== this.operation) return;
          this.ramp(this.master.gain, this.targetVolume(), fade);
          this.updateStatus("playing");
        })
        .catch((error) => {
          if (operation !== this.operation || this.disposed) return;
          if (error instanceof DOMException && error.name === "NotAllowedError")
            this.updateStatus("awaiting-gesture");
          else if (error instanceof DOMException && error.name === "AbortError")
            this.updateStatus("paused");
          else this.skipFailedTrack();
        });
    } catch {
      this.updateStatus("error");
    }
  }
  pause(immediate, status = "paused") {
    this.operation += 1;
    this.clearTimers();
    this.switching = false;
    if (this.master) this.ramp(this.master.gain, 0, immediate ? 0 : 0.25);
    const stop = () => {
      this.audio.forEach((audio) => audio.pause());
      if (!this.shouldPlay() && this.context?.state === "running") {
        void this.context.suspend().catch(() => {});
      }
    };
    if (immediate) stop();
    else
      this.pauseTimer = window.setTimeout(() => {
        this.pauseTimer = null;
        stop();
      }, 270);
    this.updateStatus(status);
  }
  prepareNext() {
    const index = this.automaticTrackIndex();
    if (index !== null) this.setDeckTrack(1 - this.activeDeck, index);
  }
  primeSpareDeck() {
    const deck = 1 - this.activeDeck;
    if (
      !this.shouldPlay() ||
      !this.gains ||
      this.switching ||
      this.primedDecks.has(deck) ||
      this.primingDecks.has(deck)
    )
      return;
    const index = this.automaticTrackIndex();
    if (index === null) return;
    this.setDeckTrack(deck, index);
    this.setGain(this.gains[deck].gain, 0);
    this.primingDecks.add(deck);
    void this.audio[deck]
      .play()
      .then(() => {
        this.primedDecks.add(deck);
        if (
          !this.shouldPlay() ||
          (deck !== this.activeDeck && !this.switching)
        ) {
          this.audio[deck].pause();
          this.audio[deck].currentTime = 0;
        }
      })
      .catch(() => {})
      .finally(() => this.primingDecks.delete(deck));
  }
  automaticTrackIndex() {
    return this.settings.repeatOne && !this.failedTracks.has(this.trackIndex)
      ? this.trackIndex
      : this.queue.peekNext(this.failedTracks);
  }
  commitTrack(index, direction) {
    if (direction === "next") this.queue.commitNext(index);
    else if (direction === "previous") this.queue.commitPrevious(index);
    this.trackIndex = index;
    this.persist();
  }
  skipFailedTrack() {
    this.failedTracks.add(this.trackIndex);
    const next = this.queue.peekNext(this.failedTracks);
    if (next === null) {
      this.pause(true, "error");
      return;
    }
    this.commitTrack(next, "next");
    this.restartOnPlay = true;
    this.audio[this.activeDeck].pause();
    this.status = "paused";
    this.playCurrent(FORUM_MUSIC_FADE_IN_SECONDS);
  }
  setDeckTrack(deck, index) {
    if (this.deckTracks[deck] === index) return;
    const audio = this.audio[deck];
    audio.pause();
    audio.preload = "auto";
    audio.src = this.trackUrls[index];
    this.deckTracks[deck] = index;
    audio.load();
  }
  setGain(param, value) {
    const now = this.context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(value, now);
  }
  ramp(param, value, duration) {
    const now = this.context.currentTime;
    if (typeof param.cancelAndHoldAtTime === "function")
      param.cancelAndHoldAtTime(now);
    else {
      const current = param.value;
      param.cancelScheduledValues(now);
      param.setValueAtTime(current, now);
    }
    if (duration === 0) param.setValueAtTime(value, now);
    else param.linearRampToValueAtTime(value, now + duration);
  }
  clearTimers() {
    if (this.transitionTimer !== null)
      window.clearTimeout(this.transitionTimer);
    if (this.pauseTimer !== null) window.clearTimeout(this.pauseTimer);
    this.transitionTimer = null;
    this.pauseTimer = null;
  }
  persist() {
    try {
      this.storage?.setItem(
        FORUM_MUSIC_STORAGE_KEY,
        JSON.stringify({
          version: 2,
          ...this.settings,
          trackSrc: FORUM_MUSIC_TRACKS[this.trackIndex].src,
        }),
      );
    } catch {}
  }
  updateStatus(status) {
    this.status = status;
    this.emit();
  }
  emit() {
    if (!this.disposed) this.onChange(this.getSnapshot());
  }
}
