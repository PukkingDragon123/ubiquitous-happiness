// The touch layer (v8): full play on a phone or tablet held sideways, with no keyboard or mouse. It only shows on a
// touch device (a coarse pointer, or the first touch seen; ?touch=1 forces it, ?touch=0 turns it off).
//
//   - a floating MOVE STICK on the left of the screen: its ring appears where the thumb lands and the knob follows it
//     (the ring trails the thumb if it wanders off); it feeds Input.axis() (analog) and, past half-way, the arrow
//     keys (menus, the fishing QTE's arrow sequences)
//   - round flat BUTTONS on the right (v8b: translucent ink discs, a 1 px bone ring, mono glyphs), thumb-sized, clustered around the big ATTACK: DASH (held = Shift held: tap to
//     dart, hold to charge, let go to launch), GUARD (ability), SKILL (the selected slot) and the little CYCLE chip
//     (ability2), USE (interact, with the screen's word on it), HEAL (the clams), BOMB; BAG and PAUSE up top right
//   - context: each screen says what makes sense right now (Screen.touch() -> TouchSpec); anything not listed is
//     hidden, `dim` ones are faint (they would do nothing). Menus and panels list nothing: a tap there is a click.
//   - every finger is tracked on its own (pointer ids), so moving, attacking and dashing at once all work; a touch the
//     layer does not claim is the mouse (src/core/input.ts)
//   - held sideways is the only way: a phone held upright gets a "turn it sideways" card
// Drawn on its own PixelUI over everything (the 640 x 360 UI grid; sizes are picked in CSS px so a thumb always fits).
//
//   const t = new TouchLayer(input); each frame: t.update(dt, spec, w, h, pixelRatio); overlays.push(t.layer) when t.visible
import { PixelUI } from './pixel/ui';
import { Px, hx, type C } from './pixel/decor';
import { C as K } from './pixel/skins';
import type { Input, TouchHook } from '../core/input';
import { audio } from '../audio/audio';
import { clamp01, damp } from '../core/math';

export type TouchBtn = 'attack' | 'ability' | 'skill' | 'cycle' | 'dash' | 'interact' | 'flask' | 'bomb' | 'bag' | 'pause' | 'rotate';
type Anchor = 'br' | 'tr' | 'tl' | 'tc' | 'bl';
export interface TouchBtnOpts {
  /** shown faint: it does nothing right now */ dim?: boolean;
  /** a word on the button (USE: 'TALK', 'BUY', 'OPEN' ...) */ label?: string;
  /** the key it presses (SKILL: 'Digit2' for the second slot) */ code?: string;
  /** a tint for the glass (the skill's colour) */ color?: string;
  /** a count in the corner (clams, bombs) */ count?: number;
  /** somewhere else than the default spot (CSS px from the anchor's corner) */ at?: { a: Anchor; x: number; y: number; r?: number };
}
/** what a screen wants on the touch layer right now */
export interface TouchSpec { stick?: boolean; buttons?: Partial<Record<TouchBtn, boolean | TouchBtnOpts>> }

const CODE: Record<TouchBtn, string> = { attack: 'KeyJ', ability: 'KeyK', skill: 'Digit1', cycle: 'KeyL', dash: 'ShiftLeft', interact: 'KeyE', flask: 'KeyH', bomb: 'KeyG', bag: 'Tab', pause: 'Escape', rotate: 'KeyR' };
/** default spots, CSS px from a corner (x in from the side, y in from the top / bottom), r = radius */
const SPOT: Record<TouchBtn, { a: Anchor; x: number; y: number; r: number }> = {
  attack: { a: 'br', x: 70, y: 72, r: 37 },
  dash: { a: 'br', x: 160, y: 50, r: 27 },
  ability: { a: 'br', x: 142, y: 134, r: 25 },
  skill: { a: 'br', x: 66, y: 166, r: 24 },
  cycle: { a: 'br', x: 24, y: 196, r: 13 },
  interact: { a: 'br', x: 238, y: 58, r: 25 },
  flask: { a: 'br', x: 224, y: 132, r: 19 },
  bomb: { a: 'br', x: 182, y: 194, r: 18 },
  bag: { a: 'tr', x: 26, y: 132, r: 17 },
  pause: { a: 'tr', x: 26, y: 92, r: 17 },
  rotate: { a: 'tc', x: 0, y: 44, r: 24 },
};
const ORDER: TouchBtn[] = ['pause', 'bag', 'bomb', 'flask', 'interact', 'cycle', 'skill', 'ability', 'dash', 'attack', 'rotate'];
const STICK_R = 48, KNOB_R = 21;

interface Laid { id: TouchBtn; x: number; y: number; r: number; code: string; o: TouchBtnOpts }

// ------------------------------------------------------------------ art (1 texel per UI px, cached)
const cache = new Map<string, HTMLCanvasElement>();
const INK = hx(K.ink);

/** a round key (r in UI px), v8b flat: a translucent ink disc, a crisp 1 px ring (gold while pressed), a faint
 *  inner ring in the tint colour when there is one */
function keyArt(r: number, down: boolean, tint: string | undefined): HTMLCanvasElement {
  const key = `key|${r}|${down ? 1 : 0}|${tint ?? ''}`;
  const hit = cache.get(key); if (hit) return hit;
  const S = r * 2 + 2, px = new Px(S, S), c = r + 0.5;
  const ring = hx(down ? K.gold : '#cdc4ae'), face = hx(down ? '#2a2a24' : K.navy), tc = tint ? hx(tint) : null;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - c - 0.5, y + 0.5 - c - 0.5);
    if (d > r + 0.5) continue;
    if (d > r - 0.5) { px.set(x, y, ring, down ? 255 : 200); continue; }
    if (tc && d > r - 2.5 && d <= r - 1.5) { px.set(x, y, tc, 150); continue; }
    px.set(x, y, face, down ? 200 : 150);
  }
  const cv = px.done();
  cache.set(key, cv);
  return cv;
}

/** the stick's ring: a thin bone circle round a faint dark dish, four small ticks pointing out */
function ringArt(r: number): HTMLCanvasElement {
  const key = `ring|${r}`;
  const hit = cache.get(key); if (hit) return hit;
  const S = r * 2 + 2, px = new Px(S, S), c = r + 0.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - c - 0.5, y + 0.5 - c - 0.5);
    if (d > r + 0.5) continue;
    if (d > r - 0.5) px.set(x, y, hx('#cdc4ae'), 170);
    else px.set(x, y, hx(K.navy), 70);
  }
  for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let i = 3; i < 7; i++) px.set(Math.round(c + ax * (r - i)), Math.round(c + ay * (r - i)), hx('#cdc4ae'), 170);
  const cv = px.done();
  cache.set(key, cv);
  return cv;
}

/** hand-placed glyphs ('k' ink outline, 'w' cream light, 'm' / 'M' steel, 'y' / 'Y' gold, 'b' / 'B' leather,
 *  'r' / 'R' coral, 'p' pearl, 'c' sea-glass, 'g' kelp) */
const GLYPH: Record<string, string[]> = {
  attack: [
    '..........kk',
    '.........kwk',
    '........kwmk',
    '.......kwmk.',
    '......kwmk..',
    '.k...kwmk...',
    'kyk.kwmk....',
    '.kykwmk.....',
    '..kyMk......',
    '.kbkyk......',
    'kbk.kyk.....',
    'kk...kk.....',
  ],
  ability: [
    '.kkkkkkkkk.',
    'kwwwmmmmmMk',
    'kwyyyyyyyMk',
    'kwymmwmmyMk',
    'kmymmwmmyMk',
    'kmywwwwwyMk',
    'kmymmwmmyMk',
    '.kmymwmyMk.',
    '.kmmyyyMMk.',
    '..kmmmMMk..',
    '...kmMMk...',
    '....kMk....',
    '.....k.....',
  ],
  dash: [
    'kk....kk....',
    'kwk...kwk...',
    '.kwk...kwk..',
    '..kwk...kwk.',
    '...kwk...kwk',
    '..kwk...kwk.',
    '.kwk...kwk..',
    'kwk...kwk...',
    'kk....kk....',
  ],
  skill: [
    '.....k.....',
    '....kwk....',
    '....kwk....',
    '...kwywk...',
    '.kkwyyywkk.',
    'kwwyyyyywwk',
    '.kkwyyywkk.',
    '...kwywk...',
    '....kwk....',
    '....kwk....',
    '.....k.....',
  ],
  cycle: [
    '..kkkk.',
    '.kwwwwk',
    'kwk..kk',
    'kk...kw',
    '.....kk',
    'kk.....',
    'wk...kk',
    'kk..kwk',
    'kwwwwk.',
    '.kkkk..',
  ],
  rotate: [
    '...kkkkk.k.',
    '..kwwwwwkwk',
    '.kwkkkkkwwk',
    'kwk....kwwk',
    'kwk...kwwwk',
    'kwk...kkkkk',
    'kwk........',
    'kwk.....kk.',
    '.kwk...kwk.',
    '..kwkkkwk..',
    '...kwwwk...',
    '....kkk....',
  ],
  bag: [
    '...kkkkk...',
    '..kbkkkbk..',
    '..kk...kk..',
    '.kkkkkkkkk.',
    'kbbbbbbbbbk',
    'kbwwwwwwwBk',
    'kbbbkykbbBk',
    'kbbbkkkbbBk',
    'kbbbbbbbbBk',
    'kBBBBBBBBBk',
    '.kkkkkkkkk.',
  ],
  pause: [
    'kkkk.kkkk',
    'kwwk.kwwk',
    'kwmk.kwmk',
    'kwmk.kwmk',
    'kwmk.kwmk',
    'kwmk.kwmk',
    'kwmk.kwmk',
    'kkkk.kkkk',
  ],
  flask: [
    '...kkkkk...',
    '..krrwrrk..',
    '.krwrrrrRk.',
    'krrrrrrrrRk',
    'kRrRrRrRrRk',
    'kkkkkkkkkkk',
    'kRRkpwkRRRk',
    'kRRkppkRRRk',
    '.kRRkkRRRk.',
    '..kkkkkkk..',
  ],
  bomb: [
    '..k..k..k..',
    '...kkkkk...',
    'k.kyyyyyk.k',
    '.kyyywkyyk.',
    'kyyyykkyyyk',
    'kyyyyyyyyYk',
    'kYyyyyyyYYk',
    '.kYyRRRYYk.',
    'k.kYYYYYk.k',
    '...kkkkk...',
    '..k..k..k..',
  ],
};
/** v8b: the glyphs are drawn mono (bone with a dim shade side), gold for 'y', red for 'r', ink lines kept */
const GPAL: Record<string, string> = {
  k: '#0b111c', w: '#f6f0e2', m: '#e8dfcb', M: '#9aa3b4', y: '#d4b273', Y: '#8a7044', b: '#e8dfcb', B: '#9aa3b4',
  r: '#e48a74', R: '#c4553f', p: '#f6f0e2', c: '#e8dfcb', g: '#e8dfcb',
};
function glyph(name: string, s: number): HTMLCanvasElement {
  const key = `g|${name}|${s}`;
  const hit = cache.get(key); if (hit) return hit;
  const rows = GLYPH[name] ?? GLYPH.skill;
  const W = Math.max(...rows.map((q) => q.length)), H = rows.length;
  const px = new Px(W * s, H * s);
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = GPAL[row[x]]; if (!c) continue; const col = hx(c); for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) px.set(x * s + i, y * s + j, col); } });
  const cv = px.done();
  cache.set(key, cv);
  return cv;
}

/** a phone outline for the turn-it-sideways card */
function phoneArt(land: boolean): HTMLCanvasElement {
  const key = `phone|${land ? 1 : 0}`;
  const hit = cache.get(key); if (hit) return hit;
  const w = land ? 34 : 20, h = land ? 20 : 34, px = new Px(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    const rim = x === 1 || y === 1 || x === w - 2 || y === h - 2;
    if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
    px.set(x, y, edge ? INK : rim ? hx('#cdc4ae') : hx(land ? K.navy2 : K.navy));
  }
  const cv = px.done();
  cache.set(key, cv);
  return cv;
}

// ------------------------------------------------------------------ the layer
export class TouchLayer implements TouchHook {
  ui = new PixelUI();
  /** drawn this frame (the game adds `layer` to the overlays only then) */
  visible = false;
  get layer() { return this.ui.layer; }
  private laid: Laid[] = [];
  private spec: TouchSpec | null = null;
  /** pointer id -> the button (and key) it holds */
  private held = new Map<number, Laid>();
  private stickId = -1;
  private origin = { x: 0, y: 0 }; private knob = { x: 0, y: 0 };
  private arrows = new Set<string>();
  /** UI px per CSS px */
  private k = 1;
  private pr = 1;
  private t = 0;
  private press = new Map<TouchBtn, number>();
  private fade = new Map<TouchBtn, number>();
  private portrait = false;

  constructor(private input: Input) {
    input.touch = this;
    // no pinch / double-tap zoom, no rubber-band scrolling (iOS Safari ignores user-scalable=no)
    const stop = (e: Event) => { if (this.input.touchMode) e.preventDefault(); };
    document.addEventListener('gesturestart', stop, { passive: false } as AddEventListenerOptions);
    document.addEventListener('dblclick', stop, { passive: false } as AddEventListenerOptions);
    document.addEventListener('touchmove', (e) => { if (this.input.touchMode && e.cancelable) e.preventDefault(); }, { passive: false });
  }

  // ---------------------------------------------------------------- pointer stream (Input calls these)
  private toUi(e: PointerEvent): [number, number] { return [e.clientX * this.k, e.clientY * this.k]; }
  down(e: PointerEvent): boolean {
    if (!this.input.touchMode || this.portrait || !this.spec) return false;
    const [x, y] = this.toUi(e);
    let best: Laid | null = null, bd = Infinity;
    for (const b of this.laid) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.r * 1.18 + 3 * this.k && d < bd) { bd = d; best = b; }
    }
    if (best) {
      this.held.set(e.pointerId, best);
      this.input.press(best.code);
      this.press.set(best.id, 1);
      if (best.id !== 'attack' && best.id !== 'dash') audio.play('k_tick1', { vol: 0.12, dry: true, rate: 1.3 });
      try { navigator.vibrate?.(8); } catch { /* no haptics */ }
      return true;
    }
    if (this.spec.stick && this.stickId < 0 && x < this.ui.w * 0.46 && y > this.ui.h * 0.16) {
      this.stickId = e.pointerId;
      this.origin = { x, y }; this.knob = { x, y };
      this.input.stick = { x: 0, y: 0 };
      return true;
    }
    return false;
  }
  move(e: PointerEvent): boolean {
    if (e.pointerId === this.stickId) {
      const [x, y] = this.toUi(e), R0 = STICK_R * this.k;
      let dx = x - this.origin.x, dy = y - this.origin.y;
      const d = Math.hypot(dx, dy);
      // the ring trails a thumb that wanders past its rim
      if (d > R0 * 1.2) { const k = (d - R0 * 1.2) / d; this.origin.x += dx * k; this.origin.y += dy * k; dx = x - this.origin.x; dy = y - this.origin.y; }
      this.knob = { x, y };
      const m = Math.min(1, Math.hypot(dx, dy) / R0), a = Math.atan2(dy, dx);
      // a small dead zone, then the full range
      const v = m < 0.16 ? 0 : Math.min(1, (m - 0.16) / 0.7);
      this.input.stick = { x: Math.cos(a) * v, y: -Math.sin(a) * v };
      return true;
    }
    return this.held.has(e.pointerId);
  }
  up(e: PointerEvent): boolean {
    if (e.pointerId === this.stickId) { this.endStick(); return true; }
    const b = this.held.get(e.pointerId);
    if (!b) return false;
    this.held.delete(e.pointerId);
    if (![...this.held.values()].some((q) => q.code === b.code)) this.input.release(b.code);
    return true;
  }
  reset() {
    for (const b of this.held.values()) this.input.release(b.code);
    this.held.clear();
    this.endStick();
  }
  private endStick() {
    this.stickId = -1;
    this.input.stick = null;
    for (const c of this.arrows) this.input.release(c);
    this.arrows.clear();
  }

  // ---------------------------------------------------------------- per frame
  /** cssW / cssH: the window; pr: the renderer's pixel ratio */
  update(dt: number, spec: TouchSpec | null, cssW: number, cssH: number, pr: number) {
    this.t += dt;
    const input = this.input;
    PixelUI.touch = input.touchMode;
    if (!input.touchMode) { if (this.visible) this.reset(); this.visible = false; this.spec = null; this.laid = []; return; }
    if (this.pr !== pr || this.ui.deviceSize[0] !== Math.floor(cssW * pr) || this.ui.deviceSize[1] !== Math.floor(cssH * pr)) { this.pr = pr; this.ui.resize(cssW, cssH, pr); }
    this.k = pr / this.ui.scale;
    this.portrait = cssH > cssW * 1.05;
    this.spec = this.portrait ? null : spec;
    if (!this.spec?.stick && this.stickId >= 0) this.endStick();
    this.layout();
    this.stickKeys();
    const ui = this.ui;
    ui.begin(null, dt);
    if (this.portrait) this.drawPortrait(); else this.draw(dt);
    ui.end();
    this.visible = true;
  }

  private layout() {
    const ui = this.ui, k = this.k, W = ui.w, H = ui.h;
    this.laid = [];
    const b = this.spec?.buttons;
    if (!b) return;
    for (const id of ORDER) {
      const v = b[id];
      if (!v) continue;
      const o: TouchBtnOpts = v === true ? {} : v;
      const s = o.at ? { ...SPOT[id], ...o.at } : SPOT[id];
      const r = Math.max(9, Math.round(s.r * k));
      const sx = s.x * k, sy = s.y * k;
      const x = s.a === 'br' || s.a === 'tr' ? W - sx : s.a === 'tc' ? W / 2 + sx : sx;
      const y = s.a === 'br' || s.a === 'bl' ? H - sy : sy;
      this.laid.push({ id, x: Math.round(x), y: Math.round(y), r, code: o.code ?? CODE[id], o });
    }
  }

  /** past half-way the stick also holds the arrow keys (with a little hysteresis) */
  private stickKeys() {
    const st = this.input.stick;
    const want = new Set<string>();
    if (st) {
      const on = (v: number, code: string) => { if (v > 0.5 || (v > 0.32 && this.arrows.has(code))) want.add(code); };
      on(st.x, 'ArrowRight'); on(-st.x, 'ArrowLeft'); on(st.y, 'ArrowUp'); on(-st.y, 'ArrowDown');
    }
    for (const c of this.arrows) if (!want.has(c)) this.input.release(c);
    for (const c of want) if (!this.arrows.has(c)) this.input.press(c);
    this.arrows = want;
  }

  // ---------------------------------------------------------------- drawing
  private draw(dt: number) {
    const ui = this.ui, k = this.k;
    // ---- the stick
    if (this.spec?.stick) {
      const R0 = Math.round(STICK_R * k), KR = Math.round(KNOB_R * k);
      const active = this.stickId >= 0;
      const ox = active ? this.origin.x : 96 * k, oy = active ? this.origin.y : ui.h - 94 * k;
      const ring = ringArt(R0);
      ui.img(ring, Math.round(ox - R0 - 0.5), Math.round(oy - R0 - 0.5), { alpha: active ? 0.95 : 0.4 });
      let kx = ox, ky = oy;
      if (active) {
        const dx = this.knob.x - ox, dy = this.knob.y - oy, d = Math.hypot(dx, dy), m = Math.min(d, R0 - KR * 0.4);
        if (d > 0) { kx = ox + (dx / d) * m; ky = oy + (dy / d) * m; }
      }
      const kn = keyArt(KR, active, undefined);
      ui.img(kn, Math.round(kx - KR - 0.5), Math.round(ky - KR - 0.5), { alpha: active ? 1 : 0.45 });
      if (!active) ui.text('MOVE', Math.round(ox), Math.round(oy + R0 + 4), { font: 'small', color: K.bone, shadow: K.ink, align: 'center', alpha: 0.55 });
    }
    // ---- the buttons
    const heldIds = new Set([...this.held.values()].map((b) => b.id));
    for (const b of this.laid) {
      const f = damp(this.fade.get(b.id) ?? 0, 1, 10, dt); this.fade.set(b.id, f);
      const p = Math.max(0, (this.press.get(b.id) ?? 0) - dt * 5); this.press.set(b.id, p);
      const down = heldIds.has(b.id);
      const a = f * (b.o.dim ? 0.38 : 0.9);
      const pop = 1 + Math.sin(Math.min(1, 1 - p) * Math.PI) * 0.06 * (p > 0 ? 1 : 0);
      const r = Math.round(b.r * pop);
      const art = keyArt(r, down, b.o.color ?? (b.id === 'attack' ? K.gold : undefined));
      const sink = down ? 1 : 0;
      // a soft drop shadow, then the key
      ui.img(art, Math.round(b.x - r - 0.5), Math.round(b.y - r - 0.5) + sink, { alpha: a });
      // the glyph (2x on the big keys) or the word
      const word = b.id === 'interact' ? (b.o.label ?? 'USE') : b.o.label;
      if (word && b.id === 'interact') {
        const font = r >= 22 ? 'body' : 'small';
        ui.text(word.slice(0, 5), b.x, Math.round(b.y - ui.cap(font) / 2) + sink, { font, color: K.bone2, shadow: K.ink, align: 'center', alpha: Math.min(1, a * 1.2) });
      } else {
        const s = r >= 16 ? 2 : 1;
        const g = glyph(b.id, b.id === 'cycle' && r < 16 ? 1 : s);
        ui.img(g, Math.round(b.x - g.width / 2), Math.round(b.y - g.height / 2) + sink, { alpha: Math.min(1, a * 1.15) });
        if (word) ui.text(word, b.x, Math.round(b.y + r + 3), { font: 'small', color: K.bone, shadow: K.ink, align: 'center', alpha: a });
      }
      if (b.o.count !== undefined) {
        const cx = Math.round(b.x + r * 0.62), cy = Math.round(b.y + r * 0.38);
        ui.text(String(b.o.count), cx, cy, { font: 'small', color: b.o.count > 0 ? K.bone2 : K.red2, shadow: K.ink, align: 'center', alpha: Math.min(1, a * 1.2) });
      }
    }
    for (const id of [...this.fade.keys()]) if (!this.laid.some((b) => b.id === id)) this.fade.delete(id);
  }

  private drawPortrait() {
    const ui = this.ui;
    ui.fill(0, 0, ui.w, ui.h, K.ink, 0.94);
    const cx = Math.round(ui.w / 2), cy = Math.round(ui.h / 2);
    const land = Math.floor(this.t * 0.9) % 2 === 1;
    const ph = phoneArt(land);
    const s = Math.max(1, Math.round(1.5 * this.k));
    // the phone sits in a 34 x 34 box (so it does not jump as it turns), well above the words
    const box = 34 * s;
    ui.img(ph, Math.round(cx - (ph.width * s) / 2), Math.round(cy - 24 - box / 2 - (ph.height * s) / 2), { w: ph.width * s, h: ph.height * s });
    ui.text('TURN IT SIDEWAYS', cx, cy, { font: 'big', color: K.bone2, shadow: K.ink, align: 'center' });
    ui.text('the sea is wide: hold your phone in landscape', cx, cy + 34, { font: 'small', color: K.dim, shadow: null, align: 'center' });
  }
}

// ------------------------------------------------------------------ the in-run set (dungeon, the v2 run, dives)
interface RunPlayer {
  alive: boolean;
  slots: (string | null)[]; sel: number;
  combat: { flasks: number; flasksMax: number };
  skillHud(): { slots: ({ color: string } | null)[] };
}
/** the swim-and-fight set: the stick, ATTACK, GUARD, DASH, the selected SKILL (+ CYCLE with two or more), HEAL, BOMB,
 *  USE (lit with the prompt's word when there is something to use), BAG, PAUSE */
export function runSpec(p: RunPlayer, o: { prompt?: string | null; bombs?: number; bag?: boolean; stick?: boolean } = {}): TouchSpec {
  const filled = p.slots.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  const sel = p.slots[p.sel] ? p.sel : filled[0] ?? -1;
  const hud = sel >= 0 ? p.skillHud().slots[sel] : null;
  const live = p.alive;
  const word = o.prompt ? promptWord(o.prompt) : null;
  return {
    stick: live && o.stick !== false,
    buttons: {
      pause: true,
      bag: o.bag !== false,
      attack: live, ability: live, dash: live,
      interact: live ? { dim: !word, label: word ?? 'USE' } : false,
      skill: live && sel >= 0 ? { code: 'Digit' + (sel + 1), color: hud?.color } : false,
      cycle: live && filled.length > 1,
      flask: live && p.combat.flasksMax > 0 ? { count: p.combat.flasks, dim: p.combat.flasks <= 0 } : false,
      bomb: live && (o.bombs ?? 0) > 0 ? { count: o.bombs } : false,
    },
  };
}
/** a prompt line -> one short word for the USE key ('BUY CORAL BLADE · 20 PEARLS' -> 'BUY') */
export function promptWord(label: string) {
  const w = label.trim().split(/[\s:·]+/)[0]?.toUpperCase() ?? '';
  const MAP: Record<string, string> = { UNLOCK: 'OPEN', CLIMB: 'CLIMB', RING: 'RING', GIVE: 'GIVE', SEND: 'SEND', TALK: 'TALK' };
  return (MAP[w] ?? w).slice(0, 5) || 'USE';
}
