// The title's logo (v8b): a calm wordmark in Alagard, the game's one face. BLOBFISH big in bone (three UI px per font
// px, every glyph pixel whole), a soft ink shadow under it, and REEL REBELLION letter-spaced in the gold accent between
// two thin gold rules. It fades and rises in, the rules grow out from the middle; a click on it (poke) sends a small
// hop through the letters. No 3D, no texture, no decals.
//
//   const logo = new Logo();  logo.draw(ui, x, y, { t, appear, alpha });   logo.w / logo.h (UI px);  logo.poke()
import type { PixelUI } from '../ui/pixel/ui';
import { C } from '../ui/pixel/skins';
import { clamp01 } from '../core/math';

const WORD = 'BLOBFISH';
/** UI px per font px of the wordmark (Alagard's cap is 11 font px: a 33 px cap) */
const SIZE = 3;
const SUB_TRACK = 2;
const ease = (k: number) => 1 - (1 - clamp01(k)) ** 3;

/** v7 palettes (kept for old importers; unused by the flat logo) */
export interface JellyPal { face: unknown[]; side: unknown[] }
export const PINK: JellyPal = { face: [], side: [] };
export const SEAGLASS: JellyPal = { face: [], side: [] };

export class Logo {
  w = 0; h = 0;
  readonly sub = 'REEL REBELLION';
  private built = false;
  private wordW = 0; private subW = 0; private cap = 0; private subCap = 0;
  private pokeT = 9;
  private hd = 0;

  /** measure now (its size is known from here on) */
  prepare(ui: PixelUI) { if (!this.built || this.hd !== ui.hd) this.build(ui); }
  private build(ui: PixelUI) {
    this.built = true; this.hd = ui.hd;
    this.wordW = Math.ceil(ui.measure(WORD, 'body', SIZE));
    this.cap = Math.round(ui.cap('body', SIZE));
    this.subW = [...this.sub].reduce((a, ch) => a + ui.measure(ch, 'body') + SUB_TRACK, -SUB_TRACK);
    this.subCap = Math.round(ui.cap('body'));
    this.w = Math.max(this.wordW, Math.ceil(this.subW) + 40) + 4;
    this.h = this.cap + 14 + this.subCap + 8;
  }

  /** a little hop runs through the letters */
  poke() { this.pokeT = 0; }

  /** the rect the logo covers at (x, y) (for hit tests) */
  rect(x: number, y: number): [number, number, number, number] { return [x, y, this.w, this.h]; }

  /**
   * draw at (x, y) UI px (the top-left). t: the screen clock (s); appear: seconds since the logo started showing;
   * alpha: an overall fade (leaving).
   */
  draw(ui: PixelUI, x: number, y: number, o: { t: number; appear: number; alpha?: number }) {
    this.prepare(ui);
    const A = o.alpha ?? 1, ap = o.appear;
    if (A <= 0.01) return;
    this.pokeT += ui.dt;
    const k = ease(ap / 0.7), a = clamp01(ap / 0.5) * A;
    const wx = Math.round(x + (this.w - this.wordW) / 2), wy = Math.round(y + (1 - k) * 6);
    // the wordmark, letter by letter (for the poke's hop): a soft ink shadow 2 px down, then bone
    let cx = wx;
    [...WORD].forEach((ch, i) => {
      const p = this.pokeT * 12 - i * 0.7;
      const hop = p > 0 && p < Math.PI ? Math.round(Math.sin(p) * 4) : 0;
      const cw = ui.measure(ch, 'body', SIZE);
      ui.text(ch, cx + 1, wy + 3 - hop, { font: 'body', size: SIZE, color: C.ink, shadow: null, alpha: a * 0.55 });
      ui.text(ch, cx, wy - hop, { font: 'body', size: SIZE, color: C.bone2, shadow: null, alpha: a });
      cx += cw;
    });
    // REEL REBELLION, letter-spaced, between two rules that grow out from the middle
    const sy = wy + this.cap + 14;
    const sa = clamp01((ap - 0.35) / 0.4) * A;
    const mid = Math.round(x + this.w / 2);
    let sx = Math.round(mid - this.subW / 2);
    for (const ch of this.sub) { ui.text(ch, sx, sy, { font: 'body', color: C.gold, shadow: C.ink, alpha: sa }); sx += ui.measure(ch, 'body') + SUB_TRACK; }
    const rl = Math.round(Math.max(0, (this.wordW - this.subW) / 2 - 12) * ease((ap - 0.45) / 0.6));
    const ry = sy + Math.round(this.subCap / 2);
    if (rl > 0) {
      ui.fill(Math.round(mid - this.subW / 2 - 10 - rl), ry, rl, 1, C.gold0, sa);
      ui.fill(Math.round(mid + this.subW / 2 + 10), ry, rl, 1, C.gold0, sa);
    }
  }
}

/**
 * any word in the wordmark's style (v7's jelly letters, now flat Alagard): the pause screen's title and the like.
 *   const jw = new JellyWord('PAUSED', 30);  jw.draw(ui, x, y, t, appear)   (jw.w / jw.h once measured)
 * `cap` picks the scale: about cap / 11 UI px per font px (at least 2).
 */
export class JellyWord {
  w = 0; h = 0;
  private scale: number;
  constructor(readonly word: string, readonly cap = 30, readonly pal: JellyPal = PINK) { this.scale = Math.max(2, Math.round(cap / 11)); }
  /** measure on a UI (its density decides the exact width) */
  measure(ui: PixelUI): [number, number] { this.w = Math.ceil(ui.measure(this.word, 'body', this.scale)); this.h = Math.round(ui.cap('body', this.scale)); return [this.w, this.h]; }
  /** v7 API: the last measured size */
  size(): [number, number] { return [this.w, this.h]; }
  draw(ui: PixelUI, x: number, y: number, t: number, appear = 9, alpha = 1) {
    void t;
    this.measure(ui);
    const k = ease(appear / 0.5), a = clamp01(appear / 0.35) * alpha;
    const yy = Math.round(y + (1 - k) * 5);
    ui.text(this.word, x + 1, yy + 2, { font: 'body', size: this.scale, color: C.ink, shadow: null, alpha: a * 0.55 });
    ui.text(this.word, x, yy, { font: 'body', size: this.scale, color: C.bone2, shadow: null, alpha: a });
  }
}
