// THE KIT WALL (v7): the loadout, staged as the blobfish gearing up at its own front door. (It replaces v6's porch
// chest + backpack.) A lit nook on the doorstep: the door open behind, the lantern swinging, light shafts in the
// water, kelp framing the shot. Left of the door the KIT WALL, a driftwood board of bone pegs where the stash hangs;
// right of the blobfish its SATCHEL on a crate. Everything reacts:
//   - click a hanging thing (or Space on the focused one): it lifts off its peg and FLIES into the satchel, tumbling
//     and trailing bubbles; the satchel gulps with a splash, bulges a little fuller, the newest things poke out of
//     its mouth, and the item pops into its pocket on the SATCHEL panel (2D, right: the open bag with its 8 x 6
//     stitched pockets). Click a packed thing: it flies back to its peg with a clink. Drag works too: drag from the
//     wall onto a pocket, drag inside the satchel to rearrange (R / right click / the touch ROTATE key turns), drag out to unpack. A full
//     satchel repacks itself (biggest first) before it refuses.
//   - the TALLY under it: HP / attack / speed / mana / crit / luck count up or down as the gear changes (a flash and
//     an arrow on whatever just moved), and the sets the packed gear starts
//   - ABILITIES: the medallions (src/ui/obj/medallion.ts) the packed gear grants hang on a rope (bottom left); a new
//     one drops onto the rope with a burst of bubbles
//   - MASTERY: a brass plate (◄ ► / - and +); HOME (Esc) top left; SWIM OUT (Enter) bottom right -> the swim-out
//     cinematic (src/hideout/exitCine.ts) -> onDive(cfg)
//   - hover anything (or focus it with the arrows / WASD, Tab between wall and satchel, Q / E page the wall): an
//     elegant compact card beside it; the blobfish turns to look at what you are looking at
// Going out: the hero walks up to the shut front door, the camera swoops down to the doorstep, the door swings open
// onto the sea, the blobfish steps out into its nook and the kit assembles (open({ beat: true }); any key skips).
//
//   const p = new Packing(house); p.open({ beat, env }); each frame in packing mode: p.update(dt, ui, input, cam, ray, h, live)
//   swimming out: p.cineUpdate(dt, ui, input, live) -> true when the run should start;  p.door / p.bars / p.look
//   p.config() -> TableConfig (RunConfig + pack + mats, start area 'reef')
import { hpOf } from '../combat/types';
import * as THREE from 'three';
import { damp, dampAngle, easeOutBack, clamp01 } from '../core/math';
import { META, saveMeta, type RunConfig } from '../meta/meta';
import { MASTERY, MAX_MASTERY, masteryMods } from './mastery';
import { ITEMS, getItem, GRID_W, GRID_H, fits, instCells, findSpot, stackCap, shapeSize, setBonuses, setCounts, applyItems, SKILL_NAMES, ABILITY_NAME, RARITY_COLOR, skillItem } from '../game/items';
import { BASE_STATS, type ItemInst, type Stats } from '../game/run';
import { itemModel } from '../backpack/models';
import { itemIconBox, keyName, PixelUI } from '../ui/pixel/ui';
import type { Input } from '../core/input';
import { UiStage } from '../ui/obj/stage';
import { AbilityMedallion } from '../ui/obj/medallion';
import { audio } from '../audio/audio';
import { K, itemHead, itemBody } from './itemCard';
import { wellArt } from './panelArt';
import { bubbles, rope } from './seaFx';
import { Kit } from './kit';
import { MAT } from './tex';
import { Px } from '../ui/pixel/decor';
import { IN, WALL_T } from './pieces';
import type { House } from './house';
import type { Shot } from './camera';
import { buildKitWall, buildCrate, buildLantern, rayCard, kelpStrip, Satchel3D, satchelArt, SAT, type KitWallLayout } from './kitWall';
import { ExitCine, type CineEnv } from './exitCine';

/** the run config the dive gets: RunConfig + the packed grid (gear keeps its stash uid; material stacks: uid < 0, n) */
export interface TableConfig extends RunConfig {
  pack: ItemInst[];
  mats: Record<string, number>;
}
/** what the screen lends the scene: the hero and the camera (and the cinematic's needs), a straight walk */
export interface PackEnv extends CineEnv {
  walk(to: THREE.Vector3, then?: () => void): void;
  stopWalk(): void;
}

// set-local layout (x right, y up, z toward the open sea / the camera); the set's origin is the doorstep outside
const SET_AT = new THREE.Vector3(0, 0, IN.z1 + WALL_T);
const WALL: KitWallLayout = { x: -1.74, z: 0.36, w: 1.84, h: 1.5, y0: 0.44, cols: 4, rows: 3 };
const PER = WALL.cols * WALL.rows;
const HERO_AT = new THREE.Vector3(-0.16, 0, 0.38);
/** the hero faces the camera, turned a little toward its satchel */
const HERO_YAW = -1.25;
const CRATE_AT = new THREE.Vector3(1.0, 0, 1.28);
const ITEM_FIT = 0.38;
const CELL = SAT.cell;

type Phase = 'off' | 'beat' | 'pick' | 'cine';
interface Entry { kind: 'gear' | 'mat'; it?: ItemInst; id: string; n: number; key: string }
interface Hang { g: THREE.Group; inner: THREE.Group; key: string; id: string; level: number; a: number; v: number; lift: number; size: number; base: number }
interface Flight { m: THREE.Object3D; id: string; a: THREE.Vector3; b: THREE.Vector3; t: number; dur: number; dir: 'in' | 'out'; s0: number; s1: number; spin: THREE.Vector3; key: string; uids: number[]; bub: number }
interface Drag { from: 'wall' | 'bag'; it: ItemInst; entry?: Entry; sx: number; sy: number; moved: boolean; rot: number }
type Focus = { area: 'wall'; i: number } | { area: 'bag'; uid: number } | null;

const STAT_ROWS: { k: keyof Stats; label: string; icon: string; mul: number; fmt: (v: number) => string }[] = [
  { k: 'maxHp', label: 'HP', icon: 'heart', mul: 1, fmt: (v) => String(hpOf(v)) },
  { k: 'swordDmg', label: 'ATTACK', icon: 'sword', mul: 10, fmt: (v) => (v / 10).toFixed(1) },
  { k: 'speed', label: 'SPEED', icon: 'bubble', mul: 10, fmt: (v) => (v / 10).toFixed(1) },
  { k: 'maxMana', label: 'MANA', icon: 'mana', mul: 1, fmt: (v) => String(v) },
  { k: 'crit', label: 'CRIT', icon: 'star', mul: 100, fmt: (v) => `${v}%` },
  { k: 'luck', label: 'LUCK', icon: 'crown', mul: 10, fmt: (v) => (v >= 0 ? '+' : '') + (v / 10).toFixed(1).replace(/\.0$/, '') },
];

const HITBOX = new THREE.MeshBasicMaterial({ visible: false });
/** a soft stepped glow (four rings) behind the hovered thing */
function glowTex(): THREE.CanvasTexture {
  const S = 24, px = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2);
    if (d < 1) px.set(x, y, [255, 214, 140], d < 0.35 ? 150 : d < 0.6 ? 95 : d < 0.82 ? 50 : 22);
  }
  const t = new THREE.CanvasTexture(px.done()); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

export class Packing {
  mastery = 0;
  pack: ItemInst[] = [];
  onDive?: (cfg: TableConfig) => void;
  onClose?: () => void;
  set = new THREE.Group();
  diving = false;
  phase: Phase = 'off';
  /** the front door's open amount while packing / swimming out (screen.ts swings the leaf to it) */
  door = 1;
  /** where the blobfish should look (world), or null */
  look: THREE.Vector3 | null = null;
  satchel = new Satchel3D();
  cine = new ExitCine();
  /** test / tuning hook: overrides for the loadout camera shot */
  shotTune: Partial<Shot> = {};
  private env: PackEnv | null = null;
  private items = new THREE.Group();
  private hangs = new Map<string, Hang>();
  private hooks: THREE.Vector3[] = [];
  private hitboxes: THREE.Mesh[] = [];
  private sway: THREE.Object3D[] = [];
  private lantern: ReturnType<typeof buildLantern>;
  private wallLight = new THREE.PointLight('#ffc890', 0, 4.2, 1.5);
  private fx = new THREE.Group();
  private glow: THREE.Mesh;
  private flights: Flight[] = [];
  private hookArrive = new Map<string, number>();
  private bagArrive = new Map<number, number>();
  private popT = new Map<number, number>();
  private peekIds: string[] = [];
  private drag: Drag | null = null;
  /** something is being dragged about (the touch layer shows a ROTATE key) */
  get dragging() { return !!this.drag?.moved; }
  private flash = { text: '', sub: '', t: 0 };
  private page = 0;
  private nextMatUid = -1;
  private t = 0;
  private beatT = 0;
  private beatCues = new Set<string>();
  private uiK = 0;
  private focus: Focus = null;
  private kbd = false;
  private stage = new UiStage();
  private medals: { id: string; c: AbilityMedallion; born: number }[] = [];
  private statShown = new Map<string, number>();
  private statFlash = new Map<string, { t: number; up: boolean }>();
  private lastUi: PixelUI | null = null;
  private cam: THREE.PerspectiveCamera | null = null;
  private wallRects: ([number, number, number, number] | null)[] = [];
  private gridAt: [number, number] = [0, 0];

  constructor(private house: House) {
    const S = this.set;
    S.position.copy(SET_AT);
    house.group.add(S);
    // a driftwood deck on the doorstep, a few boards warped or short
    const k = new Kit();
    for (let i = 0; i < 9; i++) {
      const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      k.box(MAT.wood(i % 4 === 2 ? 'pine' : 'drift'), 0.42, 0.04, 1.35 - (i === 1 || i === 7 ? 0.3 : r * 0.1), -2.75 + i * 0.44 + (r - 0.5) * 0.03, 0.02, 0.85 + (i === 1 ? 0.15 : i === 7 ? -0.15 : 0), { ry: (r - 0.5) * 0.04, chamfer: 0.01 });
    }
    for (const sz of [0.35, 1.38]) k.box(MAT.wood('teak'), 4.1, 0.03, 0.12, -0.95, 0.005, sz, { chamfer: 0.008 });
    S.add(k.build());
    // the kit wall, its hit boxes (one per peg: forgiving and stable)
    const wall = buildKitWall(WALL);
    S.add(wall.group);
    this.hooks = wall.hooks;
    this.sway = wall.sway;
    const colW = WALL.w / WALL.cols, rowH = WALL.h / WALL.rows;
    this.hooks.forEach((h, i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(colW * 0.96, rowH * 0.94, 0.4), HITBOX);
      b.position.set(h.x, h.y - rowH * 0.36, h.z + 0.08);
      b.userData.hook = i;
      S.add(b); this.hitboxes.push(b);
    });
    // the crate and the satchel on it, the lantern post
    const crate = buildCrate();
    crate.position.copy(CRATE_AT); crate.rotation.y = -0.3;
    S.add(crate);
    this.placeSatchel();
    this.lantern = buildLantern(-1);
    this.lantern.group.position.set(1.78, 0, 0.72);
    S.add(this.lantern.group);
    // light shafts over the nook, kelp framing the shot (only while packing)
    for (const [x, y, z, w, h, o] of [[-0.75, 4.4, 0.7, 0.7, 5.0, 0.1], [0.55, 4.6, 0.4, 0.55, 5.0, 0.08], [-2.4, 4.5, 0.9, 0.6, 4.6, 0.08]] as [number, number, number, number, number, number][]) {
      const r = rayCard(w, h, '#a8e8ff', o); r.position.set(x, y, z); r.rotation.z = 0.2; this.fx.add(r);
    }
    for (const [x, z, len, w, ph] of [[-3.35, 2.4, 2.6, 0.24, 1], [-3.0, 2.9, 1.9, 0.2, 2.2], [2.95, 2.6, 2.3, 0.22, 3.1]] as [number, number, number, number, number][]) {
      const piv = new THREE.Group(); piv.position.set(x, 0, z); piv.add(kelpStrip(len, w, ph, 1)); piv.userData.ph = ph; this.fx.add(piv); this.sway.push(piv);
    }
    // a warm fill on the kit wall (the lit nook): a lamp just out of shot
    this.wallLight.position.set(WALL.x + 0.5, WALL.y0 + WALL.h + 0.2, WALL.z + 1.5);
    S.add(this.wallLight);
    this.fx.visible = false;
    S.add(this.fx);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 }));
    this.glow.renderOrder = 4;
    S.add(this.glow);
    this.items.visible = false;
    S.add(this.items);
    // nobody walks through the wall or the crate
    const w = SET_AT;
    house.solids.push({ x: w.x + WALL.x - 0.5, z: w.z + WALL.z, r: 0.42 }, { x: w.x + WALL.x + 0.45, z: w.z + WALL.z, r: 0.42 }, { x: w.x + CRATE_AT.x, z: w.z + CRATE_AT.z, r: 0.36 }, { x: w.x + 1.78, z: w.z + 0.72, r: 0.12 });
    S.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m.material as THREE.Material).transparent && (m.material as THREE.Material).visible !== false) { m.castShadow = true; m.receiveShadow = true; } });
  }

  private placeSatchel() {
    const r = this.satchel.root;
    if (r.parent !== this.set) { r.removeFromParent(); this.set.add(r); }
    r.position.set(CRATE_AT.x, 0.415, CRATE_AT.z); r.rotation.set(0, -0.42, 0); r.scale.setScalar(1);
  }

  /** where the hero stands in the nook (world) */
  heroSpot() { return SET_AT.clone().add(HERO_AT); }

  /** open the scene: the last pack restored from the stash; beat = walk out through the shut door first */
  open(o: { beat?: boolean; env: PackEnv }) {
    this.env = o.env;
    if (this.cine.active) this.cine.stop();
    const lc = META.lastConfig as TableConfig | null;
    this.mastery = Math.min(META.masteryUnlocked, lc?.mastery ?? META.mastery ?? 0);
    this.pack = [];
    for (const it of lc?.pack ?? []) {
      if (!ITEMS[it.id]) continue;
      if (it.uid >= 0) { const s = META.stash.find((q) => q.uid === it.uid); if (s && fits(this.pack, { ...s, gx: -1, gy: -1, rot: it.rot }, it.gx, it.gy, it.rot)) this.pack.push({ ...s, gx: it.gx, gy: it.gy, rot: it.rot }); }
      else { const n = Math.min((META.materials[it.id] ?? 0) - this.packedMat(it.id), it.n ?? 1); if (n > 0 && fits(this.pack, { ...it, gx: -1, gy: -1 }, it.gx, it.gy, it.rot)) this.pack.push({ ...it, uid: this.nextMatUid--, n }); }
    }
    this.drag = null; this.page = 0; this.diving = false; this.focus = null; this.kbd = false;
    this.flash.t = 0; this.uiK = 0; this.beatT = 0; this.beatCues.clear(); this.slots.clear();
    this.clearFlights();
    this.bagArrive.clear(); this.hookArrive.clear(); this.popT.clear(); this.statShown.clear(); this.statFlash.clear();
    this.placeSatchel();
    this.peekIds = []; this.syncPeek();
    this.items.visible = true; this.fx.visible = true;
    const env = o.env, h = env.hero.root, rig = env.rig;
    if (o.beat) {
      // the blobfish waits inside the shut door; the camera swoops down to the doorstep
      this.phase = 'beat'; this.door = 0;
      h.position.set(0, 0, IN.z1 - 1.25); h.rotation.y = -Math.PI / 2;
      rig.shot = this.beatShot(); rig.k = 6; rig.snap(); env.cut();
    } else {
      this.phase = 'pick'; this.door = 1;
      // from the porch it walks over; from inside (a direct ?view=packing) it is simply there
      if (h.position.z > IN.z1) env.walk(this.heroSpot()); else { h.position.copy(this.heroSpot()); h.rotation.y = HERO_YAW; }
      rig.shot = this.shot(); rig.k = 2.2;
      audio.play('box_open', { vol: 0.3 });
    }
  }
  close() {
    if (this.phase === 'pick' && !this.diving && this.pack.length) { const c = this.config(); META.lastConfig = c; saveMeta(); }
    if (this.cine.active) this.cine.stop();
    this.clearFlights();
    this.drag = null;
    this.stage.detach();
    for (const m of this.medals) m.c.root.removeFromParent();
    this.medals = [];
    this.placeSatchel();
    this.phase = 'off'; this.door = 1; this.look = null;
    this.items.visible = false; this.fx.visible = false;
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  config(): TableConfig {
    const mats: Record<string, number> = {};
    for (const it of this.pack) if (it.uid < 0) mats[it.id] = (mats[it.id] ?? 0) + (it.n ?? 1);
    return { mastery: this.mastery, startArea: 'reef', loadout: this.pack.filter((p) => p.uid >= 0).map((p) => p.uid), pack: this.pack.map((p) => ({ ...p })), mats };
  }

  /** the loadout shot: low and warm, the kit wall left, the blobfish at its door, the satchel right */
  shot(): Shot {
    const base: Shot = { target: SET_AT.clone().add(new THREE.Vector3(0.22, 0.95, 0.8)), yaw: 0.0, pitch: 0.12, dist: 5.4, fov: 33 };
    return { ...base, ...this.shotTune, target: (this.shotTune.target ?? base.target).clone() };
  }
  /** going out: inside, low behind the blobfish, looking out through the shut front door at the open sea */
  private beatShot(): Shot {
    const cam = new THREE.Vector3(-0.55, 1.05, IN.z1 - 3.3), tgt = new THREE.Vector3(0.15, 0.9, IN.z1 + 4.5);
    const d = cam.clone().sub(tgt), dist = d.length();
    return { target: tgt, yaw: Math.atan2(d.x, d.z), pitch: Math.asin(d.y / dist), dist, fov: 40 };
  }
  /** the letterbox the screen should show */
  get bars() { return this.phase === 'cine' ? this.cine.bars : this.phase === 'beat' ? (this.beatT < 1.0 ? 0.9 : 0) : 0; }

  // ---------------------------------------------------------------- packing rules
  private packedMat(id: string) { return this.pack.reduce((s, p) => s + (p.uid < 0 && p.id === id ? p.n ?? 1 : 0), 0); }
  private inPack(uid: number) { return this.pack.some((p) => p.uid === uid); }
  private cellsUsed() { return this.pack.reduce((s, p) => s + getItem(p.id).shape.length, 0); }
  private fillFrac() { return Math.min(1, this.cellsUsed() / (GRID_W * GRID_H)); }
  /** a full satchel tries a tidy repack (biggest first) with the newcomer before it gives up */
  private repackWith(extra: ItemInst): ItemInst | null {
    const all = [...this.pack.map((p) => ({ ...p })), { ...extra, gx: -1, gy: -1 }];
    all.sort((a, b) => getItem(b.id).shape.length - getItem(a.id).shape.length);
    const out: ItemInst[] = [];
    for (const it of all) { const s = findSpot(out, { ...it, gx: -1, gy: -1 }); if (!s) return null; out.push({ ...it, gx: s.gx, gy: s.gy, rot: s.rot }); }
    this.pack = out;
    return out.find((p) => p.uid === extra.uid) ?? null;
  }
  private addGear(it: ItemInst, at?: { gx: number; gy: number; rot: number }): ItemInst | null {
    if (!ITEMS[it.id] || this.inPack(it.uid)) return null;
    const copy: ItemInst = { ...it, gx: -1, gy: -1, rot: at?.rot ?? 0 };
    const spot = at && fits(this.pack, copy, at.gx, at.gy, at.rot) ? at : findSpot(this.pack, copy);
    if (!spot) { const r = this.repackWith(copy); if (!r) { this.full(); return null; } return r; }
    copy.gx = spot.gx; copy.gy = spot.gy; copy.rot = spot.rot;
    this.pack.push(copy);
    return copy;
  }
  /** pack up to n of a material (topping up stacks first); returns the touched stacks */
  private addMat(id: string, n: number, at?: { gx: number; gy: number; rot: number }): ItemInst[] {
    let left = Math.min(n, (META.materials[id] ?? 0) - this.packedMat(id));
    if (left <= 0) return [];
    const cap = stackCap(id);
    const touched: ItemInst[] = [];
    for (const p of this.pack) { if (left <= 0) break; if (p.uid < 0 && p.id === id && (p.n ?? 1) < cap) { const k = Math.min(cap - (p.n ?? 1), left); p.n = (p.n ?? 1) + k; left -= k; touched.push(p); } }
    while (left > 0) {
      const inst: ItemInst = { uid: this.nextMatUid--, id, gx: -1, gy: -1, rot: at?.rot ?? 0, level: 1, n: Math.min(cap, left) };
      const spot = at && fits(this.pack, inst, at.gx, at.gy, at.rot) ? at : findSpot(this.pack, inst);
      at = undefined;
      if (!spot) { const r = this.repackWith(inst); if (!r) break; touched.push(r); left -= inst.n ?? 1; continue; }
      inst.gx = spot.gx; inst.gy = spot.gy; inst.rot = spot.rot;
      this.pack.push(inst); touched.push(inst);
      left -= inst.n ?? 1;
    }
    if (!touched.length) this.full();
    return touched;
  }
  private full() { this.flash = { text: 'SATCHEL FULL', sub: 'unpack something first', t: 1.6 }; this.satchel.strain(); audio.play('k_err1', { vol: 0.4, dry: true }); audio.play('squeak', { vol: 0.2, rate: 0.8 }); }
  /** what hangs on the wall (not packed): gear first, then materials with how many are left */
  private entries(): Entry[] {
    const out: Entry[] = [];
    for (const s of META.stash) if (ITEMS[s.id] && !this.inPack(s.uid)) out.push({ kind: 'gear', it: s, id: s.id, n: 1, key: 't' + s.uid });
    for (const [id, n] of Object.entries(META.materials)) { const left = n - this.packedMat(id); if (ITEMS[id] && left > 0) out.push({ kind: 'mat', id, n: left, key: 'm' + id }); }
    return out;
  }
  /** every thing keeps its own peg while the wall is open (a packed one leaves its peg empty; it comes back to it) */
  private slots = new Map<string, number>();
  /** the wall laid out on pegs: slot index (across pages) -> entry; the page count */
  private wallLayout(): { bySlot: Map<number, Entry>; pages: number; list: Entry[] } {
    const list = this.entries(), bySlot = new Map<number, Entry>();
    for (const e of list) { const s = this.slots.get(e.key); if (s !== undefined && !bySlot.has(s)) bySlot.set(s, e); }
    for (const e of list) {
      if ([...bySlot.values()].includes(e)) continue;
      let s = 0; while (bySlot.has(s) || [...this.slots.entries()].some(([k, v]) => v === s && k !== e.key && list.some((q) => q.key === k))) s++;
      this.slots.set(e.key, s); bySlot.set(s, e);
    }
    const max = Math.max(-1, ...bySlot.keys());
    return { bySlot, pages: Math.max(1, Math.ceil((max + 1) / PER)), list };
  }
  private entryInst(e: Entry): ItemInst { return e.it ?? { uid: 0, id: e.id, gx: -1, gy: -1, rot: 0, level: 1, n: Math.min(e.n, stackCap(e.id)) }; }

  // ---------------------------------------------------------------- pack / unpack (with flights)
  /** pack a wall entry (auto-placed, or at a grid spot): the thing flies off its peg into the satchel */
  private packEntry(e: Entry, at?: { gx: number; gy: number; rot: number }, fly = true): boolean {
    const touched = e.kind === 'gear' ? [this.addGear(e.it!, at)].filter((q): q is ItemInst => !!q) : this.addMat(e.id, Math.min(e.n, stackCap(e.id)), at);
    if (!touched.length) return false;
    const hang = this.hangs.get(e.key);
    const from = hang ? hang.g.position.clone().add(new THREE.Vector3(0, -hang.size * 0.5, 0.05)) : new THREE.Vector3(WALL.x, WALL.y0 + WALL.h / 2, WALL.z + 0.2);
    const uids = touched.map((q) => q.uid);
    if (fly) {
      this.launch(e.id, e.it?.level ?? 1, from, this.mouthLocal(), 'in', e.key, uids, hang ? hang.size / ITEM_FIT : 1);
      for (const u of uids) this.bagArrive.set(u, 0.5);
    } else { this.landIn(uids, e.id); }
    if (hang && e.kind === 'gear') hang.g.visible = false;
    audio.play('hook_clink1', { vol: 0.3, rate: 1.2 }); audio.play('swish', { vol: 0.18, rate: 1.3 });
    return true;
  }
  /** unpack a satchel thing: it flies back to its peg */
  private unpack(it: ItemInst) {
    const key = it.uid >= 0 ? 't' + it.uid : 'm' + it.id;
    const had = this.entries().some((q) => q.key === key);
    this.pack = this.pack.filter((p) => p.uid !== it.uid);
    this.wallLayout();
    const idx = this.slots.get(key) ?? -1;
    const onPage = idx >= 0 && Math.floor(idx / PER) === this.page;
    const to = onPage ? this.hookItemPos(idx % PER, it.id) : new THREE.Vector3(WALL.x, WALL.y0 + WALL.h * 0.5, WALL.z + 0.3);
    this.launch(it.id, it.level ?? 1, this.mouthLocal(), to, 'out', key, [it.uid], 1);
    if (onPage && !had) this.hookArrive.set(key, 0.55);
    this.satchel.gulp(0.5);
    audio.play('k_pluck1', { vol: 0.3, dry: true }); audio.play('swish', { vol: 0.15, rate: 1.1 });
    this.peekIds = this.peekIds.filter((q) => q !== it.id || this.pack.some((p) => p.id === q)); this.syncPeek();
  }
  private mouthLocal(): THREE.Vector3 { this.satchel.root.updateWorldMatrix(true, true); return this.set.worldToLocal(this.satchel.mouth.getWorldPosition(new THREE.Vector3())); }
  private launch(id: string, level: number, a: THREE.Vector3, b: THREE.Vector3, dir: 'in' | 'out', key: string, uids: number[], k: number) {
    const m = new THREE.Group(), inner = itemModel(id);
    const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    inner.position.sub(c); m.add(inner);
    const s = ITEM_FIT / Math.max(0.01, size.x, size.y) * k;
    m.scale.setScalar(dir === 'in' ? s : s * 0.45);
    m.position.copy(a);
    m.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.items.add(m);
    void level;
    this.flights.push({ m, id, a: a.clone(), b: b.clone(), t: 0, dur: dir === 'in' ? 0.5 : 0.55, dir, s0: dir === 'in' ? s : s * 0.45, s1: dir === 'in' ? s * 0.45 : s, spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 9), key, uids, bub: 0 });
  }
  private clearFlights() { for (const f of this.flights) f.m.removeFromParent(); this.flights = []; }
  private updateFlights(dt: number) {
    const env = this.env;
    for (const f of this.flights) {
      f.t += dt;
      const u = clamp01(f.t / f.dur), e = u * u * (3 - 2 * u);
      const mid = f.a.clone().add(f.b).multiplyScalar(0.5); mid.y += 0.55 + f.a.distanceTo(f.b) * 0.18; mid.z += 0.35;
      const p = f.a.clone().multiplyScalar((1 - e) * (1 - e)).add(mid.multiplyScalar(2 * e * (1 - e))).add(f.b.clone().multiplyScalar(e * e));
      f.m.position.copy(p);
      f.m.rotation.set(f.spin.x * u, f.spin.y * u, f.spin.z * u);
      f.m.scale.setScalar(f.s0 + (f.s1 - f.s0) * e);
      f.bub -= dt;
      if (env && f.bub <= 0) { f.bub = 0.04; const w = this.set.localToWorld(p.clone()); env.bubbles.emit(w.x, w.y, w.z, { vy: 0.3, life: 1.1, size: 0.035 + Math.random() * 0.03, spread: 0.06 }); }
    }
    const done = this.flights.filter((f) => f.t >= f.dur);
    this.flights = this.flights.filter((f) => f.t < f.dur);
    for (const f of done) {
      f.m.removeFromParent();
      if (f.dir === 'in') this.landIn(f.uids, f.id);
      else {
        this.hookArrive.delete(f.key);
        const h = this.hangs.get(f.key); if (h) { h.v += 4.5; h.g.visible = true; }
        audio.play('hook_clink1', { vol: 0.35, rate: 0.9 + Math.random() * 0.2 });
      }
    }
  }
  /** something reached the satchel: it gulps and splashes, the pocket pops */
  private landIn(uids: number[], id: string) {
    for (const u of uids) { this.bagArrive.delete(u); this.popT.set(u, 0); }
    this.satchel.gulp(1);
    const env = this.env;
    if (env) {
      const w = this.satchel.mouth.getWorldPosition(new THREE.Vector3());
      for (let i = 0; i < 9; i++) env.bubbles.emit(w.x + (Math.random() - 0.5) * 0.3, w.y + 0.02, w.z + (Math.random() - 0.5) * 0.2, { vy: 0.5 + Math.random() * 0.7, life: 1.3, size: 0.04 + Math.random() * 0.05 });
      (env.hero as { sb?: { poke(x: number, y: number, k: number): void } }).sb?.poke(0.4, -1, 2.5);
    }
    audio.play('plop', { vol: 0.35, rate: 0.95 + Math.random() * 0.15 }); audio.play('k_drop3', { vol: 0.25, dry: true });
    if (id && !this.peekIds.includes(id)) { this.peekIds.push(id); if (this.peekIds.length > 3) this.peekIds.shift(); this.syncPeek(); }
  }
  /** the newest things poking out of the satchel's mouth */
  private syncPeek() {
    const P = this.satchel.peek;
    for (const c of [...P.children]) c.removeFromParent();
    const ids = this.peekIds.filter((id) => this.pack.some((p) => p.id === id)).slice(-3);
    ids.forEach((id, i) => {
      const m = itemModel(id), g = new THREE.Group();
      const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      m.position.set(-c.x, -box.min.y, -c.z); g.add(m);
      g.scale.setScalar(0.17 / Math.max(0.01, size.x, size.y));
      g.position.set((i - (ids.length - 1) / 2) * 0.13, 0, (i % 2 ? -0.04 : 0.03));
      g.rotation.set(-0.25, (i - 1) * 0.4, (i - 1) * -0.3);
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      P.add(g);
    });
  }

  // ---------------------------------------------------------------- the wall
  /** where an item on peg i hangs (its centre, set-local) */
  private hookItemPos(i: number, id: string): THREE.Vector3 {
    const h = this.hooks[i]; void id;
    return new THREE.Vector3(h.x, h.y - 0.05 - ITEM_FIT * 0.5, h.z + 0.06);
  }
  private hang(key: string, id: string, level: number): Hang {
    let h = this.hangs.get(key);
    if (h && h.id === id && h.level === level) return h;
    if (h) h.g.removeFromParent();
    const g = new THREE.Group(), inner = new THREE.Group(), m = itemModel(id);
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const s = ITEM_FIT / Math.max(0.01, size.x, size.y);
    m.position.set(-c.x, -box.max.y, -c.z);
    inner.add(m); inner.scale.setScalar(s); inner.position.y = -0.02;
    g.add(inner);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    h = { g, inner, key, id, level, a: 0, v: 2 + Math.random() * 2, lift: 0, size: Math.max(size.x, size.y) * s, base: s };
    this.hangs.set(key, h);
    this.items.add(g);
    return h;
  }
  private layoutWall(list: (Entry | null)[], hot: number, dt: number) {
    const live = new Set<string>();
    list.forEach((e, i) => {
      if (!e) return;
      const h = this.hang(e.key, e.id, e.it?.level ?? 1);
      live.add(e.key);
      const p = this.hooks[i];
      const dragging = this.drag?.moved && this.drag.entry?.key === e.key;
      h.g.visible = !this.hookArrive.has(e.key) && !(dragging && e.kind === 'gear') && !this.flights.some((f) => f.dir === 'in' && f.key === e.key && e.kind === 'gear');
      // swing on its twine: idle drift, a nudge when hovered, a kick when something lands on it
      for (let s = 0, n = Math.min(20, Math.ceil(dt / (1 / 120))); s < n; s++) { const q = dt / n; h.v += (-h.a * 30 - h.v * 3.2) * q; h.a += h.v * q; }
      h.lift = damp(h.lift, i === hot ? 1 : 0, 12, dt);
      h.g.position.set(p.x, p.y + h.lift * 0.03, p.z + h.lift * 0.12);
      h.g.rotation.set(-h.lift * 0.12, Math.sin(this.t * 0.7 + i) * 0.12 + h.lift * Math.sin(this.t * 3) * 0.2, h.a * 0.1 + Math.sin(this.t * 1.1 + i * 1.7) * 0.05);
      h.inner.scale.setScalar(h.base * (1 + h.lift * 0.14));
    });
    for (const [key, h] of this.hangs) if (!live.has(key)) { h.g.removeFromParent(); this.hangs.delete(key); }
    // the warm glow behind the hot one
    const gm = this.glow.material as THREE.MeshBasicMaterial;
    if (hot >= 0 && list[hot]) { const q = this.hookItemPos(hot, list[hot]!.id); this.glow.position.set(q.x, q.y + 0.02, q.z - 0.08); }
    gm.opacity = damp(gm.opacity, hot >= 0 && list[hot] ? 0.85 + Math.sin(this.t * 5) * 0.1 : 0, 10, dt);
  }

  // ---------------------------------------------------------------- the frame
  private local(x: number, y: number, z: number) { return this.set.localToWorld(new THREE.Vector3(x, y, z)); }
  /** a set-local point in UI px */
  private scr(v: THREE.Vector3, ui: PixelUI): [number, number] | null {
    if (!this.cam) return null;
    const p = this.set.localToWorld(v.clone()).project(this.cam);
    if (p.z > 1) return null;
    return [Math.round((p.x * 0.5 + 0.5) * ui.w), Math.round((-p.y * 0.5 + 0.5) * ui.h)];
  }
  /** the props' life: lantern flicker and swing, kelp sway, the satchel */
  private life(dt: number) {
    const L = this.lantern, t = this.t;
    L.light.intensity = (this.phase === 'off' ? 1.2 : 2.4) * (0.9 + Math.sin(t * 9.1) * 0.05 + Math.sin(t * 23.7) * 0.04 + (this.phase === 'beat' && this.beatT > 0.3 && this.beatT < 0.9 ? 0.6 : 0));
    L.swing.rotation.z = Math.sin(t * 1.3) * 0.06; L.swing.rotation.x = Math.sin(t * 0.9 + 1) * 0.04;
    this.wallLight.intensity = damp(this.wallLight.intensity, this.phase === 'pick' || this.phase === 'beat' ? 3.2 : 0, 4, dt);
    for (const s of this.sway) { const ph = s.userData.ph as number; s.rotation.z = Math.sin(t * 1.1 + ph) * 0.09; s.rotation.x = Math.sin(t * 0.8 + ph * 1.7) * 0.06; }
    this.satchel.update(dt, this.fillFrac(), this.phase === 'pick' || this.phase === 'beat');
  }

  update(dt: number, ui: PixelUI, input: Input, cam: THREE.PerspectiveCamera, ray: THREE.Raycaster, internalH: number, live: boolean) {
    void internalH;
    this.lastUi = ui; this.cam = cam;
    this.t += dt; this.flash.t -= dt;
    for (const [k, v] of this.bagArrive) this.bagArrive.set(k, v - dt);
    for (const [k, v] of this.popT) { if (v > 0.6) this.popT.delete(k); else this.popT.set(k, v + dt); }
    if (this.phase === 'beat') this.updateBeat(dt, ui, input, live);
    this.life(dt);
    this.set.updateWorldMatrix(true, true);
    const env = this.env;
    // the hero settles into its spot, facing the camera
    if (env && this.phase === 'pick') {
      const h = env.hero.root, spot = this.heroSpot();
      if (Math.hypot(h.position.x - spot.x, h.position.z - spot.z) < 0.25) h.rotation.y = dampAngle(h.rotation.y, HERO_YAW, 6, dt);
    }
    const pick = this.phase === 'pick';
    if (pick) this.uiK = Math.min(1, this.uiK + dt * 2.4);
    // ---- what the wall shows (this page)
    const { bySlot, pages, list } = this.wallLayout();
    this.page = Math.max(0, Math.min(this.page, pages - 1));
    const pageList: (Entry | null)[] = Array.from({ length: PER }, (_, i) => bySlot.get(this.page * PER + i) ?? null);
    // ---- the pointer over the wall
    let hoverHook = -1;
    if (live && pick && ui.inside && !ui.mouseOnUI && !this.drag?.moved) {
      for (const h of ray.intersectObjects(this.hitboxes, false)) { hoverHook = h.object.userData.hook as number; break; }
      if (!pageList[hoverHook]) hoverHook = -1;
    }
    if (input.mouse.moved && this.kbd) { this.kbd = false; }
    if (live && pick && !this.drag) this.keys(input, pageList, pages);
    const focusHook = this.kbd && this.focus?.area === 'wall' ? this.focus.i : -1;
    const hot = this.kbd ? focusHook : hoverHook;
    this.layoutWall(pageList, pick ? hot : -1, dt);
    this.updateFlights(dt);
    // the blobfish eyes whatever you are looking at (or the thing in flight)
    const fl = this.flights[this.flights.length - 1];
    this.look = fl ? this.set.localToWorld(fl.m.position.clone()) : hot >= 0 && pageList[hot] ? this.local(this.hooks[hot].x, this.hooks[hot].y - 0.2, this.hooks[hot].z) : null;
    if (!pick) { this.stage.detach(); return; }
    // ---- the 2D layer
    const k = easeOutBack(Math.min(1, this.uiK * 1.1)), kIn = (d: number) => easeOutBack(clamp01((this.uiK - d) / (1 - d)));
    // the wall rects (UI px) of this page's pegs, for cards, counts, focus
    this.wallRects = pageList.map((e, i) => {
      if (!e) return null;
      const q = this.hookItemPos(i, e.id), a = this.scr(q.clone().add(new THREE.Vector3(-ITEM_FIT * 0.55, ITEM_FIT * 0.55, 0)), ui), b = this.scr(q.clone().add(new THREE.Vector3(ITEM_FIT * 0.55, -ITEM_FIT * 0.55, 0)), ui);
      return a && b ? [a[0], a[1], b[0] - a[0], b[1] - a[1]] : null;
    });
    this.drawCounts(ui, pageList);
    const satX = ui.w - SAT.w - 10 + Math.round((1 - kIn(0.1)) * 240), satY = 8;
    this.gridAt = [satX + SAT.gx, satY + SAT.gy];
    const bagHover = this.drawSatchel(ui, satX, satY, dt);
    const tallyY = satY + SAT.h + 4;
    this.drawTally(ui, satX, tallyY, SAT.w);
    this.drawMedals(ui, dt, Math.round((1 - kIn(0.25)) * 90));
    const wallSign = this.drawWallSign(ui, pageList.filter(Boolean).length, list.length, pages, Math.round((1 - kIn(0)) * -60));
    // ---- the buttons: HOME (top left), MASTERY (bottom, by the dive), SWIM OUT
    const by = ui.h - 40 + Math.round((1 - kIn(0.35)) * 60);
    this.drawMastery(ui, ui.w - SAT.w - 10 - 118 - 30, by, live);
    const kk = 0.5 + 0.5 * Math.sin(this.t * 3.2);
    const bx = ui.w - SAT.w - 10, bw = SAT.w, bh = 30;
    if (!this.drag) { ui.fill(bx - 3, by - 3, bw + 6, bh + 6, '#8ee06a', 0.1 + 0.12 * kk); ui.rect(bx - 2, by - 2, bw + 4, bh + 4, '#5fae3f'); }
    bubbles(ui, bx + 10, by - 2, bw - 20, this.t, 4, 3, 18);
    const canAct = live && !this.drag && this.uiK > 0.6;
    const dive = canAct && ui.button('pack:swim', 'SWIM OUT', bx, by, bw, bh, { style: 'green', font: 'title', key: 'Enter', keyLabel: 'ENTER' });
    const home = canAct && ui.button('pack:home', 'HOME', 10, 8 + Math.round((1 - k) * -40), 78, 22, { style: 'dark', font: 'body', key: 'Escape', keyLabel: 'ESC' });
    if (dive && !this.diving) { this.dive(); return; }
    if (home) { this.onClose?.(); return; }
    void wallSign;
    // ---- clicks and drags
    this.pointer(ui, input, live, pageList, hoverHook, bagHover);
    // ---- the cards: the dragged thing, a flash, the hovered / focused thing
    if (this.drag?.moved) this.drawDrag(ui);
    else if (this.flash.t > 0) this.flashCard(ui, satX + SAT.w / 2, satY + SAT.gy + 40, this.flash.text, this.flash.sub);
    else if (hot >= 0 && pageList[hot] && this.wallRects[hot]) { const e = pageList[hot]!; this.card(ui, { id: e.id, level: e.it?.level ?? 1, n: e.n, from: 'wall' }, this.wallRects[hot]!, 1); }
    else {
      const bagIt = this.kbd && this.focus?.area === 'bag' ? this.pack.find((p) => p.uid === (this.focus as { uid: number }).uid) ?? null : bagHover;
      if (bagIt && !this.drag && !this.bagArrive.has(bagIt.uid)) this.card(ui, { id: bagIt.id, level: bagIt.level ?? 1, n: bagIt.n, from: 'bag' }, this.itemRect(bagIt), -1);
    }
    if (!list.length && !this.flights.length) this.emptyNote(ui);
    if (this.kbd) this.keyHints(ui);
  }

  /** going out: the swoop to the doorstep, the door swinging open, the step out into the nook */
  private updateBeat(dt: number, ui: PixelUI, input: Input, live: boolean) {
    const env = this.env;
    if (!env) { this.phase = 'pick'; return; }
    this.beatT += dt;
    const b = this.beatT;
    const cue = (id: string, at: number, fn: () => void) => { if (b >= at && !this.beatCues.has(id)) { this.beatCues.add(id); fn(); } };
    cue('walk', 0.18, () => env.walk(this.heroSpot()));
    cue('door', 0.3, () => {
      this.door = 1;
      audio.play('creak', { vol: 0.45 }); audio.play('flood_rush1', { vol: 0.12, delay: 0.1 }); audio.play('bubbles_b', { vol: 0.2, delay: 0.2 });
      const d = SET_AT;
      for (let i = 0; i < 16; i++) env.bubbles.emit(d.x + (Math.random() - 0.5) * 1.4, 0.2 + Math.random() * 1.6, d.z + 0.1, { vy: 0.2 + Math.random() * 0.4, vz: 0.3, life: 2, size: 0.04 + Math.random() * 0.05 });
    });
    cue('shot', 0.75, () => { env.rig.shot = this.shot(); env.rig.k = 2.1; });
    cue('kit', 1.1, () => { audio.play('box_open', { vol: 0.28 }); audio.play('k_open2', { vol: 0.25, dry: true }); });
    const skip = live && b > 0.15 && (input.keyHit('Escape') || input.keyHit('Enter') || input.keyHit('Space') || ui.pressed);
    if (skip || b > 1.5) this.finishBeat(skip);
  }
  private finishBeat(skipped: boolean) {
    const env = this.env;
    this.phase = 'pick'; this.door = 1; this.uiK = 0;
    if (!env) return;
    env.rig.shot = this.shot(); env.rig.k = 2.3;
    if (skipped) {
      env.stopWalk();
      const h = env.hero.root; h.position.copy(this.heroSpot()); h.rotation.y = HERO_YAW;
      env.rig.snap(); env.cut();
      if (!this.beatCues.has('door')) audio.play('creak', { vol: 0.35 });
    }
    this.beatCues.add('walk'); this.beatCues.add('door'); this.beatCues.add('shot');
  }

  /** swimming out: the cinematic; true when the run should start */
  cineUpdate(dt: number, ui: PixelUI, input: Input, live: boolean): boolean {
    this.t += dt;
    this.life(dt);
    return this.cine.update(dt, ui, input, live);
  }

  // ---------------------------------------------------------------- input
  private keys(input: Input, pageList: (Entry | null)[], pages: number) {
    const hit = (...codes: string[]) => codes.some((c) => input.keyHit(c));
    const dx = (hit('ArrowRight', 'KeyD') ? 1 : 0) - (hit('ArrowLeft', 'KeyA') ? 1 : 0), dy = (hit('ArrowDown', 'KeyS') ? 1 : 0) - (hit('ArrowUp', 'KeyW') ? 1 : 0);
    const tab = hit('Tab');
    const nav = dx || dy || tab;
    if (nav && !this.kbd) { this.kbd = true; if (!this.focus) { this.focus = pageList.length ? { area: 'wall', i: 0 } : this.pack[0] ? { area: 'bag', uid: this.pack[0].uid } : null; audio.play('k_tick1', { vol: 0.2, dry: true }); return; } }
    if (hit('KeyQ', 'PageUp') && this.page > 0) { this.page--; this.focus = pageList.length ? { area: 'wall', i: 0 } : this.focus; audio.play('page1', { vol: 0.3 }); }
    if (hit('KeyE', 'PageDown') && this.page < pages - 1) { this.page++; this.focus = { area: 'wall', i: 0 }; audio.play('page1', { vol: 0.3 }); }
    let f = this.focus;
    if (f?.area === 'bag' && !this.pack.some((p) => p.uid === (f as { uid: number }).uid)) f = this.pack[0] ? { area: 'bag', uid: this.pack[0].uid } : pageList.length ? { area: 'wall', i: 0 } : null;
    if (f?.area === 'wall' && f.i >= pageList.length) f = pageList.length ? { area: 'wall', i: pageList.length - 1 } : this.pack[0] ? { area: 'bag', uid: this.pack[0].uid } : null;
    if (tab) f = f?.area === 'wall' ? (this.pack[0] ? { area: 'bag', uid: this.pack[0].uid } : f) : pageList.length ? { area: 'wall', i: 0 } : f;
    else if ((dx || dy) && f) {
      if (f.area === 'wall') {
        const c = f.i % WALL.cols, r = Math.floor(f.i / WALL.cols);
        if (dx > 0 && c === WALL.cols - 1) { if (this.pack[0]) f = { area: 'bag', uid: this.nearestBag(0, r * 2).uid }; }
        else { const nc = Math.max(0, Math.min(WALL.cols - 1, c + dx)), nr = Math.max(0, Math.min(WALL.rows - 1, r + dy)); const ni = nr * WALL.cols + nc; if (ni < pageList.length) f = { area: 'wall', i: ni }; }
      } else {
        const cur = this.pack.find((p) => p.uid === (f as { uid: number }).uid)!;
        const [cx, cy] = this.centre(cur);
        let best: ItemInst | null = null, bd = Infinity;
        for (const p of this.pack) {
          if (p.uid === cur.uid) continue;
          const [px, py] = this.centre(p), ddx = px - cx, ddy = py - cy;
          if ((dx && Math.sign(ddx) !== dx) || (dy && Math.sign(ddy) !== dy)) continue;
          const d = (dx ? Math.abs(ddx) : Math.abs(ddy)) + (dx ? Math.abs(ddy) : Math.abs(ddx)) * 2;
          if (d < bd) { bd = d; best = p; }
        }
        if (best) f = { area: 'bag', uid: best.uid };
        else if (dx < 0 && pageList.length) f = { area: 'wall', i: Math.min(pageList.length - 1, Math.min(WALL.rows - 1, Math.floor(cy / 2)) * WALL.cols + WALL.cols - 1) };
      }
    }
    if (nav && f !== this.focus) audio.play('k_tick1', { vol: 0.15, dry: true, rate: 1.2 });
    this.focus = f;
    // Space / E-less: pack or unpack the focused thing
    if (this.kbd && f && hit('Space')) {
      if (f.area === 'wall') { const e = pageList[f.i]; if (e) this.packEntry(e); }
      else { const it = this.pack.find((p) => p.uid === (f as { uid: number }).uid); if (it) { this.unpack(it); this.focus = this.pack[0] ? { area: 'bag', uid: this.nearestBag(...this.centre(it)).uid } : pageList.length ? { area: 'wall', i: 0 } : null; } }
    }
  }
  private centre(p: ItemInst): [number, number] { const c = instCells(p); return [c.reduce((s, q) => s + q[0], 0) / c.length, c.reduce((s, q) => s + q[1], 0) / c.length]; }
  private nearestBag(x: number, y: number): ItemInst { let best = this.pack[0], bd = Infinity; for (const p of this.pack) { const [px, py] = this.centre(p), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = p; } } return best; }

  /** clicks and drags across the wall and the satchel */
  private pointer(ui: PixelUI, input: Input, live: boolean, pageList: (Entry | null)[], hoverHook: number, bagHover: ItemInst | null) {
    if (!live) { this.drag = null; return; }
    if (!this.drag && ui.pressed) {
      if (hoverHook >= 0 && pageList[hoverHook]) { const e = pageList[hoverHook]!; this.drag = { from: 'wall', it: this.entryInst(e), entry: e, sx: ui.mx, sy: ui.my, moved: false, rot: 0 }; }
      else if (bagHover) this.drag = { from: 'bag', it: bagHover, sx: ui.mx, sy: ui.my, moved: false, rot: bagHover.rot };
    }
    const d = this.drag;
    if (!d) { if (hoverHook >= 0 || bagHover) ui.cursor = 'grab'; return; }
    ui.cursor = 'grab';
    if (!d.moved && Math.hypot(ui.mx - d.sx, ui.my - d.sy) > 4) { d.moved = true; audio.play('k_pluck1', { vol: 0.3, dry: true }); }
    if (d.moved && (input.keyHit('KeyR') || ui.rpressed)) { d.rot = (d.rot + 1) % 4; audio.play('k_tick1', { vol: 0.25, dry: true }); }
    if (ui.released) {
      if (!d.moved) {
        if (d.from === 'wall' && d.entry) this.packEntry(d.entry);
        else if (d.from === 'bag') this.unpack(d.it);
      } else {
        const g = this.dropCell(ui, d);
        if (g) {
          const others = this.pack.filter((p) => p.uid !== d.it.uid || d.from === 'wall');
          const stack = stackCap(d.it.id) > 1 ? others.find((p) => p.id === d.it.id && p.uid < 0 && instCells(p).some(([x, y]) => x === g.cx && y === g.cy)) : undefined;
          const ok = !!stack || fits(others, { ...d.it, gx: -1, gy: -1, rot: d.rot }, g.gx, g.gy, d.rot);
          if (!ok) { audio.play('k_err1', { vol: 0.35, dry: true }); this.satchel.strain(); }
          else if (d.from === 'wall' && d.entry) { if (this.packEntry(d.entry, stack ? undefined : { gx: g.gx, gy: g.gy, rot: d.rot }, false)) { if (d.entry.kind === 'gear') { const h = this.hangs.get(d.entry.key); if (h) h.g.visible = false; } } }
          else if (d.from === 'bag') {
            if (stack) { const k = Math.min(stackCap(d.it.id) - (stack.n ?? 1), d.it.n ?? 1); stack.n = (stack.n ?? 1) + k; d.it.n = (d.it.n ?? 1) - k; if ((d.it.n ?? 0) <= 0) this.pack = this.pack.filter((p) => p.uid !== d.it.uid); this.popT.set(stack.uid, 0); }
            else { d.it.gx = g.gx; d.it.gy = g.gy; d.it.rot = d.rot; this.popT.set(d.it.uid, 0); }
            this.satchel.gulp(0.6); audio.play('k_drop3', { vol: 0.3, dry: true });
          }
        } else if (d.from === 'bag' && !this.overSatchel(ui)) this.unpack(d.it);
      }
      this.drag = null;
    } else if (!ui.down && !ui.pressed) this.drag = null;
  }
  private overSatchel(ui: PixelUI) { const [gx, gy] = this.gridAt; return ui.mx >= gx - SAT.gx && ui.mx < gx - SAT.gx + SAT.w && ui.my >= gy - SAT.gy && ui.my < gy - SAT.gy + SAT.h; }
  /** the grid cell a dragged thing would drop at (its footprint centred on the mouse) */
  private dropCell(ui: PixelUI, d: Drag): { gx: number; gy: number; cx: number; cy: number } | null {
    const [gx0, gy0] = this.gridAt;
    const cells = instCells({ ...d.it, gx: 0, gy: 0, rot: d.rot }, d.rot, 0, 0);
    const pw = Math.max(...cells.map((q) => q[0])) + 1, ph = Math.max(...cells.map((q) => q[1])) + 1;
    const fx = (ui.mx - gx0) / CELL, fy = (ui.my - gy0) / CELL;
    if (fx < -0.6 || fy < -0.6 || fx > GRID_W + 0.6 || fy > GRID_H + 0.6) return null;
    return { gx: Math.round(fx - pw / 2), gy: Math.round(fy - ph / 2), cx: Math.floor(fx), cy: Math.floor(fy) };
  }

  // ---------------------------------------------------------------- 2D drawing
  /** an item icon over its cells (rotated in quarter turns), optionally popped bigger */
  private drawIcon(ui: PixelUI, id: string, level: number, rot: number, x: number, y: number, alpha = 1, scale = 1) {
    const d = getItem(id), sz = shapeSize(d.shape);
    const w = sz.w * CELL - 2, h = sz.h * CELL - 2;
    const fw = (rot % 2 ? sz.h : sz.w) * CELL, fh = (rot % 2 ? sz.w : sz.h) * CELL;
    const ic = itemIconBox(id, w, h, level), c = ui.ctx;
    c.save(); c.globalAlpha = alpha; c.translate(Math.round(x + fw / 2), Math.round(y + fh / 2)); c.rotate((rot % 4) * Math.PI / 2); if (scale !== 1) c.scale(scale, scale);
    c.drawImage(ic, -Math.round(w / 2), -Math.round(h / 2), w, h); c.restore();
  }
  private itemRect(it: ItemInst): [number, number, number, number] {
    const cells = instCells(it), xs = cells.map((q) => q[0]), ys = cells.map((q) => q[1]);
    const [gx0, gy0] = this.gridAt;
    return [gx0 + Math.min(...xs) * CELL, gy0 + Math.min(...ys) * CELL, (Math.max(...xs) - Math.min(...xs) + 1) * CELL, (Math.max(...ys) - Math.min(...ys) + 1) * CELL];
  }
  /** the satchel panel: the open bag, its pockets, what is in them. Returns the hovered thing */
  private drawSatchel(ui: PixelUI, x: number, y: number, dt: number): ItemInst | null {
    void dt;
    const fill = this.fillFrac(), bulge = fill > 0.8 ? 3 : fill > 0.55 ? 2 : fill > 0.25 ? 1 : 0;
    const art = satchelArt(bulge);
    const shake = this.flash.t > 1.2 && this.flash.text === 'SATCHEL FULL' ? Math.round(Math.sin(this.t * 50) * 2) : 0;
    const ax = x - bulge + shake;
    ui.img(art, ax, y);
    ui.block(ax, y, art.width, art.height);
    ui.mark('pack:satchel', ax, y, art.width, art.height);
    // the flap's embossed name, the brass count plate on the pocket
    ui.text('THE', x + SAT.w / 2 - 30, y + 6, { font: 'small', color: '#2a120c', shadow: '#a8653a', align: 'center' });
    ui.text('SATCHEL', x + SAT.w / 2 + 32, y + 6, { font: 'small', color: '#2a120c', shadow: '#a8653a', align: 'center' });
    const used = this.cellsUsed(), cnt = ui.count('pack:cells', used, { dur: 0.35 });
    const pw = 66, ph = 20, px = Math.round(x + SAT.w / 2 - pw / 2), py = y + SAT.pocketY + 8;
    ui.fill(px + 2, py + 2, pw, ph, '#000000', 0.35);
    ui.frame('brass', px, py, pw, ph);
    const pulse = ui.countPulse('pack:cells');
    ui.text(`${cnt}/${GRID_W * GRID_H}`, px + pw / 2, py + Math.round((ph - ui.cap('body')) / 2) - (pulse > 0.5 ? 1 : 0), { font: 'body', color: used >= GRID_W * GRID_H ? '#8a1a10' : '#3a2008', shadow: '#f8dc90', align: 'center' });
    // what is in the pockets
    const [gx0, gy0] = [x + SAT.gx, y + SAT.gy];
    this.gridAt = [gx0 + shake, gy0];
    let hover: ItemInst | null = null;
    const inGrid = ui.mx >= gx0 && ui.my >= gy0 && ui.mx < gx0 + GRID_W * CELL && ui.my < gy0 + GRID_H * CELL;
    const hc = inGrid ? [Math.floor((ui.mx - gx0) / CELL), Math.floor((ui.my - gy0) / CELL)] : null;
    for (const it of this.pack) {
      if (this.bagArrive.has(it.uid)) continue;
      const cells = instCells(it);
      if (hc && !this.drag?.moved && cells.some(([cx, cy]) => cx === hc[0] && cy === hc[1])) hover = it;
    }
    const focusUid = this.kbd && this.focus?.area === 'bag' ? this.focus.uid : null;
    const hotUid = this.kbd ? focusUid : hover?.uid ?? null;
    for (const it of this.pack) {
      if (this.bagArrive.has(it.uid)) continue;
      if (this.drag?.moved && this.drag.from === 'bag' && this.drag.it.uid === it.uid) continue;
      const cells = instCells(it), xs = cells.map((q) => q[0]), ys = cells.map((q) => q[1]);
      const X = gx0 + Math.min(...xs) * CELL, Y = gy0 + Math.min(...ys) * CELL;
      const hot = it.uid === hotUid;
      if (hot) for (const [cx, cy] of cells) ui.fill(gx0 + cx * CELL + 1, gy0 + cy * CELL + 1, CELL - 1, CELL - 1, '#f2c66d', 0.2);
      else { const col = RARITY_COLOR[getItem(it.id).rarity]; for (const [cx, cy] of cells) { ui.fill(gx0 + cx * CELL + 2, gy0 + cy * CELL + CELL - 2, CELL - 3, 1, col, 0.55); } }
      const pt = this.popT.get(it.uid);
      if (pt !== undefined && pt < 0.02) ui.splash(X + ((Math.max(...xs) - Math.min(...xs) + 1) * CELL) / 2, Y + 4, 6);
      const pop = pt !== undefined ? 1 + Math.sin(Math.min(1, pt / 0.35) * Math.PI) * 0.28 : 1;
      this.drawIcon(ui, it.id, it.level ?? 1, it.rot, X, Y, 1, pop * (hot ? 1.06 : 1));
      if ((it.n ?? 1) > 1) ui.text(String(it.n), X + (Math.max(...xs) - Math.min(...xs) + 1) * CELL - 2, Y + (Math.max(...ys) - Math.min(...ys) + 1) * CELL - ui.lh('small') + 1, { font: 'small', color: K.brassW, outline: K.ink2, align: 'right' });
      if (hot) { const r = this.itemRect(it); ui.brackets(r[0] - 1, r[1] - 1, r[2] + 1, r[3] + 1, '#f2c66d', 4); }
    }
    for (let j = 0; j < GRID_H; j++) for (let i = 0; i < GRID_W; i++) ui.mark(`pack:bag:${i},${j}`, gx0 + i * CELL, gy0 + j * CELL, CELL, CELL);
    // the cells a dragged thing would take: green where it fits, red where it does not
    if (this.drag?.moved) {
      const d = this.drag, g = this.dropCell(ui, d);
      if (g) {
        const others = this.pack.filter((p) => p.uid !== d.it.uid || d.from === 'wall');
        const ok = fits(others, { ...d.it, gx: -1, gy: -1, rot: d.rot }, g.gx, g.gy, d.rot) || (stackCap(d.it.id) > 1 && others.some((p) => p.id === d.it.id && p.uid < 0 && instCells(p).some(([cx, cy]) => cx === g.cx && cy === g.cy)));
        for (const [cx, cy] of instCells({ ...d.it, gx: g.gx, gy: g.gy, rot: d.rot })) if (cx >= 0 && cy >= 0 && cx < GRID_W && cy < GRID_H) ui.fill(gx0 + cx * CELL + 1, gy0 + cy * CELL + 1, CELL - 1, CELL - 1, ok ? '#7ef08a' : '#ff5a4a', 0.35);
      }
    }
    bubbles(ui, x + 24, y + SAT.h - 2, SAT.w - 48, this.t, 11, 3, 16);
    return hover;
  }
  /** the dragged thing under the cursor */
  private drawDrag(ui: PixelUI) {
    const d = this.drag!;
    const sz = shapeSize(getItem(d.it.id).shape), fw = (d.rot % 2 ? sz.h : sz.w) * CELL, fh = (d.rot % 2 ? sz.w : sz.h) * CELL;
    this.drawIcon(ui, d.it.id, d.it.level ?? 1, d.rot, ui.mx - fw / 2, ui.my - fh / 2 - 2, 0.92, 1.12);
    if (!PixelUI.touch) ui.text('R  turn', ui.mx + fw / 2 + 4, ui.my - 4, { font: 'small', color: K.cream2, outline: K.ink2 });
  }
  /** the tally: what the packed gear makes of you, counting as it changes */
  private drawTally(ui: PixelUI, x: number, y: number, w: number) {
    const h = 56;
    ui.img(wellArt(w, h, 'plank'), x, y);
    ui.block(x, y, w, h);
    const packed = this.pack.filter((p) => p.gx >= 0 && !this.bagArrive.has(p.uid));
    const s = applyItems({ ...BASE_STATS, abilities: [], skills: [], sets: {}, gear: {} }, packed);
    STAT_ROWS.forEach((row, i) => {
      const col = i % 2, r = Math.floor(i / 2);
      const cx = x + 8 + col * Math.round(w / 2), cy = y + 6 + r * 15, cw = Math.round(w / 2) - 14;
      const v = Math.round((s[row.k] as number) * row.mul), b = Math.round((BASE_STATS[row.k] as number) * row.mul);
      const prev = this.statShown.get(row.k);
      if (prev !== undefined && prev !== v) this.statFlash.set(row.k, { t: 1.1, up: v > prev });
      this.statShown.set(row.k, v);
      const fl = this.statFlash.get(row.k);
      if (fl) { fl.t -= ui.dt; if (fl.t <= 0) this.statFlash.delete(row.k); }
      if (fl) ui.fill(cx - 3, cy - 1, cw + 6, 13, fl.up ? '#7ef08a' : '#ff7a6a', 0.14 * Math.min(1, fl.t * 2));
      ui.icon(row.icon, cx, cy + 1);
      ui.text(row.label, cx + 12, cy + 1, { font: 'small', color: K.dim, shadow: K.ink2 });
      const shown = ui.count('pack:st:' + row.k, v, { sfx: false });
      const color = v > b ? K.kelpL : v < b ? K.coralL : K.cream;
      ui.text(row.fmt(shown), cx + cw, cy, { font: 'body', color, outline: K.ink2, align: 'right' });
      if (fl && Math.sin(fl.t * 18) > -0.3) {
        const ax = cx + cw - ui.measure(row.fmt(shown), 'body') - 7, ay = cy + 3;
        const c = fl.up ? K.kelpL : K.coralL;
        if (fl.up) { ui.fill(ax + 2, ay, 1, 1, c); ui.fill(ax + 1, ay + 1, 3, 1, c); ui.fill(ax, ay + 2, 5, 1, c); }
        else { ui.fill(ax, ay, 5, 1, c); ui.fill(ax + 1, ay + 1, 3, 1, c); ui.fill(ax + 2, ay + 2, 1, 1, c); }
      }
    });
    // the sets this gear starts: compact chips under the tally
    const sets = setBonuses(packed);
    let sx = x, sy = y + h + 3;
    for (const st of sets.slice(0, 4)) {
      const lab = `${st.name.toUpperCase()} ${st.count}${st.next ? '/' + st.next : ''}`;
      const cw = ui.measure(lab, 'small') + 14;
      if (sx + cw > x + w) { sx = x; sy += 14; }
      ui.fill(sx, sy, cw, 12, K.ink2, 0.9); ui.rect(sx, sy, cw, 12, st.color);
      ui.fill(sx + 3, sy + 4, 4, 4, st.color); if (st.tier) ui.fill(sx + 3, sy + 4, 2, 1, '#ffffff', 0.7);
      ui.text(lab, sx + 9, sy + 2, { font: 'small', color: st.tier ? st.color : K.cream2, shadow: null });
      sx += cw + 3;
    }
  }
  /** the abilities: medallions hanging on a rope, bottom left (y0: slide-in offset) */
  private drawMedals(ui: PixelUI, dt: number, y0: number) {
    const packed = this.pack.filter((p) => p.gx >= 0 && !this.bagArrive.has(p.uid));
    const stats = applyItems({ ...BASE_STATS, abilities: [], skills: [], sets: {}, gear: {} }, packed);
    // the skills the gear deals and the ability cores it grants: both are cast from the run's medallions
    const skills = [...new Set([...(stats.skills ?? []), ...(stats.abilities ?? [])])].filter((s) => SKILL_NAMES[s] || (ABILITY_NAME as Record<string, string>)[s]).slice(0, 6);
    // keep the ones still granted, add the new ones (they drop onto the rope)
    for (const m of this.medals) if (!skills.includes(m.id)) m.c.root.removeFromParent();
    this.medals = this.medals.filter((m) => skills.includes(m.id));
    for (const id of skills) if (!this.medals.some((m) => m.id === id)) {
      const c = new AbilityMedallion(id, { d: 34 });
      this.medals.push({ id, c, born: this.t });
      if (this.uiK > 0.9) { audio.play('shimmer2', { vol: 0.3, dry: true, delay: 0.15 }); audio.play('k_glass1', { vol: 0.2, dry: true, delay: 0.25 }); }
    }
    this.medals.sort((a, b) => skills.indexOf(a.id) - skills.indexOf(b.id));
    this.stage.attach(ui);
    const ry = ui.h - 66 + y0, x0 = 14, step = 42, n = Math.max(3, this.medals.length);
    const rw = n * step + 10;
    // the label tag and the rope (sagging between the hang points; never drawn over a medallion)
    ui.text('ABILITIES', x0 + 2, ry - 13, { font: 'small', color: K.brass2, outline: K.ink2 });
    for (let xx = 0; xx < rw; xx++) {
      const u = (xx % step) / step, sag = Math.round(Math.sin(u * Math.PI) * 3);
      const yy = ry + sag;
      const C = ['#1e1309', '#b49250', '#8c6e38', '#3e2b12'];
      for (let k = 0; k < 4; k++) ui.fill(x0 + xx, yy + k - 1, 1, 1, k === 1 && (xx % 3 === 0) ? '#d6b874' : C[k]);
    }
    rope(ui, x0 - 4, ry - 6, 10, true);
    for (let i = 0; i < n; i++) {
      const hx = x0 + Math.round(step / 2) + i * step;
      const m = this.medals[i];
      if (!m) {
        // an empty brass hook waiting
        ui.fill(hx - 2, ry + 2, 4, 5, '#4a2c0e'); ui.fill(hx - 1, ry + 3, 2, 3, '#c8913a'); ui.fill(hx - 1, ry + 3, 1, 1, '#f2c66d');
        continue;
      }
      const age = this.t - m.born, drop = age < 0.45 ? (1 - easeOutBack(age / 0.45)) * -40 : 0;
      const sway = Math.sin(this.t * 1.4 + i * 1.3) * 1.2;
      const cy = ry + 24 + drop;
      ui.fill(hx, ry + 2, 1, Math.max(0, cy - 17 - ry - 2), '#8c6e38');
      const hov = !this.drag && ui.hover(hx - 17, cy - 17, 34, 34) ? 1 : 0;
      this.stage.put(m.c.root, hx + sway, cy, 10);
      m.c.update(Math.min(dt, 1 / 40), { hover: hov, ready: true, selected: age < 0.8 });
      if (age < 0.05) m.c.bump();
      ui.block(hx - 17, cy - 17, 34, 34);
      if (hov) { const it = skillItem(m.id); ui.tooltip([{ text: SKILL_NAMES[m.id] ?? (ABILITY_NAME as Record<string, string>)[m.id] ?? m.id, font: 'title', color: K.brass2 }, { text: it ? `from your ${it.name}` : 'granted by your gear', color: K.cream2, font: 'small' }], { kind: 'dark', maxW: 170 }); }
    }
    if (!this.medals.length) ui.text('pack gear to gain abilities', x0 + 4, ry + 12, { font: 'small', color: K.dim2, outline: K.ink2 });
  }
  /** the kit wall's name board, hung over the wall; page knobs when there is more than one page */
  private drawWallSign(ui: PixelUI, onPage: number, total: number, pages: number, dy: number): [number, number, number, number] | null {
    const top = this.scr(new THREE.Vector3(WALL.x, WALL.y0 + WALL.h + 0.34, WALL.z + 0.1), ui);
    if (!top) return null;
    const w = 150, h = 30, x = Math.round(top[0] - w / 2), y = Math.max(34, top[1] - h) + dy;
    for (const rx of [x + 14, x + w - 18]) rope(ui, rx, 0, y + 2, true);
    ui.fill(x + 3, y + 4, w, h, '#000000', 0.3);
    ui.img(wellArt(w, h, 'plank'), x, y);
    ui.block(x, y, w, h);
    ui.text('THE KIT WALL', x + w / 2, y + 4, { font: 'title', color: K.brass2, outline: K.ink2, align: 'center' });
    const sub = total ? (pages > 1 ? `page ${this.page + 1} of ${pages}  ·  ${total} things` : `${total} thing${total > 1 ? 's' : ''} to take`) : 'nothing hanging';
    ui.text(sub, x + w / 2, y + 4 + ui.lh('title') - 3, { font: 'small', color: K.cream2, outline: K.ink2, align: 'center' });
    if (pages > 1 && !this.drag) {
      if (ui.button('pack:pageL', '', x - 22, y + 6, 18, 18, { style: 'brass', icon: 'left', disabled: this.page <= 0 })) { this.page--; this.focus = null; audio.play('page1', { vol: 0.3 }); }
      if (ui.button('pack:pageR', '', x + w + 4, y + 6, 18, 18, { style: 'brass', icon: 'right', disabled: this.page >= pages - 1 })) { this.page++; this.focus = null; audio.play('page1', { vol: 0.3 }); }
    }
    void onPage;
    return [x, y, w, h];
  }
  /** material stack counts: a little brass tag under each hanging stack */
  private drawCounts(ui: PixelUI, list: (Entry | null)[]) {
    list.forEach((e, i) => {
      const r = this.wallRects[i];
      if (!r || !e || e.kind !== 'mat' || this.hookArrive.has(e.key)) return;
      const s = `x${e.n}`, w = ui.measure(s, 'small') + 6, x = r[0] + r[2] - w + 2, y = r[1] - 4;
      ui.fill(x, y, w, 11, '#0b1622', 0.75); ui.fill(x, y, w, 1, '#c8913a', 0.8);
      ui.text(s, x + 3, y + 2, { font: 'small', color: K.brass2, shadow: null });
    });
    // the keyboard focus on the wall
    if (this.kbd && this.focus?.area === 'wall') { const r = this.wallRects[this.focus.i]; if (r) { const p = Math.round(Math.sin(this.t * 6) * 1.5); ui.brackets(r[0] - 3 - p, r[1] - 3 - p, r[2] + 6 + p * 2, r[3] + 6 + p * 2, '#f2c66d', 5); } }
  }
  /** the brass mastery plate: MASTERY n, its name, ◄ ►, - / + keys, the wheel */
  private drawMastery(ui: PixelUI, x: number, y: number, live: boolean) {
    const w = 118, h = 30;
    const m = MASTERY[this.mastery];
    const setM = (v: number) => {
      const nm = Math.max(0, Math.min(Math.min(MAX_MASTERY, META.masteryUnlocked), v));
      if (nm === this.mastery) { audio.play('k_err1', { vol: 0.25, dry: true }); return; }
      this.mastery = nm; audio.play('k_tick2', { vol: 0.4, dry: true, rate: 0.8 + nm * 0.05 }); audio.play('clank2', { vol: 0.15 });
    };
    ui.fill(x + 2, y + 2, w, h, '#000000', 0.35);
    ui.frame('brass', x, y, w, h);
    ui.text('MASTERY', x + 8, y + 4, { font: 'small', color: '#5a3410', shadow: null });
    const num = ui.count('pack:mastery', this.mastery, { dur: 0.2, sfx: false });
    ui.text(String(num), x + w - 16, y + Math.round((h - ui.cap('title')) / 2) - 1, { font: 'title', color: this.mastery ? '#8a1a10' : '#3a2008', shadow: '#f8dc90', align: 'center' });
    ui.text(m.name, x + 8, y + 4 + ui.lh('small'), { font: 'small', color: '#3a2008', shadow: '#f0cc80' });
    const hov = ui.hover(x, y, w, h);
    if (live && !this.drag) {
      if (ui.button('pack:mLess', '', x - 18, y + 6, 16, 18, { style: 'dark', icon: 'left', disabled: this.mastery <= 0, sfx: '' })) setM(this.mastery - 1);
      if (ui.button('pack:mMore', '', x + w + 2, y + 6, 16, 18, { style: 'dark', icon: 'right', disabled: this.mastery >= Math.min(MAX_MASTERY, META.masteryUnlocked), sfx: '' })) setM(this.mastery + 1);
      const inp = ui.input;
      if (inp && (inp.keyHit('Minus') || inp.keyHit('NumpadSubtract'))) setM(this.mastery - 1);
      if (inp && (inp.keyHit('Equal') || inp.keyHit('NumpadAdd'))) setM(this.mastery + 1);
      if (hov && ui.wheel) setM(this.mastery - Math.sign(ui.wheel));
    }
    ui.block(x, y, w, h);
    if (hov) ui.tooltip([{ text: `MASTERY ${this.mastery}: ${m.name}`, font: 'title', color: K.brass2 }, ...(this.mastery ? masteryMods(this.mastery).map((t) => ({ text: '· ' + t, font: 'small' as const })) : [{ text: 'the sea as it is. Win a run to unlock the next.', font: 'small' as const }])], { kind: 'dark', maxW: 210 });
  }
  /** the compact item card beside a thing (side 1: to its right, -1: to its left), with a notch pointing at it */
  private card(ui: PixelUI, s: { id: string; level: number; n?: number; from: 'wall' | 'bag' }, r: [number, number, number, number], side: 1 | -1) {
    const w = 184, lv = s.level;
    const opts = { level: lv, n: s.n, maxStats: 3, maxFuse: 0, noDesc: true, counts: setCounts(this.pack), loose: s.from === 'wall' };
    const hh = itemHead(ui, s.id, 0, 0, w - 16, { ...opts, draw: false });
    const bh = itemBody(ui, s.id, 0, 0, w - 16, { ...opts, draw: false });
    const h = 9 + hh + bh + ui.lh('small') + 8;
    let x = side > 0 ? r[0] + r[2] + 10 : r[0] - w - 10;
    if (x + w > ui.w - 6) x = r[0] - w - 10;
    if (x < 6) x = r[0] + r[2] + 10;
    x = Math.max(6, Math.min(ui.w - w - 6, x));
    const y = Math.max(6, Math.min(ui.h - h - 6, Math.round(r[1] + r[3] / 2 - h / 2)));
    const a = Math.min(1, ui.anim('pack:card:' + s.id + s.from) * 8);
    const col = RARITY_COLOR[getItem(s.id).rarity];
    ui.fill(x + 3, y + 4, w, h, '#000000', 0.35 * a);
    ui.frame('dark', x, y, w, h, a);
    ui.fill(x + 4, y + 2, w - 8, 1, col, 0.8 * a);
    // the notch toward the thing
    const ny = Math.max(y + 8, Math.min(y + h - 10, Math.round(r[1] + r[3] / 2)));
    const nx = x + w / 2 < r[0] + r[2] / 2 ? x + w : x - 1;
    const dir = nx > x ? 1 : -1;
    for (let i = 0; i < 4; i++) ui.fill(nx + dir * i, ny - 3 + i, 1, 7 - i * 2, i === 0 ? '#2a3a40' : '#16232f', a);
    let yy = y + 7;
    yy += itemHead(ui, s.id, x + 8, yy, w - 16, opts);
    yy += itemBody(ui, s.id, x + 8, yy, w - 16, opts);
    if ((s.n ?? 1) > 1 && s.from === 'wall') ui.text(`x${s.n}`, x + w - 8, y + 7, { font: 'title', color: K.brass2, shadow: K.ink2, align: 'right' });
    const verb = s.from === 'bag' ? 'unpack' : 'pack it';
    const kx = x + 8, ky = y + h - ui.lh('small') - 5;
    const kw = ui.keycap(this.kbd ? 'SPC' : keyName('CLICK'), kx, ky - 1, true);
    ui.text(verb, kx + kw + 4, ky + 1, { font: 'small', color: K.dim, shadow: null });
    ui.text(s.from === 'bag' ? 'drag: move' : 'drag: place', x + w - 8, ky + 1, { font: 'small', color: K.dim2, shadow: null, align: 'right' });
  }
  private flashCard(ui: PixelUI, cx: number, cy: number, title: string, sub = '') {
    const w = Math.max(ui.measure(title, 'title'), ui.measure(sub, 'small')) + 22, h = ui.lh('title') + (sub ? ui.lh('small') : 0) + 12;
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ui.fill(x + 3, y + 4, w, h, '#000000', 0.35);
    ui.frame('dark', x, y, w, h);
    ui.text(title, x + w / 2, y + 6, { font: 'title', color: K.coralL, shadow: K.ink2, align: 'center' });
    if (sub) ui.text(sub, x + w / 2, y + 6 + ui.lh('title'), { font: 'small', color: K.dim, shadow: K.ink2, align: 'center' });
  }
  private emptyNote(ui: PixelUI) {
    const p = this.scr(new THREE.Vector3(WALL.x, WALL.y0 + WALL.h * 0.5, WALL.z + 0.2), ui);
    if (!p) return;
    ui.text('THE WALL IS BARE', p[0], p[1] - 10, { font: 'title', color: K.cream, outline: K.ink2, align: 'center' });
    ui.text('bring loot home from your dives', p[0], p[1] + 10, { font: 'small', color: K.dim, outline: K.ink2, align: 'center' });
  }
  private keyHints(ui: PixelUI) {
    const parts: [string, string][] = [['WASD', 'move'], ['SPC', 'pack'], ['TAB', 'satchel'], ['Q E', 'page'], ['- +', 'mastery']];
    let x = 96; const y = 10;
    for (const [k, l] of parts) { const kw = ui.keycap(k, x, y - 1, true); ui.text(l, x + kw + 3, y + 1, { font: 'small', color: K.cream2, outline: K.ink2 }); x += kw + 3 + ui.measure(l, 'small') + 8; }
  }

  private dive() {
    if (this.diving) return;
    this.diving = true;
    const cfg = this.config();
    META.lastConfig = { ...cfg, pack: cfg.pack.map((p) => ({ ...p })), mats: { ...cfg.mats } } as TableConfig; META.mastery = cfg.mastery; saveMeta();
    // whatever is still in flight lands at once
    for (const f of this.flights) if (f.dir === 'in') this.landIn(f.uids, f.id);
    this.clearFlights(); this.hookArrive.clear(); this.bagArrive.clear();
    this.stage.detach();
    for (const m of this.medals) m.c.root.removeFromParent();
    this.medals = [];
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0;
    this.phase = 'cine';
    this.look = null;
    if (this.env) this.cine.start(this.env, cfg, this.satchel, this.fillFrac());
    this.onDive?.(cfg);
  }

  /** CSS-px centre of a thing for tests: 'swim' | 'home' | 'm+' | 'm-' | 'chest:<id>' / 'wall:<id>' | 'item:<id>' | 'bag:<gx>,<gy>' */
  point(id: string, cam: THREE.Camera, w: number, h: number): [number, number] | null {
    const ui = this.lastUi;
    const css = (x: number, y: number): [number, number] | null => (ui ? [Math.round((x / ui.w) * w), Math.round((y / ui.h) * h)] : null);
    const rect = (r: [number, number, number, number] | undefined) => (r ? css(r[0] + r[2] / 2, r[1] + r[3] / 2) : null);
    if (id === 'swim') return rect(ui?.rects.get('pack:swim'));
    if (id === 'home') return rect(ui?.rects.get('pack:home'));
    if (id === 'm+') return rect(ui?.rects.get('pack:mMore'));
    if (id === 'm-') return rect(ui?.rects.get('pack:mLess'));
    if (id.startsWith('bag:')) return rect(ui?.rects.get('pack:' + id));
    if (id.startsWith('item:')) { const iid = id.slice(5), it = this.pack.find((p) => p.id === iid); return it ? (() => { const r = this.itemRect(it); return css(r[0] + r[2] / 2, r[1] + r[3] / 2); })() : null; }
    if (id.startsWith('chest:') || id.startsWith('wall:')) {
      const iid = id.split(':')[1];
      for (const hg of this.hangs.values()) if (hg.id === iid && hg.g.visible && hg.g.parent) {
        const p = hg.g.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -hg.size * 0.55, 0)).project(cam);
        return [Math.round((p.x * 0.5 + 0.5) * w), Math.round((-p.y * 0.5 + 0.5) * h)];
      }
    }
    return null;
  }
}

