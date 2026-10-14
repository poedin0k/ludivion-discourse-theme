export class ForumMusicQueue {
  count;
  random;
  shuffle;
  history;
  cursor = 0;
  upcoming;
  constructor({ count, initialIndex, shuffle, random = Math.random }) {
    this.count = count;
    this.random = random;
    this.shuffle = shuffle;
    this.history = [initialIndex];
    this.upcoming = this.createRound(true);
  }
  setShuffle(shuffle) {
    if (this.shuffle === shuffle) return;
    this.shuffle = shuffle;
    this.history = this.history.slice(0, this.cursor + 1);
    this.upcoming = this.createRound(true);
  }
  peekNext(failed) {
    for (let index = this.cursor + 1; index < this.history.length; index += 1) {
      if (!failed.has(this.history[index])) return this.history[index];
    }
    if (this.upcoming.length === 0) this.upcoming = this.createRound(false);
    let next = this.upcoming.find((index) => !failed.has(index));
    if (next === undefined) {
      this.upcoming = this.createRound(false);
      next = this.upcoming.find((index) => !failed.has(index));
    }
    return next ?? null;
  }
  peekPrevious(failed) {
    for (let index = this.cursor - 1; index >= 0; index -= 1) {
      if (!failed.has(this.history[index])) return this.history[index];
    }
    if (this.shuffle) {
      const previous = this.upcoming.findLast((index) => !failed.has(index));
      if (previous !== undefined) return previous;
    }
    for (let offset = 1; offset <= this.count; offset += 1) {
      const index = (this.current() - offset + this.count) % this.count;
      if (!failed.has(index)) return index;
    }
    return null;
  }
  commitNext(index) {
    const future = this.history.indexOf(index, this.cursor + 1);
    if (future >= 0) {
      this.cursor = future;
      return;
    }
    this.history = this.history.slice(0, this.cursor + 1);
    this.history.push(index);
    this.cursor += 1;
    this.upcoming = this.upcoming.filter((candidate) => candidate !== index);
    if (this.history.length > 256) {
      this.history.shift();
      this.cursor -= 1;
    }
  }
  commitPrevious(index) {
    for (let past = this.cursor - 1; past >= 0; past -= 1) {
      if (this.history[past] === index) {
        this.cursor = past;
        return;
      }
    }
    this.history.unshift(index);
    this.cursor = 0;
    if (this.history.length > 256) this.history.pop();
  }
  current() {
    return this.history[this.cursor];
  }
  createRound(excludeCurrent) {
    const current = this.current();
    const round = Array.from(
      {
        length: this.count,
      },
      (_, index) => (current + index + 1) % this.count,
    ).filter((index) => !excludeCurrent || index !== current);
    if (this.shuffle) {
      for (let index = round.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(this.random() * (index + 1));
        [round[index], round[swap]] = [round[swap], round[index]];
      }
      if (!excludeCurrent && round.length > 1 && round[0] === current) {
        [round[0], round[1]] = [round[1], round[0]];
      }
    }
    return round;
  }
}
