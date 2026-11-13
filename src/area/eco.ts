// The area's living ecosystem, a small food chain that runs on its own:
//   plankton clouds (drifting specks, food that regrows)
//     -> small-fish schools (instanced boids) graze the clouds, scatter from the blobfish and from predators
//       -> hunters (src/creatures/eco.ts) stalk and eat school fish, leaving remains on the seabed
//         -> scavengers (crabs, sea cucumbers) walk over and pick the remains clean.
// Populations respawn off-screen at the area ends. Everyone is neutral to the player unless provoked;
// hunters and scavengers drop materials when killed.
import * as THREE from 'three';
import type { World, Entity } from '../game/types';
import type { AreaDef } from './defs';
import type { Scenery } from './scenery';
import { FishSchool, preloadFish } from '../fish';
import { Hunter, Scavenger, EcoLink, Prey } from '../creatures/eco';
import { Soup } from '../world/lp';
import { Rng } from '../core/rng';
import { clamp, damp } from '../core/math';
import { UW } from '../gfx/shaders/underwater';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ plankton
class Plankton {
  points: THREE.Points;
  clouds: { x: number; y: number; r: number; food: number; vx: number; ph: number }[] = [];
  private pos: Float32Array;
  private mat: THREE.ShaderMaterial;
  private food: Float32Array;
  static PER = 140;
  constructor(n: number, color: string, glow: boolean, rng: Rng, x0: number, x1: number, floorAt: (x: number) => number) {
    for (let i = 0; i < n; i++) {
      const x = rng.range(x0, x1), fl = floorAt(x);
      this.clouds.push({ x, y: rng.range(fl + 2.5, -2), r: rng.range(2.2, 3.6), food: rng.range(0.6, 1), vx: rng.range(-0.15, 0.15), ph: rng.range(0, 10) });
    }
    const N = n * Plankton.PER;
    this.pos = new Float32Array(N * 3);
    const off = new Float32Array(N * 4);
    this.food = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = rng.range(0, TAU), rr = Math.sqrt(rng.next());
      off[i * 4] = Math.cos(a) * rr; off[i * 4 + 1] = Math.sin(a) * rr * 0.6; off[i * 4 + 2] = rng.range(-2.2, 1.6); off[i * 4 + 3] = rng.next();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aOff', new THREE.BufferAttribute(off, 4));
    g.setAttribute('aFood', new THREE.BufferAttribute(this.food, 1).setUsage(THREE.DynamicDrawUsage));
    // hard pixel specks that write depth (so the water fog treats them like the near things they are)
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uT: UW.uTime, uCol: { value: new THREE.Color(color).multiplyScalar(glow ? 2.6 : 1.3) }, uScale: { value: 420 } },
      vertexShader: /* glsl */ `
        attribute vec4 aOff; attribute float aFood; uniform float uT; uniform float uScale; varying float vA;
        void main() {
          vec3 p = position;
          float s = aOff.w;
          p.x += sin(uT * (0.3 + s * 0.5) + s * 40.0) * 0.25;
          p.y += cos(uT * (0.25 + s * 0.4) + s * 23.0) * 0.18;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = step(s, aFood) * (0.55 + 0.45 * sin(uT * (1.5 + s * 4.0) + s * 60.0));
          gl_PointSize = vA > 0.05 ? max(1.0, (0.035 + s * 0.03) * uScale / -mv.z) : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; varying float vA;
        void main() { if (vA < 0.05) discard; gl_FragColor = vec4(uCol * (0.5 + vA * 0.7), 1.0); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
  setScale(s: number) { this.mat.uniforms.uScale.value = s; }
  update(dt: number, x0: number, x1: number) {
    const P = Plankton.PER;
    const off = (this.points.geometry.attributes.aOff.array as Float32Array);
    for (let c = 0; c < this.clouds.length; c++) {
      const cl = this.clouds[c];
      cl.ph += dt;
      cl.x += (cl.vx + Math.sin(cl.ph * 0.07) * 0.1) * dt;
      if (cl.x < x0) cl.vx = Math.abs(cl.vx); if (cl.x > x1) cl.vx = -Math.abs(cl.vx);
      cl.food = Math.min(1, cl.food + dt * 0.01);   // plankton blooms back slowly
      for (let i = 0; i < P; i++) {
        const k = c * P + i;
        this.pos[k * 3] = cl.x + off[k * 4] * cl.r;
        this.pos[k * 3 + 1] = cl.y + off[k * 4 + 1] * cl.r;
        this.pos[k * 3 + 2] = off[k * 4 + 2];
        this.food[k] = cl.food;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aFood.needsUpdate = true;
  }
  dispose() { this.points.geometry.dispose(); this.mat.dispose(); }
}

// ------------------------------------------------------------------ schools
interface Member extends Prey { z: number; vx: number; vy: number; ph: number; s: number; flash: number }
class School {
  fish: FishSchool;
  m: Member[] = [];
  cx: number; cy: number;
  target: { x: number; y: number } | null = null;
  scare = 0; scareX = 0; scareY = 0;
  regrow = 0;
  len: number;
  constructor(public species: string, n: number, x: number, y: number, rng: Rng, public scale: number) {
    this.fish = new FishSchool(species, n);
    this.len = this.fish.length * scale;
    this.cx = x; this.cy = y;
    for (let i = 0; i < n; i++) this.m.push({ x: x + rng.range(-1.5, 1.5), y: y + rng.range(-0.8, 0.8), z: rng.range(-2.4, 1.2), vx: rng.range(-1, 1), vy: 0, ph: rng.range(0, 10), s: rng.range(0.85, 1.15), alive: true, flash: 0 });
  }
  get count() { let n = 0; for (const f of this.m) if (f.alive) n++; return n; }
}

// ------------------------------------------------------------------ remains (bones on the sand)
interface Remains { x: number; y: number; vy: number; left: number; age: number; mesh: THREE.Mesh }

export class Ecosystem implements EcoLink {
  group = new THREE.Group();
  plankton: Plankton;
  schools: School[] = [];
  hunters: Hunter[] = [];
  scavs: Scavenger[] = [];
  remainsL: Remains[] = [];
  private rng: Rng;
  private t = 0;
  private spawnT = 0;
  private boneGeo: THREE.BufferGeometry;
  private x0: number; private x1: number;

  constructor(public a: AreaDef, public scen: Scenery, public w: World, seed: number) {
    this.rng = new Rng(seed ^ 0xec0);
    this.x0 = scen.shape.X0 + 6; this.x1 = scen.shape.X1 - 6;
    try { preloadFish([...a.eco.schools, ...a.eco.hunters, ...a.eco.scavengers]); } catch (e) { console.warn('eco preload', e); }
    this.plankton = new Plankton(Math.round((this.x1 - this.x0) / 14), a.eco.plankton, !!a.glow, this.rng, this.x0, this.x1, (x) => scen.sand.heightAt(x));
    this.plankton.setScale(w.game.h * Math.min(devicePixelRatio || 1, 1.5) / (2 * Math.tan((w.camera.fov * Math.PI) / 360)));
    this.group.add(this.plankton.points);
    const bs = new Soup();
    const br = scen.props.get('bone');
    bs.tube([[-0.18, 0.02, 0], [0.18, 0.03, 0]], () => 0.018, 3, br);
    for (let i = 0; i < 5; i++) { const x = -0.12 + i * 0.06; bs.tube([[x, 0.03, 0], [x - 0.02, 0.1, 0.03]], () => 0.008, 3, br); bs.tube([[x, 0.03, 0], [x - 0.02, -0.03, 0.03]], () => 0.008, 3, br); }
    bs.lathe([[0.04, 0], [0.05, 0.04], [0, 0.07]], 4, br);
    this.boneGeo = bs.geometry();
    for (let i = 0; i < a.eco.schoolsN; i++) this.spawnSchool(this.rng.range(this.x0, this.x1));
    for (let i = 0; i < a.eco.huntersN; i++) this.spawnHunter(this.rng.range(this.x0, this.x1));
    for (let i = 0; i < a.eco.scavN; i++) this.spawnScav(this.rng.range(this.x0, this.x1));
  }

  bounds() { return { x0: this.x0, x1: this.x1 }; }

  private spawnSchool(x: number) {
    const sp = this.rng.pick(this.a.eco.schools);
    const fl = this.scen.sand.heightAt(x);
    const y = clamp(this.rng.range(fl + 2, -2.5), fl + 1.5, -2);
    const n = sp === 'sardine' ? this.rng.int(16, 26) : this.rng.int(6, 10);
    try {
      const s = new School(sp, n, x, y, this.rng, sp === 'sardine' ? 1.5 : 1.25);
      this.group.add(s.fish.mesh);
      this.schools.push(s);
    } catch (e) { console.warn('school', sp, e); }
  }
  private spawnHunter(x: number) {
    const sp = this.rng.pick(this.a.eco.hunters);
    const fl = this.scen.sand.heightAt(x);
    try { this.hunters.push(this.w.add(new Hunter(sp, x, clamp(this.rng.range(fl + 2, -3), fl + 1.5, -2.5), this))); } catch (e) { console.warn('hunter', sp, e); }
  }
  private spawnScav(x: number) {
    const sp = this.rng.pick(this.a.eco.scavengers);
    try { this.scavs.push(this.w.add(new Scavenger(sp, x, this.scen.sand.heightAt(x) + 0.2, this))); } catch (e) { console.warn('scav', sp, e); }
  }

  // ------------------------------------------------------------------ EcoLink
  findPrey(x: number, y: number, r: number): Prey | null {
    let best: Member | null = null, bd = r;
    for (const s of this.schools) for (const f of s.m) {
      if (!f.alive) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  eat(p: Prey, byX: number, byY: number) {
    const f = p as Member;
    if (!f.alive) return;
    f.alive = false;
    for (const s of this.schools) if (s.m.includes(f)) { s.scare = 2.5; s.scareX = byX; s.scareY = byY; }
    this.remains(f.x, f.y);
  }
  findRemains(x: number, y: number, r: number) {
    let best: Remains | null = null, bd = r;
    for (const m of this.remainsL) { if (m.left <= 0 || m.vy !== 0) continue; const d = Math.abs(m.x - x) + Math.abs(m.y - y) * 0.5; if (d < bd) { bd = d; best = m; } }
    return best;
  }
  nibble(r: { x: number; y: number; left: number }, k: number) { r.left -= k; return r.left; }

  /** drop remains at (x, y): they sink to the sand and wait for scavengers (also called on every kill) */
  remains(x: number, y: number) {
    if (this.remainsL.length > 14) { const old = this.remainsL.shift()!; old.mesh.removeFromParent(); }
    const mesh = new THREE.Mesh(this.boneGeo, this.scen.mats.prop);
    mesh.rotation.set(this.rng.range(-0.3, 0.3), this.rng.range(0, 6), this.rng.range(-0.3, 0.3));
    mesh.position.set(x, y, 0.1);
    this.group.add(mesh);
    this.remainsL.push({ x, y, vy: -0.4, left: 1, age: 0, mesh });
  }
  /** something big happened at (x, y): schools scatter, hunters flinch */
  scare(x: number, y: number, r: number) {
    for (const s of this.schools) if (Math.hypot(s.cx - x, s.cy - y) < r + 4) { s.scare = 3; s.scareX = x; s.scareY = y; }
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number, camX: number) {
    this.t += dt;
    const w = this.w, p = w.player;
    this.plankton.update(dt, this.x0, this.x1);
    for (const s of this.schools) this.updateSchool(s, dt, p);
    // remains sink and get eaten / decay
    for (let i = this.remainsL.length - 1; i >= 0; i--) {
      const r = this.remainsL[i];
      r.age += dt;
      const fl = this.scen.sand.heightAt(r.x) + 0.03;
      if (r.vy !== 0) { r.vy -= 1.2 * dt; r.y += r.vy * dt; if (r.y <= fl) { r.y = fl; r.vy = 0; } }
      else r.y = fl;
      r.mesh.position.set(r.x, r.y, 0.1);
      const k = Math.max(0, Math.min(1, r.left)) * Math.min(1, (60 - r.age) / 5);
      r.mesh.scale.setScalar(Math.max(0.01, k));
      if (k <= 0.01) { r.mesh.removeFromParent(); this.remainsL.splice(i, 1); }
    }
    // populations: top up off-screen at the far end from the camera
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 4;
      this.schools = this.schools.filter((s) => { if (s.count === 0 && s.regrow > 30) { s.fish.mesh.removeFromParent(); s.fish.dispose(); return false; } return true; });
      this.hunters = this.hunters.filter((h) => h.alive);
      this.scavs = this.scavs.filter((h) => h.alive);
      const far = () => { const side = camX - this.x0 > this.x1 - camX ? -1 : 1; return side < 0 ? this.rng.range(this.x0, Math.max(this.x0 + 1, camX - 22)) : this.rng.range(Math.min(this.x1 - 1, camX + 22), this.x1); };
      if (this.schools.length < this.a.eco.schoolsN) this.spawnSchool(far());
      else if (this.hunters.length < this.a.eco.huntersN) this.spawnHunter(far());
      else if (this.scavs.length < this.a.eco.scavN) this.spawnScav(far());
    }
  }

  private updateSchool(s: School, dt: number, p: Entity) {
    const n = s.m.length;
    s.scare = Math.max(0, s.scare - dt);
    // the school's goal: the richest nearby plankton cloud, else drift
    if (!s.target || this.rng.chance(dt * 0.1)) {
      let best = null as Plankton['clouds'][number] | null, bv = -1;
      for (const c of this.plankton.clouds) { const v = c.food / (1 + Math.abs(c.x - s.cx) * 0.08); if (v > bv) { bv = v; best = c; } }
      s.target = best ? { x: best.x, y: best.y } : null;
    }
    let cx = 0, cy = 0, alive = 0;
    for (const f of s.m) if (f.alive) { cx += f.x; cy += f.y; alive++; }
    if (alive) { s.cx = cx / alive; s.cy = cy / alive; }
    else s.regrow += dt;
    // grow back members when well fed
    if (alive && alive < n && this.rng.chance(dt * 0.05)) { const f = s.m.find((q) => !q.alive); if (f) { f.alive = true; f.x = s.cx + this.rng.range(-0.5, 0.5); f.y = s.cy; f.vx = 0; f.vy = 0; } }
    const cloud = this.plankton.clouds.find((c) => Math.hypot(c.x - s.cx, c.y - s.cy) < c.r);
    if (cloud) cloud.food = Math.max(0, cloud.food - dt * 0.004 * alive);
    const tgt = s.target;
    const dangerX = s.scare > 0 ? s.scareX : p.x, dangerY = s.scare > 0 ? s.scareY : p.y;
    const dangerR = s.scare > 0 ? 6 : 2.6;
    for (let i = 0; i < n; i++) {
      const f = s.m[i];
      if (!f.alive) { s.fish.hide(i); continue; }
      f.ph += dt;
      let ax = 0, ay = 0;
      // cohesion + goal
      ax += (s.cx - f.x) * 0.6; ay += (s.cy - f.y) * 0.6;
      if (tgt) { ax += clamp(tgt.x - s.cx, -3, 3) * 0.35; ay += clamp(tgt.y - s.cy, -2, 2) * 0.35; }
      // milling around while grazing
      ax += Math.cos(f.ph * 0.7 + i) * 1.2; ay += Math.sin(f.ph * 0.9 + i * 2) * 0.6;
      // separation (a few neighbours)
      for (let k = 1; k <= 3; k++) {
        const o = s.m[(i + k * 5) % n];
        if (!o.alive || o === f) continue;
        const dx = f.x - o.x, dy = f.y - o.y, d2 = dx * dx + dy * dy;
        if (d2 < 0.16) { ax += dx / (d2 + 0.02) * 0.3; ay += dy / (d2 + 0.02) * 0.3; }
      }
      // flee danger (the blobfish, a striking hunter, an explosion)
      const fx = f.x - dangerX, fy = f.y - dangerY, fd = Math.hypot(fx, fy);
      if (fd < dangerR) { const k = (dangerR - fd) / dangerR * 18; ax += (fx / (fd || 1)) * k; ay += (fy / (fd || 1)) * k; f.flash = 0.3; }
      for (const h of this.hunters) { if (!h.alive) continue; const hx = f.x - h.x, hy = f.y - h.y, hd = Math.hypot(hx, hy); if (hd < 2.2) { ax += hx / (hd || 1) * 10; ay += hy / (hd || 1) * 10; } }
      // terrain + surface
      const sd = this.w.terrain.sdf(f.x, f.y);
      if (sd < 1.2) { const nn = this.w.terrain.normal(f.x, f.y); ax += nn.x * (1.2 - sd) * 12; ay += nn.y * (1.2 - sd) * 12; }
      if (f.y > -1.2) ay -= (f.y + 1.2) * 10;
      if (f.x < this.x0) ax += 4; if (f.x > this.x1) ax -= 4;
      f.vx += ax * dt; f.vy += ay * dt;
      const sp = Math.hypot(f.vx, f.vy), max = s.scare > 0 || fd < dangerR ? 5.5 : 1.8;
      if (sp > max) { f.vx *= max / sp; f.vy *= max / sp; }
      f.vx = damp(f.vx, f.vx, 1, dt);
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.flash = Math.max(0, f.flash - dt);
      const yaw = f.vx >= 0 ? 0 : -Math.PI;
      const pitch = clamp(Math.atan2(f.vy, Math.abs(f.vx) + 0.3), -0.6, 0.6);
      const swim = Math.min(1, Math.hypot(f.vx, f.vy) / 3);
      s.fish.set(i, f.x, f.y, f.z, yaw, pitch, s.scale * f.s, f.ph * (6 + swim * 10), 0.06 + swim * 0.1, 0, f.flash * 0.6);
    }
    s.fish.commit();
  }

  dispose() {
    for (const s of this.schools) { s.fish.mesh.removeFromParent(); s.fish.dispose(); }
    for (const h of this.hunters) h.alive = false;
    for (const h of this.scavs) h.alive = false;
    for (const r of this.remainsL) r.mesh.removeFromParent();
    this.boneGeo.dispose();
    this.plankton.dispose();
    this.group.removeFromParent();
  }
}
