// The title's travelling shot: a long side-on cross-section of open seabed the blobfish swims along, left to
// right, to the old signpost. Layers, front to back (the camera tracks along x, so depth is the parallax):
//   z +3..+6    dark foreground silhouettes: kelp fronds and boulders sliding past close to the lens
//   z  0        the play plane: the blobfish (kasa hat, the toothpick slung across its back)
//   z -1..-8    the MOLEFORGE-style pixel meadow on a sand slope, faceted rocks, a crab, starfish, the signpost
//   z -8..-24   a kelp forest reaching up into the light, schools of fish, rock outcrops
//   z -35..-80  far pinnacles fading into the blue and a humpback crossing
// plus god-ray cards, marine snow, bubble vents and the post pipeline's water optics.
//
//   const set = new TravelSet(); scene.add(set.group); set.update(dt, t, camera)
//   set.hero (CosmeticPuppet), set.sign (Signpost at SIGN_X), floorAt(x, z), set.light (Lighting), set.fx
import * as THREE from 'three';
import { Lighting } from '../gfx/lighting';
import { Particles } from '../gfx/particles';
import { psxMat, facet } from '../player/psx';
import { fbm, hash2, TAU, damp } from '../core/math';
import { Motes } from '../hideout/ocean';
import { CosmeticPuppet } from '../cosmetics/rig';
import { makeMeadowChunked, meadowLook, MC, type MeadowItem } from '../world/meadow';
import { Kit } from '../hideout/kit';
import { TITLE_LOOK, rockPage, SAND, KELP, FISH, WHALE, RAY, boulder, kelpGeo, kelpMat, fishGeo, whaleGeo, flukeGeo, KELP_T } from './art';
import { Signpost } from './sign';

export const SIGN_X = 0;
export const SIGN_Z = -1.1;
const FLOOR = -14;

/** the seabed height: rolling dunes rising gently toward the back, flattened round the signpost */
export function floorAt(x: number, z: number) {
  const near = Math.min(1, Math.hypot(x - SIGN_X, (z - SIGN_Z) * 1.4) / 5);
  const dune = (fbm(x * 0.05 + 3, z * 0.07, 3, 5) - 0.5) * 2.2 + Math.sin(x * 0.11 + z * 0.05) * 0.35;
  return FLOOR + dune * (0.25 + near * 0.75) + Math.max(0, -z - 3) * 0.17 - Math.max(0, z - 2) * 0.1;
}

interface School { mesh: THREE.InstancedMesh; fish: { o: THREE.Vector3; ph: number; s: number }[]; kind: 'cruise' | 'mill'; c: THREE.Vector3; r: number; sp: number }

export class TravelSet {
  group = new THREE.Group();
  light = new Lighting(1024, 4);
  fx = new Particles();
  snow = new Motes(420, 'dot', '#b8dce4');
  bubbles = new Motes(200, 'bubble', '#d8f8ff');
  hero: CosmeticPuppet;
  sign = new Signpost();
  /** where the sign stands (its base) */
  signAt = new THREE.Vector3(SIGN_X, floorAt(SIGN_X, SIGN_Z), SIGN_Z);
  private rays: { m: THREE.Mesh; ph: number; base: number }[] = [];
  private schools: School[] = [];
  private whale = new THREE.Group();
  private fluke = new THREE.Group();
  private whaleT = 20;
  private crab = new THREE.Group();
  private crabT = 0;
  private vents: THREE.Vector3[] = [];
  lamp: ReturnType<Lighting['lamp']> = null;
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private s = new THREE.Vector3(); private v = new THREE.Vector3();
  onWhale?: () => void;

  constructor() {
    const G = this.group;
    G.add(this.light.group, this.fx.object, this.snow.points, this.bubbles.points);
    const rockM = [psxMat(rockPage(false), { rough: 0.95 }), psxMat(rockPage(true), { rough: 0.95, sss: [0.6, 1, 0.5], sssK: 0.15 })];
    for (const m of rockM) (m.userData.uw as { uMatRimG: { value: number } }).uMatRimG.value = 0.12;
    const rock = (seed: number, x: number, z: number, sx: number, sy: number, sz: number, o: { detail?: number; rough?: number; top?: number; sink?: number; ry?: number; shadow?: boolean } = {}) => {
      const m = new THREE.Mesh(boulder(seed, sx, sy, sz, o.detail ?? 1, o.rough ?? 0.45, o.top !== undefined ? { top: o.top } : {}), rockM);
      m.position.set(x, floorAt(x, z) + sy * (0.45 - (o.sink ?? 0)), z);
      m.rotation.y = o.ry ?? seed * 1.7;
      m.castShadow = o.shadow ?? true; m.receiveShadow = true;
      G.add(m); return m;
    };

    // ---- the seabed: one long faceted sand strip
    const W = 150, D = 90;
    const floor = new THREE.PlaneGeometry(W, D, 75, 36);
    floor.rotateX(-Math.PI / 2);
    floor.translate(-20, 0, -D / 2 + 9);
    const FP = floor.attributes.position as THREE.BufferAttribute, FU = floor.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < FP.count; i++) { const x = FP.getX(i), z = FP.getZ(i); FP.setY(i, floorAt(x, z) - (z < -40 ? (-40 - z) * 0.4 : 0)); FU.setXY(i, x / 3, z / 3); }
    const sand = psxMat(SAND(), { rough: 1 });
    (sand.map as THREE.Texture).wrapS = (sand.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
    const fl = new THREE.Mesh(facet(floor), sand); fl.receiveShadow = true;
    G.add(fl);

    // ---- the meadow on the slope (pixel clumps: eelgrass, turtle grass, red / brown algae, anemones, shells)
    const items: MeadowItem[] = [];
    const cells = [MC.eelShort, MC.eelMid, MC.eelTall, MC.turtle, MC.redAlgae, MC.brownAlgae, MC.greenAlgae, MC.caulerpa, MC.halimeda, MC.anemone, MC.duster, MC.sponge, MC.shells, MC.pebbles, MC.coralNub, MC.whips, MC.lettuce, MC.starLitter];
    let n = 0;
    for (let gx = -70; gx < 34; gx += 0.55) for (let gz = -16; gz < 2.6; gz += 0.55) {
      n++;
      const x = gx + (hash2(n, 1, 11) - 0.5) * 0.55, z = gz + (hash2(n, 2, 11) - 0.5) * 0.55;
      const patch = fbm(x * 0.09, z * 0.12, 2, 17);
      if (patch < 0.42 + (z > 0 ? 0.1 : 0)) continue;
      if (Math.abs(x - SIGN_X) < 1.5 && Math.abs(z - SIGN_Z) < 1.2) continue;
      const lush = (patch - 0.42) * 3;
      const c = patch > 0.62 ? cells[Math.floor(hash2(n, 3, 11) * 4)] : cells[Math.floor(hash2(n, 3, 11) * cells.length)];
      items.push({ x, y: floorAt(x, z) - 0.02, z, rot: hash2(n, 4, 11) * TAU, size: 0.45 + lush * 0.7 + hash2(n, 5, 11) * 0.45, cell: c, tint: 0.82 + hash2(n, 6, 11) * 0.36 });
    }
    G.add(makeMeadowChunked(items, 16));

    // ---- rocks: the midground scatter, outcrops behind, far pinnacles
    for (let i = 0; i < 26; i++) {
      const x = -66 + i * 3.7 + hash2(i, 1, 3) * 2.5, z = -2.6 - hash2(i, 2, 3) * 5.5;
      if (Math.abs(x - SIGN_X) < 2.6 && z > -4) continue;
      const s = 0.4 + hash2(i, 3, 3) * (i % 4 === 0 ? 1.8 : 0.9);
      rock(100 + i, x, z, s * 1.3, s, s * 1.1, { top: 0.4 });
    }
    for (let i = 0; i < 14; i++) {
      const x = -72 + i * 7.5 + hash2(i, 1, 5) * 4, z = -12 - hash2(i, 2, 5) * 10;
      const s = 2.2 + hash2(i, 3, 5) * 3.5;
      rock(200 + i, x, z, s * 1.3, s * (0.9 + hash2(i, 4, 5)), s, { detail: 2, top: 0.5 });
    }
    // a great flat-topped outcrop right behind the sign, so it stands against rock, not open water
    rock(300, SIGN_X + 3.5, -9, 6.5, 4.2, 4, { detail: 2, top: 0.45, rough: 0.35 });
    rock(301, SIGN_X - 5, -11, 4.5, 6, 3.5, { detail: 2, rough: 0.4 });
    for (let i = 0; i < 12; i++) {
      const x = -90 + i * 13 + hash2(i, 1, 7) * 6, z = -38 - hash2(i, 2, 7) * 34;
      const h = 9 + hash2(i, 3, 7) * 18;
      rock(400 + i, x, z, 3 + hash2(i, 4, 7) * 5, h, 3 + hash2(i, 5, 7) * 4, { detail: 1, rough: 0.55, shadow: false, sink: 0.05 });
    }

    // ---- kelp: a forest behind, rising into the light
    const km = kelpMat();
    for (let i = 0; i < 46; i++) {
      const clump = Math.floor(i / 3);
      const x = -68 + clump * 6.6 + hash2(i, 1, 9) * 3.2 + (i % 3) * 0.9, z = -7 - hash2(i, 2, 9) * 14 - (i % 3) * 1.5;
      if (Math.abs(x - SIGN_X) < 2 && z > -9) continue;
      const h = 7 + hash2(i, 3, 9) * 9;
      const m = new THREE.Mesh(kelpGeo(h, i * 1.7), km);
      m.position.set(x, floorAt(x, z) - 0.1, z);
      G.add(m);
    }
    // ---- foreground silhouettes close to the lens (dark, unlit): kelp fronds and boulders sliding by
    const silK = new THREE.MeshBasicMaterial({ map: KELP(), alphaTest: 0.5, side: THREE.DoubleSide, color: '#16404e' });
    const silR = new THREE.MeshBasicMaterial({ color: '#0a2430' });
    for (let i = 0; i < 16; i++) {
      const x = -64 + i * 6.1 + hash2(i, 1, 13) * 3, z = 3.4 + hash2(i, 2, 13) * 2.2;
      if (x > -9 && x < 8) continue;
      if (i % 3 === 2) {
        const r = new THREE.Mesh(boulder(500 + i, 1.4 + hash2(i, 3, 13), 1.2 + hash2(i, 4, 13) * 1.3, 1, 1, 0.5), silR);
        r.position.set(x, floorAt(x, z) + 0.2, z); G.add(r);
      } else {
        const m = new THREE.Mesh(kelpGeo(5 + hash2(i, 3, 13) * 5, i * 2.3), silK);
        m.position.set(x, floorAt(x, z) - 0.2, z); m.scale.setScalar(1.15); G.add(m);
      }
    }

    // ---- critters near the sign: a crab pottering on the cairn, starfish, a sea urchin
    const ck = new Kit();
    const shell = psxMat(null, { color: '#c8442a', rough: 0.6 }), dark = psxMat(null, { color: '#2a0a08', rough: 0.8 });
    ck.sphere(shell, 0.16, 0, 0.08, 0, { w: 7, h: 4, sy: 0.55, sx: 1.15 });
    for (const s of [-1, 1]) for (let l = 0; l < 3; l++) ck.box(shell, 0.04, 0.03, 0.18, (l - 1) * 0.08, 0.04, s * 0.17, { ry: s * (0.4 - l * 0.3), chamfer: 0 });
    for (const s of [-1, 1]) { ck.sphere(shell, 0.065, 0.2, 0.08, s * 0.1, { w: 5, h: 4, sx: 1.3 }); ck.box(dark, 0.02, 0.06, 0.02, 0.1, 0.16, s * 0.05, { chamfer: 0 }); }
    this.crab.add(ck.build());
    G.add(this.crab);
    const star = psxMat(null, { color: '#e87a3a', rough: 0.8 });
    for (const [sx, sz, c] of [[SIGN_X + 1.6, SIGN_Z + 0.9, '#e87a3a'], [SIGN_X - 3.2, SIGN_Z + 0.4, '#c84a7a'], [-14, -1.5, '#e8a03a']] as const) {
      const k = new Kit();
      const m = c === '#e87a3a' ? star : psxMat(null, { color: c, rough: 0.8 });
      for (let a = 0; a < 5; a++) k.box(m, 0.22, 0.04, 0.07, Math.cos((a / 5) * TAU) * 0.1, 0.02, Math.sin((a / 5) * TAU) * 0.1, { ry: -(a / 5) * TAU, chamfer: 0.015 });
      const g = k.build(); g.position.set(sx, floorAt(sx, sz) + 0.01, sz); g.rotation.y = sx; G.add(g);
    }
    // bubble vents along the way
    for (const x of [-48, -31, -17, 6.5, 18]) this.vents.push(new THREE.Vector3(x, floorAt(x, -3) + 0.1, -3 - (x % 3)));

    // ---- fish: a school cruising along with the hero, one milling far back, one circling by the sign
    const fm = psxMat(FISH(), { rough: 0.35, metal: 0.3, side: THREE.DoubleSide });
    const school = (n2: number, kind: School['kind'], c: THREE.Vector3, r: number, sp: number, spread: THREE.Vector3) => {
      const mesh = new THREE.InstancedMesh(fishGeo(), fm, n2);
      mesh.frustumCulled = false;
      const fish = Array.from({ length: n2 }, (_, i) => ({ o: new THREE.Vector3((hash2(i, 2, n2) - 0.5) * spread.x, (hash2(i, 3, n2) - 0.5) * spread.y, (hash2(i, 4, n2) - 0.5) * spread.z), ph: hash2(i, 1, n2) * TAU, s: 0.8 + hash2(i, 5, n2) * 0.6 }));
      this.schools.push({ mesh, fish, kind, c, r, sp });
      G.add(mesh);
    };
    school(34, 'cruise', new THREE.Vector3(-40, FLOOR + 4.6, -4.5), 0, 3.9, new THREE.Vector3(5, 1.6, 2.4));
    school(70, 'mill', new THREE.Vector3(-12, FLOOR + 7.5, -22), 6, 0.22, new THREE.Vector3(2, 1.4, 2));
    school(26, 'mill', new THREE.Vector3(SIGN_X + 5, FLOOR + 3.4, -5), 2.4, -0.4, new THREE.Vector3(1.4, 0.9, 1.4));

    // ---- a humpback far off
    const wm = psxMat(WHALE(), { rough: 0.8 });
    this.fluke.add(new THREE.Mesh(flukeGeo(), psxMat(WHALE(), { rough: 0.8, side: THREE.DoubleSide })));
    this.fluke.position.x = -7;
    this.whale.add(new THREE.Mesh(whaleGeo(), wm), this.fluke);
    this.whale.scale.setScalar(1.7);
    G.add(this.whale);

    // ---- god-ray cards
    const rt = RAY();
    for (let i = 0; i < 16; i++) {
      const w = 1.6 + hash2(i, 1, 6) * 2.6, h = 26 + hash2(i, 2, 6) * 10;
      const mat = new THREE.MeshBasicMaterial({ map: rt, color: '#d8fff4', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.geometry.translate(0, -h / 2, 0);
      m.position.set(-70 + i * 6.4 + hash2(i, 3, 6) * 3, 0, -4 - hash2(i, 4, 6) * 20);
      m.rotation.z = -0.28;
      m.renderOrder = 8;
      G.add(m);
      this.rays.push({ m, ph: hash2(i, 5, 6) * 10, base: 0.1 + hash2(i, 6, 6) * 0.12 });
    }

    // ---- the signpost
    this.sign.group.position.copy(this.signAt);
    G.add(this.sign.group);

    // ---- the hero: kasa hat on, the toothpick slung across its back
    this.hero = new CosmeticPuppet();
    this.hero.onLand = false;
    this.hero.play('swim');
    this.hero.setExpression('brave');
    this.hero.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    G.add(this.hero.root);
    this.slingSword();

    // light: the key from the surface (upper left), meadow matched to the look
    const L = this.light;
    L.applyLook(TITLE_LOOK);
    meadowLook(TITLE_LOOK.sun, TITLE_LOOK.sunI, TITLE_LOOK.hemiSky, TITLE_LOOK.hemiGround, TITLE_LOOK.hemi);
    this.lamp = L.lamp(0, 0, 0, '#ffa850', 3.5, 6.5);
  }

  /** the sword rides on the back while travelling: hide the hand weapon, pin a copy diagonally across the back */
  private slingSword() {
    const m = this.hero.model;
    m.weaponCtl = 'external';
    m.weaponVisible = false;
    const w = m.weapon;
    if (!w) return;
    const copy = w.clone(true);
    copy.scale.setScalar(0.85);
    const holder = new THREE.Group();
    holder.add(copy);
    // samurai-style: the grip pokes up behind the hat brim, the blade runs down and back across the body
    copy.rotation.set(0, 0, 3.8);
    copy.position.set(0.16, 0.2, 0.2);
    this.hero.attach('back', holder);
  }

  /** re-light the meadow and the rig (on entering the screen: other screens change the shared uniforms) */
  applyLook() {
    this.light.applyLook(TITLE_LOOK);
    meadowLook(TITLE_LOOK.sun, TITLE_LOOK.sunI, TITLE_LOOK.hemiSky, TITLE_LOOK.hemiGround, TITLE_LOOK.hemi);
  }

  update(dt: number, t: number, cam: THREE.Camera) {
    KELP_T.value = t;
    this.fx.update(dt);
    this.light.follow(cam.position.x, cam.position.y - 1.5);
    for (const r of this.rays) {
      r.m.rotation.y = Math.atan2(cam.position.x - r.m.position.x, cam.position.z - r.m.position.z);
      (r.m.material as THREE.MeshBasicMaterial).opacity = r.base * (0.6 + 0.4 * Math.sin(t * 0.3 + r.ph));
    }
    // schools
    const hx = this.hero.root.position.x;
    for (const sc of this.schools) {
      let cx = sc.c.x, cy = sc.c.y, cz = sc.c.z;
      if (sc.kind === 'cruise') {
        // overtakes the hero along the meadow, then wraps round behind the camera again
        sc.c.x += sc.sp * dt;
        if (sc.c.x > hx + 28) sc.c.x = hx - 30;
        cx = sc.c.x; cy += Math.sin(t * 0.5) * 0.5;
      } else { cx += Math.sin(t * 0.07 + sc.c.z) * 2; cy += Math.sin(t * 0.11) * 0.6; }
      sc.fish.forEach((f, i) => {
        let x: number, y: number, z: number, yaw: number;
        if (sc.kind === 'cruise') { x = cx + f.o.x + Math.sin(t * 0.8 + f.ph) * 0.3; y = cy + f.o.y + Math.sin(t * 1.1 + f.ph) * 0.2; z = cz + f.o.z; yaw = 0; }
        else { const a = f.ph + t * sc.sp; x = cx + Math.cos(a) * sc.r + f.o.x; y = cy + Math.sin(a * 2 + i) * 0.3 + f.o.y; z = cz + Math.sin(a) * sc.r * 0.6 + f.o.z; yaw = Math.atan2(-Math.cos(a) * 0.6 * Math.sign(sc.sp), -Math.sin(a) * Math.sign(sc.sp)); }
        this.e.set(0, yaw, Math.sin(t * 9 + i) * 0.15);
        this.q.setFromEuler(this.e);
        this.m4.compose(this.v.set(x, y, z), this.q, this.s.set(f.s, f.s, f.s));
        sc.mesh.setMatrixAt(i, this.m4);
      });
      sc.mesh.instanceMatrix.needsUpdate = true;
    }
    // the whale: a slow pass far off, fluke beating
    this.whaleT += dt;
    const wk = (this.whaleT % 120) / 120;
    this.whale.position.set(cam.position.x * 0.6 - 70 + wk * 140, FLOOR + 12 + Math.sin(wk * Math.PI) * 3, -62);
    this.whale.rotation.set(0, 0.05, Math.sin(this.whaleT * 0.4) * 0.03);
    this.fluke.rotation.z = Math.sin(this.whaleT * 0.9) * 0.35;
    if (Math.abs((this.whaleT % 120) - 40) < dt) this.onWhale?.();
    // the crab: scuttles back and forth along the cairn's front, pausing
    this.crabT += dt;
    const ck = this.crabT % 9, sx = this.signAt.x, ph = ck < 3 ? ck / 3 : ck < 4.5 ? 1 : ck < 7.5 ? 1 - (ck - 4.5) / 3 : 0;
    const cxp = sx - 1.4 + ph * 2.7, czp = this.signAt.z + 1.05;
    this.crab.position.set(cxp, floorAt(cxp, czp) + 0.02 + (ck < 3 || (ck > 4.5 && ck < 7.5) ? Math.abs(Math.sin(t * 22)) * 0.015 : 0), czp);
    this.crab.rotation.y = damp(this.crab.rotation.y, ck < 4.5 ? -Math.PI / 2 : Math.PI / 2, 6, dt) ;
    // vents, the lantern's light, the sign
    for (const p of this.vents) if (Math.random() < dt * 3) this.bubbles.emit(p.x + (Math.random() - 0.5) * 0.3, p.y, p.z, { vy: 0.3, life: 9, size: 0.04 + Math.random() * 0.06 });
    // marine snow drifting through the frame around the camera
    const cx0 = cam.position.x;
    if (Math.random() < dt * 40) this.snow.emit(cx0 - 8 + Math.random() * 18, FLOOR + 6 + Math.random() * 6, -6 + Math.random() * 12, { life: 12, size: 0.03 + Math.random() * 0.035 });
    this.snow.update(dt, t, 'drift');
    this.bubbles.update(dt, t, 'rise');
    this.light.tick();
  }

  /** prefill marine snow around a point (on entering, so the water is never empty) */
  seedSnow(x: number) { for (let i = 0; i < 300; i++) this.snow.emit(x - 14 + Math.random() * 30, FLOOR + Math.random() * 13, -8 + Math.random() * 14, { life: 4 + Math.random() * 12, size: 0.03 + Math.random() * 0.035 }); }
  setScale(px: number) { this.snow.setScale(px); this.bubbles.setScale(px); }
}
