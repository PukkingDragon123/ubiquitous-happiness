// Seeded PRNG (mulberry32) used for run generation so a seed reproduces a run.
export class Rng {
  s: number;
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  weighted<T>(items: readonly T[], w: (t: T) => number): T {
    let tot = 0; for (const it of items) tot += Math.max(0, w(it));
    let r = this.next() * tot;
    for (const it of items) { r -= Math.max(0, w(it)); if (r <= 0) return it; }
    return items[items.length - 1];
  }
  shuffle<T>(arr: T[]): T[] { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  fork(salt: number) { return new Rng((this.s ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0); }
}
export const rand = (a = 0, b = 1) => a + (b - a) * Math.random();
