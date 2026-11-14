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
import { ITEMS, getItem, GRID, fits, instCells, findSpot, stackCap, RARITY_COLOR } from '../game/items';
import type { ItemInst } from '../game/run';
import type { PixelUI, TipLine } from '../ui/pixel/ui';
import type { Input } from '../core/input';
import { drawText, wrap } from '../ui/pixel/font';
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

interface Drag { it: ItemInst; from: 'tray' | 'bag'; sx: number; sy: number; moved: boolean; rot: number }

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
  private v = new THREE.Vector3();
  private hoverLever = false;

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
  /** world -> ui px */
  private toUi(p: THREE.Vector3, cam: THREE.Camera, ui: PixelUI): [number, number] {
    const v = this.v.copy(p).project(cam);
    return [((v.x * 0.5 + 0.5) * ui.w), ((-v.y * 0.5 + 0.5) * ui.h)];
  }
  private local(x: number, y: number, z: number) { return this.g.localToWorld(new THREE.Vector3(x, y, z)); }

  /** returns true while the table keeps the screen (false = closed) */
  update(dt: number, ui: PixelUI, input: Input, cam: THREE.Camera, ray: THREE.Raycaster): void {
    this.t += dt;
    this.flash.t -= dt;
    for (const [k, v] of this.dropT) { if (v > 0.6) this.dropT.delete(k); else this.dropT.set(k, v + dt); }
    this.g.updateWorldMatrix(true, true);
    const busy = this.pulled >= 0;
    // ---- 3D picks: the chart (start depth), the dial, the lever, the posters
    let zone = -1, dialSide = 0, lever = false, poster = -1;
    if (!busy && ui.inside && !ui.mouseOnUI && !this.drag?.moved) {
      for (const h of ray.intersectObjects([this.chartMesh, this.dialMesh, this.leverMesh, ...this.posters.map((p) => p.m)], true)) {
        if (h.object === this.chartMesh && h.uv) { const x = h.uv.x * CW, z = zoneOf(x); if (z >= 0) zone = z; break; }
        if (h.object === this.dialMesh) { const lp = this.g.worldToLocal(h.point.clone()); dialSide = lp.x < DIAL.x ? -1 : 1; break; }
        if (h.object.userData.lever) { lever = true; break; }
        if (h.object.userData.poster !== undefined) { poster = h.object.userData.poster as number; break; }
      }
    }
    // the depths: hover highlights, click picks the start (if mastery allows)
    if (zone !== this.hoverZone) { this.hoverZone = zone; if (zone >= 0) audio.play('page1', { vol: 0.12, dry: true, rate: 1.6 }); }
    if (zone >= 0) {
      const a = AREAS[zone], locked = a.minMastery > this.mastery;
      ui.cursor = locked ? 'arrow' : 'point';
      const route = routeFor(this.mastery, a.id).map((id) => AREAS.find((q) => q.id === id)!.name.replace('The ', ''));
      ui.tooltip([{ text: a.name, font: 'title' }, { text: a.desc, color: '#3a2810' }, locked ? { text: `needs mastery ${a.minMastery}`, color: '#a01a1a', gap: 2 } : { text: `${route.length} floors: ${route.join(' > ')}`, color: '#1a4a7a', gap: 2 }], { maxW: 190 });
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
    if (dialSide) { ui.cursor = 'point'; if (ui.pressed) setM(this.mastery + dialSide); if (ui.wheel) setM(this.mastery - Math.sign(ui.wheel)); }
    if (!busy && (input.keyHit('KeyD') || input.keyHit('ArrowRight'))) setM(this.mastery + 1);
    if (!busy && (input.keyHit('KeyA') || input.keyHit('ArrowLeft'))) setM(this.mastery - 1);
    this.needleA = damp(this.needleA, dialAngle(this.mastery), 12, dt);
    this.needle.rotation.y = -this.needleA;
    this.compassNeedle.rotation.y = Math.sin(this.t * 0.7) * 0.15 + Math.sin(this.t * 2.3) * 0.04;
    // posters
    if (poster >= 0) {
      const n = META.nemeses[poster];
      const tip: TipLine[] = n ? [{ text: n.name, font: 'title' }, { text: n.title, color: '#7a2a10' }, { text: `level ${n.level} · beat you ${n.kills}x · you beat them ${n.defeats}x`, color: '#3a2810', gap: 2 }, ...n.memories.slice(0, 3).map((m) => ({ text: '"' + m + '"', color: '#1a4a7a' }))]
        : [{ text: 'WANTED', font: 'title' }, { text: 'No grudges yet. Humans who beat you, or get away, end up pinned here.', color: '#3a2810' }];
      if (n && !n.alive) tip.push({ text: 'DEFEATED', color: '#a01a1a', gap: 2 });
      ui.tooltip(tip, { maxW: 180 });
    }
    // the lever
    this.hoverLever = lever;
    if (lever) { ui.cursor = 'point'; ui.tooltip([{ text: 'DIVE', font: 'title' }, { text: `${routeFor(this.mastery, this.start).length} floors from the ${AREAS.find((a) => a.id === this.start)?.name.toLowerCase()} · M${this.mastery}`, color: '#3a2810' }], { maxW: 170 }); }
    if (!busy && ((lever && ui.pressed) || input.keyHit('Enter'))) this.pull();
    this.leverK = this.pulled >= 0 ? Math.min(1, this.leverK + dt * 4) : 0;
    if (this.pulled >= 0) {
      this.pulled += dt;
      if (this.pulled > 0.55 && this.onDive) { const cb = this.onDive; const cfg = this.config(); this.pulled = -99; META.lastConfig = cfg; META.mastery = cfg.mastery; saveMeta(); cb(cfg); }
    }
    this.leverMesh.rotation.x = -0.55 + this.leverK * 1.35 + (this.pulled < 0 && lever ? Math.sin(this.t * 10) * 0.02 : 0);
    this.leverMat.emissiveIntensity = damp(this.leverMat.emissiveIntensity, lever ? 0.7 : 0.08 + Math.max(0, Math.sin(this.t * 3)) * 0.12, 10, dt);
    this.refresh();

    // ---- 2D: the note card, the bag grid + items, the tray, drag & drop
    this.noteCard(ui, cam);
    const bag = this.bagRect(ui, cam);
    const tray = this.trayRect(ui, cam);
    this.drawBag(ui, bag, busy);
    this.drawTray(ui, tray, busy);
    this.dragDrop(ui, input, bag);
    if (this.flash.t > 0) {
      const w = ui.measure(this.flash.text, 'title') + 16;
      ui.frame('dark', Math.round(bag.x + bag.cell * 2.5 - w / 2), Math.round(bag.y + bag.cell * 2) - 4, w, 20);
      ui.text(this.flash.text, Math.round(bag.x + bag.cell * 2.5), Math.round(bag.y + bag.cell * 2), { font: 'title', color: '#ff6a5a', shadow: '#000', align: 'center' });
    }
    // leaving: Esc / right click on nothing / S
    const hx = 6;
    let hxx = hx;
    hxx += ui.hint('ESC', 'back', hxx, ui.h - 14, { color: '#e8dcc0' });
    hxx += ui.hint('A', '', hxx, ui.h - 14, { color: '#e8dcc0' }) - 6;
    hxx += ui.hint('D', 'mastery', hxx, ui.h - 14, { color: '#e8dcc0' });
    ui.hint('ENTER', 'dive', hxx, ui.h - 14, { color: '#e8dcc0' });
    if (!busy && !this.drag && (input.keyHit('Escape') || input.keyHit('KeyS') || input.keyHit('ArrowDown'))) this.onClose?.();
  }

  private pull() {
    if (this.pulled >= 0) return;
    this.pulled = 0;
    audio.play('clank1', { vol: 0.55 }); audio.play('chain1', { vol: 0.35, delay: 0.1 }); audio.play('bell', { vol: 0.35, delay: 0.35 });
  }
  /** the lever has been pulled (the dive is under way) */
  get diving() { return this.pulled !== -1; }

  private noteCard(ui: PixelUI, cam: THREE.Camera) {
    const [dx, dy] = this.toUi(this.local(DIAL.x, 0, DIAL.z), cam, ui);
    const ml = MASTERY[this.mastery];
    const mods = masteryMods(this.mastery);
    const w = 112;
    const lines = mods.length ? mods.slice(-3) : [ml.mod];
    let h = 30;
    for (const l of lines) h += wrap('· ' + l, 'small', w - 12).length * ui.lh('small');
    const rr = this.toUi(this.local(DIAL.x + DIAL.r, 0, DIAL.z), cam, ui)[0] - dx;
    const x = Math.round(Math.min(ui.w - w - 4, dx + Math.abs(rr) + 6)), y = Math.round(Math.max(4, Math.min(ui.h - h - 20, dy - Math.abs(rr) + 2)));
    ui.frame('paper', x, y, w, h);
    ui.fill(x + w / 2 - 2, y + 2, 4, 4, '#c8241c');
    ui.text(`MASTERY ${this.mastery}`, x + 6, y + 6, { font: 'title', color: '#3a1a08' });
    ui.text(ml.name.toUpperCase(), x + 6, y + 18, { font: 'small', color: '#8a2a10' });
    let yy = y + 29;
    for (const l of lines) yy += ui.textBox('· ' + l, x + 6, yy, w - 12, { font: 'small', color: l === ml.mod ? '#2a1808' : '#5a4a3a' });
    if (mods.length > 3 && ui.hover(x, y, w, h)) ui.tooltip(mods.map((m) => '· ' + m), { maxW: 200 });
    if (this.mastery === META.masteryUnlocked && this.mastery < MAX_MASTERY) ui.text(`win at M${this.mastery} to unlock M${this.mastery + 1}`, x + w / 2, y + h + 3, { font: 'small', color: '#e8dcc0', shadow: '#000', align: 'center' });
    ui.block(x, y, w, h);
  }

  private bagRect(ui: PixelUI, cam: THREE.Camera) {
    const a = this.toUi(this.local(BAG.x - BAG.grid / 2, 0.122, BAG.z - BAG.grid / 2), cam, ui);
    const b = this.toUi(this.local(BAG.x + BAG.grid / 2, 0.122, BAG.z + BAG.grid / 2), cam, ui);
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const cell = Math.max(12, Math.floor(Math.min((x1 - x0) / GRID, (y1 - y0) / GRID)));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { x: Math.round(cx - (cell * GRID) / 2), y: Math.round(cy - (cell * GRID) / 2), cell };
  }
  private trayRect(ui: PixelUI, cam: THREE.Camera) {
    const a = this.toUi(this.local(TRAY.x - TRAY.w / 2 + 0.03, 0.03, TRAY.z - TRAY.d / 2 + 0.03), cam, ui);
    const b = this.toUi(this.local(TRAY.x + TRAY.w / 2 - 0.03, 0.03, TRAY.z + TRAY.d / 2 - 0.03), cam, ui);
    return { x: Math.round(Math.min(a[0], b[0])), y: Math.round(Math.min(a[1], b[1])), w: Math.round(Math.abs(b[0] - a[0])), h: Math.round(Math.abs(b[1] - a[1])) };
  }

  private drawBag(ui: PixelUI, b: { x: number; y: number; cell: number }, busy: boolean) {
    const c = b.cell, gw = c * GRID;
    // faint cell guides over the stitched leather
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) ui.rect(b.x + i * c, b.y + j * c, c, c, '#00000033');
    const drag = this.drag?.moved ? this.drag : null;
    let hover: ItemInst | null = null;
    for (const it of this.pack) {
      if (drag && drag.from === 'bag' && drag.it.uid === it.uid) continue;
      const cells = instCells(it);
      const xs = cells.map((q) => q[0]), ys = cells.map((q) => q[1]);
      const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
      const dt0 = this.dropT.get(it.uid);
      const bounce = dt0 !== undefined ? -Math.round(Math.sin(Math.min(1, dt0 / 0.3) * Math.PI) * 3) : 0;
      const d = getItem(it.id);
      for (const [cx, cy] of cells) ui.fill(b.x + cx * c + 1, b.y + cy * c + 1, c - 2, c - 2, RARITY_COLOR[d.rarity], 0.22);
      ui.item(it.id, b.x + minX * c + 1, b.y + minY * c + 1 + bounce, (maxX - minX + 1) * c - 2, (maxY - minY + 1) * c - 2, it.level ?? 1);
      if ((it.n ?? 1) > 1) ui.text(String(it.n), b.x + (maxX + 1) * c - 2, b.y + (maxY + 1) * c - 9, { font: 'small', color: '#ffffff', outline: '#000', align: 'right' });
      if (!drag && !busy && cells.some(([cx, cy]) => ui.hover(b.x + cx * c, b.y + cy * c, c, c))) hover = it;
    }
    ui.mark('tbl:bag', b.x, b.y, gw, gw);
    if (hover) {
      const h = hover as ItemInst;
      ui.cursor = 'grab';
      ui.tooltip(ui.itemTip(h.id, h.level ?? 1, [{ text: (h.n ?? 1) > 1 ? `x${h.n} · drag to move · click to unpack` : 'drag to move · click to unpack', font: 'small', color: '#7a2a1a', gap: 2 }]));
      if (ui.pressed && !this.drag) this.drag = { it: h, from: 'bag', sx: ui.mx, sy: ui.my, moved: false, rot: h.rot };
    }
    if (ui.hover(b.x, b.y, gw, gw)) ui.block(b.x, b.y, gw, gw);
    // the pack's fill: a tiny tally stitched under the bag
    let used = 0; for (const it of this.pack) used += instCells(it).length;
    ui.text(`${used}/${GRID * GRID}`, b.x + gw, b.y + gw + 3, { font: 'small', color: used >= GRID * GRID ? '#ff8a6a' : '#e8dcc0', shadow: '#000', align: 'right' });
  }

  /** the stash laid out in the tray: gear first, then materials with how many are left; paged */
  private trayEntries(): { kind: 'gear' | 'mat'; it?: ItemInst; id: string; n: number }[] {
    const out: { kind: 'gear' | 'mat'; it?: ItemInst; id: string; n: number }[] = [];
    for (const s of META.stash) if (ITEMS[s.id] && !this.inPack(s.uid)) out.push({ kind: 'gear', it: s, id: s.id, n: 1 });
    for (const [id, n] of Object.entries(META.materials)) { const left = n - this.packedMat(id); if (ITEMS[id] && left > 0) out.push({ kind: 'mat', id, n: left }); }
    return out;
  }
  private drawTray(ui: PixelUI, r: { x: number; y: number; w: number; h: number }, busy: boolean) {
    const list = this.trayEntries();
    const cell = 18, cols = Math.max(1, Math.floor((r.w - 4) / cell)), rows = Math.max(1, Math.floor((r.h - 2) / cell));
    const per = cols * rows, pages = Math.max(1, Math.ceil(list.length / per));
    this.trayPage = Math.min(this.trayPage, pages - 1);
    const x0 = r.x + Math.floor((r.w - cols * cell) / 2), y0 = r.y + Math.floor((r.h - rows * cell) / 2);
    if (!list.length) ui.textBox('The stash is empty. Mail loot home on runs.', r.x + 4, r.y + 4, r.w - 8, { font: 'small', color: '#e8dcc0', shadow: '#000' });
    list.slice(this.trayPage * per, this.trayPage * per + per).forEach((e, i) => {
      const x = x0 + (i % cols) * cell, y = y0 + Math.floor(i / cols) * cell;
      const lifted = this.drag?.moved && this.drag.from === 'tray' && this.drag.it.id === e.id && (e.kind === 'mat' || this.drag.it.uid === e.it!.uid);
      const over = !busy && !this.drag?.moved && ui.hover(x, y, cell - 1, cell - 1);
      ui.fill(x, y, cell - 1, cell - 1, '#1a0e06', over ? 0.55 : 0.32);
      if (over) ui.rect(x, y, cell - 1, cell - 1, '#fff0c0');
      ui.item(e.id, x + 1, y + 1, cell - 3, cell - 3, e.it?.level ?? 1, lifted ? 0.35 : 1);
      if (e.kind === 'mat') ui.text(String(e.n), x + cell - 2, y + cell - 9, { font: 'small', color: '#ffffff', outline: '#000', align: 'right' });
      else if ((e.it!.level ?? 1) > 1) ui.text(`+${(e.it!.level ?? 1) - 1}`, x + cell - 2, y + 1, { font: 'small', color: '#8aff7a', outline: '#000', align: 'right' });
      ui.mark('tbl:tray:' + e.id, x, y, cell - 1, cell - 1);
      if (over) {
        ui.cursor = 'grab';
        ui.tooltip(ui.itemTip(e.id, e.it?.level ?? 1, [{ text: e.kind === 'mat' ? `${e.n} in the stash · click: pack ${Math.min(e.n, stackCap(e.id))} · drag: place` : 'click or drag into the backpack', font: 'small', color: '#1a4a7a', gap: 2 }]));
        if (ui.pressed && !this.drag) this.drag = { it: e.it ? e.it : { uid: 0, id: e.id, gx: -1, gy: -1, rot: 0, level: 1, n: Math.min(e.n, stackCap(e.id)) }, from: 'tray', sx: ui.mx, sy: ui.my, moved: false, rot: 0 };
      }
    });
    if (ui.hover(r.x, r.y, r.w, r.h)) ui.block(r.x, r.y, r.w, r.h);
    if (pages > 1) {
      if (this.trayPage > 0 && ui.iconButton('tbl:prev', 'left', r.x - 16, r.y + r.h / 2 - 7, { style: 'wood', size: 13 })) this.trayPage--;
      if (this.trayPage < pages - 1 && ui.iconButton('tbl:next', 'right', r.x + r.w + 3, r.y + r.h / 2 - 7, { style: 'wood', size: 13 })) this.trayPage++;
    }
  }

  private dragDrop(ui: PixelUI, input: Input, b: { x: number; y: number; cell: number }) {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(ui.mx - d.sx, ui.my - d.sy) > 3) { d.moved = true; audio.play('k_pluck1', { vol: 0.35, dry: true }); }
    if (d.moved && (input.keyHit('KeyR') || ui.rpressed)) { d.rot = (d.rot + 1) % 4; audio.play('k_tick1', { vol: 0.25, dry: true }); }
    const c = b.cell;
    const gx = Math.floor((ui.mx - b.x) / c), gy = Math.floor((ui.my - b.y) / c);
    const overBag = ui.mx >= b.x && ui.my >= b.y && ui.mx < b.x + c * GRID && ui.my < b.y + c * GRID;
    const probe: ItemInst = { ...d.it, gx: -1, gy: -1, rot: d.rot };
    const others = this.pack.filter((p) => p.uid !== d.it.uid || d.from === 'tray');
    // a material dropped onto a stack of the same kind tops it up
    const stackTarget = overBag && stackCap(d.it.id) > 1 ? others.find((p) => p.id === d.it.id && p.uid < 0 && instCells(p).some(([x, y]) => x === gx && y === gy)) : undefined;
    const ok = overBag && (!!stackTarget || fits(others, probe, gx, gy, d.rot));
    if (d.moved) {
      ui.cursor = 'grab';
      if (overBag) for (const [x, y] of instCells(probe, d.rot, gx, gy)) {
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
        ui.fill(b.x + x * c + 1, b.y + y * c + 1, c - 2, c - 2, ok ? '#2aa84a' : '#a82a2a', 0.5);
      }
      const cells = instCells(probe, d.rot, 0, 0);
      const w = (Math.max(...cells.map((q) => q[0])) - Math.min(...cells.map((q) => q[0])) + 1) * c, h = (Math.max(...cells.map((q) => q[1])) - Math.min(...cells.map((q) => q[1])) + 1) * c;
      ui.fill(ui.mx - c / 2 + 2, ui.my - c / 2 + 3, w, h, '#000000', 0.4);
      ui.item(d.it.id, ui.mx - c / 2, ui.my - c / 2, w, h, d.it.level ?? 1);
    }
    if (ui.released) {
      if (!d.moved) {
        // a click: unpack from the bag, or pack from the tray
        if (d.from === 'bag') { this.pack = this.pack.filter((p) => p.uid !== d.it.uid); audio.play('k_drop2', { vol: 0.3, dry: true }); }
        else if (d.it.uid > 0 || (d.it.uid === 0 && stackCap(d.it.id) <= 1 && ITEMS[d.it.id]?.kind !== 'material')) this.addGear(d.it);
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
    else if (id.startsWith('bag:')) { const [gx, gy] = id.slice(4).split(',').map(Number); const s = BAG.grid / GRID; p = this.local(BAG.x - BAG.grid / 2 + (gx + 0.5) * s, 0.122, BAG.z - BAG.grid / 2 + (gy + 0.5) * s); }
    if (!p) return null;
    const v = p.project(cam);
    return [Math.round((v.x * 0.5 + 0.5) * w), Math.round((-v.y * 0.5 + 0.5) * h)];
  }
}
void clamp01;
