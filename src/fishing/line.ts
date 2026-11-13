// Fishing line: a Verlet rope from the rod tip (above the water) down to the hook.
//
// Physics: nodes integrate with gravity in air and a gentle sink + heavy drag in water; distance constraints
// are one-sided (a line can go slack but never stretch past its paid-out length); nodes collide with the
// terrain, so the line drapes over the seabed and wraps around rocks. The line end is either free (hook +
// sinker + bait) or pinned to whatever bit the hook (the blobfish's mouth).
//
// Tension: when both ends are pinned and the path is longer than the paid-out length, the residual stretch is
// the tension. Like a real reel it has DRAG: above the drag limit line pays out (clicking), above the
// breaking strength the line takes damage. Every node touching rock costs tension by the capstan equation
// (T_out = T_in * e^(-mu*theta)) — wrap the line around a rock and the fisherman is pulling the rock, not
// you — and the rock frays the line (sharp rocks/coral much faster).
//
// Damage: slash(a, b) (sword / laser / zap), rock friction, sharp entities (cutsLines), over-tension.
// At 0 hp the line SNAPS at its weakest node: the upper half whips back to the rod, the lower half falls away.
import * as THREE from 'three';
import type { Entity, World, Team } from '../game/types';
import { segHit, segDist, clamp, smooth } from '../core/math';

const MAXN = 64;

export interface LineSpec {
  hp: number;           // line health
  breaking: number;     // tension (m/s^2 at the fish) above which the line takes damage
  drag: number;         // tension at which the reel pays out
  k: number;            // stiffness: tension per metre of stretch
  leader?: number;      // metres of wire leader at the hook end (can't be cut by blades)
  color?: string;
  name?: string;
}
export const LINES: Record<string, LineSpec> = {
  mono: { hp: 8, breaking: 30, drag: 19, k: 55, color: '#e8fbff', name: 'monofilament' },
  braid: { hp: 13, breaking: 36, drag: 23, k: 70, color: '#ffe2a0', name: 'braided line' },
  wire: { hp: 11, breaking: 34, drag: 22, k: 70, leader: 1.4, color: '#d8dde4', name: 'wire leader' },
  heavy: { hp: 18, breaking: 44, drag: 28, k: 85, color: '#ffb0a0', name: 'trawler cord' },
};

export class FishingLine implements Entity {
  kind = 'line'; team: Team = 'neutral';
  x = 0; y = 0; vx = 0; vy = 0; r = 0.05; alive = true;
  spec: LineSpec;
  hp: number;
  n = 2;
  px = new Float32Array(MAXN); py = new Float32Array(MAXN); ox = new Float32Array(MAXN); oy = new Float32Array(MAXN);
  wear = new Float32Array(MAXN);    // per-node damage (fray visuals + snap point)
  contact = new Uint8Array(MAXN);
  restLen = 1;                      // paid-out line length
  tip = new THREE.Vector2();        // rod tip (pinned)
  end: { x: number; y: number } | null = null; // pinned end (a mouth), or null = free
  endMass = 1;                      // sinker/bait weight on a free end
  tension = 0;                      // raw tension at the rod
  tensionFish = 0;                  // tension reaching the hooked end (after capstan losses)
  wrap = 0;                         // total wrap angle (radians) around rocks
  paying = 0;                       // drag pay-out speed this frame (for the clicking sound)
  snapped = false;
  onSnap?: (how: string, x: number, y: number, w: World) => void;
  lastHit = 0;
  obj: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private strain = 0;
  private hitCd = 0;
  /** pieces flying away after a snap */
  private whip: { x: Float32Array; y: Float32Array; ox: Float32Array; oy: Float32Array; n: number; t: number; pinTip: boolean }[] = [];

  constructor(spec: LineSpec = LINES.mono) {
    this.spec = spec;
    this.hp = spec.hp;
    // ribbon geometry: 2 verts per node, expanded in the vertex shader
    this.geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAXN * 2 * 3), side = new Float32Array(MAXN * 2), along = new Float32Array(MAXN * 2), wear = new Float32Array(MAXN * 2), dir = new Float32Array(MAXN * 2 * 2);
    for (let i = 0; i < MAXN; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
    const idx: number[] = [];
    for (let i = 0; i < MAXN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    this.geo.setAttribute('aWear', new THREE.BufferAttribute(wear, 1));
    this.geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 2));
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(spec.color ?? '#e8fbff') }, uTension: { value: 0 }, uTime: { value: 0 }, uWidth: { value: 0.016 }, uWaterY: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aSide; attribute float aAlong; attribute float aWear; attribute vec2 aDir;
        uniform float uWidth; uniform float uTension; uniform float uTime;
        varying float vAlong; varying float vWear; varying float vSide; varying float vY;
        void main() {
          vec2 nrm = vec2(-aDir.y, aDir.x);
          vec3 p = position;
          // taut lines hum: a fine vibration across the line
          p.xy += nrm * sin(aAlong * 90.0 + uTime * 70.0) * 0.006 * uTension;
          float w = uWidth * (1.0 + aWear * 1.6);
          p.xy += nrm * aSide * w;
          vAlong = aAlong; vWear = aWear; vSide = aSide; vY = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; uniform float uTension; uniform float uTime; uniform float uWaterY;
        varying float vAlong; varying float vWear; varying float vSide; varying float vY;
        void main() {
          float core = 1.0 - abs(vSide);
          // frayed: broken fibres flicker in and out along the line
          float fib = fract(sin(floor(vAlong * 260.0) * 12.9898) * 43758.5);
          if (vWear > 0.15 && abs(vSide) > 0.45 && fib < vWear * 0.8) discard;
          vec3 c = uCol;
          c = mix(c, vec3(1.0, 0.35, 0.25), clamp(vWear * 1.3, 0.0, 1.0));       // worn: red-hot
          c = mix(c, vec3(1.0, 0.95, 0.75), clamp(uTension - 0.6, 0.0, 1.0) * 0.6); // strained: glowing
          float glint = step(0.92, fract(vAlong * 6.0 - uTime * 0.4)) * 0.6;
          float air = step(uWaterY, vY);
          c *= 0.9 + core * 0.5 + glint * air;
          gl_FragColor = vec4(c * (1.0 + air * 0.5), 1.0);
        }`,
      side: THREE.DoubleSide,
    });
    this.obj = new THREE.Mesh(this.geo, this.mat);
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 5;
  }

  /** lay the line out straight from the tip to (x, y) with the given length */
  reset(tipX: number, tipY: number, x: number, y: number, len: number) {
    this.tip.set(tipX, tipY);
    this.restLen = Math.max(0.5, len);
    this.n = clamp(Math.round(this.restLen / 0.35) + 2, 8, MAXN);
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      this.px[i] = this.ox[i] = tipX + (x - tipX) * t;
      this.py[i] = this.oy[i] = tipY + (y - tipY) * t;
      this.wear[i] = 0;
    }
    this.hp = this.spec.hp; this.snapped = false; this.alive = true; this.whip.length = 0;
  }

  get endX() { return this.px[this.n - 1]; }
  get endY() { return this.py[this.n - 1]; }
  get seg() { return this.restLen / (this.n - 1); }

  /** pay line in (negative) or out (positive) */
  reel(dl: number) { this.restLen = clamp(this.restLen + dl, 0.6, 80); }

  update(dt: number, w: World) {
    this.mat.uniforms.uTime.value = w.time;
    this.updateWhip(dt, w);
    if (this.snapped) { if (!this.whip.length) this.alive = false; this.draw(w); return; }
    this.hitCd -= dt;
    const n = this.n;
    // re-sample the node count when the paid-out length changes a lot
    const want = clamp(Math.round(this.restLen / 0.35) + 2, 8, MAXN);
    if (Math.abs(want - n) > 3) this.resample(want);
    const sub = 3, h = dt / sub;
    const seg = this.seg;
    let stretchSum = 0;
    for (let s = 0; s < sub; s++) {
      for (let i = 1; i < this.n; i++) {
        const surf = w.water.heightAt(this.px[i]);
        const under = this.py[i] < surf;
        const vx = (this.px[i] - this.ox[i]) * (under ? 0.92 : 0.995), vy = (this.py[i] - this.oy[i]) * (under ? 0.92 : 0.995);
        this.ox[i] = this.px[i]; this.oy[i] = this.py[i];
        const isEnd = i === this.n - 1;
        const g = under ? -(isEnd ? 3.2 * this.endMass : 0.6) : -9.8;
        this.px[i] += vx; this.py[i] += vy + g * h * h;
      }
      // pins
      this.px[0] = this.tip.x; this.py[0] = this.tip.y;
      if (this.end) { this.px[this.n - 1] = this.end.x; this.py[this.n - 1] = this.end.y; }
      // one-sided distance constraints
      for (let it = 0; it < 16; it++) {
        for (let i = 0; i < this.n - 1; i++) {
          const dx = this.px[i + 1] - this.px[i], dy = this.py[i + 1] - this.py[i];
          const d = Math.hypot(dx, dy);
          if (d <= seg || d < 1e-6) continue;
          const diff = (d - seg) / d;
          const aPinned = i === 0, bPinned = i + 1 === this.n - 1 && !!this.end;
          const wa = aPinned ? 0 : bPinned ? 1 : 0.5, wb = bPinned ? 0 : aPinned ? 1 : 0.5;
          this.px[i] += dx * diff * wa; this.py[i] += dy * diff * wa;
          this.px[i + 1] -= dx * diff * wb; this.py[i + 1] -= dy * diff * wb;
        }
        // terrain collision (the line drapes and wraps)
        if (it % 4 === 3) {
          for (let i = 1; i < this.n - (this.end ? 1 : 0); i++) {
            const d = w.terrain.sdf(this.px[i], this.py[i]);
            if (d < 0.04) {
              const nn = w.terrain.normal(this.px[i], this.py[i]);
              this.px[i] += nn.x * (0.04 - d); this.py[i] += nn.y * (0.04 - d);
              this.contact[i] = 1;
              // friction: hold the node where it is along the surface
              this.ox[i] += (this.px[i] - this.ox[i]) * 0.5; this.oy[i] += (this.py[i] - this.oy[i]) * 0.5;
            } else this.contact[i] = 0;
          }
        }
      }
      if (s === sub - 1) {
        let L = 0;
        for (let i = 0; i < this.n - 1; i++) L += Math.hypot(this.px[i + 1] - this.px[i], this.py[i + 1] - this.py[i]);
        stretchSum = Math.max(0, L - this.restLen);
      }
    }
    // tension + capstan losses around rocks
    this.tension = this.end ? stretchSum * this.spec.k : 0;
    let wrap = 0;
    for (let i = 1; i < this.n - 1; i++) {
      if (!this.contact[i]) continue;
      const ax = this.px[i] - this.px[i - 1], ay = this.py[i] - this.py[i - 1], bx = this.px[i + 1] - this.px[i], by = this.py[i + 1] - this.py[i];
      wrap += Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
    }
    this.wrap = wrap;
    this.tensionFish = this.tension * Math.exp(-0.45 * wrap);
    // drag: pay out line above the drag limit
    this.paying = 0;
    if (this.tension > this.spec.drag) {
      const out = (this.tension - this.spec.drag) / this.spec.k * Math.min(1, dt * 8);
      this.restLen += out; this.paying = out / dt;
    }
    // over-tension and rock friction damage
    if (this.tension > this.spec.breaking) this.damage((this.tension - this.spec.breaking) * 0.09 * dt, this.weakest(), w, 'struggle');
    if (this.tension > 2) {
      for (let i = 1; i < this.n - 1; i++) {
        if (!this.contact[i]) continue;
        const sharp = this.sharpAt(this.px[i], this.py[i], w);
        const wd = this.tension * dt * (sharp ? 0.025 : 0.006);
        this.damage(wd, i, w, 'rock');
        if (sharp && Math.random() < dt * 8) w.fx.burst('spark', this.px[i], this.py[i], 2, 1.5, { size: 0.15 });
      }
    }
    // sharp friends (crabs etc.) nibble lines they touch
    for (const e of w.entities) {
      if (!e.alive || !e.cutsLines) continue;
      for (let i = 0; i < this.n - 1; i++) {
        if (segDist(e.x, e.y, this.px[i], this.py[i], this.px[i + 1], this.py[i + 1]).d < e.r + 0.05) { this.damage(dt * 2.2, i, w, 'object'); break; }
      }
    }
    this.strain = clamp(this.tension / this.spec.breaking, 0, 1.5);
    this.x = this.px[this.n - 1]; this.y = this.py[this.n - 1];
    this.draw(w);
  }

  private sharpAt(x: number, y: number, w: World) {
    for (const s of w.terrain.snags(x - 1, x + 1)) if (s.sharp && Math.hypot(s.x - x, s.y - y) < s.r + 0.2) return true;
    return false;
  }

  private weakest() { let b = 1, bw = -1; for (let i = 1; i < this.n - 1; i++) if (this.wear[i] > bw) { bw = this.wear[i]; b = i; } return b; }

  private resample(want: number) {
    const L: number[] = [0];
    for (let i = 1; i < this.n; i++) L.push(L[i - 1] + Math.hypot(this.px[i] - this.px[i - 1], this.py[i] - this.py[i - 1]));
    const tot = L[this.n - 1] || 1;
    const nx = new Float32Array(want), ny = new Float32Array(want), nw = new Float32Array(want);
    let j = 0;
    for (let k = 0; k < want; k++) {
      const d = (k / (want - 1)) * tot;
      while (j < this.n - 2 && L[j + 1] < d) j++;
      const t = (d - L[j]) / ((L[j + 1] - L[j]) || 1);
      nx[k] = this.px[j] + (this.px[j + 1] - this.px[j]) * t; ny[k] = this.py[j] + (this.py[j + 1] - this.py[j]) * t;
      nw[k] = Math.max(this.wear[j], this.wear[j + 1]);
    }
    this.n = want;
    for (let k = 0; k < want; k++) { this.px[k] = this.ox[k] = nx[k]; this.py[k] = this.oy[k] = ny[k]; this.wear[k] = nw[k]; }
  }

  /** damage at a node; snaps at 0 hp */
  damage(d: number, node: number, w: World, how: string) {
    if (this.snapped || d <= 0) return;
    this.hp -= d;
    this.wear[node] = Math.min(1, this.wear[node] + d / this.spec.hp * 2.5);
    if (node > 0) this.wear[node - 1] = Math.min(1, this.wear[node - 1] + d / this.spec.hp);
    if (node < this.n - 1) this.wear[node + 1] = Math.min(1, this.wear[node + 1] + d / this.spec.hp);
    if (this.hp <= 0) this.snap(node, w, how);
  }

  /** a blade swept from a to b: cut the line where it crosses */
  slash(ax: number, ay: number, bx: number, by: number, dmg: number, w: World): boolean {
    if (this.snapped || this.hitCd > 0) return false;
    const leaderNodes = this.spec.leader ? Math.ceil(this.spec.leader / this.seg) : 0;
    for (let i = 0; i < this.n - 1; i++) {
      if (!segHit(ax, ay, bx, by, this.px[i], this.py[i], this.px[i + 1], this.py[i + 1])) continue;
      if (i >= this.n - 1 - leaderNodes) {
        // wire leader: blades just ping off
        w.fx.burst('spark', this.px[i], this.py[i], 6, 3);
        w.sfx('sw_clang', this.px[i], 0.6);
        this.hitCd = 0.15;
        w.text.pop('WIRE!', this.px[i], this.py[i] + 0.4, 'hint', { size: 0.26 });
        return true;
      }
      // taut lines are springy and harder to cut than slack ones
      const taut = smooth(0.2, 0.9, this.strain);
      const k = dmg >= 3 ? 1 : 1.25 - taut * 0.45;
      this.damage(dmg * k, i, w, dmg >= 3 ? 'zap' : 'cut');
      this.hitCd = dmg < 0.5 ? 0 : 0.08;
      if (dmg >= 0.5) {
        w.sfx(this.hp > 0 ? 'rope_twang' : 'rope_snap1', this.px[i], 0.7, 1.2 + Math.random() * 0.3);
        // the line kinks away from the blade
        const nx = -(by - ay), ny = bx - ax, l = Math.hypot(nx, ny) || 1;
        this.ox[i] -= nx / l * 0.08; this.oy[i] -= ny / l * 0.08;
        if (this.hp > 0) w.text.pop(this.hp < this.spec.hp * 0.35 ? 'FRAY!' : 'TWANG', this.px[i], this.py[i] + 0.3, this.hp < this.spec.hp * 0.35 ? 'danger' : 'hint', { size: 0.24, life: 0.8 });
      }
      return true;
    }
    return false;
  }

  snap(node: number, w: World, how: string) {
    if (this.snapped) return;
    this.snapped = true;
    const sx = this.px[node], sy = this.py[node];
    // upper piece recoils toward the rod tip, lower piece falls with the hook
    const mk = (from: number, to: number, pinTip: boolean) => {
      const n = to - from + 1;
      const p = { x: new Float32Array(n), y: new Float32Array(n), ox: new Float32Array(n), oy: new Float32Array(n), n, t: 0, pinTip };
      for (let i = 0; i < n; i++) {
        p.x[i] = this.px[from + i]; p.y[i] = this.py[from + i];
        // recoil: velocity along the line toward where it was anchored
        const kx = pinTip ? (this.tip.x - p.x[i]) * 0.05 : 0, ky = pinTip ? (this.tip.y - p.y[i]) * 0.05 : -0.01;
        p.ox[i] = p.x[i] - kx; p.oy[i] = p.y[i] - ky;
      }
      this.whip.push(p);
    };
    mk(0, node, true);
    mk(node + 1, this.n - 1, false);
    this.end = null;
    w.sfx('rope_snap1', sx, 1.0); w.sfx('snap', sx, 0.7);
    w.fx.burst('spark', sx, sy, 14, 5);
    w.fx.emit('star', sx, sy, { n: 5, speed: 3, life: 0.6, size: 0.22 });
    w.fx.emit('bubble', sx, sy, { n: 10, spread: 0.2, speed: 1.5 });
    w.text.pop('SNAP!', sx, sy + 0.5, 'shout', { size: 0.6, life: 1.4 });
    w.game.freeze(0.09); w.game.addShake(0.25);
    this.onSnap?.(how, sx, sy, w);
    w.emit('lineSnap', { x: sx, y: sy, how });
  }

  private updateWhip(dt: number, w: World) {
    for (const p of this.whip) {
      p.t += dt;
      for (let i = 0; i < p.n; i++) {
        const under = p.y[i] < w.water.heightAt(p.x[i]);
        const vx = (p.x[i] - p.ox[i]) * (under ? 0.93 : 0.99), vy = (p.y[i] - p.oy[i]) * (under ? 0.93 : 0.99);
        p.ox[i] = p.x[i]; p.oy[i] = p.y[i];
        p.x[i] += vx; p.y[i] += vy - (under ? 0.4 : 9.8) * dt * dt;
      }
      if (p.pinTip) { p.x[0] = this.tip.x; p.y[0] = this.tip.y; }
      const seg = this.seg;
      for (let it = 0; it < 6; it++) for (let i = 0; i < p.n - 1; i++) {
        const dx = p.x[i + 1] - p.x[i], dy = p.y[i + 1] - p.y[i], d = Math.hypot(dx, dy);
        if (d <= seg || d < 1e-6) continue;
        const k = (d - seg) / d * 0.5;
        if (!(p.pinTip && i === 0)) { p.x[i] += dx * k; p.y[i] += dy * k; }
        p.x[i + 1] -= dx * k; p.y[i + 1] -= dy * k;
      }
      // the recoiling half reels back up into the rod
      if (p.pinTip && p.n > 2 && p.t > 0.3) { p.n = Math.max(2, p.n - Math.ceil(dt * 30)); }
    }
    this.whip = this.whip.filter((p) => p.t < (p.pinTip ? 1.6 : 2.5));
  }

  private draw(w: World) {
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const al = this.geo.attributes.aAlong as THREE.BufferAttribute, we = this.geo.attributes.aWear as THREE.BufferAttribute, di = this.geo.attributes.aDir as THREE.BufferAttribute;
    let k = 0;
    const put = (xs: Float32Array, ys: Float32Array, n: number, wear: Float32Array | null, alpha: number) => {
      let along = 0;
      for (let i = 0; i < n && k < MAXN; i++) {
        const j = Math.min(n - 1, i + 1), h = Math.max(0, i - 1);
        let dx = xs[j] - xs[h], dy = ys[j] - ys[h];
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        if (i > 0) along += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
        for (let s = 0; s < 2; s++) {
          pos.setXYZ(k * 2 + s, xs[i], ys[i], 0.02);
          al.setX(k * 2 + s, along); we.setX(k * 2 + s, wear ? wear[i] : 0.3 * alpha); di.setXY(k * 2 + s, dx, dy);
        }
        k++;
      }
    };
    if (!this.snapped) put(this.px, this.py, this.n, this.wear, 1);
    else for (const p of this.whip) { if (k > 0 && k < MAXN) { /* break the strip with a degenerate pair */ const lx = pos.getX(k * 2 - 1), ly = pos.getY(k * 2 - 1); pos.setXYZ(k * 2, lx, ly, 0.02); pos.setXYZ(k * 2 + 1, lx, ly, 0.02); k++; const sx = p.x[0], sy = p.y[0]; pos.setXYZ(k * 2, sx, sy, 0.02); pos.setXYZ(k * 2 + 1, sx, sy, 0.02); k++; } put(p.x, p.y, p.n, null, 1); }
    this.geo.setDrawRange(0, Math.max(0, (k - 1) * 6));
    pos.needsUpdate = al.needsUpdate = we.needsUpdate = di.needsUpdate = true;
    this.mat.uniforms.uTension.value = this.strain;
    this.mat.uniforms.uWaterY.value = 0;
    void w;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
