// Story props for the prologue, PS2-style: blocky flat-shaded low-poly with small clean painted pages (flat tones,
// deliberate shapes, no noise): Dad's sailor cap, Mom's shell necklace, the bread on its hook, MR. CRAB (a gruff
// weapon dealer: vendor apron, monocle, one huge claw and one tiny one), his junk stall with weapons hanging from
// the awning, driftwood training dummies, dash hoops and the trawl net that takes Mom and Dad.
import * as THREE from 'three';
import { psxMat, mesh, facet } from '../player/psx';
import { ctex, T, tone, rect, bevel, planks, stitches } from '../skills/texkit';
import { bodyPoint } from '../player/blobShape';
import { buildWeapon } from '../player/gear';
import { buildHook } from '../fishing/bait';
import { drawText } from '../ui/pixel/font';
import { Px } from '../gfx/px';
import { TAU, damp, clamp } from '../core/math';
import type { Entity, World, Team } from '../game/types';

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

// ------------------------------------------------------------------ MR. CRAB
const shellTex = () => ctex('story.crabShell', 32, 32, (p) => {
  rect(p, 0, 0, 32, 32, tone(T.coral, 2));
  // a lighter crown band and a few deliberate darker spots
  rect(p, 0, 0, 32, 8, tone(T.coral, 3));
  rect(p, 0, 8, 32, 1, tone(T.coral, 4));
  for (const [x, y] of [[4, 14], [12, 18], [22, 13], [27, 20], [8, 24], [17, 26]]) { p.ellipse(x, y, 1.6, 1.2, tone(T.coral, 1)); p.set(x - 1, y - 1, tone(T.coral, 3)); }
  rect(p, 0, 30, 32, 2, tone(T.coral, 1));
});
const apronTex = () => ctex('story.apron', 32, 32, (p) => {
  // blue and white ticking, a pocket with a stitched rim and a pencil
  for (let x = 0; x < 32; x++) rect(p, x, 0, 1, 32, (x >> 2) & 1 ? '#f0ecdf' : '#3a5a9a');
  rect(p, 0, 0, 32, 2, '#2a3e70');
  bevel(p, 9, 16, 14, 10, ['#1e2e58', '#2a3e70', '#3a5a9a', '#5a7ab8', '#8aa4d8'], 2);
  stitches(p, 10, 17, 22, 17, '#f0e0b0', '#1e2e58');
  rect(p, 18, 12, 2, 6, '#e8b830'); rect(p, 18, 11, 2, 1, '#f4a0a0'); rect(p, 18, 18, 2, 1, '#3a2a1a');
});

export class MrCrab {
  group = new THREE.Group();
  /** the body that bobs / leans (legs stay planted) */
  body = new THREE.Group();
  private bigClaw = new THREE.Group(); private bigFinger = new THREE.Group();
  private smallClaw = new THREE.Group(); private smallFinger = new THREE.Group();
  private eyes: THREE.Group[] = [];
  private legs: { g: THREE.Group; s: number; i: number }[] = [];
  private jaw = new THREE.Group();
  private pick: THREE.Mesh;
  private t = Math.random() * 10;
  talk = 0;
  /** sideways speed (m/s) for the scuttle cycle */
  move = 0;
  /** snip the big claw now */
  private snipT = 0;
  /** looks toward (world x) */
  lookX: number | null = null;
  facing = 1;

  constructor() {
    const shell = psxMat(shellTex(), { rough: 0.6 });
    const red = flat('#c8402a', { rough: 0.6 }), redDark = flat('#8a2418', { rough: 0.7 }), pale = flat('#f2b29a', { rough: 0.6 });
    const g = this.group;
    g.add(this.body);
    this.body.position.y = 0.5;
    // carapace: a heptagonal slab with a raised crown
    const cara = M(new THREE.CylinderGeometry(0.6, 0.66, 0.3, 7), shell);
    cara.scale.set(1, 1, 0.72);
    const crown = M(new THREE.CylinderGeometry(0.42, 0.6, 0.14, 7), shell);
    crown.scale.set(1, 1, 0.72); crown.position.y = 0.22;
    const belly = M(new THREE.CylinderGeometry(0.62, 0.44, 0.16, 7), pale);
    belly.scale.set(1, 1, 0.7); belly.position.y = -0.22;
    // a row of little teeth along the shell rim
    for (let i = 0; i < 9; i++) {
      const a = -0.95 + (i / 8) * 1.9;
      const sp = M(new THREE.ConeGeometry(0.045, 0.1, 4), red, false);
      sp.position.set(Math.sin(a) * 0.66, 0.06, Math.cos(a) * 0.48);
      sp.rotation.set(Math.PI / 2 * 0.6, 0, -Math.sin(a) * 1.2);
      this.body.add(sp);
    }
    this.body.add(cara, crown, belly);
    // the vendor apron (front, tied with a strap over the crown)
    const apron = M(new THREE.BoxGeometry(0.74, 0.42, 0.03), psxMat(apronTex(), { rough: 0.85 }));
    apron.position.set(0, -0.06, 0.47); apron.rotation.x = -0.18;
    const strap = M(new THREE.BoxGeometry(0.06, 0.03, 0.5), flat('#2a3e70'));
    strap.position.set(-0.22, 0.24, 0.25); strap.rotation.x = 0.35;
    const strap2 = strap.clone(); strap2.position.x = 0.22;
    this.body.add(apron, strap, strap2);
    // mouth: mandible plates + a chewed toothpick
    this.jaw.position.set(0, 0.13, 0.5);
    const mand = M(new THREE.BoxGeometry(0.16, 0.06, 0.05), redDark);
    this.jaw.add(mand);
    this.body.add(this.jaw);
    this.pick = M(new THREE.CylinderGeometry(0.008, 0.012, 0.26, 4), flat('#e8d4a0'), false);
    this.pick.position.set(0.1, 0.15, 0.56); this.pick.rotation.set(0.2, 0, 1.25);
    this.body.add(this.pick);
    // eyes on stalks; bushy brows; a gold monocle on the right eye
    const white = flat('#f8f4ea', { rough: 0.35 }), black = flat('#100808', { rough: 0.3 }), brow = flat('#6a6460', { rough: 0.9 });
    const gold = flat('#e8b840', { rough: 0.3, metal: 0.35, emissive: '#5a3a00', emissiveK: 0.2 });
    for (const s of [-1, 1]) {
      const e = new THREE.Group();
      e.position.set(s * 0.17, 0.24, 0.3);
      const stalk = M(new THREE.CylinderGeometry(0.03, 0.04, 0.34, 5), red);
      stalk.position.y = 0.17;
      const ball = M(new THREE.IcosahedronGeometry(0.085, 1), white);
      ball.position.y = 0.36;
      const pupil = M(new THREE.BoxGeometry(0.05, 0.06, 0.03), black, false);
      pupil.position.set(0, 0.36, 0.075);
      const br = M(new THREE.BoxGeometry(0.14, 0.035, 0.05), brow);
      br.position.set(0, 0.45, 0.06); br.rotation.z = s * -0.35;
      e.add(stalk, ball, pupil, br);
      if (s > 0) {
        const mono = M(new THREE.TorusGeometry(0.09, 0.016, 4, 10), gold);
        mono.position.set(0, 0.36, 0.1);
        const glass = new THREE.Mesh(new THREE.CircleGeometry(0.08, 10), new THREE.MeshBasicMaterial({ color: '#d8f4ff', transparent: true, opacity: 0.25, depthWrite: false }));
        glass.position.set(0, 0.36, 0.105);
        e.add(mono, glass);
        // a little chain swinging down to the shell
        for (let k = 0; k < 4; k++) { const c = M(new THREE.BoxGeometry(0.015, 0.04, 0.015), gold, false); c.position.set(0.07, 0.3 - k * 0.05, 0.1); c.rotation.z = 0.25; e.add(c); }
      }
      this.eyes.push(e);
      this.body.add(e);
    }
    // claws: arm segments to a pincer (palm + fixed finger + hinged finger)
    const claw = (grp: THREE.Group, fing: THREE.Group, s: number, k: number, mat: THREE.Material) => {
      grp.position.set(s * 0.52, -0.02, 0.32);
      const arm1 = M(new THREE.BoxGeometry(0.1 * k + 0.05, 0.1 * k + 0.05, 0.32 * k + 0.12), red);
      arm1.position.set(s * 0.08, 0.05, 0.12); arm1.rotation.set(-0.4, s * 0.5, 0);
      const palm = M(new THREE.DodecahedronGeometry(0.2 * k, 0), mat);
      palm.scale.set(1.3, 0.9, 0.8); palm.position.set(s * 0.22 * k, 0.16 * k + 0.05, 0.3 * k + 0.12);
      const fixed = M(new THREE.ConeGeometry(0.09 * k, 0.32 * k, 4), mat);
      fixed.position.set(s * 0.22 * k, 0.1 * k + 0.05, 0.62 * k + 0.12); fixed.rotation.x = Math.PI / 2 + 0.15;
      fing.position.set(s * 0.22 * k, 0.24 * k + 0.05, 0.42 * k + 0.12);
      const f = M(new THREE.ConeGeometry(0.075 * k, 0.3 * k, 4), mat);
      f.position.set(0, 0, 0.15 * k); f.rotation.x = Math.PI / 2 - 0.1;
      fing.add(f);
      grp.add(arm1, palm, fixed, fing);
      this.body.add(grp);
    };
    claw(this.bigClaw, this.bigFinger, 1, 1.25, shell);
    claw(this.smallClaw, this.smallFinger, -1, 0.5, pale);
    // three legs a side, two segments each, planted on the floor
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const lg = new THREE.Group();
      lg.position.set(s * 0.5, 0.42, -0.16 + i * 0.16);
      const up = M(new THREE.BoxGeometry(0.4, 0.07, 0.07), red);
      up.position.set(s * 0.18, 0.08, 0); up.rotation.z = s * 0.45;
      const lo = M(new THREE.BoxGeometry(0.07, 0.5, 0.06), redDark);
      lo.position.set(s * 0.4, -0.15, 0); lo.rotation.z = s * -0.25;
      lg.add(up, lo);
      lg.rotation.y = s * (i - 1) * 0.35;
      g.add(lg);
      this.legs.push({ g: lg, s, i });
    }
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  }

  /** world point above his eyes (dialogue anchor) */
  head(out = new THREE.Vector3()) { return this.group.localToWorld(out.set(0, 1.55, 0.2)); }
  snip() { this.snipT = 0.5; }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const talk = this.talk = Math.max(0, this.talk - dt * 3);
    const mv = Math.abs(this.move);
    // bob + lean while talking / scuttling
    this.body.position.y = 0.5 + Math.sin(t * 2.2) * 0.02 + Math.abs(Math.sin(t * 14)) * 0.04 * Math.min(1, mv);
    this.body.rotation.z = damp(this.body.rotation.z, -this.move * 0.08 + Math.sin(t * 9) * 0.03 * talk, 6, dt);
    this.body.rotation.x = damp(this.body.rotation.x, talk * 0.08, 6, dt);
    // the jaw chatters, the toothpick wiggles
    this.jaw.position.y = 0.13 - Math.abs(Math.sin(t * 22)) * 0.025 * talk;
    this.pick.rotation.z = 1.25 + Math.sin(t * 3) * 0.12 + Math.sin(t * 25) * 0.08 * talk;
    // claws: gestures while talking, a snip on cue, idle clacks
    this.snipT = Math.max(0, this.snipT - dt);
    const snip = this.snipT > 0 ? Math.abs(Math.sin(this.snipT * 18)) : 0;
    this.bigClaw.rotation.set(-0.2 + Math.sin(t * 5) * 0.25 * talk + snip * 0.2, 0, Math.sin(t * 1.3) * 0.08 + talk * 0.2);
    this.bigFinger.rotation.x = -0.2 - (snip > 0 ? snip * 0.6 : Math.max(0, Math.sin(t * 0.7)) * 0.25) - talk * Math.abs(Math.sin(t * 8)) * 0.3;
    this.smallClaw.rotation.set(-0.3 + Math.sin(t * 3.1) * 0.2, 0, -Math.sin(t * 2) * 0.1);
    this.smallFinger.rotation.x = -0.3 - Math.abs(Math.sin(t * 6)) * 0.4;
    // eye stalks sway; they lean toward what he watches
    const lx = this.lookX === null ? 0 : clamp((this.lookX - this.group.position.x) * 0.15, -0.35, 0.35);
    this.eyes.forEach((e, i) => { e.rotation.z = damp(e.rotation.z, -lx + Math.sin(t * 1.6 + i) * 0.06, 4, dt); e.rotation.x = Math.sin(t * 1.1 + i * 2) * 0.05 - talk * 0.1; });
    // legs: a scuttle cycle
    for (const L of this.legs) {
      const ph = t * 16 + L.i * 2.1 + (L.s > 0 ? Math.PI : 0);
      L.g.rotation.z = mv > 0.05 ? Math.sin(ph) * 0.25 * Math.min(1, mv) : 0;
      L.g.position.y = 0.42 + (mv > 0.05 ? Math.max(0, Math.sin(ph)) * 0.06 : 0);
    }
  }
}

// ------------------------------------------------------------------ the stall: junk, shells, weapons on the awning
function signTex(text: string): THREE.Texture {
  const p = new Px(96, 20);
  planks(p, 0, 0, 96, 20, T.drift, { plank: 10, seed: 4 });
  rect(p, 0, 0, 96, 1, tone(T.drift, 4)); rect(p, 0, 19, 96, 1, tone(T.drift, 0));
  const cv = p.canvas();
  const ctx = cv.getContext('2d')!;
  drawText(ctx, text, 48, 6, { font: 'small', color: '#ffe8a8', color2: '#f0b040', outline: '#2a1408', align: 'center' });
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const plankTex = () => ctex('story.plank', 32, 32, (p) => planks(p, 0, 0, 32, 32, T.oak, { plank: 8, seed: 7 }));
const sailTex = () => ctex('story.sail', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) rect(p, 0, y, 32, 1, (y >> 3) & 1 ? '#d8cca8' : '#c8402e');
  rect(p, 0, 30, 32, 2, '#7a6a4a');
  for (const x of [6, 19, 27]) p.rect(x, 28, 2, 4, '#000000', 0);
});

export class Stall {
  group = new THREE.Group();
  private hanging: { o: THREE.Object3D; ph: number }[] = [];
  private t = 0;
  constructor() {
    const g = this.group;
    const wood = psxMat(plankTex(), { rough: 0.85 }), drift = flat('#8a7a64', { rough: 0.9 }), dark = flat('#3a2a1a');
    // counter: a plank on two barrels
    const top = M(new THREE.BoxGeometry(2.4, 0.1, 0.62), wood);
    top.position.set(0, 0.86, 0.35);
    g.add(top);
    for (const x of [-0.85, 0.85]) {
      const barrel = M(new THREE.CylinderGeometry(0.3, 0.27, 0.8, 8), psxMat(plankTex(), { rough: 0.8 }));
      barrel.position.set(x, 0.4, 0.35);
      const hoop = M(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 8, 1, true), flat('#4a4a52', { metal: 0.3 }));
      hoop.position.set(x, 0.6, 0.35);
      const hoop2 = hoop.clone(); hoop2.position.y = 0.2;
      g.add(barrel, hoop, hoop2);
    }
    // awning: two driftwood poles + a torn striped sail
    for (const x of [-1.3, 1.3]) { const pole = M(new THREE.CylinderGeometry(0.05, 0.06, 2.5, 5), drift); pole.position.set(x, 1.25, -0.2); pole.rotation.z = x * 0.02; g.add(pole); }
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.1, 4, 2), psxMat(sailTex(), { rough: 0.9, side: THREE.DoubleSide, alphaTest: 0.5 }));
    sail.position.set(0, 2.25, 0.25); sail.rotation.x = -1.05;
    sail.castShadow = true;
    g.add(sail);
    const bar = M(new THREE.CylinderGeometry(0.03, 0.03, 2.7, 4), drift);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, 2.05, 0.75);
    g.add(bar);
    // the sign
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.36, 0.05), [dark, dark, dark, dark, psxMat(signTex('ARMS & SHELLS'), { rough: 0.8 }), dark]);
    sign.position.set(0, 2.62, -0.15); sign.rotation.z = 0.04;
    sign.castShadow = true;
    g.add(sign);
    // weapons hanging from the awning bar (the real gear models)
    const ids = ['dagger', 'trident', 'wrench', 'sword', 'wand'] as const;
    ids.forEach((id, i) => {
      const piv = new THREE.Group();
      piv.position.set(-1.05 + i * 0.52, 2.02, 0.75);
      const w = buildWeapon(id);
      w.rotation.z = -Math.PI / 2;
      w.scale.setScalar(0.8);
      const string = M(new THREE.BoxGeometry(0.01, 0.12, 0.01), flat('#d8c8a0'), false);
      string.position.y = -0.06;
      piv.add(string, w);
      w.position.y = -0.12;
      g.add(piv);
      this.hanging.push({ o: piv, ph: i * 1.7 });
    });
    // shells, a bottle and junk on the counter
    const cols = ['#ffb0c0', '#fff0dc', '#f07a6a', '#ffc890', '#c8a0f0', '#ffffff'];
    for (let i = 0; i < 9; i++) {
      const s = M(new THREE.ConeGeometry(0.07 + (i % 3) * 0.02, 0.1, 5), flat(cols[i % cols.length], { rough: 0.4 }));
      s.scale.z = 0.5;
      s.position.set(-1.0 + i * 0.25 + (i % 2) * 0.05, 0.95, 0.25 + (i % 3) * 0.12);
      s.rotation.set(-Math.PI / 2 + 0.4, (i * 1.3) % 3, 0);
      g.add(s);
    }
    const bottle = M(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 6), flat('#3aa86a', { rough: 0.2, emissive: '#0a3a1a', emissiveK: 0.3 }));
    bottle.position.set(0.95, 1.06, 0.2);
    const neck = M(new THREE.CylinderGeometry(0.025, 0.04, 0.12, 6), flat('#3aa86a', { rough: 0.2 }));
    neck.position.set(0.95, 1.27, 0.2);
    const can = M(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 7), flat('#b8c0c8', { metal: 0.35, rough: 0.4 }));
    can.position.set(-0.75, 0.99, 0.5); can.rotation.z = 1.5;
    const tag = M(new THREE.BoxGeometry(0.14, 0.09, 0.01), flat('#f4ead0'));
    tag.position.set(0.35, 0.98, 0.67); tag.rotation.x = -0.3;
    g.add(bottle, neck, can, tag);
    // a crate and a pile of shells on the floor
    const crate = M(new THREE.BoxGeometry(0.55, 0.45, 0.5), psxMat(plankTex(), { rough: 0.85 }));
    crate.position.set(1.65, 0.22, 0.1); crate.rotation.y = 0.3;
    g.add(crate);
    for (let i = 0; i < 6; i++) {
      const s = M(new THREE.ConeGeometry(0.1, 0.12, 5), flat(cols[(i + 2) % cols.length], { rough: 0.4 }));
      s.scale.z = 0.5; s.position.set(-1.7 + (i % 3) * 0.16, 0.06 + Math.floor(i / 3) * 0.07, 0.2 + (i % 2) * 0.15);
      s.rotation.set(-Math.PI / 2 + 0.2, i, 0);
      g.add(s);
    }
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; } });
  }
  update(dt: number) {
    this.t += dt;
    for (const h of this.hanging) h.o.rotation.z = Math.sin(this.t * 1.3 + h.ph) * 0.12;
  }
}

// ------------------------------------------------------------------ driftwood training dummies
const dummyTex = () => ctex('story.dummy', 32, 32, (p) => {
  planks(p, 0, 0, 32, 32, T.drift, { plank: 8, seed: 11, vertical: true });
  // a painted red-and-white target on the chest
  p.ellipse(16, 18, 8.5, 8.5, '#f4ece0'); p.ellipse(16, 18, 6.5, 6.5, '#c83a2e'); p.ellipse(16, 18, 4.5, 4.5, '#f4ece0'); p.ellipse(16, 18, 2.3, 2.3, '#c83a2e');
});
const dummyFace = () => ctex('story.dummyFace', 16, 16, (p) => {
  rect(p, 0, 0, 16, 16, tone(T.drift, 3));
  rect(p, 0, 0, 16, 4, '#2a3a5a');                       // a fisherman's cap
  rect(p, 0, 4, 16, 1, '#1a2440');
  rect(p, 4, 7, 2, 2, '#1a1010'); rect(p, 10, 7, 2, 2, '#1a1010');   // dot eyes
  rect(p, 3, 6, 4, 1, '#3a2a1a'); rect(p, 9, 6, 4, 1, '#3a2a1a');   // angry brows
  rect(p, 4, 11, 8, 2, '#5a3a2a'); rect(p, 5, 13, 6, 1, '#5a3a2a'); // a mustache
});

/** a driftwood human cutout on a post: wobbles when hit, splinters at 0 hp and drops driftwood */
export class Dummy implements Entity {
  kind = 'dummy'; team: Team = 'neutral';
  x: number; y: number; vx = 0; vy = 0; r = 0.55; alive = true;
  hp = 3; maxHp = 3;
  obj = new THREE.Group();
  private wob = 0; private wobV = 0;
  private flash = 0;
  private parts: THREE.Mesh[] = [];
  onBreak?: (d: Dummy) => void;
  constructor(public name: string, x: number, floor: number, private seed = 1) {
    this.x = x; this.y = floor + 1.0;
    const wood = psxMat(dummyTex(), { rough: 0.9 }), driftM = flat('#8a7a64', { rough: 0.9 }), face = psxMat(dummyFace(), { rough: 0.9 });
    const post = M(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 5), driftM);
    post.position.y = 0.4;
    const torso = M(new THREE.BoxGeometry(0.6, 0.7, 0.07), wood);
    torso.position.y = 0.95;
    const head = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 8)), [driftM, face, driftM]);
    head.rotation.x = Math.PI / 2; head.position.y = 1.5;
    const armL = M(new THREE.BoxGeometry(0.5, 0.11, 0.06), driftM);
    armL.position.set(-0.45, 1.1, 0); armL.rotation.z = 0.5 + (seed % 3) * 0.2;
    const armR = M(new THREE.BoxGeometry(0.5, 0.11, 0.06), driftM);
    armR.position.set(0.45, 1.1, 0); armR.rotation.z = -0.4 - (seed % 2) * 0.5;
    this.parts = [torso, head, armL, armR, post];
    this.obj.add(post, torso, head, armL, armR);
    this.obj.position.set(x, floor - 0.25, 0.2);
    this.obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  }
  update(dt: number) {
    this.wobV += (-this.wob * 140 - this.wobV * 7) * dt;
    this.wob += this.wobV * dt;
    this.obj.rotation.z = this.wob;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.obj.scale.set(1 + this.flash * 0.08, 1 - this.flash * 0.06, 1);
  }
  hit(dmg: number, dx: number, _dy: number, w: World): boolean {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.wobV += -Math.sign(dx || 1) * 5;
    this.flash = 1;
    w.fx.debrisBurst(this.x, this.y + 0.2, 5, '#a89a80', 2.5, 0.05);
    w.sfx('wood_knock', this.x, 0.7, 1 + Math.random() * 0.2);
    if (this.hp <= 0) this.smash(w);
    return true;
  }
  private smash(w: World) {
    this.alive = false;
    w.fx.debrisBurst(this.x, this.y, 18, '#9a8a70', 5, 0.09);
    w.fx.emit('bubbleBig', this.x, this.y, { n: 10, spread: 0.5, speed: 2 });
    w.sfx('rock_crumble', this.x, 0.6, 1.4); w.sfx('wood_close', this.x, 0.6);
    w.game.addShake(0.12);
    this.onBreak?.(this);
  }
  dispose() { for (const p of this.parts) p.geometry.dispose(); }
}

// ------------------------------------------------------------------ dash hoops
/** a ring of shells and kelp to dash through */
export class Hoop {
  group = new THREE.Group();
  passed = false;
  private ring: THREE.Mesh;
  private glow: THREE.Mesh;
  private t = Math.random() * 6;
  private pop = 0;
  constructor(public x: number, public y: number, public r = 0.9) {
    this.ring = M(new THREE.TorusGeometry(r, 0.09, 5, 14), flat('#f0a0b8', { rough: 0.5, emissive: '#ff6a9a', emissiveK: 0.25 }));
    this.glow = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 4, 18), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0a0').multiplyScalar(1.6) }));
    this.group.add(this.ring, this.glow);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const s = M(new THREE.ConeGeometry(0.08, 0.1, 5), flat(i % 2 ? '#fff0dc' : '#ffc890', { rough: 0.4 }), false);
      s.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.06); s.rotation.set(Math.PI / 2, 0, a);
      this.group.add(s);
    }
    this.group.position.set(x, y, 0);
    this.group.rotation.y = 0.5;
  }
  /** pass check: did a point move through the ring's disc this frame */
  check(px: number, py: number) { return Math.hypot(px - this.x, py - this.y) < this.r * 0.85; }
  celebrate() { this.passed = true; this.pop = 1; }
  update(dt: number) {
    this.t += dt;
    this.pop = Math.max(0, this.pop - dt * 2);
    this.group.position.y = this.y + Math.sin(this.t * 1.5) * 0.08;
    this.group.rotation.z = this.t * 0.4;
    const s = 1 + this.pop * 0.4;
    this.group.scale.setScalar(this.passed ? Math.max(0.001, s * (1 - Math.max(0, 0.5 - this.pop) * 2)) : 1 + Math.sin(this.t * 4) * 0.03);
    (this.glow.material as THREE.MeshBasicMaterial).color.setScalar(this.passed ? 0.4 : 1.2 + Math.sin(this.t * 6) * 0.4).multiply(new THREE.Color('#fff0a0'));
  }
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
