// The dungeon-run HUD (v6, "the diver's kit", chunky + detailed + ocean): one instrument set, read at a glance.
// Painted plates (crisp pixel canvases at 1 texel per UI px, drawn as planes BEHIND the 3D pieces, src/ui/obj/stage.ts
// PlanePool), lit low-poly miniatures on the HUD's stage, and big Jersey numerals / gauges on the PixelUI canvas on top.
//
//   top left      VITALS: our blobfish (a real BlobModel) in a brass PORTHOLE is the face of your health: plump and
//                 bouncy when healthy, bruised and sweaty when low, deflating (sagging, leaking bubbles, flashing red)
//                 near death, squished by every hit (src/ui/obj/blobAvatar.ts). Beside it on a driftwood board: the HP
//                 as a big rolling NUMBER ("60 / 60") over an HP glass tube (a chip of what a hit took, a pink pour
//                 when you heal, ticks every 10 HP, a heartbeat when critical), the STAMINA tube, the MANA crystal,
//                 and the HEALING CLAM in a carved alcove: a 3D clam with its charge count and a hanging [R] HEAL tag;
//                 using one pops it open, slurps the glowing jelly and pours it into the HP tube.
//                 Health is shown as HP = units x HP_PER (src/combat/types.ts): the -10 / +30 floats off the number.
//                 RESOURCES: one brass strip under it, a turning model + a big rolling numeral per counter (pearls,
//                 keys, bombs, the pack's cells); numbers roll and flash on change and a +n / -n floats off
//   top right     NAVIGATION (no map: the journey forks at crossroads with signposts): a driftwood instrument with the
//                 area name on a brass plate, the stage gems, and two ODOMETERS on rolling drums: metres FROM HOME
//                 and the DEPTH, ending in the brass DEPTH GAUGE (engraved knurled bezel, enamel face, spring needle,
//                 record flag) mirroring the porthole
//   bottom left   the SKILLS: a hand of physical cards (keys 1-4), cooldown shadow + seconds
//   bottom centre the BOSS: an engraved brass NAME PLATE with scrolled ends and enamel gems (stamps in), a riveted
//                 housing with the health in a glass tube (chip + flash), poise, phase gems
//   right         PICKUP cards: slide in fully on screen, the item's model turning in a display well, the name in
//                 its rarity colour, the kind and one stat line; up to three stack
//   centre        TITLE toasts (a ribbon, top centre), BANNERS (a slam on a plate) and the big AREA card for a new
//                 floor (letters stamp onto a weathered plank)
//
// Usage (unchanged): const hud = new Hud(); overlays: [hud.layer]; hud.resize(w, h, pr);
//   hud.draw(dt, data, input)   or hud.drawInto(myUi, dt, data) inside your own ui.begin()/ui.end()
//   hud.title(name, sub) / hud.banner(t, sub, style) / hud.areaCard(name, sub) / hud.pickup(itemId) / hud.codex(name, model)
//   hud.flash('pack' | 'pearls' | 'keys' | 'bombs' | 'hp')
import * as THREE from 'three';
import { PixelUI } from './pixel/ui';
import type { Input } from '../core/input';
import type { PlayerCombatHud, BossBar } from '../combat/types';
import { ITEMS, RARITY_COLOR, statLines } from '../game/items';
import type { SkillHudState } from '../skills/hud';
import { UiStage, PlanePool } from './obj/stage';
import { pixelize, ramp } from './obj/pixtex';
import { BlobAvatar } from './obj/blobAvatar';
import { HealClam3D } from './obj/clam';
import { HP_PER, HEAL_ITEM, hpify } from '../combat/types';
import { AbilityMedallion } from './obj/medallion';
import { hudModel, itemModel } from '../backpack/models';
import { audio } from '../audio/audio';
import { drawText } from './pixel/font';
import { skin } from './pixel/skins';
import { PAL, plate, bigText, bigMeasure, bar, tube, solid, caustics, GLYPH, gem, kelp, type BigOpts } from './obj/plates';

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

/** v5's strip map of the level. v6 draws NO map (the journey has crossroads with signposts instead): only `name`,
 *  `floor` and `floors` are still read, as a fallback for HudData.area / HudData.stage. */
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
  /** health in the player's internal units (the old half hearts, 6 for a new blobfish); SHOWN as HP = units x HP_PER */
  hp: number; maxHp: number;
  /** extra blue shield units (shown as +HP in sea blue on the HP readout) */
  soul?: number;
  /** K's combat HUD: stamina, the healing clams (flasks / flasksMax / drinking), guard, parry flashes */
  combat?: PlayerCombatHud | null;
  mana?: number; maxMana?: number;
  pearls: number; keys: number; bombs: number;
  /** the pack's fill in cells */
  pack?: { used: number; total: number; full?: boolean };
  /** deprecated (v6 has no map): only its name / floor / floors are read when `area` / `stage` are not given */
  strip?: StripMap | null;
  /** the area's name for the navigation instrument ("Sunlit Reef") */
  area?: string;
  /** the stage gems: 1-based floor and the floor count */
  stage?: { floor: number; floors: number } | null;
  /** J6's journey place (v6 crossroads): the area, the stage, and the route taken at the last fork ('' = the main
   *  way). Read when `area` / `stage` are not given. */
  place?: { name: string; floor?: number; floors?: number; route?: string } | null;
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

// ------------------------------------------------------------------ pickup cards / title toasts
interface PickCard { id: string; title: string; sub: string; kind: string; color: string; t: number; life: number; y: number; model: THREE.Object3D }
interface Toast { title: string; sub: string; color: string; t: number; life: number; area?: boolean; banner?: 'danger' | 'gold'; landed?: boolean }
interface CodexNote { name: string; model: THREE.Object3D | null; t: number; y: number }
interface Roll { v: number; old: number; t: number; flash: number; delta: { n: number; t: number }[] }

// layout (D)
const M = 8;
const PR = 24;
/** the ability medallions: diameter, first centre x, spacing */
const MD = 46, HX = M + 25, HS = 51;

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
  private clam = new HealClam3D();
  /** the HP number as shown (counts up on a heal, drops on a hit) and its floating deltas */
  private hpShown = -1; private hpFlash = 0;
  private hpDeltas: { n: number; t: number }[] = [];
  /** the HP tube: shown fraction, the pale chip of what a hit took, the pink pour of a heal */
  private hpBar = 1; private hpChip = 1; private hpChipHold = 0; private hpPour = 0;
  /** the heal's sparkles flying from the clam to the HP tube */
  private healSparks: { t: number; x0: number; y0: number; x1: number; y1: number; arc: number }[] = [];
  private clamAt = { x: 0, y: 0 }; private hpAt = { x: 0, y: 0 };
  private lastFlasks = -1;
  /** the odometers' shown values (they roll toward the real ones) */
  private farShown = -1; private depthShown = -1;
  private models: Record<'pearls' | 'keys' | 'bombs' | 'pack', THREE.Object3D>;
  private gauge = new DepthGauge(PR);
  private cards: AbilityMedallion[] = [];
  private cardIds: string[] = [];
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
    S.ui.add(this.port.root, this.avatar.root, this.gauge.root, this.clam.root);
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
    const line = hpify(sub ?? (d ? (statLines(itemId, 1)[0]?.text ?? d.desc) : ''));
    const y0 = this.picks.length ? this.picks[this.picks.length - 1].y + 40 : 70;
    this.picks.push({ id: itemId, title: clean(name ?? d?.name ?? itemId), sub: clean(line), kind: d ? `${d.rarity} ${d.kind}`.toUpperCase() : '', t: 0, life: 3.8, color: col, y: y0, model });
  }
  /** bounce / flash a counter ('hp': the HP number flashes and the avatar gives a little hop) */
  flash(what: Counter) { this.pop[what] = 1; if (what !== 'hp') this.rolls[what].flash = 1; else this.hpFlash = 1; }

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
    // the death moment: the dark closes in from the edges, the porthole's glass cracks
    this.deathT = on && s.hp <= 0 && s.maxHp > 0 ? this.deathT + dt : 0;
    if (this.deathT > 0) this.planes.draw(vignette(pui.w, pui.h), 0, 0, { w: pui.w, h: pui.h, alpha: Math.min(0.9, this.deathT * 0.45), back: true });
    if (on) {
      const vit = this.vitals(ui, dt, s);
      if (this.deathT > 0.05) this.crack(ui, Math.min(1, this.deathT * 3));
      this.resources(ui, s, vit);
      const navL = this.nav(ui, dt, s, vit.right);
      this.topGap = [vit.right, navL];
      // the boss bar keeps clear of the hand of skill cards on narrow screens
      const last = (s.skills?.slots ?? []).reduce((a, sl, i) => (sl ? i : a), -1);
      this.bossBar(ui, dt, s.boss && s.boss.visible !== false ? s.boss : null, last >= 0 ? HX + last * HS + MD / 2 + 4 : 10);
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
      if (tot < ptot) {
        // a hit: the avatar squishes (harder for a bigger bite), the number drops at once and a -n floats off, the tube
        // keeps a pale chip of what was lost for a moment
        this.avatar.hurt((ptot - tot) / Math.max(1, s.maxHp) * 4); this.hurtT = 1;
        this.hpDeltas.push({ n: -(ptot - tot), t: 0 });
        const was = p.maxHp > 0 ? clamp01(p.hp / p.maxHp) : 0;
        this.hpChip = Math.max(this.hpChip, was); this.hpChipHold = 0.55; this.hpFlash = 0.7;
      } else if (s.hp > p.hp) {
        this.avatar.heal(); this.healT = 1;
        this.hpDeltas.push({ n: s.hp - p.hp, t: 0 }); this.hpPour = 1;
        // eating a clam: sparkles fly from the clam's alcove into the HP tube
        if ((s.combat?.drinking ?? 0) > 0 || (p.combat && s.combat && s.combat.flasks < p.combat.flasks)) this.spawnHealSparks();
      }
      if (s.combat?.lastParry && s.combat.lastParryAge < (p.combat?.lastParryAge ?? 99)) this.parryFlash = s.combat.lastParry === 'perfect' ? 1 : 0.5;
    }
    this.hurtT = Math.max(0, this.hurtT - dt * 1.6); this.healT = Math.max(0, this.healT - dt * 1.2);
    // the HP readout: the number counts up on a heal (drops at once on a hit), deltas float off, the tube eases
    const hpNow = Math.max(0, s.hp) * HP_PER;
    if (this.hpShown < 0 || hpNow < this.hpShown) this.hpShown = hpNow;
    else this.hpShown = Math.min(hpNow, this.hpShown + Math.max(1, (hpNow - this.hpShown) * 6) * dt * 6);
    for (const d of this.hpDeltas) d.t += dt;
    this.hpDeltas = this.hpDeltas.filter((d) => d.t < 1.2).slice(-3);
    this.hpFlash = Math.max(0, this.hpFlash - dt * 2.4);
    const hf = s.maxHp > 0 ? clamp01(Math.max(0, s.hp) / s.maxHp) : 0;
    if (hf < this.hpBar) this.hpBar = hf; else this.hpBar = lerp(this.hpBar, hf, 1 - Math.exp(-dt * 5));
    if (this.hpChipHold > 0) this.hpChipHold -= dt; else this.hpChip = Math.max(this.hpBar, this.hpChip - dt * 0.7);
    this.hpPour = Math.max(0, this.hpPour - dt * 1.4);
    for (const q of this.healSparks) q.t += dt;
    this.healSparks = this.healSparks.filter((q) => q.t < 0.9);
    // a clam came back (a new floor refills them): the clam hops
    const fl = s.combat?.flasks ?? -1;
    if (this.lastFlasks >= 0 && fl > this.lastFlasks) this.clam.pop();
    this.lastFlasks = fl;
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

  private deathT = 0;
  /** the porthole's glass cracking (k 0..1: the cracks running out from the hit point) */
  private crack(ui: DUi, k: number) {
    const cx = M + PR + 4 + 6, cy = M + PR + 3 - 7;
    const arms: [number, number][][] = [
      [[0, 0], [5, -3], [9, -2], [14, -7], [18, -9]], [[0, 0], [-4, -6], [-6, -11], [-11, -15]], [[0, 0], [-7, 2], [-12, 1], [-17, 5]],
      [[0, 0], [3, 6], [2, 11], [6, 16]], [[0, 0], [8, 4], [12, 9]], [[5, -3], [7, -8]], [[-7, 2], [-9, 7]],
    ];
    for (const arm of arms) {
      const n = Math.max(1, Math.round((arm.length - 1) * k));
      for (let i = 0; i < n; i++) {
        const [x0, y0] = arm[i], [x1, y1] = arm[i + 1];
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * ui.k;
        for (let j = 0; j <= steps; j++) {
          const x = ui.p(cx + x0 + (x1 - x0) * (j / steps)), y = ui.p(cy + y0 + (y1 - y0) * (j / steps));
          ui.ui.fill(x, y, 1, 1, '#ffffff', 0.85); ui.ui.fill(x + 1, y + 1, 1, 1, '#0a1a22', 0.6);
        }
      }
    }
    ui.ui.fill(ui.p(cx) - 1, ui.p(cy) - 1, 3, 3, '#ffffff', 0.9);
  }

  // ---------------------------------------------------------------- top left: the porthole + HP + stamina + the clam
  private spawnHealSparks() {
    const a = this.clamAt, b = this.hpAt;
    for (let i = 0; i < 9; i++) this.healSparks.push({ t: -i * 0.035, x0: a.x + (i % 3 - 1) * 3, y0: a.y - 2, x1: b.x - 30 + i * 7, y1: b.y, arc: 14 + (i % 4) * 5 });
  }

  private vitals(ui: DUi, dt: number, s: HudData): { right: number; bottom: number } {
    const S = this.stage, c = s.combat;
    const pc = { x: M + PR + 4, y: M + PR + 3 };
    // the porthole and the blobfish looking out of it: the avatar IS the health
    const units = Math.max(0, s.hp), maxU = Math.max(1, s.maxHp);
    const frac = clamp01(units / maxU);
    const crit = units > 0 && (frac <= 0.3 || units <= 1);
    this.avatar.update(dt, frac, crit);
    this.port.update(this.t, this.hurtT, this.healT, crit, ui.k);
    const shake = this.hurtT > 0.5 ? Math.sin(this.t * 60) * (this.hurtT - 0.5) * 3 : 0;
    S.put(this.port.root, pc.x + shake, pc.y, 0);
    this.avatar.root.scale.setScalar(23);
    S.put(this.avatar.root, pc.x + shake + 1, pc.y + 5, 10);
    // the board: HP readout + tubes, then the clam's alcove
    const hasStam = !!c && c.staminaMax > 0, hasMana = !!s.maxMana;
    const nF = c?.flasksMax ?? 0;
    const x0 = pc.x + PR + 9, y0 = pc.y - 23;
    const barW = 112;
    const ph = 42 + (hasMana ? 7 : 0);
    const aw = nF ? 40 : 0, ax = x0 + barW + 7;
    const right = (nF ? ax + aw : x0 + barW) + 8;
    const px0 = pc.x, pw = right - px0;
    this.planes.draw(plate(ui.p(pw), ui.p(ph), 'lacquer', { plank: 15 }), ui.p(px0), ui.p(y0), { shadow: 2 });
    this.shimmer(ui, px0, y0, pw, ph, 0);
    // --- the HP number: a little brass "HP" tag, the big rolling numeral, "/ max"
    const shown = Math.round(this.hpShown), maxShown = Math.round(maxU * HP_PER);
    const lowBlink = crit && Math.sin(this.t * 7.5) > 0;
    const numCol = units <= 0 ? PAL.coral : lowBlink ? PAL.coral2 : this.hpFlash > 0 ? lerpHex(PAL.cream, this.hpDeltas.some((d) => d.n > 0 && d.t < 0.8) ? '#ffb8e0' : PAL.coral2, this.hpFlash) : PAL.cream;
    const tagW = 15, ty = y0 + 4;
    this.planes.draw(plate(ui.p(tagW), ui.p(11), 'brass'), ui.p(x0 - 1), ui.p(ty + 2));
    ui.big('HP', x0 + tagW / 2 - 1, ty + 4.5, 5.5, { color: '#2a1608', outline: null, shadow: null, align: 'center' });
    const pop = this.pop.hp, cap = 13 * (1 + Math.sin(Math.min(1, pop) * Math.PI) * 0.12);
    const nx = x0 + tagW + 3;
    const nw = ui.big(String(shown), nx, ty - (cap - 13) / 2, cap, { color: numCol, color2: units > 0 && !crit ? '#fff8e8' : undefined });
    ui.big(`/${maxShown}`, nx + nw + 2, ty + 6, 6.5, { color: crit ? PAL.coral2 : PAL.dim });
    if (s.soul && s.soul > 0) { const sw2 = ui.bigW(`/${maxShown}`, 6.5); ui.big(`+${Math.round(s.soul * HP_PER)}`, nx + nw + 5 + sw2, ty + 6, 6.5, { color: PAL.sea2 }); }
    this.hpAt = { x: nx + nw / 2, y: ty + 14 };
    // the deltas float up off the number
    for (const d of this.hpDeltas) {
      const a = 1 - clamp01((d.t - 0.7) / 0.5), up = easeOut(d.t * 1.5) * 12;
      ui.big((d.n > 0 ? '+' : '') + Math.round(d.n * HP_PER), nx + nw + 30, ty + 3 - up, 7.5, { color: d.n > 0 ? '#ffb8e0' : PAL.coral, alpha: a, align: 'center' });
    }
    // --- the HP tube: coral liquid, a pale chip of the last hit, a pink pour while healing, a heartbeat when critical
    let yy = y0 + 20;
    const ticks = maxU > 1 && maxU <= 40 ? 1 / maxU : 0;
    tube(ui.ui, ui.p(x0 - 2), ui.p(yy), ui.p(barW + 4), Math.max(9, ui.p(10)), this.hpBar, {
      col: crit ? '#e8303a' : '#e0564a', chip: this.hpChip, ticks, t: this.t,
      gain: this.hpPour > 0 ? Math.min(1, this.hpBar + this.hpPour * 0.25) : undefined, gainCol: '#ff8ac0',
      flash: this.hurtT > 0.7 ? (this.hurtT - 0.7) * 2 : 0, pulse: crit ? Math.max(0, Math.sin(this.t * 7.5)) ** 4 : 0,
    });
    yy += 12;
    // --- stamina: teal, amber while regen waits, red guard-broken, white on a parry; a pale chip of what you spent
    if (hasStam && c) {
      const broken = c.guard === 'guardBroken' || (c.stamina <= 0 && Math.sin(this.t * 20) > 0);
      const col = broken ? PAL.coral : c.staminaDelay > 0 ? '#e8a818' : '#2ac8a0';
      const jig = c.guard === 'riposte' ? Math.round(Math.sin(this.t * 30)) * 0.5 : 0;
      tube(ui.ui, ui.p(x0 - 2), ui.p(yy + jig), ui.p(barW + 4), Math.max(7, ui.p(7)), this.stamShown, { col, chip: this.stamChip, flash: this.stamFlash, ticks: 0.25, t: this.t });
    }
    yy += 9;
    if (hasMana) tube(ui.ui, ui.p(x0 - 2), ui.p(yy), ui.p(barW + 4), Math.max(6, ui.p(6)), this.manaShown, { col: '#5a7aff', chip: this.manaChip, t: this.t + 3, crystal: true });
    // --- the HEALING CLAM in its alcove, the charge count, the [R] HEAL tag hanging under the board
    this.clam.root.visible = nF > 0;
    if (nF > 0 && c) {
      const ay = y0 + 3, ah = ph - 6;
      const eating = c.drinking > 0 && c.drinking < 1 ? c.drinking : 0;
      const has = c.flasks > 0;
      this.planes.draw(plate(ui.p(aw), ui.p(ah), 'alcove'), ui.p(ax), ui.p(ay));
      // the jelly's pink glow lights the hollow (and flares while eating)
      const glow = this.clam.glow * (eating ? 1 : 0.5);
      if (glow > 0.02) ui.fill(ax + 3, ay + 6, aw - 6, ah - 11, '#ff6aa8', glow * 0.22);
      this.clam.update(dt, { has, eating });
      this.clam.root.scale.setScalar(29);
      this.clam.root.rotation.set(0, 0, 0);
      const ccx = ax + aw / 2 - 4, ccy = ay + ah * 0.52;
      S.put(this.clam.root, ccx, ccy, 14);
      this.clamAt = { x: ccx, y: ccy - 6 };
      // the count: "x2" at the top right, coral when none are left
      const cnt = String(Math.max(0, c.flasks));
      const xw = ui.bigW('x', 5.5);
      ui.big('x', ax + 5, ay + 5, 5.5, { color: has ? PAL.dim : PAL.coral1 });
      ui.big(cnt, ax + 6 + xw, ay + 1.5, 9, { color: has ? PAL.cream : PAL.coral });
      // the charge pips down the alcove's right edge
      const pip = GLYPH.clamPip(), off = GLYPH.clamPipOff(), gs = Math.max(1, Math.round(ui.k));
      for (let i = 0; i < Math.min(nF, 4); i++) {
        const on = i < c.flasks, bounce = eating && i === c.flasks ? Math.sin(this.t * 20) * 0.6 : 0;
        ui.ui.img(on ? pip : off, ui.p(ax + aw - 3) - pip.width * gs, ui.p(ay + 13 + i * 6.5 + bounce), { w: pip.width * gs, h: pip.height * gs });
      }
      // the hanging tag: [R] HEAL on a brass plate on two cords
      const kw = ui.ui.keycapW(HEAL_ITEM.key) / ui.k;
      const lw = ui.bigW(HEAL_ITEM.verb, 6);
      const tw = kw + lw + 24, tx = ax + aw / 2 - tw / 2 - 2, tyy = y0 + ph + 3;
      for (const cx2 of [tx + 4, tx + tw - 5]) { ui.fill(cx2, y0 + ph - 1, 1, 4, '#2a1a0c'); ui.fill(cx2 + 1, y0 + ph - 1, 1, 4, '#c8a070'); }
      this.planes.draw(plate(ui.p(tw), ui.p(16), 'brass'), ui.p(tx), ui.p(tyy), { shadow: 1 });
      ui.ui.keycap(HEAL_ITEM.key, ui.p(tx + 3), ui.p(tyy + 1.5), false, eating > 0);
      ui.big(HEAL_ITEM.verb, tx + 6 + kw, tyy + 5, 6, { color: has ? '#2a1608' : '#7a3a2a', outline: null, shadow: null });
      if (!has && Math.sin(this.t * 3) > 0) ui.big('EMPTY', ax + aw / 2, ay + ah - 9, 4.5, { color: PAL.coral2, align: 'center' });
    }
    // the heal's sparkles: pink flecks arcing from the clam into the HP tube, twinkling as they land
    for (const q of this.healSparks) {
      if (q.t < 0) continue;
      const k = easeOut(q.t / 0.55), x = lerp(q.x0, q.x1, k), y = lerp(q.y0, q.y1, k) - Math.sin(k * Math.PI) * q.arc;
      const a = 1 - clamp01((q.t - 0.55) / 0.35);
      const big2 = q.t > 0.5 && q.t < 0.65;
      ui.fill(x - (big2 ? 1 : 0), y, big2 ? 3 : 1, 1, '#ffd8ec', a); ui.fill(x, y - (big2 ? 1 : 0), 1, big2 ? 3 : 1, '#ffd8ec', a);
      ui.fill(x, y, 1, 1, '#ffffff', a);
    }
    // bubbles drift up out of the porthole's top, wobbling, popping at the screen's edge
    for (let i = 0; i < 4; i++) {
      const ph2 = (this.t * 0.22 + i * 0.29) % 1;
      const bx = pc.x - 6 + i * 4 + Math.sin(this.t * 2.3 + i * 1.7) * 1.5, by = pc.y - PR - 2 - ph2 * (pc.y - PR + 6);
      const g = ph2 < 0.5 || i % 2 ? GLYPH.bubble() : GLYPH.bubbleS(), gs = Math.max(1, Math.round(ui.k));
      ui.ui.img(g, ui.p(bx), ui.p(by), { w: g.width * gs, h: g.height * gs, alpha: Math.min(1, (1 - ph2) * 1.6) * 0.9 });
    }
    // kelp hanging off the board's right end, swaying
    kelp(ui.ui, ui.p(right - 6), ui.p(y0 + ph - 2), Math.round(ui.p(10)), this.t, 0.7, 1);
    return { right, bottom: Math.max(y0 + ph + (nF ? 19 : 0), pc.y + PR + 4) };
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

  // ---------------------------------------------------------------- top right: the navigation instrument (no map)
  /**
   * an ODOMETER: `digits` number drums in a brass-lipped slot showing `v` (metres). The units drum turns smoothly
   * with the value; each higher drum turns only while every drum below it rolls over from 9 to 0, like a real one.
   */
  private odometer(ui: DUi, x: number, y: number, v: number, digits: number, cw: number, ch: number, cap: number, col: string) {
    const W = digits * cw;
    this.planes.draw(plate(ui.p(W + 4), ui.p(ch + 4), 'well', { face: '#2a1a0c' }), ui.p(x - 2), ui.p(y - 2));
    v = Math.max(0, v);
    for (let i = 0; i < digits; i++) {
      const pw = 10 ** i, lower = v % pw, step = Math.floor(v / pw) % 10;
      // the carry: this drum turns during the last metre of the drums below it
      const pos = i === 0 ? v % 10 : step + (lower > pw - 1 ? lower - (pw - 1) : 0);
      const d0 = Math.floor(pos) % 10, fr = pos - Math.floor(pos);
      const dx = x + (digits - 1 - i) * cw;
      this.planes.draw(plate(ui.p(cw), ui.p(ch), 'drum'), ui.p(dx), ui.p(y));
      const lead = i > 0 && v < pw - 0.5;
      ui.ui.clip(ui.p(dx) + 1, ui.p(y) + 1, ui.p(cw) - 2, ui.p(ch) - 2);
      const ty = y + (ch - cap) / 2 - 0.5;
      ui.big(String(d0), dx + cw / 2, ty - fr * ch, cap, { color: lead ? '#a08a64' : col, outline: null, shadow: null, align: 'center' });
      if (fr > 0.001) ui.big(String((d0 + 1) % 10), dx + cw / 2, ty + (1 - fr) * ch, cap, { color: lead ? '#a08a64' : col, outline: null, shadow: null, align: 'center' });
      ui.ui.unclip();
      // the drum's curve: shade rows at the top and bottom of the slot over the digits
      ui.fill(dx + 1, y + 1, cw - 2, 1, '#3a2410', 0.35); ui.fill(dx + 1, y + ch - 2, cw - 2, 1, '#3a2410', 0.45);
    }
    return W;
  }

  private nav(ui: DUi, dt: number, s: HudData, leftLimit: number): number {
    const d = s.depth ?? null;
    const far = s.far ?? (s.strip as { far?: number } | null | undefined)?.far;
    const area = (s.area ?? s.place?.name ?? s.strip?.name ?? '').toUpperCase();
    const stage = s.stage ?? (s.place?.floors ? { floor: s.place.floor ?? 1, floors: s.place.floors } : null) ?? (s.strip ? { floor: s.strip.floor, floors: s.strip.floors } : null);
    const route = (s.place?.route ?? '').toUpperCase();
    this.gauge.root.visible = !!d;
    if (!area && !d && far === undefined) return ui.w;
    const gc = { x: ui.w - M - PR - 4, y: M + PR + 3 };
    const x1 = d ? gc.x : ui.w - M;
    const cw = 8, ch = 13, dcap = 8.5;
    const farDig = Math.max(3, String(Math.round(far ?? 0)).length), depDig = Math.max(3, String(Math.round(d?.m ?? 0)).length);
    const g1 = GLYPH.house(), g2 = GLYPH.down(), gs = Math.max(1, Math.round(ui.k));
    // the readouts' widths decide the board's (a glyph, the drums, the unit)
    const unitW = ui.bigW('M', 6);
    const r1w = far !== undefined ? g1.width * gs / ui.k + 3 + farDig * cw + 3 + unitW : 0;
    const r2w = d ? g2.width * gs / ui.k + 3 + ui.bigW('-', 8) + 1 + depDig * cw + 3 + unitW : 0;
    const gemsW = stage && stage.floors > 0 ? stage.floors * 8 + ui.bigW(`${stage.floor}/${stage.floors}`, 6) + 12 : 0;
    const content = Math.max(r1w + (r1w && r2w ? 14 : 0) + r2w, (area ? ui.bigW(area, 6.5) + 26 : 0) + gemsW + 6);
    const NW = Math.max(150, Math.min(13 + content + (d ? PR + 9 : 8), 290, x1 - leftLimit - 24));
    const x0 = x1 - NW, y0 = gc.y - 23, h = 48;
    this.planes.draw(plate(ui.p(NW), ui.p(h), 'lacquer', { rope: [4], plank: 22 }), ui.p(x0), ui.p(y0), { shadow: 2 });
    this.shimmer(ui, x0, y0, NW, h, 3.1);
    const cr = d ? gc.x - PR - 9 : x1 - 8;
    const cl = x0 + 13;
    // row 1: the area's name on a brass plate, the stage gems + "1/3"
    if (area) {
      const aw = Math.min(ui.bigW(area, 6.5) + 26, cr - cl - gemsW + 3);
      this.planes.draw(plate(ui.p(aw), ui.p(14), 'brass'), ui.p(cl - 3), ui.p(y0 + 4));
      ui.ui.clip(ui.p(cl + 6), ui.p(y0 + 4), ui.p(aw - 18), ui.p(14));
      ui.big(area, cl + 9, y0 + 7.5, 6.5, { color: '#2a1608', outline: null, shadow: null });
      ui.ui.unclip();
      // the route taken at the last crossroads, as a little sign tag hung under the board
      if (route) {
        const rw2 = ui.bigW(route, 4.5) + 12, rx2 = cl + 4, ry2 = y0 + h + 1;
        for (const sx of [rx2 + 3, rx2 + rw2 - 4]) ui.fill(sx, y0 + h - 2, 0.5, 4, '#2a1a0c');
        this.planes.draw(plate(ui.p(rw2), ui.p(11), 'board', { barnacles: false, algae: false, plank: 11 }), ui.p(rx2), ui.p(ry2 + 1));
        ui.big(route, rx2 + 6, ry2 + 4, 4.5, { color: PAL.cream });
      }
    }
    if (stage && stage.floors > 0) {
      const st = `${stage.floor}/${stage.floors}`;
      const sw = ui.bigW(st, 6);
      ui.big(st, cr, y0 + 7, 6, { color: PAL.cream, align: 'right' });
      for (let i = 0; i < stage.floors; i++) {
        const px = cr - sw - 7 - (stage.floors - 1 - i) * 8, py = y0 + 10;
        const on = i < stage.floor, cur = i === stage.floor - 1;
        gem(ui.ui, ui.p(px), ui.p(py), Math.max(2, ui.p(cur ? 3.5 : 3)), cur ? '#f2c66d' : '#c8913a', on);
      }
    }
    // row 2: the odometers: metres FROM HOME, the DEPTH
    const ry = y0 + 22;
    let rx = cl - 1;
    if (far !== undefined) {
      this.farShown = this.farShown < 0 ? far : lerp(this.farShown, far, 1 - Math.exp(-dt * 4));
      ui.ui.img(g1, ui.p(rx), ui.p(ry + 1), { w: g1.width * gs, h: g1.height * gs });
      rx += g1.width * gs / ui.k + 3;
      const w = this.odometer(ui, rx, ry, this.farShown, farDig, cw, ch, dcap, '#2a1a0c');
      ui.big('M', rx + w + 3, ry + 5, 6, { color: PAL.cream });
      ui.big('FROM HOME', rx, ry + ch + 3, 4.5, { color: PAL.dim });
      rx += w + 3 + unitW + 14;
    }
    if (d) {
      this.depthShown = this.depthShown < 0 ? d.m : lerp(this.depthShown, d.m, 1 - Math.exp(-dt * 8));
      const dx = Math.max(rx, cr - (r2w - 2));
      ui.ui.img(g2, ui.p(dx), ui.p(ry + 3), { w: g2.width * gs, h: g2.height * gs });
      let ox = dx + g2.width * gs / ui.k + 3;
      ox += ui.big('-', ox, ry + 3, 8, { color: d.descending ? PAL.sea2 : PAL.cream }) + 1;
      const w = this.odometer(ui, ox, ry, this.depthShown, depDig, cw, ch, dcap, d.descending ? '#1d5a96' : '#2a1a0c');
      ui.big('M', ox + w + 3, ry + 5, 6, { color: PAL.cream });
      const zone = (d.zone ?? '').toUpperCase();
      ui.big(zone ? zone + ' ZONE' : 'DEPTH', ox, ry + ch + 3, 4.5, { color: d.descending ? PAL.sea2 : PAL.dim });
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
    if (n > 1) for (let i = 0; i < n; i++) { const px = cx + (i - (n - 1) / 2) * 10, pyy = py + 23; gem(ui.ui, ui.p(px), ui.p(pyy), Math.max(2, ui.p(3.5)), '#e0564a', i < ph); }
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

  // ---------------------------------------------------------------- bottom left: the ability medallions
  /**
   * the skills (keys 1-4) as round brass porthole MEDALLIONS (src/ui/obj/medallion.ts): per-skill art behind glass, a
   * clockwise wipe of dark water while cooling down with the seconds over it, a glint + ring pulse + bubble burst when
   * ready again, a keycap on the rim, a sink when its key is pressed, a brass halo on the selected one
   */
  private hand(ui: DUi, dt: number, sk: SkillHudState | null) {
    const ids = (sk?.slots ?? []).map((x) => x?.id ?? '');
    if (ids.join('|') !== this.cardIds.join('|')) {
      for (const c of this.cards) c.root.removeFromParent();
      this.cards = (sk?.slots ?? []).map((sl) => (sl ? new AbilityMedallion(sl.id, { d: MD, color: sl.color }) : null)).filter((c): c is AbilityMedallion => !!c);
      for (const c of this.cards) this.stage.ui.add(c.root);
      this.cardIds = ids;
    }
    if (!sk) return;
    let k = 0;
    sk.slots.forEach((sl, i) => {
      if (!sl) return;
      const c = this.cards[k++]; if (!c) return;
      const x = HX + i * HS, y = ui.h - MD / 2 - 9;
      const hov = ui.hover(x - MD / 2, y - MD / 2, MD, MD) ? 1 : 0;
      const cd = sl.cdMax > 0 ? clamp01(sl.cd / sl.cdMax) : 0;
      const noMana = sl.mana > sk.mana;
      const ready = cd <= 0 && !noMana;
      const pressed = !!ui.ui.input?.down.has('Digit' + (i + 1));
      c.update(dt, { hover: hov, cd, ready, selected: i === sk.sel, pressed, noMana });
      this.stage.put(c.root, x, y, 30);
      // the key on a keycap set into the rim (top left), the cooldown seconds big over the water, MANA when short
      const kw = ui.ui.keycapW(String(i + 1));
      const lift = i === sk.sel ? 4 : 0;
      ui.ui.keycap(String(i + 1), ui.p(x - MD * 0.36) - Math.round(kw / 2), ui.p(y - MD * 0.36 - lift) - 7, false, pressed);
      if (cd > 0) ui.big(String(Math.ceil(sl.cd)), x, y - 6, 12, { color: '#ffffff', color2: '#cfe8f0', align: 'center' });
      else if (noMana) ui.big('MANA', x, y - 2.5, 5, { color: PAL.sea2, align: 'center' });
      // the ready burst: kit bubbles rise off the rim the moment it comes back
      if (this.cdPrev[i] > 0 && cd <= 0) for (let b = 0; b < 5; b++) ui.ui.bubble(ui.p(x - 8 + b * 4), ui.p(y - MD / 2), { r: 1 + (b % 2), vy: -18 - b * 3 });
      this.cdPrev[i] = cd;
    });
  }
  private cdPrev: number[] = [0, 0, 0, 0];

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
    this.planes.draw(skin('paper', ui.p(cw), ui.p(ch), ui.ui.hd), ui.p(x), ui.p(y), { w: ui.p(cw), h: ui.p(ch), alpha: a, shadow: 2 });
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
        // a weathered plank swings down on two ropes across the upper screen, the name stamped into it letter by
        // letter, kelp hanging off it, the sub line on a dark strip under it
        // (below the top row of instruments and the resource strip)
        const cy = Math.max(ui.h * 0.3, 122), cap = 20;
        const tw = ui.bigW(c.title, cap);
        const pw = Math.min(ui.w - 24, tw + 96), phh = cap + 22;
        const drop = easeOutBack(c.t * 2.6), sw = Math.sin(c.t * 3.1) * Math.max(0, 1 - c.t) * 2.5;
        const px = ui.w / 2 - pw / 2 + sw, py = cy - 11 - (1 - drop) * 40 - outK * 8;
        const pa = clamp01(c.t * 5) * (1 - outK);
        // (planes drawn BEHIND the HUD's plates and cards, so the plank never covers an instrument)
        for (const rx of [px + 22, px + pw - 27]) for (let yy = 0; yy < py + 3; yy += 1) {
          const ph3 = Math.floor(yy * ui.k) % 4;
          ui.fill(rx, yy, 0.5, 1, '#2a1a0c', pa); ui.fill(rx + 0.5, yy, 2, 1, ph3 === 0 ? '#6a4a24' : ph3 === 1 ? '#f0d49a' : ph3 === 2 ? '#d8b878' : '#b08a52', pa);
        }
        this.planes.draw(plate(ui.p(pw), ui.p(phh), 'board', { rope: [ui.p(18), ui.p(pw) - ui.p(31)], plank: Math.round(ui.p(phh) / 2) }), ui.p(px), ui.p(py), { alpha: pa, back: true });
        this.planes.draw(solid('#000000'), ui.p(px + 3), ui.p(py + phh), { w: ui.p(pw - 6), h: ui.p(3), alpha: pa * 0.3, back: true });
        const chars = [...c.title];
        let lx = ui.w / 2 - tw / 2 + sw;
        chars.forEach((ch, i) => {
          const lt = c.t - 0.25 - i * 0.045;
          const k = clamp01(lt * 6);
          const w = ui.bigW(ch === ' ' ? 'I' : ch, cap) - 1 / ui.k;
          if (k > 0 && ch !== ' ') ui.big(ch, lx, py + (phh - cap) / 2 - 1 - (1 - easeOutBack(k)) * 14, cap, { color: c.color, color2: PAL.brass2, alpha: k * (1 - outK) });
          lx += ch === ' ' ? w * 0.7 : w;
        });
        // kelp hanging off the plank's ends, swaying
        if (pa > 0.05) { kelp(ui.ui, ui.p(px + 8), ui.p(py + phh - 3), ui.p(16), this.t, 0.3, pa); kelp(ui.ui, ui.p(px + pw - 10), ui.p(py + phh - 3), ui.p(11), this.t, 2.1, pa); }
        const sa = clamp01((c.t - 0.7) * 3) * (1 - outK);
        if (c.sub && sa > 0) {
          const sw2 = ui.bigW(c.sub, 6.5) + 20, sy = py + phh + 4;
          this.planes.draw(plate(ui.p(sw2), ui.p(14), 'well', { face: PAL.ink }), ui.p(ui.w / 2 - sw2 / 2), ui.p(sy), { alpha: sa * 0.95, back: true });
          ui.big(c.sub, ui.w / 2, sy + 3.5, 6.5, { color: PAL.cream, align: 'center', alpha: sa });
        }
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

/** a dark vignette (UI px): the deep closing in from the edges in five stepped bands, clear in the middle */
const vigCache = new Map<string, HTMLCanvasElement>();
function vignette(w: number, h: number): HTMLCanvasElement {
  const key = `${w}|${h}`;
  let c = vigCache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!, img = x.createImageData(w, h), D = img.data;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const dx = (px - w / 2) / (w * 0.62), dy = (py - h / 2) / (h * 0.66), d = Math.hypot(dx, dy) + Math.sin(px * 0.05 + py * 0.03) * 0.015;
    const band = Math.max(0, Math.min(5, Math.floor((d - 0.38) * 14)));
    const i = (py * w + px) * 4; D[i] = 2; D[i + 1] = 6; D[i + 2] = 12; D[i + 3] = [0, 60, 110, 160, 205, 240][band];
  }
  x.putImageData(img, 0, 0);
  vigCache.set(key, c);
  if (vigCache.size > 6) vigCache.clear();
  return c;
}
function lerpHex(a: string, b: string, t: number) {
  const A = new THREE.Color(a), B = new THREE.Color(b);
  return '#' + A.lerp(B, clamp01(t)).getHexString();
}
