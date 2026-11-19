// The dungeon-run HUD (v5, "the diver's kit"): one instrument set, read at a glance. Painted plates (crisp pixel
// canvases drawn as planes BEHIND the 3D pieces, src/ui/obj/stage.ts PlanePool), lit low-poly miniatures on the
// HUD's stage, and big Jersey numerals / bars on the PixelUI canvas on top.
//
//   top left      VITALS: our blobfish (a real BlobModel) in a brass PORTHOLE (water flashes red on a hit, pink on a
//                 heal, the rim pulses red at one heart), a lacquered plate with a row of 3D jelly HEARTS, a clean
//                 STAMINA glass tube in brass collars (the liquid eases, a meniscus and bubbles, a pale chip of what
//                 you spent, amber while regen waits, red when guard-broken, white on a parry), a cut-crystal MANA
//                 vial and the kelp-tea FLASKS as little 3D bottles that slosh and empty
//                 RESOURCES: one brass strip under it, a turning model + a big rolling numeral per counter (pearls,
//                 keys, bombs, the pack's cells); numbers roll and flash on change and a +n / -n floats off
//   top right     NAVIGATION: one instrument: a lacquered plate with the area name, the stage pips, the parchment
//                 STRIP MAP of the level in a recessed window, metres FROM HOME and the DEPTH readout, ending in the
//                 brass DEPTH GAUGE (engraved knurled bezel, enamel face, spring needle, record flag) mirroring the porthole
//   bottom left   the SKILLS: a hand of physical cards (keys 1-4), cooldown shadow + seconds
//   bottom centre the BOSS: an engraved brass NAME PLATE with scrolled ends and enamel gems (stamps in), a riveted
//                 iron housing with the health in a glass tube (chip + flash), poise, phase pips
//   right         PICKUP cards: slide in fully on screen, the item's model turning in a display well, the name in
//                 its rarity colour, the kind and one stat line; up to three stack
//   centre        TITLE toasts (a banner, top centre) and the big AREA card for a new floor (letters stamp in)
//
// Usage (unchanged): const hud = new Hud(); overlays: [hud.layer]; hud.resize(w, h, pr);
//   hud.draw(dt, data, input)   or hud.drawInto(myUi, dt, data) inside your own ui.begin()/ui.end()
//   hud.title(name, sub) / hud.areaCard(name, sub) / hud.pickup(itemId) / hud.flash('pack' | 'pearls' | ...)
import * as THREE from 'three';
import { PixelUI } from './pixel/ui';
import type { Input } from '../core/input';
import type { PlayerCombatHud, BossBar } from '../combat/types';
import { ITEMS, RARITY_COLOR, statLines } from '../game/items';
import type { SkillHudState } from '../skills/hud';
import { UiStage, PlanePool } from './obj/stage';
import { pixelize, ramp } from './obj/pixtex';
import { BlobAvatar } from './obj/blobAvatar';
import { SkillCard3D } from './obj/cards';
import { hudModel, itemModel } from '../backpack/models';
import { hudArt } from './hudArt';
import { audio } from '../audio/audio';
import { drawText } from './pixel/font';
import { skin } from './pixel/skins';
import { PAL, plate, bigText, bigMeasure, bar, tube, solid, caustics, GLYPH, type BigOpts } from './obj/plates';

export type PoiType = 'treasure' | 'shop' | 'post' | 'challenge' | 'secret' | 'boss' | 'arena' | 'start';

export interface StripPoi {
  type: PoiType;
  /** position along the level (same unit as StripMap.length) */
  x: number;
  /** vertical position 0 (top of the level) .. 1 (bottom); default by type */
  y?: number;
  /** false: only hinted (drawn as a dim '?'); default true */
  known?: boolean;
  /** used up / cleared (drawn dimmed) */
  done?: boolean;
}

export interface StripMap {
  /** level length (metres or any unit) */
  length: number;
  /** explored spans [x0, x1] in the same unit (fog elsewhere) */
  explored: [number, number][];
  /** the player's x (same unit) and optional y (0 top .. 1 bottom) */
  player: number; playerY?: number;
  /** vertical band hints: stretches with an upper water lane / with caves under the seabed */
  lanes?: { kind: 'upper' | 'cave'; x0: number; x1: number }[];
  /** seabed height profile (0 top .. 1 bottom), samples evenly spaced along the level; default flat 0.72 */
  seabed?: number[];
  pois: StripPoi[];
  /** 1-based floor number and floor count */
  floor: number; floors: number;
  /** area name shown above the strip */
  name?: string;
}

export interface HudData {
  /** health in HALF hearts (6 = three hearts) and the containers, also in half hearts */
  hp: number; maxHp: number;
  /** blue soul / armour half hearts drawn after the red ones */
  soul?: number;
  /** K's combat HUD: stamina, flasks, drinking, guard, parry flashes */
  combat?: PlayerCombatHud | null;
  mana?: number; maxMana?: number;
  pearls: number; keys: number; bombs: number;
  /** the pack's fill in cells */
  pack?: { used: number; total: number; full?: boolean };
  strip?: StripMap | null;
  /** K's boss bar (drawn while visible) */
  boss?: BossBar | null;
  /** the skill slots (keys 1-4), bottom left: player.skillHud(); replaces the old SkillBar overlay */
  skills?: SkillHudState | null;
  /** metres travelled from home (the journey) */
  far?: number;
  /** the diving depth gauge: metres now, the deepest ever (red marker); floorMax = the dial's full scale */
  depth?: { m: number; record: number; floorMax?: number; floorTop?: number; floorBottom?: number; zone?: string; descending?: boolean } | null;
  /** hide everything but title cards (cutscenes) */
  hidden?: boolean;
  /** a menu / panel is up: hide everything, title cards too (they wait their turn) */
  menu?: boolean;
}

/**
 * The HUD is laid out in a 360-row DESIGN space (D) and drawn at the UI density: positions and sizes are multiplied
 * by k = ui.h / 360 (3D pieces scale with the stage, plates are painted at the exact UI px size, text is Jersey at
 * a cap height given in D), so the whole instrument set keeps its proportions at any resolution.
 */
class DUi {
  k = 1;
  constructor(public ui: PixelUI) {}
  get w() { return this.ui.w / this.k; }
  get h() { return this.ui.h / this.k; }
  get mx() { return this.ui.mx / this.k; }
  get my() { return this.ui.my / this.k; }
  /** design units -> UI px */
  p(v: number) { return Math.round(v * this.k); }
  /** big Jersey text, cap in D; returns the width in D */
  big(str: string, x: number, y: number, cap: number, o: Omit<BigOpts, 'cap'> = {}) { return bigText(this.ui, str, x * this.k, y * this.k, { ...o, cap: cap * this.k }) / this.k; }
  bigW(str: string, cap: number, o: Omit<BigOpts, 'cap'> = {}) { return bigMeasure(this.ui, str, { ...o, cap: cap * this.k }) / this.k; }
  fill(x: number, y: number, w: number, h: number, col: string, a = 1) { const X = this.p(x), Y = this.p(y); this.ui.fill(X, Y, Math.max(1, this.p(x + w) - X), Math.max(1, this.p(y + h) - Y), col, a); }
  img(c: HTMLCanvasElement, x: number, y: number, o?: Parameters<PixelUI['img']>[3]) { this.ui.img(c, this.p(x), this.p(y), o); }
  hover(x: number, y: number, w: number, h: number) { return this.ui.hover(x * this.k, y * this.k, w * this.k, h * this.k); }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutBack = (t: number) => { const c = 1.9; t = clamp01(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
/** HUD strings are drawn in Jersey: drop glyphs it doesn't carry (a trailing check mark is drawn as a glyph) */
const clean = (s: string) => s.replace(/[✓✔]/g, '').replace(/[^\x20-\x7E·]/g, '').replace(/·/g, '-').trim();
type Counter = 'pearls' | 'keys' | 'bombs' | 'pack' | 'hp';

// ------------------------------------------------------------------ materials
const brassMat = new THREE.MeshStandardMaterial({ color: '#d8a038', roughness: 0.32, metalness: 0.75, flatShading: true });
const darkBrass = new THREE.MeshStandardMaterial({ color: '#6a4a1c', roughness: 0.5, metalness: 0.6, flatShading: true });

/** a heart split down the middle so halves can be full or empty */
function heartHalf(side: -1 | 1, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.27, 7, 5), mat); lobe.position.set(side * 0.2, 0.12, 0);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.55, 10, 1, false, side < 0 ? Math.PI : 0, Math.PI), mat);
  tip.position.set(0, -0.25, 0); tip.rotation.x = Math.PI; tip.scale.z = 0.7;
  const fillL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5, side < 0 ? Math.PI : 0, Math.PI), mat); fillL.position.set(0, 0.02, 0);
  g.add(lobe, tip, fillL);
  return g;
}
const jelly = new THREE.MeshStandardMaterial({ color: '#ff4a6a', roughness: 0.22, emissive: '#b01434', emissiveIntensity: 0.35 });
const jellySoul = new THREE.MeshStandardMaterial({ color: '#5a9aff', roughness: 0.22, emissive: '#1a3a9a', emissiveIntensity: 0.35 });
const jellyEmpty = new THREE.MeshStandardMaterial({ color: '#2a3a44', roughness: 0.3, transparent: true, opacity: 0.85 });

class Heart3D {
  root = new THREE.Group();
  private L: THREE.Group; private R: THREE.Group;
  private state = '';
  constructor() { this.L = heartHalf(-1, jelly); this.R = heartHalf(1, jelly); this.root.add(this.L, this.R); const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' })); s.position.set(-0.24, 0.22, 0.22); s.name = 'shine'; this.root.add(s); }
  set(l: THREE.Material, r: THREE.Material) {
    const k = (l as THREE.MeshStandardMaterial).uuid + (r as THREE.MeshStandardMaterial).uuid;
    if (k === this.state) return; this.state = k;
    this.L.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = l; });
    this.R.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = r; });
    (this.root.getObjectByName('shine') as THREE.Mesh).visible = l !== jellyEmpty;
  }
}

/**
 * a kelp-tea bottle: the hand-painted flask prop (src/backpack/models/hud.ts), full or empty. It sloshes when its
 * level changes, tips up while you drink it and swaps to the empty bottle when it's gone.
 */
class Flask3D {
  root = new THREE.Group();
  private tip = new THREE.Group();
  private fullM = hudModel('flask'); private emptyM = hudModel('flaskEmpty');
  private full = 1; private slosh = 0; private t = Math.random() * 6;
  constructor() { this.tip.add(this.fullM, this.emptyM); this.root.add(this.tip); }
  update(dt: number, level: number) {
    this.t += dt;
    if (Math.abs(level - this.full) > 0.01) this.slosh = 1;
    this.full += (level - this.full) * Math.min(1, dt * 6);
    this.slosh = Math.max(0, this.slosh - dt * 1.5);
    const drinking = level > 0.02 && level < 0.98;
    this.fullM.visible = this.full > 0.08; this.emptyM.visible = !this.fullM.visible;
    this.tip.rotation.z = drinking ? -0.9 * Math.sin(Math.min(1, (1 - level) * 3) * Math.PI / 2) : 0;
    this.root.rotation.z = Math.sin(this.t * 7) * 0.18 * this.slosh + Math.sin(this.t * 1.3) * 0.03;
    this.root.rotation.y = Math.sin(this.t * 0.7) * 0.35;
  }
}

// ------------------------------------------------------------------ an engraved brass bezel ring (painted, flat)
/**
 * a brass bezel ring for a RingGeometry(rIn, rOut) at `res` texels per unit: lit by angle from the top left in four
 * bands (a pixel-art torus), a bright outer lip, a knurled band, an engraved groove with verdigris in three places,
 * eight slotted screws and a shaded inner bevel. Placed detail only.
 */
const bezelCache = new Map<string, HTMLCanvasElement>();
function bezelRing(rIn: number, rOut: number, res: number, screws = 8): HTMLCanvasElement {
  const key = `${rIn}|${rOut}|${res}|${screws}`;
  const hit = bezelCache.get(key);
  if (hit) return hit;
  const S = Math.max(8, Math.round(rOut * 2 * res)), c = S / 2, ro = S / 2 - 0.5, ri = rIn * res;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d')!;
  const img = x.createImageData(S, S), D = img.data;
  const B = ramp('#c8913a');
  const put = (px: number, py: number, col: string) => { px = Math.round(px); py = Math.round(py); if (px < 0 || py < 0 || px >= S || py >= S) return; const n = parseInt(col.slice(1), 16), i = (py * S + px) * 4; D[i] = n >> 16; D[i + 1] = (n >> 8) & 255; D[i + 2] = n & 255; D[i + 3] = 255; };
  const band = ro - ri;
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const dx = px + 0.5 - c, dy = py + 0.5 - c, d = Math.hypot(dx, dy);
    if (d > ro || d < ri - 0.5) continue;
    const u = (d - ri) / band; // 0 inner .. 1 outer
    const lit = -(dx + dy) / (Math.SQRT2 * (d || 1)); // 1 facing the top-left light
    const ang = Math.atan2(dy, dx);
    let col: string;
    if (d > ro - 1) col = '#070d14';                                   // ink outline
    else if (d > ro - 2) col = lit > 0.2 ? B[5] : lit > -0.4 ? B[3] : B[1]; // the outer lip
    else if (u > 0.55) {                                                // the knurled band
      const tick = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * Math.round(S * 1.1)) % 2 === 0;
      col = tick ? (lit > 0 ? B[4] : B[2]) : (lit > 0 ? B[3] : B[1]);
    } else if (u > 0.42) col = '#3a2408';                               // the engraved groove
    else if (u > 0.33) col = lit > 0 ? B[5] : B[3];                     // its lit lower edge
    else if (d < ri + 0.6) col = '#070d14';                             // inner ink
    else col = lit > 0.5 ? B[4] : lit > -0.2 ? B[3] : lit > -0.7 ? B[2] : B[1]; // the inner bevel
    put(px, py, col);
  }
  // verdigris in the groove, three places (a recess where water sits)
  const gr = ri + band * 0.48;
  for (const [a0, a1] of [[2.2, 2.55], [3.9, 4.05], [0.55, 0.7]]) for (let a = a0; a < a1; a += 0.5 / gr) { put(c + Math.cos(a) * gr - 0.5, c + Math.sin(a) * gr - 0.5, VERDI2[1]); if (a < (a0 + a1) / 2) put(c + Math.cos(a) * (gr + 1) - 0.5, c + Math.sin(a) * (gr + 1) - 0.5, VERDI2[0]); }
  // the screws: domed heads over the knurl with a slot
  const sr = ri + band * 0.74, hr = Math.max(1.6, band * 0.28);
  for (let i = 0; i < screws; i++) {
    const a = (i / screws) * Math.PI * 2 + Math.PI / screws;
    const sx = c + Math.cos(a) * sr, sy = c + Math.sin(a) * sr;
    for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) {
      const r = Math.hypot(xx, yy);
      if (r > hr + 0.4) continue;
      put(sx + xx - 0.5, sy + yy - 0.5, r > hr - 0.6 ? '#070d14' : xx + yy < -0.5 ? B[5] : xx + yy > 1 ? B[2] : B[4]);
    }
    const sa = a + 0.8;
    for (const k of [-1, 0, 1]) put(sx + Math.cos(sa) * k * (hr - 0.8) - 0.5, sy + Math.sin(sa) * k * (hr - 0.8) - 0.5, B[0]);
  }
  x.putImageData(img, 0, 0);
  bezelCache.set(key, cv);
  return cv;
}
const VERDI2 = ['#2f5a4e', '#5a9a84'];
function ringMesh(rIn: number, rOut: number) {
  const tex = new THREE.CanvasTexture(document.createElement('canvas'));
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 64, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, alphaTest: 0.5 }));
  m.userData.noPixel = true;
  return { m, set(res: number) { const cv = bezelRing(rIn, rOut, res); if (tex.image !== cv) { tex.image = cv; tex.needsUpdate = true; } } };
}

// ------------------------------------------------------------------ the brass porthole the blobfish looks out of
class Porthole3D {
  root = new THREE.Group();
  private water: THREE.MeshBasicMaterial;
  private ringMat: THREE.MeshBasicMaterial;
  private ring: ReturnType<typeof ringMesh>;
  private glint: THREE.Mesh;
  readonly R: number;
  constructor(R: number) {
    this.R = R;
    // the water behind the glass: three flat teal bands and two soft light shafts (painted, no gradients)
    const cv = document.createElement('canvas'); cv.width = cv.height = 48;
    const x = cv.getContext('2d')!;
    x.fillStyle = '#1d4f55'; x.fillRect(0, 0, 48, 48);
    x.fillStyle = '#246068'; x.fillRect(0, 0, 48, 16);
    x.fillStyle = '#163f46'; x.fillRect(0, 32, 48, 16);
    x.fillStyle = '#2f7478';
    for (const [x0, w0] of [[10, 5], [26, 3]] as [number, number][]) for (let yy = 0; yy < 30; yy++) x.fillRect(x0 + Math.floor(yy / 4), yy, w0, 1);
    x.fillStyle = '#c8aa7a'; x.fillRect(0, 42, 48, 6); x.fillStyle = '#a88a5a'; x.fillRect(0, 42, 48, 1);
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    this.water = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const back = new THREE.Mesh(new THREE.CircleGeometry(R - 1, 32), this.water); back.position.z = -8;
    // the bezel: a painted engraved brass ring over a dark brass backing (gives it thickness)
    this.ring = ringMesh(R - 4.5, R + 4.5); this.ring.m.position.z = 3;
    const backing = new THREE.Mesh(new THREE.CylinderGeometry(R + 4.5, R + 4.5, 4, 32), darkBrass); backing.rotation.x = Math.PI / 2; backing.position.z = -11;
    this.root.add(back, backing, this.ring.m);
    // a hinge on the left and a dog-clamp on the right, like a real ship's port
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 4), brassMat); hinge.position.set(-R - 4.5, 0, -1);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 14, 8), darkBrass); pin.position.set(-R - 5, 0, 1.4);
    this.root.add(hinge, pin);
    // the glass: a faint pane and a hard crescent glint
    const glass = new THREE.Mesh(new THREE.CircleGeometry(R - 1, 32), new THREE.MeshStandardMaterial({ color: '#e8fbff', roughness: 0.05, transparent: true, opacity: 0.08, depthWrite: false }));
    glass.position.z = 24;
    this.glint = new THREE.Mesh(new THREE.RingGeometry(R - 6.5, R - 4.2, 20, 1, Math.PI * 0.58, Math.PI * 0.34), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false }));
    this.glint.position.z = 25;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(1.3, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
    dot.position.set(-R * 0.18, R * 0.72, 25);
    // the warning rim: a red ring around the bezel that pulses at one heart
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ff3a2a', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(R + 4.4, R + 6.6, 40), this.ringMat); ring.position.z = -2;
    this.root.add(glass, this.glint, dot, ring);
  }
  /** hurt / heal: 0..1 flashes; low: at one heart */
  update(t: number, hurt: number, heal: number, low: boolean, res = 1) {
    this.ring.set(res);
    const c = this.water.color;
    c.setRGB(1, 1, 1);
    if (hurt > 0) c.lerp(new THREE.Color('#ff5040'), Math.min(1, hurt * 1.6) * 0.7);
    if (heal > 0) c.lerp(new THREE.Color('#ffc8f0'), Math.min(1, heal * 1.4) * 0.6);
    this.ringMat.opacity = low ? 0.35 + 0.45 * Math.max(0, Math.sin(t * 7.5)) ** 2 : hurt * 0.6;
    this.glint.rotation.z = Math.sin(t * 0.5) * 0.08;
  }
}

// ------------------------------------------------------------------ the brass diving depth gauge
class DepthGauge {
  root = new THREE.Group();
  private face: THREE.Mesh; private faceCv = document.createElement('canvas'); private faceTex: THREE.CanvasTexture;
  private needle = new THREE.Group(); private rec = new THREE.Group(); private glint: THREE.Mesh;
  private bezel: ReturnType<typeof ringMesh>;
  private ang = 0; private angV = 0; private scaleMax = 0; private faceRes = 0; private lastTen = -1; private prevM = 0;
  readonly R: number;
  constructor(R = 24) {
    this.R = R;
    this.bezel = ringMesh(R - 4.5, R + 4.5); this.bezel.m.position.z = 3;
    const back = new THREE.Mesh(new THREE.CylinderGeometry(R + 4.5, R + 4.5, 4, 32), darkBrass); back.rotation.x = Math.PI / 2; back.position.z = -3;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 5, 8), brassMat); crown.position.set(R + 6, 0, -0.5); crown.rotation.z = Math.PI / 2;
    const knurl = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 3, 10), darkBrass); knurl.position.set(R + 9.5, 0, -0.5); knurl.rotation.z = Math.PI / 2;
    this.faceCv.width = this.faceCv.height = R * 2;
    this.faceTex = new THREE.CanvasTexture(this.faceCv); this.faceTex.magFilter = THREE.NearestFilter; this.faceTex.minFilter = THREE.NearestFilter; this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.face = new THREE.Mesh(new THREE.CircleGeometry(R - 3.5, 40), new THREE.MeshBasicMaterial({ map: this.faceTex, toneMapped: false }));
    this.face.position.z = 0.5;
    // the needle: a black arrow with a red tip, a brass hub
    const nm = new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.5, flatShading: true });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.4, R * 0.82, 0.8), nm); shaft.position.y = R * 0.32;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(1.7, 5, 4), new THREE.MeshStandardMaterial({ color: '#e0564a', roughness: 0.4, flatShading: true })); tip.position.y = R * 0.76;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5, 0.8), nm); tail.position.y = -3.5;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 2, 10), brassMat); hub.rotation.x = Math.PI / 2;
    this.needle.add(shaft, tip, tail, hub); this.needle.position.z = 2.2;
    // the record marker: a little red flag on the rim
    const rm = new THREE.Mesh(new THREE.ConeGeometry(2, 4.5, 3), new THREE.MeshStandardMaterial({ color: '#e83030', emissive: '#801010', emissiveIntensity: 0.5, flatShading: true }));
    rm.position.y = R - 2.5; rm.rotation.z = Math.PI; this.rec.add(rm); this.rec.position.z = 1.4;
    // the glass cover with a moving glint
    this.glint = new THREE.Mesh(new THREE.RingGeometry(R - 6.5, R - 4.2, 20, 1, Math.PI * 0.58, Math.PI * 0.34), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
    this.glint.position.z = 5;
    this.root.add(back, this.bezel.m, crown, knurl, this.face, this.rec, this.needle, this.glint);
  }
  /** the face: cream enamel with a chapter ring, a metre scale on a 270-degree sweep (minor / major ticks, numerals),
   *  a coral danger arc with hatching, engraved rings, the maker's word and an anchor, the bezel's shadow crescent */
  private paintFace(max: number, res: number) {
    const FR = this.R - 3.5;
    const S = Math.max(16, Math.round(FR * 2 * res)), R = S / 2;
    if (this.faceCv.width !== S) { this.faceCv.width = this.faceCv.height = S; this.faceTex.dispose(); this.faceTex = new THREE.CanvasTexture(this.faceCv); this.faceTex.magFilter = THREE.NearestFilter; this.faceTex.minFilter = THREE.NearestFilter; this.faceTex.colorSpace = THREE.SRGBColorSpace; (this.face.material as THREE.MeshBasicMaterial).map = this.faceTex; (this.face.material as THREE.MeshBasicMaterial).needsUpdate = true; }
    const c = this.faceCv.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    const u = Math.max(1, Math.round(res));
    const disc = (r: number, col: string) => { c.fillStyle = col; c.beginPath(); c.arc(R, R, r, 0, Math.PI * 2); c.fill(); };
    const ringL = (r: number, col: string, lw = 1) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.arc(R, R, r, 0, Math.PI * 2); c.stroke(); };
    c.clearRect(0, 0, S, S);
    disc(R, '#e2cfa2');                // the chapter ring (a step darker)
    disc(R - 6 * u, PAL.cream);        // the enamel
    disc(R * 0.36, '#ebdcb6');         // the hub field
    ringL(R - 6 * u + 0.5, '#b89a6a'); ringL(R * 0.36, '#c8b48a');
    const at = (k: number, r: number): [number, number] => { const a = (-135 + 270 * k) * Math.PI / 180; return [R + Math.sin(a) * r, R - Math.cos(a) * r]; };
    // the danger arc: the last fifth of the sweep in coral enamel, hatched at its start
    const a0 = (-135 + 270 * 0.8 - 90) * Math.PI / 180, a1 = (135 - 90) * Math.PI / 180;
    c.fillStyle = PAL.coral; c.beginPath(); c.arc(R, R, R - 1.5 * u, a0, a1); c.arc(R, R, R - 5 * u, a1, a0, true); c.fill();
    c.strokeStyle = PAL.coral1; c.lineWidth = 1;
    for (let k = 0.8; k < 0.84; k += 0.012) { const [x0, y0] = at(k, R - 1.5 * u), [x1, y1] = at(k + 0.01, R - 5 * u); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
    const step = max <= 60 ? 5 : max <= 150 ? 10 : max <= 400 ? 25 : 50;
    for (let v = 0; v <= max + 0.01; v += step / 5) {
      const k = v / max, major = Math.abs(v / step - Math.round(v / step)) < 0.01;
      const half = !major && Math.abs((v / step) * 2 - Math.round((v / step) * 2)) < 0.01;
      const [x0, y0] = at(k, R - 1.5 * u), [x1, y1] = at(k, R - (major ? 7.5 : half ? 5.5 : 4) * u);
      c.strokeStyle = major ? PAL.ink : '#6a5a40'; c.lineWidth = major ? Math.max(1, u) : 1; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    const font = res >= 2.5 ? 'body' : 'small';
    const fh = font === 'body' ? 11 : 7;
    for (const k of [0, 0.5, 1]) { const [x, y] = at(k, R - 7.5 * u - fh * 0.9); drawText(c, String(Math.round(max * k)), x, y - fh / 2, { font, color: PAL.ink, shadow: null, align: 'center' }); }
    // an anchor engraved above the hub (only where there is room to keep it clear)
    if (S >= 80) {
      const ax = Math.round(R), ay = Math.round(R - R * 0.62);
      c.fillStyle = '#8a7250';
      c.fillRect(ax, ay, 1, 6 * u); c.fillRect(ax - 2 * u, ay + u, 5 * u, 1); c.fillRect(ax - 3 * u, ay + 5 * u, 7 * u, 1); c.fillRect(ax - 3 * u, ay + 4 * u, 1, u); c.fillRect(ax + 3 * u, ay + 4 * u, 1, u);
      c.fillRect(ax - u, ay - 2 * u, 3 * u, 1); c.fillRect(ax - u, ay - 2 * u, 1, 2 * u); c.fillRect(ax + u, ay - 2 * u, 1, 2 * u);
    }
    // the bezel's shadow: a flat crescent along the top-left inside edge
    c.strokeStyle = 'rgba(58,36,8,0.45)'; c.lineWidth = 2 * u; c.beginPath(); c.arc(R, R, R - u, Math.PI * 1.0, Math.PI * 1.55); c.stroke();
    // a hard cut so nothing bleeds past the round face
    c.globalCompositeOperation = 'destination-in'; disc(R, '#000'); c.globalCompositeOperation = 'source-over';
    this.faceTex.needsUpdate = true;
  }
  update(dt: number, t: number, d: NonNullable<HudData['depth']>, res = 1, ringRes = 1) {
    this.bezel.set(ringRes);
    // full scale: the bottom of this floor's shaft, rounded up to a clean number
    const span = d.floorBottom ?? d.floorMax ?? Math.max(d.m, d.record) + 1;
    const step = span <= 100 ? 20 : span <= 400 ? 50 : 100;
    const max = Math.max(step, Math.ceil(span / step) * step);
    if (max !== this.scaleMax || res !== this.faceRes) { this.scaleMax = max; this.faceRes = res; this.paintFace(max, res); }
    const toAng = (m: number) => (-135 + 270 * Math.max(0, Math.min(1, m / max))) * Math.PI / 180;
    // the needle chases the depth on a spring, and wobbles while you sink
    const sink = (d.m - this.prevM) / Math.max(1e-3, dt); this.prevM = d.m;
    const target = toAng(d.m) + Math.sin(t * 23) * Math.min(0.06, Math.abs(sink) * 0.004);
    this.angV += ((target - this.ang) * 90 - this.angV * 9) * dt;
    this.ang += this.angV * dt;
    this.needle.rotation.z = -this.ang;
    this.rec.rotation.z = -toAng(d.record);
    this.glint.rotation.z = Math.sin(t * 0.5) * 0.08;
    const ten = Math.floor(d.m / 10);
    if (this.lastTen >= 0 && ten !== this.lastTen && audio.has('k_tick1')) audio.play('k_tick1', { vol: 0.25, dry: true, rate: 0.7 + Math.min(1, d.m / 1000) * 0.6 });
    this.lastTen = ten;
  }
}

// ------------------------------------------------------------------ the strip map, painted flat (no fibres, no noise)
function paintStrip(cv: HTMLCanvasElement, m: StripMap, t: number) {
  const x = cv.getContext('2d')!, W = cv.width, H = cv.height;
  x.imageSmoothingEnabled = false;
  const f = (px: number, py: number, w: number, h: number, c: string, a = 1) => { x.globalAlpha = a; x.fillStyle = c; x.fillRect(Math.round(px), Math.round(py), Math.round(w), Math.round(h)); x.globalAlpha = 1; };
  const L = Math.max(1e-6, m.length);
  const X = (v: number) => 1 + Math.round(clamp01(v / L) * (W - 3));
  // parchment in two flat tones, the water a pale wash
  // a sea chart: pale water in two tones, light glinting across it in moving dashes (repainted each frame anyway:
  // the strip is a few hundred px)
  f(0, 0, W, H, '#d4e6dc');
  f(0, 0, W, Math.round(H * 0.3), '#e2f0e6');
  for (let row = 0; row < 2; row++) {
    const yy = 1 + row * Math.max(2, Math.round(H * 0.2));
    for (let cx = 0; cx < W; cx++) if (((cx + Math.floor(t * (row ? 7 : 11)) + row * 9) % 19) < 3) f(cx, yy + Math.round(Math.sin(cx * 0.4 + t * 2 + row) * 0.6), 1, 1, '#ffffff', 0.8);
  }
  for (const ln of m.lanes ?? []) if (ln.kind === 'upper') f(X(ln.x0), 1, X(ln.x1) - X(ln.x0), Math.max(2, Math.round(H * 0.22)), '#b4d8d8');
  const sb = m.seabed ?? [0.72];
  const bedAt = (cx: number) => { const tt = clamp01(cx / Math.max(1, W - 1)) * (sb.length - 1); const i = Math.floor(tt), fr = tt - i; return lerp(sb[i], sb[Math.min(sb.length - 1, i + 1)], fr); };
  let prev = -1;
  for (let cx = 0; cx < W; cx++) {
    const by = Math.round(clamp01(bedAt(cx)) * (H - 2));
    f(cx, by + 1, 1, H - by - 1, '#cdb07c');
    f(cx, by + 3, 1, H - by - 3, '#bf9f6a');
    if (prev >= 0) f(cx, Math.min(prev, by), 1, Math.abs(prev - by) + 1, '#5a3a1a');
    prev = by;
  }
  for (const ln of m.lanes ?? []) if (ln.kind === 'cave') for (let cx = X(ln.x0); cx <= X(ln.x1); cx++) { const by = Math.round(clamp01(bedAt(cx)) * (H - 2)); const mid = Math.round((by + 3 + H - 2) / 2); if (mid > by + 2) f(cx, mid, 1, Math.max(1, Math.round(H / 14)), '#4a3018'); }
  // fog: the unexplored stretches in a flat darker paper with even diagonal hatching (a pattern, not noise)
  const spans = [...m.explored].sort((a, b) => a[0] - b[0]);
  let cur = 0;
  const fog = (a: number, b: number) => {
    if (b <= a) return; const xa = X(a), xb = X(b);
    f(xa, 0, xb - xa + 1, H, '#9fb8b0');
    for (let cx = xa; cx <= xb; cx++) for (let cy = 0; cy < H; cy++) if ((cx + cy) % 5 === 0) f(cx, cy, 1, 1, '#8aa49c');
  };
  for (const [a, b] of spans) { if (a > cur) fog(cur, a); cur = Math.max(cur, b); }
  if (cur < L) fog(cur, L);
  // POIs as inked glyphs
  const defY: Record<PoiType, number> = { treasure: 0.62, shop: 0.5, post: 0.45, challenge: 0.5, secret: 0.8, boss: 0.5, arena: 0.5, start: 0.5 };
  const glyph: Record<PoiType, string> = { treasure: 'mTreasure', shop: 'mShop', post: 'mPost', challenge: 'mChallenge', secret: 'mSecret', boss: 'mBoss', arena: 'mArena', start: 'mStart' };
  const up = H >= 26 ? 2 : 1;
  for (const p of m.pois) {
    const known = p.known !== false;
    const ic = hudArt(known ? glyph[p.type] : 'mSecret');
    const iw = ic.width * up, ih = ic.height * up;
    const gx = Math.max(0, Math.min(W - iw, X(p.x) - Math.floor(iw / 2)));
    const gy = Math.max(0, Math.min(H - ih, Math.round(clamp01(p.y ?? defY[p.type]) * (H - 1)) - Math.floor(ih / 2)));
    if (p.type === 'boss') f(X(p.x), 0, 1, H, '#9a2a24', 0.8);
    x.globalAlpha = !known ? 0.5 : p.done ? 0.4 : 1; x.drawImage(ic, gx, gy, iw, ih); x.globalAlpha = 1;
  }
  // you: a coral pin with a pulse ring
  const plx = X(m.player), ply = Math.max(2, Math.min(H - 3, Math.round(clamp01(m.playerY ?? 0.5) * (H - 1))));
  const pr = Math.round(2 + (Math.sin(t * 5) * 0.5 + 0.5) * 2) * up;
  x.strokeStyle = PAL.coral; x.lineWidth = 1; x.globalAlpha = 0.6; x.beginPath(); x.arc(plx + 0.5, ply + 0.5, pr, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1;
  const s = 1 + up;
  f(plx - s, ply - s, s * 2 + 1, s * 2 + 1, PAL.ink2); f(plx - s + 1, ply - s + 1, s * 2 - 1, s * 2 - 1, PAL.coral); f(plx - s + 1, ply - s + 1, up, up, '#ffc0b0');
}

// ------------------------------------------------------------------ pickup cards / title toasts
interface PickCard { id: string; title: string; sub: string; kind: string; color: string; t: number; life: number; y: number; model: THREE.Object3D }
interface Toast { title: string; sub: string; color: string; t: number; life: number; area?: boolean; banner?: 'danger' | 'gold'; landed?: boolean }
interface CodexNote { name: string; model: THREE.Object3D | null; t: number; y: number }
interface Roll { v: number; old: number; t: number; flash: number; delta: { n: number; t: number }[] }

// layout (D)
const M = 8;
const PR = 24;

export class Hud {
  private pixT = 0;
  ui = new PixelUI();
  get layer(): { scene: THREE.Scene; camera: THREE.Camera } { return this.ui.layer; }
  stage = new UiStage();
  /** painted plates behind the 3D pieces (in UI px): DungeonHud draws its panels here too */
  planes = new PlanePool(this.stage);
  private t = 0;
  private prev: HudData | null = null;
  private avatar = new BlobAvatar();
  private port = new Porthole3D(PR);
  private hearts: Heart3D[] = [];
  private heartBump: number[] = [];
  private flasks: Flask3D[] = [];
  private models: Record<'pearls' | 'keys' | 'bombs' | 'pack', THREE.Object3D>;
  private gauge = new DepthGauge(PR);
  private cards: SkillCard3D[] = [];
  private cardIds: string[] = [];
  private stripCv = document.createElement('canvas');
  private stamShown = 1; private stamChip = 1; private stamChipHold = 0; private stamFlash = 0;
  private manaShown = 0; private manaChip = 0;
  private bossShown = 1; private bossChip = 1; private bossChipHold = 0; private bossFlash = 0; private bossIn = 0; private bossName = ''; private bossShake = 0;
  private pop: Record<Counter, number> = { pearls: 0, keys: 0, bombs: 0, pack: 0, hp: 0 };
  private rolls: Record<'pearls' | 'keys' | 'bombs' | 'pack', Roll> = { pearls: this.roll(), keys: this.roll(), bombs: this.roll(), pack: this.roll() };
  private hurtT = 0; private healT = 0;
  private parryFlash = 0;
  private picks: PickCard[] = [];
  private toasts: Toast[] = [];
  private lastK = 0;

  constructor() {
    const S = this.stage;
    S.ui.add(this.port.root, this.avatar.root, this.gauge.root);
    this.avatar.root.userData.noPixel = true; // the blobfish keeps its own soft skin shading
    this.port.root.userData.noPixel = false;
    this.models = { pearls: hudModel('pearlCoin'), keys: hudModel('key'), bombs: hudModel('bomb'), pack: itemModel('cutpursePouch') };
    for (const m of Object.values(this.models)) S.ui.add(m);
  }
  private roll(): Roll { return { v: -1, old: -1, t: 1, flash: 0, delta: [] }; }

  resize(w: number, h: number, pr: number) { this.ui.resize(w, h, pr); }

  /** a title toast at the top centre (area changes, secrets, "SENT HOME") */
  title(title: string, sub = '', color = PAL.cream, life = 3) {
    this.toasts = this.toasts.filter((c) => c.area);
    this.toasts.push({ title: clean(title), sub: clean(sub), t: 0, life, color });
  }
  /** the big card for a new floor: the area's name stamped across the upper screen, a sub line under it */
  /**
   * a big moment, stamped across the middle of the screen (boss intro, CHALLENGE, CLEARED, VICTORY, SURFACING): the
   * title slams down on an engraved plate ('danger': a brass name plate with red enamel gems; 'gold': a gold cloth
   * ribbon), the sub line on a dark strip under it. A newer banner replaces an older one.
   */
  banner(title: string, sub = '', style: 'danger' | 'gold' = 'gold', life = 2.8) {
    this.toasts = this.toasts.filter((c) => !c.banner);
    this.toasts.push({ title: clean(title).toUpperCase(), sub: clean(sub).toUpperCase(), t: 0, life, color: style === 'danger' ? '#ffd8c8' : PAL.cream, banner: style });
  }
  /** a creature met for the first time: a journal note slides into the right-hand lane, under the pickup cards,
   *  with the creature turning on a medallion (`model` is any 3D object; it is sized to fit). Notes queue. */
  codex(name: string, model: THREE.Object3D | null = null) {
    if (this.notes.length >= 4) { const old = this.notes.splice(1, 1)[0]; old?.model?.removeFromParent(); }
    if (model) {
      const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const holder = new THREE.Group(); model.position.sub(c); holder.add(model);
      holder.userData.fit = 1 / Math.max(1e-3, size.x, size.y, size.z * 0.6);
      this.stage.ui.add(holder);
      model = holder;
    }
    this.notes.push({ name: clean(name), model, t: 0, y: -1 });
  }
  private notes: CodexNote[] = [];
  areaCard(name: string, sub = '', color = PAL.cream, life = 4.2) {
    this.toasts = this.toasts.filter((c) => !c.area);
    this.toasts.push({ title: clean(name).toUpperCase(), sub: clean(sub).toUpperCase(), t: 0, life, color, area: true });
    audio.play('thud_heavy1', { vol: 0.35, dry: true });
  }
  /**
   * an item pickup card: slides in on the right, fully on screen: the item's model turning in a display well, the
   * name in its rarity colour, the kind and the first stat line. Up to three stack; the oldest leaves first.
   */
  pickup(itemId: string, name?: string, sub?: string) {
    const d = ITEMS[itemId];
    if (this.picks.length >= 3) { const old = this.picks.shift()!; old.model.removeFromParent(); }
    const model = itemModel(itemId);
    this.stage.ui.add(model);
    const col = d ? RARITY_COLOR[d.rarity] : PAL.cream;
    const line = sub ?? (d ? (statLines(itemId, 1)[0]?.text ?? d.desc) : '');
    const y0 = this.picks.length ? this.picks[this.picks.length - 1].y + 40 : 70;
    this.picks.push({ id: itemId, title: clean(name ?? d?.name ?? itemId), sub: clean(line), kind: d ? `${d.rarity} ${d.kind}`.toUpperCase() : '', t: 0, life: 3.8, color: col, y: y0, model });
  }
  /** bounce / flash a counter */
  flash(what: Counter) { this.pop[what] = 1; if (what !== 'hp') this.rolls[what].flash = 1; }

  /** begin + draw + end on the HUD's own PixelUI */
  draw(dt: number, s: HudData, input: Input | null = null) {
    this.ui.begin(input, dt);
    this.drawInto(this.ui, dt, s);
    this.ui.end();
  }

  /** draw into any PixelUI between its begin() and end() (the plates pool restarts here: add panels after it) */
  private d: DUi | null = null;
  drawInto(pui: PixelUI, dt: number, s: HudData) {
    this.t += dt;
    this.stage.attach(pui);
    this.planes.begin();
    if (!this.d || this.d.ui !== pui) this.d = new DUi(pui);
    const ui = this.d;
    ui.k = Math.max(0.75, pui.h / 360);
    if (ui.k !== this.lastK) { this.lastK = ui.k; }
    this.stage.ui.scale.setScalar(ui.k);
    // the pixel treatment (painted pages + banded ramp light) on every HUD object, new children included
    if ((this.pixT -= dt) <= 0) { this.pixT = 0.5; pixelize(this.stage.ui); }
    this.animate(dt, s);
    const on = !s.hidden;
    for (const o of this.stage.ui.children) o.visible = on;
    if (on) {
      const vit = this.vitals(ui, dt, s);
      this.resources(ui, s, vit);
      const navL = this.nav(ui, dt, s, vit.right);
      this.topGap = [vit.right, navL];
      // the boss bar keeps clear of the hand of skill cards on narrow screens
      const last = (s.skills?.slots ?? []).reduce((a, sl, i) => (sl ? i : a), -1);
      this.bossBar(ui, dt, s.boss && s.boss.visible !== false ? s.boss : null, last >= 0 ? M + 20 + last * 41 + 26 : 10);
      this.hand(ui, dt, s.skills ?? null);
      this.pickups(ui, dt);
    } else for (const p of this.picks) p.t += dt;
    // (behind a menu the title cards wait: their clocks stop until it closes)
    if (!s.menu) this.toastsDraw(ui, dt, !on);
    this.prev = { ...s, combat: s.combat ? { ...s.combat } : s.combat };
  }

  // ---------------------------------------------------------------- change detection / easing
  private animate(dt: number, s: HudData) {
    const p = this.prev;
    if (p) {
      const tot = s.hp + (s.soul ?? 0), ptot = p.hp + (p.soul ?? 0);
      if (tot < ptot) { this.avatar.hurt(); this.hurtT = 1; const i = Math.floor(Math.max(0, s.hp) / 2); this.heartBump[i] = 1; }
      else if (s.hp > p.hp) { this.avatar.heal(); this.healT = 1; for (let i = Math.floor(p.hp / 2); i < Math.ceil(s.hp / 2); i++) this.heartBump[i] = 1; }
      if (s.combat?.lastParry && s.combat.lastParryAge < (p.combat?.lastParryAge ?? 99)) this.parryFlash = s.combat.lastParry === 'perfect' ? 1 : 0.5;
    }
    this.hurtT = Math.max(0, this.hurtT - dt * 1.6); this.healT = Math.max(0, this.healT - dt * 1.2);
    for (let i = 0; i < this.heartBump.length; i++) this.heartBump[i] = Math.max(0, (this.heartBump[i] ?? 0) - dt * 3);
    for (const k of Object.keys(this.pop) as Counter[]) this.pop[k] = Math.max(0, this.pop[k] - dt * 3.5);
    this.parryFlash = Math.max(0, this.parryFlash - dt * 3);
    // counters roll to their new value, flash and float a +n / -n
    const vals = { pearls: s.pearls, keys: s.keys, bombs: s.bombs, pack: s.pack?.used ?? 0 };
    for (const k of Object.keys(this.rolls) as (keyof typeof vals)[]) {
      const r = this.rolls[k], v = vals[k];
      if (r.v < 0) { r.v = r.old = v; continue; }
      if (v !== r.v) { r.delta.push({ n: v - r.v, t: 0 }); r.old = r.v; r.v = v; r.t = 0; r.flash = 1; this.pop[k] = 1; }
      r.t = Math.min(1, r.t + dt * 6); r.flash = Math.max(0, r.flash - dt * 2.2);
      for (const d of r.delta) d.t += dt;
      r.delta = r.delta.filter((d) => d.t < 1.1).slice(-3);
    }
    const c = s.combat;
    const st = c && c.staminaMax > 0 ? clamp01(c.stamina / c.staminaMax) : 1;
    if (st < this.stamShown - 0.002) { this.stamChip = Math.max(this.stamChip, this.stamShown); this.stamChipHold = 0.4; this.stamShown = st; }
    else { if (st > this.stamShown + 0.15 && st >= 0.999) this.stamFlash = 0.6; this.stamShown = lerp(this.stamShown, st, 1 - Math.exp(-dt * 12)); }
    if (this.stamChipHold > 0) this.stamChipHold -= dt; else this.stamChip = Math.max(this.stamShown, this.stamChip - dt * 0.8);
    this.stamFlash = Math.max(this.parryFlash, this.stamFlash - dt * 2.5);
    const mn = s.maxMana ? clamp01((s.mana ?? 0) / s.maxMana) : 0;
    if (mn < this.manaShown - 0.01) this.manaChip = Math.max(this.manaChip, this.manaShown);
    this.manaShown = lerp(this.manaShown, mn, 1 - Math.exp(-dt * 10));
    this.manaChip = Math.max(this.manaShown, this.manaChip - dt * 0.6);
    const b = s.boss && s.boss.visible !== false ? s.boss : null;
    if (b) {
      if (b.name !== this.bossName) { this.bossName = b.name; this.bossIn = 0; this.bossShown = this.bossChip = 1; }
      this.bossIn = Math.min(1, this.bossIn + dt * 1.2);
      const v = b.max > 0 ? clamp01(b.hp / b.max) : 0;
      if (v < this.bossShown - 0.0005) { const hit = this.bossShown - v; this.bossChip = Math.max(this.bossChip, this.bossShown); this.bossChipHold = 0.6; this.bossFlash = Math.min(1, this.bossFlash + hit * 12); this.bossShake = Math.min(1, this.bossShake + hit * 20); this.bossShown = v; }
      else this.bossShown = lerp(this.bossShown, v, 1 - Math.exp(-dt * 6));
      if (this.bossChipHold > 0) this.bossChipHold -= dt; else this.bossChip = Math.max(this.bossShown, this.bossChip - dt * 0.3);
      this.bossFlash = Math.max(0, this.bossFlash - dt * 7);
      this.bossShake = Math.max(0, this.bossShake - dt * 5);
    } else { this.bossName = ''; this.bossIn = 0; }
  }

  /** light caustics sliding slowly over a plate (a tiled overlay moved by UV offset: no repaint) */
  private shimmer(ui: DUi, x: number, y: number, w: number, h: number, seed: number, alpha = 1) {
    const i = 3;
    this.planes.drawTiled(caustics(), ui.p(x) + i, ui.p(y) + i, ui.p(w) - 2 * i, ui.p(h) - 2 * i, { tile: 56, ox: this.t * 0.021 + seed, oy: this.t * 0.013 + seed * 0.7, alpha: 0.22 * alpha });
  }

  // ---------------------------------------------------------------- top left: porthole + hearts + bars + flasks
  private vitals(ui: DUi, dt: number, s: HudData): { right: number; bottom: number } {
    const S = this.stage, c = s.combat;
    const pc = { x: M + PR + 4, y: M + PR + 3 };
    // the porthole and the blobfish looking out of it
    const frac = s.maxHp > 0 ? clamp01(s.hp / s.maxHp) : 0;
    const low = s.hp > 0 && s.hp <= 2;
    this.avatar.update(dt, frac, low);
    this.port.update(this.t, this.hurtT, this.healT, low, ui.k);
    const shake = this.hurtT > 0.5 ? Math.sin(this.t * 60) * (this.hurtT - 0.5) * 3 : 0;
    S.put(this.port.root, pc.x + shake, pc.y, 0);
    this.avatar.root.scale.setScalar(23);
    S.put(this.avatar.root, pc.x + shake + 1, pc.y + 5, 10);
    // the hearts
    const red = Math.ceil(Math.max(0, s.maxHp) / 2), soul = Math.ceil(Math.max(0, s.soul ?? 0) / 2), total = red + soul;
    const perRow = 8, rows = Math.max(1, Math.ceil(total / perRow));
    const x0 = pc.x + PR + 9, y0 = pc.y - 21;
    const heartsW = Math.min(total, perRow) * 13;
    // the bars and the flasks
    const nF = c?.flasksMax ?? 0;
    const barW = 104;
    const hy = y0 + 10, by = y0 + 7 + rows * 13;
    const hasStam = !!c && c.staminaMax > 0, hasMana = !!s.maxMana;
    const flaskX = x0 + barW + 10;
    const right = Math.max(x0 + heartsW + 4, nF ? flaskX + nF * 11 + 1 : x0 + barW + 4) + 7;
    const bottom = Math.max(by + (hasStam ? 10 : 0) + (hasMana ? 8 : 0) + 3, y0 + 40);
    // the lacquered plate (behind everything; the porthole covers its left end)
    const px0 = pc.x, pw = right - px0, ph = bottom - y0;
    this.planes.draw(plate(ui.p(pw), ui.p(ph), 'lacquer', { rope: [ui.p(pw) - 15] }), ui.p(px0), ui.p(y0), { shadow: 2 });
    this.shimmer(ui, px0, y0, pw, ph, 0);
    while (this.hearts.length < total) { const h = new Heart3D(); S.ui.add(h.root); this.hearts.push(h); }
    this.hearts.forEach((h, i) => {
      h.root.visible = i < total;
      if (i >= total) return;
      let l: THREE.Material, r: THREE.Material;
      if (i < red) { const v = s.hp - i * 2; l = v >= 1 ? jelly : jellyEmpty; r = v >= 2 ? jelly : jellyEmpty; }
      else { const v = (s.soul ?? 0) - (i - red) * 2; l = v >= 1 ? jellySoul : jellyEmpty; r = v >= 2 ? jellySoul : jellyEmpty; }
      h.set(l, r);
      const bump = this.heartBump[i] ?? 0;
      const beat = low && i === Math.ceil(s.hp / 2) - 1 ? Math.max(0, Math.sin(this.t * 7.5)) ** 8 * 0.25 : 0;
      const wob = Math.sin(this.t * 2.4 + i * 0.7);
      const sc = 11.5;
      h.root.scale.set(sc * (1 + beat + bump * 0.3), sc * (1 + beat - bump * 0.15 + wob * 0.02), sc);
      h.root.rotation.set(0, Math.sin(this.t * 1.3 + i) * 0.25, wob * 0.06);
      S.put(h.root, x0 + 6 + (i % perRow) * 13, hy + Math.floor(i / perRow) * 13 - Math.sin(bump * Math.PI) * 4 + Math.sin(this.t * 2.2 + i * 0.8) * 0.8, 10);
    });
    // stamina: teal, amber while regen waits, red guard-broken, white on a parry; a pale chip of what you just spent
    let yy = by;
    if (hasStam && c) {
      const broken = c.guard === 'guardBroken' || (c.stamina <= 0 && Math.sin(this.t * 20) > 0);
      const col = broken ? PAL.coral : c.staminaDelay > 0 ? '#e8a818' : '#2ac8a0';
      const jig = c.guard === 'riposte' ? Math.round(Math.sin(this.t * 30)) * 0.5 : 0;
      tube(ui.ui, ui.p(x0 - 2), ui.p(yy + jig), ui.p(barW + 4), Math.max(7, ui.p(8)), this.stamShown, { col, chip: this.stamChip, flash: this.stamFlash, ticks: 0.25, t: this.t });
      yy += 10;
    }
    if (hasMana) {
      tube(ui.ui, ui.p(x0 - 2), ui.p(yy), ui.p(barW + 4), Math.max(6, ui.p(6)), this.manaShown, { col: '#5a7aff', chip: this.manaChip, t: this.t + 3, crystal: true });
      yy += 8;
    }
    while (this.flasks.length < nF) { const f = new Flask3D(); S.ui.add(f.root); this.flasks.push(f); }
    this.flasks.forEach((f, i) => {
      f.root.visible = i < nF;
      if (i >= nF || !c) return;
      const drinking = c.drinking > 0 && i === c.flasks;
      f.update(dt, i < c.flasks ? 1 : drinking ? 1 - c.drinking : 0);
      f.root.scale.setScalar(13);
      S.put(f.root, flaskX + 6 + i * 11, by + (hasMana ? 8 : 4), 8);
    });
    // bubbles drift up out of the porthole's top, wobbling, popping at the screen's edge
    for (let i = 0; i < 4; i++) {
      const ph2 = (this.t * 0.22 + i * 0.29) % 1;
      const bx = pc.x - 6 + i * 4 + Math.sin(this.t * 2.3 + i * 1.7) * 1.5, by = pc.y - PR - 2 - ph2 * (pc.y - PR + 6);
      const g = ph2 < 0.5 || i % 2 ? GLYPH.bubble() : GLYPH.bubbleS(), gs = Math.max(1, Math.round(ui.k));
      ui.ui.img(g, ui.p(bx), ui.p(by), { w: g.width * gs, h: g.height * gs, alpha: Math.min(1, (1 - ph2) * 1.6) * 0.9 });
    }
    return { right, bottom: Math.max(bottom, pc.y + PR + 4) };
  }

  // ---------------------------------------------------------------- the resource strip: pearls, keys, bombs, the pack
  private resources(ui: DUi, s: HudData, vit: { bottom: number }) {
    const S = this.stage;
    const y = vit.bottom + 3, h = 22, x0 = M + 2;
    const cap = 9.5;
    type Cell = { k: 'pearls' | 'keys' | 'bombs' | 'pack'; num: string; sub?: string; bad?: boolean; scale: number };
    const cells: Cell[] = [
      { k: 'pearls', num: String(Math.max(0, s.pearls)), scale: 13 },
      { k: 'keys', num: String(Math.max(0, s.keys)), scale: 15 },
      { k: 'bombs', num: String(Math.max(0, s.bombs)), scale: 15 },
    ];
    const full = !!s.pack && (s.pack.full || s.pack.used >= s.pack.total);
    if (s.pack) cells.push({ k: 'pack', num: String(s.pack.used), sub: `/${s.pack.total}`, bad: full, scale: 15 });
    this.models.pack.visible = !!s.pack;
    // widths: a medallion for the model, then the numeral window sized for two digits (a number never jumps)
    const digitW = ui.bigW('0', cap);
    const ws = cells.map((c) => 20 + Math.max(2, c.num.length) * digitW + (c.sub ? ui.bigW(c.sub, 5.5) + 1 : 0) + 9);
    const W = ws.reduce((a, b) => a + b, 0) + 4;
    this.planes.draw(plate(ui.p(W), ui.p(h), 'brass'), ui.p(x0), ui.p(y), { shadow: 2 });
    this.shimmer(ui, x0, y, W, h, 1.7);
    let cx = x0 + 2;
    cells.forEach((c, i) => {
      const w = ws[i], r = this.rolls[c.k], pop = this.pop[c.k];
      // the model's medallion and the recessed numeral window
      const md = h - 4;
      this.planes.draw(plate(ui.p(md), ui.p(md), 'disc'), ui.p(cx + 1), ui.p(y + 2));
      const wx = cx + md + 2, ww = w - md - 5;
      this.planes.draw(plate(ui.p(ww), ui.p(h - 6), 'well'), ui.p(wx), ui.p(y + 3));
      // the turning model (spins once on a change)
      const m = this.models[c.k];
      m.scale.setScalar(c.scale * (1 + Math.sin(pop * Math.PI) * 0.25));
      m.rotation.set(0.18, Math.sin(this.t * 1.2 + i * 1.7) * 0.5 + pop * Math.PI * 2, c.k === 'pack' ? Math.sin(this.t * 60) * 0.1 * pop : 0);
      S.put(m, cx + 1 + md / 2, y + h / 2 + (c.k === 'pearls' ? 0 : 0.5), 12);
      // the number rolls to its new value inside the window, flashing brass
      const col = c.bad ? PAL.coral : r.flash > 0 ? lerpHex(PAL.cream, PAL.brass2, r.flash) : PAL.cream;
      const ny = y + (h - cap) / 2;
      const subW = c.sub ? ui.bigW(c.sub, 5.5) + 1 : 0;
      const ncx = wx + (ww - subW) / 2;
      ui.ui.clip(ui.p(wx) + 1, ui.p(y + 3) + 1, ui.p(ww) - 2, ui.p(h - 6) - 2);
      const e = easeOut(r.t);
      if (r.t < 1 && r.old !== r.v) {
        const dir = r.v > r.old ? 1 : -1;
        ui.big(String(Math.max(0, r.old)), ncx, ny - dir * e * (h - 4), cap, { color: PAL.cream, alpha: 1 - e, align: 'center' });
        ui.big(c.num, ncx, ny + dir * (1 - e) * (h - 4), cap, { color: col, align: 'center' });
      } else ui.big(c.num, ncx, ny, cap, { color: col, align: 'center' });
      ui.ui.unclip();
      if (c.sub) ui.big(c.sub, ncx + ui.bigW(c.num, cap) / 2 + 1, ny + cap - 5.5, 5.5, { color: c.bad ? PAL.coral2 : PAL.dim });
      if (c.bad && Math.sin(this.t * 6) > -0.2) ui.big('PACK FULL', wx + ww / 2, y + h + 2, 5, { color: PAL.coral, align: 'center' });
      // floating deltas rise off the window
      for (const d of r.delta) {
        const a = 1 - clamp01((d.t - 0.6) / 0.5);
        ui.big((d.n > 0 ? '+' : '') + d.n, wx + ww / 2, y - 3 - d.t * 10, 6, { color: d.n > 0 ? PAL.kelp2 : PAL.coral2, alpha: a, align: 'center' });
      }
      cx += w;
    });
  }

  // ---------------------------------------------------------------- top right: the navigation instrument
  private nav(ui: DUi, dt: number, s: HudData, leftLimit: number): number {
    const m = s.strip ?? null, d = s.depth ?? null;
    const far = s.far ?? (s.strip as { far?: number } | null | undefined)?.far;
    this.gauge.root.visible = !!d;
    if (!m && !d) return ui.w;
    const gc = { x: ui.w - M - PR - 4, y: M + PR + 3 };
    const x1 = d ? gc.x : ui.w - M;
    const NW = Math.max(150, Math.min(Math.round(ui.w * 0.34), 250, x1 - leftLimit - 24));
    const x0 = x1 - NW, y0 = gc.y - 21, h = 46;
    this.planes.draw(plate(ui.p(NW), ui.p(h), 'lacquer', { rope: [4] }), ui.p(x0), ui.p(y0), { shadow: 2 });
    this.shimmer(ui, x0, y0, NW, h, 3.1);
    const cr = (d ? gc.x - PR - 9 : x1 - 8);
    const cl = x0 + 8;
    // the area name and the stage pips
    if (m) {
      const nm = (m.name ?? '').toUpperCase();
      ui.big(nm, cl + 6, y0 + 5, 6, { color: PAL.brass2 });
      const st = `${m.floor}/${m.floors}`;
      const sw = ui.bigW(st, 6);
      ui.big(st, cr, y0 + 5, 6, { color: PAL.cream, align: 'right' });
      for (let i = 0; i < m.floors; i++) {
        const px = cr - sw - 6 - (m.floors - 1 - i) * 7, py = y0 + 8;
        const on = i < m.floor, cur = i === m.floor - 1;
        diamond(ui, px, py, 3, on ? (cur ? PAL.brass2 : PAL.brass) : PAL.teal1, PAL.ink2);
        if (cur) diamond(ui, px, py, 1, PAL.glint, PAL.glint);
      }
      // the strip map in a recessed window
      const mx = cl - 2, my = y0 + 14, mw = cr - cl + 4, mh = 18;
      this.planes.draw(plate(ui.p(mw), ui.p(mh), 'well'), ui.p(mx), ui.p(my));
      const cw = ui.p(mw) - 4, ch = ui.p(mh) - 4;
      if (this.stripCv.width !== cw || this.stripCv.height !== ch) { this.stripCv.width = Math.max(4, cw); this.stripCv.height = Math.max(4, ch); }
      paintStrip(this.stripCv, m, this.t);
      this.planes.draw(this.stripCv, ui.p(mx) + 2, ui.p(my) + 2, { dirty: true });
    }
    // the readouts: metres from home (left) and the depth (right, next to the gauge)
    const ry = y0 + h - 12;
    if (far !== undefined) {
      const g = GLYPH.house(), gs = Math.max(1, Math.round(ui.k)), fx = cl + 7;
      ui.ui.img(g, ui.p(fx), ui.p(ry + 1), { w: g.width * gs, h: g.height * gs });
      const fw = ui.big(`${Math.round(far)}`, fx + g.width * gs / ui.k + 3, ry, 7.5, { color: PAL.cream });
      ui.big('M FROM HOME', fx + g.width * gs / ui.k + 5 + fw, ry + 2, 5, { color: PAL.dim });
    }
    if (d) {
      const dm = Math.round(d.m);
      const txt = dm > 0 ? `-${dm}` : '0';
      const col = d.descending ? PAL.sea2 : PAL.cream;
      const uw = ui.bigW('M', 5);
      const tw = ui.big(txt, cr - uw - 2, ry - 1, 9, { color: col, align: 'right' });
      ui.big('M', cr, ry + 3, 5, { color: PAL.dim, align: 'right' });
      const g = GLYPH.down(), gs = Math.max(1, Math.round(ui.k));
      ui.ui.img(g, ui.p(cr - uw - 4 - tw) - g.width * gs - 2, ui.p(ry + 2), { w: g.width * gs, h: g.height * gs });
      this.gauge.update(dt, this.t, d, ui.k * ui.ui.hd, ui.k);
      this.stage.put(this.gauge.root, gc.x, gc.y, 0);
    }
    return x0;
  }

  // ---------------------------------------------------------------- bottom centre: the boss
  private bossBar(ui: DUi, dt: number, b: BossBar | null, handR = 10) {
    if (!b) return;
    const ease = easeOutBack(this.bossIn * 1.6), fade = clamp01(this.bossIn * 3);
    let BW = Math.max(180, Math.min(320, ui.w - 2 * 184)), cx = ui.w / 2;
    if (cx - BW / 2 - 14 < handR) { BW = Math.max(120, Math.min(320, ui.w - 10 - handR - 28)); cx = Math.max(handR + 14 + BW / 2, (handR + ui.w - 10) / 2); }
    const shake = Math.sin(this.t * 70) * this.bossShake * 2;
    const bx = cx - BW / 2 + shake, py = ui.h - 37 + (1 - ease) * 48;
    // the dark plate with the bar
    this.planes.draw(plate(ui.p(BW + 24), ui.p(25), 'iron', { rim: '#b04a3a', rope: [3, ui.p(BW + 24) - 8] }), ui.p(bx - 12), ui.p(py), { alpha: fade, shadow: 2 });
    this.shimmer(ui, bx - 12, py, BW + 24, 25, 4.4, fade);
    const v = this.bossShown;
    tube(ui.ui, ui.p(bx - 4), ui.p(py + 6), ui.p(BW + 8), Math.max(9, ui.p(10)), v, { col: '#d8303a', chip: this.bossChip, flash: this.bossFlash, ticks: 0.1, t: this.t });
    const po = clamp01(b.poise ?? 1);
    if (po < 0.999) bar(ui.ui, ui.p(bx + 6), ui.p(py + 17.5), ui.p(BW - 12), Math.max(3, ui.p(3)), po, { col: '#f2c66d', back: '#160a0e' });
    // the phase pips, centred on the plate's bottom rim
    const n = Math.max(1, b.phases ?? 1), ph = Math.max(1, Math.min(n, b.phase ?? 1));
    if (n > 1) for (let i = 0; i < n; i++) { const px = cx + (i - (n - 1) / 2) * 10, pyy = py + 23; diamond(ui, px, pyy, 3.5, i < ph ? PAL.coral : '#3a2228', PAL.ink2); if (i < ph) diamond(ui, px - 0.5, pyy - 0.5, 1, '#ffd0c0', '#ffd0c0'); }
    // the name ribbon stamps down onto the plate
    const name = b.name.toUpperCase();
    const st = clamp01((this.bossIn - 0.15) * 4), sEase = easeOutBack(st);
    const nw = ui.bigW(name, 9);
    const rw = nw + 58, rh = 29;
    const ry = py - 21 - (1 - sEase) * 10;
    if (st > 0) {
      this.planes.draw(plate(ui.p(rw), ui.p(rh), 'nameplate'), ui.p(cx - rw / 2 + shake), ui.p(ry), { alpha: st, shadow: 2 });
      ui.big(name, cx + shake, ry + (rh - 9) / 2 - 1, 9, { color: PAL.cream, color2: '#ffd8c8', align: 'center', alpha: st });
      if (b.title) ui.big(clean(b.title).toUpperCase(), cx, ry - 8, 5, { color: '#f0d0c0', align: 'center', alpha: st });
      if (this.bossIn < 0.4 && st >= 1 && !this.bossStamped) { this.bossStamped = true; audio.play('thud_heavy1', { vol: 0.4, dry: true }); }
    }
    if (this.bossIn < 0.1) this.bossStamped = false;
  }
  private bossStamped = false;
  /** the free span of the top row (between the vitals and the navigation instrument), D */
  private topGap: [number, number] = [0, 9999];

  // ---------------------------------------------------------------- bottom left: the hand of skill cards
  private hand(ui: DUi, dt: number, sk: SkillHudState | null) {
    const ids = (sk?.slots ?? []).map((x) => x?.id ?? '');
    if (ids.join('|') !== this.cardIds.join('|')) {
      for (const c of this.cards) c.root.removeFromParent();
      this.cards = ids.map((id) => (id ? new SkillCard3D(id, { w: 36 }) : null)).filter((c): c is SkillCard3D => !!c);
      for (const c of this.cards) this.stage.ui.add(c.root);
      this.cardIds = ids;
    }
    if (!sk) return;
    let k = 0;
    sk.slots.forEach((sl, i) => {
      if (!sl) return;
      const c = this.cards[k++]; if (!c) return;
      const x = M + 20 + i * 41, y = ui.h - 36;
      const hov = ui.hover(x - c.w / 2, y - c.h / 2, c.w, c.h) ? 1 : 0;
      const cd = sl.cdMax > 0 ? clamp01(sl.cd / sl.cdMax) : 0;
      const ready = cd <= 0 && sl.mana <= sk.mana;
      c.update(dt, { hover: hov, mx: hov ? (ui.mx - x) / (c.w / 2) : 0, my: hov ? (ui.my - y) / (c.h / 2) : 0, cd, ready, selected: i === sk.sel });
      this.stage.put(c.root, x, y, 30);
      c.root.rotation.z = (i - 1.5) * -0.05;
      // the key on a little brass disc on the frame, the cooldown seconds big over the art
      const lift = i === sk.sel ? 5 : 0;
      const kx = x - c.w / 2 + 2, ky = y - c.h / 2 - 3 - lift;
      diamond(ui, kx + 3, ky + 4, 5.5, i === sk.sel ? PAL.brass2 : PAL.brass, PAL.ink2);
      ui.big(String(i + 1), kx + 3, ky + 1, 6, { color: PAL.ink, outline: null, shadow: null, align: 'center' });
      if (cd > 0) ui.big(String(Math.ceil(sl.cd)), x, y - 9, 11, { color: '#ffffff', align: 'center' });
      else if (!ready) ui.big('MANA', x, y - 4, 4.5, { color: PAL.sea2, align: 'center' });
    });
  }

  // ---------------------------------------------------------------- right: pickup cards
  private pickups(ui: DUi, dt: number) {
    for (const c of this.picks) c.t += dt;
    for (const c of this.picks) if (c.t >= c.life) c.model.removeFromParent();
    this.picks = this.picks.filter((c) => c.t < c.life);
    let ty = 70;
    for (const c of this.picks) {
      c.y = lerp(c.y, ty, 1 - Math.exp(-dt * 10));
      const nw = ui.bigW(c.title, 7), kw = ui.bigW(c.kind, 4.5);
      const maxW = Math.min(220, ui.w * 0.36);
      let sub = c.sub;
      const subMax = maxW - 44;
      while (sub.length > 4 && ui.bigW(sub, 4.5) > subMax) sub = sub.slice(0, -2).trimEnd() + '…'.replace('…', '');
      if (sub !== c.sub && !sub.endsWith('.')) sub = sub.replace(/[ .,]*$/, '') + '...';
      const cw = Math.round(Math.max(136, Math.min(maxW, Math.max(nw, kw, ui.bigW(sub, 4.5)) + 48))), ch = 37;
      const inK = easeOutBack(c.t * 3.2), outK = clamp01((c.t - c.life + 0.35) / 0.35) ** 2;
      const x = ui.w - M - cw + (1 - inK) * (cw + 24) + outK * (cw + 24);
      const y = c.y;
      const a = 1 - outK;
      const R = ramp(c.color);
      this.planes.draw(plate(ui.p(cw), ui.p(ch), 'lacquer', { rim: c.color }), ui.p(x), ui.p(y), { alpha: a });
      this.planes.draw(plate(ui.p(29), ui.p(29), 'disc', { face: '#2a5a60' }), ui.p(x + 4), ui.p(y + 4), { alpha: a });
      // a fresh card glows with its rarity for a moment
      if (c.t < 0.5) ui.fill(x + 1, y + 1, cw - 2, ch - 2, R[5], (0.5 - c.t) * 0.6);
      const cells = (c.model.userData.cells as number[] | undefined) ?? [1];
      c.model.scale.setScalar((22 / Math.max(1, ...cells)) * (1 + Math.max(0, 0.3 - c.t) * 1.4));
      c.model.rotation.set(0.3, -0.6 + Math.sin(this.t * 1.6 + c.y) * 0.6, 0);
      c.model.visible = a > 0.05;
      this.stage.put(c.model, x + 18.5, y + 18.5, 40);
      const tx = x + 37;
      ui.big(c.title, tx, y + 6, 7, { color: R[4], alpha: a });
      if (c.kind) ui.big(c.kind, tx, y + 16.5, 4.5, { color: R[3], alpha: a });
      if (sub) ui.big(sub, tx, y + 25, 4.5, { color: PAL.kelp2, alpha: a });
      ty += ch + 5;
    }
    this.codexNotes(ui, dt, ty);
  }

  /** the codex notes, one at a time, under the pickup cards: a cream journal slip, the creature on a medallion */
  private codexNotes(ui: DUi, dt: number, ty: number) {
    const n = this.notes[0];
    for (const q of this.notes) if (q !== n && q.model) q.model.visible = false;
    if (!n) return;
    n.t += dt;
    const life = this.notes.length > 1 ? 2.2 : 3;
    if (n.t >= life) { n.model?.removeFromParent(); this.notes.shift(); return; }
    if (n.y < 0) n.y = ty;
    n.y = lerp(n.y, ty, 1 - Math.exp(-dt * 10));
    const head = 'NEW IN THE CODEX';
    const cw = Math.round(Math.max(134, Math.max(ui.bigW(n.name, 7), ui.bigW(head, 4.5) + 12) + 50)), ch = 33;
    const inK = easeOutBack(n.t * 3.2), outK = clamp01((n.t - life + 0.35) / 0.35) ** 2;
    const x = ui.w - M - cw + (1 - inK) * (cw + 24) + outK * (cw + 24), y = n.y, a = 1 - outK;
    this.planes.draw(skin('paper', ui.p(cw), ui.p(ch)), ui.p(x), ui.p(y), { alpha: a, shadow: 2 });
    this.planes.draw(plate(ui.p(27), ui.p(27), 'disc', { face: '#b8d4cc', rim: PAL.brass }), ui.p(x + 4), ui.p(y + 3), { alpha: a });
    if (n.model) {
      n.model.visible = a > 0.05;
      n.model.scale.setScalar(22 * (n.model.userData.fit as number) * (1 + Math.max(0, 0.3 - n.t) * 1.2));
      n.model.rotation.set(0.15, -0.7 + Math.sin(this.t * 1.4) * 0.5, 0);
      this.stage.put(n.model, x + 17.5, y + 16.5, 40);
    }
    const g = GLYPH.book(), gs = Math.max(1, Math.round(ui.k));
    ui.ui.img(g, ui.p(x + 36), ui.p(y + 6), { w: g.width * gs, h: g.height * gs, alpha: a });
    ui.big(head, x + 38 + g.width * gs / ui.k + 2, y + 6, 4.5, { color: '#8a5a24', outline: null, shadow: null, alpha: a });
    ui.big(n.name, x + 36, y + 16, 7.5, { color: '#2a1a0c', outline: null, shadow: '#d9c59b', alpha: a });
  }

  // ---------------------------------------------------------------- title toasts and the floor's area card
  private toastsDraw(ui: DUi, dt: number, hidden: boolean) {
    for (const c of this.toasts) c.t += dt;
    this.toasts = this.toasts.filter((c) => c.t < c.life);
    for (const c of this.toasts) {
      const outK = clamp01((c.t - c.life + 0.45) / 0.45);
      if (c.area) {
        // a cinematic band across the upper screen, the name stamped in letter by letter, brass rules, the sub line
        const cy = ui.h * 0.25, cap = 20;
        // (planes drawn BEHIND the HUD's plates and cards, so the band never dims an instrument)
        const bandA = clamp01(c.t * 4) * (1 - outK) * 0.4;
        this.planes.draw(solid(PAL.ink2), 0, ui.p(cy - 9), { w: ui.ui.w, h: ui.p(cap + 29), alpha: bandA, back: true });
        this.planes.draw(solid(PAL.brass), 0, ui.p(cy - 9), { w: ui.ui.w, h: 1, alpha: Math.min(1, bandA * 1.6), back: true });
        this.planes.draw(solid(PAL.brass), 0, ui.p(cy + cap + 19), { w: ui.ui.w, h: 1, alpha: Math.min(1, bandA * 1.6), back: true });
        const tw = ui.bigW(c.title, cap);
        let lx = ui.w / 2 - tw / 2;
        const chars = [...c.title];
        chars.forEach((ch, i) => {
          const lt = c.t - 0.1 - i * 0.045;
          const k = clamp01(lt * 6);
          const w = ui.bigW(ch === ' ' ? 'I' : ch, cap) - 1 / ui.k;
          if (k > 0 && ch !== ' ') ui.big(ch, lx, cy - (1 - easeOutBack(k)) * 14 - outK * 6, cap, { color: c.color, color2: PAL.brass2, alpha: k * (1 - outK) });
          lx += ch === ' ' ? w * 0.7 : w;
        });
        const rk = easeOut((c.t - 0.3) * 2.5);
        const rw = Math.min(ui.w * 0.4, tw * 0.5 + 40) * rk;
        if (rk > 0) {
          for (const sx of [-1, 1]) {
            const x0 = sx < 0 ? ui.w / 2 - tw / 2 - 10 - rw : ui.w / 2 + tw / 2 + 10;
            ui.fill(x0, cy + cap / 2 - 1, rw, 2, PAL.brass, 1 - outK); ui.fill(x0, cy + cap / 2 - 1, rw, 1, PAL.brass2, 1 - outK);
            diamond(ui, sx < 0 ? x0 + rw + 4 : x0 - 4, cy + cap / 2, 3, PAL.brass2, PAL.ink2);
          }
        }
        const sa = clamp01((c.t - 0.7) * 3) * (1 - outK);
        if (c.sub && sa > 0) ui.big(c.sub, ui.w / 2, cy + cap + 7, 6.5, { color: PAL.cream, align: 'center', alpha: sa });
        continue;
      }
      if (c.banner) {
        // the slam: the title starts big and lands on its plate, a shake as it hits, then it lifts away
        // (lower when the floor's area card is still up, so they never stack)
        const cy = ui.h * (this.toasts.some((q) => q.area) ? 0.5 : 0.36), cap = 20;
        const st = clamp01(c.t / 0.16), capNow = cap * (1 + (1 - st) * 0.8);
        if (st >= 1 && !c.landed) { c.landed = true; audio.play('thud_heavy1', { vol: c.banner === 'danger' ? 0.45 : 0.25, dry: true }); }
        const a = clamp01(c.t * 7) * (1 - outK);
        const shake = c.t > 0.16 && c.t < 0.4 ? Math.sin(c.t * 90) * (0.4 - c.t) * 6 : 0;
        const tw = ui.bigW(c.title, cap);
        const y = cy - outK * 10;
        if (c.banner === 'danger') {
          const rw = tw + 70, rh = 38;
          this.planes.draw(plate(ui.p(rw), ui.p(rh), 'nameplate'), ui.p(ui.w / 2 - rw / 2 + shake), ui.p(y - rh / 2), { alpha: a * st, shadow: 3 });
        } else {
          // a driftwood plank lashed with rope at both ends
          const rw = tw + 70, rh = 36;
          this.planes.draw(plate(ui.p(rw), ui.p(rh), 'board', { rope: [9, ui.p(rw) - 15], plank: 17 }), ui.p(ui.w / 2 - rw / 2 + shake), ui.p(y - rh / 2), { alpha: a * st, shadow: 3 });
          this.shimmer(ui, ui.w / 2 - rw / 2 + shake, y - rh / 2, rw, rh, 2.2, a * st);
        }
        ui.big(c.title, ui.w / 2 + shake, y - capNow / 2 - 1, capNow, { color: c.banner === 'danger' ? c.color : PAL.brass2, color2: c.banner === 'danger' ? '#ff9a84' : '#f8e0a0', align: 'center', alpha: a });
        const sa = clamp01((c.t - 0.35) * 4) * (1 - outK);
        if (c.sub && sa > 0) {
          const sw = ui.bigW(c.sub, 6) + 18, sy = y + 22;
          this.planes.draw(plate(ui.p(sw), ui.p(14), 'well', { face: PAL.ink }), ui.p(ui.w / 2 - sw / 2), ui.p(sy), { alpha: sa * 0.95 });
          ui.big(c.sub, ui.w / 2, sy + 4, 6, { color: PAL.cream, align: 'center', alpha: sa });
        }
        continue;
      }
      // the toast: a ribbon drops in at the top centre
      const inK = easeOutBack(c.t * 3.5);
      const cap = 9, tw = ui.bigW(c.title, cap), sw = c.sub ? ui.bigW(c.sub, 5.5) : 0;
      const rw = Math.max(tw + 50, sw + 30), rh = 21;
      // between the vitals and the navigation instrument; below them when the top row has no room
      const [gl, gr] = this.topGap, fits = hidden || ui.w / 2 - rw / 2 > gl + 4 && ui.w / 2 + rw / 2 < gr - 4;
      const x = ui.w / 2 - rw / 2, y = (hidden ? 14 : fits ? 12 : 96) - (1 - inK) * 30 - outK * 20;
      const a = clamp01(c.t * 5) * (1 - outK);
      this.planes.draw(plate(ui.p(rw), ui.p(rh), 'ribbon', { rim: '#2c6b70' }), ui.p(x), ui.p(y), { alpha: a });
      ui.big(c.title, ui.w / 2, y + 5, cap, { color: c.color, align: 'center', alpha: a });
      if (c.sub) {
        const sy = y + rh + 3;
        const pw = sw + 14;
        this.planes.draw(plate(ui.p(pw), ui.p(11), 'well', { face: PAL.ink }), ui.p(ui.w / 2 - pw / 2), ui.p(sy), { alpha: a * 0.92 });
        ui.big(c.sub, ui.w / 2, sy + 2.5, 5.5, { color: PAL.cream, align: 'center', alpha: a });
      }
    }
  }
}

/** a small pixel diamond (pips, gems), centre (x, y) and radius r in D */
function diamond(ui: DUi, x: number, y: number, r: number, col: string, out: string) {
  const R = Math.max(1, Math.round(r * ui.k)), cx = Math.round(x * ui.k), cy = Math.round(y * ui.k);
  for (let i = -R; i <= R; i++) {
    const w = R - Math.abs(i);
    ui.ui.fill(cx - w - 1, cy + i, w * 2 + 3, 1, out);
  }
  ui.ui.fill(cx, cy - R - 1, 1, 1, out); ui.ui.fill(cx, cy + R + 1, 1, 1, out);
  for (let i = -R + 1; i <= R - 1; i++) { const w = R - 1 - Math.abs(i); ui.ui.fill(cx - w, cy + i, w * 2 + 1, 1, col); }
}
function lerpHex(a: string, b: string, t: number) {
  const A = new THREE.Color(a), B = new THREE.Color(b);
  return '#' + A.lerp(B, clamp01(t)).getHexString();
}
