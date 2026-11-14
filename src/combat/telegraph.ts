// Telegraph FX: crisp pixel-art tells for enemy attacks (see DESIGN-V3, combat).
//   glint(w, x, y)                 a white 4-point star flash on the weapon: "this one can be parried"
//   glint(w, x, y, { red: true })  a red star + ring: unblockable, dodge it
//   new AimLine(scene)             a dashed laser-ish sight line (harpoon aim): .show(ax, ay, bx, by, k) / .hide()
//   dangerZone(w, x, y, r, dur)    a pulsing pixel ring on the plane: an area that's about to blow / slam
//   stunStars(w, x, y, dur)        little stars circling a staggered head
// Textures are tiny nearest-filtered canvases (no smoothing, hard outlines); meshes are unlit and write depth so
// the depth-based water fog treats them like solids.
import * as THREE from 'three';
import type { Entity, World, Team } from '../game/types';
import { Px } from '../gfx/px';

const texCache = new Map<string, THREE.Texture>();
function pxTex(key: string, w: number, h: number, draw: (p: Px) => void, repeat = false): THREE.Texture {
  let t = texCache.get(key);
  if (!t) {
    const p = new Px(w, h);
    draw(p);
    t = p.texture({ repeat });
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    texCache.set(key, t);
  }
  return t;
}

/** a 4-point star with a hard outline; core white, arms tinted */
function starTex(red: boolean) {
  return pxTex('tgStar' + red, 32, 32, (p) => {
    const arm = red ? '#ff2a20' : '#bfe8ff', edge = red ? '#4a0004' : '#0c2a44', core = '#ffffff';
    const c = 15;
    // long tapering vertical / horizontal arms, short diagonals, a round white core, a hard outline
    for (let i = 0; i < 14; i++) {
      const w = Math.max(0, Math.round(2.4 - i * 0.2));
      for (let j = -w; j <= w; j++) for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = c + sx * i + (sy ? j : 0), y = c + sy * i + (sx ? j : 0);
        p.set(x, y, i < 4 || (j === 0 && i < 9) ? core : arm);
      }
    }
    for (let i = 1; i < 6; i++) for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) p.set(c + sx * i, c + sy * i, i < 3 ? core : arm);
    p.circle(c, c, 2.2, core);
    p.outline(edge);
  });
}
function ringTex(red: boolean) {
  return pxTex('tgRing' + red, 128, 128, (p) => {
    const col = red ? '#ff3a28' : '#d8f0ff', hi = red ? '#ffb090' : '#ffffff', edge = red ? '#3a0004' : '#0c2a44';
    // 24 short dashes round a 2 px ring, each with a bright inner pixel row
    for (let a = 0; a < 720; a++) {
      const t = (a / 720) * Math.PI * 2;
      if (Math.floor((a / 720) * 24 * 2) % 2) continue;
      p.set(Math.round(63.5 + Math.cos(t) * 59), Math.round(63.5 + Math.sin(t) * 59), col);
      p.set(Math.round(63.5 + Math.cos(t) * 58), Math.round(63.5 + Math.sin(t) * 58), hi);
    }
    p.outline(edge);
  });
}
function dashTex() {
  return pxTex('tgDash', 16, 4, (p) => {
    for (let x = 0; x < 10; x++) { p.set(x, 1, '#ff5a40'); p.set(x, 2, '#ff2a1a'); }
    for (let x = 0; x < 10; x++) { p.set(x, 0, '#4a0004'); p.set(x, 3, '#4a0004'); }
  }, true);
}
function stunTex() {
  return pxTex('tgStun', 8, 8, (p) => {
    for (const [x, y] of [[3, 0], [3, 1], [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3], [3, 5], [3, 6], [2, 2], [4, 2], [2, 4], [4, 4], [3, 2], [3, 3], [3, 4]]) p.set(x, y, '#fff6a0');
    p.set(3, 3, '#ffffff');
    p.outline('#4a2a00');
  });
}

function unlitMat(tex: THREE.Texture, color = '#ffffff', bright = 1.6) {
  return new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(bright), alphaTest: 0.5, transparent: false, depthWrite: true, side: THREE.DoubleSide, fog: false });
}

const quad = new THREE.PlaneGeometry(1, 1);

/** a short-lived FX entity (cleaned up by the world loop) */
class FxBit implements Entity {
  kind = 'fx'; team: Team = 'neutral';
  x: number; y: number; vx = 0; vy = 0; r = 0; alive = true;
  obj: THREE.Mesh;
  t = 0;
  constructor(x: number, y: number, public z: number, mat: THREE.Material, public life: number, public size: number, public mode: 'glint' | 'ring' | 'stun', public follow?: () => { x: number; y: number }, public spin = 0) {
    this.x = x; this.y = y;
    this.obj = new THREE.Mesh(quad, mat);
    this.obj.renderOrder = 60;
    this.obj.position.set(x, y, z);
    this.obj.scale.setScalar(0.001);
  }
  update(dt: number, w: World) {
    this.t += dt;
    const k = this.t / this.life;
    if (k >= 1) { this.alive = false; return; }
    if (this.follow) { const f = this.follow(); this.x = f.x; this.y = f.y; }
    let s = this.size, ang = 0;
    if (this.mode === 'glint') {
      // pop in with an overshoot, hold, shrink away; an eighth-turn snap halfway (a pixel-art "twinkle")
      s *= k < 0.25 ? (k / 0.25) * 1.25 : k < 0.45 ? 1.25 - (k - 0.25) * 1.25 : Math.max(0, 1 - (k - 0.45) / 0.55);
      ang = k > 0.45 ? Math.PI / 4 : 0;
    } else if (this.mode === 'ring') {
      s *= 0.85 + 0.15 * Math.sin(this.t * 18);
      ang = Math.round(this.t * this.spin * 8) / 8;
    }
    this.obj.scale.setScalar(Math.max(0.001, s));
    this.obj.position.set(this.x, this.y, this.z);
    this.obj.quaternion.copy(w.camera.quaternion);
    if (ang) this.obj.rotateZ(ang);
  }
  dispose() { /* shared geo + cached textures; per-bit material */ (this.obj.material as THREE.Material).dispose(); }
}

/** the attack tell: a pixel star flash (white = parryable, red = unblockable) */
export function glint(w: World, x: number, y: number, o: { red?: boolean; size?: number; z?: number; follow?: () => { x: number; y: number }; sound?: boolean } = {}) {
  const red = !!o.red;
  const sz = (o.size ?? 0.9) * (red ? 1.25 : 1);
  w.add(new FxBit(x, y, o.z ?? 0.9, unlitMat(starTex(red), '#ffffff', red ? 1.8 : 2.2), 0.42, sz, 'glint', o.follow));
  if (red) w.add(new FxBit(x, y, (o.z ?? 0.9) - 0.02, unlitMat(ringTex(true), '#ffffff', 1.6), 0.5, sz * 1.4, 'ring', o.follow, 3));
  w.fx.emit('glow', x, y, { n: 1, size: sz * 0.7, life: 0.2, alpha: 0.6, color: red ? '#ff3020' : '#d8f0ff', z: (o.z ?? 0.9) - 0.05 });
  if (o.sound !== false) {
    if (red) { w.sfx('k_glass', x, 0.65, 0.55); w.sfx('charge', x, 0.45, 0.8); }
    else w.sfx('k_glass', x, 0.55, 1.5);
  }
}

/** a ring marking an area that is about to be hit (puffer blast, slams); lasts `dur` */
export function dangerZone(w: World, x: number, y: number, r: number, dur: number, red = true, follow?: () => { x: number; y: number }) {
  w.add(new FxBit(x, y, 0.7, unlitMat(ringTex(red), '#ffffff', 1.4), dur, r * 2.1, 'ring', follow, 1.2));
}

/** stars circling a staggered head */
export function stunStars(w: World, follow: () => { x: number; y: number }, dur: number) {
  for (let i = 0; i < 3; i++) {
    const ph = (i / 3) * Math.PI * 2;
    w.add(new FxBit(0, 0, 0.8, unlitMat(stunTex(), '#ffffff', 1.5), dur, 0.22, 'stun', () => { const f = follow(); const a = w.time * 6 + ph; return { x: f.x + Math.cos(a) * 0.35, y: f.y + Math.sin(a) * 0.1 }; }));
  }
}

/** a dashed red sight line (aimed shots) */
export class AimLine {
  mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private tex: THREE.Texture;
  constructor(parent: THREE.Object3D) {
    this.tex = dashTex().clone();
    this.tex.needsUpdate = true;
    this.tex.wrapS = THREE.RepeatWrapping;
    this.mat = unlitMat(this.tex, '#ffffff', 1.5);
    this.mesh = new THREE.Mesh(quad, this.mat);
    this.mesh.renderOrder = 55;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }
  /** k 0..1: wind-up progress (the dashes crawl and the line thickens, then goes solid bright just before) */
  show(ax: number, ay: number, bx: number, by: number, k: number, t: number) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 0.01;
    this.mesh.visible = true;
    this.mesh.position.set((ax + bx) / 2, (ay + by) / 2, 0.35);
    this.mesh.rotation.set(0, 0, Math.atan2(dy, dx));
    const th = 0.03 + k * 0.04;
    this.mesh.scale.set(L, th, 1);
    this.tex.repeat.set(L / 0.35, 1);
    this.tex.offset.x = -t * 3;
    const blink = k > 0.82 ? (Math.floor(t * 20) % 2 ? 2.4 : 1.2) : 1 + k * 0.6;
    this.mat.color.setRGB(blink, blink, blink);
  }
  hide() { this.mesh.visible = false; }
  dispose() { this.mesh.removeFromParent(); this.mat.dispose(); this.tex.dispose(); }
}
