import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { ForumMusicQueue } from "../javascripts/lib/forum-music-queue.js";
import {
  FORUM_MUSIC_STORAGE_KEY,
  FORUM_MUSIC_TRACKS,
  ForumMusicPlayer,
  parseForumMusicSettings,
} from "../javascripts/lib/forum-music-player.js";

function fixture(t, stored = null, random = () => 0.37, options = {}) {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const writes = [];
  const media = [];
  const nodes = [];
  const snapshots = [];
  const context = {
    state: "running",
    get currentTime() {
      return now / 1000;
    },
    destination: {},
    resumes: 0,
    closed: false,
    async resume() {
      this.resumes += 1;
      this.state = "running";
    },
    async suspend() {
      this.state = "suspended";
    },
    async close() {
      this.closed = true;
      this.state = "closed";
    },
    createGain() {
      const node = {
        connect() {},
        gain: {
          value: 0,
          events: [],
          cancelScheduledValues(time) {
            this.events.push({ kind: "cancel", time });
          },
          cancelAndHoldAtTime(time) {
            this.events.push({ kind: "hold", time });
          },
          setValueAtTime(value, time) {
            this.value = value;
            this.events.push({ kind: "set", value, time });
          },
          linearRampToValueAtTime(value, time) {
            this.value = value;
            this.events.push({ kind: "ramp", value, time });
          },
        },
      };
      nodes.push(node);
      return node;
    },
    createMediaElementSource() {
      return { connect() {} };
    },
  };
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout(callback, delay = 0) {
      const id = ++nextTimer;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  t.after(() => {
    globalThis.window = previousWindow;
  });
  const storage = {
    getItem() {
      return stored;
    },
    setItem(key, value) {
      writes.push({ key, value: JSON.parse(value) });
      stored = value;
    },
  };
  let contextCreations = 0;
  const player = new ForumMusicPlayer({
    ...options,
    storage,
    random,
    onChange(snapshot) {
      snapshots.push(snapshot);
    },
    createContext() {
      contextCreations += 1;
      return context;
    },
    createAudio() {
      const audio = new EventTarget();
      Object.assign(audio, {
        src: "",
        duration: 120,
        currentTime: 0,
        paused: true,
        ended: false,
        plays: 0,
        loads: 0,
        blocked: false,
        play() {
          this.plays += 1;
          if (this.blocked)
            return Promise.reject(
              new DOMException("Blocked", "NotAllowedError"),
            );
          this.paused = false;
          return Promise.resolve();
        },
        pause() {
          this.paused = true;
        },
        load() {
          this.loads += 1;
          this.currentTime = 0;
        },
        removeAttribute(name) {
          if (name === "src") this.src = "";
        },
      });
      media.push(audio);
      return audio;
    },
  });
  const advance = (elapsed) => {
    const end = now + elapsed;
    while (true) {
      const entry = [...timers]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      now = entry[1].at;
      timers.delete(entry[0]);
      entry[1].callback();
    }
    now = end;
  };
  const flush = async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  };
  const snapshot = () => player.getSnapshot();
  const lastRamp = (node) =>
    node.gain.events.filter((event) => event.kind === "ramp").at(-1);
  return {
    player,
    media,
    context,
    nodes,
    writes,
    snapshots,
    advance,
    flush,
    snapshot,
    lastRamp,
    contextCreations: () => contextCreations,
  };
}

test("fresh visits autoplay at 20% through a short 0.6-second fade from silence", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  assert.equal(f.snapshot().status, "playing");
  assert.equal(f.snapshot().enabled, true);
  assert.equal(f.snapshot().volume, 0.2);
  assert.equal(f.media[0].src, FORUM_MUSIC_TRACKS[0].src);
  assert.equal(
    f.media[1].src,
    "",
    "the next track is not fetched on initial load",
  );
  assert.ok(
    f.nodes[0].gain.events.some(
      (event) => event.kind === "set" && event.value === 0,
    ),
  );
  assert.deepEqual(f.lastRamp(f.nodes[0]), {
    kind: "ramp",
    value: 0.2,
    time: 0.6,
  });
});

test("saved disabled music does not create an audio context or download a track", async (t) => {
  const f = fixture(
    t,
    JSON.stringify({ version: 1, enabled: false, volume: 0.35 }),
  );
  f.player.start();
  await f.flush();
  assert.equal(f.contextCreations(), 0);
  assert.equal(f.snapshot().status, "paused");
  assert.equal(f.snapshot().volume, 0.35);
  assert.ok(f.media.every((audio) => !audio.src && audio.plays === 0));
});

test("blocked autoplay waits for interaction, then fades in", async (t) => {
  const f = fixture(t);
  f.media[0].blocked = true;
  f.context.state = "suspended";
  f.player.start();
  await f.flush();
  assert.equal(f.snapshot().status, "awaiting-gesture");
  assert.equal(f.nodes[0].gain.value, 0);
  f.media[0].blocked = false;
  f.player.unlock();
  await f.flush();
  assert.equal(f.snapshot().status, "playing");
  assert.equal(f.lastRamp(f.nodes[0]).value, 0.2);
});

test("interaction silently primes the second media element for Safari's per-element playback permission", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  f.player.unlock();
  await f.flush();
  assert.equal(f.media[1].plays, 1);
  assert.equal(f.media[1].paused, true);
  assert.equal(f.nodes[2].gain.value, 0);
  assert.equal(f.snapshot().trackIndex, 0);
  f.player.unlock();
  await f.flush();
  assert.equal(f.media[1].plays, 1, "the spare deck is only primed once");
});

test("turning music off persists immediately and pauses after the short fade", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  f.player.toggle();
  assert.equal(f.snapshot().enabled, false);
  assert.equal(f.writes.at(-1).key, FORUM_MUSIC_STORAGE_KEY);
  assert.equal(f.writes.at(-1).value.enabled, false);
  assert.equal(f.media[0].paused, false);
  f.advance(270);
  assert.ok(f.media.every((audio) => audio.paused));
  f.player.unlock();
  f.player.setVisible(false);
  f.player.setVisible(true);
  await f.flush();
  assert.equal(
    f.media[0].plays,
    1,
    "a saved off preference is not undone by an interaction or tab return",
  );
});

test("manual switching overlaps two decks without a summed gain above one", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  await f.player.next();
  assert.equal(f.snapshot().trackIndex, 1);
  assert.equal(f.snapshot().switching, true);
  assert.ok(f.media.every((audio) => !audio.paused));
  assert.deepEqual(f.lastRamp(f.nodes[1]), { kind: "ramp", value: 0, time: 5 });
  assert.deepEqual(f.lastRamp(f.nodes[2]), { kind: "ramp", value: 1, time: 5 });
  await f.player.next();
  assert.equal(
    f.snapshot().trackIndex,
    1,
    "repeated next clicks do not start another overlapping track",
  );
  f.advance(5000);
  assert.equal(f.media[0].paused, true);
  assert.equal(f.media[1].paused, false);
  assert.equal(f.snapshot().switching, false);
});

test("the next track preloads near the end and the automatic fade fits the remaining duration", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  f.media[0].currentTime = 100;
  f.media[0].dispatchEvent(new Event("timeupdate"));
  assert.equal(f.media[1].src, FORUM_MUSIC_TRACKS[1].src);
  assert.equal(f.media[1].plays, 0);
  f.media[0].currentTime = 116;
  f.media[0].dispatchEvent(new Event("timeupdate"));
  await f.flush();
  assert.equal(f.snapshot().trackIndex, 1);
  assert.equal(f.lastRamp(f.nodes[1]).time, 4);
});

test("the playlist cycles through all six files and returns to the first", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  assert.equal(FORUM_MUSIC_TRACKS.length, 6);
  for (const expected of [1, 2, 3, 4, 5, 0]) {
    await f.player.next();
    assert.equal(f.snapshot().trackIndex, expected);
    f.advance(5000);
  }
});

test("hiding during a crossfade stops both decks; returning restores one deck at the saved volume", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  f.player.setVolume(0.4);
  await f.player.next();
  f.player.setVisible(false);
  assert.ok(f.media.every((audio) => audio.paused));
  f.advance(6000);
  f.player.setVisible(true);
  await f.flush();
  assert.equal(f.snapshot().trackIndex, 1);
  assert.equal(f.snapshot().volume, 0.4);
  assert.equal(f.media[0].paused, true);
  assert.equal(f.media[1].paused, false);
  assert.equal(f.lastRamp(f.nodes[0]).value, 0.4);
});

test("modal ducking preserves the user volume and does not persist the temporary reduction", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  f.player.setDucked(true);
  assert.equal(f.lastRamp(f.nodes[0]).value, 0.1);
  assert.equal(f.snapshot().volume, 0.2);
  assert.equal(f.writes.length, 0);
  f.player.setDucked(false);
  assert.equal(f.lastRamp(f.nodes[0]).value, 0.2);
});

test("a delayed autoplay completion cannot restart muted music", async (t) => {
  const f = fixture(t);
  let resolve;
  f.media[0].play = function () {
    this.paused = false;
    return new Promise((done) => {
      resolve = done;
    });
  };
  f.player.start();
  f.player.setEnabled(false);
  resolve();
  await f.flush();
  assert.equal(f.snapshot().enabled, false);
  assert.equal(f.media[0].paused, true);
  assert.equal(f.snapshot().status, "paused");
});

test("storage changes apply without echoing writes, and broken preferences use defaults", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  f.player.restoreSettings(
    JSON.stringify({ version: 1, enabled: false, volume: 0.6 }),
  );
  f.advance(270);
  assert.equal(f.snapshot().enabled, false);
  assert.equal(f.snapshot().volume, 0.6);
  assert.equal(f.writes.length, 0);
  assert.deepEqual(parseForumMusicSettings("broken"), {
    enabled: true,
    volume: 0.2,
    shuffle: false,
    repeatOne: false,
  });
  assert.deepEqual(
    parseForumMusicSettings(
      JSON.stringify({ version: 1, enabled: false, volume: 4 }),
    ),
    { enabled: false, volume: 1, shuffle: false, repeatOne: false },
  );
});

test("disposing during a transition clears both streams and closes the audio context", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  await f.player.next();
  const emissions = f.snapshots.length;
  f.player.dispose();
  f.advance(6000);
  await f.flush();
  assert.ok(f.media.every((audio) => audio.paused && audio.src === ""));
  assert.equal(f.context.closed, true);
  assert.equal(f.snapshots.length, emissions);
});

test("missing audio files are skipped and a wholly unavailable playlist stops cleanly", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  for (const expected of [1, 2, 3, 4, 5]) {
    f.media[0].dispatchEvent(new Event("error"));
    await f.flush();
    assert.equal(f.snapshot().trackIndex, expected);
  }
  f.media[0].dispatchEvent(new Event("error"));
  await f.flush();
  assert.equal(f.snapshot().status, "error");
  assert.ok(f.media.every((audio) => audio.paused));
});

test("all six theme uploads point to real MP3 files", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../about.json", import.meta.url), "utf8"),
  );
  assert.equal(new Set(FORUM_MUSIC_TRACKS.map((track) => track.asset)).size, 6);
  for (const track of FORUM_MUSIC_TRACKS) {
    const path = new URL("../" + manifest.assets[track.asset], import.meta.url);
    assert.ok((await stat(path)).size > 0);
    const data = await readFile(path);
    assert.ok(
      data.toString("ascii", 0, 3) === "ID3" ||
        (data[0] === 0xff && (data[1] & 0xe0) === 0xe0),
    );
  }
});

test("hashed upload URLs drive playback while persisted selection survives an asset update", async (t) => {
  const trackUrls = FORUM_MUSIC_TRACKS.map(
    (_, index) => `https://cdn.example.test/v1/${index}.mp3`,
  );
  const f = fixture(t, null, undefined, { trackUrls });
  f.player.start();
  await f.flush();
  assert.equal(f.media[0].src, trackUrls[0]);
  assert.equal(f.media[0].crossOrigin, "anonymous");
  await f.player.next();
  await f.flush();
  assert.equal(f.media[1].src, trackUrls[1]);
  assert.equal(f.writes.at(-1).value.trackSrc, FORUM_MUSIC_TRACKS[1].src);
  f.player.dispose();
  f.advance(220);
  const restored = fixture(
    t,
    JSON.stringify(f.writes.at(-1).value),
    undefined,
    {
      trackUrls: trackUrls.map((url) => url.replace("v1", "v2")),
    },
  );
  restored.player.start();
  await restored.flush();
  assert.equal(restored.snapshot().trackIndex, 1);
  assert.equal(restored.media[0].src, "https://cdn.example.test/v2/1.mp3");
  assert.equal(restored.snapshot().volume, 0.2);
});

test("legacy settings migrate without enabling muted music or fetching tracks", async (t) => {
  const f = fixture(
    t,
    JSON.stringify({ version: 1, enabled: false, volume: 0.43 }),
  );
  f.player.start();
  f.player.setShuffle(true);
  f.player.setRepeatOne(true);
  await f.flush();
  assert.equal(f.snapshot().enabled, false);
  assert.equal(f.snapshot().volume, 0.43);
  assert.equal(f.snapshot().shuffle, true);
  assert.equal(f.snapshot().repeatOne, true);
  assert.equal(f.contextCreations(), 0);
  assert.ok(f.media.every((audio) => !audio.src && audio.loads === 0));
  assert.deepEqual(f.writes.at(-1).value, {
    version: 2,
    enabled: false,
    volume: 0.43,
    shuffle: true,
    repeatOne: true,
    trackSrc: FORUM_MUSIC_TRACKS[0].src,
  });
});

test("restored Repeat 1 keeps the chosen song and rejects unknown file paths", async (t) => {
  const settings = {
    version: 2,
    enabled: true,
    volume: 0.31,
    shuffle: true,
    repeatOne: true,
  };
  const f = fixture(
    t,
    JSON.stringify({ ...settings, trackSrc: FORUM_MUSIC_TRACKS[5].src }),
  );
  f.player.start();
  await f.flush();
  assert.equal(f.snapshot().trackIndex, 5);
  assert.equal(f.media[0].src, FORUM_MUSIC_TRACKS[5].src);
  assert.equal(f.snapshot().repeatOne, true);
  assert.equal(f.snapshot().shuffle, true);
  const invalid = fixture(
    t,
    JSON.stringify({
      ...settings,
      enabled: false,
      trackSrc: "https://example.com/other.mp3",
    }),
  );
  invalid.player.start();
  assert.equal(invalid.snapshot().trackIndex, 0);
  assert.ok(invalid.media.every((audio) => !audio.src));
});

test("Previous wraps at the start and traverses actual playback history", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  await f.player.previous();
  assert.equal(f.snapshot().trackIndex, 5);
  assert.equal(f.snapshot().switching, true);
  assert.deepEqual(f.lastRamp(f.nodes[1]), { kind: "ramp", value: 0, time: 5 });
  f.advance(5000);
  await f.player.next();
  assert.equal(f.snapshot().trackIndex, 0);
  f.advance(5000);
  await f.player.next();
  assert.equal(f.snapshot().trackIndex, 1);
  f.advance(5000);
  await f.player.previous();
  assert.equal(f.snapshot().trackIndex, 0);
});

test("navigation while paused selects songs without playback, then starts the selection from zero", async (t) => {
  const f = fixture(
    t,
    JSON.stringify({ version: 1, enabled: false, volume: 0.4 }),
  );
  f.player.start();
  await f.player.previous();
  assert.equal(f.snapshot().trackIndex, 5);
  await f.player.next();
  await f.player.next();
  assert.equal(f.snapshot().trackIndex, 1);
  assert.equal(f.snapshot().status, "paused");
  assert.equal(f.contextCreations(), 0);
  assert.ok(f.media.every((audio) => audio.loads === 0 && audio.plays === 0));
  assert.equal(f.writes.at(-1).value.enabled, false);
  f.player.toggle();
  await f.flush();
  assert.equal(f.media[0].src, FORUM_MUSIC_TRACKS[1].src);
  assert.equal(f.media[0].currentTime, 0);
  assert.equal(f.snapshot().status, "playing");
});

test("Pause suspends audio processing and Play resumes the same position and volume", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  f.player.setVolume(0.38);
  f.media[0].currentTime = 34;
  f.player.toggle();
  f.advance(270);
  await f.flush();
  assert.equal(f.context.state, "suspended");
  assert.ok(f.media.every((audio) => audio.paused));
  f.player.toggle();
  await f.flush();
  assert.equal(f.context.state, "running");
  assert.equal(f.media[0].currentTime, 34);
  assert.equal(f.snapshot().volume, 0.38);
});

test("Repeat 1 crossfades the same song from its end to its beginning on two decks", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  f.player.setRepeatOne(true);
  f.media[0].currentTime = 100;
  f.media[0].dispatchEvent(new Event("timeupdate"));
  assert.equal(f.media[1].src, FORUM_MUSIC_TRACKS[0].src);
  f.media[0].currentTime = 116;
  f.media[0].dispatchEvent(new Event("timeupdate"));
  await f.flush();
  assert.equal(f.snapshot().trackIndex, 0);
  assert.equal(f.snapshot().switching, true);
  assert.equal(f.media[1].currentTime, 0);
  assert.ok(f.media.every((audio) => !audio.paused));
  assert.equal(f.lastRamp(f.nodes[1]).time, 4);
  f.advance(4000);
  assert.equal(f.media[0].paused, true);
  assert.equal(f.media[1].paused, false);
  await f.player.next();
  assert.equal(
    f.snapshot().trackIndex,
    1,
    "manual Next overrides the automatic repeat",
  );
  f.advance(5000);
  await f.player.previous();
  assert.equal(f.snapshot().trackIndex, 0);
  assert.equal(f.snapshot().repeatOne, true);
});

test("changing Repeat 1 after preloading does not play the stale preloaded target", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  f.media[0].currentTime = 100;
  f.media[0].dispatchEvent(new Event("timeupdate"));
  assert.equal(f.media[1].src, FORUM_MUSIC_TRACKS[1].src);
  f.player.setRepeatOne(true);
  f.media[0].currentTime = 116;
  f.media[0].dispatchEvent(new Event("timeupdate"));
  await f.flush();
  assert.equal(f.media[1].src, FORUM_MUSIC_TRACKS[0].src);
  f.advance(4000);
  f.player.setRepeatOne(false);
  f.media[1].currentTime = 116;
  f.media[1].dispatchEvent(new Event("timeupdate"));
  await f.flush();
  assert.equal(f.snapshot().trackIndex, 1);
});

test("Shuffle plays every song once per round without immediate boundary repeats", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  f.player.setShuffle(true);
  let last;
  for (let round = 0; round < 4; round += 1) {
    const seen = [];
    for (let position = 0; position < 6; position += 1) {
      if (round > 0 || position > 0) {
        await f.player.next();
        f.advance(5000);
      }
      const index = f.snapshot().trackIndex;
      assert.notEqual(index, last);
      seen.push(index);
      last = index;
    }
    assert.equal(new Set(seen).size, 6);
  }
});

test("preloading shuffled songs peeks without consuming the queue", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  f.player.setShuffle(true);
  f.media[0].currentTime = 100;
  for (let event = 0; event < 4; event += 1)
    f.media[0].dispatchEvent(new Event("timeupdate"));
  const prepared = f.media[1].src;
  assert.equal(f.media[1].loads, 1);
  await f.player.next();
  assert.equal(FORUM_MUSIC_TRACKS[f.snapshot().trackIndex].src, prepared);
});

test("Previous and Next replay real shuffled history, including after a mode change", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  f.player.setShuffle(true);
  const heard = [0];
  for (let step = 0; step < 4; step += 1) {
    await f.player.next();
    f.advance(5000);
    heard.push(f.snapshot().trackIndex);
  }
  f.player.setShuffle(false);
  await f.player.previous();
  assert.equal(f.snapshot().trackIndex, heard[3]);
  f.advance(5000);
  await f.player.previous();
  assert.equal(f.snapshot().trackIndex, heard[2]);
  f.advance(5000);
  await f.player.next();
  assert.equal(f.snapshot().trackIndex, heard[3]);
  f.advance(5000);
  await f.player.next();
  assert.equal(f.snapshot().trackIndex, heard[4]);
});

test("failed incoming playback does not consume a queue entry or corrupt history", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  const play = f.media[1].play;
  f.media[1].play = () => Promise.reject(new Error("missing track"));
  await f.player.next();
  assert.equal(f.snapshot().trackIndex, 0);
  assert.equal(f.snapshot().switching, false);
  f.media[1].play = play;
  await f.player.next();
  assert.equal(f.snapshot().trackIndex, 2);
  f.advance(5000);
  await f.player.previous();
  assert.equal(f.snapshot().trackIndex, 0);
});

test("a round with failed remaining songs falls back to healthy previously played songs", () => {
  const queue = new ForumMusicQueue({
    count: 6,
    initialIndex: 0,
    shuffle: false,
  });
  queue.commitNext(1);
  queue.commitNext(2);
  const failed = new Set([2, 3, 4, 5]);
  assert.equal(queue.peekNext(failed), 0);
  queue.commitNext(0);
  assert.equal(queue.peekNext(failed), 1);
  assert.equal(queue.peekNext(new Set([0, 1, 2, 3, 4, 5])), null);
});

test("mode changes during a pending transition retain the other unplayed songs", async (t) => {
  const f = fixture(t);
  f.player.start();
  await f.flush();
  let resolve;
  const play = f.media[1].play;
  f.media[1].play = function () {
    this.paused = false;
    return new Promise((done) => {
      resolve = done;
    });
  };
  const next = f.player.next();
  f.player.setShuffle(true);
  resolve();
  await next;
  f.media[1].play = play;
  f.advance(5000);
  const heard = new Set([0, 1]);
  for (let step = 0; step < 4; step += 1) {
    await f.player.next();
    f.advance(5000);
    heard.add(f.snapshot().trackIndex);
  }
  assert.equal(heard.size, 6);
});

test("invalid persisted mode values fall back safely without affecting mute", () => {
  assert.deepEqual(
    parseForumMusicSettings(
      JSON.stringify({
        version: 2,
        enabled: false,
        volume: 0.7,
        shuffle: "yes",
        repeatOne: 1,
      }),
    ),
    {
      enabled: false,
      volume: 0.7,
      shuffle: false,
      repeatOne: false,
    },
  );
});
