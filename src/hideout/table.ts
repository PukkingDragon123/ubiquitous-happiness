// The PLANNING TABLE in the map room: the run config as a diegetic, lamp-lit desk the camera swoops down onto.
//   CHART    an aged nautical chart: a side-on cross-section of the ocean, the floors descending left to right
//            (reef -> kelp -> graveyard -> arctic -> abyss) with painted landmarks, the pinned route (one pin per
//            floor, a flag at the start), locked depths hatched over, a compass rose; a brass compass sits on it.
//            Click a depth to start there (if your mastery reaches it).
//   DIAL     a brass mastery dial 0..10 (locked notches dark): click its left / right half, scroll, or A / D;
//            a paper note card beside it lists the level's name and every active modifier
//   BACKPACK an open leather backpack: drag gear AND materials from the stash tray into its 5 x 5 grid (shapes,
//            stacks), R / right click rotates while dragging, click a packed item to take it out
//   POSTERS  nemesis WANTED posters pinned on the corkboard behind (hover: who they are, what they remember)
//   LEVER    a big brass dive lever bolted to the table's end: pull it -> onDive(cfg)
// 3D props in the table group (nooks.ts), the crisp bits (items, counts, the note card, tooltips) in the pixel
// UI, placed over the projected props every frame.
//
//   const t = new PlanningTable(nooks); t.open(); each frame in table mode: t.update(dt, ui, input, camera, ray)
//   t.onDive = (cfg) => ...; t.onClose = () => ...;  t.shot() -> the camera shot over the table
import * as THREE from 'three';
import { Kit } from './kit';
import { MAT } from './tex';
import { retro } from '../gfx/retro';
import { Px } from '../gfx/px';
import { hash2, damp, clamp01 } from '../core/math';
import { META, saveMeta, type RunConfig } from '../meta/meta';
import { MASTERY, MAX_MASTERY, masteryMods, AREAS, floorsAt } from './mastery';
import { ITEMS, getItem, GRID, fits, instCells, findSpot, stackCap, shapeSize, itemMesh, type Rarity } from '../game/items';
import type { ItemInst } from '../game/run';
import type { PixelUI } from '../ui/pixel/ui';
import type { Input } from '../core/input';
import { drawText } from '../ui/pixel/font';
import { Tag, TableCard, paintTag, type TagLine } from './tag';
import { audio } from '../audio/audio';
import { wantedPage, type Nooks, TABLE } from './nooks';
import type { Shot } from './camera';

/** the run config the table hands to the dive: RunConfig + the packed grid (gear and material stacks) */
export interface TableConfig extends RunConfig {
  /** the packed backpack: stash gear keeps its stash uid; material stacks have negative uids and n */
  pack: ItemInst[];
  /** materials packed (taken out of META.materials when the run builds its pack) */
  mats: Record<string, number>;
}

/** how many floors a run dives at a mastery level (mastery 0 = 3; deeper with mastery) */
export function floorsFor(mastery: number) { return floorsAt(mastery); }
/** the floors a config dives, in order: from the starting depth down, staying in the abyss once it is reached */
export function routeFor(mastery: number, start: string): string[] {
  const i0 = Math.max(0, AREAS.findIndex((a) => a.id === start));
  return Array.from({ length: floorsFor(mastery) }, (_, k) => AREAS[Math.min(AREAS.length - 1, i0 + k)].id);
}

// ------------------------------------------------------------------ the chart page (a cross-section)
const CW = 320, CH = 176;
/** x range of each depth on the chart, and its seabed line */
const ZONE_X = [18, 76, 136, 196, 256, 306];
const zoneOf = (x: number) => { for (let i = 0; i < 5; i++) if (x >= ZONE_X[i] && x < ZONE_X[i + 1]) return i; return -1; };
function seabed(x: number) {
  const k = (x - ZONE_X[0]) / (ZONE_X[5] - ZONE_X[0]);
  const base = 62 + Math.pow(Math.max(0, k), 1.35) * 92;
  return Math.round(base + Math.sin(x * 0.21) * 2.5 + Math.sin(x * 0.07 + 1) * 3 + (x > 250 ? Math.sin((x - 250) * 0.12) * 6 : 0));
}

function paintChart(mastery: number, start: string, hover: number): HTMLCanvasElement {
  const p = new Px(CW, CH);
  // aged parchment: warm base, fibrous noise, stains, darker burned edges
  p.fill((x, y) => {
    const n = hash2(x >> 1, y >> 1, 3) * 0.06 + hash2(x >> 3, y >> 3, 5) * 0.08;
    const e = Math.min(x, y, CW - 1 - x, CH - 1 - y);
    const burn = e < 6 ? (6 - e) / 6 : 0;
    const st = Math.max(0, 1 - Math.hypot(x - 250, y - 40) / 26) * 0.18 + Math.max(0, 1 - Math.hypot(x - 60, y - 140) / 20) * 0.14;
    const k = 1 - n - burn * 0.45 - st;
    return [Math.round(226 * k), Math.round(206 * k), Math.round(160 * k)];
  });
  const ink = '#3a2614', ink2 = '#6a4a2a', red = '#a8241c';
  // a double frame and the title cartouche
  for (const o of [5, 8]) { for (let x = o; x < CW - o; x++) { p.set(x, o, ink2); p.set(x, CH - 1 - o, ink2); } for (let y = o; y < CH - o; y++) { p.set(o, y, ink2); p.set(CW - 1 - o, y, ink2); } }
  // the sea: horizontal hatching between the surface and the seabed, denser with depth
  const surf = (x: number) => 22 + Math.round(Math.sin(x * 0.35) * 1.2);
  const WASH = ['#5ac8c8', '#5aa86a', '#7a8a7a', '#9ac8e8', '#3a3a7a'];
  for (let x = 12; x < CW - 12; x++) {
    const sb = seabed(x);
    const zi = Math.max(0, zoneOf(x));
    for (let y = surf(x) + 1; y < sb; y++) {
      const d = (y - 22) / 130;
      // a watercolour wash per depth, darker further down, with sparse engraved hatching
      p.blend(x, y, WASH[zi], 0.18 + d * 0.22);
      if (y % 6 === 0 && (x + (y >> 1)) % 4 === 0) p.blend(x, y, '#3a5a6a', 0.45);
    }
    p.set(x, surf(x), '#2a4a6a');
    if (x % 6 < 3) p.set(x, surf(x) - 1, '#2a4a6a');
    // the seabed profile + sand stipple below it
    for (let y = sb; y < CH - 12; y++) { if (y === sb || y === sb + 1) p.set(x, y, ink); else if ((x * 7 + y * 3) % 11 === 0) p.set(x, y, ink2); }
  }
  // the hideout: a hatch in a rock at the top left, a tiny boat on the surface
  p.ellipse(22, 50, 9, 7, '#7a6a5a'); p.ellipse(22, 50, 3, 3, '#e8a040'); p.set(22, 50, '#fff0a0');
  p.rect(150, 18, 14, 3, ink); p.rect(156, 12, 1, 6, ink); p.poly([[157, 12], [163, 16], [157, 16]], ink2);
  for (let y = 21; y < 44; y += 2) p.set(160, y, ink2);
  // landmarks per depth
  const zc = (i: number) => (ZONE_X[i] + ZONE_X[i + 1]) / 2;
  // reef: coral fans and branches
  for (let i = 0; i < 5; i++) { const x = ZONE_X[0] + 8 + i * 10, b = seabed(x); for (let y = 0; y < 6 + (i % 3) * 3; y++) { p.set(x + (y % 3 === 0 ? 1 : 0), b - 1 - y, ['#d8604a', '#e88a3a', '#c84a8a'][i % 3]); if (y > 2 && y % 2) p.set(x + 2, b - 1 - y, '#d8604a'); } }
  // kelp: tall wavy stalks
  for (let i = 0; i < 6; i++) { const x0 = ZONE_X[1] + 5 + i * 9, b = seabed(x0); for (let y = 30; y < b; y++) { const x = x0 + Math.round(Math.sin(y * 0.2 + i) * 1.5); p.set(x, y, '#3a6a2a'); if (y % 5 === 0) p.set(x + 1, y, '#5a8a3a'); } }
  // graveyard: a broken hull on its side, a mast
  { const x = zc(2) - 12, b = seabed(zc(2)); p.poly([[x, b], [x + 4, b - 9], [x + 24, b - 11], [x + 30, b - 4], [x + 28, b]], '#4a3a2a'); p.line(x + 14, b - 11, x + 22, b - 26, ink); for (let k = 0; k < 3; k++) p.rect(x + 8 + k * 6, b - 7, 2, 2, '#1a120a'); }
  // arctic: the ice shelf under the surface and icebergs
  for (let x = ZONE_X[3]; x < ZONE_X[4]; x++) { const d = 4 + Math.round(Math.abs(Math.sin(x * 0.3)) * 5); for (let y = 23; y < 23 + d; y++) p.set(x, y, y === 22 + d ? '#7aa8c8' : '#d8eef8'); }
  p.poly([[zc(3) - 8, 23], [zc(3) + 6, 23], [zc(3) + 2, 46], [zc(3) - 4, 42]], '#c8e4f4');
  // abyss: darkness, a trench, an angler's lantern
  for (let x = ZONE_X[4]; x < CW - 12; x++) for (let y = 40; y < seabed(x); y++) if ((x + y) % 2 === 0) p.blend(x, y, '#1a1a2a', 0.35);
  p.circle(zc(4) + 6, seabed(zc(4)) - 18, 2, '#ffe080'); p.line(zc(4) + 6, seabed(zc(4)) - 16, zc(4), seabed(zc(4)) - 12, ink); p.ellipse(zc(4) - 3, seabed(zc(4)) - 10, 5, 3, '#2a2a3a');
  // locked depths: cross-hatched over in grey ink
  AREAS.forEach((a, i) => {
    if (a.minMastery <= mastery) return;
    for (let x = ZONE_X[i] + 1; x < ZONE_X[i + 1]; x++) for (let y = 12; y < CH - 12; y++) if ((x + y) % 5 === 0 || (x - y + 400) % 5 === 0) p.blend(x, y, '#5a5048', 0.55);
  });
  // the hovered depth glows
  if (hover >= 0) for (let x = ZONE_X[hover]; x < ZONE_X[hover + 1]; x++) for (let y = 14; y < CH - 14; y++) p.blend(x, y, '#fff4c0', 0.18);
  // depth dividers
  for (let i = 1; i < 5; i++) for (let y = 14; y < CH - 14; y += 3) p.set(ZONE_X[i], y, ink2);
  // the route: a dotted red line through each floor's pin spot
  const route = routeFor(mastery, start);
  const pts = route.map((id, k) => { const i = AREAS.findIndex((a) => a.id === id); const rep = route.slice(0, k).filter((q) => q === id).length; const x = zc(i) + rep * 9; return [x, seabed(x) - 14 + rep * 6] as [number, number]; });
  const startPt: [number, number] = [22, 50];
  let prev = startPt;
  for (const q of pts) { const n = Math.ceil(Math.hypot(q[0] - prev[0], q[1] - prev[1]) / 2); for (let k = 0; k < n; k++) if (k % 3 !== 2) { const x = Math.round(prev[0] + ((q[0] - prev[0]) * k) / n), y = Math.round(prev[1] + ((q[1] - prev[1]) * k) / n); p.set(x, y, red); p.set(x + 1, y, red); p.set(x, y + 1, red); p.set(x + 1, y + 1, '#6a140c'); } prev = q; }
  for (const [x, y] of pts) { p.circle(x, y, 3.2, red); p.circle(x, y, 1.6, '#f0d0a0'); }
  const cv = p.canvas();
  const ctx = cv.getContext('2d')!;
  // hand-lettered labels: the depth names along the bottom, floor numbers by the pins, the title
  AREAS.forEach((a, i) => {
    const locked = a.minMastery > mastery;
    const name = a.name.toUpperCase().replace('SHIPWRECK ', '').replace('THE ', '');
    drawText(ctx, name, zc(i), CH - 26, { font: 'small', color: locked ? '#6a6058' : '#3a2614', align: 'center' });
    if (locked) drawText(ctx, `M${a.minMastery}`, zc(i), CH - 38, { font: 'small', color: '#7a2a1a', align: 'center' });
  });
  pts.forEach(([x, y], i) => drawText(ctx, String(i + 1), x + 6, y - 12, { font: 'small', color: '#8a1a14' }));
  drawText(ctx, 'THE DEEP ROUTE', CW - 16, 12, { font: 'small', color: '#3a2614', align: 'right' });
  drawText(ctx, 'HOME', 34, 46, { font: 'small', color: '#3a2614' });
  // a compass rose bottom left
  const rx = 40, ry = CH - 52;
  ctx.fillStyle = '#6a4a2a';
  for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; for (let r = 0; r < 9; r++) ctx.fillRect(Math.round(rx + Math.cos(a) * r), Math.round(ry + Math.sin(a) * r), 1, 1); }
  ctx.fillStyle = '#a8241c'; ctx.fillRect(rx, ry - 10, 1, 3);
  return cv;
}

// ------------------------------------------------------------------ the dial page
function paintDial(mastery: number): HTMLCanvasElement {
  const S = 80, p = new Px(S, S);
  p.fill((x, y) => {
    const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2);
    if (d > 1) return null;
    if (d > 0.9) return d > 0.96 ? [90, 56, 18] : [226, 178, 82];
    const sh = (x - y) / S;
    return [Math.round(200 + sh * 30), Math.round(152 + sh * 26), Math.round(62 + sh * 14)];
  });
  const cv = p.canvas(), ctx = cv.getContext('2d')!;
  for (let i = 0; i <= MAX_MASTERY; i++) {
    const a = dialAngle(i);
    const x = S / 2 + Math.sin(a) * S * 0.33, y = S / 2 - Math.cos(a) * S * 0.33;
    const locked = i > META.masteryUnlocked;
    // notch
    ctx.fillStyle = locked ? '#5a3a10' : '#2a1404';
    ctx.fillRect(Math.round(S / 2 + Math.sin(a) * S * 0.44), Math.round(S / 2 - Math.cos(a) * S * 0.44), 2, 2);
    drawText(ctx, String(i), x, y - 3, { font: 'small', color: i === mastery ? '#a8140c' : locked ? '#8a6a3a' : '#2a1404', align: 'center' });
  }
  return cv;
}
/** needle angle for a mastery level (radians, 0 = up, clockwise) across a 300 degree sweep */
function dialAngle(m: number) { return (-150 + (m / MAX_MASTERY) * 300) * (Math.PI / 180); }

const tex = (cv: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t; };

// table-local layout (x along the table to the right as seen from the room, z toward the room)
const CHART = { x: -0.4, z: -0.26, w: 1.5, d: 0.8 };
const BAG = { x: 0.8, z: -0.24, w: 0.64, d: 0.62, grid: 0.5 };
const DIAL = { x: -1.0, z: 0.4, r: 0.17 };
const TRAY = { x: 0.4, z: 0.42, w: 1.0, d: 0.34 };
const LEVER = { x: 1.08, z: 0.36 };

interface Drag { it: ItemInst; from: 'tray' | 'bag'; sx: number; sy: number; moved: boolean; rot: number; key: string }
/** what an item model on the table stands for */
interface Slot { id: string; level?: number; n?: number; from: 'tray' | 'bag'; inst: ItemInst }
const RARITY_INK: Partial<Record<Rarity, string>> = { common: '#2a1808', uncommon: '#1a5a1a', rare: '#1a3a8a', epic: '#6a1a8a', legendary: '#8a4a04' };

export class PlanningTable {
  mastery = 0;
  start = 'reef';
  pack: ItemInst[] = [];
  onDive?: (cfg: TableConfig) => void;
  onClose?: () => void;
  private g: THREE.Group;
  private chartTex: THREE.CanvasTexture;
  private chartMesh: THREE.Mesh;
  private dialTex: THREE.CanvasTexture;
  private dialMesh: THREE.Mesh;
  private needle: THREE.Object3D;
  private lever: THREE.Group;
  private leverMesh: THREE.Group;
  private leverMat: THREE.MeshStandardMaterial;
  private leverK = 0;
  private pulled = -1;
  private pins: THREE.Object3D[] = [];
  private compassNeedle: THREE.Object3D;
  private posters: { m: THREE.Mesh; i: number }[] = [];
  private posterKey = '';
  private chartKey = '';
  private hoverZone = -1;
  private needleA = 0;
  private drag: Drag | null = null;
  private flash = { text: '', t: 0 };
  private t = 0;
  private trayPage = 0;
  private nextMatUid = -1;
  private dropT = new Map<number, number>();
  private tag = new Tag('paper', 170);
  private card = new TableCard('paper', 118, 0.0027);
  private emptyNote = new TableCard('paper', 150, 0.0027);
  private plaque = new TableCard('brass', 400, 0.0024);
  private items = new THREE.Group();
  private models = new Map<string, THREE.Group>();
  private counts = new Map<number, THREE.Texture>();
  private cellHi: THREE.Mesh[] = [];
  private arrows: THREE.Object3D[] = [];

  constructor(private nooks: Nooks) {
    const g = new THREE.Group();
    g.rotation.y = Math.PI / 2; // local +x -> world -z (to the right seen from the room), local +z -> world +x
    nooks.table.group.add(g);
    this.g = g;
    // ---- the chart (dynamic page) on a slightly curled parchment
    this.chartTex = tex(paintChart(0, 'reef', -1));
    const cg = new THREE.PlaneGeometry(CHART.w, CHART.d, 6, 1); cg.rotateX(-Math.PI / 2);
    const CP = cg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < CP.count; i++) { const x = CP.getX(i); CP.setY(i, Math.pow(Math.abs(x) / (CHART.w / 2), 6) * 0.03); }
    cg.computeVertexNormals();
    this.chartMesh = new THREE.Mesh(cg, retro(new THREE.MeshStandardMaterial({ map: this.chartTex, roughness: 0.95, side: THREE.DoubleSide })));
    this.chartMesh.position.set(CHART.x, 0.004, CHART.z);
    this.chartMesh.receiveShadow = true;
    g.add(this.chartMesh);
    const k = new Kit();
    // brass weights holding the chart's corners down, a pair of dividers, a pencil, a mug of kelp tea, a candle stub
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(MAT.brass(), 0.035, 0.04, 0.03, CHART.x + sx * (CHART.w / 2 - 0.04), 0.035, CHART.z + sz * (CHART.d / 2 - 0.04), { seg: 7 });
    k.box(MAT.plain('#c8c8d0/0.3/0.8'), 0.36, 0.012, 0.012, -0.55, 0.012, 0.05, { ry: 0.35, chamfer: 0 });
    k.box(MAT.plain('#c8c8d0/0.3/0.8'), 0.36, 0.012, 0.012, -0.5, 0.012, 0.09, { ry: -0.1, chamfer: 0 });
    k.cyl(MAT.plain('#f0c040/0.6'), 0.01, 0.01, 0.28, -0.05, 0.012, 0.3, { rz: Math.PI / 2, ry: 0.4, seg: 6 });
    k.cyl(MAT.plain('#e8e0d0/0.3'), 0.05, 0.045, 0.1, -1.1, 0.05, 0.12, { seg: 8 });
    k.add(MAT.plain('#e8e0d0/0.3'), new THREE.TorusGeometry(0.03, 0.01, 4, 6), -1.04, 0.05, 0.12, { rx: Math.PI / 2 });
    k.cyl(MAT.plain('#3a5a2a/0.2'), 0.045, 0.045, 0.005, -1.1, 0.098, 0.12, { seg: 8 });
    k.cyl(MAT.plain('#efe4c8/0.9'), 0.03, 0.035, 0.08, -1.12, 0.04, -0.52, { seg: 6 });
    // ---- the open backpack: a leather tray body, the flap thrown back, straps, a stitched grid inside
    const lea = MAT.leather('brown');
    k.slab(lea, BAG.w, 0.12, BAG.d, BAG.x, 0, BAG.z);
    k.box(lea, BAG.w + 0.04, 0.03, 0.4, BAG.x, 0.02, BAG.z - BAG.d / 2 - 0.18, { rx: 0.15 });
    for (const sx of [-0.18, 0.18]) { k.box(MAT.leather('black'), 0.05, 0.012, 0.5, BAG.x + sx, 0.028, BAG.z - BAG.d / 2 - 0.24); k.box(MAT.brass(), 0.06, 0.02, 0.04, BAG.x + sx, 0.04, BAG.z - BAG.d / 2 - 0.46); }
    for (const sx of [-1, 1]) k.box(lea, 0.04, 0.16, BAG.d, BAG.x + sx * (BAG.w / 2), 0.07, BAG.z);
    k.box(lea, BAG.w, 0.16, 0.04, BAG.x, 0.07, BAG.z + BAG.d / 2);
    const gp = new Px(50, 50);
    gp.fill((x, y) => ((x % 10 === 0 || y % 10 === 0) ? ((x + y) % 2 ? [120, 82, 46] : [60, 38, 20]) : [42, 28, 18]));
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(BAG.grid, BAG.grid).rotateX(-Math.PI / 2), retro(new THREE.MeshStandardMaterial({ map: gp.texture({ mip: false }), roughness: 1 })));
    inner.position.set(BAG.x, 0.122, BAG.z);
    g.add(inner);
    // ---- the stash tray: a shallow wooden tray the stash items are laid out in
    k.slab(MAT.wood('pine'), TRAY.w, 0.025, TRAY.d, TRAY.x, 0, TRAY.z);
    for (const sz of [-1, 1]) k.box(MAT.wood('pine'), TRAY.w, 0.06, 0.03, TRAY.x, 0.03, TRAY.z + sz * TRAY.d / 2);
    for (const sx of [-1, 1]) k.box(MAT.wood('pine'), 0.03, 0.06, TRAY.d, TRAY.x + sx * TRAY.w / 2, 0.03, TRAY.z);
    // ---- the dial housing
    k.cyl(MAT.wood('walnut'), DIAL.r + 0.05, DIAL.r + 0.06, 0.04, DIAL.x, 0.02, DIAL.z, { seg: 10 });
    // ---- the compass on the chart
    k.cyl(MAT.brass(), 0.075, 0.08, 0.035, 0.18, 0.02, -0.5, { seg: 10 });
    k.cyl(MAT.plain('#f0e8d0/0.5'), 0.065, 0.065, 0.004, 0.18, 0.039, -0.5, { seg: 10 });
    g.add(k.build());
    this.dialTex = tex(paintDial(0));
    this.dialMesh = new THREE.Mesh(new THREE.CircleGeometry(DIAL.r, 20).rotateX(-Math.PI / 2), retro(new THREE.MeshStandardMaterial({ map: this.dialTex, roughness: 0.4, metalness: 0.5, transparent: true, alphaTest: 0.5 })));
    this.dialMesh.position.set(DIAL.x, 0.042, DIAL.z);
    g.add(this.dialMesh);
    this.needle = new THREE.Group();
    const nk = new Kit();
    nk.box(MAT.plain('#a8140c/0.4/0.3'), 0.02, 0.012, DIAL.r * 0.8, 0, 0, -DIAL.r * 0.38, { chamfer: 0 });
    nk.cyl(MAT.brass(), 0.03, 0.03, 0.03, 0, 0.004, 0, { seg: 8 });
    this.needle.add(nk.build());
    this.needle.position.set(DIAL.x, 0.05, DIAL.z);
    g.add(this.needle);
    this.compassNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.11), retro(new THREE.MeshBasicMaterial({ color: '#c8241c' })));
    this.compassNeedle.position.set(0.18, 0.045, -0.5);
    g.add(this.compassNeedle);
    // ---- the dive lever on the table's end
    this.lever = new THREE.Group(); this.lever.position.set(LEVER.x, 0, LEVER.z); g.add(this.lever);
    const lb = new Kit();
    lb.slab(MAT.metal('grey'), 0.18, 0.06, 0.3, 0, 0, 0);
    lb.box(MAT.brass(), 0.16, 0.05, 0.26, 0, 0.08, 0);
    for (let i = 0; i < 6; i++) lb.box(MAT.brass(), 0.17, 0.012, 0.012, 0, 0.11, -0.1 + i * 0.04, { chamfer: 0 });
    for (const sx of [-1, 1]) lb.cyl(MAT.brass(), 0.012, 0.012, 0.02, sx * 0.07, 0.065, sx * 0.12, { seg: 6 });
    this.lever.add(lb.build());
    this.leverMesh = new THREE.Group(); this.leverMesh.position.set(0, 0.1, 0); this.lever.add(this.leverMesh);
    this.leverMat = retro(new THREE.MeshStandardMaterial({ color: '#d02a20', roughness: 0.35, metalness: 0.2, emissive: '#ff7a3a', emissiveIntensity: 0, flatShading: true }));
    const lk = new Kit();
    lk.cyl(MAT.brass(), 0.022, 0.026, 0.55, 0, 0.27, 0, { seg: 6 });
    lk.sphere(this.leverMat, 0.06, 0, 0.56, 0, { w: 7, h: 5 });
    lk.cyl(MAT.metal('grey'), 0.05, 0.05, 0.12, 0, 0, 0, { rz: Math.PI / 2, seg: 8 });
    this.leverMesh.add(lk.build());
    this.leverMesh.traverse((o) => { o.userData.lever = true; });
    // the item models (stash on the tray, the pack in the bag), drag highlights, the tray's page knobs
    g.add(this.items);
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(BAG.grid / GRID - 0.008, BAG.grid / GRID - 0.008).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4aff6a', transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }));
      c.visible = false; g.add(c); this.cellHi.push(c);
    }
    for (const dir of [-1, 1]) {
      const kn = new Kit();
      kn.cyl(MAT.brass(), 0.035, 0.04, 0.05, 0, 0.025, 0, { seg: 8 });
      kn.add(MAT.plain('#2a1404/0.5'), new THREE.ConeGeometry(0.02, 0.04, 3), dir * 0.004, 0.055, 0, { rz: -dir * Math.PI / 2 });
      const a = kn.build(); a.position.set(TRAY.x + dir * (TRAY.w / 2 + 0.05), 0, TRAY.z); a.traverse((o) => { o.userData.arrow = dir; }); a.userData.arrow = dir;
      g.add(a); this.arrows.push(a);
    }
    // the mastery note beside the dial, a note for an empty stash, the engraved plaque of controls
    this.card.mesh.position.set(DIAL.x + DIAL.r + 0.26, 0.004, DIAL.z - 0.02); this.card.mesh.rotation.y = 0.04; g.add(this.card.mesh);
    this.emptyNote.set([{ text: 'The stash is empty.', color: '#2a1808' }, { text: 'Mail loot home on runs.', color: '#5a4a3a' }]);
    this.emptyNote.mesh.position.set(TRAY.x, 0.032, TRAY.z); g.add(this.emptyNote.mesh);
    this.plaque.set([{ text: 'DRAG TO PACK', key: 'R', color: '#2a1404' }]);
    this.plaque.mesh.position.set(BAG.x, 0.004, BAG.z + BAG.d / 2 + 0.05); g.add(this.plaque.mesh);
    nooks.group.add(this.tag.mesh);
  }

  /** open the table: last config, unlocked mastery, the pack restored from the stash */
  open() {
    const lc = META.lastConfig as (TableConfig | null);
    this.mastery = Math.min(META.masteryUnlocked, lc?.mastery ?? META.mastery ?? 0);
    const area = AREAS.find((a) => a.id === lc?.startArea);
    this.start = area && area.minMastery <= this.mastery ? area.id : 'reef';
    this.pack = [];
    for (const it of lc?.pack ?? []) {
      if (!ITEMS[it.id]) continue;
      if (it.uid >= 0) { const s = META.stash.find((q) => q.uid === it.uid); if (s && fits(this.pack, { ...s, gx: -1, gy: -1, rot: it.rot }, it.gx, it.gy, it.rot)) this.pack.push({ ...s, gx: it.gx, gy: it.gy, rot: it.rot }); }
      else {
        const have = (META.materials[it.id] ?? 0) - this.packedMat(it.id);
        const n = Math.min(have, it.n ?? 1);
        if (n > 0 && fits(this.pack, { ...it, gx: -1, gy: -1 }, it.gx, it.gy, it.rot)) this.pack.push({ ...it, uid: this.nextMatUid--, n });
      }
    }
    if (!lc?.pack) for (const uid of lc?.loadout ?? []) { const s = META.stash.find((q) => q.uid === uid); if (s) this.addGear(s, true); }
    this.drag = null; this.pulled = -1; this.leverK = 0; this.trayPage = 0;
    this.chartKey = ''; this.posterKey = '';
    this.refresh();
  }

  config(): TableConfig {
    const mats: Record<string, number> = {};
    for (const it of this.pack) if (it.uid < 0) mats[it.id] = (mats[it.id] ?? 0) + (it.n ?? 1);
    return { mastery: this.mastery, startArea: this.start, loadout: this.pack.filter((p) => p.uid >= 0).map((p) => p.uid), pack: this.pack.map((p) => ({ ...p })), mats };
  }

  /** the camera shot down over the table (world) */
  shot(): Shot {
    const top = this.nooks.table.top;
    return { target: new THREE.Vector3(top.x - 0.1, top.y + 0.02, top.z), yaw: Math.PI / 2, pitch: 1.0, dist: 2.45, fov: 44 };
  }

  // ---------------------------------------------------------------- packing
  private packedMat(id: string) { return this.pack.reduce((s, p) => s + (p.uid < 0 && p.id === id ? p.n ?? 1 : 0), 0); }
  private inPack(uid: number) { return this.pack.some((p) => p.uid === uid); }
  private addGear(it: ItemInst, quiet = false): boolean {
    if (!ITEMS[it.id] || this.inPack(it.uid)) return false;
    const copy: ItemInst = { ...it, gx: -1, gy: -1, rot: 0 };
    const spot = findSpot(this.pack, copy);
    if (!spot) { if (!quiet) this.full(); return false; }
    copy.gx = spot.gx; copy.gy = spot.gy; copy.rot = spot.rot;
    this.pack.push(copy); this.dropT.set(copy.uid, 0);
    if (!quiet) audio.play('bag_zip1', { vol: 0.25, dry: true, rate: 1.4 });
    return true;
  }
  /** add n of a material: top up a stack in the pack first, then a new stack where it fits (or at gx, gy) */
  private addMat(id: string, n: number, at?: { gx: number; gy: number; rot: number }): boolean {
    let left = Math.min(n, (META.materials[id] ?? 0) - this.packedMat(id));
    if (left <= 0) return false;
    const cap = stackCap(id);
    let added = false;
    for (const p of this.pack) { if (left <= 0) break; if (p.uid < 0 && p.id === id && (p.n ?? 1) < cap) { const k = Math.min(cap - (p.n ?? 1), left); p.n = (p.n ?? 1) + k; left -= k; added = true; this.dropT.set(p.uid, 0); } }
    while (left > 0) {
      const inst: ItemInst = { uid: this.nextMatUid--, id, gx: -1, gy: -1, rot: 0, level: 1, n: Math.min(cap, left) };
      const spot = at && fits(this.pack, inst, at.gx, at.gy, at.rot) ? at : findSpot(this.pack, inst);
      if (!spot) break;
      at = undefined;
      inst.gx = spot.gx; inst.gy = spot.gy; inst.rot = spot.rot;
      this.pack.push(inst); this.dropT.set(inst.uid, 0);
      left -= inst.n ?? 1; added = true;
    }
    if (!added) this.full(); else audio.play('k_drop3', { vol: 0.3, dry: true, rate: 1.2 });
    return added;
  }
  private full() { this.flash = { text: 'PACK FULL', t: 1.2 }; audio.play('k_err1', { vol: 0.4, dry: true }); }

  // ---------------------------------------------------------------- 3D refresh
  private refresh() {
    const key = `${this.mastery}|${this.start}|${this.hoverZone}|${META.masteryUnlocked}`;
    if (key !== this.chartKey) {
      this.chartKey = key;
      this.chartTex.image = paintChart(this.mastery, this.start, this.hoverZone); this.chartTex.needsUpdate = true;
      this.dialTex.image = paintDial(this.mastery); this.dialTex.needsUpdate = true;
      // pins: a red push-pin at every floor, a little flag at the first
      for (const p of this.pins) p.removeFromParent();
      this.pins = [];
      const rt = routeFor(this.mastery, this.start);
      rt.forEach((id, i) => {
        const zi = AREAS.findIndex((a) => a.id === id);
        const rep = rt.slice(0, i).filter((q) => q === id).length;
        const cx = (ZONE_X[zi] + ZONE_X[zi + 1]) / 2 + rep * 9, cy = seabed(cx) - 14 + rep * 6;
        const pk = new Kit();
        pk.cyl(MAT.plain('#c8c8d0/0.3/0.8'), 0.004, 0.004, 0.05, 0, 0.025, 0, { seg: 4 });
        pk.sphere(MAT.plain(i === 0 ? '#f0c040/0.4' : '#c8241c/0.4'), 0.022, 0, 0.055, 0, { w: 6, h: 4 });
        if (i === 0) { pk.cyl(MAT.wood('oak'), 0.004, 0.004, 0.14, 0, 0.08, 0, { seg: 4 }); pk.box(MAT.plain('#c8241c/0.8'), 0.06, 0.04, 0.004, 0.03, 0.13, 0, { chamfer: 0 }); }
        const pin = pk.build();
        pin.position.set(CHART.x + (cx / CW - 0.5) * CHART.w, 0.01, CHART.z + (cy / CH - 0.5) * CHART.d);
        this.g.add(pin); this.pins.push(pin);
      });
    }
    // nemesis posters on the corkboard
    const pkey = META.nemeses.map((n) => n.id + n.alive).join(',');
    if (pkey !== this.posterKey) {
      this.posterKey = pkey;
      for (const p of this.posters) p.m.removeFromParent();
      this.posters = [];
      const list = META.nemeses.slice(0, 4);
      const n = Math.max(1, list.length);
      for (let i = 0; i < n; i++) {
        const nem = list[i];
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56), retro(new THREE.MeshStandardMaterial({ map: wantedPage(nem ? nem.seed + i * 5 : 99, !nem || !nem.alive), roughness: 0.9 })));
        m.position.set(-0.75 + (i + (4 - n) / 2) * 0.5, (i % 2 ? -0.06 : 0.06), 0.035);
        m.rotation.z = (hash2(i, 3, 9) - 0.5) * 0.16;
        m.userData.poster = i;
        this.nooks.board.add(m);
        this.posters.push({ m, i });
      }
    }
  }

  // ---------------------------------------------------------------- frame
  private local(x: number, y: number, z: number) { return this.g.localToWorld(new THREE.Vector3(x, y, z)); }

  update(dt: number, ui: PixelUI, input: Input, cam: THREE.PerspectiveCamera, ray: THREE.Raycaster, internalH: number): void {
    this.t += dt;
    this.flash.t -= dt;
    for (const [k, v] of this.dropT) { if (v > 0.6) this.dropT.delete(k); else this.dropT.set(k, v + dt); }
    this.g.updateWorldMatrix(true, true);
    const busy = this.pulled >= 0;
    let tip: { lines: TagLine[]; at: THREE.Vector3 } | null = null;
    // ---- 3D picks: the items (stash tray + pack), the chart (start depth), the dial, the lever, the posters
    let zone = -1, dialSide = 0, lever = false, poster = -1, item: THREE.Object3D | null = null, arrow = 0;
    let hitP: THREE.Vector3 | null = null;
    if (!busy && ui.inside && !ui.mouseOnUI && !this.drag?.moved) {
      const pickables = [this.chartMesh, this.dialMesh, this.leverMesh, ...this.posters.map((p) => p.m), ...this.models.values(), ...this.arrows];
      for (const h of ray.intersectObjects(pickables, true)) {
        let o: THREE.Object3D | null = h.object;
        while (o && !o.userData.slot && o !== this.leverMesh && !o.userData.arrow && o.parent !== this.g && o !== this.nooks.board) o = o.parent;
        hitP = h.point.clone();
        if (h.object.userData.slot || o?.userData.slot) { item = o; break; }
        if (o?.userData.arrow) { arrow = o.userData.arrow as number; break; }
        if (h.object === this.chartMesh && h.uv) { const x = h.uv.x * CW, z = zoneOf(x); if (z >= 0) zone = z; break; }
        if (h.object === this.dialMesh) { const lp = this.g.worldToLocal(h.point.clone()); dialSide = lp.x < DIAL.x ? -1 : 1; break; }
        if (h.object.userData.lever) { lever = true; break; }
        if (h.object.userData.poster !== undefined) { poster = h.object.userData.poster as number; break; }
        break;
      }
    }
    // the depths: hover highlights the depth on the chart, click picks the start (if mastery allows)
    if (zone !== this.hoverZone) { this.hoverZone = zone; if (zone >= 0) audio.play('page1', { vol: 0.12, dry: true, rate: 1.6 }); }
    if (zone >= 0) {
      const a = AREAS[zone], locked = a.minMastery > this.mastery;
      ui.cursor = locked ? 'arrow' : 'point';
      const route = routeFor(this.mastery, a.id).map((id) => AREAS.find((q) => q.id === id)!.name.replace('The ', ''));
      tip = { at: hitP!, lines: [{ text: a.name, font: 'title' }, { text: a.desc, color: '#3a2810' }, locked ? { text: `needs mastery ${a.minMastery}`, color: '#a01a1a', gap: 2 } : { text: `${route.length} floors: ${route.join(' > ')}`, color: '#1a4a7a', gap: 2 }, ...(locked || a.id === this.start ? [] : [{ text: 'click: start here', color: '#5a4a3a' }])] };
      if (ui.pressed && !locked && a.id !== this.start) { this.start = a.id; audio.play('k_pluck2', { vol: 0.4, dry: true }); audio.play('page2', { vol: 0.3, dry: true }); }
      else if (ui.pressed && locked) audio.play('k_err1', { vol: 0.35, dry: true });
    }
    // the dial
    const setM = (m: number) => {
      const nm = Math.max(0, Math.min(Math.min(MAX_MASTERY, META.masteryUnlocked), m));
      if (nm === this.mastery) { audio.play('k_err1', { vol: 0.25, dry: true }); return; }
      this.mastery = nm; audio.play('k_tick2', { vol: 0.4, dry: true, rate: 0.8 + nm * 0.05 }); audio.play('clank2', { vol: 0.15 });
      if ((AREAS.find((a) => a.id === this.start)?.minMastery ?? 0) > nm) this.start = 'reef';
    };
    if (dialSide) { ui.cursor = 'point'; if (ui.pressed) setM(this.mastery + dialSide); if (ui.wheel) setM(this.mastery - Math.sign(ui.wheel)); tip = { at: hitP!, lines: [{ text: dialSide > 0 ? 'turn up' : 'turn down', color: '#3a2810' }] }; }
    if (!busy && (input.keyHit('KeyD') || input.keyHit('ArrowRight'))) setM(this.mastery + 1);
    if (!busy && (input.keyHit('KeyA') || input.keyHit('ArrowLeft'))) setM(this.mastery - 1);
    this.needleA = damp(this.needleA, dialAngle(this.mastery), 12, dt);
    this.needle.rotation.y = -this.needleA;
    this.compassNeedle.rotation.y = Math.sin(this.t * 0.7) * 0.15 + Math.sin(this.t * 2.3) * 0.04;
    // posters: the hovered one lifts off the cork a little
    for (const p of this.posters) p.m.position.z = damp(p.m.position.z, p.i === poster ? 0.09 : 0.035, 10, dt);
    if (poster >= 0) {
      const n = META.nemeses[poster];
      const lines: TagLine[] = n ? [{ text: n.name, font: 'title' }, { text: n.title, color: '#7a2a10' }, { text: `level ${n.level} · beat you ${n.kills}x · beaten ${n.defeats}x`, color: '#3a2810', gap: 2 }, ...n.memories.slice(0, 3).map((m) => ({ text: '"' + m + '"', color: '#1a4a7a' }))]
        : [{ text: 'WANTED', font: 'title' }, { text: 'No grudges yet. Humans who beat you, or get away, end up pinned here.', color: '#3a2810' }];
      if (n && !n.alive) lines.push({ text: 'DEFEATED', color: '#a01a1a', gap: 2 });
      tip = { at: hitP!, lines };
    }
    // the lever
    if (lever) { ui.cursor = 'point'; tip = { at: hitP!, lines: [{ text: 'DIVE', font: 'title' }, { text: `${routeFor(this.mastery, this.start).length} floors from the ${AREAS.find((a) => a.id === this.start)?.name.replace('The ', '')} · M${this.mastery}`, color: '#3a2810' }, { text: `${this.pack.length} things packed`, color: '#5a4a3a' }] }; }
    if (!busy && ((lever && ui.pressed) || input.keyHit('Enter'))) this.pull();
    this.leverK = this.pulled >= 0 ? Math.min(1, this.leverK + dt * 4) : 0;
    if (this.pulled >= 0) {
      this.pulled += dt;
      if (this.pulled > 0.55 && this.onDive) { const cb = this.onDive; const cfg = this.config(); this.pulled = -99; META.lastConfig = cfg; META.mastery = cfg.mastery; saveMeta(); cb(cfg); }
    }
    this.leverMesh.rotation.x = -0.55 + this.leverK * 1.35 + (this.pulled < 0 && lever ? Math.sin(this.t * 10) * 0.02 : 0);
    this.leverMat.emissiveIntensity = damp(this.leverMat.emissiveIntensity, lever ? 0.7 : 0.08 + Math.max(0, Math.sin(this.t * 3)) * 0.12, 10, dt);
    // the tray's page knobs
    if (arrow) { ui.cursor = 'point'; if (ui.pressed) { this.trayPage = Math.max(0, this.trayPage + arrow); audio.play('k_tick2', { vol: 0.35, dry: true }); } }
    this.refresh();
    // ---- the stash laid out on the tray and the pack, as 3D models; hover, click, drag
    this.layoutItems(dt, item);
    if (item && !this.drag) {
      const s = item.userData.slot as Slot;
      ui.cursor = 'grab';
      const d = getItem(s.id);
      const lines: TagLine[] = [{ text: d.name + ((s.level ?? 1) > 1 ? ` +${(s.level ?? 1) - 1}` : ''), font: 'title', color: RARITY_INK[d.rarity] ?? '#2a1808' }, { text: `${d.rarity} ${d.kind}`.toUpperCase(), color: '#5a4a3a' }];
      if (d.desc) lines.push({ text: d.desc, color: '#3a2810', gap: 2 });
      if ((s.n ?? 1) > 1) lines.push({ text: `${s.n} in the ${s.from === 'bag' ? 'stack' : 'stash'}`, color: '#1a4a7a' });
      lines.push({ text: s.from === 'bag' ? 'drag: move · click: unpack' : 'drag into the pack · click: pack', color: '#7a5a3a', gap: 2 });
      tip = { at: item.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0)), lines };
      if (ui.pressed) this.drag = { it: s.inst, from: s.from, sx: ui.mx, sy: ui.my, moved: false, rot: s.inst.rot, key: item.userData.key as string };
    }
    this.dragDrop(ui, input, ray);
    if (this.flash.t > 0) tip = { at: this.local(BAG.x, 0.2, BAG.z), lines: [{ text: this.flash.text, font: 'title', color: '#a01a1a' }] };
    // the floating paper note (every word on this table is painted on something)
    if (tip && !this.drag?.moved) { this.tag.show(tip.lines); this.tag.place(cam, tip.at, internalH, [0, -14], dt); } else this.tag.hide();
    // the mastery note card on the table
    const ml = MASTERY[this.mastery];
    const mods = masteryMods(this.mastery);
    this.card.set([
      { text: `MASTERY ${this.mastery}`, font: 'title', color: '#3a1a08' }, { text: ml.name.toUpperCase(), color: '#8a2a10' },
      ...(mods.length ? mods.slice(-3) : [ml.mod]).map((m, i, a) => ({ text: '· ' + m, color: i === a.length - 1 ? '#2a1808' : '#5a4a3a', gap: i === 0 ? 2 : 0 })),
      ...(this.mastery === META.masteryUnlocked && this.mastery < MAX_MASTERY ? [{ text: `win at M${this.mastery} to unlock M${this.mastery + 1}`, color: '#1a4a7a', gap: 2 }] : []),
    ]);
    if (!busy && !this.drag && (input.keyHit('Escape') || input.keyHit('KeyS') || input.keyHit('ArrowDown') || ui.rpressed)) this.onClose?.();
  }

  private pull() {
    if (this.pulled >= 0) return;
    this.pulled = 0;
    this.tag.hide();
    audio.play('clank1', { vol: 0.55 }); audio.play('chain1', { vol: 0.35, delay: 0.1 }); audio.play('bell', { vol: 0.35, delay: 0.35 });
  }
  /** the lever has been pulled (the dive is under way) */
  get diving() { return this.pulled !== -1; }
  /** leaving the table: the floating note goes */
  close() { this.tag.hide(); this.drag = null; }

  // ---------------------------------------------------------------- the 3D items
  /** a flat-lying item model (itemMesh: the icon extruded into voxels), centred on its footprint, base at y = 0 */
  private model(key: string, id: string, level: number): THREE.Group {
    let g = this.models.get(key);
    if (g && g.userData.id === id && g.userData.level === level) return g;
    if (g) g.removeFromParent();
    g = new THREE.Group();
    const inner = new THREE.Group();
    const m = itemMesh(id, level);
    m.rotation.x = -Math.PI / 2;
    inner.add(m);
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -box.min.y, -c.z);
    g.add(inner);
    g.userData = { key, id, level, size: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) };
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.userData.slotOwner = key; } });
    this.models.set(key, g);
    this.items.add(g);
    return g;
  }
  private countTex(n: number): THREE.Texture {
    let t = this.counts.get(n);
    if (!t) { const cv = paintTag([{ text: String(n), color: '#2a1808' }], 'paper', 30, 2); t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; t.userData = { w: cv.width, h: cv.height }; this.counts.set(n, t); }
    return t;
  }
  private setCount(g: THREE.Group, n: number, foot: number) {
    let lbl = g.userData.lbl as THREE.Mesh | undefined;
    if (n <= 1) { if (lbl) lbl.visible = false; return; }
    if (!lbl) { lbl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ toneMapped: false })); g.userData.lbl = lbl; this.items.add(lbl); }
    const t = this.countTex(n);
    (lbl.material as THREE.MeshBasicMaterial).map = t;
    lbl.visible = true;
    lbl.scale.set((t.userData.w as number) * 0.0026, 1, (t.userData.h as number) * 0.0026);
    lbl.position.set(g.position.x + foot * 0.38, g.position.y + 0.035, g.position.z + foot * 0.36);
  }

  /** the stash on the tray (paged) + the pack in the bag, as models; the hovered one lifts, a dropped one bounces */
  private layoutItems(dt: number, hover: THREE.Object3D | null) {
    const live = new Set<string>();
    const s = BAG.grid / GRID;
    const drag = this.drag?.moved ? this.drag : null;
    for (const it of this.pack) {
      const key = 'p' + it.uid;
      const g = this.model(key, it.id, it.level ?? 1);
      live.add(key);
      const cells = instCells(it);
      const xs = cells.map((q) => q[0]), ys = cells.map((q) => q[1]);
      const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2, cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
      const sz = shapeSize(getItem(it.id).shape);
      const foot = Math.max(sz.w, sz.h) * s;
      g.scale.setScalar((foot * 0.92) / Math.max(0.01, g.userData.size as number));
      g.rotation.y = -it.rot * Math.PI / 2;
      const dt0 = this.dropT.get(it.uid);
      const bounce = dt0 !== undefined ? Math.sin(Math.min(1, dt0 / 0.3) * Math.PI) * 0.05 : 0;
      const lift = hover === g ? 0.035 : 0;
      if (!(drag && drag.key === key)) g.position.set(BAG.x - BAG.grid / 2 + cx * s, 0.124 + bounce + lift, BAG.z - BAG.grid / 2 + cy * s);
      g.userData.slot = { id: it.id, level: it.level, n: it.n, from: 'bag', inst: it } as Slot;
      this.setCount(g, it.n ?? 1, foot);
    }
    // the tray: the stash entries of this page, one per tray cell
    const list = this.trayEntries();
    const cols = 8, rows = 2, per = cols * rows, cw = (TRAY.w - 0.06) / cols, ch = (TRAY.d - 0.06) / rows;
    const pages = Math.max(1, Math.ceil(list.length / per));
    this.trayPage = Math.min(this.trayPage, pages - 1);
    this.arrows[0].visible = this.trayPage > 0; this.arrows[1].visible = this.trayPage < pages - 1;
    list.slice(this.trayPage * per, this.trayPage * per + per).forEach((e, i) => {
      const key = e.it ? 't' + e.it.uid : 'm' + e.id;
      const g = this.model(key, e.id, e.it?.level ?? 1);
      live.add(key);
      const foot = Math.min(cw, ch) * 0.86;
      g.scale.setScalar(foot / Math.max(0.01, g.userData.size as number));
      g.rotation.y = 0;
      const lift = hover === g ? 0.035 : 0;
      if (!(drag && drag.key === key)) g.position.set(TRAY.x - TRAY.w / 2 + 0.03 + (i % cols + 0.5) * cw, 0.03 + lift, TRAY.z - TRAY.d / 2 + 0.03 + (Math.floor(i / cols) + 0.5) * ch);
      g.userData.slot = { id: e.id, level: e.it?.level ?? 1, n: e.n, from: 'tray', inst: e.it ?? { uid: 0, id: e.id, gx: -1, gy: -1, rot: 0, level: 1, n: Math.min(e.n, stackCap(e.id)) } } as Slot;
      this.setCount(g, e.kind === 'mat' ? e.n : 1, foot);
    });
    for (const [key, g] of this.models) if (!live.has(key)) { g.removeFromParent(); (g.userData.lbl as THREE.Mesh | undefined)?.removeFromParent(); this.models.delete(key); }
    // the empty-stash note
    this.emptyNote.mesh.visible = !list.length;
  }

  /** the stash laid out in the tray: gear first, then materials with how many are left */
  private trayEntries(): { kind: 'gear' | 'mat'; it?: ItemInst; id: string; n: number }[] {
    const out: { kind: 'gear' | 'mat'; it?: ItemInst; id: string; n: number }[] = [];
    for (const s of META.stash) if (ITEMS[s.id] && !this.inPack(s.uid)) out.push({ kind: 'gear', it: s, id: s.id, n: 1 });
    for (const [id, n] of Object.entries(META.materials)) { const left = n - this.packedMat(id); if (ITEMS[id] && left > 0) out.push({ kind: 'mat', id, n: left }); }
    return out;
  }

  /** the dragged model follows the mouse just above the table; the bag cells under it light green / red */
  private dragDrop(ui: PixelUI, input: Input, ray: THREE.Raycaster) {
    const d = this.drag;
    for (const c of this.cellHi) c.visible = false;
    if (!d) return;
    if (!d.moved && Math.hypot(ui.mx - d.sx, ui.my - d.sy) > 3) { d.moved = true; audio.play('k_pluck1', { vol: 0.35, dry: true }); }
    if (d.moved && (input.keyHit('KeyR') || ui.rpressed)) { d.rot = (d.rot + 1) % 4; audio.play('k_tick1', { vol: 0.25, dry: true }); }
    // the mouse on the table plane (local)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.nooks.table.top.y + 0.13));
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    const lp = hit ? this.g.worldToLocal(hit.clone()) : null;
    const s = BAG.grid / GRID;
    const probe: ItemInst = { ...d.it, gx: -1, gy: -1, rot: d.rot };
    const cells0 = instCells(probe, d.rot, 0, 0);
    const pw = Math.max(...cells0.map((q) => q[0])) + 1, ph = Math.max(...cells0.map((q) => q[1])) + 1;
    // the grab point is the shape's centre: its origin cell is offset by half the shape
    const gx = lp ? Math.round((lp.x - (BAG.x - BAG.grid / 2)) / s - pw / 2) : -99, gy = lp ? Math.round((lp.z - (BAG.z - BAG.grid / 2)) / s - ph / 2) : -99;
    const overBag = !!lp && Math.abs(lp.x - BAG.x) < BAG.w / 2 + 0.04 && Math.abs(lp.z - BAG.z) < BAG.d / 2 + 0.04;
    const others = this.pack.filter((p) => p.uid !== d.it.uid || d.from === 'tray');
    const stackTarget = overBag && stackCap(d.it.id) > 1 ? others.find((p) => p.id === d.it.id && p.uid < 0 && instCells(p).some(([x, y]) => x === gx + Math.floor(pw / 2) && y === gy + Math.floor(ph / 2))) : undefined;
    const ok = overBag && (!!stackTarget || fits(others, probe, gx, gy, d.rot));
    if (d.moved && lp) {
      ui.cursor = 'grab';
      const g = this.models.get(d.key);
      if (g) { g.position.set(lp.x, 0.16, lp.z); g.rotation.y = -d.rot * Math.PI / 2; }
      if (overBag) instCells(probe, d.rot, gx, gy).forEach(([x, y], i) => {
        const c = this.cellHi[i]; if (!c || x < 0 || y < 0 || x >= GRID || y >= GRID) return;
        c.visible = true; c.position.set(BAG.x - BAG.grid / 2 + (x + 0.5) * s, 0.126, BAG.z - BAG.grid / 2 + (y + 0.5) * s);
        (c.material as THREE.MeshBasicMaterial).color.set(ok ? '#4aff6a' : '#ff4a3a');
      });
    }
    if (ui.released) {
      if (!d.moved) {
        // a click: unpack from the bag, or pack from the tray
        if (d.from === 'bag') { this.pack = this.pack.filter((p) => p.uid !== d.it.uid); audio.play('k_drop2', { vol: 0.3, dry: true }); }
        else if (d.it.uid > 0) this.addGear(d.it);
        else this.addMat(d.it.id, d.it.n ?? 1);
      } else if (ok) {
        if (d.from === 'bag') {
          if (stackTarget) { const k = Math.min(stackCap(d.it.id) - (stackTarget.n ?? 1), d.it.n ?? 1); stackTarget.n = (stackTarget.n ?? 1) + k; d.it.n = (d.it.n ?? 1) - k; if ((d.it.n ?? 0) <= 0) this.pack = this.pack.filter((p) => p.uid !== d.it.uid); }
          else { d.it.gx = gx; d.it.gy = gy; d.it.rot = d.rot; }
          this.dropT.set(stackTarget?.uid ?? d.it.uid, 0);
        } else if (d.it.uid > 0) { this.pack.push({ ...d.it, gx, gy, rot: d.rot }); this.dropT.set(d.it.uid, 0); }
        else this.addMat(d.it.id, d.it.n ?? 1, stackTarget ? undefined : { gx, gy, rot: d.rot });
        audio.play('box_thud', { vol: 0.35, dry: true, rate: 1.6 }); audio.play('k_drop3', { vol: 0.3, dry: true });
      } else if (overBag) audio.play('k_err1', { vol: 0.35, dry: true });
      else if (d.from === 'bag') { this.pack = this.pack.filter((p) => p.uid !== d.it.uid); audio.play('k_drop2', { vol: 0.3, dry: true }); }
      this.drag = null;
    } else if (!ui.down && !ui.pressed) this.drag = null;
  }

  /** CSS-px centre of a table widget for tests: 'lever' | 'dial+' | 'dial-' | 'zone:<area>' | 'bag:<gx>,<gy>' */
  point(id: string, cam: THREE.Camera, w: number, h: number): [number, number] | null {
    let p: THREE.Vector3 | null = null;
    if (id === 'lever') p = this.leverMesh.localToWorld(new THREE.Vector3(0, 0.5, 0));
    else if (id === 'dial+') p = this.local(DIAL.x + DIAL.r * 0.6, 0.05, DIAL.z);
    else if (id === 'dial-') p = this.local(DIAL.x - DIAL.r * 0.6, 0.05, DIAL.z);
    else if (id.startsWith('zone:')) { const i = AREAS.findIndex((a) => a.id === id.slice(5)); const cx = (ZONE_X[i] + ZONE_X[i + 1]) / 2; p = this.local(CHART.x + (cx / CW - 0.5) * CHART.w, 0.01, CHART.z + 0.1); }
    else if (id.startsWith('tray:')) { for (const g of this.models.values()) { const sl = g.userData.slot as Slot | undefined; if (sl && sl.from === 'tray' && sl.id === id.slice(5)) { p = g.getWorldPosition(new THREE.Vector3()); break; } } }
    else if (id.startsWith('item:')) { for (const g of this.models.values()) { const sl = g.userData.slot as Slot | undefined; if (sl && sl.from === 'bag' && sl.id === id.slice(5)) { p = g.getWorldPosition(new THREE.Vector3()); break; } } }
    else if (id.startsWith('bag:')) { const [gx, gy] = id.slice(4).split(',').map(Number); const s = BAG.grid / GRID; p = this.local(BAG.x - BAG.grid / 2 + (gx + 0.5) * s, 0.122, BAG.z - BAG.grid / 2 + (gy + 0.5) * s); }
    if (!p) return null;
    const v = p.project(cam);
    return [Math.round((v.x * 0.5 + 0.5) * w), Math.round((-v.y * 0.5 + 0.5) * h)];
  }
}
void clamp01;
