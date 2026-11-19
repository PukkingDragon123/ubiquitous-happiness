// The PACKING SCENE on the porch outside the front door (it replaces v3's map table). A low cinematic shot of the
// open sea chest (the stash) and the open backpack side by side on the sand, lit by a porch lantern:
//   - drag loot and gear (agent L's 3D item models) from the chest into the pack's grid (click packs / unpacks,
//     R or right click turns while dragging, materials stack); the chest pages with two brass knobs
//   - your BUILD laid out: a 3D skill card for every skill the packed gear grants (L's SkillCard3D), and a
//     pinned paper note (v5, top left) with the set bonuses, the stat changes and the mastery
//   - a small brass MASTERY dial (click a half / scroll / A D) with a brass label plate and ◄ ► under it
//   - SWIM OUT: the painted sign, or the big green button (Enter) -> onDive(cfg); HOME: the sign, the button (Esc)
// v5: the hovered item gets a card by it (photo-less: its name in rarity colour, kind, stats, what a click does).
//
//   const p = new Packing(house); p.open(); each frame in packing mode: p.update(dt, ui, input, camera, ray, internalH)
//   p.shot() -> the camera shot;  p.config() -> TableConfig (RunConfig + pack + mats, start area 'reef')
import * as THREE from 'three';
import { Kit } from './kit';
import { MAT } from './tex';
import { retro } from '../gfx/retro';
import { Px } from '../gfx/px';
import { damp } from '../core/math';
import { META, saveMeta, type RunConfig } from '../meta/meta';
import { MASTERY, MAX_MASTERY, masteryMods } from './mastery';
import { ITEMS, getItem, GRID_W, GRID_H, fits, instCells, findSpot, stackCap, shapeSize, setBonuses, setCounts, applyItems, SKILL_NAMES } from '../game/items';
import { BASE_STATS, type ItemInst } from '../game/run';
import { itemModel } from '../backpack/models';
import type { PixelUI } from '../ui/pixel/ui';
import type { Input } from '../core/input';
import { drawText } from '../ui/pixel/font';
import { UiStage } from '../ui/obj/stage';
import { SkillCard3D } from '../ui/obj/cards';
import { audio } from '../audio/audio';
import { paintTag } from './tag';
import { K, itemHead, itemBody, buildLines } from './itemCard';
import { wellArt } from './panelArt';
import { PORCH, type House } from './house';
import type { Shot } from './camera';

/** the run config the dive gets: RunConfig + the packed grid (gear keeps its stash uid; material stacks: uid < 0, n) */
export interface TableConfig extends RunConfig {
  pack: ItemInst[];
  mats: Record<string, number>;
}

// set-local layout (x right, z toward the camera), the set is at PORCH.set
const CHEST = { x: -1.2, z: 0.0, w: 1.7, d: 0.95, floor: 0.11 };
const CELL = 0.15;
const BAG = { x: 1.22, z: 0.0, gw: GRID_W * CELL, gd: GRID_H * CELL, floor: 0.21 };
const DIAL = { x: 0.0, z: 0.62, r: 0.15, y: 0.16 };

function canvasTex(cv: HTMLCanvasElement) { const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t; }
/** needle angle for a mastery level across a 300 degree sweep (0 = up, clockwise) */
const dialAngle = (m: number) => (-150 + (m / MAX_MASTERY) * 300) * (Math.PI / 180);
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
    const a = dialAngle(i), locked = i > META.masteryUnlocked;
    drawText(ctx, String(i), S / 2 + Math.sin(a) * S * 0.33, S / 2 - Math.cos(a) * S * 0.33 - 3, { font: 'small', color: i === mastery ? '#a8140c' : locked ? '#8a6a3a' : '#2a1404', align: 'center' });
  }
  return cv;
}
/** a wooden arrow sign on a post, its words painted on (dir 1 = pointing right, -1 = left) */
function arrowSign(label: string, dir: 1 | -1, scale = 1): { group: THREE.Group; board: THREE.Object3D; mat: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const k = new Kit();
  k.box(MAT.wood('drift'), 0.12, 1.5, 0.12, 0, 0.75, -0.05);
  k.add(MAT.wood('drift'), new THREE.ConeGeometry(0.1, 0.14, 4), 0, 1.57, -0.05, { ry: Math.PI / 4 });
  for (let i = 0; i < 3; i++) k.sphere(MAT.rock(), 0.1 + i * 0.03, (i - 1) * 0.16, 0.04, 0.05, { w: 5, h: 4, sy: 0.6 });
  g.add(k.build());
  const cv = paintTag([{ text: label, font: 'title', color: '#fff0c8' }], 'wood', 200, 6);
  const tex = canvasTex(cv);
  const m = retro(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: '#ff9a40', emissiveMap: tex, emissiveIntensity: 0, side: THREE.DoubleSide }));
  const w = cv.width * 0.0062 * scale, h = cv.height * 0.0062 * scale, tip = h * 0.55;
  // the arrow outline (the tip on the pointing side); the painted words map onto the straight part either way
  const pts: [number, number][] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  if (dir > 0) pts.splice(2, 0, [w / 2 + tip, 0]); else pts.push([-w / 2 - tip, 0]);
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const sg = new THREE.ShapeGeometry(shape);
  const uv = sg.attributes.uv as THREE.BufferAttribute, P = sg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, Math.max(0, Math.min(1, (P.getX(i) + w / 2) / w)), (P.getY(i) + h / 2) / h);
  const board = new THREE.Mesh(sg, m);
  const back = new THREE.Mesh(sg, MAT.wood('drift')); back.position.z = -0.025;
  const bg = new THREE.Group(); bg.add(board, back); bg.position.set(dir * 0.1, 1.2, 0.03);
  g.add(bg);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return { group: g, board: bg, mat: m };
}

const HITBOX = new THREE.MeshBasicMaterial({ visible: false });
interface Drag { it: ItemInst; from: 'chest' | 'bag'; sx: number; sy: number; moved: boolean; rot: number; key: string }
interface Slot { id: string; level?: number; n?: number; from: 'chest' | 'bag'; inst: ItemInst }

export class Packing {
  mastery = 0;
  pack: ItemInst[] = [];
  onDive?: (cfg: TableConfig) => void;
  onClose?: () => void;
  set = new THREE.Group();
  private items = new THREE.Group();
  private models = new Map<string, THREE.Group>();
  private counts = new Map<number, THREE.Texture>();
  private cellHi: THREE.Mesh[] = [];
  private knobs: THREE.Object3D[] = [];
  private dialMesh: THREE.Mesh;
  private dialTex: THREE.CanvasTexture;
  private needle = new THREE.Group();
  private needleA = 0;
  private swim: ReturnType<typeof arrowSign>;
  private home: ReturnType<typeof arrowSign>;
  private lid = new THREE.Group();
  private bagFlap = new THREE.Group();
  private stage = new UiStage();
  private cards: { id: string; c: SkillCard3D }[] = [];
  private cardKey = '';
  private drag: Drag | null = null;
  private flash = { text: '', t: 0 };
  private page = 0;
  private nextMatUid = -1;
  private dropT = new Map<number, number>();
  private t = 0;
  private openK = 0;
  diving = false;

  constructor(private house: House) {
    const S = this.set;
    S.position.copy(PORCH.set);
    house.group.add(S);
    const k = new Kit();
    // a weathered driftwood deck the chest and the pack sit on: planks across two sleepers, a few warped or short
    for (const sz of [-0.55, 0.55]) k.box(MAT.wood('drift'), 4.5, 0.05, 0.16, 0, 0.025, sz, { chamfer: 0.01 });
    for (let i = 0; i < 10; i++) {
      const j = Math.sin(i * 12.9898) * 43758.5453, r = j - Math.floor(j), r2 = (j * 7.3) - Math.floor(j * 7.3);
      k.box(MAT.wood(i % 3 === 1 ? 'pine' : 'drift'), 0.43, 0.05, 1.6 - (i === 3 || i === 8 ? 0.35 : r * 0.12), -2.07 + i * 0.46, 0.075 + r2 * 0.008, (i === 3 ? 0.17 : i === 8 ? -0.17 : 0) + (r - 0.5) * 0.06, { ry: (r - 0.5) * 0.05, rz: (r2 - 0.5) * 0.02, chamfer: 0.012 });
    }
    // ---- the open sea chest: a hollow box (walls, a dark lining), the domed lid thrown back, iron bands
    const wood = MAT.wood('red'), iron = MAT.metal('grey'), lining = MAT.plain('#3a1810/0.95');
    const { x, z, w, d } = CHEST;
    k.slab(wood, w, 0.1, d, x, 0.1, z);
    k.box(lining, w - 0.1, 0.01, d - 0.1, x, 0.205, z, { chamfer: 0 });
    for (const sz of [-1, 1]) k.slab(wood, w, 0.36, 0.07, x, 0.1, z + sz * (d / 2 - 0.035));
    for (const sx of [-1, 1]) k.slab(wood, 0.07, 0.36, d, x + sx * (w / 2 - 0.035), 0.1, z);
    for (const sx of [-0.55, 0, 0.55]) k.box(iron, 0.06, 0.38, d + 0.02, x + sx, 0.29, z, { chamfer: 0.01 });
    k.box(MAT.brass(), 0.16, 0.14, 0.03, x, 0.38, z + d / 2 + 0.02);
    S.add(k.build());
    this.lid.position.set(x, 0.46, z - d / 2);
    const lk = new Kit();
    const lg = new THREE.CylinderGeometry(d / 2, d / 2, w, 8, 1, false, -Math.PI / 2, Math.PI); lg.rotateZ(Math.PI / 2); lg.scale(1, 0.55, 1);
    lk.add(wood, lg, 0, 0, d / 2);
    for (const sx of [-0.55, 0, 0.55]) { const gb = new THREE.CylinderGeometry(d / 2 + 0.015, d / 2 + 0.015, 0.06, 8, 1, false, -Math.PI / 2, Math.PI); gb.rotateZ(Math.PI / 2); gb.scale(1, 0.56, 1); lk.add(iron, gb, sx, 0, d / 2); }
    this.lid.add(lk.build());
    S.add(this.lid);
    // ---- the open backpack: leather sides, the stitched grid lining, the flap thrown back with its straps
    const bk = new Kit(), lea = MAT.leather('brown');
    const bw = BAG.gw + 0.14, bd = BAG.gd + 0.14;
    bk.slab(lea, bw, 0.1, bd, BAG.x, 0.1, BAG.z);
    for (const sx of [-1, 1]) bk.box(lea, 0.06, 0.2, bd, BAG.x + sx * bw / 2, 0.2, BAG.z);
    bk.box(lea, bw, 0.2, 0.06, BAG.x, 0.2, BAG.z + bd / 2);
    bk.box(lea, bw, 0.26, 0.06, BAG.x, 0.23, BAG.z - bd / 2);
    for (const sx of [-0.3, 0.3]) bk.box(MAT.leather('black'), 0.06, 0.012, 0.7, BAG.x + sx, 0.11, BAG.z - bd / 2 - 0.4);
    S.add(bk.build());
    const gp = new Px(GRID_W * 10, GRID_H * 10);
    gp.fill((xx, yy) => ((xx % 10 === 0 || yy % 10 === 0) ? ((xx + yy) % 2 ? [120, 82, 46] : [60, 38, 20]) : [42, 28, 18]));
    const innerM = retro(new THREE.MeshStandardMaterial({ map: gp.texture({ mip: false }), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(BAG.gw, BAG.gd).rotateX(-Math.PI / 2), innerM);
    inner.position.set(BAG.x, 0.212, BAG.z);
    S.add(inner);
    this.bagFlap.position.set(BAG.x, 0.36, BAG.z - bd / 2);
    const fk = new Kit(); fk.box(lea, bw + 0.04, 0.03, 0.45, 0, 0, -0.22); this.bagFlap.add(fk.build());
    S.add(this.bagFlap);
    S.add(this.items);
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(CELL - 0.01, CELL - 0.01).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4aff6a', transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }));
      c.visible = false; S.add(c); this.cellHi.push(c);
    }
    // the chest's page knobs (front corners)
    for (const dir of [-1, 1]) {
      const kn = new Kit();
      kn.cyl(MAT.brass(), 0.045, 0.05, 0.05, 0, 0.025, 0, { seg: 8 });
      kn.add(MAT.plain('#2a1404/0.5'), new THREE.ConeGeometry(0.025, 0.05, 3), dir * 0.006, 0.06, 0, { rz: -dir * Math.PI / 2 });
      const a = kn.build(); a.position.set(CHEST.x + dir * (CHEST.w / 2 + 0.12), 0.1, CHEST.z + CHEST.d / 2); a.traverse((o) => { o.userData.knob = dir; }); a.userData.knob = dir;
      S.add(a); this.knobs.push(a);
    }
    // ---- the mastery dial on a little stone between them
    const dk = new Kit();
    dk.cyl(MAT.rock(), 0.24, 0.3, 0.12, DIAL.x, 0.06, DIAL.z, { seg: 8 });
    dk.cyl(MAT.wood('walnut'), DIAL.r + 0.03, DIAL.r + 0.04, 0.03, DIAL.x, DIAL.y - 0.02, DIAL.z, { seg: 10 });
    S.add(dk.build());
    this.dialTex = canvasTex(paintDial(0));
    this.dialMesh = new THREE.Mesh(new THREE.CircleGeometry(DIAL.r, 20).rotateX(-Math.PI / 2), retro(new THREE.MeshStandardMaterial({ map: this.dialTex, roughness: 0.4, metalness: 0.5, transparent: true, alphaTest: 0.5 })));
    this.dialMesh.position.set(DIAL.x, DIAL.y, DIAL.z);
    S.add(this.dialMesh);
    const nk = new Kit();
    nk.box(MAT.plain('#a8140c/0.4/0.3'), 0.016, 0.01, DIAL.r * 0.8, 0, 0, -DIAL.r * 0.38, { chamfer: 0 });
    nk.cyl(MAT.brass(), 0.025, 0.025, 0.025, 0, 0.004, 0, { seg: 8 });
    this.needle.add(nk.build()); this.needle.position.set(DIAL.x, DIAL.y + 0.008, DIAL.z);
    S.add(this.needle);
    // ---- the signs: SWIM OUT (on, away from home) and HOME (back inside)
    this.swim = arrowSign('SWIM OUT', 1, 1.0);
    this.swim.group.position.set(2.45, 0, -0.75); this.swim.group.rotation.y = -0.25;
    this.swim.group.traverse((o) => { o.userData.sign = 'swim'; });
    this.home = arrowSign('HOME', -1, 0.85);
    this.home.group.position.set(-2.55, 0, -0.8); this.home.group.rotation.y = 0.3;
    this.home.group.traverse((o) => { o.userData.sign = 'home'; });
    S.add(this.swim.group, this.home.group);
    // the porch lantern on its post
    const pk = new Kit();
    pk.box(MAT.wood('drift'), 0.1, 2.0, 0.1, 2.2, 1.0, -0.65);
    pk.box(MAT.wood('drift'), 0.5, 0.07, 0.07, 2.4, 1.98, -0.65);
    pk.cyl(MAT.metal('grey'), 0.09, 0.11, 0.24, 2.6, 1.78, -0.65, { seg: 6 });
    pk.sphere(MAT.glow('#ffd28a'), 0.07, 2.6, 1.78, -0.65, { w: 6, h: 4 });
    S.add(pk.build());
    S.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m.material as THREE.Material).transparent) { m.castShadow = true; m.receiveShadow = true; } });
  }

  /** open the scene: the last pack restored from the stash */
  open() {
    const lc = META.lastConfig as TableConfig | null;
    this.mastery = Math.min(META.masteryUnlocked, lc?.mastery ?? META.mastery ?? 0);
    this.pack = [];
    for (const it of lc?.pack ?? []) {
      if (!ITEMS[it.id]) continue;
      if (it.uid >= 0) { const s = META.stash.find((q) => q.uid === it.uid); if (s && fits(this.pack, { ...s, gx: -1, gy: -1, rot: it.rot }, it.gx, it.gy, it.rot)) this.pack.push({ ...s, gx: it.gx, gy: it.gy, rot: it.rot }); }
      else { const n = Math.min((META.materials[it.id] ?? 0) - this.packedMat(it.id), it.n ?? 1); if (n > 0 && fits(this.pack, { ...it, gx: -1, gy: -1 }, it.gx, it.gy, it.rot)) this.pack.push({ ...it, uid: this.nextMatUid--, n }); }
    }
    this.drag = null; this.page = 0; this.diving = false; this.openK = 0;
    this.cardKey = '';
  }
  close() { if (!this.diving && this.pack.length) { const c = this.config(); META.lastConfig = c; saveMeta(); } this.drag = null; this.stage.detach(); for (const c of this.cards) c.c.root.removeFromParent(); this.cards = []; this.cardKey = ''; }

  config(): TableConfig {
    const mats: Record<string, number> = {};
    for (const it of this.pack) if (it.uid < 0) mats[it.id] = (mats[it.id] ?? 0) + (it.n ?? 1);
    return { mastery: this.mastery, startArea: 'reef', loadout: this.pack.filter((p) => p.uid >= 0).map((p) => p.uid), pack: this.pack.map((p) => ({ ...p })), mats };
  }

  /** a low cinematic shot of the chest and the pack, the house behind */
  shot(): Shot { return { target: new THREE.Vector3(PORCH.set.x - 0.05, 0.2, PORCH.set.z + 0.12), yaw: 0, pitch: 0.98, dist: 4.7, fov: 36 }; }

  // ---------------------------------------------------------------- packing rules
  private packedMat(id: string) { return this.pack.reduce((s, p) => s + (p.uid < 0 && p.id === id ? p.n ?? 1 : 0), 0); }
  private inPack(uid: number) { return this.pack.some((p) => p.uid === uid); }
  private addGear(it: ItemInst): boolean {
    if (!ITEMS[it.id] || this.inPack(it.uid)) return false;
    const copy: ItemInst = { ...it, gx: -1, gy: -1, rot: 0 };
    const spot = findSpot(this.pack, copy);
    if (!spot) { this.full(); return false; }
    copy.gx = spot.gx; copy.gy = spot.gy; copy.rot = spot.rot;
    this.pack.push(copy); this.dropT.set(copy.uid, 0);
    audio.play('bag_zip1', { vol: 0.25, dry: true, rate: 1.4 });
    return true;
  }
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
  /** what is in the chest (not packed): gear first, then materials with how many are left */
  private chestEntries(): { kind: 'gear' | 'mat'; it?: ItemInst; id: string; n: number }[] {
    const out: { kind: 'gear' | 'mat'; it?: ItemInst; id: string; n: number }[] = [];
    for (const s of META.stash) if (ITEMS[s.id] && !this.inPack(s.uid)) out.push({ kind: 'gear', it: s, id: s.id, n: 1 });
    for (const [id, n] of Object.entries(META.materials)) { const left = n - this.packedMat(id); if (ITEMS[id] && left > 0) out.push({ kind: 'mat', id, n: left }); }
    return out;
  }

  // ---------------------------------------------------------------- models
  private local(x: number, y: number, z: number) { return this.set.localToWorld(new THREE.Vector3(x, y, z)); }
  private model(key: string, id: string, level: number): THREE.Group {
    let g = this.models.get(key);
    if (g && g.userData.id === id && g.userData.level === level) return g;
    if (g) g.removeFromParent();
    g = new THREE.Group();
    const inner = new THREE.Group();
    const m = itemModel(id);
    m.rotation.x = -Math.PI / 2;
    inner.add(m);
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -box.min.y, -c.z);
    g.add(inner);
    // a forgiving invisible hit box over the whole footprint (thin items like scissors are mostly air)
    const sx = box.max.x - box.min.x, sz = box.max.z - box.min.z, sy = Math.max(0.15, box.max.y - box.min.y);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(Math.max(sx, sz * 0.6) * 1.05, sy, Math.max(sz, sx * 0.6) * 1.05), HITBOX);
    hit.position.y = sy / 2;
    g.add(hit);
    g.userData = { key, id, level, size: Math.max(sx, sz) };
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.models.set(key, g);
    this.items.add(g);
    return g;
  }
  private countTex(n: number): THREE.Texture {
    let t = this.counts.get(n);
    if (!t) { const cv = paintTag([{ text: String(n), color: '#2a1808' }], 'paper', 30, 2); t = canvasTex(cv); t.userData = { w: cv.width, h: cv.height }; this.counts.set(n, t); }
    return t;
  }
  private setCount(g: THREE.Group, n: number, foot: number) {
    let lbl = g.userData.lbl as THREE.Mesh | undefined;
    if (n <= 1) { if (lbl) lbl.visible = false; return; }
    if (!lbl) { lbl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ toneMapped: false })); g.userData.lbl = lbl; this.items.add(lbl); }
    const t = this.countTex(n);
    (lbl.material as THREE.MeshBasicMaterial).map = t;
    lbl.visible = true;
    lbl.scale.set((t.userData.w as number) * 0.0034, 1, (t.userData.h as number) * 0.0034);
    lbl.position.set(g.position.x + foot * 0.36, g.position.y + 0.04, g.position.z + foot * 0.34);
  }
  /** lay the chest's page and the pack out as models; the hovered one lifts, a dropped one bounces */
  private layout(hover: THREE.Object3D | null) {
    const live = new Set<string>();
    const drag = this.drag?.moved ? this.drag : null;
    for (const it of this.pack) {
      const key = 'p' + it.uid;
      const g = this.model(key, it.id, it.level ?? 1);
      live.add(key);
      const cells = instCells(it);
      const xs = cells.map((q) => q[0]), ys = cells.map((q) => q[1]);
      const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2, cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
      const sz = shapeSize(getItem(it.id).shape);
      const foot = Math.max(sz.w, sz.h) * CELL;
      g.scale.setScalar((foot * 0.92) / Math.max(0.01, g.userData.size as number));
      g.rotation.y = -it.rot * Math.PI / 2;
      const dt0 = this.dropT.get(it.uid);
      const bounce = dt0 !== undefined ? Math.sin(Math.min(1, dt0 / 0.3) * Math.PI) * 0.06 : 0;
      if (!(drag && drag.key === key)) g.position.set(BAG.x - BAG.gw / 2 + cx * CELL, BAG.floor + 0.01 + bounce + (hover === g ? 0.05 : 0), BAG.z - BAG.gd / 2 + cy * CELL);
      g.userData.slot = { id: it.id, level: it.level, n: it.n, from: 'bag', inst: it } as Slot;
      this.setCount(g, it.n ?? 1, foot);
    }
    const list = this.chestEntries();
    const cols = 5, rows = 2, per = cols * rows, cw = (CHEST.w - 0.18) / cols, ch = (CHEST.d - 0.18) / rows;
    const pages = Math.max(1, Math.ceil(list.length / per));
    this.page = Math.min(this.page, pages - 1);
    this.knobs[0].visible = this.page > 0; this.knobs[1].visible = this.page < pages - 1;
    list.slice(this.page * per, this.page * per + per).forEach((e, i) => {
      const key = e.it ? 't' + e.it.uid : 'm' + e.id;
      const g = this.model(key, e.id, e.it?.level ?? 1);
      live.add(key);
      const foot = Math.min(cw, ch) * 0.9;
      g.scale.setScalar(foot / Math.max(0.01, g.userData.size as number));
      g.rotation.y = 0;
      if (!(drag && drag.key === key)) g.position.set(CHEST.x - CHEST.w / 2 + 0.09 + (i % cols + 0.5) * cw, CHEST.floor + 0.1 + (hover === g ? 0.06 : 0), CHEST.z - CHEST.d / 2 + 0.09 + (Math.floor(i / cols) + 0.5) * ch);
      g.userData.slot = { id: e.id, level: e.it?.level ?? 1, n: e.n, from: 'chest', inst: e.it ?? { uid: 0, id: e.id, gx: -1, gy: -1, rot: 0, level: 1, n: Math.min(e.n, stackCap(e.id)) } } as Slot;
      this.setCount(g, e.kind === 'mat' ? e.n : 1, foot);
    });
    for (const [key, g] of this.models) if (!live.has(key)) { g.removeFromParent(); (g.userData.lbl as THREE.Mesh | undefined)?.removeFromParent(); this.models.delete(key); }
    return list.length;
  }

  // ---------------------------------------------------------------- the frame
  /** a world point (set-local) in UI px */
  private scr(v: THREE.Vector3, cam: THREE.PerspectiveCamera, ui: PixelUI): [number, number] | null {
    const p = v.clone().project(cam);
    if (p.z > 1) return null;
    return [Math.round((p.x * 0.5 + 0.5) * ui.w), Math.round((-p.y * 0.5 + 0.5) * ui.h)];
  }
  update(dt: number, ui: PixelUI, input: Input, cam: THREE.PerspectiveCamera, ray: THREE.Raycaster, internalH: number, live: boolean) {
    void internalH;
    this.t += dt; this.flash.t -= dt;
    this.openK = Math.min(1, this.openK + dt * 1.6);
    this.lid.rotation.x = -this.openK * 1.85;
    this.bagFlap.rotation.x = -this.openK * 0.9;
    for (const [k, v] of this.dropT) { if (v > 0.6) this.dropT.delete(k); else this.dropT.set(k, v + dt); }
    this.set.updateWorldMatrix(true, true);
    // ---- picks
    let item: THREE.Object3D | null = null, dialSide = 0, sign: string | null = null, knob = 0;
    if (live && !this.diving && ui.inside && !ui.mouseOnUI && !this.drag?.moved) {
      for (const h of ray.intersectObjects([this.dialMesh, this.swim.group, this.home.group, ...this.models.values(), ...this.knobs], true)) {
        let o: THREE.Object3D | null = h.object;
        while (o && !o.userData.slot && o.parent && o.parent !== this.set && o.parent !== this.items) o = o.parent;
        if (o?.userData.slot) { item = o; break; }
        if (h.object.userData.sign) { sign = h.object.userData.sign as string; break; }
        if (h.object.userData.knob) { knob = h.object.userData.knob as number; break; }
        if (h.object === this.dialMesh) { dialSide = this.set.worldToLocal(h.point.clone()).x < DIAL.x ? -1 : 1; break; }
        break;
      }
    }
    // the dial
    const setM = (m: number) => {
      const nm = Math.max(0, Math.min(Math.min(MAX_MASTERY, META.masteryUnlocked), m));
      if (nm === this.mastery) { audio.play('k_err1', { vol: 0.25, dry: true }); return; }
      this.mastery = nm; audio.play('k_tick2', { vol: 0.4, dry: true, rate: 0.8 + nm * 0.05 }); audio.play('clank2', { vol: 0.15 });
    };
    if (dialSide) { ui.cursor = 'point'; if (ui.pressed) setM(this.mastery + dialSide); if (ui.wheel) setM(this.mastery - Math.sign(ui.wheel)); }
    if (live && !this.diving && (input.keyHit('KeyD') || input.keyHit('ArrowRight'))) setM(this.mastery + 1);
    if (live && !this.diving && (input.keyHit('KeyA') || input.keyHit('ArrowLeft'))) setM(this.mastery - 1);
    this.dialTex.image = this.dialImage();
    this.needleA = damp(this.needleA, dialAngle(this.mastery), 12, dt);
    this.needle.rotation.y = -this.needleA;
    // chest pages
    if (knob) { ui.cursor = 'point'; if (ui.pressed) { this.page = Math.max(0, this.page + knob); audio.play('k_tick2', { vol: 0.35, dry: true }); } }
    // the signs glow when hovered; SWIM OUT / Enter dives, HOME / Esc goes back in
    this.swim.mat.emissiveIntensity = damp(this.swim.mat.emissiveIntensity, sign === 'swim' ? 0.6 : 0.08 + Math.max(0, Math.sin(this.t * 3)) * 0.1, 10, dt);
    this.home.mat.emissiveIntensity = damp(this.home.mat.emissiveIntensity, sign === 'home' ? 0.6 : 0, 10, dt);
    this.swim.board.rotation.z = sign === 'swim' ? Math.sin(this.t * 14) * 0.03 : 0;
    if (sign) ui.cursor = 'point';
    // ---- items
    const n = this.layout(item);
    let hoverSlot: Slot | null = null, hoverAt: THREE.Vector3 | null = null;
    if (item && !this.drag) {
      hoverSlot = item.userData.slot as Slot;
      hoverAt = item.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0));
      ui.cursor = 'grab';
      if (ui.pressed) this.drag = { it: hoverSlot.inst, from: hoverSlot.from, sx: ui.mx, sy: ui.my, moved: false, rot: hoverSlot.inst.rot, key: item.userData.key as string };
    }
    this.dragDrop(ui, input, ray);
    if (this.diving) { this.stage.detach(); return; }
    // ---- the 2D layer: the build note, the mastery plate, the buttons, the hovered item's card
    this.buildSummary(ui, dt);
    this.masteryPlate(ui, cam, live, setM);
    const k = 0.5 + 0.5 * Math.sin(this.t * 3.2);
    const bw = Math.max(150, ui.measure('SWIM OUT', 'title') + 66), bh = 28, bx = ui.w - bw - 12, by = ui.h - bh - 12;
    if (!this.drag) { ui.fill(bx - 3, by - 3, bw + 6, bh + 6, '#8ee06a', 0.12 + 0.12 * k); ui.rect(bx - 2, by - 2, bw + 4, bh + 4, '#5fae3f'); }
    let dive = live && !this.drag && ui.button('pack:swim', 'SWIM OUT', bx, by, bw, bh, { style: 'green', font: 'title', key: 'Enter', keyLabel: 'ENTER' });
    const home = live && !this.drag && ui.button('pack:home', 'HOME', 12, ui.h - 24 - 12, 92, 24, { style: 'dark', font: 'body', key: 'Escape', keyLabel: 'ESC' });
    if (live && sign === 'swim' && ui.pressed) dive = true;
    if (live && !this.drag && input.keyHit('Enter')) dive = true;
    if (dive && !this.diving) { this.dive(); return; }
    if (live && !this.drag && (home || (sign === 'home' && ui.pressed))) { this.onClose?.(); return; }
    // the card by whatever is under the mouse
    if (this.flash.t > 0) { const p = this.scr(this.local(BAG.x, 0.4, BAG.z), cam, ui); if (p) this.flashCard(ui, p, this.flash.text); }
    else if (hoverSlot && hoverAt && !this.drag?.moved) { const p = this.scr(hoverAt, cam, ui); if (p) this.itemCard(ui, p, hoverSlot); }
    else if (sign && !this.drag) { const p = this.scr(this.local(sign === 'swim' ? 2.45 : -2.55, 1.6, -0.75), cam, ui); if (p) this.signCard(ui, p, sign); }
    else if (!n && !this.drag) { const p = this.scr(this.local(CHEST.x, 0.4, CHEST.z), cam, ui); if (p) this.flashCard(ui, p, 'The stash is empty', 'Bring loot home from runs.'); }
    else if (dialSide) { const p = this.scr(this.local(DIAL.x + dialSide * 0.1, DIAL.y, DIAL.z), cam, ui); if (p) this.flashCard(ui, p, dialSide > 0 ? 'harder' : 'easier'); }
  }
  /** a small dark card above a screen point (the hovered thing), kept on screen */
  private cardAt(ui: PixelUI, p: [number, number], w: number, h: number): [number, number] {
    const x = Math.max(6, Math.min(ui.w - w - 6, p[0] - Math.round(w / 2)));
    let y = p[1] - h - 14;
    if (y < 6) y = p[1] + 18;
    ui.fill(x + 3, y + 4, w, h, '#000000', 0.35);
    ui.frame('dark', x, y, w, h);
    return [x, y];
  }
  private itemCard(ui: PixelUI, p: [number, number], s: Slot) {
    const w = 196, lv = s.level ?? 1;
    const opts = { level: lv, n: s.n, maxStats: 3, maxFuse: 0, noDesc: true, counts: setCounts(this.pack), loose: s.from === 'chest' };
    const hh = itemHead(ui, s.id, 0, 0, w - 16, { ...opts, draw: false });
    const bh = itemBody(ui, s.id, 0, 0, w - 16, { ...opts, draw: false });
    const verb = s.from === 'bag' ? 'drag: move  ·  click: unpack' : 'drag into the pack  ·  click: pack it';
    const h = 10 + hh + bh + ui.lh('small') + 10;
    const [x, y] = this.cardAt(ui, p, w, h);
    let yy = y + 7;
    yy += itemHead(ui, s.id, x + 8, yy, w - 16, opts);
    yy += itemBody(ui, s.id, x + 8, yy, w - 16, opts);
    if ((s.n ?? 1) > 1 && s.from === 'chest') ui.text(`x${s.n}`, x + w - 8, y + 7, { font: 'title', color: K.brass2, shadow: K.ink2, align: 'right' });
    ui.text(verb, x + w / 2, y + h - ui.lh('small') - 4, { font: 'small', color: K.dim, shadow: null, align: 'center' });
  }
  private signCard(ui: PixelUI, p: [number, number], sign: string) {
    const lines = sign === 'swim' ? ['SWIM OUT', `to the reef  ·  mastery ${this.mastery}`, `${this.pack.length} things packed`] : ['HOME', 'back inside', ''];
    const w = Math.max(ui.measure(lines[0], 'title'), ui.measure(lines[1], 'body'), ui.measure(lines[2], 'small')) + 20;
    const h = ui.lh('title') + ui.lh('body') + (lines[2] ? ui.lh('small') : 0) + 12;
    const [x, y] = this.cardAt(ui, p, w, h);
    ui.text(lines[0], x + 10, y + 6, { font: 'title', color: sign === 'swim' ? K.kelpL : K.brass2, shadow: K.ink2 });
    ui.text(lines[1], x + 10, y + 6 + ui.lh('title'), { font: 'body', color: K.cream, shadow: K.ink2 });
    if (lines[2]) ui.text(lines[2], x + 10, y + 6 + ui.lh('title') + ui.lh('body'), { font: 'small', color: K.dim, shadow: K.ink2 });
  }
  private flashCard(ui: PixelUI, p: [number, number], title: string, sub = '') {
    const w = Math.max(ui.measure(title, 'title'), ui.measure(sub, 'body')) + 20, h = ui.lh('title') + (sub ? ui.lh('body') : 0) + 12;
    const [x, y] = this.cardAt(ui, p, w, h);
    ui.text(title, x + w / 2, y + 6, { font: 'title', color: title === 'PACK FULL' ? K.coralL : K.cream, shadow: K.ink2, align: 'center' });
    if (sub) ui.text(sub, x + w / 2, y + 6 + ui.lh('title'), { font: 'body', color: K.dim, shadow: K.ink2, align: 'center' });
  }
  /** the dial's brass label plate: MASTERY n, its name, ◄ ►, and the newest rule it adds */
  private masteryPlate(ui: PixelUI, cam: THREE.PerspectiveCamera, live: boolean, setM: (m: number) => void) {
    const p = this.scr(this.local(DIAL.x, DIAL.y, DIAL.z + DIAL.r + 0.12), cam, ui);
    if (!p) return;
    const m = MASTERY[this.mastery];
    const title = `MASTERY ${this.mastery}`, name = m.name;
    const w = Math.max(ui.measure(title, 'body') + 52, ui.measure(name, 'small') + 20), h = ui.lh('body') + ui.lh('small') + 9;
    const x = Math.round(p[0] - w / 2), y = p[1] + 2;
    ui.fill(x + 2, y + 3, w, h, '#000000', 0.4);
    ui.fill(x, y, w, h, K.brassD); ui.fill(x + 1, y + 1, w - 2, h - 2, K.brass1); ui.fill(x + 1, y + 1, w - 2, 1, K.brass2); ui.fill(x + 1, y + h - 2, w - 2, 1, K.brass0);
    ui.fill(x + 3, y + 3, w - 6, h - 6, '#d9a44a');
    ui.text(title, x + w / 2, y + 4, { font: 'body', color: '#3a2008', shadow: '#f8dc90', align: 'center' });
    ui.text(name, x + w / 2, y + 5 + ui.lh('body'), { font: 'small', color: '#5a3410', shadow: null, align: 'center' });
    if (live && ui.button('pack:mLess', '', x - 18, y + 3, 16, 18, { style: 'brass', icon: 'left', disabled: this.mastery <= 0, sfx: '' })) setM(this.mastery - 1);
    if (live && ui.button('pack:mMore', '', x + w + 2, y + 3, 16, 18, { style: 'brass', icon: 'right', disabled: this.mastery >= Math.min(MAX_MASTERY, META.masteryUnlocked), sfx: '' })) setM(this.mastery + 1);
    if (this.mastery > 0 && ui.hover(x, y, w, h)) ui.tooltip([{ text: m.name, font: 'title' }, ...masteryMods(this.mastery).map((t) => ({ text: '· ' + t, font: 'small' as const }))], { maxW: 200 });
  }
  private dialKey = -1;
  private dialImage() {
    const key = this.mastery * 100 + META.masteryUnlocked;
    if (key !== this.dialKey) { this.dialKey = key; this.dialTex.image = paintDial(this.mastery); this.dialTex.needsUpdate = true; }
    return this.dialTex.image as HTMLCanvasElement;
  }

  /** the skill cards across the top, and the pinned YOUR BUILD note top left (sets, stat changes, mastery) */
  private buildSummary(ui: PixelUI, dt: number) {
    const packed = this.pack.filter((p) => p.gx >= 0);
    const stats = applyItems({ ...BASE_STATS, abilities: [], skills: [], sets: {}, gear: {} }, packed);
    const skills = [...new Set(stats.skills ?? [])].filter((s) => SKILL_NAMES[s]);
    const key = skills.join(',');
    if (key !== this.cardKey) {
      this.cardKey = key;
      for (const c of this.cards) c.c.root.removeFromParent();
      this.cards = skills.slice(0, 5).map((id) => ({ id, c: new SkillCard3D(id, { w: 44 }) }));
    }
    this.stage.attach(ui);
    const cw = 52, x0 = Math.round(ui.w / 2 - ((this.cards.length - 1) * cw) / 2);
    this.cards.forEach((c, i) => {
      const x = x0 + i * cw, y = 40;
      const hov = ui.hover(x - 22, y - 32, 44, 64) ? 1 : 0;
      this.stage.put(c.c.root, x, y, 10);
      c.c.update(dt, { hover: hov, mx: hov ? (ui.mx - x) / 22 : 0, my: hov ? (ui.my - y) / 32 : 0, ready: true });
    });
    // the note: a cream card pinned with a brass tack
    const w = 168, x = 10, y = 10, ink = '#2a1a0c', dimInk = '#6a5638';
    const sets = setBonuses(packed).slice(0, 4);
    const b = buildLines(this.pack);
    const rows: { text: string; color: string; font: 'body' | 'small'; gap?: number }[] = [];
    for (const st of sets) rows.push({ text: `${st.name} ${st.count}${st.next ? '/' + st.next : ''}${st.tier ? '  · ON' : ''}`, color: st.tier ? '#1a5a1a' : dimInk, font: 'body' });
    for (const q of b.stats.slice(0, 6)) rows.push({ text: q.text, color: q.good ? '#1a4a7a' : '#8a1a14', font: 'body', gap: rows.length && !rows.some((r) => r.color === '#1a4a7a' || r.color === '#8a1a14') ? 3 : 0 });
    if (!sets.length && !b.stats.length) rows.push({ text: 'Nothing packed yet.', color: dimInk, font: 'body' }, { text: 'Gear changes your stats; skills deal cards.', color: dimInk, font: 'small' });
    rows.push({ text: `MASTERY ${this.mastery} · ${MASTERY[this.mastery].name}`, color: '#8a2a10', font: 'small', gap: 4 });
    let h = 10 + ui.lh('title') + 4;
    for (const r of rows) h += (r.gap ?? 0) + ui.textBox(r.text, -9999, -9999, w - 20, { font: r.font });
    h += 8;
    ui.fill(x + 3, y + 4, w, h, '#000000', 0.35);
    ui.img(wellArt(w, h, 'paper'), x, y);
    ui.block(x, y, w, h);
    let yy = y + 8;
    ui.text('YOUR BUILD', x + 10, yy, { font: 'title', color: ink, shadow: null }); yy += ui.lh('title') + 1;
    ui.fill(x + 10, yy, w - 20, 1, '#c8b488'); yy += 3;
    for (const r of rows) { yy += r.gap ?? 0; yy += ui.textBox(r.text, x + 10, yy, w - 20, { font: r.font, color: r.color, shadow: null }); }
  }

  private dive() {
    if (this.diving) return;
    this.diving = true;
    audio.play('k_confirm2', { vol: 0.4, dry: true }); audio.play('bubbles_a', { vol: 0.35, delay: 0.2 });
    const cfg = this.config();
    META.lastConfig = cfg; META.mastery = cfg.mastery; saveMeta();
    this.onDive?.(cfg);
  }

  /** the dragged model follows the mouse above the set; the pack cells under it light green / red */
  private dragDrop(ui: PixelUI, input: Input, ray: THREE.Raycaster) {
    const d = this.drag;
    for (const c of this.cellHi) c.visible = false;
    if (!d) return;
    if (!d.moved && Math.hypot(ui.mx - d.sx, ui.my - d.sy) > 3) { d.moved = true; audio.play('k_pluck1', { vol: 0.35, dry: true }); }
    if (d.moved && (input.keyHit('KeyR') || ui.rpressed)) { d.rot = (d.rot + 1) % 4; audio.play('k_tick1', { vol: 0.25, dry: true }); }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.set.position.y + 0.32));
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    const lp = hit ? this.set.worldToLocal(hit.clone()) : null;
    const probe: ItemInst = { ...d.it, gx: -1, gy: -1, rot: d.rot };
    const cells0 = instCells(probe, d.rot, 0, 0);
    const pw = Math.max(...cells0.map((q) => q[0])) + 1, ph = Math.max(...cells0.map((q) => q[1])) + 1;
    const gx = lp ? Math.round((lp.x - (BAG.x - BAG.gw / 2)) / CELL - pw / 2) : -99, gy = lp ? Math.round((lp.z - (BAG.z - BAG.gd / 2)) / CELL - ph / 2) : -99;
    const overBag = !!lp && Math.abs(lp.x - BAG.x) < BAG.gw / 2 + 0.1 && Math.abs(lp.z - BAG.z) < BAG.gd / 2 + 0.1;
    const others = this.pack.filter((p) => p.uid !== d.it.uid || d.from === 'chest');
    const cx = gx + Math.floor(pw / 2), cy = gy + Math.floor(ph / 2);
    const stackTarget = overBag && stackCap(d.it.id) > 1 ? others.find((p) => p.id === d.it.id && p.uid < 0 && instCells(p).some(([x, y]) => x === cx && y === cy)) : undefined;
    const ok = overBag && (!!stackTarget || fits(others, probe, gx, gy, d.rot));
    if (d.moved && lp) {
      ui.cursor = 'grab';
      const g = this.models.get(d.key);
      if (g) { g.position.set(lp.x, 0.42, lp.z); g.rotation.y = -d.rot * Math.PI / 2; }
      if (overBag) instCells(probe, d.rot, gx, gy).forEach(([x, y], i) => {
        const c = this.cellHi[i]; if (!c || x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return;
        c.visible = true; c.position.set(BAG.x - BAG.gw / 2 + (x + 0.5) * CELL, 0.218, BAG.z - BAG.gd / 2 + (y + 0.5) * CELL);
        (c.material as THREE.MeshBasicMaterial).color.set(ok ? '#4aff6a' : '#ff4a3a');
      });
    }
    if (ui.released) {
      if (!d.moved) {
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

  /** CSS-px centre of a widget for tests: 'swim' | 'home' | 'dial+' | 'dial-' | 'chest:<id>' | 'item:<id>' | 'bag:<gx>,<gy>' */
  point(id: string, cam: THREE.Camera, w: number, h: number): [number, number] | null {
    let p: THREE.Vector3 | null = null;
    if (id === 'swim') p = this.local(2.65, 1.2, -0.7);
    else if (id === 'home') p = this.local(-2.75, 1.2, -0.75);
    else if (id === 'dial+') p = this.local(DIAL.x + DIAL.r * 0.6, DIAL.y, DIAL.z);
    else if (id === 'dial-') p = this.local(DIAL.x - DIAL.r * 0.6, DIAL.y, DIAL.z);
    else if (id.startsWith('chest:') || id.startsWith('item:')) {
      const want = id.startsWith('chest:') ? 'chest' : 'bag', iid = id.split(':')[1];
      for (const g of this.models.values()) { const s = g.userData.slot as Slot | undefined; if (s && s.from === want && s.id === iid) { p = g.getWorldPosition(new THREE.Vector3()); break; } }
    } else if (id.startsWith('bag:')) { const [gx, gy] = id.slice(4).split(',').map(Number); p = this.local(BAG.x - BAG.gw / 2 + (gx + 0.5) * CELL, 0.23, BAG.z - BAG.gd / 2 + (gy + 0.5) * CELL); }
    if (!p) return null;
    const v = p.project(cam);
    return [Math.round((v.x * 0.5 + 0.5) * w), Math.round((-v.y * 0.5 + 0.5) * h)];
  }
}
