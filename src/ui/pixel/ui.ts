// PixelUI: an immediate-mode pixel-art UI drawn into a low-resolution canvas and shown on a full-screen quad at
// an integer scale (1 UI pixel = exactly S device pixels, nearest filtering), so it stays pixel-perfect at any
// window size. Screens add `ui.layer` to their overlays and call begin() / widgets / end() every frame.
//
//   const ui = new PixelUI();                        // or new PixelUI({ fixed: [320, 240] }) for an off-screen
//   overlays = [ui.layer]                            //   canvas (the TV), sampled by your own material
//   ui.resize(w, h, renderer.getPixelRatio())
//   update(dt) {
//     ui.begin(game.input, dt);
//     ui.panel('wood', 10, 10, 120, 80, 'STASH');
//     if (ui.button('go', 'NEW RUN', 20, 40, 80, 18, { style: 'green', key: 'Enter' })) start();
//     ui.tooltip(['Copper Nugget', { text: 'Warm, ruddy...', color: '#ccc' }]);
//     if (!ui.overUI) handleWorldClicks();
//     ui.end();
//   }
//
// Widgets return their result directly (button -> clicked, slider -> new value, tabs -> index, list -> clicked
// row). Anything drawn with panel()/block() swallows the mouse: check `ui.overUI` before world interaction.
import * as THREE from 'three';
import type { Input } from '../../core/input';
import { audio } from '../../audio/audio';
import { itemIcon, getItem, ITEMS, RARITY_COLOR } from '../../game/items';
import { drawText, measure, wrap, lineH, capH, setTextDensity, type FontName, type TextOpts } from './font';
import { skin, btnSkin, btnFace, PAD, BTN, LIP, KIT, KEYCAP_H, keycapBody, closeArt, tabSkin, knobArt, checkArt, bubbleArt, causticTile, type SkinKind, type BtnStyle, type BtnState } from './skins';
import { icon, iconTex, mouseTex, cursorTex, type CursorName } from './art';
import { easeOutBack } from '../../core/math';
import { iconAt } from '../../backpack/icons';

/** frond and rope ramps for the live decorations (dark -> light) */
const KELP = ['#0c200e', '#183a14', '#28561c', '#3c7426', '#559234', '#78b04a', '#a8d06c'];
const ROPE = ['#1e1309', '#3e2b12', '#644a22', '#8c6e38', '#b49250', '#d6b874', '#efdba4'];

export type TipLine = string | { text: string; color?: string; font?: FontName; icon?: HTMLCanvasElement; gap?: number; /** a keycap drawn before the text (hint rows) */ key?: string };

export interface ButtonOpts {
  style?: BtnStyle;
  disabled?: boolean;
  /** draw as toggled on */
  on?: boolean;
  icon?: string | HTMLCanvasElement;
  /** keyboard code that also triggers it (e.g. 'KeyB', 'Enter', 'Escape') */
  key?: string;
  /** keycap label drawn on the button (defaults from key) */
  keyLabel?: string;
  font?: FontName;
  align?: 'center' | 'left';
  tip?: TipLine[];
  /** sound on click ('' for none) */
  sfx?: string;
  /** force the drawn state (style guides, tutorials pointing at a button) */
  state?: BtnState;
}

const KEY_LABEL: Record<string, string> = { Enter: 'ENTER', Escape: 'ESC', Tab: 'TAB', Delete: 'DEL', Space: 'SPC', Backspace: 'BKSP' };
function labelForKey(code: string) { if (KEY_LABEL[code]) return KEY_LABEL[code]; if (code.startsWith('Key')) return code.slice(3); if (code.startsWith('Digit')) return code.slice(5); return code; }

/**
 * fit a pixel-art canvas into an exact box without inventing colours: at exactly 2:1 each 2x2 block takes its
 * most common colour (outlines win ties); other ratios sample nearest. Alpha is binary.
 */
const iconBoxCache = new Map<string, HTMLCanvasElement>();
export function fitIcon(src: HTMLCanvasElement, w: number, h: number, key?: string): HTMLCanvasElement {
  const k = key ? `${key}|${w}|${h}` : '';
  if (k) { const c = iconBoxCache.get(k); if (c) return c; }
  const sw = src.width, sh = src.height;
  // integer-friendly scale: prefer exact 1:1, 1:2, 1:4 when they fit
  let s = Math.min(w / sw, h / sh);
  for (const q of [1, 0.5, 0.25]) if (s >= q) { s = q; break; }
  const ow = Math.max(1, Math.round(sw * s)), oh = Math.max(1, Math.round(sh * s));
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const sd = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, sw, sh).data;
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const ox = Math.floor((w - ow) / 2), oy = Math.floor((h - oh) / 2);
  const step = 1 / s;
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const x0 = Math.floor(x * step), y0 = Math.floor(y * step), n = Math.max(1, Math.round(step));
    // tally the colours in the source block
    const cnt = new Map<number, number>(); let opaque = 0, tot = 0;
    for (let yy = y0; yy < Math.min(sh, y0 + n); yy++) for (let xx = x0; xx < Math.min(sw, x0 + n); xx++) {
      const i = (yy * sw + xx) * 4; tot++;
      if (sd[i + 3] < 128) continue;
      opaque++;
      const key2 = (sd[i] << 16) | (sd[i + 1] << 8) | sd[i + 2];
      cnt.set(key2, (cnt.get(key2) ?? 0) + 1);
    }
    if (opaque * 2 < tot || !opaque) continue;
    let best = 0, bn = -1, bl = 1e9;
    for (const [c, m] of cnt) { const l = ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255); if (m > bn || (m === bn && l < bl)) { best = c; bn = m; bl = l; } }
    const j = ((y + oy) * w + x + ox) * 4;
    img.data[j] = (best >> 16) & 255; img.data[j + 1] = (best >> 8) & 255; img.data[j + 2] = best & 255; img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (k) { iconBoxCache.set(k, out); if (iconBoxCache.size > 800) iconBoxCache.clear(); }
  return out;
}

/**
 * an item's pixel icon fitted into a w x h box. v3 items are RE-RASTERISED from their vector design at the
 * largest per-cell size that fits (crisp 16 / 24 px icons, not a downsample); legacy art falls back to fitIcon.
 * Unknown ids give a '?' crate.
 */
export function itemIconBox(id: string, w: number, h = w, level = 1): HTMLCanvasElement {
  if (!ITEMS[id]) return fitIcon(icon('?'), w, h, 'unknown');
  const key = `item|${id}|${level}`;
  const hit = iconBoxCache.get(`${key}|${w}|${h}`);
  if (hit) return hit;
  const d = getItem(id);
  const cw = Math.max(...d.shape.map((c) => c[0])) + 1, ch = Math.max(...d.shape.map((c) => c[1])) + 1;
  const cell = Math.floor(Math.min(w / cw, h / ch));
  const v3 = cell >= 8 && cell !== 32 ? iconAt(d, level, cell) : null;
  if (v3) {
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    out.getContext('2d')!.drawImage(v3, Math.floor((w - v3.width) / 2), Math.floor((h - v3.height) / 2));
    iconBoxCache.set(`${key}|${w}|${h}`, out);
    return out;
  }
  return fitIcon(itemIcon(id, level), w, h, key);
}

interface ListState { scroll: number; target: number; drag: number }

/**
 * v5: the UI is laid out on a canvas about this many UI pixels tall (see PixelUI.pickScale): a 640 x 360 design grid
 * (1280x720 -> 2 device px per UI px, 1920x1080 -> 3, 2560x1440 -> 4, 4K -> 6). Lay screens out for 640 x 360 and keep
 * them inside UI_MIN_H rows (short laptop windows get as few as 320).
 */
export const UI_TARGET_H = 360;
export const UI_MIN_H = 320, UI_MIN_W = 560;

/** v8 touch: what a key reads as on the touch layer's buttons (hint rows say DASH, not SHIFT) */
const TOUCH_KEY: Record<string, string> = {
  SHIFT: 'DASH', LMB: 'TAP', J: 'ATTACK', RMB: 'GUARD', K: 'GUARD', E: 'USE', F: 'USE', R: 'HEAL', H: 'HEAL', TAB: 'BAG', I: 'BAG', B: 'BAG',
  ESC: 'PAUSE', ENTER: 'TAP', SPACE: 'TAP', SPC: 'TAP', CLICK: 'TAP', WASD: 'STICK', ARROWS: 'STICK', Q: 'CYCLE', L: 'CYCLE', G: 'BOMB',
};
export function touchKey(k: string) { return TOUCH_KEY[k.toUpperCase()] ?? k; }
/** a key's name as the player should read it: the touch button's on a touch screen */
export function keyName(k: string) { return PixelUI.touch ? touchKey(k) : k; }

export class PixelUI {
  /** v8: the touch layer is up (src/ui/touch.ts): no pointer cursor, no keycaps on buttons, hints name the buttons */
  static touch = false;
  readonly cv: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  w = 320; h = 180;
  /** device pixels per UI pixel */
  scale = 1;
  /**
   * canvas pixels per UI pixel (v4): 2 when the UI scale is even (1080p, 4K), so screen text (Jersey 15 / 20) and
   * item icons get twice the pixels per glyph while every layout stays in UI pixels; 1 otherwise (720p, 1620p)
   */
  hd = 1;
  fixed: boolean;
  /** add to a Screen's overlays */
  layer: { scene: THREE.Scene; camera: THREE.Camera };
  private cam = new THREE.OrthographicCamera(0, 1, 1, 0, -4000, 4000);
  private tex: THREE.CanvasTexture;
  private quad: THREE.Mesh;
  private targetH: number;
  private devW = 1; private devH = 1;
  // input, in UI pixels
  mx = -999; my = -999; down = false; pressed = false; released = false; rdown = false; rpressed = false; wheel = 0; inside = false;
  input: Input | null = null;
  hot: string | null = null;
  active: string | null = null;
  private hotNext: string | null = null;
  /** the mouse is over something drawn by the UI this frame (world clicks should be ignored) */
  overUI = false;
  private overNext = false;
  /** a press that began over the UI (so a drag that leaves a panel doesn't leak into the world) */
  private pressOnUI = false;
  /** a widget already took this frame's press */
  private claimed = false;
  /** every interactive widget's rect drawn last frame, by id (for tests / tutorials) */
  rects = new Map<string, [number, number, number, number]>();
  private rectsNext = new Map<string, [number, number, number, number]>();
  cursor: CursorName = 'arrow';
  drawCursor = false;
  private lastSeenT = -9;
  private cursorVisible = true;
  private tips: (() => void)[] = [];
  private lists = new Map<string, ListState>();
  private lastHot: string | null = null;
  t = 0;
  sfx = true;
  /** tint applied to the layer quad (fade the whole UI) */
  opacity = 1;

  constructor(o: { fixed?: [number, number]; targetH?: number } = {}) {
    this.fixed = !!o.fixed;
    this.targetH = o.targetH ?? UI_TARGET_H;
    this.cv = document.createElement('canvas');
    if (o.fixed) { this.w = o.fixed[0]; this.h = o.fixed[1]; }
    this.cv.width = this.w; this.cv.height = this.h;
    this.ctx = this.cv.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    setTextDensity(this.ctx, 1);
    this.tex = this.makeTex();
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const g = new THREE.PlaneGeometry(1, 1); g.translate(0.5, -0.5, 0);
    this.quad = new THREE.Mesh(g, mat);
    this.quad.frustumCulled = false;
    // the 2D canvas draws after any 3D objects sharing this layer (src/ui/obj/stage.ts): text sits on top
    this.quad.renderOrder = 10;
    const scene = new THREE.Scene();
    scene.add(this.quad);
    this.layer = { scene, camera: this.cam };
  }

  private makeTex() {
    const t = new THREE.CanvasTexture(this.cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  get texture() { return this.tex; }

  /**
   * One shared UI density for every PixelUI on screen: the largest integer scale that still leaves at least UI_MIN_H
   * (320) rows and UI_MIN_W (560) columns, so the canvas is about UI_TARGET_H (360) UI px tall: 1280x720 -> 2
   * (640x360), 1920x1080 -> 3 (640x360), 2560x1440 -> 4, 3840x2160 -> 6, a 1366x768 laptop window (~657 tall) -> 2
   * (328 rows), 1440x900 -> 2 (450 rows). (`targetH` from the constructor is kept for API compatibility but no longer
   * changes the density, so a HUD, a toast and a panel always share one pixel size.) ?uiscale=N forces a scale.
   */
  static pickScale(devW: number, devH: number): number {
    const forced = Number(new URLSearchParams(location.search).get('uiscale') || 0);
    if (forced > 0) return forced;
    let s = Math.max(1, Math.floor(devH / UI_MIN_H));
    while (s > 1 && devW / s < UI_MIN_W) s--;
    return s;
  }

  resize(cssW: number, cssH: number, pixelRatio = 1) {
    const devW = Math.max(1, Math.floor(cssW * pixelRatio)), devH = Math.max(1, Math.floor(cssH * pixelRatio));
    this.devW = devW; this.devH = devH; this.pr = pixelRatio;
    this.cam.left = 0; this.cam.right = devW; this.cam.top = devH; this.cam.bottom = 0; this.cam.updateProjectionMatrix();
    if (this.fixed) return;
    const s = PixelUI.pickScale(devW, devH);
    this.scale = s;
    const hd = PixelUI.hdFor(s);
    const w = Math.ceil(devW / s), h = Math.ceil(devH / s);
    if (w !== this.w || h !== this.h || hd !== this.hd) {
      this.w = w; this.h = h; this.hd = hd; this.cv.width = w * hd; this.cv.height = h * hd;
      this.ctx.imageSmoothingEnabled = false;
      setTextDensity(this.ctx, hd);
      this.tex.dispose(); this.tex = this.makeTex();
      (this.quad.material as THREE.MeshBasicMaterial).map = this.tex;
    }
    this.quad.position.set(0, devH, 0);
    this.quad.scale.set(w * s, h * s, 1);
  }
  private pr = 1;
  get deviceSize() { return [this.devW, this.devH] as const; }
  /**
   * canvas density (canvas px per UI px) for a UI scale: the device resolution up to 5 (so the Jersey screen fonts get
   * real pixels: 720p 2, 1080p 3, 1440p 4), above that the largest divisor <= 5 (4K: 6 -> 3). ?uihd=1 forces 1
   */
  static hdFor(scale: number) {
    if (new URLSearchParams(location.search).get('uihd') === '1') return 1;
    for (let d = Math.min(5, scale); d > 1; d--) if (scale % d === 0) return d;
    return 1;
  }

  /** start a frame: clears the canvas and maps the mouse (map: css px -> ui px, for off-screen canvases) */
  begin(input: Input | null, dt = 1 / 60, map?: (cssX: number, cssY: number) => [number, number] | null) {
    this.input = input;
    this.t += dt;
    this.dt = dt;
    this.frameNo++;
    PixelUI.stack.push(this);
    this.ctx.setTransform(this.hd, 0, 0, this.hd, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.globalAlpha = 1;
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.hot = this.hotNext; this.hotNext = null;
    this.overUI = this.overNext; this.overNext = false;
    this.claimed = false;
    this.rects = this.rectsNext; this.rectsNext = new Map();
    this.tips = [];
    this.laterQ = [];
    this.tagRects = [];
    this.fadeK = 1; this.liftY = 0;
    this.panelN.clear();
    if (input) {
      const m = input.mouse;
      let p: [number, number] | null;
      if (map) p = map(m.x, m.y);
      else { const pr = this.pr; p = [Math.floor((m.x * pr) / this.scale), Math.floor((m.y * pr) / this.scale)]; }
      // don't trust mouse.inside for hit tests: in an iframe (claude.ai artifacts) document mouseenter/leave
      // can be missed, which would make every button dead. Any move or press means the pointer is here.
      if (m.moved || input.pressed.has('Mouse0')) this.lastSeenT = this.t;
      this.inside = !!p;
      this.cursorVisible = m.inside || this.t - this.lastSeenT < 2;
      this.mx = p ? p[0] : -999; this.my = p ? p[1] : -999;
      this.down = input.down.has('Mouse0'); this.pressed = input.pressed.has('Mouse0'); this.released = input.released.has('Mouse0');
      this.rdown = input.down.has('Mouse2'); this.rpressed = input.pressed.has('Mouse2');
      this.wheel = m.wheel;
    } else { this.pressed = this.released = this.rpressed = false; this.wheel = 0; }
    if (this.pressed) this.pressOnUI = this.overUI;
    // keep the pressed widget through the RELEASE frame (v4 fix): clearing it on the release frame meant a click
    // whose press and release landed in different frames (every real click at 60 fps) never fired
    if (!this.down && !this.pressed && !this.released) this.active = null;
    this.cursor = 'arrow';
    this.stepFx(dt);
    if (this.frameNo % 300 === 0) this.prune();
  }

  /** finish a frame: tooltips, tags, cursor, upload */
  end() {
    this.fadeK = 1; this.liftY = 0;
    // world tags placed this frame (src/hideout/tag.ts) draw on the screen's own UI, under tooltips and the cursor
    const later = this.laterQ; this.laterQ = [];
    if (!this.fixed) { later.push(...PixelUI.overlay); PixelUI.overlay = []; }
    for (const d of later) d(this);
    this.drawFx();
    for (const t of this.tips) t();
    if (this.drawCursor && this.inside && this.cursorVisible && !PixelUI.touch) {
      const c = cursorTex(this.cursor);
      this.ctx.drawImage(c.cv, this.mx - c.hx, this.my - c.hy, c.w, c.h);
    }
    if (this.hot && this.hot !== this.lastHot && this.sfx) audio.play('k_tick1', { vol: 0.12, dry: true, rate: 1.3 });
    this.lastHot = this.hot;
    (this.quad.material as THREE.MeshBasicMaterial).opacity = this.opacity;
    this.tex.needsUpdate = true;
    if (!this.fixed) PixelUI.lastDrawn.set(this, performance.now());
    const i = PixelUI.stack.lastIndexOf(this);
    if (i >= 0) PixelUI.stack.splice(i, 1);
  }

  private laterQ: ((ui: PixelUI) => void)[] = [];
  /** world-tag cards drawn this frame (tags nudge themselves off each other) */
  tagRects: [number, number, number, number][] = [];
  /** queue a draw for end() (above everything drawn this frame, below tooltips and the cursor) */
  later(fn: (ui: PixelUI) => void) { this.laterQ.push(fn); }

  /** every screen PixelUI and when it last finished a frame (performance.now()): overlays such as the achievement
   *  toast read what is on screen from these to find a free lane */
  static lastDrawn = new Map<PixelUI, number>();
  /** screen-space rects (UI px) of the visible 3D objects on this UI's layer (UiStage models: HUD instruments, the
   *  avatar, item models), one per mesh */
  objectRects(): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    const devH = this.devH, s = this.scale;
    const box = new THREE.Box3();
    const visit = (o: THREE.Object3D) => {
      if (!o.visible || o === this.quad) return;
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
        if (Number.isFinite(box.min.x)) out.push([box.min.x / s, (devH - box.max.y) / s, (box.max.x - box.min.x) / s, (box.max.y - box.min.y) / s]);
      }
      for (const c of o.children) visit(c);
    };
    for (const c of this.layer.scene.children) visit(c);
    return out;
  }

  /** PixelUIs between begin() and end() (innermost last): world tags draw onto the screen UI that is drawing */
  static stack: PixelUI[] = [];
  /** draws queued for the next screen UI end() (tags placed outside a begin/end pair) */
  static overlay: ((ui: PixelUI) => void)[] = [];
  /** the screen UI that is drawing right now, if any */
  static get current(): PixelUI | null { for (let i = PixelUI.stack.length - 1; i >= 0; i--) if (!PixelUI.stack[i].fixed) return PixelUI.stack[i]; return null; }

  /** true while a world drag that started over the UI is held */
  get uiOwnsDrag() { return this.down && this.pressOnUI; }
  /** the mouse is over UI drawn last frame or so far this frame (call after drawing, before world input) */
  get mouseOnUI() { return this.overUI || this.overNext || this.claimed; }

  // ---------------------------------------------------------------- motion helpers (v5)
  dt = 1 / 60;
  private frameNo = 0;
  private animSeen = new Map<string, { t0: number; last: number }>();
  private eased = new Map<string, { v: number; last: number }>();
  private counts = new Map<string, { v: number; from: number; to: number; t: number; last: number; changeT: number; tick: number }>();
  private bars = new Map<string, { v: number; chip: number; last: number; flashT: number; prev: number }>();
  /** the content fade + rise of the panel that is popping in (applies to everything drawn after panel() until the
   *  next panel() / end()) */
  private fadeK = 1;
  private liftY = 0;
  private panelN = new Map<string, number>();
  /** set false to switch panel pop-ins off (tests, screenshots) */
  pop = new URLSearchParams(location.search).get('uipop') !== '0';

  /**
   * seconds since `id` started being drawn: call it every frame you draw the thing; a frame without the call
   * restarts it. The building block for pop-ins, hover glints and one-shot flourishes.
   */
  anim(id: string): number {
    let a = this.animSeen.get(id);
    if (!a || a.last < this.frameNo - 1) { a = { t0: this.t, last: this.frameNo }; this.animSeen.set(id, a); }
    a.last = this.frameNo;
    return this.t - a.t0;
  }
  /** a value that eases toward `target` (exponential, `rate` per second); snaps on the first frame it is drawn */
  ease(id: string, target: number, rate = 12): number {
    let e = this.eased.get(id);
    if (!e || e.last < this.frameNo - 1) e = { v: target, last: this.frameNo };
    else if (e.last !== this.frameNo) e.v += (target - e.v) * (1 - Math.exp(-rate * this.dt));
    if (Math.abs(target - e.v) < 1e-3) e.v = target;
    e.last = this.frameNo; this.eased.set(id, e);
    return e.v;
  }
  /**
   * a number that COUNTS to `target` whenever it changes (ease-out over `dur` s, with soft ticks): the displayed
   * integer. First sight shows the target at once unless `from` is given (count up from 0 on a results card).
   *   ui.text(String(ui.count('pearls', run.pearls)), x, y, { font: 'title' })
   * countPulse(id) is 1 -> 0 over 0.4 s after each change (flash / bump the number with it).
   */
  count(id: string, target: number, o: { dur?: number; from?: number; sfx?: boolean } = {}): number {
    let c = this.counts.get(id);
    if (!c) { const f = o.from ?? target; c = { v: f, from: f, to: target, t: 0, last: this.frameNo, changeT: o.from !== undefined ? this.t : -9, tick: Math.round(f) }; this.counts.set(id, c); }
    if (c.to !== target) { c.from = c.v; c.to = target; c.t = 0; c.changeT = this.t; }
    if (c.last !== this.frameNo) {
      c.last = this.frameNo;
      const dur = o.dur ?? Math.min(1.1, 0.35 + Math.abs(c.to - c.from) * 0.02);
      c.t += this.dt;
      const k = Math.min(1, c.t / dur);
      c.v = c.from + (c.to - c.from) * (1 - Math.pow(1 - k, 3));
      const shown = Math.round(c.v);
      if (shown !== c.tick) {
        c.tick = shown;
        if (o.sfx !== false && this.sfx && this.t - this.lastTickT > 0.045) { this.lastTickT = this.t; audio.play('k_tick2', { vol: 0.07, dry: true, rate: 1.1 + Math.min(0.6, k * 0.6) }); }
      }
    }
    return Math.round(c.v);
  }
  countPulse(id: string): number { const c = this.counts.get(id); return c ? Math.max(0, 1 - (this.t - c.changeT) / 0.4) : 0; }
  private lastTickT = 0;
  private prune() {
    const old = this.frameNo - 600;
    for (const m of [this.animSeen, this.eased, this.bars] as Map<string, { last: number }>[]) for (const [k, v] of m) if (v.last < old) m.delete(k);
  }

  // ---------------------------------------------------------------- ocean motion (v5): all small overlays over cached skins
  /** set false (or &uideco=0) to switch off the living decorations (bubbles, kelp, rope, caustics, hover splashes) */
  deco = new URLSearchParams(location.search).get('uideco') !== '0';
  private fx: { x: number; y: number; vx: number; vy: number; t: number; life: number; r: number; kind: 'bubble' | 'drop'; ph: number; delay: number }[] = [];
  private emit = new Map<string, number>();
  private pats = new Map<string, CanvasPattern | null>();
  /** release a bubble at (x, y) UI px: it wobbles up and fades (o.r 1..3 UI px, o.vy UI px/s, o.delay s) */
  bubble(x: number, y: number, o: { r?: number; vy?: number; life?: number; delay?: number } = {}) {
    if (!this.deco || this.fx.length > 90) return;
    this.fx.push({ x, y, vx: 0, vy: o.vy ?? -16, t: 0, life: o.life ?? 1.1 + ((x * 7 + y * 3) % 10) / 20, r: o.r ?? 1, kind: 'bubble', ph: (x * 0.37 + y * 0.11) % 6.28, delay: o.delay ?? 0 });
  }
  /** a little splash: droplets thrown up from (x, y) that fall back, plus a couple of bubbles */
  splash(x: number, y: number, n = 4) {
    if (!this.deco) return;
    for (let i = 0; i < n; i++) this.fx.push({ x: x + (i - n / 2) * 2, y, vx: (i - (n - 1) / 2) * 12, vy: -34 - (i % 2) * 10, t: 0, life: 0.45, r: 1, kind: 'drop', ph: 0, delay: 0 });
    this.bubble(x - 3, y, { r: 1, vy: -20 }); this.bubble(x + 4, y, { r: 1, vy: -14, delay: 0.08 });
  }
  private stepFx(dt: number) {
    for (const p of this.fx) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      if (p.kind === 'drop') { p.vy += 140 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      else { p.y += p.vy * dt; p.x += Math.sin(p.t * 7 + p.ph) * 6 * dt; }
    }
    this.fx = this.fx.filter((p) => p.t < p.life);
  }
  private drawFx() {
    for (const p of this.fx) {
      if (p.delay > 0) continue;
      const a = Math.min(1, (p.life - p.t) / 0.25) * Math.min(1, p.t / 0.08);
      if (p.kind === 'drop') { this.ctx.globalAlpha = a; this.ctx.fillStyle = '#bff0ff'; this.ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); this.ctx.globalAlpha = 1; continue; }
      const b = bubbleArt(p.r), S = b.width;
      this.ctx.globalAlpha = a; this.ctx.drawImage(b, Math.round(p.x - p.r), Math.round(p.y - p.r), S, S); this.ctx.globalAlpha = 1;
    }
  }
  /**
   * a slow caustic-light shimmer over a rect (two layers of the caustic web sliding past each other). Cheap: two
   * pattern fills. Draw it over a skin's inset, under the content.
   */
  caustic(x: number, y: number, w: number, h: number, alpha = 0.1) {
    if (!this.deco || w < 4 || h < 4) return;
    // the 1x tile in UI space (so its lines are chunky UI pixels), slid by whole UI pixels (pixel-snapped motion)
    let pat = this.pats.get('1');
    if (pat === undefined) { pat = this.ctx.createPattern(causticTile(), 'repeat'); this.pats.set('1', pat); }
    if (!pat) return;
    const c = this.ctx;
    const X = Math.round(x), Y = Math.round(y + this.liftY), Wd = Math.round(w), Hd = Math.round(h);
    c.save();
    c.beginPath(); c.rect(X, Y, Wd, Hd); c.clip();
    c.imageSmoothingEnabled = false;
    c.fillStyle = pat;
    for (const [sx, sy, k] of [[6, 3.5, 1], [-4.5, 5, 0.7]] as const) {
      pat.setTransform(new DOMMatrix([1, 0, 0, 1, Math.round(this.t * sx + (k < 1 ? 41 : 0)), Math.round(this.t * sy + (k < 1 ? 17 : 0))]));
      c.globalAlpha = alpha * k * this.fadeK;
      c.fillRect(X, Y, Wd, Hd);
    }
    c.restore();
  }
  /**
   * a kelp frond draped over an edge at (x, y), hanging down and swaying (side -1 hangs out to the left, +1 right): a
   * ruffled ribbon one UI px per row (ink rim, a lit left margin, a paler midrib, a shaded right margin), a cast
   * shadow, a gas bladder at its stipe, all on whole UI pixels so the motion steps chunkily
   */
  kelp(x: number, y: number, side: -1 | 1, len = 12, phase = 0) {
    const K = KELP;
    const rows: [number, number, number][] = [];
    // the stipe runs out over the edge for 3 px, then the frond hangs
    for (let i = 0; i < 3; i++) rows.push([Math.round(x + side * i), Math.round(y + (i > 1 ? 1 : 0)), 2]);
    const L = len * 2;
    for (let i = 0; i < L; i++) {
      const k = i / L;
      const sway = Math.sin(this.t * 1.6 + phase - i * 0.2) * Math.pow(k, 1.4) * 3.2 + Math.sin(this.t * 0.7 + phase * 1.3) * k * 1.2;
      const cx = x + side * 3 + side * Math.sin(k * 2.4) * 2 + sway;
      const w = k > 0.86 ? 1 : k > 0.7 ? 2 : 3 + ((i >> 2) % 2);
      rows.push([Math.round(cx - w / 2), Math.round(y + 2 + i), w]);
    }
    for (const [rx, ry, w] of rows) this.fill(rx + 1, ry + 1, w, 1, '#000000', 0.28);
    for (const [rx, ry, w] of rows) this.fill(rx - 1, ry - 1, w + 2, 3, K[0]);
    rows.forEach(([rx, ry, w], i) => {
      if (w === 1) { this.fill(rx, ry, 1, 1, K[4]); return; }
      this.fill(rx, ry, w, 1, K[3]);
      this.fill(rx, ry, 1, 1, K[5]);
      this.fill(rx + w - 1, ry, 1, 1, K[2]);
      if (w >= 3) this.fill(rx + Math.floor(w / 2), ry, 1, 1, (i >> 1) % 3 === 0 ? K[6] : K[4]);
    });
    // a gas bladder where the frond leaves the stipe
    const [bx, by] = rows[4];
    this.fill(bx - side * 2 - 1, by - 1, 4, 4, K[0]);
    this.fill(bx - side * 2, by, 2, 2, '#a08a2c'); this.fill(bx - side * 2, by, 1, 1, '#ecd878'); this.fill(bx - side * 2 + 1, by + 1, 1, 1, '#6e5c1c');
  }
  /** a loose rope end hanging from (x, y), swaying, its strands twisting, frayed at the tip */
  ropeEnd(x: number, y: number, len = 6, phase = 0) {
    const P = ROPE;
    const seg: [number, number][] = [];
    for (let i = 0; i < len * 2; i++) seg.push([Math.round(x + Math.sin(this.t * 1.3 + phase - i * 0.18) * (i / (len * 2)) * 1.6), y + i]);
    for (const [qx, qy] of seg) this.fill(qx + 1, qy + 1, 2, 1, '#000000', 0.3);
    for (const [qx, qy] of seg) this.fill(qx - 1, qy - 1, 4, 3, P[0]);
    seg.forEach(([qx, qy], i) => { const k = i % 3; this.fill(qx, qy, 1, 1, k === 2 ? P[2] : P[5]); this.fill(qx + 1, qy, 1, 1, k === 0 ? P[2] : k === 1 ? P[3] : P[1]); });
    // the whipping (a binding of darker twine) and the frayed tip
    const [ex, ey] = seg[seg.length - 1];
    this.fill(ex - 1, ey - 3, 4, 2, P[0]); this.fill(ex, ey - 3, 2, 1, P[2]);
    for (const [dx, h, c] of [[-1, 3, 4], [0, 4, 5], [1, 3, 3], [2, 2, 4]] as const) this.fill(ex + dx, ey + 1, 1, h, P[c]);
  }
  /**
   * the living decorations of a panel (called by panel(); call it yourself after ui.frame() for a hand-drawn panel):
   * the caustic shimmer over the inset, and on big plank frames a swaying kelp strand draped over a side, a rope end
   * dangling from a bottom lashing, and a bubble now and then rising off the top edge. `key` keeps them steady.
   */
  panelFx(kind: SkinKind, x: number, y: number, w: number, h: number, key = `${kind}|${w}x${h}`, alpha = 1) {
    if (!this.deco) return;
    const plank = kind === 'wood' || kind === 'stone' || kind === 'cream';
    if (plank || kind === 'dark' || kind === 'inset') {
      const p = PAD[kind];
      const ins = plank ? 7 : kind === 'dark' ? 4 : 1;
      this.caustic(x + ins, y + ins, w - 2 * ins, h - 2 * ins, (kind === 'cream' ? 0.2 : 0.11) * alpha);
      void p;
    }
    const h0 = hashStr(key);
    if (plank && w >= 110 && h >= 70) {
      // the kelp hangs off whichever side has more room; it starts below the corner (clear of a close key)
      const side: -1 | 1 = x > this.w - (x + w) ? -1 : 1;
      this.kelp(side > 0 ? x + w - 4 : x + 4, y + 18 + (h0 % 9), side, 15 + (h0 % 6), h0 % 7);
      this.ropeEnd(side > 0 ? x + 4 : x + w - 6, y + h - 3, 5 + (h0 % 3), h0 % 5);
    }
    if ((plank || kind === 'dark') && w >= 90 && h >= 50) {
      const next = this.emit.get(key) ?? this.t + 0.6 + (h0 % 10) / 10;
      if (this.t >= next) {
        const n = Math.floor(this.t * 3.1 + h0);
        this.bubble(x + 10 + (n * 53 % Math.max(1, w - 20)), y + 3, { r: 1 + (n % 3 === 0 ? 1 : 0), vy: -12 - (n % 4) * 3 });
        this.emit.set(key, this.t + 1.3 + ((n * 7) % 10) / 6);
      } else this.emit.set(key, next);
    }
  }

  // ---------------------------------------------------------------- primitives
  fill(x: number, y: number, w: number, h: number, col: string, alpha = 1) {
    const c = this.ctx; c.globalAlpha = alpha * this.fadeK; c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y + this.liftY), Math.round(w), Math.round(h)); c.globalAlpha = 1;
  }
  /** 1 px rectangle outline */
  rect(x: number, y: number, w: number, h: number, col: string) {
    this.fill(x, y, w, 1, col); this.fill(x, y + h - 1, w, 1, col); this.fill(x, y, 1, h, col); this.fill(x + w - 1, y, 1, h, col);
  }
  /** dotted line (marching ants when t advances) */
  dotted(x0: number, y0: number, x1: number, y1: number, col: string, phase = 0) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    this.ctx.fillStyle = col;
    this.ctx.globalAlpha = this.fadeK;
    for (let i = 0; i <= n; i++) if (((i + phase) >> 1) & 1) this.ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / (n || 1)), Math.round(y0 + ((y1 - y0) * i) / (n || 1) + this.liftY), 1, 1);
    this.ctx.globalAlpha = 1;
  }
  /** a skin at w x h UI px (painted at this canvas's density: fine texture detail is one device pixel) */
  frame(kind: SkinKind, x: number, y: number, w: number, h: number, alpha = 1) {
    const c = this.ctx; c.globalAlpha = alpha * this.fadeK;
    w = Math.max(4, Math.round(w)); h = Math.max(4, Math.round(h));
    c.drawImage(skin(kind, w, h), Math.round(x), Math.round(y + this.liftY), w, h);
    c.globalAlpha = 1;
  }
  text(str: string, x: number, y: number, o: TextOpts = {}) {
    if (this.fadeK < 1) o = { ...o, alpha: (o.alpha ?? 1) * this.fadeK };
    return drawText(this.ctx, str, x, y + this.liftY, o);
  }
  /** wrapped text block; returns its height */
  textBox(str: string, x: number, y: number, w: number, o: TextOpts = {}) {
    const f = o.font ?? 'body', lh = lineH(f, this.hd);
    const lines = wrap(str, f, w, this.hd);
    lines.forEach((l, i) => this.text(l, o.align === 'center' ? x + w / 2 : o.align === 'right' ? x + w : x, y + i * lh, o));
    return lines.length * lh;
  }
  measure(str: string, font: FontName = 'body') { return measure(str, font, this.hd); }
  lh(font: FontName = 'body') { return lineH(font, this.hd); }
  cap(font: FontName = 'body') { return capH(font, this.hd); }
  /** wrap text to a width in this canvas's screen font */
  wrap(str: string, font: FontName, maxW: number) { return wrap(str, font, maxW, this.hd); }
  img(cv: CanvasImageSource & { width: number; height: number }, x: number, y: number, o: { w?: number; h?: number; alpha?: number; flipX?: boolean } = {}) {
    const c = this.ctx;
    c.globalAlpha = (o.alpha ?? 1) * this.fadeK;
    const w = o.w ?? cv.width, h = o.h ?? cv.height;
    y += this.liftY;
    if (o.flipX) { c.save(); c.translate(Math.round(x) + w, Math.round(y)); c.scale(-1, 1); c.drawImage(cv, 0, 0, w, h); c.restore(); }
    else c.drawImage(cv, Math.round(x), Math.round(y), w, h);
    c.globalAlpha = 1;
  }
  /** a kit icon at this canvas's density; returns its width (UI px) */
  icon(name: string, x: number, y: number, alpha = 1) { const i = iconTex(name); this.img(i, x, y, { alpha, w: i.width, h: i.height }); return i.width; }
  /**
   * item icon fitted to a size box at 1 texel per UI px (v6: the same chunky pixel size as the kit), re-rasterised
   * at the cell size that fits or fitted without inventing colours (itemIconBox)
   */
  item(id: string, x: number, y: number, w: number, h = w, level = 1, alpha = 1) {
    const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
    this.img(itemIconBox(id, W, H, level), x, y, { alpha, w: W, h: H });
  }
  /**
   * a keycap with a label in the screen font ('E', 'ESC', 'TAB', 'SPC'...): KEYCAP_H (13) UI px tall. Returns its
   * width. `down` draws it pressed.
   */
  keycap(label: string, x: number, y: number, dark = false, down = false) {
    const tw = label ? this.measure(label, 'small') : 0;
    const w = Math.max(KEYCAP_H, Math.ceil(tw) + 7);
    this.img(keycapBody(w, KEYCAP_H, dark, down), x, y, { w, h: KEYCAP_H });
    if (label) this.text(label, x + w / 2, y + (down ? 3 : 1) + Math.round((8 - this.cap('small')) / 2), { font: 'small', color: dark ? KIT.text : KIT.ink, shadow: null, align: 'center' });
    return w;
  }
  /** the width keycap(label) takes */
  keycapW(label: string) { return Math.max(KEYCAP_H, Math.ceil(label ? this.measure(label, 'small') : 0) + 7); }
  clip(x: number, y: number, w: number, h: number) { const c = this.ctx; c.save(); c.beginPath(); c.rect(x, y + this.liftY, w, h); c.clip(); }
  unclip() { this.ctx.restore(); }

  // ---------------------------------------------------------------- interaction
  hover(x: number, y: number, w: number, h: number) { return this.inside && this.mx >= x && this.my >= y && this.mx < x + w && this.my < y + h; }
  /** register a custom clickable region's rect under an id (see `rects`) */
  mark(id: string, x: number, y: number, w: number, h: number) { this.rectsNext.set(id, [x, y, w, h]); }
  /** mark a region as UI (swallows the mouse) */
  block(x: number, y: number, w: number, h: number) { if (this.hover(x, y, w, h)) this.overNext = true; }

  /**
   * a panel: the skin, an optional title (a driftwood plank sign on the frame for 'wood' / 'stone' / 'cream', a
   * heading inside for the others), a POP-IN the first frames it is drawn (the frame springs from 86% with an
   * overshoot and a damped water wobble, bubbles burst off its bottom edge, the content fades + rises in), and the
   * live ocean decorations of panelFx() (caustic light, a swaying kelp strand, a dangling rope end, bubbles). The pop
   * is keyed by o.id, else kind + title (+ its order among same-keyed panels this frame); pass a stable o.id for
   * panels whose title changes, o.pop: false to skip the pop, o.deco: false to skip the decorations.
   */
  panel(kind: SkinKind, x: number, y: number, w: number, h: number, title?: string, o: { titleStyle?: TextOpts; alpha?: number; id?: string; pop?: boolean; deco?: boolean } = {}) {
    this.block(x, y, w, h);
    this.fadeK = 1; this.liftY = 0;
    let key = o.id ?? `${kind}|${title ?? ''}`;
    const n = this.panelN.get(key) ?? 0; this.panelN.set(key, n + 1);
    if (!o.id) key += '#' + n;
    const D = 0.2;
    const pt = this.pop && o.pop !== false ? this.anim('panel:' + key) : 9;
    let fx = x, fy = y, fa = o.alpha ?? 1, amp = 0;
    const fw = w, fh = h;
    if (pt < 0.45) {
      // rise in from 8 px below with an overshoot, fading in, while a damped WATER WOBBLE runs through the frame: its
      // rows slide sideways on a travelling wave by whole UI pixels, so the art stays chunky the whole way in
      const k = Math.min(1, pt / D);
      fy = y + Math.round((1 - easeOutBack(k, 2.2)) * 8);
      amp = 2.4 * Math.exp(-pt * 7);
      fa *= Math.min(1, pt / 0.07);
      // a burst of bubbles off the bottom edge as it lands
      if (pt === 0 && this.deco && o.deco !== false && w >= 60 && (kind === 'wood' || kind === 'stone' || kind === 'cream' || kind === 'dark')) for (let i = 0; i < 6; i++) this.bubble(x + 10 + ((i * 37 + w) % Math.max(1, w - 20)), y + 2, { vy: -18 - (i % 3) * 6, r: 1 + (i % 2), delay: i * 0.05, life: 0.9 });
    }
    if (amp < 0.5) this.frame(kind, fx, fy, fw, fh, fa);
    else {
      const c = this.ctx, cv = skin(kind, Math.round(w), Math.round(h));
      c.globalAlpha = fa;
      for (let sy = 0; sy < cv.height; sy += 2) {
        const dx = Math.round(Math.sin(sy * 0.19 - pt * 32) * amp), sh = Math.min(2, cv.height - sy);
        c.drawImage(cv, 0, sy, cv.width, sh, Math.round(fx) + dx, Math.round(fy) + sy, cv.width, sh);
      }
      c.globalAlpha = 1;
    }
    if (this.deco && o.deco !== false) this.panelFx(kind, fx, fy, fw, fh, key, fa);
    if (title) {
      const lacq = kind === 'wood' || kind === 'stone' || kind === 'cream';
      const st: TextOpts = o.titleStyle ?? (lacq ? { font: 'title', color: KIT.ink, shadow: '#e6dec8' } : kind === 'paper' || kind === 'insetCream' ? { font: 'title', color: KIT.textInk, shadow: null } : kind === 'blueprint' || kind === 'card' ? { font: 'title', color: '#ffffff', shadow: '#0a2046' } : { font: 'title', color: KIT.cream[3], outline: KIT.ink, shadow: '#000000' });
      const f = st.font ?? 'title';
      const tw = this.measure(title, f);
      if (lacq) {
        // a driftwood plank sign nailed over the top frame
        const pw = Math.ceil(tw) + 22, ph = Math.round(this.cap(f)) + 9;
        const px = fx + Math.round((fw - pw) / 2), py = fy - Math.round(ph / 2) + 3;
        this.frame('plaque', px, py, pw, ph, fa);
        this.text(title, fx + fw / 2, py + Math.round((ph - this.cap(f)) / 2) - 1, { ...st, align: 'center', alpha: (st.alpha ?? 1) * Math.min(1, fa) });
      } else this.text(title, fx + PAD[kind][0] + 2, fy + PAD[kind][1] + 2, { ...st, alpha: (st.alpha ?? 1) * Math.min(1, fa) });
    }
    if (pt < 0.3) {
      // the content fades in and rises 3 px as the frame settles
      const c = Math.max(0, Math.min(1, (pt - 0.06) / 0.14));
      this.fadeK = c; this.liftY = Math.round((1 - c) * 3);
    }
  }
  /** content rect inside a panel skin */
  inner(kind: SkinKind, x: number, y: number, w: number, h: number) { const p = PAD[kind]; return { x: x + p[0], y: y + p[1], w: w - p[0] - p[2], h: h - p[1] - p[3] }; }

  private interact(id: string, x: number, y: number, w: number, h: number, disabled = false) {
    const over = this.hover(x, y, w, h);
    this.rectsNext.set(id, [x, y, w, h]);
    if (over) { this.overNext = true; if (!disabled && (!this.active || this.active === id)) this.hotNext = id; }
    if (disabled) return { over, held: false, clicked: false };
    // claim the press on the frame it happens (works for taps / instant clicks with no hover frame first)
    if (over && this.pressed && !this.claimed) { this.active = id; this.claimed = true; }
    const held = this.active === id && this.down;
    const clicked = this.active === id && this.released && over;
    if (over && !disabled) this.cursor = 'point';
    return { over, held, clicked };
  }

  /**
   * a chunky button: 3 states (hover lifts 1 px with a glint sweeping the face, press sinks 2 px), an optional icon,
   * and the keycap of its hotkey on the right. Styles: green = go, red = close / danger, wood (brass) = neutral,
   * gold = the important neutral, dark = secondary, blue = info. Recommended heights: 18 (compact), 22 (standard),
   * 26 (primary). The face is h - 5 tall (1 px headroom for the lift + a 2 px lip + outlines).
   */
  button(id: string, label: string, x: number, y: number, w: number, h: number, o: ButtonOpts = {}): boolean {
    const st = o.style ?? 'wood';
    const { over, held, clicked: c0 } = this.interact(id, x, y, w, h, o.disabled);
    let clicked = c0;
    if (o.key && !o.disabled && this.input?.keyHit(o.key)) clicked = true;
    const state: BtnState = o.state ?? (o.disabled ? 'disabled' : held ? 'down' : o.on ? 'on' : over ? 'hover' : 'normal');
    // a soft cast shadow on whatever it rests on (1 px under the lip and down the right edge; none while pressed)
    if (state !== 'down') { this.fill(x + 2, y + h, w - 2, 1, '#000000', 0.32); this.fill(x + w, y + 3, 1, h - 2, '#000000', 0.24); }
    this.img(btnSkin(st, state, w, h), x, y, { w: Math.max(6, Math.round(w)), h: Math.max(8, Math.round(h)) });
    const P = BTN[st];
    const [ft, fh] = btnFace(state, h);
    const fy = y + ft;
    // a slow caustic shimmer: every few seconds a soft band of light drifts across the face
    if (this.deco && state !== 'disabled' && w >= 24) {
      const hh = hashStr(id), per = 5 + (hh % 30) / 10, ph = (this.t + (hh % 100) / 17) % per;
      if (ph < 1.1) {
        const bx0 = x - 10 + (w + 20) * (ph / 1.1);
        for (let r = 1; r < fh - 1; r++) {
          const sx = Math.round(bx0 + (fh - r) * 0.5 + Math.sin(r * 0.9 + this.t * 3) * 0.6);
          const a0 = Math.max(x + 2, sx), b0 = Math.min(x + w - 2, sx + 5);
          if (b0 > a0) this.fill(a0, fy + r, b0 - a0, 1, '#dffcff', 0.13);
        }
      }
    }
    // the hover glint: a bright diagonal sweeping across the face once, and a little splash of bubbles
    if (state === 'hover') {
      const g = this.anim(id + ':glint');
      if (g === 0 && this.deco) this.splash(x + w / 2 + ((hashStr(id) % 11) - 5), fy, w >= 40 ? 4 : 2);
      if (g < 0.4) {
        const gx = x - 8 + (w + 16) * (g / 0.4);
        for (let r = 1; r < fh - 1; r++) {
          const sx = Math.round(gx + (fh - r) * 0.6);
          const a = Math.max(x + 2, sx), b = Math.min(x + w - 2, sx + 3);
          if (b > a) this.fill(a, fy + r, b - a, 1, '#ffffff', 0.35);
        }
      }
    }
    const font = o.font ?? 'body';
    const ty = fy + Math.round((fh - this.cap(font)) / 2);
    // kit icons are 1 texel per UI px, like the rest of the kit; a caller's canvas is taken as UI px
    const icCv = typeof o.icon === 'string' ? iconTex(o.icon) : o.icon;
    const ic = icCv ? { cv: icCv, width: icCv.width, height: icCv.height } : undefined;
    const kc = o.key && !PixelUI.touch ? (o.keyLabel ?? labelForKey(o.key)) : '';
    const kcW = kc ? this.keycapW(kc) : 0;
    const tw = label ? this.measure(label, font) : 0;
    const total = (ic ? ic.width + (label ? 3 : 0) : 0) + tw;
    let cx = x + 6;
    if (o.align !== 'left') cx = x + Math.round((w - total - (kc ? kcW + 4 : 0)) / 2);
    if (ic) { this.img(ic.cv, cx, fy + Math.round((fh - ic.height) / 2), { alpha: state === 'disabled' ? 0.5 : 1, w: ic.width, h: ic.height }); cx += ic.width + 3; }
    const brass = st === 'wood' || st === 'brass' || st === 'gold';
    if (label) this.text(label, cx, ty, state === 'disabled' ? { font, color: '#b4b0a6', shadow: '#2a2a2a' } : brass ? { font, color: P.text, shadow: P.textSh } : { font, color: P.text, outline: P.textSh });
    if (kc) this.keycap(kc, x + w - kcW - 4, fy + Math.round((fh - KEYCAP_H) / 2), st === 'dark' || st === 'tv', state === 'down');
    if (over && o.tip) this.tooltip(o.tip);
    if (clicked && this.sfx && o.sfx !== '') audio.play(o.sfx ?? (o.disabled ? 'k_err1' : 'k_click1'), { vol: 0.4, dry: true });
    return clicked;
  }

  /** square icon button (an icon 'close' with style 'red' draws the brass-ringed close widget) */
  iconButton(id: string, ic: string, x: number, y: number, o: ButtonOpts & { size?: number } = {}) {
    const s = o.size ?? 16;
    if (ic === 'close' && (o.style ?? 'red') === 'red') return this.closeButton(id, x, y - 1, { size: s + 1, key: o.key ?? null, disabled: o.disabled, tip: o.tip, sfx: o.sfx });
    return this.button(id, '', x, y, s, s + LIP + 1, { ...o, icon: ic });
  }

  /**
   * the big close widget: a brass-bezelled coral key with a cream X, `size` wide (default 20) and size + 3 tall (1 px
   * lift room + a 2 px lip); put it on the panel's top-right corner, e.g. (x + w - 16, y - 5). `key` defaults to
   * Escape (null: none).
   */
  closeButton(id: string, x: number, y: number, o: { size?: number; key?: string | null; disabled?: boolean; tip?: TipLine[]; sfx?: string; state?: 'normal' | 'hover' | 'down' | 'disabled' } = {}): boolean {
    const s = Math.max(11, Math.round(o.size ?? 20));
    const { over, held, clicked: c0 } = this.interact(id, x, y, s, s + 3, o.disabled);
    let clicked = c0;
    const key = o.key === undefined ? 'Escape' : o.key;
    if (key && !o.disabled && this.input?.keyHit(key)) clicked = true;
    this.img(closeArt(s, o.state ?? (o.disabled ? 'disabled' : held ? 'down' : over ? 'hover' : 'normal')), x, y, { w: s, h: s + 3 });
    if (over && o.tip) this.tooltip(o.tip);
    if (clicked && this.sfx && o.sfx !== '') audio.play(o.sfx ?? 'k_close1', { vol: 0.4, dry: true });
    return clicked;
  }

  /**
   * a row of folder tabs standing on a panel's top edge; returns the selected index. The selected tab is taller
   * and joins the frame; the others sit 3 px lower and darker. Default height 20.
   */
  tabs(id: string, labels: string[], sel: number, x: number, y: number, o: { style?: BtnStyle; h?: number; gap?: number; font?: FontName; w?: number } = {}): number {
    let cx = x;
    const h = o.h ?? 20;
    const font = o.font ?? 'body';
    let out = sel;
    labels.forEach((l, i) => {
      const w = o.w ?? Math.ceil(this.measure(l, font)) + 16;
      const on = i === sel;
      const { over, clicked } = this.interact(id + ':' + i, cx, y, w, h);
      const dy = on ? 0 : over ? 2 : 3;
      this.img(tabSkin(on ? 'on' : over ? 'hover' : 'off', Math.round(w), h - dy), cx, y + dy, { w: Math.round(w), h: h - dy });
      this.text(l, cx + w / 2, y + dy + Math.round((h - dy - this.cap(font)) / 2) + (on ? 0 : -1), { font, color: on ? KIT.cream[3] : over ? KIT.cream[2] : KIT.textDim, outline: on ? KIT.ink : null, shadow: on ? null : '#06141a', align: 'center' });
      if (clicked && !on) { out = i; if (this.sfx) audio.play('tab1', { vol: 0.4, dry: true }); }
      cx += w + (o.gap ?? 2);
    });
    return out;
  }

  /** horizontal slider (a recessed track, a kelp fill, a brass knob); returns the new value. 12 UI px tall */
  slider(id: string, v: number, x: number, y: number, w: number, o: { min?: number; max?: number; step?: number; style?: 'wood' | 'tv' | 'blue' } = {}): number {
    const min = o.min ?? 0, max = o.max ?? 1;
    const { over, held } = this.interact(id, x - 4, y - 3, w + 8, 16);
    const k = Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
    const fillC = o.style === 'blue' || o.style === 'tv' ? KIT.sea : KIT.kelp;
    // track: a groove cut in a driftwood rail (shadowed top row, lit lower lip), the filled part a kelp ribbon
    const ty = y + 3;
    this.fill(x - 1, ty - 1, w + 2, 8, '#845230');
    this.fill(x - 1, ty - 1, w + 2, 1, '#bd8751'); this.fill(x - 1, ty + 6, w + 2, 1, '#48291f');
    this.fill(x, ty, w, 6, KIT.ink);
    this.fill(x + 1, ty + 1, w - 2, 4, '#0a1a25');
    this.fill(x + 1, ty + 1, w - 2, 1, '#030a10');
    this.fill(x + 1, ty + 4, w - 2, 1, '#204a56');
    const fw = Math.round((w - 2) * k);
    if (fw > 0) {
      this.fill(x + 1, ty + 1, fw, 4, fillC[2]); this.fill(x + 1, ty + 1, fw, 1, fillC[3]); this.fill(x + 1, ty + 4, fw, 1, fillC[1]);
      // ruffles along the ribbon, a pale bead of light at its end
      for (let i = 3; i < fw - 2; i += 5) { this.fill(x + 1 + i, ty + 2, 1, 1, fillC[3]); this.fill(x + 2 + i, ty + 3, 1, 1, fillC[1]); }
      this.fill(x + fw - 1, ty + 1, 1, 2, '#ffffff', 0.5);
    }
    // brass notches under the rail
    for (let i = 1; i < 4; i++) { const nx = x + Math.round((w - 1) * i / 4); this.fill(nx, ty + 7, 1, 2, '#a86a24'); this.fill(nx, ty + 7, 1, 1, '#f8d880'); }
    const kx = x + Math.round((w - 1) * k) - 4;
    this.img(knobArt(held ? 'down' : over ? 'hover' : 'normal'), kx, y - 1, { w: 9, h: 14 });
    if (held) {
      let nv = min + ((this.mx - x) / (w - 1)) * (max - min);
      if (o.step) nv = Math.round(nv / o.step) * o.step;
      nv = Math.max(min, Math.min(max, nv));
      if (nv !== v && this.sfx) audio.play('k_tick2', { vol: 0.1, dry: true, rate: 0.8 + (nv - min) / (max - min || 1) * 0.6 });
      return nv;
    }
    if (over && this.wheel) { const st = o.step ?? (max - min) / 20; return Math.max(min, Math.min(max, v - this.wheel * st)); }
    return v;
  }

  /** a labelled checkbox (a 13 px cream box, a kelp tick); returns the new state */
  toggle(id: string, on: boolean, label: string, x: number, y: number, o: { style?: BtnStyle; font?: FontName; color?: string } = {}): boolean {
    const font = o.font ?? 'body';
    const w = 13 + 5 + Math.ceil(this.measure(label, font));
    const { over, held, clicked } = this.interact(id, x, y, w, 13);
    this.img(checkArt(on, over, held, 13), x, y, { w: 13, h: 13 });
    this.text(label, x + 18, y + Math.round((13 - this.cap(font)) / 2), { font, color: o.color ?? (over ? '#ffffff' : KIT.text), shadow: '#06141a' });
    if (clicked) { if (this.sfx) audio.play('k_toggle2', { vol: 0.35, dry: true }); return !on; }
    return on;
  }

  /** ◄ value ► stepper (18 px tall brass arrow keys); returns -1, 0 or +1 */
  stepper(id: string, value: string, x: number, y: number, w: number, o: { style?: BtnStyle; font?: FontName; color?: string; canL?: boolean; canR?: boolean } = {}): number {
    let r = 0;
    const st = o.style ?? 'wood';
    if (this.button(id + ':l', '', x, y, 16, 18, { style: st, icon: 'left', disabled: o.canL === false, sfx: 'k_tick4' })) r = -1;
    if (this.button(id + ':r', '', x + w - 16, y, 16, 18, { style: st, icon: 'right', disabled: o.canR === false, sfx: 'k_tick4' })) r = 1;
    const font = o.font ?? 'body';
    this.text(value, x + w / 2, y + 1 + Math.round((15 - this.cap(font)) / 2), { font, color: o.color ?? KIT.cream[3], outline: KIT.ink, align: 'center' });
    if (this.hover(x, y, w, 18) && this.wheel) r = this.wheel > 0 ? 1 : -1;
    return r;
  }

  /**
   * a tooltip near the mouse, drawn on top at end(): a clean cream card. A first line in font 'title' becomes the
   * card's heading (with a rule under it). Lines with `key` draw that keycap first (a hint row: { key: 'E', text:
   * 'use' }). kind 'dark' gives a dark card (pass light colours).
   */
  tooltip(lines: TipLine[] | string, o: { kind?: SkinKind; maxW?: number; at?: [number, number] } = {}) {
    const L = (typeof lines === 'string' ? [lines] : lines).map((l) => (typeof l === 'string' ? { text: l } : l));
    const kind = o.kind ?? 'paper';
    const maxW = o.maxW ?? 170;
    this.tips.push(() => drawCard(this, L, kind, maxW, o.at ?? null));
  }

  /** standard tooltip lines for an item id */
  itemTip(id: string, level = 1, extra: TipLine[] = []): TipLine[] {
    const d = ITEMS[id];
    if (!d) return [{ text: id, font: 'title' }];
    const out: TipLine[] = [
      { text: d.name + (level > 1 ? ` +${level - 1}` : ''), font: 'title', color: shadeFor(RARITY_COLOR[d.rarity]) },
      { text: `${d.rarity} ${d.kind}`.toUpperCase(), font: 'small', color: KIT.textInkDim, gap: 1 },
      { text: d.desc, color: KIT.textInk, gap: 3 },
    ];
    if (d.note) out.push({ text: d.note(level), color: '#1f5a8a', gap: 2 });
    return out.concat(extra);
  }

  /**
   * item icon + count pairs: the count in green when you have enough, red when short ("have/need" with showHave).
   * Hover shows the material's name. Returns the width drawn. `dark` = drawn on a dark panel (default) vs cream.
   */
  costRow(cost: Record<string, number>, x: number, y: number, o: { have?: Record<string, number>; size?: number; font?: FontName; dark?: boolean; gap?: number; showHave?: boolean; light?: boolean } = {}): number {
    const size = o.size ?? 16;
    const font = o.font ?? 'small';
    const onCream = o.light === true;
    let cx = x;
    for (const [id, n] of Object.entries(cost)) {
      const have = o.have?.[id] ?? Infinity;
      const ok = have >= n;
      this.item(id, cx, y, size, size);
      const label = o.showHave && o.have ? `${Math.min(have, 999)}/${n}` : `${n}`;
      const col = onCream ? (ok ? '#2a6a1a' : '#a8241c') : ok ? KIT.goodLight : KIT.badLight;
      const tw = this.text(label, cx + size + 2, y + Math.round((size - this.cap(font)) / 2), onCream ? { font, color: col, shadow: null } : { font, color: col, outline: KIT.ink });
      const hov = this.hover(cx, y, size + tw + 2, size);
      if (hov && ITEMS[id]) this.tooltip([{ text: getItem(id).name, font: 'body', color: KIT.textInk }, { text: o.have ? `have ${o.have[id] ?? 0} · need ${n}` : `need ${n}`, font: 'small', color: ok ? '#2a6a1a' : '#a8241c' }]);
      cx += size + 2 + Math.ceil(tw) + (o.gap ?? 6);
    }
    return cx - x;
  }

  /** width costRow() would take */
  costWidth(cost: Record<string, number>, o: { have?: Record<string, number>; size?: number; font?: FontName; gap?: number; showHave?: boolean } = {}) {
    const size = o.size ?? 16; let w = 0;
    for (const [id, n] of Object.entries(cost)) { const have = o.have?.[id] ?? 0; w += size + 2 + Math.ceil(this.measure(o.showHave && o.have ? `${Math.min(have, 999)}/${n}` : `${n}`, o.font ?? 'small')) + (o.gap ?? 6); }
    return w;
  }

  /** a keycap (or mouse glyph for LMB / RMB / MMB) + verb hint ('E use'); returns the width incl. trailing space */
  hint(key: string, label: string, x: number, y: number, o: { color?: string; dark?: boolean; font?: FontName } = {}) {
    let w = 0;
    if (PixelUI.touch) key = touchKey(key);
    if (key === 'LMB' || key === 'RMB' || key === 'MMB') {
      const g = this.mouseGlyph(key), gw = g.width;
      this.img(g, x, y + Math.round((KEYCAP_H - g.height) / 2), { w: gw, h: g.height }); w = gw + 3;
    } else w = this.keycap(key, x, y, o.dark) + 4;
    const f = o.font ?? 'small';
    w += this.text(label, x + w, y + Math.round((KEYCAP_H - 2 - this.cap(f)) / 2), { font: f, color: o.color ?? KIT.text, shadow: '#06141a' });
    return Math.ceil(w) + 10;
  }
  /** the width hint() takes */
  hintW(key: string, label: string, font: FontName = 'small') { if (PixelUI.touch) key = touchKey(key); return (key === 'LMB' || key === 'RMB' || key === 'MMB' ? 12 : this.keycapW(key) + 4) + Math.ceil(this.measure(label, font)) + 10; }
  private mouseGlyph(k: string) { return mouseTex(k === 'LMB' ? 'L' : k === 'RMB' ? 'R' : 'M'); }

  /**
   * a scrollable list of n rows; row(i, x, y, w, hovered) draws one. Returns the clicked row or -1.
   * Wheel scrolls; a brass scrollbar appears when the content overflows.
   */
  list(id: string, x: number, y: number, w: number, h: number, n: number, rowH: number, row: (i: number, x: number, y: number, w: number, hov: boolean) => void, o: { style?: 'wood' | 'tv' | 'blue' | 'dark'; cols?: number } = {}): number {
    const cols = o.cols ?? 1;
    const rows = Math.ceil(n / cols);
    let s = this.lists.get(id);
    if (!s) { s = { scroll: 0, target: 0, drag: -1 }; this.lists.set(id, s); }
    const contentH = rows * rowH;
    const maxScroll = Math.max(0, contentH - h);
    const sbW = maxScroll > 0 ? 7 : 0;
    const over = this.hover(x, y, w, h);
    if (over) { this.overNext = true; if (this.wheel) { s.target += this.wheel * rowH; } }
    s.target = Math.max(0, Math.min(maxScroll, s.target));
    s.scroll += (s.target - s.scroll) * 0.35;
    if (Math.abs(s.target - s.scroll) < 0.5) s.scroll = s.target;
    const sc = Math.round(s.scroll);
    let clicked = -1;
    const cw = Math.floor((w - sbW - (sbW ? 2 : 0)) / cols);
    this.clip(x, y, w - sbW, h);
    const r0 = Math.floor(sc / rowH), r1 = Math.min(rows - 1, Math.ceil((sc + h) / rowH));
    for (let r = r0; r <= r1; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c; if (i >= n) break;
      const rx = x + c * cw, ry = y + r * rowH - sc;
      const hov = over && this.hover(rx, Math.max(y, ry), cw, Math.min(rowH, y + h - ry)) && s.drag < 0;
      if (ry >= y && ry + rowH <= y + h) this.rectsNext.set(id + ':' + i, [rx, ry, cw, rowH]);
      row(i, rx, ry, cw, hov);
      if (hov) { this.cursor = 'point'; this.hotNext = id + ':' + i; if (this.pressed && !this.claimed) { this.active = id + ':' + i; this.claimed = true; } if (this.released && this.active === id + ':' + i) clicked = i; }
    }
    this.unclip();
    if (maxScroll > 0) {
      const tx = x + w - sbW;
      // the track: a recessed groove (shadowed left, lit right lip); the thumb: a bevelled brass bar with grip grooves
      this.fill(tx, y, sbW, h, KIT.ink);
      this.fill(tx + 1, y + 1, sbW - 2, h - 2, '#0a1a25');
      this.fill(tx + 1, y + 1, 1, h - 2, '#030a10'); this.fill(tx + sbW - 2, y + 1, 1, h - 2, '#204a56');
      const th = Math.max(14, Math.round((h * h) / contentH));
      const ty = y + Math.round(((h - th) * sc) / maxScroll);
      const sbHover = this.hover(tx - 2, y, sbW + 2, h);
      if (sbHover && this.pressed) { s.drag = this.my - ty; if (s.drag < 0 || s.drag > th) s.drag = th / 2; }
      if (s.drag >= 0) { if (!this.down) s.drag = -1; else { s.target = s.scroll = Math.max(0, Math.min(maxScroll, ((this.my - s.drag - y) / (h - th)) * maxScroll)); } }
      const lit = s.drag >= 0 || sbHover;
      const B = lit ? ['#7a4416', '#cc9236', '#e8b850', '#f8d880', '#fff4c8'] : ['#4a240e', '#a86a24', '#cc9236', '#e8b850', '#f8d880'];
      this.fill(tx, ty, sbW, th, KIT.ink);
      this.fill(tx + 1, ty + 1, sbW - 2, th - 2, B[2]);
      this.fill(tx + 1, ty + 1, sbW - 2, 1, B[4]); this.fill(tx + 1, ty + 1, 1, th - 2, B[3]);
      this.fill(tx + sbW - 2, ty + 1, 1, th - 2, B[1]); this.fill(tx + 1, ty + th - 2, sbW - 2, 1, B[0]);
      for (const gy of [-3, -1, 1]) { this.fill(tx + 2, ty + Math.round(th / 2) + gy, sbW - 4, 1, B[0]); this.fill(tx + 2, ty + Math.round(th / 2) + gy + 1, sbW - 4, 1, B[4]); }
    }
    return clicked;
  }
  resetList(id: string) { this.lists.delete(id); }

  /**
   * v5: a goal / objective card, the shared language for "what to do next" (home goal board, run goals, tutorials):
   * a pinned cream card with a checkbox, the text, and either a count / percentage on the right with a kelp progress
   * bar along the bottom, or (o.cost) material icons with have/need counts in green / red. When done it ticks the
   * box and turns green (no strike-through); o.ready shows a pulsing READY! stamp (the goal can be completed now).
   *
   *   ui.objective('Rebuild the workbench', [3, 5])                  top centre, auto width
   *   ui.objective('Find the Harpoon King', undefined, { x: 8, y: 40, w: 180 })
   *   ui.objective('Mend the bed', undefined, { x, y, cost: { kelp: 5, cork: 3 }, have: META.materials, ready: true })
   *
   * Returns the card's height (stack goals by adding it + 3). Hovering it marks the UI as over (no world clicks).
   */
  objective(text: string, progress?: number | [number, number], o: { x?: number; y?: number; w?: number; done?: boolean; icon?: string; id?: string; pulse?: boolean; small?: boolean; cost?: Record<string, number>; have?: Record<string, number>; ready?: boolean; title?: string } = {}): number {
    const F: FontName = o.small ? 'small' : 'body';
    const frac = progress === undefined ? -1 : Array.isArray(progress) ? Math.min(1, progress[0] / Math.max(1, progress[1])) : Math.max(0, Math.min(1, progress));
    const done = o.done ?? frac >= 1;
    const ready = !!o.ready && !done;
    const count = Array.isArray(progress) ? `${Math.min(progress[0], 9999)}/${progress[1]}` : progress !== undefined ? `${Math.round(frac * 100)}%` : '';
    const cap = this.cap(F);
    const iconW = o.icon ? 16 : 0;
    const cw = count ? Math.ceil(this.measure(count, F)) + 8 : 0;
    const costW = o.cost ? this.costWidth(o.cost, { have: o.have, showHave: !!o.have, size: 14 }) : 0;
    const stamp = ready ? 'READY!' : '';
    const stampW = stamp ? Math.ceil(this.measure(stamp, 'small')) + 12 : 0;
    const headW = 22 + iconW + Math.ceil(this.measure(text, F)) + cw + stampW + 8;
    const w = Math.round(o.w ?? Math.min(this.w - 16, Math.max(headW, costW + 30)));
    const rowH = Math.max(14, Math.round(cap) + 6);
    const barH = progress !== undefined && !o.cost ? 5 : 0;
    const costH = o.cost ? 17 : 0;
    const h = 4 + rowH + barH + costH + (barH || costH ? 2 : 0) + 2;
    const x = Math.round(o.x ?? (this.w - w) / 2), y = Math.round(o.y ?? 8);
    const id = o.id ?? 'obj:' + text;
    const pt = this.pop ? this.anim('objective:' + id) : 9;
    const dx = pt < 0.25 ? Math.round((1 - easeOutBack(pt / 0.25, 1.4)) * -14) : 0;
    const a = Math.min(1, pt / 0.12);
    // the card: a drop shadow, an ink outline, cream body, lit top, a card edge, and a teal tab on the left
    const X = x + dx;
    this.fill(X + 2, y + 2, w, h, '#000000', 0.28 * a);
    this.frame('paper', X, y, w, h, a);
    if (done) this.fill(X + 1, y + 1, w - 2, h - 4, '#d6efc0', 0.55 * a);
    if (ready || o.pulse) {
      const p = 0.5 + 0.5 * Math.sin(this.t * 6);
      this.rect(X - 1, y - 1, w + 2, h + 2, ready ? KIT.kelp[2] : KIT.brass[3]);
      this.fill(X + 1, y + 1, w - 2, h - 4, ready ? '#c8f0a0' : '#fff4b0', 0.22 * p * a);
    }
    // checkbox
    const bx = X + 6, by = y + 3 + Math.round((rowH - 11) / 2);
    this.img(checkArt(done, false, false, 11), bx, by, { alpha: a, w: 11, h: 11 });
    let cx = X + 22;
    if (o.icon) { this.item(o.icon, cx, y + 3 + Math.round((rowH - 14) / 2), 14, 14, 1, a); cx += iconW; }
    const ty = y + 3 + Math.round((rowH - cap) / 2);
    this.text(text, cx, ty, { font: F, color: done ? '#2a5a1a' : KIT.textInk, shadow: null, alpha: a });
    let rx = X + w - 7;
    if (stamp) {
      const sw = stampW - 4, sh = Math.round(this.cap('small')) + 5;
      const p = 1 + Math.round(Math.max(0, Math.sin(this.t * 6)) * 1);
      const sx = rx - sw, sy = y + 3 + Math.round((rowH - sh) / 2) - (p - 1);
      this.fill(sx, sy, sw, sh, KIT.ink, a); this.fill(sx + 1, sy + 1, sw - 2, sh - 2, KIT.kelp[2], a); this.fill(sx + 1, sy + 1, sw - 2, 1, KIT.kelp[3], a);
      this.text(stamp, sx + sw / 2, sy + 3, { font: 'small', color: '#ffffff', outline: KIT.kelp[0], align: 'center', alpha: a });
      rx = sx - 5;
    }
    if (count) this.text(count, rx, ty, { font: F, color: done ? '#2a6a1a' : '#7a4a14', shadow: null, align: 'right', alpha: a });
    if (barH) {
      const bx2 = X + 22, bw = X + w - 7 - bx2, by2 = y + 3 + rowH;
      this.fill(bx2, by2, bw, 4, KIT.cream[0], a); this.fill(bx2 + 1, by2 + 1, bw - 2, 2, '#e9dbb6', a);
      const shown = this.ease(id + ':bar', frac, 8);
      const fw = Math.round((bw - 2) * shown);
      if (fw > 0) { this.fill(bx2 + 1, by2 + 1, fw, 2, done ? KIT.kelp[2] : KIT.brass[2], a); this.fill(bx2 + 1, by2 + 1, fw, 1, done ? KIT.kelp[3] : KIT.brass[3], a); }
    }
    if (o.cost) {
      const fk = this.fadeK; this.fadeK = fk * a;
      // have counts clipped to the need (3/3, never 9/3)
      const have = o.have ? Object.fromEntries(Object.entries(o.cost).map(([k, n]) => [k, Math.min(n, o.have![k] ?? 0)])) : undefined;
      this.costRow(o.cost, X + 22, y + 3 + rowH + 1, { have, showHave: !!have, size: 14, light: true });
      this.fadeK = fk;
    }
    if (this.hover(x, y, w, h)) this.overNext = true;
    if (o.id) this.rectsNext.set(o.id, [x, y, w, h]);
    return h;
  }

  /**
   * a bar (hp, progress, xp): an ink-outlined recessed trough with a lit fill. With o.id it EASES to new values and
   * FLASHES on change (a pale chip trails a drop, a bright flash marks a gain); o.ticks draws segment notches.
   */
  bar(x: number, y: number, w: number, h: number, v: number, col: string, back = '#0c1c22', o: { id?: string; ticks?: number; chip?: string } = {}) {
    v = Math.max(0, Math.min(1, v));
    let shown = v, chip = v, flash = 0;
    if (o.id) {
      let b = this.bars.get(o.id);
      if (!b || b.last < this.frameNo - 1) b = { v, chip: v, last: this.frameNo, flashT: -9, prev: v };
      if (b.last !== this.frameNo) {
        if (Math.abs(v - b.prev) > 1e-4) { b.flashT = this.t; b.prev = v; }
        b.v += (v - b.v) * (1 - Math.exp(-(v > b.v ? 9 : 14) * this.dt));
        b.chip = v < b.chip ? (this.t - b.flashT > 0.35 ? b.chip + (v - b.chip) * (1 - Math.exp(-5 * this.dt)) : b.chip) : b.v;
      }
      b.last = this.frameNo; this.bars.set(o.id, b);
      shown = b.v; chip = b.chip; flash = Math.max(0, 1 - (this.t - b.flashT) / 0.3);
    }
    this.fill(x, y, w, h, KIT.ink);
    this.fill(x + 1, y + 1, w - 2, h - 2, back);
    if (h > 4) this.fill(x + 1, y + 1, w - 2, 1, '#000000', 0.35);
    const iw = w - 2;
    const cwid = Math.round(iw * chip), fw = Math.round(iw * shown);
    if (cwid > fw) this.fill(x + 1 + fw, y + 1, cwid - fw, h - 2, o.chip ?? '#f3e7c9', 0.85);
    if (fw > 0) {
      // the fill: a lit top row, a soft upper band, the body, a shaded bottom row, a glint at its left end and a
      // brighter meniscus at its leading edge
      this.fill(x + 1, y + 1, fw, h - 2, col);
      if (h > 3) this.fill(x + 1, y + 1, fw, 1, '#ffffff', 0.42);
      if (h > 6) this.fill(x + 1, y + 2, fw, Math.floor((h - 4) / 3), '#ffffff', 0.14);
      if (h > 5) this.fill(x + 1, y + h - 2, fw, 1, '#000000', 0.3);
      if (h > 4 && fw > 6) { this.fill(x + 2, y + 2, 2, 1, '#ffffff', 0.7); this.fill(x + 2, y + 3, 1, 1, '#ffffff', 0.45); }
      if (fw > 2 && fw < iw) this.fill(x + fw, y + 1, 1, h - 2, '#ffffff', 0.35);
    }
    if (o.ticks && o.ticks > 1) for (let i = 1; i < o.ticks; i++) this.fill(x + 1 + Math.round((iw * i) / o.ticks), y + 1, 1, h - 2, KIT.ink, 0.55);
    if (flash > 0) this.fill(x + 1, y + 1, Math.max(fw, cwid), h - 2, '#ffffff', flash * 0.6);
  }

  /** pixel corner brackets around a screen-space box (selection reticle) */
  brackets(x: number, y: number, w: number, h: number, col: string, len = 5, shadow = '#000') {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const seg = (sx: number, sy: number, dx: number, dy: number) => {
      for (let i = 0; i < len; i++) { this.fill(sx + dx * i + 1, sy + dy * i + 1, 1, 1, shadow); }
      for (let i = 0; i < len; i++) this.fill(sx + dx * i, sy + dy * i, 1, 1, col);
    };
    seg(x, y, 1, 0); seg(x, y, 0, 1); seg(x + w, y, -1, 0); seg(x + w, y, 0, 1);
    seg(x, y + h, 1, 0); seg(x, y + h, 0, -1); seg(x + w, y + h, -1, 0); seg(x + w, y + h, 0, -1);
  }
}

/** rows of a tooltip / tag card */
interface CardRow { text: string; color?: string; font: FontName; icon?: HTMLCanvasElement; gap: number; key?: string; head: boolean }

/** lay out tip lines: returns the rows and the card's size for a skin */
export function cardLayout(ui: PixelUI, lines: { text: string; color?: string; font?: FontName; icon?: HTMLCanvasElement; gap?: number; key?: string }[], kind: SkinKind, maxW: number) {
  const rows: CardRow[] = [];
  lines.forEach((l, li) => {
    const f = l.font ?? 'body';
    const head = li === 0 && f === 'title' && lines.length > 1;
    const kw = l.key ? ui.keycapW(l.key) + 4 : 0;
    const ws = ui.wrap(l.text, f, maxW - (l.icon ? l.icon.width + 3 : 0) - kw);
    ws.forEach((t, i) => rows.push({ text: t, color: l.color, font: f, icon: i === 0 ? l.icon : undefined, gap: i === 0 ? (l.gap ?? 0) + (li > 0 && rows[rows.length - 1]?.head ? 5 : 0) : 0, key: i === 0 ? l.key : undefined, head }));
  });
  const pad = PAD[kind];
  const rowW = (r: CardRow) => ui.measure(r.text, r.font) + (r.icon ? r.icon.width + 3 : 0) + (r.key ? ui.keycapW(r.key) + 4 : 0);
  const rowH = (r: CardRow) => Math.max(ui.lh(r.font), r.icon ? r.icon.height + 1 : 0, r.key ? KEYCAP_H + 2 : 0);
  const w = Math.ceil(Math.min(maxW, Math.max(...rows.map(rowW)))) + pad[0] + pad[2] + 2;
  const h = rows.reduce((a, r) => a + rowH(r) + r.gap, 0) + pad[1] + pad[3] - 2;
  return { rows, w, h, rowH };
}

/** draw a tooltip / tag card at (at) or near the mouse */
export function drawCard(ui: PixelUI, lines: { text: string; color?: string; font?: FontName; icon?: HTMLCanvasElement; gap?: number; key?: string }[], kind: SkinKind, maxW: number, at: [number, number] | null, o: { alpha?: number; pin?: boolean } = {}) {
  const { rows, w, h, rowH } = cardLayout(ui, lines, kind, maxW);
  let x = at ? at[0] : ui.mx + 12, y = at ? at[1] : ui.my + 12;
  if (!at && x + w > ui.w - 4) x = ui.mx - 8 - w;
  if (y + h > ui.h - 4) y = ui.h - 4 - h;
  x = Math.max(4, Math.min(ui.w - 4 - w, x)); y = Math.max(4, y);
  const a = o.alpha ?? 1;
  const pad = PAD[kind];
  const dark = kind !== 'paper' && kind !== 'insetCream' && kind !== 'cream';
  ui.fill(x + 2, y + 2, w, h, '#000000', 0.25 * a);
  ui.frame(kind, x, y, w, h, a);
  if (o.pin) {
    // hung on a short rope loop: two strands rising from the card's top edge to a knot
    const cx = x + Math.floor(w / 2);
    for (let i = 0; i <= 5; i++) {
      for (const sx of [-1, 1]) { const px = cx + sx * (6 - i), py = y - Math.round(i * 0.9); ui.fill(px - 1, py - 1, 3, 3, KIT.ink, a); }
    }
    for (let i = 0; i <= 5; i++) {
      for (const sx of [-1, 1]) { const px = cx + sx * (6 - i), py = y - Math.round(i * 0.9); ui.fill(px, py, 1, 1, i % 2 ? '#b09254' : '#d6bc80', a); }
    }
    ui.fill(cx - 2, y - 8, 5, 4, KIT.ink, a); ui.fill(cx - 1, y - 7, 3, 2, '#b09254', a); ui.fill(cx - 1, y - 7, 1, 1, '#f0dca6', a);
  }
  let cy = y + pad[1] + 1;
  rows.forEach((r, i) => {
    cy += r.gap;
    if (i > 0 && rows[i - 1].head && !r.head) {
      // the rule under the heading
      ui.fill(x + pad[0], cy - 4, w - pad[0] - pad[2], 1, dark ? KIT.teal[3] : KIT.cream[1], a);
      ui.fill(x + pad[0], cy - 3, w - pad[0] - pad[2], 1, dark ? KIT.ink : KIT.cream[3], a);
    }
    let cx = x + pad[0] + 1;
    const rh = rowH(r);
    if (r.key) { ui.keycap(r.key, cx, cy + Math.round((rh - KEYCAP_H) / 2) - 1, dark); cx += ui.keycapW(r.key) + 4; }
    if (r.icon) { ui.img(r.icon, cx, cy, { alpha: a }); cx += r.icon.width + 3; }
    const ih = Math.max(r.icon ? r.icon.height : 0, r.key ? KEYCAP_H - 2 : 0);
    const col = r.color ?? (dark ? KIT.text : KIT.textInk);
    ui.text(r.text, cx, cy + Math.max(0, Math.round((ih - ui.cap(r.font)) / 2)), dark ? { font: r.font, color: col, shadow: '#06141a', alpha: a } : { font: r.font, color: col, shadow: null, alpha: a });
    cy += rh;
  });
  ui.block(x, y, w, h);
  return { x, y, w, h };
}

function shadeFor(c: string) {
  // rarity colours are tuned for dark backgrounds; darken them for the cream card
  const v = parseInt(c.slice(1), 16);
  const r = ((v >> 16) & 255) * 0.55, g = ((v >> 8) & 255) * 0.55, b = (v & 255) * 0.55;
  return '#' + [r, g, b].map((k) => Math.round(k).toString(16).padStart(2, '0')).join('');
}

/** a small stable string hash (decoration placement / phases) */
function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; }
