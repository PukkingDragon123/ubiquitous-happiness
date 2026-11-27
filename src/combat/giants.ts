// The giant humans' horror kit (v4): to a tiny blobfish the divers are towering, evil, grotesque giants.
// GiantKit dresses a souls Human (src/waves/human.ts) and follows its bones every frame:
//   - glowing goggles: the mask glass / helmet ports burn a sickly yellow-green and leak glow motes
//   - trophies: dead fish strung from the belt on lines, swinging as he plods (crisp pixel-art cards)
//   - a net bag of dead fish slung over the back (the Netter swings it as a weapon)
//   - a rusty storm LANTERN (weak point: smash it and he's blinded, stunned, and takes extra damage)
//   - a ribbed AIR HOSE looping from the helmet to the tank (weak point: cut it and he chokes: a long stagger,
//     then he drowns slowly and turns frantic)
//   - the Gutter's huge gaff hook on his pole
// HurtBoxes (legs / chest / head) make the whole tall body hittable; WeakPoints are separate small targets.
// GroundWave is the stomp's shockwave rolling along the seabed.
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import { Px } from '../gfx/px';
import { kitMat, rubberMat } from '../humans/diveGear';
import { band, nz, hh } from '../humans/fabric';
import { attackPlayer } from './resolve';
import { callout } from './feel';
import { clamp, damp } from '../core/math';
import { buildFish, type FishModel } from '../fish';
import { Loft, FULL, type V3 } from '../gfx/loft';
import { facet } from '../gfx/lowpoly';

/** what the kit needs from its giant (a souls Human) */
export interface GiantHost extends Entity {
  S: number;
  rig: { facing: 1 | -1; boneWorld(b: string, out: THREE.Vector3): THREE.Vector3; headWorld(out: THREE.Vector3): THREE.Vector3; group: THREE.Group; weapon: { muzzle: THREE.Object3D }; model: { dive: { mask: THREE.Object3D | null; ports: THREE.Mesh[] } } };
  dead: boolean;
  /** a weak point broke */
  weakBroken(w: World, what: 'hose' | 'lantern'): void;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const texCache = new Map<string, THREE.Texture>();
function pxTex(key: string, w: number, h: number, draw: (p: Px) => void): THREE.Texture {
  let t = texCache.get(key);
  if (!t) { const p = new Px(w, h); draw(p); t = p.texture(); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; texCache.set(key, t); }
  return t;
}

// ------------------------------------------------------------------ dead fish (real fish-pipeline models, v8 polish)
// The trophies used to be flat pixel-art cards; now they are the game's own fish (cached geometry + texture per
// species, a tiny per-instance material), posed dead: a limp C-curl and a gaping jaw, hung from the mouth.
const DEAD_SP = ['sardine', 'snapper', 'pumpkinseed'];
function fishCard(i: number, len: number, keep?: FishModel[]): THREE.Object3D {
  const m = buildFish(DEAD_SP[i % DEAD_SP.length], 31 + i);
  m.group.scale.setScalar(len / m.length);
  m.group.rotation.y = Math.PI;           // nose toward -x ...
  m.group.position.x = len / 2;           // ... at the origin, so it hangs from its mouth with the body along +x
  m.inst.uSwim.value.set(i * 1.3, 0, (i % 2 ? 1 : -1) * 0.45, 0.75);
  m.inst.uFx.value.set(0, 0, 0, -0.3);    // eyes rolled
  m.mesh.castShadow = true;
  keep?.push(m);
  const g = new THREE.Group(); g.add(m.group);
  return g;
}

// ------------------------------------------------------------------ props
const rust = () => kitMat('giantRust', 32, 32, (x, y) => {
  let c: [number, number, number] = [96, 84, 70];
  if (nz(x, y, 7, 3) > 0.58) c = [146, 76, 36];
  if (hh(x, y, 5) > 0.95) c = [196, 120, 60];
  return band(c, 0.85 + (y < 4 ? 0.2 : 0) + (nz(x * 2, y, 5, 9) - 0.5) * 0.15, x, y, 0.07);
}, { rough: 0.8, metal: 0.35 });
const hoseMat = () => kitMat('giantHose', 16, 16, (x, y) => band([58, 52, 46], (y % 4 < 2 ? 1.05 : 0.8) + (x < 2 ? 0.15 : 0), x, y, 0.07), { rough: 0.85 });
const netBagMat = () => {
  const t = pxTex('giantNetBag', 64, 64, (p) => { for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if ((x + y) % 8 === 0 || (x - y + 64) % 8 === 0) p.set(x, y, '#c4b890'); p.outline('#3a3020'); });
  return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
};
function lanternMesh(): { g: THREE.Group; glass: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const R = rust();
  const glass = new THREE.MeshStandardMaterial({ color: '#ffd070', emissive: new THREE.Color('#ffb040'), emissiveIntensity: 2.2, roughness: 0.3, flatShading: true });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => { const me = new THREE.Mesh(geo, m); me.position.y = y; me.castShadow = true; g.add(me); return me; };
  add(new THREE.TorusGeometry(0.09, 0.018, 4, 8), R, 0.02).rotation.y = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.1, 0.16, 0.1, 6), R, -0.08);
  add(new THREE.CylinderGeometry(0.12, 0.12, 0.26, 6), glass, -0.26);
  for (let i = 0; i < 4; i++) { const b = add(new THREE.BoxGeometry(0.02, 0.28, 0.02), R, -0.26); b.position.x = Math.cos(i * Math.PI / 2) * 0.125; b.position.z = Math.sin(i * Math.PI / 2) * 0.125; }
  add(new THREE.CylinderGeometry(0.16, 0.13, 0.07, 6), R, -0.42);
  return { g, glass };
}
function gaffHook(): THREE.Group {
  // a lofted gaff: a lashed socket, the shaft, a J that curls over and back with a tapering point and an inner barb
  // (in the y-z plane, the point curling back toward the pole like the old torus one)
  const g = new THREE.Group();
  const R = rust();
  const B = new Loft();
  const C: V3 = [0, 0.2, -0.13], r = 0.13;
  const at = (a: number): V3 => [0, C[1] + Math.sin(a) * r, C[2] + Math.cos(a) * r];
  const path: V3[] = [[0, -0.02, 0], [0, 0.1, 0]];
  for (let i = 0; i <= 12; i++) path.push(at((i / 12) * Math.PI * 1.18));
  B.tube(path, (t) => (t < 0.12 ? 0.024 : 0.024 * Math.pow(1 - (t - 0.12) / 0.88, 0.8) + 0.003), 6, FULL, 0, { capStart: true, capEnd: true });
  const bb = at(Math.PI * 0.98), bt: V3 = [0, bb[1] + 0.055, bb[2] + (C[2] - bb[2]) * 0.3];
  B.tube([bb, [0, (bb[1] + bt[1]) / 2, (bb[2] + bt[2]) / 2], bt], (t) => 0.012 * (1 - t) + 0.002, 4, FULL, 0, { capEnd: true });
  B.tube([[0, -0.08, 0], [0, 0.02, 0], [0, 0.06, 0]], () => 0.034, 6, FULL, 0, { capStart: true, capEnd: true });
  const hook = new THREE.Mesh(facet(B.build()), R);
  const lash = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.031, 0.031, 0.04, 6)), hoseMat());   // a ribbed cord lashing
  lash.position.y = 0.08;
  hook.castShadow = lash.castShadow = true;
  g.add(hook, lash);
  return g;
}

/** a small target on a giant: forwards damage (with a bonus) and breaks after enough hits */
export class WeakPoint implements Entity {
  kind = 'weakpoint'; team: Team = 'enemy';
  x = 0; y = 0; vx = 0; vy = 0; alive = true; r: number;
  hp: number; maxHp: number;
  constructor(public host: GiantHost, public what: 'hose' | 'lantern', hp: number, r: number, public mult = 1.6) { this.hp = this.maxHp = hp; this.r = r; }
  update() { if (!this.host.alive || this.host.dead) this.alive = false; }
  hit(dmg: number, dirX: number, dirY: number, w: World, src: Entity | null, kind?: DamageKind): boolean {
    if (!this.alive || this.host.dead) return false;
    this.hp -= dmg;
    w.fx.hit(this.x, this.y, 'crit', Math.atan2(dirY, dirX), this.what === 'lantern' ? '#ffd070' : '#bfefff');
    w.sfx(this.what === 'lantern' ? 'k_glass' : 'squish', this.x, 0.7, this.what === 'lantern' ? 1.4 : 0.8);
    (this.host as unknown as { weakHit: boolean }).weakHit = true;
    this.host.hit?.(dmg * this.mult, dirX, dirY, w, src, kind);
    if (this.hp <= 0) { this.alive = false; this.host.weakBroken(w, this.what); }
    return true;
  }
}
/** a hittable part of a giant's tall body: forwards hits to the giant */
export class HurtBox implements Entity {
  kind = 'hurtbox'; team: Team = 'enemy';
  x = 0; y = 0; vx = 0; vy = 0; alive = true;
  constructor(public host: GiantHost, public r: number, public mult = 1) {}
  update() { if (!this.host.alive || this.host.dead) this.alive = false; }
  hit(dmg: number, dirX: number, dirY: number, w: World, src: Entity | null, kind?: DamageKind): boolean {
    if (!this.alive || this.host.dead) return false;
    return this.host.hit?.(dmg * this.mult, dirX, dirY, w, src, kind) ?? false;
  }
}

/** the stomp: a shockwave rolling along the seabed both ways (red: dodge through it or swim over) */
export class GroundWave implements Entity {
  kind = 'groundwave'; team: Team = 'neutral';
  x: number; y: number; vx: number; vy = 0; r = 0.5; alive = true;
  private t = 0; private done = false;
  constructor(x: number, y: number, dir: number, private src: Entity | null, private dmg: number, private range = 7, private height = 1.3) { this.x = x; this.y = y; this.vx = dir * 8; }
  update(dt: number, w: World) {
    this.t += dt;
    this.x += this.vx * dt;
    this.y = w.terrain.floorAt(this.x);
    if (Math.random() < dt * 40) w.fx.silt(this.x, this.y + 0.1, 2);
    if (Math.random() < dt * 25) w.fx.emit('dust', this.x, this.y + 0.3, { n: 1, size: 0.6, vy: 1.8, life: 0.5, color: '#c8a880' });
    if (Math.random() < dt * 14) w.fx.emit('spark', this.x, this.y + 0.4, { n: 1, color: '#ff5030', life: 0.25 });
    const p = w.player;
    if (!this.done && Math.abs(p.x - this.x) < 0.7 + p.r && p.y - this.y < this.height) {
      const r = attackPlayer(w, { src: this.src, dmg: this.dmg, x: this.x, y: this.y - 0.5, kind: 'crush', unblockable: true, knock: 6, name: 'stomp' });
      if (r !== 'dodged' && r !== 'immune') this.done = true;
    }
    if (this.t * 8 > this.range || w.terrain.sdf(this.x + Math.sign(this.vx) * 0.4, this.y + 0.5) < 0) this.alive = false;
  }
}

/**
 * a still-life version of the kit for photographs (the codex): glowing goggles, a few dead fish and a lantern
 * hung on the rig at rest (rig space, scale 1)
 */
export function dressForPhoto(rig: { model: { dive: { mask: THREE.Object3D | null; ports: THREE.Mesh[] }; bones: Record<string, THREE.Object3D> }; group: THREE.Group }, o: { lantern?: boolean; trophies?: number } = {}) {
  const glow = new THREE.MeshStandardMaterial({ color: '#d8ff70', emissive: new THREE.Color('#c8ff40'), emissiveIntensity: 2.6, roughness: 0.2, flatShading: true });
  const mask = rig.model.dive.mask;
  if (mask && mask.children[1]) (mask.children[1] as THREE.Mesh).material = glow;
  for (const port of rig.model.dive.ports) port.material = glow;
  rig.group.updateMatrixWorld(true);
  const hips = rig.model.bones.hips.getWorldPosition(new THREE.Vector3());
  rig.group.worldToLocal(hips);
  for (let i = 0; i < (o.trophies ?? 3); i++) {
    const c = fishCard(i, 0.36);
    c.rotation.z = -Math.PI / 2 + (i - 1) * 0.15;
    c.position.set(hips.x + (i - 1) * 0.1, hips.y - 0.08, 0.16 + (i % 2) * 0.02);
    rig.group.add(c);
  }
  if (o.lantern) { const L = lanternMesh(); L.g.scale.setScalar(0.55); L.g.position.set(hips.x + 0.14, hips.y - 0.06, 0.2); rig.group.add(L.g); }
}

interface Hanger { m: THREE.Object3D; line: THREE.Line | null; ang: number; vel: number; off: THREE.Vector3; len: number }

export class GiantKit {
  obj = new THREE.Group();
  hurt: HurtBox[] = [];
  lanternWP: WeakPoint | null = null;
  hoseWP: WeakPoint | null = null;
  private hangers: Hanger[] = [];
  private bag: Hanger | null = null;
  private lantern: { g: THREE.Group; glass: THREE.MeshStandardMaterial; h: Hanger; broken: boolean; inHand: boolean } | null = null;
  private hose: { segs: THREE.Mesh[]; cut: boolean; gush: number } | null = null;
  private eyeMats: THREE.MeshStandardMaterial[] = [];
  private added = false;
  private lastX = 0;
  private t = Math.random() * 10;
  private fish: FishModel[] = [];

  constructor(public host: GiantHost, o: { trophies?: number; bag?: boolean; lantern?: 'belt' | 'hand' | null; hose?: boolean; hook?: boolean }) {
    const S = host.S;
    // glowing goggles: the mask glass (or the helmet ports) burn
    const glow = new THREE.MeshStandardMaterial({ color: '#d8ff70', emissive: new THREE.Color('#c8ff40'), emissiveIntensity: 2.6, roughness: 0.2, flatShading: true });
    const mask = host.rig.model.dive.mask;
    if (mask && mask.children[1]) { (mask.children[1] as THREE.Mesh).material = glow; this.eyeMats.push(glow); }
    for (const port of host.rig.model.dive.ports) { const m = glow.clone(); port.material = m; this.eyeMats.push(m); }
    // trophies: dead fish on lines from the belt
    const n = o.trophies ?? 3;
    for (let i = 0; i < n; i++) {
      const len = (0.34 + Math.random() * 0.14) * S;
      const card = fishCard(i + Math.floor(Math.random() * 3), len, this.fish);
      card.rotation.z = -Math.PI / 2; // nose up at the hook, tail down
      const g = new THREE.Group(); g.add(card);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#2a2620' }));
      line.frustumCulled = false;
      this.obj.add(g, line);
      const side = i % 2 ? 1 : -1;
      this.hangers.push({ m: g, line, ang: 0, vel: 0, off: new THREE.Vector3((i - (n - 1) / 2) * 0.09 * S, -0.02 * S, side * 0.14 * S), len: (0.12 + Math.random() * 0.1) * S });
    }
    // a net bag of dead fish over the back
    if (o.bag) {
      const g = new THREE.Group();
      const sack = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 * S, 1), netBagMat());
      sack.scale.set(1, 1.25, 0.8); sack.position.y = -0.24 * S;
      g.add(sack);
      for (let i = 0; i < 4; i++) { const c = fishCard(i, 0.28 * S, this.fish); c.position.set((Math.random() - 0.5) * 0.15 * S, -0.3 * S + Math.random() * 0.15 * S, (i - 1.5) * 0.04 * S); c.rotation.z = Math.random() * 6; g.add(c); }
      this.obj.add(g);
      this.bag = { m: g, line: null, ang: 0, vel: 0, off: new THREE.Vector3(-0.12 * S, 0.06 * S, -0.12 * S), len: 0 };
    }
    // the lantern (weak point)
    if (o.lantern) {
      const L = lanternMesh();
      L.g.scale.setScalar(S * 0.55);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#3a3026' }));
      line.frustumCulled = false;
      this.obj.add(L.g, line);
      this.lantern = { g: L.g, glass: L.glass, h: { m: L.g, line, ang: 0, vel: 0, off: new THREE.Vector3(0.1 * S, -0.04 * S, 0.16 * S), len: 0.08 * S }, broken: false, inHand: o.lantern === 'hand' };
      this.lanternWP = new WeakPoint(host, 'lantern', 3, 0.32 * S * 0.55 + 0.15, 1.6);
    }
    // the air hose loop (weak point)
    if (o.hose !== false) {
      const segs: THREE.Mesh[] = [];
      const geo = new THREE.CylinderGeometry(0.035 * S, 0.035 * S, 1, 5); geo.rotateZ(Math.PI / 2);
      for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(geo, hoseMat()); m.castShadow = true; segs.push(m); this.obj.add(m); }
      this.hose = { segs, cut: false, gush: 0 };
      this.hoseWP = new WeakPoint(host, 'hose', 4, 0.32 + 0.05 * S, 1.6);
    }
    // the Gutter's gaff hook rides on his pole tip
    if (o.hook) { const h = gaffHook(); h.scale.setScalar(1.6); host.rig.weapon.muzzle.add(h); }
    // tall-body hurt boxes: legs, chest, head (the head takes a little extra)
    this.hurt.push(new HurtBox(host, 0.32 * S), new HurtBox(host, 0.36 * S), new HurtBox(host, 0.2 * S + 0.1, 1.25));
    void rubberMat;
  }

  /** add the kit's entities + meshes to the world (once) */
  mount(w: World) {
    if (this.added) return;
    this.added = true;
    w.scene.add(this.obj);
    for (const h of this.hurt) w.add(h);
    if (this.lanternWP) w.add(this.lanternWP);
    if (this.hoseWP) w.add(this.hoseWP);
    this.lastX = this.host.x;
  }

  /** the lantern's world point (for the Lamplighter's flash), or null once smashed */
  lanternAt(): THREE.Vector3 | null { return this.lantern && !this.lantern.broken ? this.lantern.g.getWorldPosition(new THREE.Vector3()) : null; }
  get hoseCut() { return !!this.hose?.cut; }
  /** the net bag's world position (the Netter slams it) */
  bagAt(): THREE.Vector3 | null { return this.bag ? this.bag.m.getWorldPosition(new THREE.Vector3()) : null; }
  /** while the Netter swings the bag it's carried by the hand instead of the back */
  bagInHand = false;

  update(dt: number, w: World) {
    this.mount(w);
    this.t += dt;
    const h = this.host, rig = h.rig, S = h.S, f = rig.facing;
    const ax = (h.x - this.lastX) / Math.max(dt, 1e-3); this.lastX = h.x;
    // eyes: a sickly flicker + motes
    const flick = 2.2 + Math.sin(this.t * 13) * 0.4 + (Math.random() < 0.03 ? -1.5 : 0);
    for (const m of this.eyeMats) m.emissiveIntensity = h.dead ? Math.max(0, m.emissiveIntensity - dt * 2) : flick;
    if (!h.dead && Math.random() < dt * 3) { const hd = rig.headWorld(_v); w.fx.emit('glow', hd.x + f * 0.1 * S, hd.y - 0.02 * S, { n: 1, size: 0.25, life: 0.4, color: '#c8ff40', alpha: 0.7, z: 0.6 }); }
    // hangers swing like pendulums off the belt (driven by his walking)
    const hips = rig.boneWorld('hips', _v2).clone();
    const swing = (H: Hanger, ax0: THREE.Vector3, k = 1) => {
      H.vel += (-H.ang * 14 - H.vel * 2.2 - ax * 0.25 * k) * dt;
      H.ang += H.vel * dt;
      H.m.position.set(ax0.x + Math.sin(H.ang) * H.len, ax0.y - Math.cos(H.ang) * H.len, ax0.z);
      H.m.rotation.z = H.ang;
      if (H.line) {
        const pa = H.line.geometry.attributes.position as THREE.BufferAttribute;
        pa.setXYZ(0, ax0.x, ax0.y, ax0.z); pa.setXYZ(1, H.m.position.x, H.m.position.y, H.m.position.z); pa.needsUpdate = true;
      }
    };
    for (const H of this.hangers) swing(H, new THREE.Vector3(hips.x + H.off.x * f, hips.y + H.off.y, H.off.z + 0.1), 1);
    if (this.bag) {
      if (this.bagInHand) { const hd = rig.boneWorld('handL', _v); this.bag.m.position.set(hd.x, hd.y, 0.3); this.bag.m.rotation.z = 0; this.bag.vel = 0; this.bag.ang = 0; }
      else { const ch = rig.boneWorld('chest', _v); swing(this.bag, new THREE.Vector3(ch.x + this.bag.off.x * f, ch.y + this.bag.off.y, this.bag.off.z), 0.6); }
    }
    // the lantern: in the left hand, or on a short chain at the belt
    const L = this.lantern;
    if (L) {
      if (L.inHand) { const hd = rig.boneWorld('handL', _v); swing(L.h, new THREE.Vector3(hd.x, hd.y, 0.35 * S * 0.3 + 0.2), 0.5); }
      else swing(L.h, new THREE.Vector3(hips.x + L.h.off.x * f, hips.y + L.h.off.y, L.h.off.z), 0.8);
      const lp = L.g.getWorldPosition(_v);
      if (this.lanternWP) { this.lanternWP.x = lp.x; this.lanternWP.y = lp.y - 0.12 * S; }
      if (!L.broken) {
        L.glass.emissiveIntensity = 2 + Math.sin(this.t * 9) * 0.3 + (Math.random() < 0.05 ? 0.8 : 0);
        if (Math.random() < dt * 5) w.fx.emit('glow', lp.x, lp.y - 0.14 * S, { n: 1, size: 0.6 + Math.random() * 0.3, life: 0.35, color: '#ffc060', alpha: 0.65, z: 0.5 });
        if (Math.random() < dt * 2) w.fx.emit('ember', lp.x, lp.y - 0.1 * S, { n: 1, speed: 0.3, life: 0.8, color: '#ffb040' });
      }
    }
    // the hose: a sagging loop from the back of the head round to the tank between the shoulders
    if (this.hose) {
      const hd = rig.headWorld(_v).clone();
      const ch = rig.boneWorld('chest', _v2).clone();
      const a = new THREE.Vector3(hd.x - f * 0.08 * S, hd.y - 0.06 * S, -0.05 * S);
      const b = new THREE.Vector3(ch.x - f * 0.16 * S, ch.y - 0.05 * S, -0.08 * S);
      const bulge = new THREE.Vector3(-f * 0.36 * S, 0.02 * S, 0.1 * S);
      const segs = this.hose.segs, n = segs.length;
      const pt = (t: number, out: THREE.Vector3) => out.set(a.x + (b.x - a.x) * t + bulge.x * Math.sin(t * Math.PI), a.y + (b.y - a.y) * t + bulge.y * Math.sin(t * Math.PI) - Math.sin(t * Math.PI) * 0.05 * S + Math.sin(this.t * 2 + t * 4) * 0.01 * S, a.z + (b.z - a.z) * t + bulge.z * Math.sin(t * Math.PI));
      const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        pt(i / n, p0); pt((i + 1) / n, p1);
        const s = segs[i];
        const cut = this.hose.cut && (i === 4);
        s.visible = !cut;
        s.position.copy(p0).add(p1).multiplyScalar(0.5);
        s.scale.set(p0.distanceTo(p1) * 1.08, 1, 1);
        s.rotation.set(0, Math.atan2(-(p1.z - p0.z), Math.hypot(p1.x - p0.x, p1.y - p0.y)) * 0, Math.atan2(p1.y - p0.y, p1.x - p0.x));
      }
      pt(0.5, p0);
      if (this.hoseWP) { this.hoseWP.x = p0.x; this.hoseWP.y = p0.y; }
      if (this.hose.cut) {
        this.hose.gush += dt;
        if (Math.random() < dt * 40) w.fx.emit('bubble', p0.x, p0.y, { n: 1, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2, speed: 0.6, life: 1.6 });
        if (Math.random() < dt * 4) w.fx.emit('bubbleBig', p0.x, p0.y, { n: 1, vy: 2, life: 2 });
      }
    }
    // hurt boxes: legs (knees), chest, head
    const kl = rig.boneWorld('shinL', _v).clone(), kr = rig.boneWorld('shinR', _v2);
    this.hurt[0].x = (kl.x + kr.x) / 2; this.hurt[0].y = (kl.y + kr.y) / 2 - 0.06 * S;
    const cb = rig.boneWorld('chest', _v); this.hurt[1].x = cb.x; this.hurt[1].y = cb.y;
    const hb = rig.headWorld(_v); this.hurt[2].x = hb.x; this.hurt[2].y = hb.y;
    void clamp; void damp;
  }

  /** a weak point broke: the visual side (the brain does the stagger) */
  breakFx(w: World, what: 'hose' | 'lantern') {
    if (what === 'lantern' && this.lantern) {
      const L = this.lantern;
      L.broken = true;
      const lp = L.g.getWorldPosition(new THREE.Vector3());
      L.glass.emissiveIntensity = 0; L.glass.color.set('#3a3228');
      L.g.children.forEach((c, i) => { if (i >= 2 && i <= 2) c.visible = false; });
      w.fx.explosion(lp.x, lp.y, 0.7);
      w.fx.emit('glow', lp.x, lp.y, { n: 1, size: 7, life: 0.35, color: '#ffd080' });
      w.fx.light(lp.x, lp.y, '#ffc060', 12, 0.3);
      w.fx.debrisBurst(lp.x, lp.y, 12, '#e8d8a0', 4, 0.04);
      for (let i = 0; i < 12; i++) w.fx.emit('ember', lp.x, lp.y, { n: 1, speed: 4, life: 1, color: '#ffa030' });
      w.sfx('k_glass', lp.x, 1, 0.7); w.sfx('boom_uw', lp.x, 0.6, 1.4);
      callout(w, 'LANTERN SMASHED', lp.x, lp.y + 1, 'gold', 0.45);
    }
    if (what === 'hose' && this.hose) {
      this.hose.cut = true;
      const p = this.hoseWP ?? this.host;
      w.fx.emit('bubbleBig', p.x, p.y, { n: 14, spread: 0.3, speed: 2.5 });
      w.sfx('steam', p.x, 1, 0.7); w.sfx('rope_snap', p.x, 0.9, 0.8);
      callout(w, 'AIR HOSE CUT', p.x, p.y + 1, 'gold', 0.45);
    }
  }

  dispose() {
    this.obj.removeFromParent();
    for (const m of this.fish) m.dispose();
    this.fish.length = 0;
    for (const h of this.hurt) h.alive = false;
    if (this.lanternWP) this.lanternWP.alive = false;
    if (this.hoseWP) this.hoseWP.alive = false;
  }
}
