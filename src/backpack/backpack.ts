// The backpack screen (v5, "the diver's kit"): the bag as a real object over the dimmed, frozen world (the screen
// beneath keeps rendering its last frame):
//
//   game.openModal('backpack', { run, onClose })        (closing calls installItemSystem(run), then onClose)
//
//   the bag       a stitched leather satchel, flap thrown back with its buckled straps and a brass name plate; its
//                 8 x 6 oilcloth pockets hold the packed items (only those count), each a lit 3D miniature with a
//                 hairline in its rarity colour around its footprint and a paper tag on stacks
//   the seabed    a compact sand tray under the bag: loose finds (run.items with gx < 0). Whatever is left there when
//                 the bag closes is dropped back into the water by the run screen (the tray says so)
//   the card      the hovered / held item up close: a big turning model in a brass display window, its name in its
//                 rarity colour, kind / footprint / stack, stats, flavour, set chips with progress and what it fuses
//                 with. With nothing hovered: what the packed gear adds up to (hearts, crit, skills ...)
//   the sets      every set bonus in play: pips to the next tier, the active bonus; the hovered item's sets light up
//
// Drag (LMB) to move; R or RMB rotates the held / hovered item; pockets light green where it fits, red where it
// doesn't, gold over a stack it tops up or a partner it fuses with. Tab / Esc / the big X closes.
// Test hooks (CSS px): bp.cellPoint(gx, gy), bp.trayPoint(bx, by), bp.itemPoint(uid), bp.closePoint()
import * as THREE from 'three';
import type { TouchSpec } from '../ui/touch';
import type { Game, Screen } from '../game/game';
import type { Run, ItemInst } from '../game/run';
import {
  getItem, installItemSystem, fits, findSpot, mergeResult, rotCells, shapeSize, GRID_W, GRID_H, GRID_CELLS, packCells, ITEMS,
  setBonuses, setCounts, stackCap, stackOnto, SETS, SET_ORDER, type ItemDef, type SetState,
} from '../game/items';
import { PixelUI } from '../ui/pixel/ui';
import { UiStage, contactShadow } from '../ui/obj/stage';
import { itemModel } from './models';
import { audio } from '../audio/audio';
import { easeOutBack } from '../core/math';
import { modelWindow, itemHead, itemBody, buildLines, setRow, footprint } from '../hideout/itemCard';
import { C as KC, skin, RARITY_UI, soft, sectionHead, tag } from '../ui/pixel/skins';

export interface BackpackEnter { run: Run; onClose?: () => void }

/** UI px per pocket (chosen per frame from the canvas size: 24 .. 64) and per seabed slot (about 3/4 of it: the
 *  seabed is further down, its finds look smaller) */
let C = 36, T = 26;

function sfx(ids: string | string[], o: { vol?: number; rate?: number; delay?: number } = {}) {
  for (const id of Array.isArray(ids) ? ids : [ids]) if (audio.has(id)) { audio.play(id, { vol: o.vol ?? 0.6, rate: o.rate, delay: o.delay, dry: true, jitter: 0.06 }); return; }
}

// ------------------------------------------------------------------ cached art
const artCache = new Map<string, HTMLCanvasElement>();
function cached(key: string, f: () => HTMLCanvasElement) { let c = artCache.get(key); if (!c) { c = f(); artCache.set(key, c); if (artCache.size > 200) artCache.clear(); } return c; }
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); const x = c.getContext('2d')!; x.imageSmoothingEnabled = false; return [c, x]; }

// the kit (v8b deep ink, src/ui/pixel/skins.ts): the bag is the kit's main panel round a grid of pocket slots; the
// seabed is a recessed well with faint slot ticks. Flat fills and 1 px lines only.
const LN = { occ: '#172031' };

/** bag frame insets around the grid: side border, the title band + top border, the bottom border, outer margin */
const SIDE = 8, TOP = 26, BOT = 9, EXT = 4;

/** the bag for an nw x nh grid of c px cells; the grid's top-left is at (EXT + SIDE, TOP) */
function packArt(nw: number, nh: number, c: number): HTMLCanvasElement {
  return cached(`pack|${nw}x${nh}|${c}`, () => {
    const gw = nw * c, gh = nh * c, bw = gw + SIDE * 2, H = TOP + gh + BOT;
    const W = bw + EXT * 2;
    const [cv, x] = canvas(W, H + 1);
    const f = (px: number, py: number, w: number, h: number, col: string) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
    x.drawImage(skin('wood', bw, H - 7), EXT, 7);
    // the grid: a well, each pocket a slot with a 1 px border
    const gx0 = EXT + SIDE, gy0 = TOP;
    f(gx0 - 2, gy0 - 2, gw + 4, gh + 4, KC.line); f(gx0 - 1, gy0 - 1, gw + 2, gh + 2, '#0c121c');
    for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
      const X = gx0 + i * c, Y = gy0 + j * c;
      f(X + 1, Y + 1, c - 2, c - 2, '#1f2939'); f(X + 2, Y + 2, c - 4, c - 4, KC.well);
    }
    return cv;
  });
}

/** the seabed tray: a recessed well (the loose finds lie in it) */
function trayArt(w: number, h: number): HTMLCanvasElement { return skin('inset', w, h); }


// ------------------------------------------------------------------ the screen
interface Vis { x: number; y: number; vx: number; vy: number; lift: number; pop: number; shake: number; bump: number; cs: number }
type Plan =
  | { kind: 'grid'; gx: number; gy: number; ok: boolean; cells: [number, number][] }
  | { kind: 'board'; bx: number; by: number; ok: boolean }
  | { kind: 'stack'; target: ItemInst; k: number }
  | { kind: 'fuse'; target: ItemInst; id: string; level: number }
  | { kind: 'none' };

interface Layout {
  packX: number; packY: number; gridX: number; gridY: number;
  /** the tray box, its label row, and the origin of its cells */
  trayX: number; trayY: number; trayW: number; trayH: number; labY: number; boardX: number; boardY: number; bCols: number; bRows: number;
  colX: number; colY: number; colW: number; cardH: number; setsY: number; setsH: number; colBot: number;
  close: number; closeX: number; closeY: number; hintY: number; M: number;
}


export class BackpackScreen implements Screen {
  name = 'backpack';
  private bg = new THREE.Scene();
  private bgCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 10);
  /** the screen beneath (its scene keeps rendering, frozen) */
  private under: Screen | null = null;
  get scene(): THREE.Scene { return this.under?.scene ?? this.bg; }
  get camera(): THREE.PerspectiveCamera { return this.under?.camera ?? this.bgCam; }
  get underwater() { return this.under?.underwater ?? false; }
  /** art under the miniatures: the dim, the bag, the tray, the card frames, drag footprints */
  ui = new PixelUI();
  /** the item miniatures (lit 3D models) between the art and the words */
  stage = new UiStage();
  /** words, stack tags, hints, the close X, the cursor: over the models */
  fg = new PixelUI();
  overlays = [this.ui.layer, this.stage.layer, this.fg.layer];
  private models = new Map<number, { o: THREE.Object3D; sh: THREE.Mesh; key: string }>();

  private run: Run | null = null;
  private onClose?: () => void;
  private t = 0;
  private open = 0;            // 0..1 open animation
  private closing = false;
  private vis = new Map<number, Vis>();
  /** board slot of each loose item (top-left cell on the seabed grid) */
  private slot = new Map<number, { bx: number; by: number }>();
  private held: ItemInst | null = null;
  /** v8 touch: ROTATE while something is held (the R key's job) */
  touch(): TouchSpec | null { return this.held ? { buttons: { rotate: true } } : null; }
  private heldFrom: { gx: number; gy: number; rot: number; slot?: { bx: number; by: number } } | null = null;
  private grab = { x: 0, y: 0 };
  private plan: Plan = { kind: 'none' };
  private hover: ItemInst | null = null;
  /** the item the card shows (lingers a moment after the mouse leaves an item, so the card doesn't flicker) */
  private shown: { it: ItemInst; t: number } | null = null;
  private sparks: { x: number; y: number; vx: number; vy: number; t: number; life: number; col: string; g?: number }[] = [];
  private toasts: { text: string; sub: string; x: number; y: number; t: number; col: string }[] = [];
  private L!: Layout;
  private prevCursor: Game['cursor'] | null = null;
  private overClose = false;
  private cardItem: { uid: number; key: string; o: THREE.Object3D; sh: THREE.Mesh } | null = null;
  private cardPop = 0;
  /** bubble splashes (pick up, drop, fuse, presses) */
  /** rows the seabed tray keeps room for (the tallest thing that might be dropped on it) */
  private reserve = 2;

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
    this.held = null; this.hover = null; this.shown = null; this.plan = { kind: 'none' };
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
    this.reserve = this.trayReserve();
    this.layout();
    this.layoutBoard();
    let k = 0;
    for (const it of this.run.items) { if (!ITEMS[it.id]) continue; const [tx, ty] = this.targetOf(it); this.vis.set(it.uid, { x: tx, y: ty - 14 - (k % 5) * 4, vx: 0, vy: 0, lift: 0, pop: -0.035 * k++, shake: 0, bump: 0, cs: this.cellOf(it) }); }
    sfx(['bag_zip1', 'cloth1'], { vol: 0.5 });
  }
  exit() {
    this.under = null; if (this.prevCursor !== null) this.game.cursor = this.prevCursor; this.prevCursor = null;
    this.cardItem?.o.removeFromParent(); this.cardItem?.sh.removeFromParent(); this.cardItem = null;
  }
  resize(w: number, h: number) { this.ui.resize(w, h, this.game.renderer.getPixelRatio()); this.fg.resize(w, h, this.game.renderer.getPixelRatio()); this.bgCam.aspect = w / h; this.bgCam.updateProjectionMatrix(); }

  close() {
    if (this.closing || !this.run) return;
    if (this.held) this.dropHeld(true);
    this.closing = true;
    sfx(['k_close1', 'bag_zip1'], { vol: 0.5 });
  }

  // ---------------------------------------------------------------- layout
  /** the tray keeps room for 2 rows, or for the tallest item in the run (a 3 x 3 clam can't lie in 2 rows) */
  private trayReserve() {
    let r = 2;
    for (const it of this.run?.items ?? []) { if (!ITEMS[it.id]) continue; const f = footprint(it.id); r = Math.max(r, Math.min(4, Math.min(f.w, f.h))); }
    return r;
  }
  private layout() {
    const ui = this.ui;
    const M = ui.h >= 400 ? 12 : 8, G = ui.h >= 400 ? 12 : 10;
    const labH = ui.lh('body') + 3, TP = 8, colMin = 250;
    C = 24; T = 18;
    for (const c of [64, 60, 56, 52, 48, 44, 40, 38, 36, 34, 32, 30, 28, 26]) {
      const t = Math.max(16, Math.min(c, Math.round(c * 0.72)));
      const w = M + EXT * 2 + SIDE * 2 + GRID_W * c + G + colMin + M;
      const h = M + TOP + GRID_H * c + BOT + 8 + labH + TP * 2 + this.reserve * t + M;
      if (w <= ui.w && h <= ui.h) { C = c; T = t; break; }
    }
    const bagW = GRID_W * C + SIDE * 2 + EXT * 2, bagH = TOP + GRID_H * C + BOT;
    const trayW = GRID_W * C + SIDE * 2, trayH = TP * 2 + this.reserve * T;
    const colW = Math.max(colMin, Math.min(380, ui.w - M * 2 - bagW - G));
    const totalW = bagW + G + colW, totalH = bagH + 8 + labH + trayH;
    const x0 = Math.max(M, Math.round((ui.w - totalW) / 2)), y0 = Math.max(M, Math.round((ui.h - totalH) / 2));
    const bCols = Math.floor((trayW - TP * 2) / T);
    const labY = y0 + bagH + 8, trayY = labY + labH;
    const close = 15;
    const colX = x0 + bagW + G, colY = y0 + 4, colBot = trayY + trayH;
    const hintH = ui.lh('small') + 8, hintY = colBot - hintH + 4;
    const cardH = Math.round((hintY - 6 - colY) * 0.62);
    const setsY = colY + cardH + 6;
    this.L = {
      packX: x0, packY: y0, gridX: x0 + EXT + SIDE, gridY: y0 + TOP,
      trayX: x0 + EXT, trayY, trayW, trayH, labY, boardX: x0 + EXT + Math.round((trayW - bCols * T) / 2), boardY: trayY + TP, bCols, bRows: this.reserve,
      colX, colY, colW, cardH, setsY, setsH: hintY - 6 - setsY, colBot,
      close, closeX: colX + colW - 24, closeY: colY + 8, hintY, M,
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
      const { h } = shapeSize(rotCells(getItem(it.id).shape, it.rot));
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
  /** where an item rests (top-left of its rotated footprint, UI px) */
  private targetOf(it: ItemInst): [number, number] {
    const L = this.L;
    if (it.gx >= 0) return [L.gridX + it.gx * C, L.gridY + it.gy * C];
    const s = this.slot.get(it.uid) ?? { bx: 0, by: 0 };
    return [L.boardX + s.bx * T, L.boardY + s.by * T];
  }
  /** px per cell where the item is: a pocket, a seabed slot, or (held) a pocket */
  private cellOf(it: ItemInst) { return it === this.held || it.gx >= 0 ? C : T; }
  /** the rotated footprint in px at a cell size */
  private footOf(it: ItemInst, cell = this.cellOf(it)) { const { w, h } = shapeSize(rotCells(getItem(it.id).shape, it.rot)); return { w: w * cell, h: h * cell }; }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    const run = this.run;
    const ui = this.ui, fg = this.fg;
    this.t += dt;
    ui.drawCursor = false;
    ui.begin(this.game.input, dt);
    fg.drawCursor = true;
    fg.begin(this.game.input, dt);
    this.stage.follow(ui);
    if (!run) { ui.end(); fg.end(); return; }
    this.layout();
    this.open = this.closing ? Math.max(0, this.open - dt * 6) : Math.min(1, this.open + dt * 4.2);
    if (this.closing && this.open <= 0) {
      ui.end(); fg.end();
      for (const m of this.models.values()) { m.o.removeFromParent(); m.sh.removeFromParent(); }
      this.models.clear();
      this.cardItem?.o.removeFromParent(); this.cardItem?.sh.removeFromParent(); this.cardItem = null;
      this.closing = false;
      installItemSystem(run);
      const cb = this.onClose; this.run = null;
      if (cb) cb(); else this.game.closeModal();
      return;
    }
    // the kit's calm open: the bag rises 6 px as it fades in, the card column follows a beat later
    const ease = (k: number) => 1 - (1 - Math.max(0, Math.min(1, k))) ** 3;
    const kb = this.closing ? 1 - (1 - this.open) ** 2 : ease(this.open);
    const kc = this.closing ? kb : ease(this.open * 1.25 - 0.25);
    const slide = Math.round((1 - kb) * 6), cslide = Math.round((1 - kc) * 8);
    // dim the frozen world, darker toward the edges
    const fade = Math.min(1, this.open * 1.6);
    ui.fill(0, 0, ui.w, ui.h, KC.ink, 0.72 * fade);
    ui.block(0, 0, ui.w, ui.h);
    this.drawPack(slide);
    this.drawTray(slide);
    this.interact();
    this.drawFootprints(slide);
    this.drawItems(dt, slide);
    this.drawPreview(slide);
    this.drawHeld(dt);
    this.drawCard(dt, cslide);
    this.drawSets(cslide);
    this.drawHints(cslide);
    this.drawPlanLabel();
    this.drawFx(dt);
    this.syncModels();
    if (fg.closeButton('bp:close', this.L.closeX + cslide, this.L.closeY, { size: this.L.close, key: null })) this.close();
    fg.cursor = this.overClose ? 'point' : ui.cursor;
    ui.end();
    fg.end();
    const inp = this.game.input;
    if (inp.keyHit('Tab') || inp.keyHit('Escape')) this.close();
  }

  // ---------------------------------------------------------------- drawing
  private drawPack(slide: number) {
    const ui = this.ui, fg = this.fg, L = this.L, run = this.run!;
    const art = { width: GRID_W * C + SIDE * 2 + EXT * 2, height: TOP + GRID_H * C + BOT };
    const x = L.packX, y = L.packY + slide;
    // a soft drop shadow, then the bag
    ui.fill(x + EXT + 3, y + 12, art.width - EXT * 2, art.height - 7, '#000000', 0.14);
    ui.fill(x + EXT + 1, y + 9, art.width - EXT * 2, art.height - 7, '#000000', 0.22);
    // the bag: a forged slab (ceramic in a pewter bezel, nacre studs) holding a well of recessed pockets
    ui.frame('wood', x + EXT, y + 7, art.width - EXT * 2, art.height - 7);
    ui.frame('inset', L.gridX - 3, L.gridY + slide - 3, GRID_W * C + 6, GRID_H * C + 6);
    for (let j = 0; j < GRID_H; j++) for (let i = 0; i < GRID_W; i++) ui.frame('slot', L.gridX + i * C + 1, L.gridY + j * C + 1 + slide, C - 2, C - 2);
    // the title set into the top border (the kit's legend), the capacity as a small tag at the right
    const used = packCells(run.items).used, full = used >= GRID_CELLS;
    const cap = `${fg.count('bp:used', used)}/${GRID_CELLS}`;
    const tw = Math.ceil(fg.measure('BACKPACK', 'title')), tcap = Math.round(fg.cap('title'));
    const lx = x + EXT + 22, ly = y + 7;
    const pw = tw + 30, ph = tcap + 12;
    fg.fill(lx - 15 + 1, ly - Math.round(ph / 2) + 4, pw, ph, '#000000', 0.3);
    fg.frame('plaque', lx - 15, ly - Math.round(ph / 2) + 1, pw, ph);
    fg.text('BACKPACK', lx, ly - Math.round(tcap / 2) + 1, { font: 'title', color: '#1d1a22', shadow: null });
    const capW = Math.ceil(fg.measure(cap, 'small')) + 8;
    tag(fg, cap, x + art.width - EXT - SIDE - capW, ly + 5, full ? 'red' : 'dim');
    // an empty bag says what it is for
    if (!run.items.some((i) => i.gx >= 0) && !this.held) {
      const msg = 'Drag your finds into the pockets', mw = fg.measure(msg, 'body') + 20, my = Math.round(y + TOP + (GRID_H * C) / 2 - fg.lh('body') / 2) - 3;
      ui.fill(L.gridX + (GRID_W * C - mw) / 2, my, mw, fg.lh('body') + 6, KC.navy, 0.92);
      fg.text(msg, L.gridX + (GRID_W * C) / 2, my + 4, { font: 'body', color: KC.dim, shadow: null, align: 'center' });
    }
  }

  private drawTray(slide: number) {
    const ui = this.ui, fg = this.fg, L = this.L, run = this.run!;
    const y = L.trayY + slide;
    ui.fill(L.trayX + 2, y + 3, L.trayW, L.trayH, '#000000', 0.22);
    ui.frame('inset', L.trayX, y, L.trayW, L.trayH);
    // the label row: ON THE SEABED, and what that means
    const loose = run.items.filter((i) => i.gx < 0 && ITEMS[i.id]).length;
    const ly = L.labY + slide;
    fg.text('ON THE SEABED', L.trayX + 2, ly + 1 + Math.max(0, fg.cap('body') - fg.cap('small')), { font: 'small', color: KC.gold, shadow: KC.ink });
    let note = loose ? `${loose} loose · left behind when you close the bag` : 'left behind when you close the bag';
    if (fg.measure('ON THE SEABED', 'body') + fg.measure(note, 'small') + 16 > L.trayW) note = loose ? `${loose} loose · left behind` : 'left behind on close';
    fg.text(note, L.trayX + L.trayW - 2, ly + 1 + Math.max(0, fg.cap('body') - fg.cap('small')), { font: 'small', color: loose ? KC.bone : KC.dim, shadow: KC.ink, align: 'right' });
    // faint corner ticks mark the slots
    for (let by = 0; by < L.bRows; by++) for (let bx = 0; bx < L.bCols; bx++) {
      const X = L.boardX + bx * T, Y = L.boardY + by * T + slide;
      ui.fill(X + 1, Y + 1, 3, 1, KC.line); ui.fill(X + 1, Y + 1, 1, 3, KC.line);
    }
    if (!loose && !(this.held && this.plan.kind === 'board')) {
      const cy = y + L.trayH / 2;
      fg.text('Nothing down here', L.trayX + L.trayW / 2, cy - fg.lh('body') + 1, { font: 'body', color: KC.dim, shadow: null, align: 'center' });
      fg.text('drag things out of the bag to leave them', L.trayX + L.trayW / 2, cy + 3, { font: 'small', color: KC.faint, shadow: null, align: 'center' });
    }
  }

  /** the rarity hairline around each packed item's footprint (and a lift glow under the hovered one) */
  private drawFootprints(slide: number) {
    const ui = this.ui, L = this.L, run = this.run!;
    for (const it of run.items) {
      if (it.gx < 0 || it === this.held || !ITEMS[it.id]) continue;
      const d = getItem(it.id), cells = rotCells(d.shape, it.rot), set = new Set(cells.map(([x, y]) => x + ',' + y));
      const hov = this.hover === it, target = (this.plan.kind === 'stack' || this.plan.kind === 'fuse') && this.plan.target === it;
      const col = target ? KC.gold : RARITY_UI[d.rarity];
      for (const [cx, cy] of cells) {
        const X = L.gridX + (it.gx + cx) * C, Y = L.gridY + (it.gy + cy) * C + slide;
        ui.fill(X + 3, Y + 3, C - 6, C - 6, LN.occ, 0.6);
        if (hov || target) ui.fill(X + 1, Y + 1, C - 2, C - 2, col, target ? 0.16 + 0.06 * Math.sin(this.t * 6) : 0.1);
        const a = hov || target ? 1 : 0.45, i = 2;
        if (!set.has(cx + ',' + (cy - 1))) ui.fill(X + i, Y + i, C - i * 2, 1, col, a);
        if (!set.has(cx + ',' + (cy + 1))) ui.fill(X + i, Y + C - i - 1, C - i * 2, 1, col, a);
        if (!set.has(cx - 1 + ',' + cy)) ui.fill(X + i, Y + i, 1, C - i * 2, col, a);
        if (!set.has(cx + 1 + ',' + cy)) ui.fill(X + C - i - 1, Y + i, 1, C - i * 2, col, a);
      }
    }
    // the free pocket under the mouse
    if (!this.held && !this.hover) {
      const gx = Math.floor((ui.mx - L.gridX) / C), gy = Math.floor((ui.my - L.gridY) / C);
      if (gx >= 0 && gy >= 0 && gx < GRID_W && gy < GRID_H) ui.rect(L.gridX + gx * C + 1, L.gridY + gy * C + 1 + slide, C - 2, C - 2, KC.line2);
    }
  }

  private drawItems(dt: number, slide: number) {
    const run = this.run!;
    const order = [...run.items].filter((i) => ITEMS[i.id] && i !== this.held).sort((a, b) => (a.gx >= 0 ? 0 : 1) - (b.gx >= 0 ? 0 : 1));
    for (const it of order) {
      const v = this.visOf(it);
      const [tx, ty] = this.targetOf(it);
      this.spring(v, tx, ty, dt);
      v.pop = Math.min(1, v.pop + dt * 4);
      const hov = this.hover === it && !this.held;
      v.lift += ((hov ? 4 : 0) - v.lift) * Math.min(1, dt * 18);
      v.shake = Math.max(0, v.shake - dt * 3);
      v.bump = Math.max(0, v.bump - dt * 3.2);
      v.cs += (this.cellOf(it) - v.cs) * Math.min(1, dt * 14);
      const sx = Math.sin(this.t * 60) * v.shake * 3;
      const a = Math.max(0, Math.min(1, v.pop * 1.6));
      const target = (this.plan.kind === 'stack' || this.plan.kind === 'fuse') && this.plan.target === it;
      this.placeModel(it, v.x + sx, v.y + slide, v.lift, a, hov ? 1 : target ? 0.6 : 0, false, Math.sin(v.bump * Math.PI) * 0.16, v.cs);
      const f = this.footOf(it, v.cs);
      this.stackBadge(it, Math.round(v.x), Math.round(v.y + slide - v.lift), f.w, f.h);
    }
  }

  /** put an item's miniature on the stage: (x, y) = the top-left of its rotated footprint in UI px */
  private placeModel(it: ItemInst, x: number, y: number, lift: number, alpha: number, hot: number, held: boolean, squash = 0, cell = C) {
    const key = `${it.id}|${it.level ?? 1}`;
    let m = this.models.get(it.uid);
    if (!m || m.key !== key) {
      if (m) { m.o.removeFromParent(); m.sh.removeFromParent(); }
      const o = itemModel(it.id);
      const fp = footprint(it.id);
      const sh = contactShadow(fp.w * 0.95, fp.h * 0.95, 0.5);
      m = { o, sh, key };
      this.models.set(it.uid, m);
    }
    m.o.userData.seen = this.t;
    const f = this.footOf(it, cell);
    const { fit, ox, oy } = this.fitOf(m.o, it);
    const cx = x + f.w / 2, cy = y + f.h / 2;
    // grows in on arrival; a squash-and-settle bump when dropped; never drawn bigger than its pockets
    const sc = cell * fit * (0.92 + hot * 0.06) * (held ? 1.1 : 1) * Math.max(0.01, alpha) * (1 + squash);
    m.o.scale.setScalar(sc);
    // lying in the pocket, tilted a touch toward the light; a slow sway when hovered / held
    const turn = hot > 0 || held ? Math.sin(this.t * 2.6) * 0.35 : 0;
    m.o.rotation.set(0.32 - lift * 0.03, -0.28 + turn, -it.rot * (Math.PI / 2));
    this.stage.put(m.o, cx - ox * sc, cy - lift + oy * sc, 20 + lift * 6 + (held ? 600 : 0));
    m.sh.rotation.z = -it.rot * (Math.PI / 2);
    m.sh.scale.setScalar(cell * (held ? 1.05 : 1));
    (m.sh.material as THREE.MeshBasicMaterial).opacity = (held ? 0.32 : it.gx >= 0 ? 0.5 : 0.36) * alpha;
    this.stage.put(m.sh, cx + 2 + lift * 1.2, cy + 3 + lift * 1.0, held ? 300 : -10);
  }

  /**
   * how much a miniature must shrink to stay inside its footprint as it lies in the pocket (tilted toward the light,
   * turned `rot` quarter turns), and the offset that centres what you see: some models (the giant clam's open
   * shells) stand up off the cloth and their tilted silhouette spills over the neighbouring pockets otherwise.
   * Measured once per model and turn.
   */
  private fitOf(o: THREE.Object3D, it: ItemInst): { fit: number; ox: number; oy: number } {
    const cache = (o.userData.fits ??= {}) as Record<number, { fit: number; ox: number; oy: number }>;
    const hit = cache[it.rot];
    if (hit) return hit;
    const parent = o.parent, pos = o.position.clone(), rot = o.rotation.clone(), scl = o.scale.clone();
    o.removeFromParent();
    o.position.set(0, 0, 0); o.scale.setScalar(1); o.rotation.set(0.32, -0.28, -it.rot * (Math.PI / 2));
    o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o);
    o.position.copy(pos); o.rotation.copy(rot); o.scale.copy(scl);
    if (parent) parent.add(o);
    const { w, h } = shapeSize(rotCells(getItem(it.id).shape, it.rot));
    const ex = Math.max(0.01, b.max.x - b.min.x), ey = Math.max(0.01, b.max.y - b.min.y);
    const fit = Math.min(1, (w * 1.02) / (ex * 0.92), (h * 1.02) / (ey * 0.92));
    const out = { fit, ox: (b.min.x + b.max.x) / 2, oy: (b.min.y + b.max.y) / 2 };
    cache[it.rot] = out;
    return out;
  }

  /** drop the miniatures of items that are gone */
  private syncModels() {
    for (const [uid, m] of this.models) if (m.o.userData.seen !== this.t || !this.run?.items.some((i) => i.uid === uid)) { m.o.removeFromParent(); m.sh.removeFromParent(); this.models.delete(uid); }
  }

  /** the stack count as a small flat tag in the item's corner (drawn over the miniature) */
  private stackBadge(it: ItemInst, px: number, py: number, w: number, h: number) {
    const cap = stackCap(it.id);
    const n = it.n ?? 1;
    if (cap <= 1 || n <= 1) return;
    const f = this.fg, full = n >= cap;
    const s = `x${n}`;
    const tw = Math.ceil(f.measure(s, 'small')), th = Math.round(f.cap('small')) + 5;
    const bx = px + w - tw - 9, by = py + h - th - 3;
    f.fill(bx, by, tw + 6, th, KC.navy); f.rect(bx, by, tw + 6, th, full ? KC.gold : KC.line2);
    f.text(s, bx + 3, by + 3, { font: 'small', color: full ? KC.gold : KC.bone, shadow: null });
  }

  /** the drag preview: the cells it would take (green fits, red doesn't), gold over a stack / fuse partner */
  private drawPreview(slide: number) {
    const ui = this.ui, L = this.L, p = this.plan;
    if (!this.held) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 9);
    if (p.kind === 'grid') {
      for (const [x, y] of p.cells) {
        if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
        const X = L.gridX + x * C, Y = L.gridY + y * C + slide;
        const col = p.ok ? KC.sage : KC.red;
        ui.fill(X + 2, Y + 2, C - 4, C - 4, col, 0.16 + 0.06 * pulse);
        ui.rect(X + 1, Y + 1, C - 2, C - 2, col);
        if (!p.ok) { const k = Math.round(C * 0.14); for (let i = -k; i <= k; i++) { ui.fill(X + C / 2 + i, Y + C / 2 + i, 1, 1, KC.red2); ui.fill(X + C / 2 + i, Y + C / 2 - i, 1, 1, KC.red2); } }
      }
    } else if (p.kind === 'board') {
      const it = this.held;
      for (const [x, y] of rotCells(getItem(it.id).shape, it.rot)) {
        const X = L.boardX + (p.bx + x) * T, Y = L.boardY + (p.by + y) * T + slide;
        ui.fill(X + 2, Y + 2, T - 4, T - 4, p.ok ? KC.bone : KC.red, 0.14);
        ui.rect(X + 1, Y + 1, T - 2, T - 2, p.ok ? KC.dim : KC.red);
      }
    }
  }

  private drawHeld(dt: number) {
    const ui = this.ui, it = this.held;
    if (!it) return;
    const v = this.visOf(it);
    const tx = ui.mx - this.grab.x, ty = ui.my - this.grab.y;
    const px0 = v.x;
    v.x += (tx - v.x) * Math.min(1, dt * 30); v.y += (ty - v.y) * Math.min(1, dt * 30);
    v.pop = Math.max(0, v.pop - dt * 6);
    v.cs = C;
    this.placeModel(it, v.x, v.y, 7, 1, 1, true);
    const m = this.models.get(it.uid);
    if (m) m.o.rotation.z += Math.max(-0.4, Math.min(0.4, (v.x - px0) * -0.03));
    const f = this.footOf(it);
    this.stackBadge(it, Math.round(v.x), Math.round(v.y - 7), f.w, f.h);
  }
  /** the STACK / FUSE label by the cursor (drawn last, over the card) */
  private drawPlanLabel() {
    const ui = this.ui, it = this.held, p = this.plan;
    if (!it) return;
    if (p.kind === 'stack' || p.kind === 'fuse') {
      const g = this.fg;
      const label = p.kind === 'stack' ? `STACK +${p.k}` : `FUSE INTO ${getItem(p.id).name.toUpperCase()}${p.id === it.id ? ` +${p.level - 1}` : ''}`;
      const lw = g.measure(label, 'body') + 14, lh = g.lh('body') + 6;
      const lx = Math.min(g.w - lw - 4, ui.mx + 14), ly = Math.max(4, ui.my - lh - 10);
      g.fill(lx, ly, lw, lh, KC.navy);
      g.rect(lx, ly, lw, lh, KC.gold);
      g.text(label, lx + 7, ly + 4, { font: 'body', color: KC.gold2, shadow: KC.ink });
    }
  }

  private drawFx(dt: number) {
    const ui = this.fg;
    for (const s of this.sparks) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += (s.g ?? 160) * dt; s.vx *= Math.exp(-dt * 2); }
    this.sparks = this.sparks.filter((s) => s.t < s.life);
    for (const s of this.sparks) { const a = 1 - s.t / s.life; ui.fill(Math.round(s.x), Math.round(s.y), 2, 2, s.col, a); }
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < 1.8);
    for (const t of this.toasts) {
      const a = Math.min(1, (1.8 - t.t) * 2), dy = Math.round(-t.t * 16);
      ui.text(t.text, t.x, t.y + dy, { font: 'title', color: t.col, shadow: KC.ink, align: 'center', alpha: a });
      if (t.sub) ui.text(t.sub, t.x, t.y + dy + ui.lh('title') + 1, { font: 'body', color: KC.bone, shadow: KC.ink, align: 'center', alpha: a });
    }
  }

  // ---- the card column
  private drawCard(dt: number, cs: number) {
    const ui = this.ui, fg = this.fg, L = this.L, run = this.run!;
    const x = L.colX + cs, y = L.colY, w = L.colW, h = L.cardH;
    // the item on show: held > hovered > the last one for a moment
    const live = this.held ?? this.hover;
    if (live) this.shown = { it: live, t: 0.3 };
    else if (this.shown) { this.shown.t -= dt; if (this.shown.t <= 0 || !run.items.includes(this.shown.it)) this.shown = null; }
    const it = this.shown?.it ?? null;
    ui.panel('wood', x, y, w, h, undefined, { id: 'bp:card' });
    const pad = 11;
    const ix = x + pad, iw = w - pad * 2;
    fg.clip(x + 6, y + 6, w - 12, h - 12);
    if (it) {
      this.cardPop = Math.min(1, this.cardPop + dt * 6);
      const d = getItem(it.id);
      const MW = Math.round(Math.max(56, Math.min(110, Math.min(w * 0.32, h * 0.5))));
      modelWindow(ui, ix, y + pad, MW, d.rarity, this.held ? 1 : 0);
      this.cardModel(it, ix + MW / 2, y + pad + MW / 2, MW);
      const hx = ix + MW + 8, hw = x + w - pad - hx - 16;
      const hh = itemHead(fg, it.id, hx, y + pad + 1, hw, { level: it.level ?? 1, n: it.n ?? 1 });
      // the rest flows beside the window, then under it at full width
      const yy = y + pad + 1 + hh + 4;
      fg.fill(hx, yy - 3, x + w - pad - hx, 1, KC.line2);
      itemBody(fg, it.id, ix, yy, iw, { level: it.level ?? 1, counts: setCounts(run.items), loose: it.gx < 0, maxFuse: 2, flow: { y: y + pad + MW + 3, x: hx, w: hw } });
    } else {
      this.hideCardModel();
      this.cardPop = 0;
      // nothing hovered: what the packed gear adds up to
      const used = packCells(run.items).used;
      let yy = y + pad;
      fg.text('YOUR BAG', ix, yy, { font: 'title', color: KC.gold2, shadow: KC.ink });
      const cnt = `${used}/${GRID_CELLS} pockets`;
      fg.text(cnt, x + w - pad - 22, yy + fg.cap('title') - fg.cap('small'), { font: 'small', color: used >= GRID_CELLS ? KC.red2 : KC.dim, shadow: null, align: 'right' });
      yy += fg.lh('title') + 2;
      // the pockets in use: a flat bar
      fg.bar(ix, yy, iw, 5, used / GRID_CELLS, used >= GRID_CELLS ? KC.red : KC.gold, KC.well, { id: 'bp:pockets' });
      yy += 5 + 10;
      const b = buildLines(run.items);
      const bottom = y + h - 8;
      if (!b.stats.length && !b.skills.length) {
        // an empty bag: how packing works, three steps with their keys
        yy += fg.textBox('Gear in the pockets changes your stats and deals you skills.', ix, yy, iw, { font: 'body', color: KC.bone, shadow: KC.ink }) + 8;
        const steps: [string, string][] = PixelUI.touch
          ? [['DRAG', 'finds into the pockets'], ['ROTATE', 'turns the thing you hold'], ['DRAG', 'a twin on a twin: they stack'], ['DRAG', 'a partner on it: they fuse']]
          : [['LMB', 'drag finds into the pockets'], ['R', 'turn things to make them fit'], ['LMB', 'drop a twin on a twin: they stack'], ['LMB', 'drop a partner on it: they fuse']];
        for (const [k, t] of steps) {
          if (yy + 16 > bottom) break;
          if (yy > y + pad + 40) fg.fill(ix, yy - 4, iw, 1, KC.line);
          const kw = fg.hint(k, '', ix + 2, yy);
          fg.text(t, ix + Math.max(34, kw + 4), yy + 1, { font: 'body', color: KC.bone, shadow: KC.ink });
          yy += 20;
        }
      } else {
        // the stat changes: rows of value + label, two columns when wide, a 1 px rule under each
        yy += statGrid(fg, b.stats, ix, yy, iw, bottom - yy - (b.skills.length ? 28 : 0)) + 6;
        if (b.skills.length && yy + 20 < bottom) {
          yy += sectionHead(fg, 'SKILLS', ix, yy, iw);
          fg.textBox(b.skills.join(' · '), ix, yy, iw, { font: 'body', color: KC.steel2, shadow: KC.ink });
        }
      }
    }
    fg.unclip();
  }

  /** the card's big turning model on its pedestal */
  private cardModel(it: ItemInst, cx: number, cy: number, s: number) {
    const key = `${it.uid}|${it.id}|${it.level ?? 1}`;
    if (!this.cardItem || this.cardItem.key !== key) {
      this.cardItem?.o.removeFromParent(); this.cardItem?.sh.removeFromParent();
      this.cardItem = { uid: it.uid, key, o: itemModel(it.id), sh: contactShadow(1, 0.35, 0.55) };
      this.cardPop = 0;
    }
    const { o, sh } = this.cardItem;
    const fp = footprint(it.id);
    const pop = easeOutBack(Math.min(1, this.cardPop), 2);
    o.scale.setScalar((s * 0.8 / Math.max(fp.w, fp.h, 1.3)) * Math.max(0.05, pop));
    // standing up to face you, swaying slowly so its shape reads (flat things never turn edge-on)
    o.rotation.set(0.42 + Math.sin(this.t * 0.8) * 0.08, Math.sin(this.t * 1.1) * 0.75, 0);
    o.visible = true; sh.visible = true;
    const bob = Math.sin(this.t * 2) * 1.2;
    this.stage.put(o, cx, cy - s * 0.06 + bob, 60);
    sh.scale.set(s * 0.6, s * 0.6, 1);
    this.stage.put(sh, cx, cy + s * 0.24, 40);
  }
  private hideCardModel() { if (this.cardItem) { this.cardItem.o.visible = false; this.cardItem.sh.visible = false; } }

  /** the set bonuses in play; the shown item's sets light up (and a loose item's would-be +1 blinks) */
  private drawSets(cs: number) {
    const ui = this.ui, fg = this.fg, L = this.L, run = this.run!;
    if (L.setsH < 30) return;
    const x = L.colX + cs, y = L.setsY, w = L.colW, h = L.setsH;
    ui.panel('wood', x, y, w, h, undefined, { id: 'bp:sets' });
    const pad = 11;
    let yy = y + pad - 1 + sectionHead(fg, 'SET BONUSES', x + pad, y + pad - 1, w - pad * 2 - (0)) + 2;
    const it = this.shown?.it ?? null;
    const tags = new Set((it ? getItem(it.id).tags ?? [] : []).filter((t) => SETS[t]));
    const sets: SetState[] = setBonuses(run);
    // a loose item's sets that aren't in play yet still get a row (at 0, the +1 blinking)
    for (const t of tags) if (!sets.some((q) => q.tag === t)) { const d = SETS[t]; sets.push({ tag: t, name: d.name, color: d.color, kind: d.kind, count: 0, tier: 0, next: d.tiers[0]?.n ?? null, tiers: d.tiers.map((q) => ({ ...q, active: false })) }); }
    sets.sort((a, b) => Number(tags.has(b.tag)) - Number(tags.has(a.tag)) || b.count - a.count);
    if (!sets.length) {
      // none in play: the sets there are, as chips in their colours
      yy += fg.textBox('Pack 2, 4 or 6 things that share a tag to switch its bonus on:', x + pad, yy, w - pad * 2, { font: 'small', color: KC.dim, shadow: null }) + 5;
      let cx = x + pad;
      const ch = fg.lh('small') + 3;
      for (const t of SET_ORDER) {
        const d = SETS[t]; if (!d) continue;
        const cw = fg.measure(d.name.toUpperCase(), 'small') + 16;
        if (cx + cw > x + w - pad) { cx = x + pad; yy += ch + 3; }
        if (yy + ch > y + h - 4) break;
        const sc = soft(d.color);
        fg.fill(cx, yy, cw, ch, KC.navy); fg.rect(cx, yy, cw, ch, sc);
        fg.fill(cx + 3, yy + Math.round(ch / 2) - 2, 4, 4, sc);
        fg.text(d.name.toUpperCase(), cx + 10, yy + 2, { font: 'small', color: sc, shadow: null });
        cx += cw + 4;
      }
      return;
    }
    fg.clip(x + 3, yy - 2, w - 6, y + h - yy - 1);
    let n = 0;
    for (const q of sets) {
      const rh = setRow(fg, q, x + pad, yy, w - pad * 2, { draw: false });
      if (yy + rh > y + h - 3) break;
      setRow(fg, q, x + pad, yy, w - pad * 2, { hot: tags.has(q.tag), plus: tags.has(q.tag) && !!it && it.gx < 0 });
      yy += rh + 2; n++;
    }
    fg.unclip();
    if (n < sets.length) fg.text(`+${sets.length - n} more`, x + w - pad, y + h - pad - 4, { font: 'small', color: KC.faint, shadow: null, align: 'right' });
  }

  /** keycaps along the bottom of the card column */
  private drawHints(cs: number) {
    const fg = this.fg, L = this.L;
    let x = L.colX + cs + 2;
    const y = L.hintY;
    // (a touch screen: drag with a finger, the ROTATE key turns, the close button closes)
    if (PixelUI.touch) { x += fg.hint('DRAG', 'move things', x, y); fg.hint('ROTATE', 'turn the held thing', x, y); return; }
    x += fg.hint('LMB', 'drag', x, y);
    x += fg.keycap('R', x, y) + 3;
    x += fg.hint('RMB', 'turn', x, y);
    fg.hint('TAB', 'close', x, y);
  }

  // ---------------------------------------------------------------- interaction
  private visOf(it: ItemInst): Vis {
    let v = this.vis.get(it.uid);
    if (!v) { const [x, y] = this.targetOf(it); v = { x, y, vx: 0, vy: 0, lift: 0, pop: 1, shake: 0, bump: 0, cs: this.cellOf(it) }; this.vis.set(it.uid, v); }
    return v;
  }
  private spring(v: Vis, tx: number, ty: number, dt: number) {
    const k = 260, damp = 22;
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
        const bx = Math.floor((mx - L.boardX) / T), by = Math.floor((my - L.boardY) / T);
        if (cells.some(([x, y]) => s.bx + x === bx && s.by + y === by)) return it;
      }
    }
    return null;
  }

  private interact() {
    const ui = this.ui, L = this.L, inp = this.game.input;
    if (this.closing) return;
    this.overClose = ui.hover(L.closeX - 2, L.closeY - 2, L.close + 4, L.close + 7);
    this.hover = this.held || this.overClose ? null : this.itemAt(ui.mx, ui.my);
    if (this.hover || this.held) ui.cursor = this.held ? 'grab' : 'point';
    const rotate = inp.keyHit('KeyR') || ui.rpressed;
    if (!this.held) {
      if (this.hover && ui.pressed && !this.overClose) this.pickUp(this.hover);
      else if (this.hover && rotate) this.rotateInPlace(this.hover);
      return;
    }
    const it = this.held;
    if (rotate) {
      // turn about the grabbed point (the footprint turns clockwise: its old height becomes its width)
      const f = this.footOf(it);
      const ox = this.grab.x, oy = this.grab.y;
      it.rot = (it.rot + 1) % 4;
      this.grab = { x: f.h - oy, y: ox };
      const v = this.visOf(it); v.x = ui.mx - this.grab.x; v.y = ui.my - this.grab.y; v.pop = 1;
      sfx(['k_tick4', 'cloth1'], { vol: 0.4, rate: 1.2 });
    }
    this.plan = this.planFor(it);
    if (!ui.down) this.dropHeld(false);
  }

  private pickUp(it: ItemInst) {
    const v = this.visOf(it), f = this.footOf(it), k = C / this.cellOf(it);
    this.held = it;
    this.heldFrom = { gx: it.gx, gy: it.gy, rot: it.rot, slot: it.gx < 0 ? this.slot.get(it.uid) : undefined };
    // the grab point in pocket px (a seabed find grows to pocket size around the cursor)
    this.grab = { x: Math.max(2, Math.min(f.w * k - 2, (this.ui.mx - v.x) * k)), y: Math.max(2, Math.min(f.h * k - 2, (this.ui.my - v.y) * k)) };
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
    const inGrid = ui.mx >= L.gridX - C / 2 && ui.my >= L.gridY - C / 2 && ui.mx < L.gridX + GRID_W * C + C / 2 && ui.my < L.gridY + GRID_H * C + C / 2;
    if (inGrid) return { kind: 'grid', gx, gy, ok: fits(run.items, it, gx, gy, it.rot), cells: cells.map(([x, y]) => [gx + x, gy + y]) };
    const inBoard = ui.mx >= L.trayX - C / 2 && ui.my >= L.labY && ui.mx < L.trayX + L.trayW + C / 2 && ui.my < L.trayY + L.trayH + T;
    if (inBoard) {
      // the same grab point on a seabed-sized footprint
      const k = T / C, bx = Math.round((ui.mx - this.grab.x * k - L.boardX) / T), by = Math.round((ui.my - this.grab.y * k - L.boardY) / T);
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
        this.burst(p.target, KC.gold, 10);
        sfx(['coin1', 'k_drop2', 'pickup1'], { vol: 0.5 });
        this.visOf(p.target).bump = 1;
        if ((it.n ?? 1) <= 0) { run.removeItem(it.uid); this.vis.delete(it.uid); this.slot.delete(it.uid); return; }
      }
      this.returnHome(it, from);
      return;
    }
    if (p.kind === 'fuse') { this.fuse(p.target, it); return; }
    if (p.kind === 'grid' && p.ok) {
      it.gx = p.gx; it.gy = p.gy; this.slot.delete(it.uid);
      v.vy = 70; v.bump = 1;
      this.dust(it, KC.dim);
      sfx(['k_drop2', 'k_drop3', 'cloth1'], { vol: 0.55 });
      return;
    }
    if (p.kind === 'grid' && !p.ok) { sfx(['k_err1', 'k_err2'], { vol: 0.35 }); v.shake = 1; }
    if (p.kind === 'board') {
      it.gx = -1; it.gy = -1;
      if (p.ok) this.slot.set(it.uid, { bx: p.bx, by: p.by });
      else { this.slot.delete(it.uid); this.slot.set(it.uid, this.freeBoardSlot(it) ?? { bx: 0, by: this.L.bRows }); }
      v.vy = 50; v.bump = 1;
      this.dust(it, KC.bone);
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
    this.burst(out, KC.gold2, 18);
    const d = getItem(res.id);
    const isLevel = res.id === it.id && res.id === target.id;
    const [tx, ty] = this.targetOf(out);
    const f = this.footOf(out);
    this.toasts.push({ text: isLevel ? `LEVEL ${res.level}` : 'FUSED!', sub: d.name, x: tx + f.w / 2, y: ty - 22, t: 0, col: KC.gold2 });
    this.game.flash?.('#fff2c8', 0.12);
    sfx(['magic1', 'magic2', 'powerup1'], { vol: 0.7 });
    sfx(['pickup_sparkle1', 'shimmer1'], { vol: 0.45, delay: 0.08 });
  }

  private burst(it: ItemInst, col: string, n: number) {
    const [x, y] = this.targetOf(it);
    const f = this.footOf(it);
    const cx = x + f.w / 2, cy = y + f.h / 2;
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 90; this.sparks.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, t: 0, life: 0.5 + Math.random() * 0.5, col }); }
  }
  /** a puff of lint / sand out from under a dropped item */
  private dust(it: ItemInst, col: string) {
    const [x, y] = this.targetOf(it);
    const f = this.footOf(it);
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      this.sparks.push({ x: x + f.w / 2 + side * f.w * 0.42, y: y + f.h - 4, vx: side * (30 + Math.random() * 50), vy: -20 - Math.random() * 40, t: 0, life: 0.35 + Math.random() * 0.25, col, g: 120 });
    }
  }

  // ---------------------------------------------------------------- test hooks (CSS px)
  private css(x: number, y: number): [number, number] { const k = this.ui.scale / this.game.renderer.getPixelRatio(); return [Math.round(x * k), Math.round(y * k)]; }
  cellPoint(gx: number, gy: number) { return this.css(this.L.gridX + (gx + 0.5) * C, this.L.gridY + (gy + 0.5) * C); }
  trayPoint(bx: number, by: number) { return this.css(this.L.boardX + (bx + 0.5) * T, this.L.boardY + (by + 0.5) * T); }
  itemPoint(uid: number) { const it = this.run?.items.find((i) => i.uid === uid); if (!it) return null; const [x, y] = this.targetOf(it); const c = rotCells(getItem(it.id).shape, it.rot)[0], k = this.cellOf(it); return this.css(x + (c[0] + 0.5) * k, y + (c[1] + 0.5) * k); }
  closePoint() { return this.css(this.L.closeX + this.L.close / 2, this.L.closeY + this.L.close / 2); }
}

/**
 * the packed gear's stat changes as flat rows: the value (sage when it helps, red when it hurts) then its label in
 * dim, a 1 px rule under each; two columns when there is room. Returns the height used.
 */
function statGrid(ui: PixelUI, lines: { text: string; good: boolean }[], x: number, y: number, w: number, maxH: number): number {
  const rowH = 17;
  const cols = lines.length > 3 && w >= 280 ? 2 : 1, gap = 14, cw = Math.floor((w - (cols - 1) * gap) / cols);
  const perCol = Math.max(1, Math.min(Math.ceil(lines.length / cols), Math.floor(maxH / rowH)));
  let used = 0;
  lines.slice(0, perCol * cols).forEach((l, i) => {
    const c = Math.floor(i / perCol), r = i % perCol;
    const X = x + c * (cw + gap), Y = y + r * rowH;
    const m = l.text.match(/^([+\-−]?[\d.]+%?)\s*(.*)$/);
    const value = m ? m[1] : l.text, label = m ? m[2] : '';
    const vw = ui.text(value, X, Y + 2, { font: 'body', color: l.good ? KC.sage : KC.red2, shadow: KC.ink });
    if (label) ui.text(label, X + vw + 5, Y + 2 + Math.round(ui.cap('body') - ui.cap('small')), { font: 'small', color: KC.dim, shadow: null });
    ui.fill(X, Y + rowH - 2, cw, 1, KC.line);
    used = Math.max(used, (r + 1) * rowH);
  });
  return used;
}

export type { ItemDef };
