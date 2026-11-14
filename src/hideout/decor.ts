// Set dressing that makes the hideout lived-in. Wall pieces ride their wall segment (they sink with it when
// the camera looks through that wall); floor clutter sits on grid cells and tidies itself away when furniture
// is built over it; small things animate (vent glow + steam, bubble vents, drips, sconce flicker, hammock and
// drying kelp swaying).
//
//   new Decor(room)            builds everything (room.wallFor() picks the wall segment for a point)
//   decor.syncClutter(occ)     hide clutter on occupied cells (occ = Furniture.occupancy().obj)
//   decor.update(dt, t)
//   MOUNTS                     wall points the room carves flat behind wall-mounted pieces
import * as THREE from 'three';
import { Kit } from './kit';
import { MAT, TEX } from './tex';
import { GRID_W, GRID_D } from './blueprints';
import { Px, hex } from '../gfx/px';
import { retro } from '../gfx/retro';
import { hash2 } from '../core/math';
import type { Motes } from './ocean';
import { nookPush } from './room';

const HW = GRID_W / 2, HD = GRID_D / 2;
type Side = 'n' | 'w' | 's' | 'e';
const tau = Math.PI * 2;

/** world point + facing for a wall position (u along the wall, y height, off out from the face) */
function wallAt(side: Side, u: number, y: number, off = 0.06): { p: THREE.Vector3; ry: number } {
  switch (side) {
    case 'n': return { p: new THREE.Vector3(u, y, -HD + off), ry: 0 };
    case 's': return { p: new THREE.Vector3(u, y, HD - off), ry: Math.PI };
    case 'w': return { p: new THREE.Vector3(-HW + off, y, u), ry: Math.PI / 2 };
    default: return { p: new THREE.Vector3(HW - off, y, u), ry: -Math.PI / 2 };
  }
}

interface Mount { side: Side; u: number; y: number; r: number; kind: string }
const M: Mount[] = [
  { side: 'n', u: -1.35, y: 2.3, r: 0.35, kind: 'sconce' },
  { side: 'n', u: 1.32, y: 2.3, r: 0.35, kind: 'sconce' },
  { side: 'n', u: -2.9, y: 3.75, r: 0.8, kind: 'net' },
  { side: 'n', u: 4.6, y: 1.5, r: 0.35, kind: 'crack' },
  { side: 'n', u: -1.2, y: 0.32, r: 0.25, kind: 'socket' },
  { side: 'n', u: 2.8, y: 3.6, r: 0.6, kind: 'kelpRack' },
  { side: 'w', u: 0.35, y: 2.25, r: 0.3, kind: 'sconce' },
  { side: 'w', u: 3.45, y: 1.75, r: 0.5, kind: 'photo' },
  { side: 'w', u: 3.4, y: 3.2, r: 0.35, kind: 'crack' },
  { side: 's', u: 0.4, y: 2.0, r: 0.95, kind: 'jars' },
  { side: 's', u: 2.6, y: 3.3, r: 0.8, kind: 'net' },
  { side: 's', u: -2.2, y: 2.4, r: 0.5, kind: 'rope' },
  { side: 'e', u: 0.2, y: 2.4, r: 0.6, kind: 'rope' },
  { side: 'e', u: -0.9, y: 2.25, r: 0.35, kind: 'sconce' },
];
/** points the room flattens the rock behind (so mounted pieces sit flush) */
export const MOUNTS = M.map((m) => ({ p: wallAt(m.side, m.u, m.y, 0).p, r: m.r }));

// ------------------------------------------------------------------ painted bits
function wantedTex(seed: number): THREE.Texture {
  const p = new Px(24, 32);
  p.fill(() => hex('#e2cfa0'));
  for (let x = 2; x < 22; x++) { p.set(x, 2, '#3a1a0a'); p.set(x, 6, '#3a1a0a'); }
  for (let x = 4; x < 20; x += 2) { p.set(x, 4, '#7a1a0a'); p.set(x + 1, 4, '#7a1a0a'); }
  const skin = ['#e8b48a', '#c88a5a', '#8a5a3a', '#f0c8a0'][seed % 4];
  p.ellipse(12, 16, 5, 6, skin);
  if (seed % 3 === 0) p.rect(6, 10, 12, 3, '#3a3a4a'); else if (seed % 3 === 1) p.rect(7, 10, 10, 2, '#a83a2a'); else p.rect(8, 9, 8, 2, '#5a3a1a');
  p.set(10, 15, '#1a1010'); p.set(14, 15, '#1a1010');
  if (seed % 5 === 0) { p.rect(13, 14, 3, 2, '#101010'); p.line(9, 13, 17, 14, '#101010'); }
  if (seed % 2 === 0) p.ellipse(12, 20, 4, 2.5, '#5a3a2a');
  p.rect(10, 21, 4, 1, '#6a2a2a');
  p.rect(5, 25, 14, 1, '#3a1a0a'); p.rect(7, 27, 10, 1, '#3a1a0a');
  p.rect(0, 0, 24, 1, '#b89a68'); p.rect(0, 31, 24, 1, '#9a7a48');
  return p.texture({ mip: false });
}
function parentsTex(): THREE.Texture {
  const p = new Px(32, 24);
  p.fill((_x, y) => (y < 14 ? hex('#5a8aa8') : hex('#3a5a6a')));
  for (let x = 0; x < 32; x++) p.set(x, 14, '#7aa8c0');
  const blob = (cx: number, cy: number, r: number, c: string, hat?: string) => {
    p.ellipse(cx, cy, r, r * 0.8, c);
    p.ellipse(cx + r * 0.5, cy + 2, r * 0.45, r * 0.35, '#e090a8');
    p.set(cx - 2, cy - 1, '#1a0a10'); p.set(cx + 2, cy - 1, '#1a0a10');
    if (hat) p.rect(cx - r + 1, cy - r * 0.8 - 1, r * 2 - 2, 2, hat);
  };
  blob(10, 15, 6, '#f0a8b8', '#3a3a5a');
  blob(22, 15, 5.5, '#f8b8c8');
  blob(16, 19, 3, '#ffc8d4');
  p.rect(0, 0, 32, 1, '#ffffff');
  return p.texture({ mip: false });
}
function crackTex(): THREE.Texture {
  const p = new Px(8, 32);
  let x = 4;
  for (let y = 0; y < 32; y++) {
    x += y % 5 === 0 ? (hash2(y, 1, 3) > 0.5 ? 1 : -1) : 0;
    x = Math.max(2, Math.min(5, x));
    p.set(x, y, '#e8ffff'); p.set(x - 1, y, '#6ad8ff'); if (y % 3 === 0) p.set(x + 1, y, '#6ad8ff');
  }
  return p.texture({ mip: false });
}

const glowMat = (c: string, k = 2.2) => retro(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }));

interface Clutter { cell: [number, number]; obj: THREE.Object3D }

export class Decor {
  group = new THREE.Group();
  private clutter: Clutter[] = [];
  private sway: { o: THREE.Object3D; amp: number; f: number; ph: number; axis: 'x' | 'z' }[] = [];
  private flick: { l: THREE.PointLight; base: number; ph: number; wall?: { up: number } }[] = [];
  private vent: { light: THREE.PointLight; glow: THREE.MeshBasicMaterial; pos: THREE.Vector3 } | null = null;
  private bubbleVents: THREE.Vector3[] = [];
  private drips: { p: THREE.Vector3; t: number; drop: THREE.Mesh; ring: THREE.Mesh; rt: number }[] = [];
  private cable: THREE.Mesh | null = null;

  constructor(private wallFor: (p: THREE.Vector3) => { group: THREE.Group; up: number }, private bubbles: Motes, private steam: Motes) {
    for (const m of M) this.mounted(m);
    this.floorClutter();
    this.barnacles();
    this.dripping();
  }

  /** a hammock slung across the back corner between two ring bolts, with a pillow; it sways */
  private hammock() {
    const A = wallAt('n', -4.1, 2.8, 0.1).p, B = wallAt('w', -3.3, 2.8, 0.1).p;
    const g = new THREE.Group();
    const mid = A.clone().lerp(B, 0.5);
    g.position.copy(mid);
    const dir = B.clone().sub(A); const L = dir.length(); dir.normalize();
    g.rotation.y = Math.atan2(-dir.z, dir.x);
    const k = new Kit();
    // the cloth: a sagging, gently cupped sheet in hammock-local space (x along the span)
    const cols = 8, rows = 3, W = 0.7, sag = 0.75;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const u = i / cols, v = j / rows;
      const x = (u - 0.5) * (L - 0.5), z = (v - 0.5) * W * Math.sin(u * Math.PI) ;
      const y = -Math.sin(u * Math.PI) * sag - Math.sin(v * Math.PI) * 0.12 * Math.sin(u * Math.PI);
      pos.push(x, y, z); uv.push(u * 4, v);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 2, d = a + cols + 1; idx.push(a, b, c, a, c, d); }
    const sheet = new THREE.BufferGeometry();
    sheet.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sheet.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sheet.setIndex(idx); sheet.computeVertexNormals();
    const cloth = retro(new THREE.MeshStandardMaterial({ map: TEX.knit('#c8463a/#e8d8b0'), side: THREE.DoubleSide, roughness: 1, flatShading: true }));
    const swing = new THREE.Group();
    const m = new THREE.Mesh(sheet, cloth); m.castShadow = true; swing.add(m);
    // ropes to the rings
    for (const s of [-1, 1]) k.box(MAT.plain('#c8a868/0.95'), 0.3, 0.02, 0.02, s * (L / 2 - 0.12), -0.04, 0, { rz: s * -0.25, chamfer: 0 });
    k.cushion(MAT.fabric('cream'), 0.32, 0.08, 0.26, -(L - 0.5) * 0.3, -0.5, 0, { puff: 0.5 });
    swing.add(k.build());
    g.add(swing);
    this.sway.push({ o: swing, amp: 0.06, f: 0.9, ph: 1, axis: 'x' });
    this.wallFor(A).group.add(g);
  }

  // ---------------------------------------------------------------- wall pieces
  private mounted(m: Mount) {
    const { p, ry } = wallAt(m.side, m.u, m.y);
    const g = new THREE.Group();
    g.position.copy(p); g.rotation.y = ry;
    const k = new Kit();
    switch (m.kind) {
      case 'wanted': case 'wanted2': {
        // a cork board of WANTED posters, red string, pins
        const w = m.kind === 'wanted' ? 1.5 : 1.1;
        k.box(MAT.plain('#9a7448/0.95'), w, 0.95, 0.05, 0, 0, 0);
        k.box(MAT.wood('walnut'), w + 0.08, 0.06, 0.08, 0, 0.5, 0.01); k.box(MAT.wood('walnut'), w + 0.08, 0.06, 0.08, 0, -0.5, 0.01);
        const n = m.kind === 'wanted' ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const q = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.45), retro(new THREE.MeshStandardMaterial({ map: wantedTex(i * 5 + (m.kind === 'wanted' ? 1 : 7)), roughness: 0.9, flatShading: true })));
          q.position.set(-w / 2 + 0.3 + i * ((w - 0.6) / Math.max(1, n - 1)), (i % 2 ? -0.08 : 0.06), 0.035); q.rotation.z = (hash2(i, 3, 9) - 0.5) * 0.18;
          g.add(q);
          k.sphere(MAT.plain('#d82020/0.3'), 0.022, q.position.x, q.position.y + 0.2, 0.05, { w: 5, h: 4 });
        }
        for (let i = 0; i + 1 < n; i++) {
          const a = new THREE.Vector3(-w / 2 + 0.3 + i * ((w - 0.6) / (n - 1)), (i % 2 ? -0.08 : 0.06) + 0.2, 0.05);
          const b = new THREE.Vector3(-w / 2 + 0.3 + (i + 1) * ((w - 0.6) / (n - 1)), ((i + 1) % 2 ? -0.08 : 0.06) + 0.2, 0.05);
          const d = b.clone().sub(a);
          k.box(MAT.plain('#c81818/0.8'), d.length(), 0.008, 0.008, (a.x + b.x) / 2, (a.y + b.y) / 2, 0.05, { rz: Math.atan2(d.y, d.x), chamfer: 0 });
        }
        break;
      }
      case 'trophies': {
        // a plank with a giant rusty hook, a snapped rod and a human boot
        k.box(MAT.wood('oak'), 2.1, 0.32, 0.06, 0, -0.35, 0);
        for (const sx of [-0.95, 0.95]) k.cyl(MAT.plain('#2a2420/0.5/0.6'), 0.025, 0.025, 0.04, sx, -0.35, 0.04, { rx: Math.PI / 2, seg: 6 });
        // hook
        const hook = new THREE.TorusGeometry(0.16, 0.03, 5, 10, Math.PI * 1.25);
        k.add(MAT.metal('red'), hook, -0.7, -0.05, 0.08, { rz: Math.PI * 0.95 });
        k.cyl(MAT.metal('red'), 0.03, 0.03, 0.45, -0.54, 0.22, 0.08, { seg: 6 });
        k.add(MAT.metal('red'), new THREE.ConeGeometry(0.05, 0.1, 4), -0.86, 0.02, 0.08, { rz: 0.4 });
        // snapped rod (two pieces, splintered)
        k.cyl(MAT.plain('#2a3a4a/0.4/0.2'), 0.018, 0.026, 0.8, 0.15, 0.08, 0.08, { rz: Math.PI / 2 - 0.12, seg: 6 });
        k.cyl(MAT.plain('#2a3a4a/0.4/0.2'), 0.012, 0.018, 0.45, 0.62, 0.2, 0.08, { rz: Math.PI / 2 + 0.35, seg: 6 });
        k.cyl(MAT.plain('#b8b8c0/0.3/0.8'), 0.05, 0.05, 0.06, -0.15, 0.04, 0.12, { rx: Math.PI / 2, seg: 8 }); // reel
        // boot
        k.box(MAT.leather('black'), 0.2, 0.36, 0.14, 0.92, 0.0, 0.1);
        k.box(MAT.leather('black'), 0.34, 0.12, 0.16, 0.99, -0.14, 0.1);
        k.box(MAT.plain('#3a2a1a/0.8'), 0.36, 0.03, 0.17, 0.99, -0.215, 0.1);
        break;
      }
      case 'sconce': {
        // a mussel-shell wall lamp
        k.box(MAT.brass(), 0.08, 0.2, 0.04, 0, 0, 0);
        k.cyl(MAT.brass(), 0.012, 0.012, 0.16, 0, 0.0, 0.08, { rx: Math.PI / 2, seg: 5 });
        const shell = new THREE.SphereGeometry(0.16, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.45);
        shell.scale(1.4, 1, 0.7);
        k.add(MAT.plain('#2a2a3a/0.25/0.2'), shell, 0, 0.06, 0.16, { rx: Math.PI });
        k.sphere(glowMat('#ffd8a0'), 0.05, 0, 0.02, 0.16, { w: 6, h: 4 });
        this.light(g, '#ffb870', 3.2, 4.5, new THREE.Vector3(0, -0.05, 0.4), hash2(m.u * 10, m.y * 10, 3) * 10, p);
        break;
      }
      case 'net': {
        // a fishing net draped from pegs with glass floats and a cork line
        const W = 2.2, Hn = 0.9, cols = 11, rows = 5;
        const strand = MAT.plain('#c8b890/0.9');
        for (let i = 0; i <= cols; i++) { const x = -W / 2 + (i / cols) * W; const sag = Math.sin((i / cols) * Math.PI) * 0.2; k.box(strand, 0.012, Hn - sag, 0.012, x, -(Hn - sag) / 2 + 0.02 - sag * 0.5, 0.03, { chamfer: 0 }); }
        for (let j = 0; j <= rows; j++) {
          const y = -(j / rows) * Hn;
          for (let i = 0; i < cols; i++) { const x0 = -W / 2 + (i / cols) * W, x1 = x0 + W / cols; const s0 = Math.sin((i / cols) * Math.PI) * 0.2 * (j / rows), s1 = Math.sin(((i + 1) / cols) * Math.PI) * 0.2 * (j / rows); const a = new THREE.Vector2(x0, y - s0), b = new THREE.Vector2(x1, y - s1); const d = b.clone().sub(a); k.box(strand, d.length(), 0.012, 0.012, (a.x + b.x) / 2, (a.y + b.y) / 2, 0.03, { rz: Math.atan2(d.y, d.x), chamfer: 0 }); }
        }
        for (let i = 0; i < 6; i++) k.cyl(MAT.plain('#c8a060/0.8'), 0.04, 0.04, 0.07, -W / 2 + 0.2 + i * 0.36, 0.02, 0.04, { rz: Math.PI / 2, seg: 6 });
        for (const [fx, fy, c] of [[-0.5, -0.55, '#3a9a8a'], [0.4, -0.7, '#4a7ac8'], [0.85, -0.4, '#3a9a8a']] as const) { k.sphere(MAT.plain(`${c}/0.1/0.2`), 0.1, fx, fy, 0.1, { w: 7, h: 5 }); k.sphere(glowMat('#c8fff4', 1.2), 0.025, fx - 0.04, fy + 0.04, 0.18, { w: 4, h: 3 }); }
        for (const sx of [-W / 2, W / 2, 0]) k.cyl(MAT.wood('drift'), 0.025, 0.025, 0.12, sx, 0.04, 0.04, { rx: Math.PI / 2, seg: 5 });
        break;
      }
      case 'crack': {
        // a fracture with cold light leaking through
        const q = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.9), retro(new THREE.MeshBasicMaterial({ map: crackTex(), transparent: true, alphaTest: 0.5, color: new THREE.Color('#ffffff').multiplyScalar(2.4) })));
        q.position.z = 0.02;
        g.add(q);
        this.light(g, '#6ad0ff', 1.6, 3, new THREE.Vector3(0, 0, 0.4), hash2(m.u, m.y, 7) * 5, p);
        break;
      }
      case 'socket': {
        k.box(MAT.plain('#d8d0b8/0.5'), 0.16, 0.1, 0.03, 0, 0, 0);
        k.box(MAT.dark(), 0.02, 0.04, 0.01, -0.03, 0, 0.016); k.box(MAT.dark(), 0.02, 0.04, 0.01, 0.03, 0, 0.016);
        break;
      }
      case 'ring': {
        k.box(MAT.plain('#3a3632/0.6/0.6'), 0.1, 0.1, 0.04, 0, 0, 0);
        k.add(MAT.plain('#5a5652/0.4/0.8'), new THREE.TorusGeometry(0.05, 0.012, 4, 8), 0, -0.05, 0.05, { rx: Math.PI / 2 });
        break;
      }
      case 'jars': {
        // two shelves of jars of pickled things
        for (const sy of [-0.35, 0.35]) {
          k.box(MAT.wood('drift'), 1.4, 0.05, 0.28, 0, sy, 0.1);
          for (const sx of [-0.55, 0.55]) k.box(MAT.metal('grey'), 0.04, 0.18, 0.22, sx, sy - 0.11, 0.06);
        }
        const fills = ['#c8d048', '#e86a8a', '#7ac85a', '#e8a03a', '#8a6ac8', '#c8a07a'];
        const things = ['#f8f0e0', '#ff8a6a', '#5a3a2a', '#ffe0a0', '#2a1a2a', '#e86a4a'];
        for (let i = 0; i < 10; i++) {
          const row = i < 5 ? -0.35 : 0.35, j = i % 5;
          const x = -0.52 + j * 0.26, h = 0.18 + hash2(i, 1, 5) * 0.12, r = 0.06 + hash2(i, 2, 5) * 0.03;
          const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 7), retro(new THREE.MeshStandardMaterial({ color: fills[i % 6], transparent: true, opacity: 0.55, roughness: 0.15, flatShading: true, emissive: fills[i % 6], emissiveIntensity: 0.15 })));
          glass.position.set(x, row + 0.025 + h / 2, 0.1);
          g.add(glass);
          k.cyl(MAT.plain('#6a5a4a/0.5/0.5'), r * 1.05, r * 1.05, 0.03, x, row + 0.025 + h + 0.015, 0.1, { seg: 7 });
          // the pickled thing inside: an eyeball, a worm curl, a shrimp...
          const c = things[i % 6];
          if (i % 3 === 0) { k.sphere(MAT.plain(`${c}/0.3`), r * 0.55, x, row + 0.025 + h * 0.45, 0.1, { w: 6, h: 4 }); k.sphere(MAT.plain('#1a3a6a/0.2'), r * 0.22, x, row + 0.025 + h * 0.45, 0.1 + r * 0.45, { w: 4, h: 3 }); }
          else if (i % 3 === 1) k.add(MAT.plain(`${c}/0.6`), new THREE.TorusGeometry(r * 0.45, r * 0.18, 4, 7), x, row + 0.025 + h * 0.4, 0.1, { rx: 1.2 });
          else k.box(MAT.plain(`${c}/0.6`), r * 1.2, r * 0.5, r * 0.5, x, row + 0.025 + h * 0.35, 0.1, { rz: 0.4 });
          k.box(MAT.plain('#efe0b8/0.9'), r * 1.2, h * 0.3, 0.005, x, row + 0.025 + h * 0.6, 0.1 + r + 0.003, { chamfer: 0 });
        }
        break;
      }
      case 'kelpRack': {
        // a drying rack: a pole on two brackets with kelp strips hanging off it
        k.cyl(MAT.wood('drift'), 0.03, 0.03, 1.5, 0, 0.1, 0.22, { rz: Math.PI / 2, seg: 6 });
        for (const sx of [-0.65, 0.65]) k.box(MAT.wood('oak'), 0.05, 0.26, 0.26, sx, 0.0, 0.1);
        const leaf = retro(new THREE.MeshStandardMaterial({ map: TEX.kelp(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, flatShading: true }));
        for (let i = 0; i < 7; i++) {
          const L = 0.6 + hash2(i, 4, 2) * 0.4;
          const gq = new THREE.PlaneGeometry(0.16, L); gq.translate(0, -L / 2, 0);
          const strip = new THREE.Mesh(gq, leaf);
          strip.position.set(-0.6 + i * 0.2, 0.1, 0.22);
          g.add(strip);
          this.sway.push({ o: strip, amp: 0.08, f: 0.7 + i * 0.05, ph: i, axis: 'x' });
        }
        break;
      }
      case 'photo': {
        k.box(MAT.brass(), 0.62, 0.5, 0.04, 0, 0, 0);
        k.box(MAT.wood('walnut'), 0.54, 0.42, 0.045, 0, 0, 0.002);
        const q = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.34), retro(new THREE.MeshStandardMaterial({ map: parentsTex(), roughness: 0.6, flatShading: true })));
        q.position.z = 0.03;
        g.add(q);
        k.box(MAT.plain('#c8b890/0.9'), 0.012, 0.3, 0.012, 0, 0.36, -0.01, { rz: 0.6, chamfer: 0 }); k.box(MAT.plain('#c8b890/0.9'), 0.012, 0.3, 0.012, 0, 0.36, -0.01, { rz: -0.6, chamfer: 0 });
        break;
      }
      case 'rope': {
        // a coiled rope on a peg and a life ring
        k.cyl(MAT.wood('drift'), 0.03, 0.03, 0.2, 0, 0.25, 0.08, { rx: Math.PI / 2, seg: 5 });
        for (let i = 0; i < 4; i++) k.add(MAT.plain('#c8a868/0.95'), new THREE.TorusGeometry(0.24 - i * 0.012, 0.025, 4, 10), 0, 0.02 - i * 0.02, 0.1 + i * 0.03);
        k.add(MAT.plain('#e8e0d0/0.6'), new THREE.TorusGeometry(0.28, 0.07, 5, 10), 0.75, -0.1, 0.08);
        for (let i = 0; i < 4; i++) { const a = i * tau / 4 + 0.4; k.box(MAT.plain('#d83a2a/0.6'), 0.1, 0.15, 0.15, 0.75 + Math.cos(a) * 0.28, -0.1 + Math.sin(a) * 0.28, 0.08, { rz: a }); }
        break;
      }
    }
    g.add(k.build());
    this.wallFor(p).group.add(g);
  }

  /** a flickering light for a wall piece: lives in world space (never inside a sinking wall group, so the light
   *  count stays constant and no shaders recompile) and fades with its wall */
  private light(g: THREE.Group, col: string, base: number, dist: number, local: THREE.Vector3, ph: number, at: THREE.Vector3) {
    g.updateMatrixWorld(true);
    const l = new THREE.PointLight(col, base, dist, 1.6);
    l.position.copy(local).applyMatrix4(g.matrixWorld);
    this.group.add(l);
    this.flick.push({ l, base, ph, wall: this.wallFor(at) });
  }

  // ---------------------------------------------------------------- floor clutter (per cell, hidden when built over)
  private cellPos(x: number, z: number) { return new THREE.Vector3(x - HW + 0.5, 0, z - HD + 0.5); }
  private put(cell: [number, number], o: THREE.Object3D, fixed = false) {
    o.position.add(this.cellPos(cell[0], cell[1]));
    this.group.add(o);
    if (!fixed) this.clutter.push({ cell, obj: o });
  }

  private floorClutter() {
    // the sea-vent stove in the back corner: a rock mound with a glowing fissure, a grate and a kettle
    {
      const k = new Kit();
      k.lathe(MAT.rock(), [[0.001, 0], [0.48, 0], [0.42, 0.2], [0.3, 0.38], [0.2, 0.46], [0.001, 0.48]], 0, 0, 0, { seg: 7 });
      const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a').multiplyScalar(2.4) });
      const fiss = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.06, 7), retro(glow));
      fiss.position.y = 0.47;
      for (let i = 0; i < 4; i++) k.box(MAT.plain('#1e1c1c/0.6/0.6'), 0.56, 0.025, 0.025, 0, 0.52, -0.21 + i * 0.14, { chamfer: 0 });
      for (const sx of [-0.25, 0.25]) k.box(MAT.plain('#1e1c1c/0.6/0.6'), 0.025, 0.025, 0.56, sx, 0.52, 0, { chamfer: 0 });
      k.lathe(MAT.metal('red'), [[0.001, 0], [0.13, 0.01], [0.15, 0.08], [0.12, 0.16], [0.05, 0.2], [0.001, 0.21]], 0.05, 0.54, 0.02, { seg: 7 });
      k.cyl(MAT.metal('red'), 0.02, 0.012, 0.14, 0.2, 0.62, 0.02, { rz: -0.9, seg: 5 });
      k.add(MAT.plain('#2a2420/0.6/0.5'), new THREE.TorusGeometry(0.08, 0.012, 4, 8, Math.PI), 0.05, 0.75, 0.02);
      for (let i = 0; i < 5; i++) { const a = i * 1.3; k.sphere(MAT.rock(), 0.07 + hash2(i, 1, 1) * 0.05, Math.cos(a) * 0.5, 0.03, Math.sin(a) * 0.5, { w: 5, h: 4 }); }
      const g = k.build(); g.add(fiss);
      const light = new THREE.PointLight('#ff8a3a', 4, 4, 1.6);
      light.position.set(0.1, 0.9, 0.35);
      g.add(light);
      this.put([0, 0], g, true);
      this.vent = { light, glow, pos: this.cellPos(0, 0).add(new THREE.Vector3(0.2, 0.7, 0.02)) };
    }
    // stacked crates
    {
      const k = new Kit();
      const crate = (x: number, y: number, z: number, s: number, ry: number) => {
        const w = 0.6 * s;
        k.box(MAT.wood('pine'), w, w * 0.8, w, x, y + w * 0.4, z, { ry });
        k.box(MAT.wood('oak'), w + 0.02, 0.05, w + 0.02, x, y + w * 0.78, z, { ry });
        k.box(MAT.wood('oak'), w + 0.02, 0.05, w + 0.02, x, y + 0.03, z, { ry });
      };
      crate(0, 0, 0, 1, 0.1); crate(0.05, 0.48, -0.02, 0.85, -0.25); crate(0.12, 0.89, 0.05, 0.6, 0.4);
      k.box(MAT.plain('#e8e0c8/0.9'), 0.2, 0.002, 0.14, 0.02, 0.485, 0.31, { chamfer: 0 });
      this.put([1, 7], k.build());
    }
    // a pile of coins, a pearl and a gem
    {
      const k = new Kit();
      const gold = MAT.plain('#e8b030/0.3/0.9');
      k.lathe(gold, [[0.001, 0], [0.28, 0], [0.2, 0.08], [0.08, 0.16], [0.001, 0.18]], 0, 0, 0, { seg: 8 });
      for (let i = 0; i < 12; i++) { const a = hash2(i, 1, 4) * tau, r = 0.18 + hash2(i, 2, 4) * 0.25; k.cyl(gold, 0.045, 0.045, 0.012, Math.cos(a) * r, 0.008 + (r < 0.25 ? 0.05 : 0), Math.sin(a) * r, { rx: hash2(i, 4, 4) * 0.5, seg: 7 }); }
      k.sphere(MAT.plain('#f8f0f8/0.15/0.3'), 0.05, 0.12, 0.17, 0.05, { w: 6, h: 4 });
      k.add(MAT.plain('#3ac86a/0.15/0.3'), new THREE.OctahedronGeometry(0.06, 0), -0.1, 0.17, 0.0);
      this.put([8, 5], k.build());
      const k2 = new Kit();
      for (let i = 0; i < 7; i++) { const a = hash2(i, 7, 4) * tau, r = hash2(i, 8, 4) * 0.35; k2.cyl(gold, 0.045, 0.045, 0.012, Math.cos(a) * r, 0.008, Math.sin(a) * r, { seg: 7 }); }
      // a human boot lying on its side
      k2.box(MAT.leather('black'), 0.36, 0.13, 0.15, 0.1, 0.075, 0.2, { ry: 0.6 });
      k2.box(MAT.leather('black'), 0.15, 0.3, 0.15, -0.05, 0.075, 0.08, { ry: 0.6, rz: Math.PI / 2 });
      this.put([8, 6], k2.build());
    }
    // coral pot plants
    for (const [cell, col] of [[[1, 4], '#e8603a'], [[0, 7], '#c84a9a']] as const) {
      const k = new Kit();
      k.lathe(MAT.plain('#a8542e/0.85'), [[0.001, 0], [0.16, 0], [0.2, 0.28], [0.23, 0.3], [0.23, 0.35], [0.001, 0.33]], 0, 0, 0, { seg: 7 });
      const cm = MAT.plain(`${col}/0.7`);
      const branch = (x: number, z: number, h: number, a: number, d: number) => {
        k.cyl(cm, 0.025, 0.035, h, x + Math.sin(a) * h * 0.25, 0.33 + d * 0.25 + h / 2, z, { rz: -a, seg: 5 });
        k.sphere(cm, 0.04, x + Math.sin(a) * h * 0.5, 0.33 + d * 0.25 + h, z, { w: 5, h: 4 });
      };
      for (let i = 0; i < 6; i++) branch((hash2(i, 1, 2) - 0.5) * 0.2, (hash2(i, 2, 2) - 0.5) * 0.2, 0.25 + hash2(i, 3, 2) * 0.3, (hash2(i, 4, 2) - 0.5) * 1.2, i % 2);
      this.put([cell[0], cell[1]], k.build());
    }
    // a barrel with fishing rods leaning in it
    {
      const k = new Kit();
      k.lathe(MAT.wood('oak'), [[0.001, 0], [0.24, 0], [0.28, 0.3], [0.24, 0.6], [0.001, 0.6]], 0, 0, 0, { seg: 8 });
      for (const y of [0.08, 0.3, 0.52]) k.add(MAT.plain('#3a3632/0.5/0.6'), new THREE.TorusGeometry(y === 0.3 ? 0.28 : 0.255, 0.012, 3, 8), 0, y, 0, { rx: Math.PI / 2 });
      for (let i = 0; i < 3; i++) { k.cyl(MAT.plain(['#2a3a4a', '#4a2a2a', '#2a4a2a'][i] + '/0.4/0.2'), 0.012, 0.02, 1.7, (i - 1) * 0.08, 1.2, -0.05 + i * 0.04, { rz: 0.12 * (i - 1), rx: -0.15, seg: 5 }); }
      k.cyl(MAT.plain('#b8b8c0/0.3/0.8'), 0.05, 0.05, 0.05, 0.1, 0.75, 0.12, { rx: Math.PI / 2, seg: 7 });
      this.put([3, 4], k.build());
    }
    // a bucket of mussels and a green tackle box
    {
      const k = new Kit();
      k.lathe(MAT.metal('grey'), [[0.001, 0], [0.16, 0], [0.2, 0.32], [0.001, 0.32]], -0.15, 0, -0.1, { seg: 8 });
      for (let i = 0; i < 6; i++) k.sphere(MAT.plain('#1a1a2a/0.25'), 0.05, -0.15 + (hash2(i, 1, 3) - 0.5) * 0.2, 0.32, -0.1 + (hash2(i, 2, 3) - 0.5) * 0.2, { w: 5, h: 3, sx: 1.5, sy: 0.6 });
      k.add(MAT.plain('#5a5652/0.4/0.8'), new THREE.TorusGeometry(0.18, 0.01, 3, 8, Math.PI), -0.15, 0.32, -0.1);
      k.box(MAT.metal('green'), 0.42, 0.2, 0.24, 0.18, 0.1, 0.18, { ry: 0.3 });
      k.box(MAT.plain('#c8c8d0/0.3/0.8'), 0.16, 0.03, 0.03, 0.18, 0.215, 0.18, { ry: 0.3 });
      this.put([4, 7], k.build());
    }
    // magazines, a mug and a dropped sock by the sofa
    {
      const k = new Kit();
      for (let i = 0; i < 4; i++) k.box(MAT.plain(['#c84a3a', '#3a8ac8', '#e8c040', '#5a3a8a'][i] + '/0.8'), 0.26, 0.012, 0.34, 0.05 * i, 0.006 + i * 0.012, -0.03 * i, { ry: i * 0.35, chamfer: 0 });
      k.cyl(MAT.plain('#e8e0d0/0.3'), 0.045, 0.04, 0.09, 0.3, 0.045, 0.2, { seg: 7 });
      k.box(MAT.knit('#3a8a5a/#e8d8b0'), 0.22, 0.03, 0.08, -0.25, 0.015, 0.25, { ry: 0.8 });
      this.put([3, 5], k.build());
    }
    // a bubble vent in the floor
    {
      const k = new Kit();
      for (let i = 0; i < 8; i++) { const a = i * tau / 8; k.sphere(MAT.rock(), 0.1 + hash2(i, 1, 6) * 0.05, Math.cos(a) * 0.22, 0.04, Math.sin(a) * 0.22, { w: 5, h: 4 }); }
      k.cyl(MAT.dark(), 0.14, 0.14, 0.02, 0, 0.012, 0, { seg: 7 });
      const g = k.build();
      this.put([9, 7], g);
      this.bubbleVents.push(this.cellPos(9, 7).add(new THREE.Vector3(0, 0.05, 0)));
    }
  }

  // ---------------------------------------------------------------- barnacles + sponges on the rims
  private barnacles() {
    const k = new Kit();
    const shell = MAT.plain('#d8d0c0/0.85'), hole = MAT.dark();
    const sponge = ['#e8a03a', '#d8c040', '#c86a3a'];
    for (let i = 0; i < 70; i++) {
      const side = i % 4;
      const u = (hash2(i, 1, 8) * 2 - 1) * (side % 2 ? HD : HW) * 0.95;
      const inset = 0.05 + hash2(i, 2, 8) * 0.2;
      const x = side === 0 || side === 2 ? u : side === 1 ? -HW - inset : HW + inset;
      const z = side === 1 || side === 3 ? u : side === 0 ? -HD - inset : HD + inset;
      const y = 0.36 + hash2(i, 3, 8) * 0.15;
      if ((side === 0 && nookPush('n', x, 1) > 0) || (side === 1 && nookPush('w', z, 1) > 0)) continue;
      if (i % 5 === 0) {
        // a little sponge cluster
        const c = MAT.plain(`${sponge[i % 3]}/0.95`);
        for (let j = 0; j < 3; j++) k.cyl(c, 0.035, 0.045, 0.12 + j * 0.05, x + (j - 1) * 0.07, y + 0.05 + j * 0.02, z, { seg: 6 });
      } else {
        const s = 0.04 + hash2(i, 4, 8) * 0.04;
        k.cyl(shell, s * 0.5, s, s * 1.1, x, y, z, { seg: 6 });
        k.cyl(hole, s * 0.3, s * 0.3, 0.01, x, y + s * 0.56, z, { seg: 5 });
      }
    }
    this.group.add(k.build());
  }

  // ---------------------------------------------------------------- drips from the overhang
  private dripping() {
    const dropG = new THREE.SphereGeometry(0.025, 5, 4); dropG.scale(1, 1.6, 1);
    const dm = retro(new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfeaff').multiplyScalar(1.4) }));
    const rm = new THREE.MeshBasicMaterial({ color: '#9ad8ff', transparent: true, opacity: 0.6, depthWrite: false });
    const puddle = retro(new THREE.MeshStandardMaterial({ color: '#1a2a34', roughness: 0.05, metalness: 0.3, flatShading: true }));
    for (const [x, z] of [[-3.6, -3.4], [2.2, -3.35], [-4.4, 1.0]] as const) {
      const p = new THREE.Vector3(x, 0, z);
      const pm = new THREE.Mesh(new THREE.CircleGeometry(0.28, 7), puddle);
      pm.rotation.x = -Math.PI / 2; pm.position.set(x, 0.006, z);
      pm.receiveShadow = true;
      this.group.add(pm);
      const drop = new THREE.Mesh(dropG, dm); drop.visible = false;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.07, 8), rm); ring.rotation.x = -Math.PI / 2; ring.visible = false;
      this.group.add(drop, ring);
      this.drips.push({ p, t: hash2(x * 10, z * 10, 1) * 3, drop, ring, rt: -1 });
    }
  }

  /** the TV power cable: from the wall socket, along the floor, to the back of the TV */
  setCable(tvBack: THREE.Vector3 | null) {
    if (this.cable) { this.cable.removeFromParent(); this.cable.geometry.dispose(); this.cable = null; }
    if (!tvBack) return;
    const s = wallAt('n', -1.65, 0.32, 0.05).p;
    const pts = [s, new THREE.Vector3(s.x, 0.03, s.z + 0.12), new THREE.Vector3((s.x + tvBack.x) / 2, 0.025, Math.max(s.z + 0.2, tvBack.z - 0.15)), new THREE.Vector3(tvBack.x, 0.05, tvBack.z), tvBack.clone()];
    const curve = new THREE.CatmullRomCurve3(pts);
    this.cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.018, 4), MAT.plain('#1a1a1e/0.5'));
    this.cable.castShadow = true;
    this.group.add(this.cable);
  }

  syncClutter(occ: Int32Array) {
    for (const c of this.clutter) c.obj.visible = !occ[c.cell[1] * GRID_W + c.cell[0]];
  }

  update(dt: number, t: number) {
    for (const s of this.sway) { const a = Math.sin(t * s.f + s.ph) * s.amp; if (s.axis === 'x') s.o.rotation.x = a; else s.o.rotation.z = a; }
    for (const f of this.flick) f.l.intensity = f.base * (f.wall ? f.wall.up : 1) * (0.88 + 0.08 * Math.sin(t * 9 + f.ph) * Math.sin(t * 3.1 + f.ph * 2) + (Math.random() < 0.01 ? -0.3 : 0));
    if (this.vent) {
      const k = 0.8 + 0.2 * Math.sin(t * 2.3) + 0.08 * Math.sin(t * 11);
      this.vent.light.intensity = 4 * k;
      this.vent.glow.color.setRGB(1.0 * 2.4 * k, 0.48 * 2.4 * k, 0.16 * 2.4 * k);
      if (Math.random() < dt * 4) this.steam.emit(this.vent.pos.x + 0.15, this.vent.pos.y + 0.15, this.vent.pos.z, { vy: 0.35, vx: 0.05, life: 1.6, size: 0.07 + Math.random() * 0.05 });
    }
    for (const v of this.bubbleVents) if (Math.random() < dt * 5) this.bubbles.emit(v.x, v.y, v.z, { spread: 0.18, vy: 0.2, life: 3, size: 0.04 + Math.random() * 0.05 });
    for (const d of this.drips) {
      d.t -= dt;
      if (d.t < 0 && !d.drop.visible) { d.drop.visible = true; d.drop.position.set(d.p.x, 4.2, d.p.z); d.drop.userData.v = 0; }
      if (d.drop.visible) {
        d.drop.userData.v = (d.drop.userData.v as number) + dt * 9.8;
        d.drop.position.y -= (d.drop.userData.v as number) * dt;
        if (d.drop.position.y < 0.02) { d.drop.visible = false; d.t = 1.5 + Math.random() * 3; d.rt = 0; d.ring.visible = true; d.ring.position.set(d.p.x, 0.012, d.p.z); }
      }
      if (d.rt >= 0) { d.rt += dt; const s = 1 + d.rt * 5; d.ring.scale.set(s, s, s); (d.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 - d.rt * 1.2); if (d.rt > 0.5) { d.rt = -1; d.ring.visible = false; } }
    }
  }
}
