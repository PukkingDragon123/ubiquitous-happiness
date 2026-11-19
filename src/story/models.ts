// Story props for the prologue, PS2-style: blocky flat-shaded low-poly with small clean painted pages (flat tones,
// deliberate shapes, no noise): Dad's sailor cap, Mom's shell necklace, the bread on its hook, giant glass bottles
// (human trash) to smash, Mr. Crab's training shell (the parry lesson), the tutorial's bubble rings, kelp gates,
// current and minnow, the trawl net that takes Mom and Dad, and the ruined home the tutorial ends at.
// (Mr. Crab and his shop: src/story/crab.ts.)
import * as THREE from 'three';
import { psxMat, mesh, facet } from '../player/psx';
import { ctex, T, rect, planks } from '../skills/texkit';
import { bodyPoint } from '../player/blobShape';
import { buildHook } from '../fishing/bait';
import { TAU, segDist } from '../core/math';
import { bubbleCluster } from '../ui/text3d';
import { kelpGeo, kelpMat, KELP_T } from '../title/art';
import type { Entity, World, Team } from '../game/types';
import { attackPlayer } from '../combat/resolve';

const flat = (color: string, o: { rough?: number; metal?: number; emissive?: string; emissiveK?: number; side?: THREE.Side } = {}) => psxMat(null, { color, rough: o.rough ?? 0.75, metal: o.metal, emissive: o.emissive, emissiveK: o.emissiveK, side: o.side });
const M = <G extends THREE.BufferGeometry>(g: G, m: THREE.Material, shadow = true) => mesh(facet(g), m, shadow);

// ------------------------------------------------------------------ Dad's sailor cap, Mom's shell necklace
/** a little white sailor cap (rolled brim, navy band, two ribbon tails); sits on the head anchor */
export function sailorCap(): THREE.Group {
  const g = new THREE.Group();
  const white = flat('#f4f2ea', { rough: 0.8 }), navy = flat('#1e2a52');
  const crown = M(new THREE.CylinderGeometry(0.15, 0.19, 0.13, 8), white);
  crown.position.y = 0.07;
  const top = M(new THREE.CylinderGeometry(0.11, 0.15, 0.03, 8), white);
  top.position.y = 0.145;
  const brim = M(new THREE.TorusGeometry(0.19, 0.035, 4, 8), white);
  brim.rotation.x = Math.PI / 2; brim.position.y = 0.01;
  const band = M(new THREE.CylinderGeometry(0.155, 0.17, 0.035, 8, 1, true), navy);
  band.position.y = 0.06;
  g.add(crown, top, brim, band);
  for (const s of [-1, 1]) {
    const tail = M(new THREE.BoxGeometry(0.03, 0.13, 0.012), navy);
    tail.position.set(-0.19, 0.0, s * 0.03); tail.rotation.set(0, 0, 0.35 + s * 0.12);
    g.add(tail);
  }
  g.rotation.z = -0.25; // jaunty
  g.scale.setScalar(1.05);
  return g;
}

/** a cord of small shells round the neck crease, on the camera side; add it to a BlobModel's body */
export function shellNecklace(): THREE.Group {
  const g = new THREE.Group();
  const cord = flat('#6a4a2a');
  const cols = ['#ffb0c0', '#fff0dc', '#f07a6a', '#ffffff', '#ffc890', '#e88ab0'];
  const pts: THREE.Vector3[] = [];
  const us = [0.46, 0.4, 0.34, 0.28, 0.22, 0.16, 0.1, 0.04];
  for (const u of us) pts.push(new THREE.Vector3(...bodyPoint(0.6, u, 0.025)));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const c = M(new THREE.CylinderGeometry(0.008, 0.008, a.distanceTo(b), 3), cord, false);
    c.position.copy(a).add(b).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(c);
  }
  pts.slice(1, -1).forEach((p, i) => {
    const big = i === 2 || i === 3;
    const sh = M(new THREE.ConeGeometry(big ? 0.05 : 0.036, big ? 0.06 : 0.045, 5), flat(cols[i % cols.length], { rough: 0.4, emissive: cols[i % cols.length], emissiveK: 0.08 }));
    sh.scale.z = 0.45;
    const n = p.clone().normalize();
    sh.position.copy(p).addScaledVector(n, 0.02).add(new THREE.Vector3(0, -0.03, 0));
    sh.rotation.set(0, 0, Math.PI);
    g.add(sh);
  });
  return g;
}

// ------------------------------------------------------------------ bread on a hook
const crumbTex = () => ctex('story.crumb', 32, 32, (p) => {
  // a slice: crust ring, soft crumb, a few deliberate holes
  rect(p, 0, 0, 32, 32, '#a8682a');
  p.poly([[3, 31], [3, 10], [6, 4], [12, 2], [16, 4], [20, 2], [26, 4], [29, 10], [29, 31]], '#f4e6c4');
  for (const [x, y, r] of [[10, 14, 1.4], [20, 20, 1.2], [14, 24, 1], [23, 11, 1], [8, 22, 0.8], [18, 9, 0.8]] as const) { p.ellipse(x, y, r + 0.4, r, '#d8c49a'); p.set(Math.round(x), Math.round(y) - 1, '#fffaf0'); }
  rect(p, 5, 7, 4, 1, '#ffffff');
});
export function buildBread(): { group: THREE.Group; bread: THREE.Group } {
  const group = new THREE.Group();
  const bread = new THREE.Group();
  // the slice: an extruded domed silhouette, crumb on the faces, crust round the sides
  const sh = new THREE.Shape();
  sh.moveTo(-0.16, -0.17); sh.lineTo(-0.16, 0.06); sh.lineTo(-0.12, 0.15); sh.lineTo(-0.04, 0.17); sh.lineTo(0, 0.14);
  sh.lineTo(0.05, 0.17); sh.lineTo(0.12, 0.15); sh.lineTo(0.16, 0.06); sh.lineTo(0.16, -0.17); sh.lineTo(-0.16, -0.17);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -0.035);
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + 0.17) / 0.34, (pos.getY(i) + 0.18) / 0.36);
  const slice = new THREE.Mesh(facet(g), [psxMat(crumbTex(), { rough: 0.9 }), flat('#9a5a22', { rough: 0.9 })]);
  slice.castShadow = true;
  bread.add(slice);
  // a bite-sized chunk torn off one corner (a little extra cube for silhouette)
  const crumb = M(new THREE.BoxGeometry(0.05, 0.05, 0.05), psxMat(crumbTex(), { rough: 0.9 }));
  crumb.position.set(0.17, -0.12, 0.02); crumb.rotation.set(0.4, 0.3, 0.2);
  bread.add(crumb);
  const hook = buildHook();
  hook.position.set(0, 0.2, 0);
  hook.rotation.z = Math.PI;
  bread.add(hook);
  bread.position.y = -0.22;
  group.add(bread);
  return { group, bread };
}

// ------------------------------------------------------------------ glass bottles (human trash) to smash
export type BottleKind = 'beer' | 'jar' | 'soda';
const BOTTLE: Record<BottleKind, { glass: string; tint: string; shard: string; h: number; r: number; lean: number }> = {
  beer: { glass: '#6a3a14', tint: '#b8742e', shard: '#c88a3a', h: 2.1, r: 0.32, lean: 0.3 },
  jar: { glass: '#7aa89a', tint: '#d8f0e4', shard: '#c8f0e0', h: 1.3, r: 0.48, lean: -0.08 },
  soda: { glass: '#5aa89a', tint: '#bff0e0', shard: '#9ae8d8', h: 1.85, r: 0.3, lean: -0.2 },
};
/** glass: a tinted body with two painted highlight streaks and a darker rim (alpha carries the see-through) */
const glassTex = (k: BottleKind) => ctex('story.glass.' + k, 32, 32, (p) => {
  const g = BOTTLE[k];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, g.glass, 150);
  for (let y = 0; y < 32; y++) { p.set(5, y, '#ffffff', 235); p.set(6, y, g.tint, 210); if (y > 4 && y < 26) p.set(10, y, '#ffffff', 150); p.set(27, y, g.tint, 120); }
  for (let x = 0; x < 32; x++) { p.set(x, 0, g.tint, 220); p.set(x, 31, g.glass, 230); }
});
/** a beer label: cream paper, a red anchor badge and a dark band (pixel art, no letters needed to read "beer") */
const labelTex = () => ctex('story.label', 32, 16, (p) => {
  rect(p, 0, 0, 32, 16, '#e8d8b0'); rect(p, 0, 0, 32, 2, '#7a1a14'); rect(p, 0, 14, 32, 2, '#7a1a14');
  p.ellipse(16, 8, 4.5, 4.5, '#c83a2a'); p.ellipse(16, 8, 3, 3, '#e8d8b0');
  rect(p, 15, 5, 2, 6, '#2a1a10'); rect(p, 13, 6, 6, 1, '#2a1a10'); rect(p, 13, 10, 2, 1, '#2a1a10'); rect(p, 17, 10, 2, 1, '#2a1a10');
  for (let x = 2; x < 10; x += 2) rect(p, x, 7, 1, 2, '#5a4a3a');
  for (let x = 23; x < 30; x += 2) rect(p, x, 7, 1, 2, '#5a4a3a');
});
const crackTex = () => ctex('story.crack', 32, 32, (p) => {
  // a starburst of hairline cracks (white with a dark edge), the rest see-through
  const lines: [number, number, number][] = [[0.2, 14, 0], [1.4, 12, 1], [2.6, 15, 2], [3.7, 11, 3], [4.9, 13, 4], [5.8, 9, 5]];
  for (const [a, len, sd] of lines) {
    let x = 16, y = 16, aa = a;
    for (let i = 0; i < len; i++) { aa += (((i * 7 + sd * 13) % 5) - 2) * 0.12; x += Math.cos(aa); y += Math.sin(aa); p.set(Math.round(x), Math.round(y), '#ffffff'); p.set(Math.round(x) + 1, Math.round(y), '#3a4a48'); }
  }
  p.ellipse(16, 16, 2, 2, '#ffffff');
});

/** a giant glass bottle stuck in the sand: the first hit cracks it (clink), the second shatters it into shards */
export class GlassBottle implements Entity {
  kind = 'bottle'; team: Team = 'enemy';
  x: number; y: number; vx = 0; vy = 0; r: number; alive = true;
  hp = 2; maxHp = 2;
  obj = new THREE.Group();
  private body = new THREE.Group();
  private crack: THREE.Mesh;
  private wob = 0; private wobV = 0; private flash = 0;
  onBreak?: (b: GlassBottle) => void;
  constructor(public type: BottleKind, x: number, floor: number) {
    const g = BOTTLE[type];
    this.x = x; this.y = floor + g.h * 0.45; this.r = g.r + 0.32;
    const glass = new THREE.MeshStandardMaterial({ map: glassTex(type), transparent: true, roughness: 0.08, metalness: 0.25, emissive: g.tint, emissiveIntensity: 0.12, side: THREE.DoubleSide });
    const H = g.h, R = g.r;
    let prof: [number, number][];
    if (type === 'beer') prof = [[0, 0], [R, 0], [R, H * 0.55], [R * 0.95, H * 0.62], [R * 0.45, H * 0.72], [R * 0.3, H * 0.78], [R * 0.3, H * 0.97], [R * 0.36, H * 0.98], [R * 0.36, H], [0, H]];
    else if (type === 'jar') prof = [[0, 0], [R * 0.92, 0], [R, H * 0.06], [R, H * 0.8], [R * 0.86, H * 0.88], [R * 0.86, H], [0, H]];
    else prof = [[0, 0], [R * 0.9, 0], [R, H * 0.12], [R * 0.82, H * 0.3], [R, H * 0.45], [R * 0.9, H * 0.6], [R * 0.42, H * 0.8], [R * 0.28, H * 0.95], [R * 0.32, H], [0, H]];
    const lathe = new THREE.LatheGeometry(prof.map(([px, py]) => new THREE.Vector2(px, py)), 9);
    const bodyM = new THREE.Mesh(facet(lathe), glass);
    bodyM.castShadow = true; bodyM.renderOrder = 2;
    this.body.add(bodyM);
    if (type === 'beer') {
      const label = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.02, R * 1.02, H * 0.26, 9, 1, true, -0.4, Math.PI * 1.1), psxMat(labelTex(), { rough: 0.8 }));
      label.position.y = H * 0.3; label.rotation.y = 0.2;
      const cap = M(new THREE.CylinderGeometry(R * 0.4, R * 0.42, H * 0.04, 9), flat('#d8a838', { metal: 0.35, rough: 0.35 }));
      cap.position.y = H * 1.01;
      this.body.add(label, cap);
    } else if (type === 'jar') {
      const lid = M(new THREE.CylinderGeometry(R * 0.9, R * 0.9, H * 0.1, 9), psxMat(ctex('story.lid', 16, 16, (p) => { rect(p, 0, 0, 16, 16, '#8a5a2a'); for (let x = 0; x < 16; x += 3) rect(p, x, 0, 1, 16, '#5a3414'); p.set(4, 5, '#c87a3a'); p.set(11, 9, '#3a1a08'); }), { metal: 0.3, rough: 0.6 }));
      lid.position.y = H * 1.03; lid.rotation.z = 0.12;
      // something pickled in there
      const pickle = M(new THREE.CapsuleGeometry(R * 0.32, H * 0.45, 2, 6), flat('#6a8a2a', { rough: 0.5 }));
      pickle.position.set(0.04, H * 0.42, 0); pickle.rotation.z = 0.5;
      this.body.add(lid, pickle);
    } else {
      const cap = M(new THREE.CylinderGeometry(R * 0.36, R * 0.38, H * 0.05, 9), flat('#c8281e', { rough: 0.45 }));
      cap.position.y = H * 1.01;
      this.body.add(cap);
    }
    // the crack decal: a starburst on the camera side, shown after the first hit
    this.crack = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.2, R * 2.2), new THREE.MeshBasicMaterial({ map: crackTex(), transparent: true, alphaTest: 0.5, depthWrite: false }));
    this.crack.position.set(0, H * (type === 'jar' ? 0.5 : 0.35), R * 1.04);
    this.crack.visible = false;
    this.body.add(this.crack);
    this.body.rotation.z = g.lean;
    this.obj.add(this.body);
    // a little in front of the gameplay plane so the seagrass doesn't swallow them
    this.obj.position.set(x, floor - 0.12, 0.45);
  }
  update(dt: number) {
    this.wobV += (-this.wob * 160 - this.wobV * 6) * dt;
    this.wob += this.wobV * dt;
    this.body.rotation.z = BOTTLE[this.type].lean + this.wob;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.body.scale.set(1 + this.flash * 0.05, 1 - this.flash * 0.04, 1 + this.flash * 0.05);
  }
  hit(_dmg: number, dx: number, _dy: number, w: World): boolean {
    if (!this.alive) return false;
    this.hp -= 1;
    this.wobV += -Math.sign(dx || 1) * 3.5;
    this.flash = 1;
    const g = BOTTLE[this.type];
    w.fx.burst('spark', this.x, this.y + 0.2, 5, 2.5, { color: '#ffffff' });
    w.fx.debrisBurst(this.x, this.y + 0.2, 3, g.shard, 2, 0.04);
    w.sfx('k_glass', this.x, 0.75, 1.1 + Math.random() * 0.25);
    if (this.hp <= 0) this.shatter(w);
    else { this.crack.visible = true; w.sfx('ice', this.x, 0.4, 1.6); }
    return true;
  }
  private shatter(w: World) {
    this.alive = false;
    const g = BOTTLE[this.type];
    // shards everywhere: glass-coloured chunks, white glints, a spray of bubbles, sand where they land
    w.fx.debrisBurst(this.x, this.y, 22, g.shard, 5, 0.07);
    w.fx.debrisBurst(this.x, this.y + 0.3, 10, '#f4fff8', 4, 0.04);
    w.fx.burst('spark', this.x, this.y, 14, 4.5, { color: '#ffffff' });
    w.fx.emit('star', this.x, this.y + 0.2, { n: 6, speed: 3, life: 0.6, size: 0.2 });
    w.fx.emit('bubbleBig', this.x, this.y, { n: 12, spread: 0.6, speed: 2 });
    w.sfx('k_glass3', this.x, 0.9, 1.0); w.sfx('k_glass4', this.x, 0.8, 1.2); w.sfx('ice_big', this.x, 0.55, 1.3);
    w.game.addShake(0.12); w.game.freeze(0.05);
    this.onBreak?.(this);
  }
  dispose() { this.obj.removeFromParent(); }
}

// ------------------------------------------------------------------ Mr. Crab's training shell
const shellTex = () => ctex('story.cone', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const band = (y + Math.floor(x / 4)) % 8;
    p.set(x, y, band < 2 ? '#7a3a1e' : band < 3 ? '#b86a3a' : y > 26 ? '#fff0dc' : '#f0d8b8');
  }
});
/**
 * a cone shell Mr. Crab lobs at the kid: it homes in slowly, FLASHES just before it arrives (the parry cue) and is
 * resolved by the combat resolver (attackPlayer), so a parry, a block, a dodge or a hit all behave like the real
 * thing. onResolve reports the outcome; a parried shell flies back to the thrower.
 */
export class ShellShot implements Entity {
  kind = 'shellShot'; team: Team = 'neutral';
  x: number; y: number; vx = 0; vy = 0; r = 0.2; alive = true;
  obj = new THREE.Group();
  private mesh: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private t = 0;
  private flashed = false;
  private state: 'in' | 'back' | 'loose' = 'in';
  private looseT = 0;
  onFlash?: () => void;
  onResolve?: (res: string) => void;
  constructor(x: number, y: number, private home: () => { x: number; y: number }, private speed = 2.3, private cue: (w: World, s: ShellShot) => void = () => {}) {
    this.x = x; this.y = y;
    this.mat = psxMat(shellTex(), { rough: 0.45, emissive: '#ffffff', emissiveK: 0 });
    const g = new THREE.ConeGeometry(0.11, 0.3, 7, 3);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const yy = pos.getY(i); const k = 1 + Math.sin(yy * 30) * 0.12; pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
    this.mesh = new THREE.Mesh(facet(g), this.mat);
    this.mesh.castShadow = true;
    this.obj.add(this.mesh);
  }
  update(dt: number, w: World) {
    this.t += dt;
    const p = w.player;
    if (this.state === 'in') {
      const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
      // a lazy homing lob: steer toward the kid, a little arc on the way
      const want = this.speed;
      this.vx += ((dx / d) * want - this.vx) * Math.min(1, dt * 3);
      this.vy += ((dy / d) * want - this.vy) * Math.min(1, dt * 3) + Math.sin(this.t * 3) * dt * 0.6;
      // the tell comes ~0.32 s before contact (like the real enemies' glints, a touch more generous for a lesson)
      if (!this.flashed && (d - (p.r + 0.3)) / want < 0.32) { this.flashed = true; this.cue(w, this); this.onFlash?.(); }
      if (d < p.r + 0.3) this.resolve(w);
    } else if (this.state === 'back') {
      const h = this.home(), dx = h.x - this.x, dy = h.y - this.y, d = Math.hypot(dx, dy) || 1;
      this.vx = (dx / d) * 7; this.vy = (dy / d) * 7;
      if (d < 0.4) { this.alive = false; w.sfx('clank', this.x, 0.6, 1.5); w.fx.burst('spark', this.x, this.y, 8, 3); }
    } else {
      this.looseT += dt;
      this.vy -= 3 * dt;
      if (this.looseT > 1.4) this.alive = false;
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.obj.position.set(this.x, this.y, 0.25);
    this.mesh.rotation.set(this.t * 7, 0, this.t * 11);
    this.mat.emissiveIntensity = this.flashed && this.state === 'in' ? 0.6 + Math.sin(this.t * 40) * 0.4 : 0;
    this.obj.scale.setScalar(this.state === 'loose' ? Math.max(0.01, 1 - this.looseT / 1.4) : 1);
  }
  private resolve(w: World) {
    const res = attackPlayer(w, { src: null, dmg: 1, x: this.x, y: this.y, kind: 'crush', projectile: this, knock: 3, name: 'a training shell', guardDmg: 10 });
    if (res === 'parried') this.state = 'back';
    else if (res === 'hit') { this.alive = false; w.fx.debrisBurst(this.x, this.y, 6, '#f0d8b8', 2.5, 0.04); w.sfx('crunch', this.x, 0.6, 1.3); }
    else { this.state = 'loose'; this.vx *= -0.5; this.vy = 2; if (res === 'blocked') w.sfx('clank', this.x, 0.6, 1.3); }
    this.onResolve?.(res);
  }
  /** the resolver deflects a parried projectile: home to the thrower */
  deflect() { this.state = 'back'; }
  dispose() { this.obj.removeFromParent(); }
}

// ------------------------------------------------------------------ the ruined home (the tutorial ends at its door)
const stoneTex = () => ctex('story.stone', 64, 64, (p) => {
  const S = ['#2a3036', '#3c444c', '#4e5862', '#626c76', '#7a8590', '#96a0aa'];
  rect(p, 0, 0, 64, 64, S[0]);
  // running-bond blocks, each its own tone, a lit top edge and a mortar shadow
  for (let row = 0; row < 7; row++) {
    const y0 = row * 9 + 1, off = (row % 2) * 9;
    for (let x0 = -off; x0 < 64; x0 += 18) {
      const t = 2 + ((row * 3 + Math.floor((x0 + 18) / 18)) % 3);
      rect(p, Math.max(0, x0 + 1), y0, Math.min(16, 64 - Math.max(0, x0 + 1)), 7, S[t]);
      rect(p, Math.max(0, x0 + 1), y0, Math.min(16, 64 - Math.max(0, x0 + 1)), 1, S[t + 1]);
      if (x0 + 16 < 64 && x0 + 16 >= 0) rect(p, x0 + 16, y0, 1, 7, S[1]);
    }
  }
  // cracks and moss creeping up from the bottom
  for (const [x0, y0, len] of [[12, 10, 14], [44, 30, 12], [28, 46, 10]] as [number, number, number][]) for (let i = 0; i < len; i++) p.set(x0 + Math.round(Math.sin(i * 0.9) * 1.5), y0 + i, '#14181c');
  for (let x = 0; x < 64; x++) { const h = 5 + Math.round((Math.sin(x * 0.35) + 1) * 3 + ((x * 7) % 5)); for (let y = 64 - h; y < 64; y++) p.set(x, y, y > 64 - h * 0.5 ? '#2e4a22' : '#466a2c'); p.set(x, 63 - h, '#6a8a3a'); }
});
const boardTex = () => ctex('story.board', 32, 32, (p) => planks(p, 0, 0, 32, 32, T.drift, { plank: 8, seed: 21, vertical: true }));

/** a small abandoned stone house: a broken roof, a door hanging off one hinge, an empty window, rubble and kelp */
export class RuinedHome {
  group = new THREE.Group();
  /** where the kid swims in (local, the doorway's middle) */
  door = new THREE.Vector3(-0.55, 1.0, 1.55);
  private hangDoor: THREE.Object3D;
  private kelp: { m: THREE.Mesh; base: Float32Array; ph: number }[] = [];
  private t = 0;
  constructor() {
    const g = this.group;
    const stone = psxMat(stoneTex(), { rough: 0.9 }), board = psxMat(boardTex(), { rough: 0.85 }), dark = flat('#06080c', { rough: 1 });
    const W = 4.4, H = 3.0, D = 3.0;
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rz = 0) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] * 0.6, uv.getY(i) * dims[f][1] * 0.6); }
      const me = M(geo, m); me.position.set(x, y, z); me.rotation.z = rz; g.add(me); return me;
    };
    // walls: back, a full left side, a broken-down right side, the front with a doorway and a window hole
    box(W, H, 0.35, 0, H / 2, -D / 2, stone);
    box(0.35, H, D, -W / 2, H / 2, 0, stone);
    box(0.35, H * 0.62, D * 0.7, W / 2, H * 0.31, -D * 0.15, stone);
    box(0.35, H * 0.35, D * 0.3, W / 2, H * 0.175, D * 0.35, stone, 0.08);
    box(1.0, H, 0.35, -W / 2 + 0.5, H / 2, D / 2, stone);                     // left of the door
    box(W - 2.1, H * 0.42, 0.35, W / 2 - (W - 2.1) / 2, H * 0.21, D / 2, stone); // under the window
    box(W - 2.1, H * 0.22, 0.35, W / 2 - (W - 2.1) / 2, H * 0.89, D / 2, stone); // over the window
    box(0.45, H * 0.36, 0.35, W / 2 - 0.22, H * 0.6, D / 2, stone);           // window jamb
    box(1.3, 0.4, 0.4, -0.55, H - 0.2, D / 2, stone);                          // the lintel over the door
    // dark inside (seen through the doorway and the window)
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, H - 0.2), dark); inside.position.set(0, H / 2, -D / 2 + 0.2); g.add(inside);
    // the roof: slanted boards with gaps, one fallen and leaning on the wall
    for (let i = 0; i < 7; i++) {
      if (i === 2 || i === 5) continue;
      const b = box(0.5, 0.08, D + 0.6, -W / 2 + 0.3 + i * 0.62, H + 0.25 - Math.abs(i - 3) * 0.09, 0, board);
      b.rotation.x = 0.05; b.rotation.z = (i - 3) * 0.04;
    }
    const fallen = box(0.5, 0.08, 2.4, W / 2 + 0.55, 1.1, 0.6, board); fallen.rotation.set(0.9, 0.2, 0.3);
    // the door, hanging off its top hinge
    const hinge = new THREE.Group(); hinge.position.set(-1.15, H - 0.45, D / 2 + 0.2);
    const door = new THREE.Mesh(facet(new THREE.BoxGeometry(1.0, 2.0, 0.08)), board); door.position.set(0.5, -1.0, 0); door.castShadow = true;
    hinge.add(door); hinge.rotation.set(0.15, 0.5, -0.55);
    g.add(hinge); this.hangDoor = hinge;
    // rubble at the foot of the broken wall, barnacles, kelp from the roof
    for (let i = 0; i < 9; i++) {
      const rk = M(new THREE.DodecahedronGeometry(0.16 + (i % 3) * 0.08, 0), stone);
      rk.position.set(W / 2 + 0.3 + (i % 4) * 0.35, 0.12 + Math.floor(i / 4) * 0.15, D * 0.2 + (i % 3) * 0.3); rk.rotation.set(i, i * 2, i * 3);
      g.add(rk);
    }
    const kelpM = psxMat(ctex('story.kelp', 16, 64, (p) => { for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) { const w = 5 + Math.sin(y * 0.25) * 2; if (Math.abs(x - 7.5) <= w) p.set(x, y, Math.abs(x - 7.5) < 1 ? '#6a6a20' : '#4e6a1e'); } }), { side: THREE.DoubleSide, alphaTest: 0.5 });
    for (const [x, z, h] of [[-1.6, 1.0, 1.6], [0.9, -0.8, 2.1], [1.8, 0.6, 1.3]] as [number, number, number][]) {
      const kg = new THREE.PlaneGeometry(0.22, h, 1, 8); kg.translate(0, h / 2, 0);
      const km = new THREE.Mesh(kg, kelpM); km.position.set(x, H + 0.3, z); g.add(km);
      this.kelp.push({ m: km, base: new Float32Array((kg.attributes.position as THREE.BufferAttribute).array), ph: x * 2 });
    }
    g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m !== inside) { m.castShadow = true; m.receiveShadow = true; } });
  }
  update(dt: number) {
    this.t += dt;
    this.hangDoor.rotation.z = -0.55 + Math.sin(this.t * 0.9) * 0.04;
    for (const k of this.kelp) {
      const p = k.m.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const y = k.base[i * 3 + 1]; p.setX(i, k.base[i * 3] + Math.sin(this.t * 1.3 + y * 1.6 + k.ph) * 0.12 * y); }
      p.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------------ bubble rings (the tutorial's gates and targets)
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3();
/**
 * a ring of glassy bubbles (the same glass as the bubble text) round a faint glowing hoop: swim or dash through it.
 * highlight(k) makes it shimmer when it is the next one; burst() pops it (the bubbles fly apart and vanish).
 */
export class BubbleRing {
  group = new THREE.Group();
  passed = false;
  private bubbles: THREE.InstancedMesh;
  private glow: THREE.Mesh;
  private gmat: THREE.MeshBasicMaterial;
  private n: number;
  private t = Math.random() * 6;
  private pop = 0;
  private lit = 0;
  constructor(public x: number, public y: number, public r = 0.9, tint = '#bff4ff') {
    this.n = Math.round(12 + r * 9);
    this.bubbles = bubbleCluster(this.n, tint);
    this.gmat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glow = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 4, 28), this.gmat);
    this.group.add(this.bubbles, this.glow);
    this.group.position.set(x, y, 0);
    this.group.rotation.y = 0.35;
    this.update(0);
  }
  /** did a swimmer moving from a to b this frame go through the ring's disc */
  crossed(ax: number, ay: number, bx: number, by: number, k = 0.92) { return !this.passed && segDist(this.x, this.y, ax, ay, bx, by).d < this.r * k; }
  /** 0..1: shimmer as the next target */
  highlight(k: number) { this.lit = k; }
  burst() { if (!this.passed) { this.passed = true; this.pop = 1; } }
  get gone() { return this.passed && this.pop <= 0; }
  update(dt: number) {
    this.t += dt;
    if (this.passed) this.pop = Math.max(0, this.pop - dt * 2.2);
    const t = this.t, n = this.n;
    this.group.position.y = this.y + Math.sin(t * 1.4) * 0.07;
    const blow = this.passed ? 1 - this.pop : 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t * 0.45 + Math.sin(t * 0.7 + i) * 0.05;
      const rr = this.r * (1 + Math.sin(t * 3 + i * 1.9) * 0.04 + blow * blow * 1.6);
      const big = i % 3 === 0 ? 1.35 : i % 3 === 1 ? 0.8 : 1;
      const sz = this.r * 0.105 * big * (1 + Math.sin(t * 4.2 + i * 1.7) * 0.12 + this.lit * 0.18) * (this.passed ? Math.max(0, this.pop * 1.4 - 0.1) : 1);
      _p3.set(Math.cos(a) * rr, Math.sin(a) * rr, Math.sin(t * 2 + i) * 0.04);
      _m4.compose(_p3, _q, _s3.setScalar(Math.max(1e-4, sz)));
      this.bubbles.setMatrixAt(i, _m4);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
    this.gmat.opacity = this.passed ? this.pop * 0.6 : 0.28 + this.lit * (0.35 + Math.sin(t * 7) * 0.15);
    this.glow.scale.setScalar(1 + blow * 0.6);
    this.group.visible = !this.gone;
  }
  dispose() { this.group.removeFromParent(); this.bubbles.geometry.dispose(); this.glow.geometry.dispose(); this.gmat.dispose(); }
}

// ------------------------------------------------------------------ kelp gates (the swim slalom)
/**
 * a slalom gate: a clump of kelp up from the seabed and a mat of kelp hanging from the surface, with a gap between
 * them (a bubble ring marks it). The kelp is soft: push() nudges a swimmer that brushes it toward the gap, so the
 * gate guides more than it blocks.
 */
export class KelpGate {
  group = new THREE.Group();
  ring: BubbleRing;
  passed = false;
  private stalks: { m: THREE.Mesh; ph: number; base: number }[] = [];
  private wob = 0; private wobV = 0;
  constructor(public x: number, floorY: number, public gapY: number, public gapH = 2.8, top = -0.25, seed = 1) {
    const km = kelpMat();
    const lo = gapY - gapH / 2, hi = gapY + gapH / 2;
    const add = (h: number, px: number, py: number, pz: number, down: boolean, sd: number) => {
      if (h < 0.5) return;
      const m = new THREE.Mesh(kelpGeo(h, sd), km);
      m.position.set(px, py, pz);
      if (down) m.rotation.z = Math.PI;
      m.rotation.y = sd * 1.3;
      // (beefier than background kelp: these stalks are the gate's walls)
      m.scale.set(1.7, 1, 1.7);
      m.castShadow = false;
      this.group.add(m);
      this.stalks.push({ m, ph: sd, base: m.rotation.z });
    };
    // up from the sand (three stalks, a little apart in depth), down from the surface mat
    add(lo - floorY + 0.15, -0.18, floorY - 0.1, -0.5, false, seed);
    add(lo - floorY - 0.25, 0.22, floorY - 0.1, -0.95, false, seed + 1.3);
    add(lo - floorY - 0.6, 0.05, floorY - 0.1, 0.15, false, seed + 2.1);
    add(top - hi + 0.15, 0.15, top, -0.55, true, seed + 3.7);
    add(top - hi - 0.3, -0.25, top, -1.0, true, seed + 4.4);
    add(top - hi - 0.7, 0.0, top, 0.1, true, seed + 5.9);
    // a floating mat of weed at the surface the hanging kelp drifts from
    const mat = M(new THREE.CylinderGeometry(0.9, 1.1, 0.18, 7), flat('#6a7a2a', { rough: 0.9 }), false);
    mat.position.set(0, top + 0.05, -0.4); mat.scale.z = 0.6;
    this.group.add(mat);
    this.group.position.x = x;
    this.ring = new BubbleRing(x, gapY, Math.min(1.05, gapH * 0.34), '#c8ffe8');
  }
  /** soft kelp: a nudge toward the gap for a swimmer at (px, py) brushing a stalk (and a sway on the kelp) */
  push(px: number, py: number): { x: number; y: number } {
    const dx = px - this.x;
    if (Math.abs(dx) > 0.75) return { x: 0, y: 0 };
    const lo = this.gapY - this.gapH / 2 + 0.25, hi = this.gapY + this.gapH / 2 - 0.25;
    const k = 1 - Math.abs(dx) / 0.75;
    if (py < lo) { this.wobV += 0.6; return { x: 0, y: (lo - py + 0.3) * 18 * k }; }
    if (py > hi) { this.wobV -= 0.6; return { x: 0, y: -(py - hi + 0.3) * 18 * k }; }
    return { x: 0, y: 0 };
  }
  update(dt: number, time: number) {
    KELP_T.value = time;
    this.wobV += (-this.wob * 30 - this.wobV * 3) * dt; this.wob += this.wobV * dt;
    for (const s of this.stalks) s.m.rotation.z = s.base + Math.sin(time * 0.8 + s.ph) * 0.04 + this.wob * 0.1;
    this.ring.update(dt);
  }
  addTo(scene: THREE.Object3D) { scene.add(this.group, this.ring.group); }
  dispose() { this.group.removeFromParent(); this.ring.dispose(); }
}

// ------------------------------------------------------------------ a current to ride
/**
 * a warm current: a band of fast water along a smooth path, drawn as streaks of light rushing along it (and bubbles).
 * flow(x, y) is the push a swimmer inside it gets (strongest on the centre line, fading to the band's edge).
 */
export class CurrentStream {
  group = new THREE.Group();
  pts: THREE.Vector2[] = [];
  private tan: THREE.Vector2[] = [];
  private streaks: THREE.InstancedMesh;
  private sk: { s: number; o: number; v: number; l: number }[] = [];
  private on = 0;
  private want = 0;
  private len = 0;
  constructor(ctrl: [number, number][], public hw = 1.5, public force = 30) {
    const curve = new THREE.SplineCurve(ctrl.map(([x, y]) => new THREE.Vector2(x, y)));
    this.pts = curve.getSpacedPoints(48);
    for (let i = 0; i < this.pts.length; i++) {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(this.pts.length - 1, i + 1)];
      this.tan.push(b.clone().sub(a).normalize());
    }
    this.len = curve.getLength();
    const N = 70;
    const g = new THREE.PlaneGeometry(1, 1);
    const m = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.streaks = new THREE.InstancedMesh(g, m, N);
    this.streaks.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      this.sk.push({ s: Math.random(), o: (Math.random() * 2 - 1) * 0.85, v: 0.75 + Math.random() * 0.5, l: 0.35 + Math.random() * 0.6 });
      this.streaks.setColorAt(i, c.set(i % 3 ? '#9ff0ff' : '#fff4c8'));
    }
    this.group.add(this.streaks);
  }
  get start() { return this.pts[0]; }
  get end() { return this.pts[this.pts.length - 1]; }
  /** nearest sample to a point: its index and distance */
  private nearest(px: number, py: number) {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < this.pts.length; i++) { const d = Math.hypot(this.pts[i].x - px, this.pts[i].y - py); if (d < bd) { bd = d; bi = i; } }
    return { i: bi, d: bd };
  }
  /** 0..1 how far along the path the point is (nearest sample) */
  along(px: number, py: number) { return this.nearest(px, py).i / (this.pts.length - 1); }
  /** the push at a point (0 outside the band or before it is switched on) */
  flow(px: number, py: number): { x: number; y: number; k: number } {
    const { i, d } = this.nearest(px, py);
    if (d > this.hw || this.on < 0.5 || i >= this.pts.length - 1) return { x: 0, y: 0, k: 0 };
    const k = (1 - (d / this.hw) ** 2) * this.on;
    const t = this.tan[i], c = this.pts[i];
    // along the flow, plus a gentle pull back toward the centre line
    return { x: t.x * this.force * k + (c.x - px) * 6 * k, y: t.y * this.force * k + (c.y - py) * 6 * k, k };
  }
  setOn(v: boolean) { this.want = v ? 1 : 0; }
  update(dt: number, fx?: { emit: (kind: 'bubbleS', x: number, y: number, o: { n: number; spread: number; speed: number; vx?: number; vy?: number }) => void }) {
    this.on += (this.want - this.on) * (1 - Math.exp(-dt * 3));
    const n = this.pts.length - 1;
    for (let i = 0; i < this.sk.length; i++) {
      const s = this.sk[i];
      s.s += (dt * s.v * 9) / Math.max(1, this.len);
      if (s.s > 1) { s.s -= 1; s.o = (Math.random() * 2 - 1) * 0.85; }
      const f = s.s * n, i0 = Math.min(n - 1, Math.floor(f)), k = f - i0;
      const p = this.pts[i0], q = this.pts[i0 + 1], t = this.tan[i0];
      const x = p.x + (q.x - p.x) * k - t.y * s.o * this.hw * 0.8, y = p.y + (q.y - p.y) * k + t.x * s.o * this.hw * 0.8;
      // streaks fade in at the start, out at the end, and with the current's strength
      const fade = Math.min(1, s.s * 6, (1 - s.s) * 6) * this.on;
      _p3.set(x, y, 0.2 + s.o * 0.4);
      _q.setFromAxisAngle(_z, Math.atan2(t.y, t.x));
      _m4.compose(_p3, _q, _s3.set(s.l * (0.5 + fade * 0.9), 0.06 * fade + 1e-4, 1));
      this.streaks.setMatrixAt(i, _m4);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
    if (fx && this.on > 0.3 && Math.random() < dt * 14) {
      const p = this.pts[Math.floor(Math.random() * n)], t = this.tan[Math.floor(Math.random() * n)];
      fx.emit('bubbleS', p.x + (Math.random() - 0.5) * this.hw, p.y + (Math.random() - 0.5) * this.hw, { n: 1, spread: 0.1, speed: 0.4, vx: t.x * 3, vy: t.y * 3 });
    }
  }
  dispose() { this.group.removeFromParent(); this.streaks.geometry.dispose(); (this.streaks.material as THREE.Material).dispose(); }
}
const _z = new THREE.Vector3(0, 0, 1);

// ------------------------------------------------------------------ the minnow (the dart lesson)
/**
 * a little golden minnow, quick and skittish: it wanders, bolts away when the kid gets close, flips direction at the
 * edges of its patch, and now and then stops to look back (the moment to DART at it). tired() slows it down for
 * players who need it; caught() spins it round, then it zips off to the far side.
 */
export class Minnow {
  group = new THREE.Group();
  x: number; y: number; vx = 0; vy = 0;
  face = 1;
  private body = new THREE.Group();
  private tail: THREE.Mesh;
  private t = Math.random() * 5;
  private pauseT = 0; private nextPause = 2.2;
  private spin = 0;
  private dizzy = 0;
  slow = 0;
  constructor(x: number, y: number) {
    this.x = x; this.y = y;
    const gold = flat('#ffc83a', { rough: 0.4, emissive: '#ff9a1a', emissiveK: 0.25 }), belly = flat('#fff4d0', { rough: 0.5 }), blue = flat('#2a7ad8', { rough: 0.5 }), dark = flat('#1a1a24', { rough: 0.3 });
    const b = M(new THREE.OctahedronGeometry(1, 1), gold);
    b.scale.set(0.26, 0.11, 0.075);
    const bl = M(new THREE.OctahedronGeometry(1, 1), belly);
    bl.scale.set(0.2, 0.06, 0.07); bl.position.set(0.02, -0.04, 0);
    const stripe = M(new THREE.BoxGeometry(0.3, 0.02, 0.155), blue);
    stripe.position.set(-0.01, 0.015, 0);
    const fin = M(new THREE.ConeGeometry(0.06, 0.12, 3), gold);
    fin.position.set(-0.02, 0.11, 0); fin.rotation.z = 0.5; fin.scale.z = 0.3;
    this.tail = M(new THREE.ConeGeometry(0.09, 0.16, 3), gold);
    this.tail.position.set(-0.3, 0, 0); this.tail.rotation.z = Math.PI / 2; this.tail.scale.z = 0.25;
    const eye = M(new THREE.SphereGeometry(0.028, 6, 4), dark, false);
    eye.position.set(0.16, 0.025, 0.06);
    const glintM = new THREE.Mesh(new THREE.SphereGeometry(0.01, 4, 3), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    glintM.position.set(0.17, 0.035, 0.085);
    this.body.add(b, bl, stripe, fin, this.tail, eye, glintM);
    this.group.add(this.body);
    this.group.scale.setScalar(1.25);
  }
  /** after a catch it shakes itself off and zips away; this long before it can be caught again */
  private grace = 0;
  /** spin round after being caught */
  caught() { this.spin = 1; this.dizzy = 0.9; }
  get stunned() { return this.dizzy > 0; }
  get catchable() { return this.dizzy <= 0 && this.grace <= 0; }
  /**
   * steer: flee from (kx, ky) inside the patch [x0, x1] x [y0, y1]; `speed` is its bolt speed (m/s)
   */
  update(dt: number, kx: number, ky: number, box: { x0: number; x1: number; y0: number; y1: number }, speed: number) {
    this.t += dt;
    const wasDizzy = this.dizzy > 0;
    this.dizzy = Math.max(0, this.dizzy - dt);
    this.grace = Math.max(0, this.grace - dt);
    this.spin = Math.max(0, this.spin - dt * 1.2);
    if (wasDizzy && this.dizzy <= 0) {
      // shake it off and zip to the far side of the patch (it's a minnow: it doesn't sulk)
      const far = this.x - box.x0 > box.x1 - this.x ? -1 : 1;
      this.vx = far * speed * 1.7; this.vy = (box.y0 + box.y1) / 2 > this.y ? 2 : -2;
      this.grace = 0.8; this.pauseT = 0; this.nextPause = 2.6;
    }
    const dx = this.x - kx, dy = this.y - ky, d = Math.hypot(dx, dy) || 1;
    let tx = 0, ty = 0;
    this.pauseT -= dt; this.nextPause -= dt;
    if (this.nextPause <= 0 && d > 1.6) { this.pauseT = 0.65; this.nextPause = 2.4 + Math.random() * 1.8; }
    if (this.dizzy > 0) { tx = 0; ty = 0.3; }
    else if (this.grace > 0) { tx = this.vx; ty = this.vy; }
    else if (this.pauseT > 0) { tx = -dx / d * 0.3; ty = -dy / d * 0.3; }
    else if (d < 3.4) {
      // bolt away, sliding along the patch edges (and cutting back past the kid when cornered)
      const sp = speed * (1 - this.slow * 0.5);
      tx = (dx / d) * sp; ty = (dy / d) * sp * 0.85;
      const m = 1.4;
      if (this.x < box.x0 + m && tx < 0) { tx = Math.abs(tx) * 0.3; ty += (ty >= 0 ? 1 : -1) * sp * 0.9; }
      if (this.x > box.x1 - m && tx > 0) { tx = -Math.abs(tx) * 0.3; ty += (ty >= 0 ? 1 : -1) * sp * 0.9; }
      if (this.y < box.y0 + m * 0.7 && ty < 0) ty = Math.abs(ty) * 0.6;
      if (this.y > box.y1 - m * 0.7 && ty > 0) ty = -Math.abs(ty) * 0.6;
    } else {
      tx = Math.sin(this.t * 0.7) * 1.4; ty = Math.sin(this.t * 1.1 + 1) * 0.7;
    }
    // stay in the patch
    if (this.x < box.x0) tx += (box.x0 - this.x) * 6; if (this.x > box.x1) tx -= (this.x - box.x1) * 6;
    if (this.y < box.y0) ty += (box.y0 - this.y) * 6; if (this.y > box.y1) ty -= (this.y - box.y1) * 6;
    const k = 1 - Math.exp(-dt * (this.pauseT > 0 ? 6 : 4.5));
    this.vx += (tx - this.vx) * k; this.vy += (ty - this.vy) * k;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (Math.abs(this.vx) > 0.3) this.face = Math.sign(this.vx);
    else if (this.pauseT > 0) this.face = Math.sign(kx - this.x) || this.face;
    // look: a quick tail beat (faster when bolting), pitch with the climb, a flip turn, a spin when caught
    const spd = Math.hypot(this.vx, this.vy);
    this.tail.rotation.y = Math.sin(this.t * (8 + spd * 5)) * 0.6;
    this.group.position.set(this.x, this.y + Math.sin(this.t * 2.3) * 0.04, 0.15);
    this.body.rotation.set(this.spin * this.t * 25, this.face > 0 ? 0 : Math.PI, Math.max(-0.6, Math.min(0.6, Math.atan2(this.vy, Math.abs(this.vx) + 0.5))));
  }
  dispose() { this.group.removeFromParent(); }
}

// ------------------------------------------------------------------ the trawl net
const netTex = () => ctex('story.net', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const a = (x + y) % 8, b = (x - y + 32) % 8;
    if (a === 0 || b === 0) p.set(x, y, (x + y) % 16 === 0 || (x - y + 32) % 16 === 0 ? '#c8cca8' : '#a8b08a');
  }
});

/** a bottom trawl: funnel of mesh from a float-lined mouth to the cod-end, towed by two warps */
export class TrawlNet {
  group = new THREE.Group();
  /** where the catch ends up (local space) */
  cod = new THREE.Vector3(5.6, 0, 0);
  mouthTop = new THREE.Vector3(); mouthBot = new THREE.Vector3();
  private mesh: THREE.Mesh;
  private base: Float32Array;
  private warps: THREE.Mesh[] = [];
  private t = 0;
  private floats: THREE.Mesh[] = [];
  constructor(public L = 6.5, public H = 2.3, public Z = 1.6) {
    const rings = 12, seg = 12;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const hy = H * (1 - t * 0.68) * (1 - Math.pow(t, 6) * 0.2), hz = Z * (1 - t * 0.6);
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * TAU;
        const c = Math.cos(a), s = Math.sin(a);
        // a squarish superellipse mouth that rounds off toward the cod-end
        const e = 0.6 + t * 1.4;
        const sx = Math.sign(c) * Math.pow(Math.abs(c), e), sy = Math.sign(s) * Math.pow(Math.abs(s), e);
        pos.push(t * L, sy * hy, sx * hz);
        uv.push(j / seg * 4, t * 5);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.base = new Float32Array(pos);
    const tex = netTex();
    const mat = psxMat(tex, { rough: 0.9, side: THREE.DoubleSide, alphaTest: 0.5 });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
    // the headrope's orange floats and the footrope's chain
    const fl = flat('#f07a2a', { rough: 0.5, emissive: '#3a1000', emissiveK: 0.2 }), chain = flat('#3a3a40', { metal: 0.35 });
    for (let k = 0; k < 7; k++) {
      const z = -Z + (k / 6) * 2 * Z;
      const f = M(new THREE.IcosahedronGeometry(0.16, 0), fl);
      f.position.set(0, H + 0.1, z * 0.95);
      this.floats.push(f);
      const c = M(new THREE.BoxGeometry(0.14, 0.1, 0.22), chain, false);
      c.position.set(0, -H - 0.05, z * 0.95);
      this.group.add(f, c);
    }
    for (let k = 0; k < 2; k++) {
      const w = M(new THREE.CylinderGeometry(0.025, 0.025, 1, 4), flat('#5a4a32'), false);
      this.warps.push(w);
    }
    this.mouthTop.set(0, H, 0); this.mouthBot.set(0, -H, 0);
  }
  /** add the warps (they live in world space) */
  attachTo(scene: THREE.Object3D) { for (const w of this.warps) scene.add(w); scene.add(this.group); }
  /** stretch the warps from the mouth corners to a world point (the boat's stern) */
  tow(to: THREE.Vector3) {
    this.group.updateMatrixWorld(true);
    const corners = [new THREE.Vector3(0, this.H, -this.Z * 0.9), new THREE.Vector3(0, this.H, this.Z * 0.9)];
    corners.forEach((c, i) => {
      const a = this.group.localToWorld(c.clone());
      const w = this.warps[i];
      const d = to.clone().sub(a);
      w.position.copy(a).addScaledVector(d, 0.5);
      w.scale.set(1, d.length(), 1);
      w.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    });
  }
  /** billow the mesh (k: how hard it is being dragged) */
  update(dt: number, k = 1) {
    this.t += dt;
    const p = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = this.base[i * 3], y = this.base[i * 3 + 1], z = this.base[i * 3 + 2];
      const t = x / this.L;
      const wv = Math.sin(this.t * 2.4 - x * 1.3 + z * 1.5) * 0.12 * (0.4 + t) * k;
      p.setXYZ(i, x - Math.abs(y) * 0.12 * t * k, y + wv, z * (1 + Math.sin(this.t * 1.7 + x) * 0.06));
    }
    p.needsUpdate = true;
    this.floats.forEach((f, i) => { f.position.y = this.H + 0.1 + Math.sin(this.t * 3 + i) * 0.04; });
  }
  setVisible(v: boolean) { this.group.visible = v; for (const w of this.warps) w.visible = v; }
  dispose() { this.group.removeFromParent(); for (const w of this.warps) w.removeFromParent(); }
}
