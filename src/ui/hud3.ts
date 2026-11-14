// The dungeon-run HUD (v3, "UI as objects"): lit 3D miniatures on a stage inside the HUD's PixelUI layer
// (src/ui/obj/stage.ts), rendered after post so they are crisp and never fogged. Text only lives on plaques.
//
//   top left      HEALTH is a chibi of our blobfish (a real BlobModel) that bounces at full health, squishes
//                 and jiggles on hits, wears a plaster when low, sweats at one heart and glows when healed; next to
//                 it a row of wobbly pink JELLY HEARTS (full / half / empty glass) gives the exact count.
//                 STAMINA is a glass tube of glowing seawater that drains (amber while regen waits, red when
//                 guard-broken); MANA a cut-crystal vial; the kelp-tea FLASKS are real bottles that slosh and
//                 empty as they are drunk; PEARLS / KEYS / BOMBS are a turning pearl, a rusty key and a puffer bomb
//                 with their counts on little brass plaques; the PACK a leather pouch with cells used.
//   top right     the STRIP MAP: an old parchment strip-chart rolled between two brass rollers, inked with the
//                 level (explored stretch, upper lane, seabed, caves, POIs) and a red pin for you
//   bottom left   the SKILLS: a hand of physical cards (keys 1-4): sculpted rarity frames, photographed art, gems,
//                 a shadow sweeping over the art + a spinning sand-timer while on cooldown; they tilt toward the
//                 mouse and breathe on hover
//   bottom centre the BOSS plaque: an engraved bronze plaque with a red enamel health inlay, a pale damage chip,
//                 phase gems
//   centre        title cards and pickup streaks (the item's model turning on a ribbon)
//
// Usage (unchanged): const hud = new Hud(); overlays: [hud.layer]; hud.resize(w, h, pr);
//   hud.draw(dt, data, input)   or hud.drawInto(myUi, dt, data) inside your own ui.begin()/ui.end()
//   hud.title(name, sub) / hud.pickup(itemId) / hud.flash('pack' | 'pearls' | ...)
import * as THREE from 'three';
import { PixelUI } from './pixel/ui';
import type { Input } from '../core/input';
import type { PlayerCombatHud, BossBar } from '../combat/types';
import { ITEMS } from '../game/items';
import type { SkillHudState } from '../skills/hud';
import { UiStage, contactShadow } from './obj/stage';
import { BlobAvatar } from './obj/blobAvatar';
import { SkillCard3D } from './obj/cards';
import { hudModel, itemModel } from '../backpack/models';
import { hudArt } from './hudArt';
import { audio } from '../audio/audio';
import { drawText } from './pixel/font';

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
  /** the diving depth gauge: metres now, the deepest ever (red marker); floorMax = the dial's full scale */
  depth?: { m: number; record: number; floorMax?: number; floorTop?: number; floorBottom?: number; zone?: string; descending?: boolean } | null;
  /** hide everything but title cards (cutscenes) */
  hidden?: boolean;
}

const C = { white: '#f6f1e6', ink: '#06080e' };

/**
 * The HUD is laid out in a 360-row DESIGN space and drawn at the finer UI density (~540 rows): 3D pieces scale up
 * by k, 2D text stays at its native pixel size (so it reads finer and crisper), positions are multiplied by k.
 */
class DUi {
  k = 1;
  constructor(public ui: PixelUI) {}
  get w() { return this.ui.w / this.k; }
  get h() { return this.ui.h / this.k; }
  get mx() { return this.ui.mx / this.k; }
  get my() { return this.ui.my / this.k; }
  text(str: string, x: number, y: number, o: Parameters<PixelUI['text']>[3] = {}) { return this.ui.text(str, Math.round(x * this.k), Math.round(y * this.k), o) / this.k; }
  measure(str: string, f?: Parameters<PixelUI['measure']>[1]) { return this.ui.measure(str, f) / this.k; }
  img(c: HTMLCanvasElement, x: number, y: number, o?: Parameters<PixelUI['img']>[3]) { this.ui.img(c, Math.round(x * this.k), Math.round(y * this.k), o); }
  hover(x: number, y: number, w: number, h: number) { return this.ui.hover(x * this.k, y * this.k, w * this.k, h * this.k); }
}

/** an engraved brass page (canvas): polished band, an engraved border with corner rosettes, patina in the cuts */
function brassPage(w: number, h: number, label?: string): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = Math.max(4, Math.round(w)); cv.height = Math.max(4, Math.round(h));
  const x = cv.getContext('2d')!, W = cv.width, H = cv.height;
  const f = (px: number, py: number, ww: number, hh: number, c: string) => { x.fillStyle = c; x.fillRect(px, py, ww, hh); };
  f(0, 0, W, H, '#c88a2a');
  for (let yy = 0; yy < H; yy++) { const k = yy / H; f(0, yy, W, 1, k < 0.18 ? '#f0c060' : k < 0.3 ? '#e0a840' : k > 0.82 ? '#9a6418' : '#c88a2a'); }
  f(0, Math.round(H * 0.22), W, 1, '#fff0b0');
  f(0, 0, W, 1, '#5a3a0c'); f(0, H - 1, W, 1, '#3a2408'); f(0, 0, 1, H, '#5a3a0c'); f(W - 1, 0, 1, H, '#3a2408');
  if (W > 10 && H > 8) {
    for (let px = 3; px < W - 3; px++) { f(px, 2, 1, 1, px % 2 ? '#7a5010' : '#a87020'); f(px, H - 3, 1, 1, px % 2 ? '#7a5010' : '#a87020'); }
    for (let py = 3; py < H - 3; py++) { f(2, py, 1, 1, '#7a5010'); f(W - 3, py, 1, 1, '#7a5010'); }
    for (const [cx, cy] of [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]]) { f(cx - 1, cy, 3, 1, '#5a8a6a'); f(cx, cy - 1, 1, 3, '#5a8a6a'); f(cx, cy, 1, 1, '#fff0b0'); }
  }
  if (label) {
    drawText(x, label, W / 2 + 1, Math.round((H - 7) / 2) + 1, { font: 'small', color: '#fff0b0', shadow: null, align: 'center' });
    drawText(x, label, W / 2, Math.round((H - 7) / 2), { font: 'small', color: '#3a2008', shadow: null, align: 'center' });
  }
  return cv;
}
const brassTexCache = new Map<string, THREE.CanvasTexture>();
const drawTextWidth = (s: string) => { const c = document.createElement('canvas').getContext('2d')!; c.font = "16px 'M5x7'"; return Math.ceil(c.measureText(s).width); };
function brassTex(w: number, h: number, label?: string) {
  const k = `${w}|${h}|${label ?? ''}`;
  let t = brassTexCache.get(k);
  if (!t) { t = new THREE.CanvasTexture(brassPage(w, h, label)); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; brassTexCache.set(k, t); }
  return t;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
type Counter = 'pearls' | 'keys' | 'bombs' | 'pack' | 'hp';
interface Card { title: string; sub: string; icon?: string; t: number; life: number; color: string; model?: THREE.Object3D }

// ------------------------------------------------------------------ materials
const glassMat = () => new THREE.MeshStandardMaterial({ color: '#e8fbff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false });
const brassMat = new THREE.MeshStandardMaterial({ color: '#d8a038', roughness: 0.32, metalness: 0.75, flatShading: true });
const darkBrass = new THREE.MeshStandardMaterial({ color: '#6a4a1c', roughness: 0.5, metalness: 0.6, flatShading: true });
const bronzeMat = new THREE.MeshStandardMaterial({ color: '#9a6a3a', roughness: 0.38, metalness: 0.7, flatShading: true });
const grooveMat = new THREE.MeshStandardMaterial({ color: '#1a0c0a', roughness: 0.9 });

/** a heart split down the middle so halves can be full or empty */
function heartHalf(side: -1 | 1, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), mat); lobe.position.set(side * 0.2, 0.12, 0);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.55, 10, 1, false, side < 0 ? Math.PI : 0, Math.PI), mat);
  tip.position.set(0, -0.25, 0); tip.rotation.x = Math.PI; tip.scale.z = 0.7;
  const fillL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8, side < 0 ? Math.PI : 0, Math.PI), mat); fillL.position.set(0, 0.02, 0);
  g.add(lobe, tip, fillL);
  return g;
}
const jelly = new THREE.MeshStandardMaterial({ color: '#ff4a6a', roughness: 0.22, emissive: '#b01434', emissiveIntensity: 0.35 });
const jellySoul = new THREE.MeshStandardMaterial({ color: '#5a9aff', roughness: 0.22, emissive: '#1a3a9a', emissiveIntensity: 0.35 });
const jellyEmpty = new THREE.MeshStandardMaterial({ color: '#3a1a2a', roughness: 0.3, transparent: true, opacity: 0.75 });

class Heart3D {
  root = new THREE.Group();
  private L: THREE.Group; private R: THREE.Group;
  private state = '';
  bump = 0; flash = 0;
  constructor() { this.L = heartHalf(-1, jelly); this.R = heartHalf(1, jelly); this.root.add(this.L, this.R); const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' })); s.position.set(-0.24, 0.22, 0.22); s.name = 'shine'; this.root.add(s); }
  set(l: THREE.Material, r: THREE.Material) {
    const k = (l as THREE.MeshStandardMaterial).uuid + (r as THREE.MeshStandardMaterial).uuid;
    if (k === this.state) return; this.state = k;
    this.L.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = l; });
    this.R.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = r; });
    (this.root.getObjectByName('shine') as THREE.Mesh).visible = l !== jellyEmpty;
  }
}

/** a horizontal glass tube with a glowing liquid inside (stamina: seawater; mana: a cut-crystal vial) */
class Tube3D {
  root = new THREE.Group();
  private liquid: THREE.Mesh; private chip: THREE.Mesh; private liqMat: THREE.MeshStandardMaterial; private meniscus!: THREE.Mesh;
  private bubbles: THREE.Mesh[] = [];
  readonly len: number; private r: number;
  constructor(len: number, r: number, color: string, crystal = false) {
    this.len = len; this.r = r;
    const sides = crystal ? 6 : 10;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, sides, 1, true), glassMat()); glass.rotation.z = Math.PI / 2;
    this.liqMat = new THREE.MeshStandardMaterial({ color, roughness: 0.25, emissive: color, emissiveIntensity: 0.35, flatShading: crystal });
    this.liquid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.78, 1, sides), this.liqMat); this.liquid.rotation.z = Math.PI / 2;
    this.meniscus = new THREE.Mesh(new THREE.SphereGeometry(r * 0.78, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, transparent: true, opacity: 0.55, emissive: color, emissiveIntensity: 0.4 }));
    this.meniscus.rotation.z = -Math.PI / 2; this.meniscus.scale.y = 0.35; this.root.add(this.meniscus);
    this.chip = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.76, r * 0.76, 1, sides), new THREE.MeshStandardMaterial({ color: '#fff4d8', emissive: '#fff0c0', emissiveIntensity: 0.5, transparent: true, opacity: 0.7 })); this.chip.rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) {
      const cap = new THREE.Mesh(crystal ? new THREE.ConeGeometry(r * 1.25, r * 2.2, 6) : new THREE.CylinderGeometry(r * 1.3, r * 1.3, r * 1.4, 12), crystal ? new THREE.MeshStandardMaterial({ color: '#a8a0ff', roughness: 0.15, flatShading: true, emissive: '#5a4ad0', emissiveIntensity: 0.4 }) : new THREE.MeshStandardMaterial({ map: brassTex(24, 8), roughness: 0.35, metalness: 0.6 }));
      cap.rotation.z = sx * Math.PI / 2; cap.position.x = sx * (len / 2 + (crystal ? r * 0.9 : r * 0.45));
      this.root.add(cap);
      if (!crystal) {
        // a collar band and a domed screw cap with a rivet
        const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.32, r * 0.18, 4, 14), brassMat); band.rotation.y = Math.PI / 2; band.position.x = sx * (len / 2 - r * 0.15); this.root.add(band);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 1.0, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), brassMat); dome.rotation.z = -sx * Math.PI / 2; dome.position.x = sx * (len / 2 + r * 1.15); dome.scale.y = 0.5; this.root.add(dome);
      }
    }
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 5, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 })); this.bubbles.push(b); this.root.add(b); }
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, len, sides), new THREE.MeshStandardMaterial({ color: '#0c1a24', roughness: 0.6 })); inner.rotation.z = Math.PI / 2; inner.position.z = -r * 0.2;
    const shine = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, r * 0.22, 0.2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 })); shine.position.set(0, r * 0.55, r * 0.9);
    this.root.add(inner, this.liquid, this.chip, glass, shine);
  }
  update(t: number, v: number, chip: number, color?: string) {
    if (color) { this.liqMat.color.set(color); this.liqMat.emissive.set(color); }
    const L = this.len, w = Math.max(0.001, L * clamp01(v)), cw = Math.max(0.001, L * clamp01(chip));
    this.liquid.scale.y = w; this.liquid.position.x = -L / 2 + w / 2; this.liquid.visible = v > 0.002;
    this.meniscus.visible = v > 0.01 && v < 0.995; this.meniscus.position.x = -L / 2 + w + Math.sin(t * 9) * 0.15;
    this.chip.scale.y = Math.max(0.001, cw - w); this.chip.position.x = -L / 2 + w + (cw - w) / 2; this.chip.visible = cw > w + 0.3;
    this.bubbles.forEach((b, i) => { const k = (t * 0.35 + i * 0.27) % 1; b.position.set(-L / 2 + ((i * 0.31 + t * 0.05) % 1) * w, (k - 0.5) * this.r * 1.2, this.r * 0.2); b.visible = v > 0.05; });
  }
}

/** a kelp-tea bottle that sloshes and empties */
class Flask3D {
  root = new THREE.Group();
  private liq: THREE.Mesh; private surf: THREE.Mesh;
  private full = 1; private slosh = 0; private t = Math.random() * 6;
  constructor() {
    const prof = [[0, -0.42], [0.3, -0.38], [0.36, -0.1], [0.28, 0.16], [0.12, 0.26], [0.12, 0.42], [0, 0.42]].map(([r, y]) => new THREE.Vector2(r, y));
    const glass = new THREE.Mesh(new THREE.LatheGeometry(prof, 10), glassMat());
    this.liq = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7), new THREE.MeshStandardMaterial({ color: '#3a9a1a', roughness: 0.2, emissive: '#2a8a14', emissiveIntensity: 0.45 }));
    this.liq.position.y = -0.1;
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.14, 8), new THREE.MeshStandardMaterial({ color: '#b07a44', roughness: 0.9, flatShading: true })); cork.position.y = 0.48;
    this.surf = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), new THREE.MeshStandardMaterial({ color: '#8ae860', roughness: 0.15, emissive: '#4ab830', emissiveIntensity: 0.5, side: THREE.DoubleSide }));
    this.surf.rotation.x = -Math.PI / 2;
    const lc = document.createElement('canvas'); lc.width = 24; lc.height = 10; const lx = lc.getContext('2d')!;
    lx.fillStyle = '#efe0b8'; lx.fillRect(0, 0, 24, 10); lx.fillStyle = '#b89a6a'; lx.fillRect(0, 0, 24, 1); lx.fillRect(0, 9, 24, 1);
    lx.fillStyle = '#3a8a2a'; lx.fillRect(10, 2, 4, 6); lx.fillRect(9, 3, 1, 3); lx.fillRect(14, 3, 1, 3); lx.fillStyle = '#1a4a14'; lx.fillRect(11, 3, 1, 5);
    const lt = new THREE.CanvasTexture(lc); lt.magFilter = THREE.NearestFilter; lt.minFilter = THREE.NearestFilter; lt.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.18, 12, 1, true, -0.9, 1.8), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.9, side: THREE.DoubleSide }));
    label.position.y = -0.08;
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 4, 10), new THREE.MeshStandardMaterial({ color: '#c8a060', roughness: 0.9 })); tie.rotation.x = Math.PI / 2; tie.position.y = 0.32;
    this.root.add(this.liq, this.surf, glass, label, cork, tie);
  }
  update(dt: number, level: number) {
    this.t += dt;
    if (Math.abs(level - this.full) > 0.01) this.slosh = 1;
    this.full += (level - this.full) * Math.min(1, dt * 6);
    this.slosh = Math.max(0, this.slosh - dt * 1.5);
    this.liq.visible = this.full > 0.03;
    this.liq.scale.set(1, Math.max(0.05, this.full), 1);
    this.liq.position.y = -0.36 + this.full * 0.26;
    this.surf.visible = this.full > 0.05 && this.full < 0.98;
    this.surf.position.y = -0.4 + this.full * 0.5; this.surf.scale.setScalar(0.6 + Math.sin(Math.min(1, this.full) * Math.PI) * 0.45);
    this.root.rotation.z = Math.sin(this.t * 7) * 0.18 * this.slosh + Math.sin(this.t * 1.3) * 0.03;
    this.liq.rotation.z = -this.root.rotation.z * 1.6;
  }
}

/** a little brass plaque the counts are printed on (the number itself is 2D text on top) */
function plaque(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), [brassMat, brassMat, brassMat, brassMat, new THREE.MeshStandardMaterial({ map: brassTex(w * 2, h * 2), roughness: 0.4, metalness: 0.5 }), brassMat]); g.add(p);
  const inset = new THREE.Mesh(new THREE.BoxGeometry(w - 5, h - 5, 0.6), darkBrass); inset.position.z = 1.1; g.add(inset);
  for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 4), brassMat); r.position.set(sx * (w / 2 - 1.6), 0, 1.2); g.add(r); }
  return g;
}

// ------------------------------------------------------------------ the strip map: parchment between brass rollers
class ScrollMap {
  root = new THREE.Group();
  cv = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private paper: THREE.Mesh;
  private rollers: THREE.Group[] = [];
  private W = 0; private H = 0; private res = 1;
  private plate: THREE.Mesh; private plateName = '';
  constructor() {
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.colorSpace = THREE.SRGBColorSpace;
    this.paper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 12, 1), new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.95 }));
    this.root.add(this.paper);
    this.plate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1.6), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.5 }));
    this.root.add(this.plate);
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1, 10), new THREE.MeshStandardMaterial({ color: '#d8c49a', roughness: 0.9, flatShading: true }));
      r.add(rod);
      for (const sy of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 2.4, 10), brassMat); cap.position.y = sy * 0.5; cap.name = 'cap'; r.add(cap); const knob = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), brassMat); knob.name = 'knob'; r.add(knob); }
      this.rollers.push(r); this.root.add(r);
    }
  }
  /** the area name engraved on a brass plate riveted to the top of the left roller */
  setName(name: string, k: number) {
    if (name === this.plateName) return;
    this.plateName = name;
    const tw = Math.ceil((drawTextWidth(name) + 12) / k), th = Math.ceil(13 / k);
    const m = this.plate.material as THREE.MeshStandardMaterial;
    m.map = brassTex(Math.round(tw * k), Math.round(th * k), name); m.needsUpdate = true;
    this.plate.scale.set(tw, th, 1);
    this.plate.position.set(-this.W / 2 + tw / 2 - 2, this.H / 2 + th / 2 + 1, 3);
  }
  layout(W: number, H: number, res = 1) {
    if (W === this.W && H === this.H && res === this.res) return;
    this.W = W; this.H = H; this.res = res; this.plateName = '';
    this.cv.width = Math.round(W * res); this.cv.height = Math.round(H * res);
    this.tex.dispose(); this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.colorSpace = THREE.SRGBColorSpace;
    (this.paper.material as THREE.MeshStandardMaterial).map = this.tex;
    // the paper bows slightly toward the viewer in the middle and curls into the rollers
    const g = new THREE.PlaneGeometry(W, H, 16, 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) / (W / 2); pos.setZ(i, (1 - x * x) * 2.5 - (Math.abs(x) > 0.92 ? 3 : 0)); }
    g.computeVertexNormals();
    this.paper.geometry.dispose(); this.paper.geometry = g;
    this.rollers.forEach((r, i) => {
      r.position.set((i ? 1 : -1) * (W / 2 + 1), 0, 0);
      const rod = r.children[0]; rod.scale.y = H + 4;
      r.children.forEach((c) => { if (c.name === 'cap') c.position.y = Math.sign(c.position.y || 1) * (H / 2 + 3); if (c.name === 'knob') c.position.y = (c.id % 2 ? 1 : -1) * (H / 2 + 5.5); });
    });
    let k = 0; for (const r of this.rollers) r.children.forEach((c) => { if (c.name === 'knob') { c.position.y = (k++ % 2 ? 1 : -1) * (H / 2 + 5.5); } });
  }
  draw(m: StripMap, t: number) {
    const x = this.cv.getContext('2d')!, W = this.cv.width, H = this.cv.height;
    const f = (px: number, py: number, w: number, h: number, c: string, a = 1) => { x.globalAlpha = a; x.fillStyle = c; x.fillRect(Math.round(px), Math.round(py), Math.round(w), Math.round(h)); x.globalAlpha = 1; };
    const L = Math.max(1e-6, m.length);
    const X = (v: number) => 2 + Math.round(clamp01(v / L) * (W - 5));
    // parchment: laid lines, fibres, a couple of tea stains, scorched edges
    f(0, 0, W, H, '#e8d4a6');
    for (let yy = 0; yy < H; yy += 3) f(0, yy, W, 1, '#e0c898', 0.5);
    for (let i = 0; i < W * 0.6; i++) { const fx = (i * 37) % W, fy = (i * 53) % H; f(fx, fy, 2 + (i % 3), 1, i % 2 ? '#d8c090' : '#f2e2bc', 0.7); }
    for (const [sx, sy, sr] of [[W * 0.18, H * 0.3, 6], [W * 0.66, H * 0.7, 8]]) { x.globalAlpha = 0.18; x.strokeStyle = '#8a5a20'; x.beginPath(); x.ellipse(sx, sy, sr, sr * 0.6, 0, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 0.08; x.fillStyle = '#a07030'; x.fill(); x.globalAlpha = 1; }
    f(0, 0, W, 1, '#c8a870'); f(0, H - 1, W, 1, '#a88a58');
    // water (light wash), upper lanes, seabed, caves, in ink tones
    for (const ln of m.lanes ?? []) if (ln.kind === 'upper') f(X(ln.x0), 2, X(ln.x1) - X(ln.x0), 6, '#b8d0c8', 0.8);
    const sb = m.seabed ?? [0.72];
    const bedAt = (cx: number) => { const tt = clamp01(cx / Math.max(1, W - 1)) * (sb.length - 1); const i = Math.floor(tt), fr = tt - i; return lerp(sb[i], sb[Math.min(sb.length - 1, i + 1)], fr); };
    let prev = -1;
    for (let cx = 1; cx < W - 1; cx++) {
      const by = Math.round(clamp01(bedAt(cx)) * (H - 2));
      f(cx, by + 1, 1, H - by - 2, '#c8ac78', 0.9);
      if (prev >= 0) f(cx, Math.min(prev, by), 1, Math.abs(prev - by) + 1, '#5a3a1a');
      prev = by;
    }
    for (const ln of m.lanes ?? []) if (ln.kind === 'cave') for (let cx = X(ln.x0); cx <= X(ln.x1); cx++) { const by = Math.round(clamp01(bedAt(cx)) * (H - 2)); const top = by + 3, bot = H - 3; if (bot > top) { f(cx, Math.round((top + bot) / 2), 1, 2, '#3a2410'); if (cx % 3 === 0) f(cx, top, 1, 1, '#7a5a3a'); } }
    // fog: unexplored stretches hatched in faded ink
    const spans = [...m.explored].sort((a, b) => a[0] - b[0]);
    let cur = 0;
    const fog = (a: number, b: number) => { if (b <= a) return; const xa = X(a), xb = X(b); f(xa, 1, xb - xa + 1, H - 2, '#d8c090', 0.85); for (let cx = xa; cx < xb; cx += 4) f(cx, 2 + ((cx / 4) % 3) * 3, 2, 1, '#a88a58', 0.6); };
    for (const [a, b] of spans) { if (a > cur) fog(cur, a); cur = Math.max(cur, b); }
    if (cur < L) fog(cur, L);
    // POIs as inked glyphs
    const defY: Record<PoiType, number> = { treasure: 0.62, shop: 0.5, post: 0.45, challenge: 0.5, secret: 0.8, boss: 0.5, arena: 0.5, start: 0.5 };
    const glyph: Record<PoiType, string> = { treasure: 'mTreasure', shop: 'mShop', post: 'mPost', challenge: 'mChallenge', secret: 'mSecret', boss: 'mBoss', arena: 'mArena', start: 'mStart' };
    for (const p of m.pois) {
      const known = p.known !== false;
      const ic = hudArt(known ? glyph[p.type] : 'mSecret');
      const gx = Math.max(1, Math.min(W - ic.width - 1, X(p.x) - Math.floor(ic.width / 2)));
      const gy = Math.max(1, Math.min(H - ic.height - 1, Math.round(clamp01(p.y ?? defY[p.type]) * (H - 1)) - Math.floor(ic.height / 2)));
      if (p.type === 'boss') f(gx - 1, 1, 1, H - 2, '#8a1424');
      x.globalAlpha = !known ? 0.5 : p.done ? 0.4 : 1; x.drawImage(ic, gx, gy); x.globalAlpha = 1;
    }
    // you: a red pin with a pulse ring
    const plx = X(m.player), ply = Math.round(clamp01(m.playerY ?? 0.5) * (H - 1));
    const pr = 3 + Math.round((Math.sin(t * 5) * 0.5 + 0.5) * 2);
    x.strokeStyle = '#c8202a'; x.globalAlpha = 0.5; x.beginPath(); x.arc(plx + 0.5, ply + 0.5, pr, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1;
    f(plx - 1, ply - 1, 3, 3, '#c8202a'); f(plx - 1, ply - 1, 1, 1, '#ff8a8a');
    // a torn-edge vignette
    for (let cx = 0; cx < W; cx += 2) { f(cx, 0, 1, 1 + ((cx * 7) % 3 === 0 ? 1 : 0), '#a88a58', 0.6); f(cx, H - 1 - ((cx * 5) % 3 === 0 ? 1 : 0), 1, 1, '#8a6a3a', 0.6); }
    this.tex.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ the boss plaque
class BossPlaque {
  root = new THREE.Group();
  private hp: THREE.Mesh; private chip: THREE.Mesh; private gems: THREE.Mesh[] = []; private gemOn: THREE.MeshStandardMaterial; private gemOff: THREE.MeshStandardMaterial;
  private poise: THREE.Mesh;
  W = 0;
  constructor() {
    this.hp = new THREE.Mesh(new THREE.BoxGeometry(1, 5, 1.6), new THREE.MeshStandardMaterial({ color: '#c8182a', roughness: 0.25, emissive: '#7a0a14', emissiveIntensity: 0.5 }));
    this.chip = new THREE.Mesh(new THREE.BoxGeometry(1, 5, 1.4), new THREE.MeshStandardMaterial({ color: '#ffe0b0', emissive: '#ffc880', emissiveIntensity: 0.6 }));
    this.poise = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffd860', emissive: '#c89020', emissiveIntensity: 0.5 }));
    this.gemOn = new THREE.MeshStandardMaterial({ color: '#ff5a4a', roughness: 0.12, flatShading: true, emissive: '#ff2a1a', emissiveIntensity: 0.9 });
    this.gemOff = new THREE.MeshStandardMaterial({ color: '#3a1a1a', roughness: 0.3, flatShading: true });
  }
  layout(W: number) {
    if (W === this.W) return; this.W = W;
    for (const c of [...this.root.children]) this.root.remove(c);
    const sh = new THREE.Shape(); const w = W + 20, h = 16, r = 6;
    sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.lineTo(w / 2, 0); sh.lineTo(w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2); sh.lineTo(-w / 2, 0); sh.lineTo(-w / 2 + r, -h / 2);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.2, bevelSegments: 1 }), bronzeMat);
    body.position.z = -2;
    const groove = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 7, 1), grooveMat); groove.position.z = 2.2;
    this.root.add(body, groove, this.chip, this.hp, this.poise);
    this.hp.position.z = 2.6; this.chip.position.z = 2.5; this.poise.position.set(0, -6.5, 2.6);
    for (const sx of [-1, 1]) { const g = new THREE.Mesh(new THREE.OctahedronGeometry(4, 0), this.gemOn); g.position.set(sx * (W / 2 + 6), 0, 2.5); g.scale.z = 0.6; this.root.add(g); }
    this.gems = [];
  }
  update(dt: number, shown: number, chip: number, flash: number, b: BossBar) {
    const W = this.W;
    const fw = Math.max(0.001, W * shown), cw = Math.max(0.001, W * chip);
    this.hp.scale.x = fw; this.hp.position.x = -W / 2 + fw / 2; this.hp.visible = shown > 0.001;
    this.chip.scale.x = Math.max(0.001, cw - fw); this.chip.position.x = -W / 2 + fw + (cw - fw) / 2; this.chip.visible = cw > fw + 0.5;
    (this.hp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + flash * 1.5;
    const po = clamp01(b.poise ?? 1); this.poise.scale.set(Math.max(0.001, W * po), 1, 1); this.poise.position.x = -W / 2 + (W * po) / 2; this.poise.visible = po < 0.999;
    const n = Math.max(1, b.phases ?? 1), ph = Math.max(1, Math.min(n, b.phase ?? 1));
    while (this.gems.length < n) { const g = new THREE.Mesh(new THREE.OctahedronGeometry(2.6, 0), this.gemOff); g.scale.z = 0.6; this.root.add(g); this.gems.push(g); }
    this.gems.forEach((g, i) => { g.visible = i < n && n > 1; g.position.set((i - (n - 1) / 2) * 9, -10, 2.6); g.material = i < ph ? this.gemOn : this.gemOff; g.rotation.y += dt * (i < ph ? 1.4 : 0.2); });
  }
}

// ------------------------------------------------------------------ the brass diving depth gauge
class DepthGauge {
  root = new THREE.Group();
  private face: THREE.Mesh; private faceCv = document.createElement('canvas'); private faceTex: THREE.CanvasTexture;
  private needle = new THREE.Group(); private rec = new THREE.Group(); private glint: THREE.Mesh;
  private ang = 0; private angV = 0; private scaleMax = 0; private faceRes = 0; private lastTen = -1; private prevM = 0;
  readonly R = 24;
  constructor() {
    const R = this.R;
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(R + 1.5, 3, 6, 28), brassMat);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(R + 3, R + 3, 5, 28), darkBrass); back.rotation.x = Math.PI / 2; back.position.z = -3;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const b = new THREE.Mesh(new THREE.SphereGeometry(1.1, 6, 4), brassMat); b.position.set(Math.cos(a) * (R + 1.5), Math.sin(a) * (R + 1.5), 2.6); this.root.add(b); }
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 5, 8), brassMat); crown.position.set(0, R + 6, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 1.1, 4, 10), brassMat); ring.position.set(0, R + 11, 0);
    this.faceCv.width = this.faceCv.height = R * 2;
    this.faceRes = 1;
    this.faceTex = new THREE.CanvasTexture(this.faceCv); this.faceTex.magFilter = THREE.NearestFilter; this.faceTex.minFilter = THREE.NearestFilter; this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.face = new THREE.Mesh(new THREE.CircleGeometry(R, 28), new THREE.MeshStandardMaterial({ map: this.faceTex, roughness: 0.7 }));
    this.face.position.z = 0.5;
    // the needle: a black arrow with a red tip, a brass hub
    const nm = new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.5, flatShading: true });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.4, R * 0.82, 0.8), nm); shaft.position.y = R * 0.32;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5, 4), new THREE.MeshStandardMaterial({ color: '#d02020', roughness: 0.4, flatShading: true })); tip.position.y = R * 0.76;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5, 0.8), nm); tail.position.y = -3.5;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 2, 10), brassMat); hub.rotation.x = Math.PI / 2;
    this.needle.add(shaft, tip, tail, hub); this.needle.position.z = 2.2;
    // the record marker: a little red flag on the rim
    const rm = new THREE.Mesh(new THREE.ConeGeometry(2, 4.5, 3), new THREE.MeshStandardMaterial({ color: '#e83030', emissive: '#801010', emissiveIntensity: 0.5, flatShading: true }));
    rm.position.y = R - 2.5; rm.rotation.z = Math.PI; this.rec.add(rm); this.rec.position.z = 1.4;
    // the glass cover with a moving glint
    const glass = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 6, 0, Math.PI * 2, 0, Math.PI * 0.18), new THREE.MeshStandardMaterial({ color: '#e8f8ff', roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }));
    glass.rotation.x = Math.PI / 2; glass.scale.set(1, 0.35, 1); glass.position.z = -R * 0.3 + 3;
    this.glint = new THREE.Mesh(new THREE.PlaneGeometry(3, R * 1.1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
    this.glint.position.set(-6, 4, 4.5); this.glint.rotation.z = -0.6;
    this.root.add(back, bezel, crown, ring, this.face, this.rec, this.needle, glass, this.glint);
  }
  /** the engraved face: metre scale on a 270-degree sweep, major ticks with numbers, minor ticks */
  private paintFace(max: number, res: number) {
    const S = Math.round(this.R * 2 * res), R = S / 2;
    if (this.faceCv.width !== S) { this.faceCv.width = this.faceCv.height = S; this.faceTex.dispose(); this.faceTex = new THREE.CanvasTexture(this.faceCv); this.faceTex.magFilter = THREE.NearestFilter; this.faceTex.minFilter = THREE.NearestFilter; this.faceTex.colorSpace = THREE.SRGBColorSpace; (this.face.material as THREE.MeshStandardMaterial).map = this.faceTex; (this.face.material as THREE.MeshStandardMaterial).needsUpdate = true; }
    const c = this.faceCv.getContext('2d')!;
    c.fillStyle = '#ece0c4'; c.fillRect(0, 0, S, S);
    const g = c.createRadialGradient(R - 6, R - 8, 2, R, R, R); g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(90,60,30,0.35)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    const at = (k: number, r: number): [number, number] => { const a = (-135 + 270 * k) * Math.PI / 180; return [R + Math.sin(a) * r, R - Math.cos(a) * r]; };
    const step = max <= 60 ? 5 : max <= 150 ? 10 : max <= 400 ? 25 : 50;
    for (let v = 0; v <= max + 0.01; v += step / 5) {
      const k = v / max, major = Math.abs(v / step - Math.round(v / step)) < 0.01;
      const [x0, y0] = at(k, R - 2), [x1, y1] = at(k, R - (major ? 6 : 4));
      c.strokeStyle = major ? '#1a1008' : '#6a5440'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.fillStyle = '#7a1414'; c.beginPath(); c.arc(R, R, R - 3, (-45) * Math.PI / 180, (45) * Math.PI / 180); c.arc(R, R, R - 5, (45) * Math.PI / 180, (-45) * Math.PI / 180, true); c.fill();
    for (const k of [0, 0.5, 1]) { const [x, y] = at(k, R - 15); drawText(c, String(Math.round(max * k)), x, y - 4, { font: 'small', color: '#1a1008', shadow: null, align: 'center' }); }
    drawText(c, 'DEPTH', R, R + 9, { font: 'small', color: '#6a5440', shadow: null, align: 'center' });
    // the maker's engraved ring and a hairline inner bezel
    c.strokeStyle = '#8a7050'; c.lineWidth = 1; c.beginPath(); c.arc(R, R, R - 1.5, 0, Math.PI * 2); c.stroke();
    this.faceTex.needsUpdate = true;
  }
  update(dt: number, t: number, d: NonNullable<HudData['depth']>, res = 1) {
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
    this.glint.position.x = -6 + Math.sin(t * 0.5) * 3;
    const ten = Math.floor(d.m / 10);
    if (this.lastTen >= 0 && ten !== this.lastTen && audio.has('k_tick1')) audio.play('k_tick1', { vol: 0.25, dry: true, rate: 0.7 + Math.min(1, d.m / 1000) * 0.6 });
    this.lastTen = ten;
  }
}

export class Hud {
  ui = new PixelUI();
  get layer(): { scene: THREE.Scene; camera: THREE.Camera } { return this.ui.layer; }
  stage = new UiStage();
  private t = 0;
  private prev: HudData | null = null;
  private avatar = new BlobAvatar();
  private avatarShadow = contactShadow(40, 9, 0.4);
  private hearts: Heart3D[] = [];
  private heartBump: number[] = [];
  private stamina = new Tube3D(64, 3.6, '#18c8a0');
  private mana = new Tube3D(48, 3, '#4a5aff', true);
  private flasks: Flask3D[] = [];
  private counters: Record<'pearls' | 'keys' | 'bombs', { m: THREE.Object3D; p: THREE.Group }>;
  private pouch = itemModel('cutpursePouch');
  private scroll = new ScrollMap();
  private boss = new BossPlaque();
  private gauge = new DepthGauge();
  private gaugePlaque = plaque(40, 14);
  private cards: SkillCard3D[] = [];
  private cardIds: string[] = [];
  private ribbon = new THREE.Group();
  private stamShown = 1; private stamChip = 1; private stamChipHold = 0;
  private manaShown = 0;
  private bossShown = 1; private bossChip = 1; private bossChipHold = 0; private bossFlash = 0; private bossIn = 0; private bossName = '';
  private pop: Record<Counter, number> = { pearls: 0, keys: 0, bombs: 0, pack: 0, hp: 0 };
  private parryFlash = 0;
  private cardsT: Card[] = [];

  constructor() {
    const S = this.stage;
    S.ui.add(this.avatar.root, this.avatarShadow);
    this.avatar.root.scale.setScalar(28);
    this.avatarShadow.rotation.x = -1.2;
    S.ui.add(this.stamina.root, this.mana.root, this.pouch, this.scroll.root, this.boss.root, this.ribbon, this.gauge.root, this.gaugePlaque);
    this.pouch.scale.multiplyScalar(13);
    const mk = (name: string, s: number) => { const m = hudModel(name); m.scale.setScalar(s); S.ui.add(m); const p = plaque(22, 11); S.ui.add(p); return { m, p }; };
    this.counters = { pearls: mk('pearlCoin', 11), keys: mk('key', 13), bombs: mk('bomb', 13) };
    // the pickup streak ribbon: a dark band with gold edges (3D so the item model sits on it)
    const band = new THREE.Mesh(new THREE.PlaneGeometry(1, 40), new THREE.MeshBasicMaterial({ color: '#06080e', transparent: true, opacity: 0.78, toneMapped: false }));
    const edgeT = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 1), brassMat); edgeT.position.y = 20;
    const edgeB = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 1), brassMat); edgeB.position.y = -20;
    this.ribbon.add(band, edgeT, edgeB); this.ribbon.visible = false; this.ribbon.position.z = -20;
  }

  resize(w: number, h: number, pr: number) { this.ui.resize(w, h, pr); }

  /** a centred title card (floor / area names) */
  title(title: string, sub = '', color = C.white, life = 3) { this.cardsT = this.cardsT.filter((c) => c.icon); this.cardsT.push({ title, sub, t: 0, life, color }); }
  /** an item pickup streak: the item's model turning on a ribbon, name + one line (defaults from ITEMS) */
  pickup(itemId: string, name?: string, sub?: string) {
    const d = ITEMS[itemId];
    for (const c of this.cardsT) if (c.model) c.model.removeFromParent();
    this.cardsT = this.cardsT.filter((c) => !c.icon);
    const model = itemModel(itemId);
    this.stage.ui.add(model);
    this.cardsT.push({ title: name ?? d?.name ?? itemId, sub: sub ?? d?.desc ?? '', icon: itemId, t: 0, life: 3.2, color: '#fff2c8', model });
  }
  /** bounce / flash a counter */
  flash(what: Counter) { this.pop[what] = 1; }

  /** begin + draw + end on the HUD's own PixelUI */
  draw(dt: number, s: HudData, input: Input | null = null) {
    this.ui.begin(input, dt);
    this.drawInto(this.ui, dt, s);
    this.ui.end();
  }

  /** draw into any PixelUI between its begin() and end() */
  private d: DUi | null = null;
  drawInto(pui: PixelUI, dt: number, s: HudData) {
    this.t += dt;
    this.stage.attach(pui);
    if (!this.d || this.d.ui !== pui) this.d = new DUi(pui);
    const ui = this.d;
    ui.k = Math.max(1, pui.h / 360);
    this.stage.ui.scale.setScalar(ui.k);
    this.animate(dt, s);
    const on = !s.hidden;
    for (const o of this.stage.ui.children) o.visible = on || o === this.ribbon;
    if (on) {
      this.healthRow(ui, dt, s);
      const y = this.bars(ui, dt, s);
      this.counterCol(ui, dt, s, y);
      this.strip(ui, s.strip ?? null);
      this.depthGauge(ui, dt, s.depth ?? null, !!s.strip);
      this.bossBar(ui, dt, s.boss && s.boss.visible !== false ? s.boss : null);
      this.hand(ui, dt, s.skills ?? null);
    }
    this.drawCards(ui, dt);
    this.prev = { ...s, combat: s.combat ? { ...s.combat } : s.combat };
  }

  // ---------------------------------------------------------------- change detection / easing
  private animate(dt: number, s: HudData) {
    const p = this.prev;
    if (p) {
      const tot = s.hp + (s.soul ?? 0), ptot = p.hp + (p.soul ?? 0);
      if (tot < ptot) { this.avatar.hurt(); const i = Math.floor(Math.max(0, s.hp) / 2); this.heartBump[i] = 1; }
      else if (s.hp > p.hp) { this.avatar.heal(); for (let i = Math.floor(p.hp / 2); i < Math.ceil(s.hp / 2); i++) this.heartBump[i] = 1; }
      for (const k of ['pearls', 'keys', 'bombs'] as const) if (s[k] !== p[k]) this.pop[k] = 1;
      if (s.pack && p.pack && s.pack.used !== p.pack.used) this.pop.pack = Math.max(this.pop.pack, 0.6);
      if (s.combat?.lastParry && s.combat.lastParryAge < (p.combat?.lastParryAge ?? 99)) this.parryFlash = s.combat.lastParry === 'perfect' ? 1 : 0.5;
    }
    for (let i = 0; i < this.heartBump.length; i++) this.heartBump[i] = Math.max(0, (this.heartBump[i] ?? 0) - dt * 3);
    for (const k of Object.keys(this.pop) as Counter[]) this.pop[k] = Math.max(0, this.pop[k] - dt * 3.5);
    this.parryFlash = Math.max(0, this.parryFlash - dt * 3);
    const c = s.combat;
    const st = c && c.staminaMax > 0 ? clamp01(c.stamina / c.staminaMax) : 1;
    if (st < this.stamShown - 0.002) { this.stamChip = Math.max(this.stamChip, this.stamShown); this.stamChipHold = 0.4; this.stamShown = st; }
    else this.stamShown = lerp(this.stamShown, st, 1 - Math.exp(-dt * 12));
    if (this.stamChipHold > 0) this.stamChipHold -= dt; else this.stamChip = Math.max(this.stamShown, this.stamChip - dt * 0.8);
    const mn = s.maxMana ? clamp01((s.mana ?? 0) / s.maxMana) : 0;
    this.manaShown = lerp(this.manaShown, mn, 1 - Math.exp(-dt * 10));
    const b = s.boss && s.boss.visible !== false ? s.boss : null;
    if (b) {
      if (b.name !== this.bossName) { this.bossName = b.name; this.bossIn = 0; this.bossShown = this.bossChip = 1; }
      this.bossIn = Math.min(1, this.bossIn + dt * 1.4);
      const v = b.max > 0 ? clamp01(b.hp / b.max) : 0;
      if (v < this.bossShown - 0.0005) { this.bossChip = Math.max(this.bossChip, this.bossShown); this.bossChipHold = 0.6; this.bossFlash = Math.min(1, this.bossFlash + (this.bossShown - v) * 12); this.bossShown = v; }
      else this.bossShown = lerp(this.bossShown, v, 1 - Math.exp(-dt * 6));
      if (this.bossChipHold > 0) this.bossChipHold -= dt; else this.bossChip = Math.max(this.bossShown, this.bossChip - dt * 0.3);
      this.bossFlash = Math.max(0, this.bossFlash - dt * 7);
    } else { this.bossName = ''; this.bossIn = 0; }
  }

  // ---------------------------------------------------------------- top left: the blobfish + jelly hearts
  private healthRow(_ui: DUi, dt: number, s: HudData) {
    const S = this.stage;
    const frac = s.maxHp > 0 ? clamp01(s.hp / s.maxHp) : 0;
    this.avatar.update(dt, frac, s.hp > 0 && s.hp <= 2);
    S.put(this.avatar.root, 27, 30, 20);
    S.put(this.avatarShadow, 26, 47, -5);
    const red = Math.ceil(Math.max(0, s.maxHp) / 2), soul = Math.ceil(Math.max(0, s.soul ?? 0) / 2), total = red + soul;
    while (this.hearts.length < total) { const h = new Heart3D(); h.root.scale.setScalar(12); S.ui.add(h.root); this.hearts.push(h); }
    const low = s.hp > 0 && s.hp <= 2;
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
      h.root.scale.set(12 * (1 + beat + bump * 0.3), 12 * (1 + beat - bump * 0.15 + wob * 0.02), 12);
      h.root.rotation.set(0, Math.sin(this.t * 1.3 + i) * 0.25, wob * 0.06);
      S.put(h.root, 58 + (i % 10) * 14, 14 + Math.floor(i / 10) * 14 - Math.sin(bump * Math.PI) * 4, 10);
    });
  }

  private bars(ui: DUi, dt: number, s: HudData): number {
    const S = this.stage, c = s.combat;
    let y = 32 + Math.floor(Math.max(0, Math.ceil(s.maxHp / 2) + Math.ceil((s.soul ?? 0) / 2) - 1) / 10) * 14;
    this.stamina.root.visible = !!c && c.staminaMax > 0;
    if (c && c.staminaMax > 0) {
      const broken = c.guard === 'guardBroken' || (c.stamina <= 0 && Math.sin(this.t * 20) > 0);
      const col = broken ? '#ff3a2a' : c.staminaDelay > 0 ? '#e8a818' : this.parryFlash > 0 ? '#ffffff' : '#18c8a0';
      this.stamina.update(this.t, this.stamShown, this.stamChip, col);
      S.put(this.stamina.root, 56 + 32, y, 6);
      if (c.guard === 'riposte') this.stamina.root.rotation.x = Math.sin(this.t * 18) * 0.2; else this.stamina.root.rotation.x = 0;
      y += 10;
    }
    this.mana.root.visible = !!s.maxMana;
    if (s.maxMana) { this.mana.update(this.t, this.manaShown, this.manaShown); S.put(this.mana.root, 56 + 24, y, 6); y += 10; }
    const n = c?.flasksMax ?? 0;
    while (this.flasks.length < n) { const f = new Flask3D(); f.root.scale.setScalar(16); S.ui.add(f.root); this.flasks.push(f); }
    this.flasks.forEach((f, i) => {
      f.root.visible = i < n;
      if (i >= n || !c) return;
      const drinking = c.drinking > 0 && i === c.flasks;
      f.update(dt, i < c.flasks ? 1 : drinking ? 1 - c.drinking : 0);
      S.put(f.root, 61 + i * 14, y + 7, 8);
    });
    void ui;
    return y + (n ? 20 : 4);
  }

  private counterCol(ui: DUi, dt: number, s: HudData, y0: number) {
    const S = this.stage;
    let y = Math.max(y0, 66);
    for (const k of ['pearls', 'keys', 'bombs'] as const) {
      const { m, p } = this.counters[k];
      const pop = this.pop[k];
      m.rotation.y = Math.sin(this.t * 1.2 + y) * 0.6 + pop * Math.PI * 2;
      m.rotation.x = 0.15;
      S.put(m, 14, y - Math.sin(pop * Math.PI) * 3, 12);
      S.put(p, 36, y, 0);
      const v = String(Math.max(0, Math.min(99, s[k]))).padStart(2, '0');
      ui.text(v, 36, y - 5 - Math.round(Math.sin(pop * Math.PI) * 2), { font: 'body', color: pop > 0.25 ? '#fff6b0' : '#fff0d0', outline: '#2a1606', align: 'center' });
      y += 17;
    }
    this.pouch.visible = !!s.pack;
    if (s.pack) {
      this.pouch.rotation.set(0.15, Math.sin(this.t * 0.8) * 0.4, Math.sin(this.t * 60) * 0.1 * this.pop.pack);
      S.put(this.pouch, 14, y, 12);
      const full = s.pack.full || s.pack.used >= s.pack.total;
      ui.text(`${s.pack.used}/${s.pack.total}`, 26, y - 3, { font: 'small', color: full ? '#ff6a5a' : '#f0e6d0', outline: '#140a04' });
    }
    void dt;
  }

  // ---------------------------------------------------------------- top right: the parchment strip map
  private strip(ui: DUi, m: StripMap | null) {
    this.scroll.root.visible = !!m;
    if (!m) return;
    const W = Math.max(150, Math.min(240, Math.round(ui.w * 0.3))), H = 30;
    this.scroll.layout(W, H, ui.k);
    this.scroll.setName((m.name ?? '').toUpperCase(), ui.k);
    this.scroll.draw(m, this.t);
    const cx = ui.w - W / 2 - 14, cy = 26 + H / 2;
    this.stage.put(this.scroll.root, cx, cy, 0);
    this.scroll.root.rotation.x = -0.12;
    const fl = `FLOOR ${m.floor}/${m.floors}`;
    const tw = ui.measure(fl, 'small');
    ui.text(fl, cx + W / 2, cy + H / 2 + 6, { font: 'small', color: '#f0e6d0', outline: C.ink, align: 'right' });
    for (let i = 0; i < m.floors; i++) ui.img(hudArt(i < m.floor ? 'pip' : 'pipOff'), cx + W / 2 - tw - 8 - (m.floors - i) * 7, cy + H / 2 + 6);
  }

  // ---------------------------------------------------------------- the depth gauge (under the strip map)
  private depthGauge(ui: DUi, dt: number, d: HudData['depth'], hasStrip: boolean) {
    this.gauge.root.visible = this.gaugePlaque.visible = !!d;
    if (!d) return;
    const x = ui.w - 40, y = hasStrip ? 102 : 40;
    this.gauge.update(dt, this.t, d, ui.k);
    this.gauge.root.rotation.set(-0.08, -0.12 + Math.sin(this.t * 0.6) * 0.03, Math.sin(this.t * 1.1) * 0.02);
    this.stage.put(this.gauge.root, x, y, 10);
    this.stage.put(this.gaugePlaque, x, y + 37, 6);
    // the depth, once: on the plaque under the gauge
    ui.text(`${Math.round(d.m)} M`, x, y + 32, { font: 'body', color: d.descending ? '#bff4ff' : '#fff0d0', outline: '#2a1606', align: 'center' });
  }

  // ---------------------------------------------------------------- bottom centre: the boss plaque
  private bossBar(ui: DUi, dt: number, b: BossBar | null) {
    this.boss.root.visible = !!b;
    if (!b) return;
    const ease = 1 - (1 - this.bossIn) ** 3;
    const W = Math.min(260, Math.round(ui.w * 0.5));
    this.boss.layout(W);
    this.boss.update(dt, this.bossShown, this.bossChip, this.bossFlash, b);
    const y = ui.h - 26 + (1 - ease) * 40;
    this.stage.put(this.boss.root, ui.w / 2, y, 0);
    this.boss.root.rotation.x = -0.25 + Math.sin(this.t * 0.7) * 0.02;
    ui.text(b.name.toUpperCase(), ui.w / 2, y - 24, { font: 'title', color: '#ffe8d0', color2: '#ff9a7a', outline: '#1a0606', align: 'center', alpha: ease });
    if (b.title) ui.text(b.title, ui.w / 2, y - 34, { font: 'small', color: '#c8b8a8', outline: '#1a0606', align: 'center', alpha: ease });
  }

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
      const x = 26 + i * 40, y = ui.h - 34;
      const hov = ui.hover(x - c.w / 2, y - c.h / 2, c.w, c.h) ? 1 : 0;
      const cd = sl.cdMax > 0 ? clamp01(sl.cd / sl.cdMax) : 0;
      c.update(dt, { hover: hov, mx: hov ? (ui.mx - x) / (c.w / 2) : 0, my: hov ? (ui.my - y) / (c.h / 2) : 0, cd, ready: cd <= 0 && sl.mana <= sk.mana, selected: i === sk.sel });
      this.stage.put(c.root, x, y, 30);
      c.root.rotation.z = (i - 1.5) * -0.06;
      // the key number on the frame, the cooldown seconds over the art
      ui.text(String(i + 1), x - c.w / 2 + 4, y - c.h / 2 + 1 - (i === sk.sel ? 5 : 0), { font: 'body', color: '#fff2c8', outline: '#1a0c04' });
      if (cd > 0) ui.text(String(Math.ceil(sl.cd)), x, y - 8, { font: 'title', color: '#ffffff', outline: '#06080e', align: 'center' });
    });
  }

  // ---------------------------------------------------------------- title cards / pickup streaks
  private drawCards(ui: DUi, dt: number) {
    for (const c of this.cardsT) c.t += dt;
    for (const c of this.cardsT) if (c.t >= c.life && c.model) c.model.removeFromParent();
    this.cardsT = this.cardsT.filter((c) => c.t < c.life);
    this.ribbon.visible = false;
    for (const c of this.cardsT) {
      const a = clamp01(Math.min(c.t * 5, (c.life - c.t) * 2.5));
      const slide = Math.round((1 - Math.min(1, c.t * 5)) ** 2 * 14);
      if (c.icon) {
        const y = 52;
        const sub = c.sub.length > 64 ? c.sub.slice(0, 62) + '…' : c.sub;
        const tw = Math.max(ui.measure(c.title, 'title'), ui.measure(sub, 'small'));
        const w = Math.min(ui.w - 20, tw + 64), x = Math.round((ui.w - w) / 2);
        this.ribbon.visible = true;
        this.ribbon.scale.set(w, 1, 1);
        this.ribbon.children.forEach((ch) => { const m = (ch as THREE.Mesh).material as THREE.Material; m.opacity = a * 0.8; m.transparent = true; });
        this.stage.put(this.ribbon, ui.w / 2, y + 20, -30);
        if (c.model) {
          const sc = 28 * Math.min(1, c.t * 4);
          c.model.scale.setScalar(sc);
          c.model.rotation.set(0.25, this.t * 2.2, Math.sin(this.t * 3) * 0.1);
          this.stage.put(c.model, x + 22, y + 20, 30);
        }
        ui.text(c.title, x + 46 - slide, y + 9, { font: 'title', color: c.color, outline: '#1a0e04', alpha: a });
        if (sub) ui.text(sub, x + 46 + slide, y + 26, { font: 'small', color: '#d8d0c0', alpha: a });
      } else {
        // top centre, between the health corner and the strip map: never over the play area
        const y = 10;
        const big = ui.measure(c.title, 'big') < ui.w * 0.42;
        ui.text(c.title, ui.w / 2, y - slide, { font: big ? 'big' : 'title', color: c.color, color2: '#ffc860', outline: '#140a04', align: 'center', alpha: a });
        if (c.sub) ui.text(c.sub, ui.w / 2, y + (big ? 30 : 16) + slide, { font: 'small', color: '#e8e0d0', outline: '#06080e', align: 'center', alpha: a });
      }
    }
  }
}
