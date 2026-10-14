import Service, { service } from "@ember/service";
import { tracked } from "@glimmer/tracking";
import {
  ForumMusicPlayer,
  FORUM_MUSIC_STORAGE_KEY,
  FORUM_MUSIC_TRACKS,
  parseForumMusicSettings,
} from "./forum-music-player";

// Owned by the application, not a discovery/topic component. Header remounts
// and route transitions share the same streams, queue and current position.
export default class ForumMusicService extends Service {
  @service router;
  @tracked snapshot = {
    ...parseForumMusicSettings(null),
    status: "starting",
    trackIndex: 0,
    switching: false,
  };

  player = null;
  uploads = null;

  get isPublic() {
    const path = (this.router.currentURL || "/").split(/[?#]/, 1)[0];
    return (
      !this.router.currentRouteName?.startsWith("admin") &&
      !/^\/(admin|login|signup|password-reset|activate-account|invite)(\/|$)/.test(
        path,
      )
    );
  }

  configure(uploads) {
    this.uploads = uploads;
  }

  ensureStarted() {
    if (this.player || !this.isPublic) {
      return;
    }
    const trackUrls = FORUM_MUSIC_TRACKS.map(
      (track) => this.uploads?.[track.asset],
    );
    if (trackUrls.some((url) => !url)) {
      this.snapshot = { ...this.snapshot, status: "error" };
      return;
    }
    this.player = new ForumMusicPlayer({
      trackUrls,
      onChange: (snapshot) => {
        this.snapshot = snapshot;
      },
    });
    this.router.on("routeDidChange", this, this.routeChanged);
    document.addEventListener("click", this.unlock, true);
    document.addEventListener("keydown", this.unlock, true);
    document.addEventListener("visibilitychange", this.visibilityChanged);
    window.addEventListener("pagehide", this.pageHide);
    window.addEventListener("pageshow", this.visibilityChanged);
    window.addEventListener("storage", this.storageChanged);
    this.player.start(!document.hidden);
  }

  unlock = (event) => {
    if (
      !event.isTrusted ||
      !this.isPublic ||
      event.target?.closest?.("[data-ludivion-music]")
    ) {
      return;
    }
    this.player?.unlock();
  };

  // Route changes do not lower the volume: the user's 20% remains 20%.
  routeChanged() {
    this.visibilityChanged();
  }

  visibilityChanged = () => {
    this.player?.setVisible(this.isPublic && !document.hidden);
  };

  pageHide = () => this.player?.setVisible(false);

  storageChanged = (event) => {
    if (event.key === FORUM_MUSIC_STORAGE_KEY || event.key === null) {
      this.player?.restoreSettings(event.newValue);
    }
  };

  willDestroy() {
    if (this.player) {
      this.router.off("routeDidChange", this, this.routeChanged);
      document.removeEventListener("click", this.unlock, true);
      document.removeEventListener("keydown", this.unlock, true);
      document.removeEventListener("visibilitychange", this.visibilityChanged);
      window.removeEventListener("pagehide", this.pageHide);
      window.removeEventListener("pageshow", this.visibilityChanged);
      window.removeEventListener("storage", this.storageChanged);
      this.player.dispose();
    }
    super.willDestroy(...arguments);
  }
}
