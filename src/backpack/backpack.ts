// The backpack screen (v3): a crisp 2D pixel-art leather pack drawn over the frozen world (the screen beneath
// keeps rendering its last frame). Every icon is shown 1:1 (32 px per cell) on the shared PixelUI density.
//
//   game.openModal('backpack', { run, onClose })        (closing calls installItemSystem(run), then onClose)
//
//   the pack      a stitched leather backpack, flap thrown open; its 5x5 canvas pockets hold the packed items
//                 (only those count). Items sit in their pockets with a drop shadow, stack counts on materials.
//   the seabed    a sandy patch beside it: loose finds (run.items with gx < 0). Whatever is left there when the
//                 bag closes is dropped back into the water by the run screen.
//   the card      the hovered / held item: name, rarity, kind, stack, stats, set tags, what it fuses with; with
//                 nothing hovered, the BUILD: set bonuses with their 2 / 4 / 6 tier pips.
//
// Drag (LMB) to move; R or RMB rotates the held / hovered item; pockets light green where it fits, red where it
// doesn't, gold over a stack it tops up or a partner it fuses with. Tab / Esc / the X closes.
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import type { Run, ItemInst } from '../game/run';
import {
  getItem, installItemSystem, fits, findSpot, mergeResult, rotCells, shapeSize, recipesWith, GRID, ITEMS, RARITY_COLOR,
  setBonuses, statLines, stackCap, stackOnto, itemIcon, type ItemDef,
} from '../game/items';
import { PixelUI } from '../ui/pixel/ui';
import { audio } from '../audio/audio';

export interface BackpackEnter { run: Run; onClose?: () => void }

const C = 32; // px per cell (icons are painted at 32 px per cell: 1:1)

function sfx(ids: string | string[], o: { vol?: number; rate?: number; delay?: number } = {}) {
  for (const id of Array.isArray(ids) ? ids : [ids]) if (audio.has(id)) { audio.play(id, { vol: o.vol ?? 0.6, rate: o.rate, delay: o.delay, dry: true, jitter: 0.06 }); return; }
}

// ------------------------------------------------------------------ cached art
const artCache = new Map<string, HTMLCanvasElement>();
function cached(key: string, f: () => HTMLCanvasElement) { let c = artCache.get(key); if (!c) { c = f(); artCache.set(key, c); if (artCache.size > 600) artCache.clear(); } return c; }
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); const x = c.getContext('2d')!; x.imageSmoothingEnabled = false; return [c, x]; }

/** an item's icon turned by rot quarter turns (clockwise, matching rotCells) */
function rotIcon(id: string, level: number, rot: number): HTMLCanvasElement {
  rot = ((rot % 4) + 4) % 4;
  const src = itemIcon(id, level);
  if (!rot) return src;
  return cached(`rot|${id}|${level}|${rot}`, () => {
    const sw = src.width, sh = src.height, odd = rot % 2 === 1;
    const [c, x] = canvas(odd ? sh : sw, odd ? sw : sh);
    x.translate(c.width / 2, c.height / 2); x.rotate((rot * Math.PI) / 2); x.drawImage(src, -sw / 2, -sh / 2);
    return c;
  });
}
/** a flat-colour silhouette of a canvas (shadows, hover rims) */
function silhouette(src: HTMLCanvasElement, col: string, key: string): HTMLCanvasElement {
  return cached(`sil|${key}|${col}`, () => {
    const [c, x] = canvas(src.width, src.height);
    x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
    return c;
  });
}
/** a 1 px rim around a canvas's silhouette, in col */
function rim(src: HTMLCanvasElement, col: string, key: string): HTMLCanvasElement {
  return cached(`rim|${key}|${col}`, () => {
    const s = silhouette(src, col, key);
    const [c, x] = canvas(src.width + 2, src.height + 2);
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) x.drawImage(s, dx, dy);
    x.globalCompositeOperation = 'destination-out'; x.drawImage(src, 1, 1);
    return c;
  });
}

// the pack: hue-shifted leather, canvas pockets, brass
const LE = { out: '#1c0c06', d2: '#3e1e10', d1: '#56301a', b: '#7a4528', l1: '#94583a', l2: '#b47448', st: '#e8c084', stD: '#8a5a30' };
const PK = { out: '#140a06', base: '#3c2c1e', sh: '#2a1c12', lit: '#56422e', st: '#9a7448', fl: '#4a3826' };
const BR = { out: '#2e1404', d: '#8a5a14', b: '#d8a038', l: '#f8d878', w: '#fffbe0' };

/** the whole backpack art for a grid of n x n cells of size c; the pocket area starts at PACK_IN */
const PACK_IN = { x: 16, y: 38 };
function packArt(n: number, c: number): HTMLCanvasElement {
  return cached(`pack|${n}|${c}`, () => {
    const gw = n * c, W = gw + PACK_IN.x * 2, H = gw + PACK_IN.y + 18;
    const [cv, x] = canvas(W + 16, H + 4);
    const f = (px: number, py: number, w: number, h: number, col: string) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
    const ox = 8; // room for the side straps
    // side straps (behind the body)
    for (const sx of [ox - 7, ox + W - 1]) {
      f(sx, 44, 8, H - 50, LE.out); f(sx + 1, 45, 6, H - 52, LE.d1); f(sx + 1, 45, 1, H - 52, LE.l1);
      for (let yy = 52; yy < H - 12; yy += 26) { f(sx + 2, yy, 4, 4, BR.out); f(sx + 3, yy + 1, 2, 2, BR.b); f(sx + 3, yy + 1, 1, 1, BR.w); }
    }
    // top handle loop
    for (let i = 0; i <= 40; i++) { const a = Math.PI * (i / 40); const hx = ox + W / 2 + Math.cos(a) * 22, hy = 16 - Math.sin(a) * 14; f(Math.round(hx) - 2, Math.round(hy) - 2, 5, 5, LE.out); }
    for (let i = 0; i <= 40; i++) { const a = Math.PI * (i / 40); const hx = ox + W / 2 + Math.cos(a) * 22, hy = 16 - Math.sin(a) * 14; f(Math.round(hx) - 1, Math.round(hy) - 1, 3, 3, i < 20 ? LE.d1 : LE.b); }
    // body: rounded rect with an outline, lit top-left, shaded bottom-right
    const R0 = 12, by = 12;
    const inBody = (px: number, py: number, inset = 0) => {
      const x0 = ox + inset, y0 = by + inset, x1 = ox + W - 1 - inset, y1 = by + H - 13 - inset, r = Math.max(1, R0 - inset);
      if (px < x0 || py < y0 || px > x1 || py > y1) return false;
      const qx = Math.max(x0 + r - px, 0, px - (x1 - r)), qy = Math.max(y0 + r - py, 0, py - (y1 - r));
      return qx * qx + qy * qy <= r * r;
    };
    for (let py = 0; py < cv.height; py++) for (let px = 0; px < cv.width; px++) {
      if (!inBody(px, py)) continue;
      let col = LE.b;
      if (!inBody(px, py, 1)) col = LE.out;
      else if (!inBody(px, py, 2)) col = px - ox < W / 2 && py - by < H / 3 ? LE.l2 : px - ox > W * 0.6 || py - by > H * 0.7 ? LE.d2 : LE.l1;
      else if (!inBody(px, py, 4)) col = py - by > H * 0.75 || px - ox > W - 6 ? LE.d1 : LE.b;
      else if (!inBody(px, py, 5)) col = ((px + py) >> 1) % 2 ? LE.st : LE.b; // stitching
      f(px, py, 1, 1, col);
    }
    // a couple of creases and scuffs (deliberate, not noise)
    for (const [cx0, cy0, len] of [[ox + 9, by + 60, 14], [ox + W - 14, by + 90, 10], [ox + 12, by + H - 40, 12]]) for (let i = 0; i < len; i++) f(cx0 + (i % 2 ? 0 : 1) * 0, cy0 + i, 1, 1, LE.d1);
    // the pocket panel (canvas) with stitched cells
    const gx0 = ox + PACK_IN.x, gy0 = PACK_IN.y;
    f(gx0 - 5, gy0 - 5, gw + 10, gw + 10, LE.out);
    f(gx0 - 4, gy0 - 4, gw + 8, gw + 8, PK.fl);
    f(gx0 - 4, gy0 - 4, gw + 8, 1, LE.d2);
    for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
      const X = gx0 + cx * c, Y = gy0 + cy * c;
      f(X + 1, Y + 1, c - 2, c - 2, PK.base);
      f(X + 1, Y + 1, c - 2, 2, PK.sh); f(X + 1, Y + 1, 2, c - 2, PK.sh);
      f(X + 1, Y + c - 2, c - 2, 1, PK.lit); f(X + c - 2, Y + 1, 1, c - 2, PK.lit);
      // stitched seams between pockets
      for (let i = 2; i < c - 2; i += 3) { f(X + i, Y, 2, 1, PK.st); f(X, Y + i, 1, 2, PK.st); }
      // a faint weave in the canvas: a 1 px dot every 4 px on a diagonal lattice
      for (let yy = 4; yy < c - 3; yy += 4) for (let xx = 4 + ((yy / 4) % 2) * 2; xx < c - 3; xx += 4) f(X + xx, Y + yy, 1, 1, PK.fl);
    }
    for (let i = 2; i < gw; i += 3) { f(gx0 + i, gy0 + gw - 1, 2, 1, PK.st); f(gx0 + gw - 1, gy0 + i, 1, 2, PK.st); }
    // the flap thrown open over the top, with a brass buckle
    const fy = 2, fh = 28, fx0 = ox + 4, fw = W - 8;
    for (let py = fy; py < fy + fh; py++) for (let px = fx0; px < fx0 + fw; px++) {
      const r = 10, ly = py - fy, lx = px - fx0;
      const qx = Math.max(r - lx, 0, lx - (fw - 1 - r)), qy = Math.max(0, ly - (fh - 1 - r));
      const d = Math.sqrt(qx * qx + qy * qy);
      if (d > r) continue;
      let col = LE.d1;
      if (d > r - 1 || ly === 0 || lx === 0 || lx === fw - 1) col = LE.out;
      else if (ly <= 2) col = LE.l1;
      else if (d > r - 3 && ly > fh - 8) col = LE.d2;
      else if (d > r - 5 && d <= r - 4 && ly > 6) col = ((px + py) >> 1) % 2 ? LE.st : LE.d1;
      f(px, py, 1, 1, col);
    }
    const bx = ox + W / 2 - 8, byk = fy + fh - 10;
    f(bx + 5, byk - 6, 6, 12, LE.out); f(bx + 6, byk - 6, 4, 11, LE.d2);
    f(bx, byk, 16, 12, BR.out); f(bx + 1, byk + 1, 14, 10, BR.b); f(bx + 1, byk + 1, 14, 1, BR.l); f(bx + 1, byk + 1, 1, 10, BR.l);
    f(bx + 4, byk + 4, 8, 4, LE.d2); f(bx + 7, byk + 3, 2, 6, BR.d); f(bx + 2, byk + 2, 1, 1, BR.w);
    return cv;
  });
}

/** the seabed patch the loose items lie on */
function seabedArt(w: number, h: number): HTMLCanvasElement {
  return cached(`sea|${w}|${h}`, () => {
    const [cv, x] = canvas(w, h);
    const f = (px: number, py: number, ww: number, hh: number, col: string) => { x.fillStyle = col; x.fillRect(px, py, ww, hh); };
    const r = 8;
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const qx = Math.max(r - px, 0, px - (w - 1 - r)), qy = Math.max(r - py, 0, py - (h - 1 - r));
      const d = Math.sqrt(qx * qx + qy * qy);
      if (d > r) continue;
      let col = '#b8955e';
      if (d > r - 1 || px === 0 || py === 0 || px === w - 1 || py === h - 1) col = '#2a1a0c';
      else if (d > r - 2 || px === 1 || py === 1) col = py < h / 2 ? '#e8cc94' : '#8a6a3c';
      // ripples: gentle sine bands
      else if (Math.abs(((py + Math.sin(px * 0.18) * 2.2) % 9) - 4) < 0.6) col = '#a4824e';
      else if (Math.abs(((py + Math.sin(px * 0.18) * 2.2 + 1) % 9) - 4) < 0.6) col = '#d4b47c';
      f(px, py, 1, 1, col);
    }
    // a pebble and a little shell in the corners
    f(w - 14, h - 9, 6, 4, '#3a3440'); f(w - 13, h - 10, 4, 1, '#3a3440'); f(w - 13, h - 9, 4, 2, '#7e7880'); f(w - 13, h - 9, 1, 1, '#d8d2cc');
    f(6, h - 10, 5, 4, '#6e4446'); f(7, h - 11, 3, 1, '#6e4446'); f(7, h - 10, 3, 3, '#e2b4a2'); f(8, h - 10, 1, 3, '#b07c74');
    return cv;
  });
}

// ------------------------------------------------------------------ the screen
interface Vis { x: number; y: number; vx: number; vy: number; lift: number; pop: number; shake: number }
type Plan =
  | { kind: 'grid'; gx: number; gy: number; ok: boolean; cells: [number, number][] }
  | { kind: 'board'; bx: number; by: number; ok: boolean }
  | { kind: 'stack'; target: ItemInst; k: number }
  | { kind: 'fuse'; target: ItemInst; id: string; level: number }
  | { kind: 'none' };

interface Layout { packX: number; packY: number; gridX: number; gridY: number; boardX: number; boardY: number; boardW: number; boardH: number; bCols: number; bRows: number; infoX: number; infoY: number; infoW: number; card: boolean; closeX: number; closeY: number }

export class BackpackScreen implements Screen {
  name = 'backpack';
  private bg = new THREE.Scene();
  private bgCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 10);
  /** the screen beneath (its scene keeps rendering, frozen) */
  private under: Screen | null = null;
  get scene(): THREE.Scene { return this.under?.scene ?? this.bg; }
  get camera(): THREE.PerspectiveCamera { return this.under?.camera ?? this.bgCam; }
  get underwater() { return this.under?.underwater ?? false; }
  ui = new PixelUI();
  overlays = [this.ui.layer];

  private run: Run | null = null;
  private onClose?: () => void;
  private t = 0;
  private open = 0;            // 0..1 open animation
  private closing = false;
  private vis = new Map<number, Vis>();
  /** board slot of each loose item (top-left cell on the seabed grid) */
  private slot = new Map<number, { bx: number; by: number }>();
  private held: ItemInst | null = null;
  private heldFrom: { gx: number; gy: number; rot: number; slot?: { bx: number; by: number } } | null = null;
  private grab = { x: 0, y: 0 };
  private plan: Plan = { kind: 'none' };
  private hover: ItemInst | null = null;
  private sparks: { x: number; y: number; vx: number; vy: number; t: number; life: number; col: string }[] = [];
  private toasts: { text: string; sub: string; x: number; y: number; t: number; col: string }[] = [];
  private L!: Layout;
  private prevCursor: Game['cursor'] | null = null;

  constructor(private game: Game) {
    this.bg.background = new THREE.Color('#06121c');
  }

  enter(data?: unknown) {
    const d = (data ?? {}) as BackpackEnter;
    if (!d.run) return;
    this.under = this.game.screen && this.game.screen !== this ? this.game.screen : null;
    // the pack draws its own pixel cursor (arrow / point / grab); hide the game's
    this.prevCursor = this.game.cursor; this.game.cursor = 'none';
    this.run = d.run; this.onClose = d.onClose;
    this.held = null; this.hover = null; this.plan = { kind: 'none' };
    this.closing = false; this.open = 0;
    this.vis.clear(); this.sparks = []; this.toasts = [];
    // anything sitting in an invalid spot falls out onto the seabed
    const ok: ItemInst[] = [];
    for (const it of this.run.items) {
      if (!ITEMS[it.id]) continue;
      if (it.gx >= 0 && !fits(ok, it, it.gx, it.gy, it.rot)) { it.gx = -1; it.gy = -1; }
      if (it.gx >= 0) ok.push(it);
    }
    for (const uid of [...this.slot.keys()]) if (!this.run.items.some((i) => i.uid === uid && i.gx < 0)) this.slot.delete(uid);
    this.layout();
    this.layoutBoard();
    let k = 0;
    for (const it of this.run.items) { if (!ITEMS[it.id]) continue; const [tx, ty] = this.targetOf(it); this.vis.set(it.uid, { x: tx, y: ty + 10 + (k % 5) * 3, vx: 0, vy: 0, lift: 0, pop: -0.04 * k++, shake: 0 }); }
    sfx(['bag_zip1', 'cloth1'], { vol: 0.5 });
  }
  exit() { this.under = null; if (this.prevCursor !== null) this.game.cursor = this.prevCursor; this.prevCursor = null; }
  resize(w: number, h: number) { this.ui.resize(w, h, this.game.renderer.getPixelRatio()); this.bgCam.aspect = w / h; this.bgCam.updateProjectionMatrix(); }

  close() {
    if (this.closing || !this.run) return;
    if (this.held) this.dropHeld(true);
    this.closing = true;
    sfx(['k_close1', 'bag_zip1'], { vol: 0.5 });
  }

  // ---------------------------------------------------------------- layout
  private layout() {
    const ui = this.ui;
    const packW = GRID * C + PACK_IN.x * 2 + 16, packH = GRID * C + PACK_IN.y + 22;
    const infoW = 176, gap = 12;
    let bCols = 4;
    let card = ui.w >= packW + gap + bCols * C + 16 + gap + infoW + 12;
    if (!card) bCols = Math.max(2, Math.min(4, Math.floor((ui.w - packW - gap - 28) / C)));
    else bCols = Math.max(4, Math.min(5, Math.floor((ui.w - packW - gap * 2 - infoW - 28) / C)));
    if (ui.w < packW + gap + bCols * C + 16) card = false;
    const bRows = Math.max(3, Math.min(GRID, Math.floor((packH - 30) / C)));
    const boardW = bCols * C + 16, boardH = bRows * C + 16;
    const total = packW + gap + boardW + (card ? gap + infoW : 0);
    const x0 = Math.max(4, Math.round((ui.w - total) / 2));
    const y0 = Math.max(20, Math.round((ui.h - packH) / 2) + 6);
    const packX = x0, packY = y0;
    const boardX = packX + packW + gap, boardY = packY + PACK_IN.y - 8;
    this.L = {
      packX, packY, gridX: packX + 8 + PACK_IN.x, gridY: packY + PACK_IN.y, boardX, boardY, boardW, boardH, bCols, bRows,
      infoX: boardX + boardW + gap, infoY: packY + 8, infoW, card, closeX: (card ? boardX + boardW + gap + infoW : boardX + boardW) - 14, closeY: Math.max(4, packY - 14),
    };
  }

  /** the seabed: a cell grid of its own; items keep their slot between openings */
  private boardOcc(skip = -1): number[][] {
    const { bCols, bRows } = this.L;
    const g = Array.from({ length: bRows + 6 }, () => new Array(bCols).fill(0));
    for (const it of this.run!.items) {
      if (it.gx >= 0 || it.uid === skip || !ITEMS[it.id]) continue;
      const s = this.slot.get(it.uid); if (!s) continue;
      for (const [x, y] of rotCells(getItem(it.id).shape, it.rot)) { const yy = s.by + y, xx = s.bx + x; if (g[yy] && xx < bCols) g[yy][xx] = it.uid; }
    }
    return g;
  }
  private boardFits(it: ItemInst, bx: number, by: number, rot: number) {
    const { bCols } = this.L;
    const occ = this.boardOcc(it.uid);
    for (const [x, y] of rotCells(getItem(it.id).shape, rot)) { const xx = bx + x, yy = by + y; if (xx < 0 || yy < 0 || xx >= bCols || !occ[yy] || occ[yy][xx]) return false; }
    return true;
  }
  private freeBoardSlot(it: ItemInst): { bx: number; by: number } | null {
    const { bCols, bRows } = this.L;
    for (let rows = bRows; rows <= bRows + 5; rows++) for (let by = 0; by < rows; by++) for (let bx = 0; bx < bCols; bx++) {
      const { w, h } = shapeSize(rotCells(getItem(it.id).shape, it.rot));
      if (by + h > rows) continue;
      if (this.boardFits(it, bx, by, it.rot)) return { bx, by };
    }
    return null;
  }
  private layoutBoard() {
    for (const it of this.run!.items) {
      if (it.gx >= 0 || !ITEMS[it.id]) continue;
      const s = this.slot.get(it.uid);
      if (s && this.boardFits(it, s.bx, s.by, it.rot)) continue;
      this.slot.delete(it.uid);
      let sp = this.freeBoardSlot(it);
      if (!sp) { for (let r = 0; r < 4 && !sp; r++) { it.rot = (it.rot + 1) % 4; sp = this.freeBoardSlot(it); } }
      this.slot.set(it.uid, sp ?? { bx: 0, by: this.L.bRows + 4 });
    }
  }
  /** where an item rests (top-left of its rotated icon, UI px) */
  private targetOf(it: ItemInst): [number, number] {
    const L = this.L;
    if (it.gx >= 0) return [L.gridX + it.gx * C, L.gridY + it.gy * C];
    const s = this.slot.get(it.uid) ?? { bx: 0, by: 0 };
    return [L.boardX + 8 + s.bx * C, L.boardY + 8 + s.by * C];
  }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    const run = this.run;
    const ui = this.ui;
    this.t += dt;
    ui.drawCursor = true;
    ui.begin(this.game.input, dt);
    if (!run) { ui.end(); return; }
    this.layout();
    this.open = this.closing ? Math.max(0, this.open - dt * 6) : Math.min(1, this.open + dt * 5);
    if (this.closing && this.open <= 0) {
      ui.end();
      this.closing = false;
      installItemSystem(run);
      const cb = this.onClose; this.run = null;
      if (cb) cb(); else this.game.closeModal();
      return;
    }
    const k = 1 - (1 - this.open) ** 3;
    const slide = Math.round((1 - k) * 24);
    // dim the frozen world
    ui.fill(0, 0, ui.w, ui.h, '#03060c', 0.72 * k);
    ui.block(0, 0, ui.w, ui.h);
    this.drawHeader(slide);
    this.drawPack(slide);
    this.drawBoard(slide);
    this.interact();
    this.drawItems(dt, slide);
    this.drawPreview();
    this.drawHeld(dt);
    this.drawFx(dt);
    if (this.L.card) this.drawCard(slide);
    else if (this.hover || this.held) ui.tooltip(this.tipLines(this.held ?? this.hover!), { kind: 'dark', maxW: 170 });
    this.drawHints();
    ui.end();
    const inp = this.game.input;
    if (inp.keyHit('Tab') || inp.keyHit('Escape')) this.close();
  }

  // ---------------------------------------------------------------- drawing
  private drawHeader(slide: number) {
    const ui = this.ui, L = this.L, run = this.run!;
    const used = run.items.filter((i) => i.gx >= 0).reduce((a, i) => a + getItem(i.id).shape.length, 0);
    const pw = ui.measure('BACKPACK', 'title') + 22, px = L.packX + 8 + Math.round((GRID * C + PACK_IN.x * 2 - pw) / 2), py = L.packY - 18 - slide;
    ui.frame('plaque', px, py, pw, 18);
    ui.text('BACKPACK', px + pw / 2, py + 4, { font: 'title', color: '#3a2408', shadow: '#f8e0a0', align: 'center' });
    const full = used >= GRID * GRID;
    ui.text(`${used}/${GRID * GRID}`, L.packX + 8 + GRID * C + PACK_IN.x * 2 - 4, py + 5, { font: 'body', color: full ? '#ff7a6a' : '#e8dcc4', outline: '#0a0604', align: 'right' });
    // the close button
    if (ui.button('bp:close', '', L.closeX, L.closeY - slide, 14, 15, { style: 'red', icon: 'close', sfx: '' })) this.close();
  }

  private drawPack(slide: number) {
    const ui = this.ui, L = this.L;
    const art = packArt(GRID, C);
    ui.img(silhouette(art, '#00000080', `pack${GRID}`), L.packX + 3, L.packY + 4 + slide);
    ui.img(art, L.packX, L.packY + slide);
  }

  private drawBoard(slide: number) {
    const ui = this.ui, L = this.L;
    const art = seabedArt(L.boardW, L.boardH);
    ui.img(silhouette(art, '#00000070', `sea${L.boardW}x${L.boardH}`), L.boardX + 2, L.boardY + 3 + slide);
    ui.img(art, L.boardX, L.boardY + slide);
    ui.text('ON THE SEABED', L.boardX + L.boardW / 2, L.boardY - 11 + slide, { font: 'small', color: '#f0e2c0', outline: '#140a04', align: 'center' });
    const loose = this.run!.items.filter((i) => i.gx < 0).length;
    if (!loose) ui.textBox('Loose finds wait here. Whatever is left when you close the bag stays behind.', L.boardX + 12, L.boardY + 16 + slide, L.boardW - 24, { font: 'small', color: '#6a4a26', shadow: null, align: 'center' });
    // faint slot marks
    for (let by = 0; by < L.bRows; by++) for (let bx = 0; bx < L.bCols; bx++) {
      const X = L.boardX + 8 + bx * C, Y = L.boardY + 8 + by * C + slide;
      ui.fill(X + 1, Y + 1, 2, 1, '#a4824e'); ui.fill(X + 1, Y + 1, 1, 2, '#a4824e');
    }
  }

  private drawItems(dt: number, slide: number) {
    const ui = this.ui, run = this.run!;
    const order = [...run.items].filter((i) => ITEMS[i.id] && i !== this.held).sort((a, b) => (a.gx >= 0 ? 0 : 1) - (b.gx >= 0 ? 0 : 1));
    for (const it of order) {
      const v = this.visOf(it);
      const [tx, ty] = this.targetOf(it);
      this.spring(v, tx, ty, dt);
      v.pop = Math.min(1, v.pop + dt * 4);
      if (v.pop <= 0) continue;
      const hov = this.hover === it && !this.held;
      v.lift += ((hov ? 2 : 0) - v.lift) * Math.min(1, dt * 18);
      v.shake = Math.max(0, v.shake - dt * 3);
      const sx = Math.round(Math.sin(this.t * 60) * v.shake * 3);
      const ic = rotIcon(it.id, it.level ?? 1, it.rot);
      const key = `${it.id}|${it.level ?? 1}|${it.rot}`;
      const px = Math.round(v.x) + sx, py = Math.round(v.y - v.lift) + slide;
      const a = Math.min(1, v.pop * 1.6);
      // a rarity tint in the pockets it fills
      if (it.gx >= 0) for (const [cx, cy] of rotCells(getItem(it.id).shape, it.rot)) ui.fill(this.L.gridX + (it.gx + cx) * C + 3, this.L.gridY + (it.gy + cy) * C + 3 + slide, C - 5, C - 5, RARITY_COLOR[getItem(it.id).rarity], hov ? 0.22 : 0.09);
      ui.img(silhouette(ic, '#000000', key), px + 2, py + 2 + Math.round(v.lift), { alpha: 0.45 * a });
      if (hov) ui.img(rim(ic, '#fff6d0', key), px - 1, py - 1);
      ui.img(ic, px, py, { alpha: a });
      this.stackBadge(it, px, py, ic);
      if (this.plan.kind === 'stack' || this.plan.kind === 'fuse') if (this.plan.target === it) ui.img(rim(ic, Math.sin(this.t * 14) > 0 ? '#ffe070' : '#ffb020', key), px - 1, py - 1);
    }
  }

  private stackBadge(it: ItemInst, px: number, py: number, ic: HTMLCanvasElement) {
    const cap = stackCap(it.id);
    const n = it.n ?? 1;
    if (cap <= 1 || n <= 1) return;
    const s = `${n}`;
    const tw = this.ui.measure(s, 'body');
    const bx = px + ic.width - tw - 4, by = py + ic.height - 14;
    this.ui.fill(bx - 2, by - 1, tw + 4, 13, '#0a0604', 0.55);
    this.ui.text(s, bx, by + 1, { font: 'body', color: n >= cap ? '#ffd860' : '#ffffff', outline: '#0a0604' });
  }

  private drawPreview() {
    const ui = this.ui, L = this.L, p = this.plan;
    if (!this.held) return;
    if (p.kind === 'grid') {
      for (const [x, y] of p.cells) {
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
        const X = L.gridX + x * C, Y = L.gridY + y * C;
        const col = p.ok ? '#5ae04a' : '#ff4a3a';
        ui.fill(X + 2, Y + 2, C - 4, C - 4, col, 0.28);
        ui.rect(X + 1, Y + 1, C - 2, C - 2, col);
        if (p.ok) ui.fill(X + 2, Y + 2, C - 4, 1, '#d8ffc8', 0.8);
      }
    } else if (p.kind === 'board') {
      const it = this.held;
      for (const [x, y] of rotCells(getItem(it.id).shape, it.rot)) {
        const X = L.boardX + 8 + (p.bx + x) * C, Y = L.boardY + 8 + (p.by + y) * C;
        if (Y + C > L.boardY + L.boardH) continue;
        ui.rect(X + 1, Y + 1, C - 2, C - 2, p.ok ? '#fff2c8' : '#ff4a3a');
      }
    }
  }

  private drawHeld(dt: number) {
    const ui = this.ui, it = this.held;
    if (!it) return;
    const v = this.visOf(it);
    const tx = ui.mx - this.grab.x, ty = ui.my - this.grab.y;
    v.x += (tx - v.x) * Math.min(1, dt * 30); v.y += (ty - v.y) * Math.min(1, dt * 30);
    v.pop = Math.max(0, v.pop - dt * 6);
    const ic = rotIcon(it.id, it.level ?? 1, it.rot);
    const key = `${it.id}|${it.level ?? 1}|${it.rot}`;
    const sq = 1 + v.pop * 0.12;
    const w = Math.round(ic.width * sq), h = Math.round(ic.height / sq);
    const px = Math.round(v.x + (ic.width - w) / 2), py = Math.round(v.y + (ic.height - h) / 2) - 4;
    ui.img(silhouette(ic, '#000000', key), px + 5, py + 7, { alpha: 0.4, w, h });
    ui.img(ic, px, py, { w, h });
    this.stackBadge(it, px, py, ic);
    const p = this.plan;
    if (p.kind === 'stack' || p.kind === 'fuse') {
      const label = p.kind === 'stack' ? `STACK +${p.k}` : `FUSE: ${getItem(p.id).name}${p.id === it.id ? ` +${p.level - 1}` : ''}`;
      const lw = ui.measure(label, 'small');
      ui.fill(ui.mx + 10, ui.my - 16, lw + 8, 12, '#1a0e02', 0.85);
      ui.text(label, ui.mx + 14, ui.my - 14, { font: 'small', color: '#ffe070', outline: '#1a0e02' });
    }
  }

  private drawFx(dt: number) {
    const ui = this.ui;
    for (const s of this.sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; s.vx *= Math.exp(-dt * 2); }
    this.sparks = this.sparks.filter((s) => s.t < s.life);
    for (const s of this.sparks) { const a = 1 - s.t / s.life; ui.fill(Math.round(s.x), Math.round(s.y), 2, 2, s.col, a); if (a > 0.6) ui.fill(Math.round(s.x) - 1, Math.round(s.y), 4, 1, s.col, a * 0.5); }
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < 1.8);
    for (const t of this.toasts) {
      const a = Math.min(1, (1.8 - t.t) * 2), dy = Math.round(-t.t * 16);
      ui.text(t.text, t.x, t.y + dy, { font: 'title', color: t.col, outline: '#140a04', align: 'center', alpha: a });
      if (t.sub) ui.text(t.sub, t.x, t.y + dy + 14, { font: 'small', color: '#fff2c8', outline: '#140a04', align: 'center', alpha: a });
    }
  }

  private tipLines(it: ItemInst) {
    const d = getItem(it.id), lv = it.level ?? 1;
    const out: { text: string; color?: string; font?: 'body' | 'small' | 'title'; gap?: number }[] = [
      { text: d.name + (lv > 1 ? ` +${lv - 1}` : ''), font: 'title', color: RARITY_COLOR[d.rarity] },
      { text: `${d.rarity} ${d.kind}`.toUpperCase(), font: 'small', color: '#9aa4b8', gap: 1 },
    ];
    const cap = stackCap(it.id);
    out.push({ text: `${d.shape.length} cell${d.shape.length > 1 ? 's' : ''}` + (cap > 1 ? `  ·  stack ${it.n ?? 1}/${cap}` : ''), font: 'small', color: cap > 1 ? '#ffd860' : '#9aa4b8' });
    for (const l of statLines(it.id, lv)) out.push({ text: l.text, font: 'small', color: l.key === 'note' ? '#8ae8ff' : l.good ? '#8af07a' : '#ff8a7a' });
    out.push({ text: d.desc, font: 'small', color: '#d8d0c0', gap: 2 });
    return out;
  }

  private drawCard(slide: number) {
    const ui = this.ui, L = this.L, run = this.run!;
    const it = this.held ?? this.hover;
    const x = L.infoX, y = L.infoY + slide, w = L.infoW;
    if (it) {
      const h = this.cardBody(it, x, y, w, false);
      ui.panel('dark', x, y, w, h);
      this.cardBody(it, x, y, w, true);
      return;
    }
    // nothing hovered: the build
    const sets = setBonuses(run).slice(0, 6);
    const h = 26 + Math.max(1, sets.length) * 24;
    ui.panel('dark', x, y, w, h, 'BUILD');
    let yy = y + 22;
    if (!sets.length) ui.textBox('Pack tagged gear (mage, warrior, toymaker...) to unlock set bonuses at 2, 4 and 6.', x + 7, yy, w - 14, { font: 'small', color: '#a8b0c8' });
    for (const s of sets) {
      ui.fill(x + 7, yy + 1, 6, 6, s.color);
      ui.text(s.name.toUpperCase(), x + 17, yy, { font: 'small', color: s.tier ? s.color : '#c8c8d0' });
      for (let i = 0; i < 6; i++) ui.fill(x + w - 46 + i * 6, yy + 1, 5, 5, i < s.count ? s.color : '#2a3040');
      const act = [...s.tiers].reverse().find((t) => t.active);
      const nxt = s.tiers.find((t) => !t.active);
      ui.text(act ? act.text : nxt ? `${s.count}/${nxt.n}: ${nxt.text}` : '', x + 17, yy + 10, { font: 'small', color: act ? '#e8e8f0' : '#7a8498' });
      yy += 24;
    }
  }

  /** the item card; draw=false only measures. Returns its height */
  private cardBody(it: ItemInst, x: number, y: number, w: number, draw: boolean): number {
    const ui = this.ui;
    const d = getItem(it.id), lv = it.level ?? 1;
    const lines = this.tipLines(it);
    const tw = w - 12, bw = 34;
    const tb = (str: string, tx: number, ty: number, ww: number, o: { font: 'body' | 'small' | 'title'; color?: string }) => (draw ? ui.textBox(str, tx, ty, ww, o) : ui.textBox(str, -9999, -9999, ww, o));
    if (draw) {
      ui.fill(x + 6, y + 6, bw, bw, '#06080e', 0.8);
      ui.rect(x + 6, y + 6, bw, bw, RARITY_COLOR[d.rarity]);
      ui.item(it.id, x + 7, y + 7, 32, 32, lv);
    }
    const nh = tb(lines[0].text, x + bw + 12, y + 7, w - bw - 18, { font: 'title', color: lines[0].color });
    tb(lines[1].text, x + bw + 12, y + 9 + nh, w - bw - 18, { font: 'small', color: '#9aa4b8' });
    let yy = y + Math.max(46, 12 + nh + 12);
    for (const l of lines.slice(2)) { yy += l.gap ?? 0; yy += tb(l.text, x + 6, yy, tw, { font: l.font ?? 'small', color: l.color }) + 1; }
    const tags = (d.tags ?? []).filter((t) => t !== 'gem' && t !== 'metal');
    if (tags.length) {
      let tx = x + 6; yy += 3;
      for (const t of tags) {
        const tw2 = ui.measure(t.toUpperCase(), 'small') + 8;
        if (tx + tw2 > x + w - 6) { tx = x + 6; yy += 13; }
        const col = SET_COL[t] ?? '#8a94a8';
        if (draw) { ui.fill(tx, yy, tw2, 11, col, 0.25); ui.rect(tx, yy, tw2, 11, col); ui.text(t.toUpperCase(), tx + 4, yy + 2, { font: 'small', color: '#ffffff', shadow: null }); }
        tx += tw2 + 3;
      }
      yy += 14;
    }
    const recipes = recipesWith(it.id).slice(0, 3);
    if (recipes.length) {
      yy += 2;
      if (draw) ui.text('FUSES WITH', x + 6, yy, { font: 'small', color: '#ffd860' });
      yy += 11;
      for (const r of recipes) {
        const other = r.a === it.id ? r.b : r.a;
        if (draw) {
          ui.item(other, x + 6, yy - 2, 16, 16);
          ui.text('>', x + 25, yy + 2, { font: 'small', color: '#9aa4b8' });
          ui.item(r.out, x + 33, yy - 2, 16, 16);
          let name = getItem(r.out).name;
          while (name.length > 3 && ui.measure(name, 'small') > w - 60) name = name.slice(0, -2) + '…';
          ui.text(name, x + 52, yy + 2, { font: 'small', color: '#e8dcc4' });
        }
        yy += 17;
      }
    }
    return yy - y + 4;
  }

  private drawHints() {
    const ui = this.ui, L = this.L;
    let x = L.packX + 8, y = Math.min(ui.h - 16, L.packY + GRID * C + PACK_IN.y + 30);
    x += ui.hint('LMB', 'drag', x, y);
    x += ui.hint('R', 'turn', x, y);
    x += ui.hint('RMB', 'turn', x, y);
    x += ui.hint('TAB', 'close', x, y);
  }

  // ---------------------------------------------------------------- interaction
  private visOf(it: ItemInst): Vis {
    let v = this.vis.get(it.uid);
    if (!v) { const [x, y] = this.targetOf(it); v = { x, y, vx: 0, vy: 0, lift: 0, pop: 1, shake: 0 }; this.vis.set(it.uid, v); }
    return v;
  }
  private spring(v: Vis, tx: number, ty: number, dt: number) {
    const k = 260, damp = 24;
    v.vx += ((tx - v.x) * k - v.vx * damp) * dt; v.vy += ((ty - v.y) * k - v.vy * damp) * dt;
    v.x += v.vx * dt; v.y += v.vy * dt;
    if (Math.abs(tx - v.x) < 0.3 && Math.abs(v.vx) < 2) { v.x = tx; v.vx = 0; }
    if (Math.abs(ty - v.y) < 0.3 && Math.abs(v.vy) < 2) { v.y = ty; v.vy = 0; }
  }

  /** the item under a UI point */
  private itemAt(mx: number, my: number, skip?: ItemInst): ItemInst | null {
    const L = this.L, run = this.run!;
    const gx = Math.floor((mx - L.gridX) / C), gy = Math.floor((my - L.gridY) / C);
    for (const it of run.items) {
      if (it === skip || !ITEMS[it.id]) continue;
      const cells = rotCells(getItem(it.id).shape, it.rot);
      if (it.gx >= 0) { if (cells.some(([x, y]) => it.gx + x === gx && it.gy + y === gy)) return it; }
      else {
        const s = this.slot.get(it.uid); if (!s) continue;
        const bx = Math.floor((mx - L.boardX - 8) / C), by = Math.floor((my - L.boardY - 8) / C);
        if (cells.some(([x, y]) => s.bx + x === bx && s.by + y === by)) return it;
      }
    }
    return null;
  }

  private interact() {
    const ui = this.ui, run = this.run!, L = this.L, inp = this.game.input;
    if (this.closing) return;
    const overClose = ui.hover(L.closeX, L.closeY, 14, 15);
    this.hover = this.held || overClose ? null : this.itemAt(ui.mx, ui.my);
    if (this.hover || this.held) ui.cursor = this.held ? 'grab' : 'point';
    const rotate = inp.keyHit('KeyR') || ui.rpressed;
    if (!this.held) {
      if (this.hover && ui.pressed && !overClose) this.pickUp(this.hover);
      else if (this.hover && rotate) this.rotateInPlace(this.hover);
      return;
    }
    const it = this.held;
    if (rotate) {
      // turn about the grabbed point
      const ic = rotIcon(it.id, it.level ?? 1, it.rot);
      const ox = this.grab.x, oy = this.grab.y;
      it.rot = (it.rot + 1) % 4;
      this.grab = { x: ic.height - oy, y: ox };
      const v = this.visOf(it); v.x = ui.mx - this.grab.x; v.y = ui.my - this.grab.y; v.pop = 1;
      sfx(['k_tick4', 'cloth1'], { vol: 0.4, rate: 1.2 });
    }
    this.plan = this.planFor(it);
    if (!ui.down) this.dropHeld(false);
  }

  private pickUp(it: ItemInst) {
    const v = this.visOf(it);
    this.held = it;
    this.heldFrom = { gx: it.gx, gy: it.gy, rot: it.rot, slot: it.gx < 0 ? this.slot.get(it.uid) : undefined };
    this.grab = { x: Math.max(2, Math.min(rotIcon(it.id, it.level ?? 1, it.rot).width - 2, this.ui.mx - v.x)), y: Math.max(2, this.ui.my - v.y) };
    v.pop = 1;
    sfx(['k_pick1', 'cloth1', 'k_tick1'], { vol: 0.45 });
  }

  private planFor(it: ItemInst): Plan {
    const ui = this.ui, L = this.L, run = this.run!;
    // over another item: stack or fuse
    const tgt = this.itemAt(ui.mx, ui.my, it);
    if (tgt) {
      if (tgt.id === it.id && stackCap(it.id) > 1) {
        const room = stackCap(it.id) - (tgt.n ?? 1);
        if (room > 0) return { kind: 'stack', target: tgt, k: Math.min(room, it.n ?? 1) };
      }
      const m = mergeResult(tgt, it);
      if (m) return { kind: 'fuse', target: tgt, id: m.id, level: m.level };
    }
    const tlx = ui.mx - this.grab.x, tly = ui.my - this.grab.y;
    const cells = rotCells(getItem(it.id).shape, it.rot);
    const gx = Math.round((tlx - L.gridX) / C), gy = Math.round((tly - L.gridY) / C);
    const inGrid = ui.mx >= L.gridX - C / 2 && ui.my >= L.gridY - C / 2 && ui.mx < L.gridX + GRID * C + C / 2 && ui.my < L.gridY + GRID * C + C / 2;
    if (inGrid) return { kind: 'grid', gx, gy, ok: fits(run.items, it, gx, gy, it.rot), cells: cells.map(([x, y]) => [gx + x, gy + y]) };
    const inBoard = ui.mx >= L.boardX && ui.my >= L.boardY && ui.mx < L.boardX + L.boardW && ui.my < L.boardY + L.boardH + C;
    if (inBoard) {
      const bx = Math.round((tlx - L.boardX - 8) / C), by = Math.round((tly - L.boardY - 8) / C);
      return { kind: 'board', bx, by, ok: this.boardFits(it, bx, by, it.rot) };
    }
    return { kind: 'none' };
  }

  private dropHeld(forced: boolean) {
    const it = this.held!, from = this.heldFrom!, p = forced ? { kind: 'none' as const } : this.plan, run = this.run!;
    this.held = null; this.plan = { kind: 'none' };
    const v = this.visOf(it);
    if (p.kind === 'stack') {
      const moved = stackOnto(p.target, it);
      if (moved > 0) {
        this.burst(p.target, '#ffe070', 8);
        sfx(['coin1', 'k_drop2', 'pickup1'], { vol: 0.5 });
        this.visOf(p.target).pop = 0.6;
        if ((it.n ?? 1) <= 0) { run.removeItem(it.uid); this.vis.delete(it.uid); this.slot.delete(it.uid); return; }
      }
      this.returnHome(it, from);
      return;
    }
    if (p.kind === 'fuse') { this.fuse(p.target, it); return; }
    if (p.kind === 'grid' && p.ok) {
      it.gx = p.gx; it.gy = p.gy; this.slot.delete(it.uid);
      v.vy = 60;
      sfx(['k_drop2', 'k_drop3', 'cloth1'], { vol: 0.55 });
      return;
    }
    if (p.kind === 'grid' && !p.ok) { sfx(['k_err1', 'k_err2'], { vol: 0.35 }); v.shake = 1; }
    if (p.kind === 'board') {
      it.gx = -1; it.gy = -1;
      if (p.ok) this.slot.set(it.uid, { bx: p.bx, by: p.by });
      else { this.slot.delete(it.uid); this.slot.set(it.uid, this.freeBoardSlot(it) ?? { bx: 0, by: this.L.bRows }); }
      sfx(['sand_step1', 'k_drop2'], { vol: 0.45 });
      return;
    }
    this.returnHome(it, from);
  }

  private returnHome(it: ItemInst, from: NonNullable<BackpackScreen['heldFrom']>) {
    const run = this.run!;
    it.rot = from.rot;
    if (from.gx >= 0 && fits(run.items, it, from.gx, from.gy, from.rot)) { it.gx = from.gx; it.gy = from.gy; return; }
    it.gx = -1; it.gy = -1;
    if (from.slot && this.boardFits(it, from.slot.bx, from.slot.by, it.rot)) this.slot.set(it.uid, from.slot);
    else this.slot.set(it.uid, this.freeBoardSlot(it) ?? { bx: 0, by: this.L.bRows });
  }

  private rotateInPlace(it: ItemInst) {
    const run = this.run!, nr = (it.rot + 1) % 4;
    const v = this.visOf(it);
    if (it.gx >= 0) {
      if (fits(run.items, it, it.gx, it.gy, nr)) it.rot = nr;
      else {
        const sp = findSpot(run.items, it, { gx: it.gx, gy: it.gy, rot: nr });
        if (sp && sp.rot === nr && Math.hypot(sp.gx - it.gx, sp.gy - it.gy) <= 1.5) { it.gx = sp.gx; it.gy = sp.gy; it.rot = nr; }
        else { v.shake = 1; sfx(['k_err1'], { vol: 0.3 }); return; }
      }
    } else {
      const s = this.slot.get(it.uid);
      if (s && this.boardFits(it, s.bx, s.by, nr)) it.rot = nr;
      else { const old = it.rot; it.rot = nr; const sp = this.freeBoardSlot(it); if (sp) this.slot.set(it.uid, sp); else { it.rot = old; v.shake = 1; return; } }
    }
    v.pop = 0.5;
    sfx(['k_tick4', 'cloth1'], { vol: 0.4, rate: 1.1 });
  }

  private fuse(target: ItemInst, it: ItemInst) {
    const run = this.run!;
    const res = mergeResult(target, it);
    if (!res) { this.returnHome(it, this.heldFrom!); return; }
    const place = { gx: target.gx, gy: target.gy, rot: target.rot, slot: this.slot.get(target.uid) };
    const [cx, cy] = this.targetOf(target);
    for (const x of [target, it]) { run.removeItem(x.uid); this.vis.delete(x.uid); this.slot.delete(x.uid); }
    const out = run.addItem(res.id);
    out.level = res.level; out.rot = place.rot;
    if (place.gx >= 0) {
      const sp = findSpot(run.items, out, { gx: place.gx, gy: place.gy, rot: place.rot });
      if (sp && Math.hypot(sp.gx - place.gx, sp.gy - place.gy) <= 1.5) { out.gx = sp.gx; out.gy = sp.gy; out.rot = sp.rot; }
      else out.gx = -1;
    }
    if (out.gx < 0) this.slot.set(out.uid, place.slot && this.boardFits(out, place.slot.bx, place.slot.by, out.rot) ? place.slot : this.freeBoardSlot(out) ?? { bx: 0, by: this.L.bRows });
    const v = this.visOf(out); v.x = cx; v.y = cy; v.pop = 0;
    this.burst(out, '#ffe8a0', 22); this.burst(out, '#c8a0ff', 12);
    const d = getItem(res.id);
    const isLevel = res.id === it.id && res.id === target.id;
    const [tx, ty] = this.targetOf(out);
    this.toasts.push({ text: isLevel ? `LEVEL ${res.level}` : 'FUSED!', sub: d.name, x: tx + 16, y: ty - 18, t: 0, col: isLevel ? '#ffe070' : '#d8b0ff' });
    this.game.flash?.('#fff2c8', 0.12);
    sfx(['magic1', 'magic2', 'powerup1'], { vol: 0.7 });
    sfx(['pickup_sparkle1', 'shimmer1'], { vol: 0.45, delay: 0.08 });
  }

  private burst(it: ItemInst, col: string, n: number) {
    const [x, y] = this.targetOf(it);
    const { w, h } = shapeSize(rotCells(getItem(it.id).shape, it.rot));
    const cx = x + (w * C) / 2, cy = y + (h * C) / 2;
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 90; this.sparks.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, t: 0, life: 0.5 + Math.random() * 0.5, col }); }
  }
}

const SET_COL: Record<string, string> = {
  mage: '#a88aff', warrior: '#ff8a5a', summoner: '#ffc04a', tinkerer: '#5ac8ff', rogue: '#7ae07a',
  fire: '#ff6a3a', frost: '#8ae8ff', shock: '#ffe04a', poison: '#8af04a', water: '#4a9aff',
};
export type { ItemDef };
