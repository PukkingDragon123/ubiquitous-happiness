// Low-poly furniture and stations for the hideout, one builder per blueprint. Every model is built around the
// centre of its footprint on the floor (cells are 1 m), front facing +z, from chunky primitives with realistic
// pixel textures (tex.ts), merged per material by the Kit.
//
//   const prop = buildProp('sofa');     // { group, lights, tick, seat?, screen?, doors?, lid?, height }
import * as THREE from 'three';
import { Kit } from './kit';
import { MAT, TEX } from './tex';
import { BLUEPRINTS, footprint } from './blueprints';
import { retro } from '../gfx/retro';
import { Px, hex, mix } from '../gfx/px';
import { hash2 } from '../core/math';
import { META } from '../meta/meta';

export interface PropLight { pos: THREE.Vector3; color: string; intensity: number; dist: number; flicker?: number; /** a downward shadow-casting key light (the main lamp) */ key?: boolean }
export interface Prop {
  group: THREE.Group;
  lights: PropLight[];
  tick?: (t: number, dt: number) => void;
  /** where the hero sits (local) */
  seat?: THREE.Vector3;
  /** the TV's screen mesh (material replaced by the CRT) */
  screen?: THREE.Mesh;
  /** hinged parts the cinematic opens (locker doors / chest lid): pivot groups, open = rotation target */
  doors?: { pivot: THREE.Object3D; axis: 'x' | 'y'; open: number }[];
  height: number;
  /** extra point for the camera to frame (local), e.g. the screen centre */
  focus?: THREE.Vector3;
}

const W = (k: string) => MAT.wood(k);
const plain = (col: string, rough = 0.6, metal = 0) => MAT.plain(`${col}/${rough}/${metal}`);
const glow = (col: string) => MAT.glow(col);
const ironM = () => MAT.metal('grey');
const tau = Math.PI * 2;

type Builder = (k: Kit, p: Prop) => void;

// ------------------------------------------------------------------ helpers
function legs4(k: Kit, mat: THREE.Material, w: number, d: number, h: number, r = 0.03, inset = 0.06) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(mat, r, r * 0.8, h, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset), { seg: 6 });
}
/** a crate: frame + slats with gaps */
function crate(k: Kit, w: number, h: number, d: number, x = 0, y = 0, z = 0, wood = 'pine', openFront = false) {
  const m = W(wood), t = 0.05;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(m, t, h, t, x + sx * (w / 2 - t / 2), y + h / 2, z + sz * (d / 2 - t / 2));
  const n = Math.max(2, Math.round(h / 0.14));
  for (let i = 0; i < n; i++) {
    const yy = y + (i + 0.5) * (h / n);
    const sh = h / n - 0.03;
    k.box(m, w - 0.02, sh, 0.025, x, yy, z - d / 2 + 0.012);
    if (!openFront) k.box(m, w - 0.02, sh, 0.025, x, yy, z + d / 2 - 0.012);
    k.box(m, 0.025, sh, d - 0.02, x - w / 2 + 0.012, yy, z);
    k.box(m, 0.025, sh, d - 0.02, x + w / 2 - 0.012, yy, z);
  }
  k.box(m, w, 0.04, d, x, y + h - 0.02, z);
  k.box(m, w, 0.03, d, x, y + 0.015, z);
}
/** a hinged sub-model: returns a pivot group at (px,py,pz) with the part built relative to the hinge */
function hinged(p: Prop, parent: THREE.Group | null, px: number, py: number, pz: number, axis: 'x' | 'y', open: number, build: (k: Kit) => void) {
  const k = new Kit(); build(k);
  const pivot = new THREE.Group(); pivot.position.set(px, py, pz);
  pivot.add(k.build());
  (parent ?? p.group).add(pivot);
  p.doors = p.doors ?? []; p.doors.push({ pivot, axis, open });
  return pivot;
}
function flame(p: Prop, x: number, y: number, z: number, s = 1) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.018 * s, 0.06 * s, 5), glow('#ffb84a'));
  m.position.set(x, y + 0.03 * s, z);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.009 * s, 0.035 * s, 4), glow('#fff4c0'));
  core.position.set(x, y + 0.02 * s, z);
  p.group.add(m, core);
  const ph = hash2(x * 100, z * 100, 3) * 10;
  const prev = p.tick;
  p.tick = (t, dt) => { prev?.(t, dt); const f = 1 + Math.sin(t * 13 + ph) * 0.12 + Math.sin(t * 29 + ph) * 0.08; m.scale.set(1, f, 1); core.scale.set(1, f, 1); m.rotation.z = Math.sin(t * 7 + ph) * 0.12; };
}

// ------------------------------------------------------------------ paintings & posters (canvas textures per instance)
function wantedPoster(seed: number, name: string): THREE.Texture {
  const p = new Px(24, 32);
  p.fill((x, y) => mix(hex('#e8d6a8'), hex('#c8a870'), ((x * 7 + y * 3) % 11) / 30 + (y / 32) * 0.3));
  for (let x = 2; x < 22; x++) { p.set(x, 2, '#3a1a0a'); p.set(x, 5, '#3a1a0a'); }
  for (let x = 4; x < 20; x += 2) p.set(x, 3, '#6a1a0a');
  // a mugshot: hat or bald, beard, eye patch from the seed
  const skin = ['#e8b48a', '#c88a5a', '#8a5a3a', '#f0c8a0'][seed % 4];
  p.ellipse(12, 15, 5, 6, skin);
  if (seed % 3 === 0) p.rect(6, 9, 12, 3, '#3a3a4a'); else if (seed % 3 === 1) p.rect(7, 9, 10, 2, '#a83a2a');
  p.set(10, 14, '#1a1010'); p.set(14, 14, '#1a1010');
  if (seed % 5 === 0) { p.rect(13, 13, 3, 2, '#101010'); p.line(9, 12, 17, 13, '#101010'); }
  if (seed % 2 === 0) p.ellipse(12, 19, 4, 2.5, '#5a3a2a');
  p.rect(10, 20, 4, 1, '#6a2a2a');
  p.ellipse(12, 24, 6, 2, '#2a3a5a');
  // a red X when defeated
  for (let i = 0; i < 4; i++) p.set(18 + (i % 2), 26 + i, '#c82020');
  void name;
  return p.texture({ mip: false });
}

// ------------------------------------------------------------------ builders
const BUILD: Record<string, Builder> = {
  tv(k, p) {
    // a fish crate stand with tapes and a console inside, a fat walnut CRT with rabbit ears
    crate(k, 1.5, 0.52, 0.62, 0, 0, 0, 'drift', true);
    const tapeCols = ['#1a1a1a', '#2a2a2a', '#1a1a1a', '#2a2a2a'];
    for (let i = 0; i < 7; i++) k.box(plain(tapeCols[i % 4], 0.5), 0.035, 0.2, 0.19, -0.6 + i * 0.045, 0.14, 0.12, { rz: i === 6 ? 0.25 : 0 });
    for (let i = 0; i < 7; i++) k.box(plain(['#e8e0d0', '#c83a2a', '#3a6ac8', '#e8c040'][i % 4], 0.7), 0.036, 0.06, 0.005, -0.6 + i * 0.045, 0.16, 0.218);
    k.box(plain('#2e2c30', 0.4), 0.5, 0.08, 0.36, 0.25, 0.08, 0.05); // console
    k.box(plain('#4a4850', 0.4), 0.12, 0.012, 0.08, 0.15, 0.125, 0.06);
    k.box(plain('#c82a2a', 0.3), 0.02, 0.01, 0.01, 0.4, 0.124, 0.22);
    // the set
    const y0 = 0.52;
    const vw = 0.92, vh = 0.7, vd = 0.5;
    k.box(MAT.veneer(), vw, vh, vd, -0.08, y0 + vh / 2, 0.05, { d: 1.2 });
    k.box(MAT.veneer(), vw - 0.25, vh - 0.2, 0.3, -0.08, y0 + vh / 2 + 0.02, -0.33, { d: 1.2 }); // tube back
    k.box(plain('#2a2622', 0.5), vw - 0.04, vh - 0.06, 0.04, -0.08, y0 + vh / 2, 0.3); // front bezel
    k.box(plain('#16130f', 0.6), 0.2, vh - 0.12, 0.02, 0.24, y0 + vh / 2, 0.325); // control strip
    for (let i = 0; i < 6; i++) k.box(plain('#0a0806', 0.9), 0.15, 0.012, 0.01, 0.24, y0 + 0.14 + i * 0.03, 0.337); // grille
    k.cyl(MAT.brass(), 0.032, 0.032, 0.035, 0.24, y0 + 0.5, 0.345, { rx: Math.PI / 2, seg: 8 });
    k.cyl(MAT.brass(), 0.026, 0.026, 0.035, 0.24, y0 + 0.4, 0.345, { rx: Math.PI / 2, seg: 8 });
    k.box(glow('#ff3020'), 0.012, 0.012, 0.01, 0.3, y0 + 0.08, 0.338);
    // feet
    for (const sx of [-0.45, 0.29]) k.box(plain('#141210', 0.6), 0.08, 0.03, 0.4, sx, y0 + 0.015, 0.05);
    // rabbit ears
    k.sphere(plain('#2a2a30', 0.4, 0.5), 0.06, -0.15, y0 + vh + 0.02, -0.05, { sy: 0.6 });
    for (const s of [-1, 1]) {
      const len = 0.62;
      k.cyl(plain('#c8c8d0', 0.25, 0.9), 0.006, 0.006, len, -0.15 + s * Math.sin(0.5) * len / 2, y0 + vh + 0.03 + Math.cos(0.5) * len / 2, -0.05, { rz: -s * 0.5, seg: 4 });
      k.sphere(plain('#c8c8d0', 0.25, 0.9), 0.014, -0.15 + s * Math.sin(0.5) * len, y0 + vh + 0.03 + Math.cos(0.5) * len, -0.05, { w: 5, h: 4 });
    }
    // the screen: a gently bulged quad (material set by the room)
    const sw = 0.6, sh = 0.47;
    const g = new THREE.PlaneGeometry(sw, sh, 8, 6);
    const P = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i) / (sw / 2), y = P.getY(i) / (sh / 2); P.setZ(i, (1 - x * x * 0.6) * (1 - y * y * 0.6) * 0.025); }
    g.computeVertexNormals();
    const screen = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#0b120f' }));
    screen.position.set(-0.17, y0 + vh / 2 + 0.01, 0.322);
    p.group.add(screen);
    p.screen = screen;
    p.focus = screen.position.clone();
    p.height = y0 + vh + 0.5;
  },
  sofa(k, p) {
    const fab = MAT.fabric('mustard'), wood = W('walnut');
    k.slab(wood, 1.9, 0.12, 0.84, 0, 0.1, 0);
    legs4(k, wood, 1.8, 0.74, 0.11, 0.035);
    // seat cushions
    for (const sx of [-0.45, 0.45]) k.cushion(fab, 0.88, 0.14, 0.62, sx, 0.3, 0.08, { puff: 0.35 });
    // back
    k.slab(fab, 1.9, 0.5, 0.2, 0, 0.22, -0.32);
    for (const sx of [-0.45, 0.45]) k.cushion(fab, 0.86, 0.12, 0.42, sx, 0.62, -0.16, { rx: -1.25, puff: 0.5 });
    // rolled arms
    for (const sx of [-1, 1]) {
      k.slab(fab, 0.2, 0.42, 0.84, sx * 0.88, 0.2, 0);
      k.cyl(fab, 0.13, 0.13, 0.84, sx * 0.88, 0.63, 0, { rx: Math.PI / 2, seg: 8 });
    }
    // knit blanket over the left arm, a teal pillow on the right
    k.box(MAT.knit('#c8463a/#e8d8b0'), 0.32, 0.03, 0.9, -0.86, 0.77, 0.02, { rz: 0.08 });
    k.box(MAT.knit('#c8463a/#e8d8b0'), 0.03, 0.42, 0.9, -1.03, 0.55, 0.02, { rz: -0.15 });
    k.cushion(MAT.fabric('teal'), 0.36, 0.1, 0.32, 0.6, 0.5, -0.08, { rx: -1.0, rz: -0.25, puff: 0.6 });
    p.seat = new THREE.Vector3(0.12, 0.42, 0.02);
    p.height = 1.0;
  },
  storage(k, p) {
    const wood = W('red'), band = MAT.brass(), iron = ironM();
    k.slab(wood, 1.5, 0.52, 0.72, 0, 0.02, 0);
    for (const sx of [-0.5, 0, 0.5]) k.box(iron, 0.06, 0.53, 0.74, sx, 0.285, 0);
    for (const sx of [-1, 1]) { k.box(band, 0.04, 0.54, 0.76, sx * 0.74, 0.29, 0); k.cyl(plain('#8a6a40', 0.9), 0.05, 0.05, 0.04, sx * 0.78, 0.36, 0, { rz: Math.PI / 2, seg: 8 }); }
    k.box(band, 0.14, 0.16, 0.03, 0, 0.44, 0.37);
    k.box(plain('#1a1008', 0.5), 0.03, 0.05, 0.01, 0, 0.42, 0.386);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(plain('#2a2420', 0.6), 0.1, 0.03, 0.1, sx * 0.68, 0.015, sz * 0.3);
    // domed lid hinged at the back
    hinged(p, null, 0, 0.54, -0.36, 'x', -1.7, (h) => {
      const g = new THREE.CylinderGeometry(0.36, 0.36, 1.5, 8, 1, false, -Math.PI / 2, Math.PI);
      g.rotateZ(Math.PI / 2); g.scale(1, 0.55, 1);
      h.add(wood, g, 0, 0, 0.36);
      for (const sx of [-0.5, 0, 0.5]) { const gb = new THREE.CylinderGeometry(0.375, 0.375, 0.06, 8, 1, false, -Math.PI / 2, Math.PI); gb.rotateZ(Math.PI / 2); gb.scale(1, 0.56, 1); h.add(iron, gb, sx, 0, 0.36); }
    });
    p.height = 0.8;
  },
  workbench(k, p) {
    const oak = W('oak');
    k.slab(oak, 1.86, 0.09, 0.72, 0, 0.82, 0.04);
    legs4(k, W('pine'), 1.76, 0.62, 0.82, 0.045);
    k.slab(W('pine'), 1.7, 0.04, 0.6, 0, 0.22, 0.04);
    crate(k, 0.5, 0.3, 0.45, -0.5, 0.26, 0.05, 'drift');
    k.cyl(plain('#5a6a3a', 0.6, 0.3), 0.14, 0.14, 0.28, 0.45, 0.4, 0.05, { seg: 8 }); // paint tin
    // pegboard and tools
    k.slab(MAT.pegboard(), 1.86, 1.1, 0.04, 0, 0.92, -0.32);
    k.box(W('pine'), 1.9, 0.05, 0.06, 0, 2.04, -0.3);
    const steel = plain('#9aa0a8', 0.35, 0.8);
    k.box(W('oak'), 0.04, 0.32, 0.03, -0.6, 1.5, -0.28, { rz: 0.1 }); k.box(steel, 0.16, 0.06, 0.04, -0.62, 1.66, -0.28); // hammer
    k.box(steel, 0.04, 0.34, 0.015, -0.3, 1.45, -0.29); k.cyl(steel, 0.05, 0.05, 0.015, -0.3, 1.64, -0.29, { rx: Math.PI / 2, seg: 6 }); // wrench
    k.box(steel, 0.42, 0.13, 0.01, 0.15, 1.6, -0.29); k.box(W('red'), 0.1, 0.16, 0.03, -0.11, 1.6, -0.285); // saw
    for (let i = 0; i < 5; i++) k.box(plain(['#c83a2a', '#e8c040', '#3a6ac8', '#2a2a2a', '#c86a2a'][i], 0.5), 0.025, 0.16, 0.025, 0.5 + i * 0.07, 1.22, -0.28);
    k.cyl(plain('#7ab0a0', 0.15), 0.06, 0.06, 0.14, 0.7, 0.93, 0.18, { seg: 7 }); // jar of screws
    // vise
    k.box(plain('#3a5a8a', 0.4, 0.4), 0.16, 0.12, 0.2, 0.75, 0.93, 0.3);
    k.box(plain('#3a5a8a', 0.4, 0.4), 0.16, 0.08, 0.06, 0.75, 0.94, 0.43);
    k.cyl(steel, 0.012, 0.012, 0.22, 0.75, 0.94, 0.5, { rz: Math.PI / 2, seg: 4 });
    // a desk lamp
    k.cyl(plain('#2a3a2a', 0.4, 0.5), 0.07, 0.08, 0.03, -0.75, 0.88, 0.1, { seg: 8 });
    k.cyl(plain('#2a3a2a', 0.4, 0.5), 0.012, 0.012, 0.4, -0.75, 1.07, 0.06, { rx: -0.3, seg: 4 });
    k.cyl(plain('#2a3a2a', 0.4, 0.5), 0.04, 0.1, 0.12, -0.7, 1.26, 0.18, { rx: 0.9, seg: 8, open: true });
    k.sphere(glow('#ffe0a0'), 0.03, -0.69, 1.23, 0.21, { w: 5, h: 4 });
    p.lights.push({ pos: new THREE.Vector3(-0.68, 1.15, 0.25), color: '#ffcf8a', intensity: 1.6, dist: 3 });
    // a little desk fan, spinning
    k.cyl(plain('#2a3a4a', 0.4, 0.5), 0.07, 0.08, 0.03, -0.3, 0.88, 0.2, { seg: 7 });
    k.cyl(plain('#2a3a4a', 0.4, 0.5), 0.014, 0.014, 0.18, -0.3, 0.97, 0.2, { seg: 5 });
    k.cyl(plain('#2a3a4a', 0.4, 0.5), 0.045, 0.045, 0.08, -0.3, 1.07, 0.18, { rx: Math.PI / 2, seg: 7 });
    const fan = new THREE.Group(); fan.position.set(-0.3, 1.07, 0.24);
    const kf = new Kit();
    for (let i = 0; i < 4; i++) kf.box(plain('#c8d0d8', 0.3, 0.6), 0.2, 0.06, 0.01, Math.cos(i * tau / 4) * 0.1, Math.sin(i * tau / 4) * 0.1, 0, { rz: i * tau / 4, chamfer: 0 });
    kf.add(plain('#9aa0a8', 0.3, 0.8), new THREE.TorusGeometry(0.2, 0.008, 3, 10), 0, 0, 0.03);
    fan.add(kf.build());
    p.group.add(fan);
    const prevTick = p.tick;
    p.tick = (t, dt) => { prevTick?.(t, dt); fan.rotation.z = -t * 14; };
    // a half-built gizmo
    k.box(plain('#b87a3a', 0.35, 0.8), 0.18, 0.08, 0.12, 0.1, 0.9, 0.1, { ry: 0.4 });
    k.cyl(plain('#b87a3a', 0.35, 0.8), 0.04, 0.04, 0.03, 0.1, 0.96, 0.1, { seg: 8 });
    p.height = 2.1;
  },
  locker(k, p) {
    const paint = MAT.metal('green');
    const w = 0.78, h = 1.9, d = 0.55;
    // the shell: back, sides, top, bottom (open front)
    k.slab(paint, w, h, 0.03, 0, 0, -d / 2 + 0.015);
    for (const sx of [-1, 1]) k.slab(paint, 0.03, h, d, sx * (w / 2 - 0.015), 0, 0);
    k.slab(paint, w, 0.03, d, 0, h - 0.03, 0); k.slab(paint, w, 0.08, d, 0, 0, 0);
    k.slab(paint, w - 0.06, 0.02, d - 0.04, 0, 1.45, 0); // shelf
    // inside: a dive mask, a scarf, a coiled line and a hook
    k.box(plain('#1a1a1a', 0.4), 0.18, 0.1, 0.06, -0.15, 1.55, -0.12);
    k.box(glow('#88c8e8'), 0.14, 0.07, 0.01, -0.15, 1.55, -0.085);
    k.cyl(plain('#e8e0c8', 0.8), 0.1, 0.1, 0.05, 0.15, 1.5, -0.1, { seg: 10 });
    k.box(MAT.knit('#3a6ac8/#e8e0d0'), 0.12, 0.6, 0.04, 0.2, 1.05, -0.2);
    k.cyl(plain('#c8c8d0', 0.3, 0.8), 0.01, 0.01, 0.1, -0.2, 1.3, -0.2, { rx: Math.PI / 2, seg: 4 });
    // two doors hinged at the sides
    for (const s of [-1, 1]) {
      hinged(p, null, s * (w / 2), 0.08, d / 2, 'y', s * 1.9, (h2) => {
        const dw = w / 2 - 0.01;
        h2.slab(paint, dw, h - 0.12, 0.025, -s * dw / 2, 0, 0);
        for (let i = 0; i < 5; i++) h2.box(MAT.dark(), dw * 0.6, 0.015, 0.01, -s * dw / 2, 1.45 + i * 0.045, 0.014);
        h2.box(plain('#c8c8d0', 0.3, 0.8), 0.02, 0.14, 0.03, -s * (dw - 0.06), 0.9, 0.025);
        if (s > 0) h2.box(MAT.brass(), 0.1, 0.05, 0.01, -dw / 2, 1.3, 0.016);
      });
    }
    p.height = h;
  },
  rug(k, p) {
    const bp = BLUEPRINTS.rug; void bp;
    const g = new THREE.PlaneGeometry(2.9, 3.9); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    k.add(MAT.rug('red'), g, 0, 0.012, 0, { uv: 'keep', shadow: false });
    void uv;
    p.height = 0.05;
  },
  rugBlue(k, p) {
    const g = new THREE.PlaneGeometry(1.8, 2.9); g.rotateX(-Math.PI / 2);
    k.add(MAT.rug('blue'), g, 0, 0.014, 0, { uv: 'keep', shadow: false });
    p.height = 0.05;
  },
  armchair(k, p) {
    const lea = MAT.leather('ox'), wood = W('walnut');
    legs4(k, wood, 0.8, 0.72, 0.1, 0.03);
    k.slab(lea, 0.82, 0.3, 0.76, 0, 0.1, 0);
    k.cushion(lea, 0.6, 0.1, 0.56, 0, 0.42, 0.06, { puff: 0.4 });
    k.slab(lea, 0.82, 0.62, 0.18, 0, 0.3, -0.3, { rx: -0.12 });
    for (const sx of [-1, 1]) { k.slab(lea, 0.14, 0.3, 0.74, sx * 0.36, 0.4, 0); k.cyl(lea, 0.08, 0.08, 0.74, sx * 0.36, 0.7, 0, { rx: Math.PI / 2, seg: 7 }); }
    p.seat = new THREE.Vector3(0, 0.5, 0.05);
    p.height = 1.0;
  },
  coffeeTable(k, p) {
    const wood = W('teak');
    k.cyl(wood, 0.42, 0.42, 0.05, 0, 0.42, 0, { seg: 8 });
    k.cyl(wood, 0.38, 0.38, 0.03, 0, 0.12, 0, { seg: 8 });
    for (let i = 0; i < 4; i++) { const a = i * tau / 4 + 0.4; k.cyl(wood, 0.025, 0.02, 0.4, Math.cos(a) * 0.3, 0.2, Math.sin(a) * 0.3, { seg: 5 }); }
    k.cyl(plain('#e8e0d0', 0.3), 0.045, 0.04, 0.09, 0.12, 0.49, 0.05, { seg: 8 }); // mug
    k.cyl(plain('#3a5a1a', 0.2), 0.04, 0.04, 0.005, 0.12, 0.533, 0.05, { seg: 8 });
    k.box(plain('#c84a3a', 0.8), 0.22, 0.012, 0.3, -0.12, 0.45, -0.05, { ry: 0.3 });
    k.box(plain('#3a8ac8', 0.8), 0.2, 0.012, 0.28, -0.1, 0.462, -0.02, { ry: -0.2 });
    p.height = 0.6;
  },
  bookshelf(k, p) {
    const wood = W('oak');
    const w = 1.8, h = 1.9, d = 0.36;
    for (const sx of [-1, 1]) k.slab(wood, 0.05, h, d, sx * (w / 2 - 0.025), 0, -0.25);
    k.slab(wood, w, 0.03, d, 0, h - 0.03, -0.25); k.slab(wood, w - 0.08, h, 0.02, 0, 0, -0.42);
    for (let i = 0; i < 4; i++) {
      const y = 0.08 + i * 0.46;
      k.slab(wood, w - 0.08, 0.04, d, 0, y, -0.25);
      // books: a textured slab of spines (cut to look like a row)
      const bw = 0.5 + hash2(i, 1, 2) * 0.6;
      const g = new THREE.BoxGeometry(bw, 0.34, 0.26);
      const uvA = g.attributes.uv as THREE.BufferAttribute;
      for (let j = 0; j < uvA.count; j++) uvA.setXY(j, uvA.getX(j) * bw / 1.0 + i * 0.3, uvA.getY(j));
      k.add(MAT.books(), g, -w / 2 + 0.06 + bw / 2 + hash2(i, 2, 2) * 0.2, y + 0.04 + 0.17, -0.24, { uv: 'keep' });
      // trinkets
      if (i === 1) { k.cyl(plain('#c8e8e0', 0.1), 0.08, 0.08, 0.2, 0.55, y + 0.14, -0.24, { seg: 8 }); for (let j = 0; j < 5; j++) k.sphere(plain('#fff8f0', 0.15), 0.025, 0.52 + (j % 3) * 0.03, y + 0.08 + j * 0.02, -0.24, { w: 5, h: 4 }); }
      if (i === 2) k.lathe(plain('#e8c8a0', 0.5), [[0.001, 0], [0.09, 0.02], [0.07, 0.08], [0.02, 0.16], [0.001, 0.18]], 0.5, y + 0.04, -0.24, { seg: 7 });
      if (i === 0) k.slab(plain('#5a3a8a', 0.4), 0.28, 0.2, 0.22, 0.48, y + 0.04, -0.24);
    }
    p.height = h;
  },
  plant(k, p) {
    k.lathe(plain('#a8542e', 0.85), [[0.001, 0], [0.17, 0], [0.22, 0.32], [0.25, 0.34], [0.25, 0.4], [0.2, 0.4], [0.001, 0.38]], 0, 0, 0, { seg: 8 });
    k.cyl(plain('#2a1a10', 1), 0.2, 0.2, 0.02, 0, 0.385, 0, { seg: 8 });
    const leaf = retro(new THREE.MeshStandardMaterial({ map: TEX.kelp(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * tau + hash2(i, 3, 3), L = 0.55 + hash2(i, 4, 3) * 0.35;
      const g = new THREE.PlaneGeometry(0.16, L, 1, 3);
      g.translate(0, L / 2, 0);
      const P = g.attributes.position as THREE.BufferAttribute;
      for (let j = 0; j < P.count; j++) { const y = P.getY(j); P.setZ(j, (y / L) ** 2 * 0.35 * L); }
      g.rotateX(-0.25 - hash2(i, 5, 3) * 0.3); g.rotateY(a);
      k.add(leaf, g, 0, 0.38, 0, { uv: 'keep' });
    }
    p.height = 1.2;
  },
  aquarium(k, p) {
    const wood = W('walnut');
    k.slab(wood, 1.7, 0.7, 0.6, 0, 0, 0);
    for (const sx of [-0.42, 0.42]) { k.box(W('teak'), 0.78, 0.6, 0.01, sx, 0.36, 0.305); k.box(MAT.brass(), 0.04, 0.04, 0.02, sx + (sx < 0 ? 0.3 : -0.3), 0.4, 0.315); }
    // gravel, rocks, a castle and kelp in a lit tank
    k.slab(plain('#c8b088', 1), 1.6, 0.06, 0.5, 0, 0.72, 0);
    k.sphere(MAT.rock(), 0.12, -0.4, 0.8, -0.05, { w: 5, h: 4, sy: 0.7 });
    k.slab(plain('#8a8a90', 0.9), 0.16, 0.24, 0.16, 0.45, 0.76, -0.08);
    for (const sx of [0.39, 0.51]) k.slab(plain('#8a8a90', 0.9), 0.05, 0.06, 0.16, sx, 1.0, -0.08);
    const water = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.56, 0.5), retro(new THREE.MeshStandardMaterial({ color: '#2a9ab0', transparent: true, opacity: 0.32, roughness: 0.1, emissive: '#0a4a5a', emissiveIntensity: 0.8, depthWrite: false })));
    water.position.set(0, 1.03, 0);
    const frame = MAT.plain('#1a1a1a/0.4/0.6');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(frame, 0.025, 0.66, 0.025, sx * 0.8, 1.03, sz * 0.25);
    k.box(frame, 1.66, 0.04, 0.56, 0, 1.36, 0);
    k.box(glow('#c8f4ff'), 1.4, 0.01, 0.1, 0, 1.335, 0);
    // fish: little orange darts circling
    const fishG = new THREE.ConeGeometry(0.03, 0.1, 4); fishG.rotateZ(-Math.PI / 2);
    const fish: THREE.Mesh[] = [];
    const fc = ['#ff8a2a', '#ffd040', '#40c8ff', '#ff5a8a'];
    for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(fishG, glow(fc[i % 4])); fish.push(f); p.group.add(f); }
    p.group.add(water);
    // the aquarium-within-the-aquarium: a tiny tank on the gravel with an even tinier fish
    k.box(plain('#1a1a1a', 0.4, 0.6), 0.26, 0.02, 0.16, -0.05, 0.76, 0.02, { chamfer: 0 });
    const mini = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.14), retro(new THREE.MeshStandardMaterial({ color: '#9ae8ff', transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false })));
    mini.position.set(-0.05, 0.85, 0.02);
    p.group.add(mini);
    const tinyFish = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 4).rotateZ(-Math.PI / 2), glow('#ffd040'));
    p.group.add(tinyFish);
    p.lights.push({ pos: new THREE.Vector3(0, 1.2, 0.4), color: '#7ae0ff', intensity: 1.2, dist: 3.5 });
    p.tick = (t) => {
      fish.forEach((f, i) => {
        const a = t * (0.5 + i * 0.13) + i * 1.7, r = 0.55 - i * 0.05;
        f.position.set(Math.cos(a) * r, 0.9 + ((i * 0.11) % 0.35) + Math.sin(t * 1.3 + i) * 0.03, Math.sin(a) * 0.15);
        f.rotation.y = -a - Math.PI / 2;
      });
      const b = t * 1.7;
      tinyFish.position.set(-0.05 + Math.cos(b) * 0.07, 0.85 + Math.sin(t * 2.3) * 0.02, 0.02 + Math.sin(b) * 0.04);
      tinyFish.rotation.y = -b - Math.PI / 2;
    };
    p.height = 1.4;
  },
  bunk(k, p) {
    const wood = W('pine'), w = 1.95, d = 0.9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.slab(wood, 0.07, 1.85, 0.07, sx * (w / 2 - 0.035), 0, sz * (d / 2 - 0.035));
    for (const y of [0.3, 1.2]) {
      k.slab(wood, w, 0.08, d, 0, y, 0);
      k.cushion(MAT.fabric('cream'), w - 0.14, 0.12, d - 0.1, 0, y + 0.14, 0, { puff: 0.25 });
      k.box(MAT.knit(y < 1 ? '#3a5a8a/#e8d8b0' : '#5a7a3a/#e8d8b0'), w * 0.6, 0.05, d - 0.06, 0.25, y + 0.3, 0);
      k.cushion(plain('#f0ece0', 0.9), 0.4, 0.08, 0.5, -0.65, y + 0.28, 0, { puff: 0.6 });
    }
    k.slab(wood, w, 0.14, 0.04, 0, 1.45, 0.43);
    // ladder
    for (const sz of [0.47]) for (let i = 0; i < 5; i++) k.box(wood, 0.3, 0.03, 0.03, 0.7, 0.4 + i * 0.25, sz);
    for (const sx of [0.56, 0.84]) k.slab(wood, 0.035, 1.5, 0.035, sx, 0, 0.47);
    p.height = 1.9;
  },
  recordPlayer(k, p) {
    k.slab(W('walnut'), 0.62, 0.62, 0.5, 0, 0, 0);
    k.slab(plain('#c8b890', 0.9), 0.5, 0.3, 0.01, 0, 0.18, 0.25);
    k.slab(W('teak'), 0.6, 0.06, 0.48, 0, 0.62, 0);
    k.cyl(plain('#3a3438', 0.5, 0.4), 0.2, 0.2, 0.02, -0.05, 0.69, 0.03, { seg: 12 });
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 14), retro(new THREE.MeshStandardMaterial({ map: (() => { const q = new Px(16, 16); q.fill((x, y) => { const r = Math.hypot(x - 7.5, y - 7.5); return r < 2 ? hex('#c83a2a') : r < 2.6 ? hex('#e8e0d0') : ((r * 2) | 0) % 2 ? hex('#141214') : hex('#262226'); }); return q.texture({ mip: false }); })(), roughness: 0.3 })));
    platter.position.set(-0.05, 0.705, 0.03);
    p.group.add(platter);
    k.box(plain('#c8c8d0', 0.25, 0.9), 0.015, 0.015, 0.22, 0.17, 0.72, -0.02, { ry: 0.5 });
    // the horn
    k.cyl(MAT.brass(), 0.015, 0.015, 0.3, 0.15, 0.82, -0.12, { seg: 5, rz: 0.4 });
    k.lathe(MAT.brass(), [[0.02, 0], [0.04, 0.12], [0.09, 0.24], [0.2, 0.34], [0.24, 0.36]], 0.24, 0.92, -0.12, { seg: 10, rz: -0.9, rx: 0.2 });
    p.tick = (t) => { platter.rotation.y = -t * 3.5; };
    p.height = 1.3;
  },
  stove(k, p) {
    const iron = plain('#26262a', 0.6, 0.6);
    k.lathe(iron, [[0.001, 0.12], [0.24, 0.12], [0.3, 0.3], [0.32, 0.55], [0.26, 0.8], [0.18, 0.88], [0.001, 0.9]], 0, 0, 0, { seg: 9 });
    for (let i = 0; i < 3; i++) { const a = i * tau / 3; k.cyl(iron, 0.025, 0.03, 0.14, Math.cos(a) * 0.2, 0.06, Math.sin(a) * 0.2, { seg: 5 }); }
    k.cyl(iron, 0.07, 0.07, 1.9, 0, 1.8, -0.05, { seg: 7 });
    k.cyl(iron, 0.09, 0.09, 0.05, 0, 0.92, -0.05, { seg: 7 });
    k.box(glow('#ff7a20'), 0.18, 0.12, 0.02, 0, 0.42, 0.31);
    k.box(iron, 0.22, 0.02, 0.03, 0, 0.49, 0.315); k.box(iron, 0.22, 0.02, 0.03, 0, 0.35, 0.315);
    for (let i = 0; i < 4; i++) k.box(iron, 0.012, 0.13, 0.03, -0.075 + i * 0.05, 0.42, 0.32);
    k.cyl(plain('#5a3a2a', 0.6, 0.3), 0.09, 0.08, 0.12, 0.05, 0.96, 0.05, { seg: 8 }); // kettle
    k.cyl(plain('#5a3a2a', 0.6, 0.3), 0.015, 0.01, 0.1, 0.16, 0.98, 0.05, { rz: -0.8, seg: 4 });
    p.lights.push({ pos: new THREE.Vector3(0, 0.45, 0.5), color: '#ff8a3a', intensity: 2.2, dist: 4.5, flicker: 1, key: true });
    p.height = 2.8;
  },
  fridge(k, p) {
    const enamel = plain('#e8e0c8', 0.35, 0.1), chrome = plain('#d8dce0', 0.2, 0.9);
    k.slab(enamel, 0.7, 1.5, 0.6, 0, 0.06, -0.12);
    k.cyl(enamel, 0.3, 0.3, 0.6, 0, 1.56, -0.12, { rx: Math.PI / 2, seg: 10 }); // rounded top
    k.box(enamel, 0.7, 0.04, 0.6, 0, 1.56, -0.12);
    k.box(plain('#2a2a2a', 0.8), 0.68, 0.06, 0.56, 0, 0.03, -0.12);
    k.box(chrome, 0.04, 0.3, 0.05, 0.27, 1.1, 0.2);
    k.box(plain('#b0a890', 0.5), 0.66, 0.01, 0.01, 0, 1.25, 0.18);
    k.box(chrome, 0.3, 0.05, 0.01, 0, 1.68, 0.18);
    for (let i = 0; i < 5; i++) k.sphere(plain(['#e83a2a', '#3ac83a', '#3a6ae8', '#e8c83a', '#c83ae8'][i], 0.4), 0.02, -0.2 + (i % 3) * 0.12, 0.6 + Math.floor(i / 3) * 0.3 + hash2(i, 1, 1) * 0.1, 0.19, { w: 5, h: 4, sz: 0.4 });
    k.box(plain('#f8f0e0', 0.9), 0.12, 0.16, 0.005, -0.12, 0.85, 0.185, { rz: 0.1 });
    p.height = 1.9;
  },
  beanbag(k, p) {
    const g = new THREE.SphereGeometry(0.42, 9, 6);
    const P = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) { const y = P.getY(i); P.setY(i, y < 0 ? y * 0.5 : y * 0.75 - Math.max(0, P.getZ(i)) * 0.2); P.setX(i, P.getX(i) * (1 + Math.max(0, -y) * 0.4)); P.setZ(i, P.getZ(i) * (1 + Math.max(0, -y) * 0.4)); }
    g.computeVertexNormals();
    k.add(MAT.fabric('plum'), g, 0, 0.22, 0);
    p.seat = new THREE.Vector3(0, 0.4, 0.05);
    p.height = 0.6;
  },
  lamp(k, p) {
    const brass = MAT.brass();
    k.cyl(brass, 0.16, 0.18, 0.04, 0, 0.02, 0, { seg: 8 });
    k.cyl(brass, 0.016, 0.016, 1.45, 0, 0.76, 0, { seg: 5 });
    k.lathe(MAT.fabric('cream'), [[0.26, 0], [0.22, 0.1], [0.15, 0.28]], 0, 1.3, 0, { seg: 8 });
    // the inside of the shade glows
    k.lathe(glow('#ffd28a'), [[0.15, 0.28], [0.22, 0.1], [0.255, 0.005]], 0, 1.3, 0, { seg: 8 });
    // fringe
    for (let i = 0; i < 16; i++) { const a = (i / 16) * tau; k.box(plain('#c89a5a', 0.9), 0.02, 0.06, 0.005, Math.cos(a) * 0.265, 1.27, Math.sin(a) * 0.265, { ry: -a + Math.PI / 2 }); }
    p.lights.push({ pos: new THREE.Vector3(0, 1.3, 0), color: '#ffb060', intensity: 2.2, dist: 5, flicker: 0.12, key: true });
    p.height = 1.65;
  },
  candles(k, p) {
    crate(k, 0.5, 0.36, 0.42, 0, 0, 0, 'drift');
    const wax = plain('#f0e6cc', 0.6);
    const spots: [number, number, number][] = [[-0.12, 0.08, 0.18], [0.06, 0.06, 0.26], [0.16, -0.1, 0.12], [-0.04, -0.08, 0.1], [0.1, 0.12, 0.08]];
    for (const [x, z, h] of spots) { k.cyl(wax, 0.03, 0.035, h, x, 0.36 + h / 2, z, { seg: 6 }); k.cyl(wax, 0.045, 0.02, 0.02, x, 0.37, z, { seg: 6 }); flame(p, x, 0.36 + h, z); }
    p.lights.push({ pos: new THREE.Vector3(0, 0.7, 0), color: '#ffa850', intensity: 1.4, dist: 3.5, flicker: 0.6 });
    p.height = 0.7;
  },
  lavaLamp(k, p) {
    k.lathe(plain('#c8c8d0', 0.25, 0.9), [[0.001, 0], [0.13, 0], [0.09, 0.22], [0.06, 0.24]], 0, 0, 0, { seg: 8 });
    k.lathe(plain('#c8c8d0', 0.25, 0.9), [[0.06, 0], [0.04, 0.1], [0.001, 0.12]], 0, 0.78, 0, { seg: 8 });
    const glass = new THREE.Mesh(new THREE.LatheGeometry([[0.06, 0], [0.1, 0.18], [0.1, 0.3], [0.06, 0.54]].map(([r, y]) => new THREE.Vector2(r, y)), 10), retro(new THREE.MeshStandardMaterial({ color: '#4a0a5a', emissive: '#5a1070', emissiveIntensity: 1.2, transparent: true, opacity: 0.75, roughness: 0.15 })));
    glass.position.y = 0.24;
    p.group.add(glass);
    const blobs: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04 + i * 0.01, 6, 5), glow('#ff5ad0')); blobs.push(b); p.group.add(b); }
    p.tick = (t) => blobs.forEach((b, i) => { const y = 0.3 + (Math.sin(t * 0.4 + i * 2.1) * 0.5 + 0.5) * 0.4; b.position.set(Math.sin(t * 0.3 + i) * 0.02, y, 0); b.scale.set(1, 1.2 + Math.sin(t + i) * 0.3, 1); });
    p.lights.push({ pos: new THREE.Vector3(0, 0.6, 0.2), color: '#d050ff', intensity: 1.6, dist: 3.5 });
    p.height = 0.95;
  },
  jellyLantern(k, p) {
    k.cyl(MAT.brass(), 0.16, 0.18, 0.05, 0, 0.025, 0, { seg: 8 });
    k.cyl(MAT.brass(), 0.14, 0.16, 0.05, 0, 0.66, 0, { seg: 8 });
    k.add(MAT.brass(), new THREE.TorusGeometry(0.08, 0.012, 4, 10), 0, 0.76, 0);
    for (let i = 0; i < 4; i++) { const a = i * tau / 4; k.cyl(MAT.brass(), 0.012, 0.012, 0.6, Math.cos(a) * 0.15, 0.35, Math.sin(a) * 0.15, { seg: 4 }); }
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.58, 10, 1, true), retro(new THREE.MeshStandardMaterial({ color: '#80c0d0', transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide })));
    jar.position.y = 0.35;
    const jelly = new THREE.Group();
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 5, 0, tau, 0, Math.PI / 2), glow('#9ff0ff'));
    jelly.add(bell);
    for (let i = 0; i < 6; i++) { const a = i * tau / 6; const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.16, 3), glow('#c8a0ff')); tt.position.set(Math.cos(a) * 0.05, -0.08, Math.sin(a) * 0.05); jelly.add(tt); }
    p.group.add(jar, jelly);
    p.tick = (t) => { const s = 1 + Math.sin(t * 2.2) * 0.12; bell.scale.set(s, 1 / s, s); jelly.position.set(Math.sin(t * 0.7) * 0.03, 0.4 + Math.sin(t * 1.1) * 0.06, 0); };
    p.lights.push({ pos: new THREE.Vector3(0, 0.45, 0.2), color: '#6ae8ff', intensity: 1.7, dist: 4, flicker: 0.2 });
    p.height = 0.8;
  },
  trophyWall(k, p) {
    k.slab(plain('#a07a4a', 0.95), 1.8, 1.15, 0.05, 0, 0.75, -0.42);
    k.box(W('walnut'), 1.86, 0.06, 0.08, 0, 0.75, -0.41); k.box(W('walnut'), 1.86, 0.06, 0.08, 0, 1.9, -0.41);
    for (const sx of [-1, 1]) { k.box(W('walnut'), 0.06, 1.2, 0.08, sx * 0.9, 1.33, -0.41); k.slab(W('walnut'), 0.06, 0.75, 0.06, sx * 0.8, 0, -0.42); }
    const nem = META.nemeses.slice(0, 6);
    const n = Math.max(3, nem.length);
    const pins: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const ne = nem[i];
      const x = -0.6 + (i % 3) * 0.6 + (hash2(i, 1, 9) - 0.5) * 0.1, y = 1.6 - Math.floor(i / 3) * 0.55 + (hash2(i, 2, 9) - 0.5) * 0.06;
      const mat = retro(new THREE.MeshStandardMaterial({ map: wantedPoster(ne ? ne.seed : i * 7 + 3, ne?.name ?? '?'), roughness: 0.9 }));
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), mat);
      q.position.set(x, y, -0.39); q.rotation.z = (hash2(i, 3, 9) - 0.5) * 0.15;
      p.group.add(q);
      pins.push(new THREE.Vector3(x, y + 0.17, -0.38));
      k.sphere(plain('#d82020', 0.3), 0.018, x, y + 0.17, -0.37, { w: 5, h: 4 });
    }
    // red string between the pins
    const strM = plain('#c81818', 0.8);
    for (let i = 0; i + 1 < pins.length; i++) {
      const a = pins[i], b = pins[(i + 2) % pins.length];
      const d = b.clone().sub(a), L = d.length();
      const g = new THREE.CylinderGeometry(0.004, 0.004, L, 3); g.rotateZ(Math.PI / 2);
      k.add(strM, g, (a.x + b.x) / 2, (a.y + b.y) / 2, -0.37, { rz: Math.atan2(d.y, d.x) });
    }
    p.height = 2.0;
  },
  painting(k, p) {
    const kinds = ['portrait', 'whale', 'sunset'];
    const kind = kinds[Math.floor(Math.random() * 3)];
    k.box(MAT.brass(), 0.82, 0.64, 0.05, 0, 1.45, -0.44);
    k.box(W('walnut'), 0.74, 0.56, 0.055, 0, 1.45, -0.44);
    k.quad(MAT.painting(kind), 0.68, 0.5, 0, 1.45, -0.41);
    k.box(glow('#ffe0b0'), 0.3, 0.02, 0.04, 0, 1.82, -0.4);
    k.slab(W('walnut'), 0.5, 0.06, 0.14, 0, 0, -0.42); // tiny bench under it
    p.height = 1.9;
  },
  shipWheel(k, p) {
    const wood = W('teak');
    const g = new THREE.Group(); g.position.set(0, 1.3, -0.4);
    const kk = new Kit();
    kk.add(wood, new THREE.TorusGeometry(0.42, 0.04, 5, 14));
    kk.cyl(MAT.brass(), 0.09, 0.09, 0.08, 0, 0, 0, { rx: Math.PI / 2, seg: 8 });
    for (let i = 0; i < 8; i++) { const a = i * tau / 8; kk.cyl(wood, 0.022, 0.022, 1.1, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0, { rz: a - Math.PI / 2, seg: 5 }); kk.cyl(wood, 0.035, 0.025, 0.14, Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0, { rz: a - Math.PI / 2, seg: 6 }); }
    g.add(kk.build());
    p.group.add(g);
    k.slab(W('walnut'), 0.12, 1.3, 0.12, 0, 0, -0.44);
    p.tick = (t) => { g.rotation.z = Math.sin(t * 0.3) * 0.25; };
    p.height = 1.9;
  },
  anchor(k, p) {
    const iron = plain('#3a3632', 0.7, 0.6);
    k.cyl(iron, 0.05, 0.05, 1.3, 0, 0.75, 0, { seg: 6 });
    k.add(iron, new THREE.TorusGeometry(0.11, 0.035, 5, 8), 0, 1.48, 0);
    k.box(iron, 0.6, 0.07, 0.07, 0, 1.25, 0);
    const arc = new THREE.TorusGeometry(0.42, 0.05, 5, 10, Math.PI);
    k.add(iron, arc, 0, 0.55, 0, { rz: Math.PI });
    for (const s of [-1, 1]) k.add(iron, new THREE.ConeGeometry(0.08, 0.2, 4), s * 0.42, 0.62, 0, { rz: s * 0.3 });
    for (let i = 0; i < 9; i++) k.sphere(plain('#d8d0c0', 0.9), 0.03, Math.cos(i) * 0.06, 0.3 + i * 0.12, Math.sin(i * 2) * 0.05, { w: 5, h: 3 });
    p.height = 1.6;
  },
  treasure(k, p) {
    const gold = plain('#e8b030', 0.3, 0.9);
    k.lathe(gold, [[0.001, 0], [0.42, 0], [0.34, 0.12], [0.2, 0.28], [0.06, 0.38], [0.001, 0.4]], 0, 0, 0, { seg: 9 });
    for (let i = 0; i < 26; i++) {
      const a = hash2(i, 1, 4) * tau, r = 0.1 + hash2(i, 2, 4) * 0.42;
      k.cyl(gold, 0.04, 0.04, 0.012, Math.cos(a) * r, Math.max(0.01, 0.38 - r * 0.8) + hash2(i, 3, 4) * 0.03, Math.sin(a) * r, { rx: hash2(i, 4, 4) * 0.8, rz: hash2(i, 5, 4) * 0.8, seg: 7 });
    }
    k.sphere(plain('#c8203a', 0.15), 0.05, 0.12, 0.32, 0.08, { w: 5, h: 4 });
    k.sphere(plain('#20c86a', 0.15), 0.04, -0.15, 0.25, -0.05, { w: 5, h: 4 });
    p.height = 0.5;
  },
  helmet(k, p) {
    const cu = plain('#b8642a', 0.35, 0.85), brass = MAT.brass();
    k.slab(W('walnut'), 0.5, 0.3, 0.5, 0, 0, 0);
    k.lathe(cu, [[0.3, 0], [0.26, 0.1], [0.16, 0.14]], 0, 0.3, 0, { seg: 10 });
    k.sphere(cu, 0.27, 0, 0.66, 0, { w: 10, h: 8 });
    for (const [x, z, ry] of [[0, 0.22, 0], [0.22, 0.02, Math.PI / 2], [-0.22, 0.02, -Math.PI / 2]] as const) {
      k.add(brass, new THREE.TorusGeometry(0.09, 0.025, 5, 10), x, 0.66, z, { ry });
      k.cyl(plain('#2a4a5a', 0.05, 0.3), 0.08, 0.08, 0.02, x, 0.66, z, { rx: Math.PI / 2, ry, seg: 10 });
    }
    for (let i = 0; i < 8; i++) { const a = i * tau / 8; k.sphere(brass, 0.022, Math.cos(a) * 0.28, 0.42, Math.sin(a) * 0.28, { w: 5, h: 4 }); }
    p.height = 1.0;
  },
  manaAltar(k, p) {
    const stone = MAT.rock();
    k.lathe(stone, [[0.001, 0], [0.42, 0], [0.42, 0.12], [0.3, 0.18], [0.24, 0.6], [0.34, 0.7], [0.34, 0.78], [0.001, 0.78]], 0, 0, 0, { seg: 8 });
    const crystals: THREE.Mesh[] = [];
    const cm = [glow('#b06aff'), glow('#6ae0ff'), glow('#d090ff')];
    const spec: [number, number, number, number, number][] = [[0, 0, 0.42, 0, 0], [0.12, 0.05, 0.26, 0.4, 0.2], [-0.1, 0.06, 0.22, -0.4, -0.2], [0.02, -0.12, 0.2, 0.2, -0.4]];
    spec.forEach(([x, z, h, rz, rx], i) => {
      const g = new THREE.OctahedronGeometry(0.07, 0); g.scale(1, h / 0.07 * 0.5, 1);
      const m = new THREE.Mesh(g, cm[i % 3]); m.position.set(x, 0.78 + h * 0.4, z); m.rotation.set(rx, i, rz);
      p.group.add(m); crystals.push(m);
    });
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), glow('#ffffff'));
    p.group.add(orb);
    p.tick = (t) => { orb.position.set(Math.cos(t) * 0.25, 1.35 + Math.sin(t * 1.7) * 0.06, Math.sin(t) * 0.25); orb.rotation.set(t, t * 1.3, 0); crystals[0].rotation.y = t * 0.4; };
    p.lights.push({ pos: new THREE.Vector3(0, 1.2, 0.2), color: '#a46aff', intensity: 2.2, dist: 4.5, flicker: 0.25 });
    p.height = 1.5;
  },
  forge(k, p) {
    const brick = plain('#6a2e1e', 0.95), iron = plain('#2a2a2e', 0.5, 0.7);
    // brick hearth
    for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) k.box(r % 2 ? brick : plain('#7a3a26', 0.95), 0.22, 0.12, 0.62, -0.9 + 0.13 + c * 0.22 + (r % 2) * 0.05, 0.06 + r * 0.125, -0.02);
    k.slab(plain('#3a3632', 0.9), 0.95, 0.06, 0.66, -0.45, 0.75, -0.02);
    k.box(glow('#ff6a1a'), 0.6, 0.04, 0.4, -0.45, 0.8, 0);
    for (let i = 0; i < 9; i++) k.sphere(glow(i % 2 ? '#ffb040' : '#ff4a10'), 0.04 + hash2(i, 1, 1) * 0.03, -0.7 + (i % 5) * 0.12, 0.83, -0.12 + Math.floor(i / 5) * 0.2, { w: 4, h: 3 });
    k.box(iron, 0.9, 0.5, 0.5, -0.45, 1.55, -0.1);
    k.lathe(iron, [[0.45, 0], [0.12, 0.4]], -0.45, 1.3, -0.1, { seg: 4, ry: Math.PI / 4 });
    k.cyl(iron, 0.1, 0.1, 1.2, -0.45, 2.3, -0.15, { seg: 6 });
    // anvil on a stump
    k.cyl(W('drift'), 0.22, 0.25, 0.45, 0.5, 0.225, 0.05, { seg: 8 });
    k.box(iron, 0.22, 0.18, 0.16, 0.5, 0.54, 0.05);
    k.box(iron, 0.5, 0.1, 0.2, 0.5, 0.68, 0.05);
    k.add(iron, new THREE.ConeGeometry(0.1, 0.25, 4), 0.85, 0.68, 0.05, { rz: -Math.PI / 2 });
    k.box(W('oak'), 0.04, 0.04, 0.35, 0.45, 0.76, 0.15, { ry: 0.6 }); k.box(iron, 0.1, 0.06, 0.06, 0.38, 0.77, 0.03, { ry: 0.6 });
    p.lights.push({ pos: new THREE.Vector3(-0.45, 1.0, 0.45), color: '#ff7a2a', intensity: 3.0, dist: 5, flicker: 1 });
    p.height = 2.9;
  },
  weaponRack(k, p) {
    const wood = W('walnut');
    k.slab(wood, 0.9, 0.08, 0.2, 0, 0.1, -0.35);
    k.box(wood, 0.9, 0.08, 0.12, 0, 1.4, -0.4);
    for (const sx of [-1, 1]) k.slab(wood, 0.06, 1.6, 0.06, sx * 0.42, 0, -0.42);
    const pick = plain('#e8d0a0', 0.8), frill = plain('#e83a5a', 0.6);
    for (let i = 0; i < 3; i++) {
      const x = -0.25 + i * 0.25;
      k.cyl(pick, 0.012, 0.004, 1.25, x, 0.78, -0.33, { seg: 5, rx: 0.05 });
      k.cyl(frill, 0.04, 0.04, 0.06, x, 1.32, -0.35, { seg: 6 });
      k.box(plain('#c8a070', 0.9), 0.12, 0.02, 0.06, x, 1.2, -0.34);
    }
    k.cyl(plain('#c8ccd0', 0.25, 0.9), 0.008, 0.008, 1.0, 0.36, 0.75, -0.3, { seg: 4 });
    for (const dx of [-0.03, 0, 0.03]) k.cyl(plain('#c8ccd0', 0.25, 0.9), 0.005, 0.002, 0.15, 0.36 + dx, 1.32, -0.3, { seg: 3 });
    p.height = 1.6;
  },
  toyBench(k, p) {
    k.slab(W('pine'), 1.8, 0.07, 0.7, 0, 0.78, 0);
    legs4(k, W('pine'), 1.7, 0.6, 0.78, 0.04);
    // a wind-up megalodon toy with a key
    const grey = plain('#6a7a8a', 0.4, 0.5), belly = plain('#e8e0d0', 0.5);
    const g = new THREE.Group(); g.position.set(-0.35, 0.95, 0.05);
    const kk = new Kit();
    kk.sphere(grey, 0.13, 0, 0, 0, { sx: 2.2, sy: 0.9, sz: 0.9, w: 8, h: 6 });
    kk.sphere(belly, 0.1, 0.05, -0.04, 0, { sx: 2.2, sy: 0.6, sz: 0.85, w: 8, h: 5 });
    kk.add(grey, new THREE.ConeGeometry(0.06, 0.16, 4), 0, 0.15, 0, { rz: 0.4 });
    kk.add(grey, new THREE.ConeGeometry(0.06, 0.18, 4), -0.32, 0.05, 0, { rz: 1.2 });
    kk.box(plain('#fff8f0', 0.3), 0.08, 0.02, 0.14, 0.24, -0.05, 0);
    kk.cyl(MAT.brass(), 0.008, 0.008, 0.12, 0, 0.02, -0.15, { rx: Math.PI / 2, seg: 4 });
    kk.add(MAT.brass(), new THREE.TorusGeometry(0.035, 0.008, 4, 8), 0, 0.02, -0.22);
    g.add(kk.build());
    p.group.add(g);
    // tin crab, springs jar, a spool of line, cog
    k.slab(plain('#d84a2a', 0.4, 0.6), 0.16, 0.06, 0.12, 0.25, 0.85, 0.1);
    for (const s of [-1, 1]) k.box(plain('#d84a2a', 0.4, 0.6), 0.04, 0.03, 0.1, 0.25 + s * 0.12, 0.88, 0.18);
    k.cyl(plain('#c8e8e0', 0.1), 0.07, 0.07, 0.18, 0.6, 0.94, -0.15, { seg: 8 });
    for (let i = 0; i < 4; i++) k.add(plain('#b8b8c0', 0.3, 0.9), new THREE.TorusGeometry(0.03, 0.005, 3, 8), 0.6, 0.88 + i * 0.03, -0.15, { rx: Math.PI / 2 });
    k.add(MAT.brass(), new THREE.TorusGeometry(0.06, 0.02, 4, 8), 0.65, 0.84, 0.15, { rx: Math.PI / 2 });
    k.slab(MAT.pegboard(), 1.8, 0.9, 0.04, 0, 0.85, -0.33);
    p.tick = (t) => { g.position.x = -0.35 + Math.sin(t * 0.8) * 0.05; g.rotation.y = Math.sin(t * 1.6) * 0.15; g.position.y = 0.95 + Math.abs(Math.sin(t * 6)) * 0.01; };
    p.lights.push({ pos: new THREE.Vector3(0, 1.4, 0.3), color: '#ffe0a0', intensity: 1.2, dist: 3 });
    p.height = 1.8;
  },
  junkLathe(k, p) {
    const steel = plain('#4a5a6a', 0.45, 0.6), dark = plain('#26282c', 0.5, 0.6);
    legs4(k, dark, 1.6, 0.5, 0.7, 0.05);
    k.slab(MAT.metal('grey'), 1.7, 0.12, 0.55, 0, 0.7, 0);
    k.slab(steel, 0.4, 0.42, 0.45, -0.6, 0.82, 0); // headstock
    k.cyl(dark, 0.14, 0.14, 0.1, -0.35, 1.05, 0, { rz: Math.PI / 2, seg: 8 }); // chuck
    k.cyl(plain('#b0b4b8', 0.25, 0.9), 0.04, 0.04, 0.7, 0.05, 1.05, 0, { rz: Math.PI / 2, seg: 6 }); // workpiece
    k.slab(steel, 0.22, 0.3, 0.3, 0.55, 0.82, 0); // tailstock
    k.cyl(dark, 0.03, 0.03, 0.18, 0.4, 1.05, 0, { rz: Math.PI / 2, seg: 5 });
    k.slab(MAT.metal('yellow'), 0.3, 0.25, 0.3, -0.6, 1.24, -0.05); // motor
    k.cyl(dark, 0.06, 0.06, 0.04, -0.6, 1.4, 0.12, { rx: Math.PI / 2, seg: 8 });
    // scrap bin
    crate(k, 0.5, 0.4, 0.4, 0.5, 0, 0.0, 'drift');
    for (let i = 0; i < 6; i++) k.box(plain(['#8a5a2a', '#9aa0a8', '#5a3a1a'][i % 3], 0.5, 0.6), 0.1 + hash2(i, 1, 2) * 0.1, 0.02, 0.05, 0.45 + hash2(i, 2, 2) * 0.1, 0.42 + i * 0.01, -0.1 + hash2(i, 3, 2) * 0.2, { ry: i });
    k.box(glow('#ffe8a0'), 0.04, 0.02, 0.04, -0.35, 1.25, 0.1);
    p.lights.push({ pos: new THREE.Vector3(-0.2, 1.4, 0.4), color: '#cfe4ff', intensity: 1.4, dist: 3 });
    p.height = 1.5;
  },
  inkStill(k, p) {
    const cu = plain('#b8642a', 0.3, 0.85);
    k.slab(W('drift'), 0.8, 0.5, 0.6, 0, 0, 0);
    k.lathe(cu, [[0.001, 0], [0.2, 0.02], [0.24, 0.18], [0.2, 0.34], [0.06, 0.42], [0.04, 0.6]], -0.15, 0.5, 0, { seg: 9 });
    for (let i = 0; i < 4; i++) k.add(cu, new THREE.TorusGeometry(0.12, 0.018, 4, 10), 0.2, 0.62 + i * 0.07, 0.05, { rx: Math.PI / 2 });
    k.cyl(cu, 0.018, 0.018, 0.4, 0.03, 1.08, 0.02, { rz: 1.2, seg: 5 });
    const ink = plain('#120a1e', 0.1, 0.2);
    k.lathe(ink, [[0.001, 0], [0.1, 0.02], [0.11, 0.1], [0.04, 0.22], [0.03, 0.3]], 0.25, 0.5, -0.18, { seg: 8 });
    k.box(glow('#5aa0ff'), 0.16, 0.04, 0.16, -0.15, 0.52, 0);
    p.lights.push({ pos: new THREE.Vector3(-0.1, 0.8, 0.3), color: '#6a8aff', intensity: 1.2, dist: 3, flicker: 0.4 });
    p.height = 1.3;
  },
  periscope(k, p) {
    const pipe = plain('#4a5a4a', 0.45, 0.7), brass = MAT.brass();
    k.cyl(pipe, 0.18, 0.22, 0.12, 0, 0.06, 0, { seg: 8 });
    k.cyl(pipe, 0.08, 0.08, 4.5, 0, 2.3, 0, { seg: 8 });
    k.box(pipe, 0.24, 0.2, 0.28, 0, 1.45, 0.05);
    k.cyl(MAT.dark(), 0.06, 0.06, 0.04, 0, 1.47, 0.2, { rx: Math.PI / 2, seg: 8 });
    for (const s of [-1, 1]) k.cyl(brass, 0.022, 0.022, 0.22, s * 0.22, 1.42, 0.08, { rz: Math.PI / 2, seg: 6 });
    for (let i = 0; i < 4; i++) k.cyl(brass, 0.095, 0.095, 0.03, 0, 0.6 + i * 1.0, 0, { seg: 8 });
    p.height = 4.5;
  },
  mailbox(k, p) {
    k.slab(W('drift'), 0.09, 1.0, 0.09, 0, 0, 0);
    const blue = MAT.metal('green');
    k.slab(plain('#2a5aa8', 0.45, 0.4), 0.34, 0.22, 0.5, 0, 1.0, 0);
    k.cyl(plain('#2a5aa8', 0.45, 0.4), 0.17, 0.17, 0.5, 0, 1.22, 0, { rx: Math.PI / 2, seg: 8 });
    k.box(plain('#e83a2a', 0.4), 0.02, 0.24, 0.06, 0.19, 1.3, -0.05);
    k.box(plain('#e83a2a', 0.4), 0.02, 0.08, 0.12, 0.19, 1.4, -0.02);
    k.box(plain('#e8e0d0', 0.6), 0.2, 0.06, 0.01, 0, 1.18, 0.255);
    void blue;
    p.height = 1.5;
  },
  dummy(k, p) {
    const sack = MAT.fabric('cream');
    k.cyl(W('drift'), 0.22, 0.26, 0.08, 0, 0.04, 0, { seg: 7 });
    k.cyl(W('drift'), 0.04, 0.04, 1.6, 0, 0.8, 0, { seg: 5 });
    k.cyl(sack, 0.22, 0.2, 0.6, 0, 1.0, 0, { seg: 8 });
    k.sphere(sack, 0.16, 0, 1.45, 0, { w: 7, h: 5 });
    k.box(W('drift'), 0.9, 0.06, 0.06, 0, 1.15, 0);
    k.cyl(plain('#e8c83a', 0.7), 0.24, 0.24, 0.03, 0, 1.56, 0, { seg: 9 }); // sou'wester brim
    k.cyl(plain('#e8c83a', 0.7), 0.13, 0.17, 0.14, 0, 1.63, 0, { seg: 8 });
    k.box(plain('#2a1a10', 0.8), 0.06, 0.012, 0.01, -0.05, 1.47, 0.155); k.box(plain('#2a1a10', 0.8), 0.06, 0.012, 0.01, 0.06, 1.47, 0.155);
    for (let i = 0; i < 4; i++) k.box(plain('#2a1a10', 0.9), 0.012, 0.012, 0.01, -0.05 + i * 0.035, 1.39, 0.158);
    p.height = 1.75;
  },
};

/** build the model for a blueprint id (an orange crate if unknown) */
export function buildProp(id: string): Prop {
  const k = new Kit();
  const p: Prop = { group: new THREE.Group(), lights: [], height: 1 };
  const b = BUILD[id];
  if (b) b(k, p);
  else { crate(k, 0.8, 0.6, 0.8); p.height = 0.6; }
  const built = k.build();
  p.group.add(built);
  p.group.userData.bp = id;
  return p;
}
export const HAS_MODEL = (id: string) => !!BUILD[id];
export { footprint };
