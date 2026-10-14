import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FORUM_MUSIC_STORAGE_KEY,
  FORUM_MUSIC_TRACKS,
  parseForumMusicSettings,
} from "../javascripts/lib/forum-music-player.js";

// Exercise the service's lifecycle without requiring a running Ember app.
// Decorators only supply the owner/router and tracked publication in production.
const serviceSource = readFileSync(
  new URL("../javascripts/lib/forum-music-service.js", import.meta.url),
  "utf8",
)
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace("export default class", "class")
  .replace(/@service router;/, "")
  .replace(/@tracked /g, "");
function fixture(
  t,
  uploads = Object.fromEntries(
    FORUM_MUSIC_TRACKS.map((track) => [
      track.asset,
      `/uploads/${track.asset}.mp3`,
    ]),
  ),
) {
  const listenerMap = () => {
    const listeners = new Map();
    return {
      addEventListener(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
      },
      removeEventListener(name, fn) {
        listeners.get(name)?.delete(fn);
      },
      fire(name, event = {}) {
        for (const fn of listeners.get(name) || []) fn(event);
      },
    };
  };
  const document = { ...listenerMap(), hidden: false };
  const window = listenerMap();
  const previous = { document: globalThis.document, window: globalThis.window };
  globalThis.document = document;
  globalThis.window = window;
  t.after(() => {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
  });
  const players = [];
  class Player {
    constructor(options) {
      this.options = options;
      this.visibility = [];
      this.unlocks = 0;
      this.restores = [];
      this.disposed = false;
      players.push(this);
    }
    start(visible) {
      this.visibility.push(visible);
    }
    setVisible(visible) {
      this.visibility.push(visible);
    }
    unlock() {
      this.unlocks++;
    }
    restoreSettings(raw) {
      this.restores.push(raw);
    }
    dispose() {
      this.disposed = true;
    }
  }
  const Service = new Function(
    "Service",
    "ForumMusicPlayer",
    "FORUM_MUSIC_STORAGE_KEY",
    "FORUM_MUSIC_TRACKS",
    "parseForumMusicSettings",
    `${serviceSource}\nreturn ForumMusicService;`,
  )(
    class {
      willDestroy() {}
    },
    Player,
    FORUM_MUSIC_STORAGE_KEY,
    FORUM_MUSIC_TRACKS,
    parseForumMusicSettings,
  );
  const listeners = new Set();
  const router = {
    currentURL: "/",
    currentRouteName: "discovery.latest",
    on(event, target, fn) {
      listeners.add(() => fn.call(target));
    },
    off() {
      listeners.clear();
    },
  };
  const service = new Service();
  service.router = router;
  service.configure(uploads);
  const route = (url, name) => {
    router.currentURL = url;
    router.currentRouteName = name;
    for (const fn of listeners) fn();
  };
  return { service, players, router, route, window, document };
}

test("header remounts and public navigation retain one player and its upload sources", (t) => {
  const f = fixture(t);
  f.service.ensureStarted();
  const player = f.service.player;
  f.route("/c/example/2", "discovery.category");
  f.service.ensureStarted();
  f.route("/t/example/42/3", "topic.fromParams");
  f.service.ensureStarted();
  assert.equal(f.players.length, 1);
  assert.equal(f.service.player, player);
  assert.deepEqual(
    player.options.trackUrls,
    FORUM_MUSIC_TRACKS.map((track) => `/uploads/${track.asset}.mp3`),
  );
  assert.equal(f.service.snapshot.volume, 0.2);
  assert.deepEqual(player.visibility, [true, true, true]);
});
test("Admin, auth routes and hidden tabs pause; public routes resume the same session", (t) => {
  const f = fixture(t);
  f.route("/admin", "admin.index");
  f.service.ensureStarted();
  assert.equal(f.players.length, 0);
  f.route("/", "discovery.latest");
  f.service.ensureStarted();
  f.route("/admin/users", "admin.users");
  assert.equal(f.service.isPublic, false);
  f.route("/signup", "signup");
  assert.equal(f.service.isPublic, false);
  f.route("/latest", "discovery.latest");
  f.document.hidden = true;
  f.document.fire("visibilitychange");
  f.document.hidden = false;
  f.document.fire("visibilitychange");
  f.window.fire("pagehide");
  f.window.fire("pageshow");
  assert.deepEqual(f.service.player.visibility, [
    true,
    false,
    false,
    true,
    false,
    true,
    false,
    true,
  ]);
  assert.equal(f.players.length, 1);
});
test("trusted interaction unlocks once; teardown removes input, storage and route listeners", (t) => {
  const f = fixture(t);
  f.service.ensureStarted();
  const p = f.service.player;
  f.document.fire("click", { isTrusted: false });
  f.document.fire("click", {
    isTrusted: true,
    target: { closest: () => ({}) },
  });
  f.document.fire("click", {
    isTrusted: true,
    target: { closest: () => null },
  });
  assert.equal(p.unlocks, 1);
  f.window.fire("storage", { key: "unrelated", newValue: "ignored" });
  f.window.fire("storage", {
    key: FORUM_MUSIC_STORAGE_KEY,
    newValue: "preferences",
  });
  assert.deepEqual(p.restores, ["preferences"]);
  f.service.willDestroy();
  assert.equal(p.disposed, true);
  const oldLength = p.visibility.length;
  f.route("/admin", "admin.index");
  f.document.fire("visibilitychange");
  f.document.fire("click", { isTrusted: true });
  f.window.fire("storage", { key: null, newValue: null });
  assert.equal(p.visibility.length, oldLength);
  assert.equal(p.unlocks, 1);
  assert.deepEqual(p.restores, ["preferences"]);
});
test("missing bundled uploads show an error without fetching incorrect /music paths", (t) => {
  const f = fixture(t, {});
  f.service.ensureStarted();
  assert.equal(f.players.length, 0);
  assert.equal(f.service.snapshot.status, "error");
});
