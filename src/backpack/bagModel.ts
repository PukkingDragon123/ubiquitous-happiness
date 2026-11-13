// The backpack itself, built in its own local frame: the open compartment faces +z, its quilted 5x5 floor
// lies in the z = 0 plane, +y is the top (where the flap hinges). Worn lofted leather shell, rolled rim,
// teal lining, canvas side pockets with snap flaps, brass D-rings, buckles and rivets, a grab handle, the
// flap (leather outside, lining inside, two buckle straps) and a pocket-highlight overlay per cell.
import * as THREE from 'three';
import { Loft, ring, usFor, FULL, type V3 } from '../gfx/loft';
import { smooth } from '../core/math';
import { Px, ramp, pxNoise } from '../gfx/px';
import { textCanvas, type TextStyle } from '../ui/text';
import { leatherShell, leatherSheet, strapTex, canvasTex, liningPlain, liningGrid, cellGlowTex, brassMat, nameTagTex, type LiningInfo } from './bagTex';
import { Ic, bez, curve } from './iconPaint';
import { P } from './icons';
import { voxelMesh } from './voxel';
import type { ItemDef } from '../game/items';

export const CELL = 0.3;
const CY = 0.0;                    // vertical centre of the body
const OX = 1.08, OY = 1.14;        // outer half extents
const IX = 0.94, IY = 1.0;         // inner opening half extents
const Z0 = -0.58, ZR = 0.2;        // back of the shell, rim
export const GRID_CX = 0, GRID_CY = -0.05;

export interface BagModel {
  root: THREE.Group;
  body: THREE.Group;
  flapPivot: THREE.Group;
  flapParts: THREE.Object3D[];
  cellGlows: THREE.Mesh[];
  keyAnchor: THREE.Object3D;
  tagAnchor: THREE.Object3D;
  lining: LiningInfo;
  floorW: number; floorH: number;
  /** puffy quilt offset (metres) at a bag-local point on the floor */
  floorZ(lx: number, ly: number): number;
  keychain: { links: THREE.Mesh[]; lure: THREE.Object3D };
  tag: { obj: THREE.Group; string: THREE.Mesh };
}

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
const shadowy = <T extends THREE.Object3D>(o: T): T => { o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; };

export function buildBag(): BagModel {
  const root = new THREE.Group(); root.name = 'bag';
  const body = new THREE.Group(); root.add(body);

  // ---------------------------------------------------------------- outer leather shell
  const shell = leatherShell();
  shell.map.repeat.set(1, 1);
  const leather = std({ map: shell.map, normalMap: shell.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.72, metalness: 0 });
  {
    const L = new Loft(), N = 80, S = 16;
    const rings = [];
    for (let i = 0; i <= S; i++) {
      const s = i / S, z = Z0 + (ZR - Z0) * s;
      const back = Math.sin(Math.min(1, s / 0.32) * Math.PI / 2);
      const k = (0.74 + 0.26 * Math.sqrt(back)) * (1 + 0.04 * Math.sin(Math.PI * s)) * (1 - 0.03 * smooth(0.82, 1, s));
      const pts = ring([0, CY, z], [1, 0, 0], [0, 1, 0], OX * k, OY * k, OY * k * 0.985, N, 3.3, (th) => 0.012 * Math.sin(th * 3 + s * 4) + 0.008 * Math.sin(th * 7 + 1));
      rings.push({ pts, v: s });
    }
    L.loft(rings, usFor(N), FULL, 0, { start: [0, CY, Z0 - 0.05] });
    body.add(shadowy(new THREE.Mesh(L.build(), leather)));
  }
  // ---------------------------------------------------------------- inner walls (lining) + floor
  const linTex = liningPlain(); linTex.repeat.set(4, 1);
  const liningMat = std({ map: linTex, roughness: 0.95 });
  {
    const L = new Loft(), N = 80;
    const rings = [0, 0.5, 1].map((s) => ({ pts: ring([0, CY, ZR - (ZR + 0.02) * s], [1, 0, 0], [0, 1, 0], IX * (1 - 0.02 * s), IY * (1 - 0.02 * s), IY * (1 - 0.02 * s), N, 4.2), v: s }));
    L.loft(rings, usFor(N), FULL, 1, { flip: true });
    const m = new THREE.Mesh(L.build(), liningMat); m.receiveShadow = true; body.add(m);
  }
  const floorW = IX * 2 - 0.02, floorH = IY * 2 - 0.02;
  const lining = liningGrid(floorW, floorH, CELL, GRID_CX, GRID_CY - CY);
  const floorZ = (lx: number, ly: number) => {
    const u = (lx + floorW / 2) / floorW, v = (ly - CY + floorH / 2) / floorH;
    return lining.height(u, v) * 0.018;
  };
  {
    const g = new THREE.PlaneGeometry(floorW, floorH, 110, 116);
    const pa = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) pa.setZ(i, floorZ(pa.getX(i), pa.getY(i) + CY));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, std({ map: lining.map, normalMap: lining.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.92 }));
    m.position.y = CY; m.receiveShadow = true;
    body.add(m);
  }
  // pocket highlight overlays
  const glowTex = cellGlowTex();
  const cellGlows: THREE.Mesh[] = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, color: '#9ff0d0' }));
    const lx = GRID_CX + (x - 2) * CELL, ly = GRID_CY - (y - 2) * CELL;
    m.position.set(lx, ly, floorZ(lx, ly) + 0.004);
    m.renderOrder = 5;
    body.add(m); cellGlows.push(m);
  }
  // ---------------------------------------------------------------- rolled rim (leather piping)
  const strap = strapTex(true);
  {
    const st = strap.map.clone(); st.needsUpdate = true; st.repeat.set(1, 26); st.wrapS = st.wrapT = THREE.RepeatWrapping;
    const nm = strap.normal.clone(); nm.needsUpdate = true; nm.repeat.set(1, 26); nm.wrapS = nm.wrapT = THREE.RepeatWrapping;
    const rx = (OX * 0.97 + IX) / 2, ry = (OY * 0.97 + IY) / 2;
    const path = ring([0, CY, ZR + 0.01], [1, 0, 0], [0, 1, 0], rx, ry, ry, 96, 3.8).map((p) => p as V3);
    const L = new Loft();
    L.tube(path, () => 0.075, 10, FULL, 2);
    body.add(shadowy(new THREE.Mesh(L.build(), std({ map: st, normalMap: nm, roughness: 0.6 }))));
  }
  const brass = brassMat();
  // ---------------------------------------------------------------- side pockets (canvas)
  const cv = canvasTex();
  const canvasMat = std({ map: cv.map, normalMap: cv.normal, roughness: 0.95 });
  const sheet = leatherSheet(48, 32, 7, { border: 3 });
  const tabMat = std({ map: sheet.map, normalMap: sheet.normal, roughness: 0.7 });
  for (const side of [-1, 1]) {
    const L = new Loft(), N = 28, S = 10;
    const rings = [];
    for (let i = 0; i <= S; i++) {
      const s = i / S, y = -0.92 + s * 1.05;
      const k = Math.sqrt(Math.sin(Math.min(1, s / 0.25) * Math.PI / 2)) * (1 - 0.08 * s);
      const pts = ring([side * (OX - 0.04), y, -0.2], [side, 0, 0], [0, 0, 1], 0.2 * k, 0.33 * k, 0.33 * k, N, 3.2, (th) => 0.03 * Math.sin(th * 4 + s * 3));
      rings.push({ pts, v: s });
    }
    L.loft(rings, usFor(N), FULL, 3 + side, { start: [side * (OX - 0.04), -0.95, -0.2], end: [side * (OX - 0.04), 0.14, -0.2] });
    body.add(shadowy(new THREE.Mesh(L.build(), canvasMat)));
    // snap flap over the pocket mouth
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.58), tabMat);
    tab.position.set(side * (OX + 0.13), 0.0, -0.2); tab.rotation.z = side * 0.18;
    body.add(shadowy(tab));
    const snap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), brass);
    snap.rotation.z = Math.PI / 2; snap.position.set(side * (OX + 0.165), -0.1, -0.2);
    body.add(shadowy(snap));
  }
  // ---------------------------------------------------------------- shoulder straps flopped out on the sand
  const strapTagPoint = new THREE.Vector3();
  {
    const sp = strapTex(false);
    const sm = sp.map.clone(); sm.needsUpdate = true; sm.wrapS = sm.wrapT = THREE.RepeatWrapping; sm.repeat.set(1, 9);
    const sn = sp.normal.clone(); sn.needsUpdate = true; sn.wrapS = sn.wrapT = THREE.RepeatWrapping; sn.repeat.set(1, 9);
    const mat = std({ map: sm, normalMap: sn, roughness: 0.7 });
    const up = new THREE.Vector3(0, 0.81, 0.58);
    for (const side of [-1, 1]) {
      const curveP = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.42, 0.86, -0.62), new THREE.Vector3(side * 1.2, 0.62, -0.8), new THREE.Vector3(side * 1.62, -0.2, -0.95),
        new THREE.Vector3(side * 1.5, -0.95, -0.6), new THREE.Vector3(side * 1.0, -1.12, -0.5), new THREE.Vector3(side * 0.62, -1.02, -0.56),
      ]);
      const pts = curveP.getPoints(40);
      const N = 12;
      const rings = pts.map((p, i) => {
        const t = curveP.getTangent(i / 40);
        const u = up.clone().addScaledVector(t, -up.dot(t)).normalize();
        const sd = new THREE.Vector3().crossVectors(t, u).normalize();
        const pad = 1 + 0.25 * Math.sin(Math.min(1, Math.max(0, (i - 6) / 22)) * Math.PI);
        return { pts: ring([p.x, p.y, p.z], [sd.x, sd.y, sd.z], [u.x, u.y, u.z], 0.085 * pad, 0.028 * pad, 0.018, N, 4), v: i / 40 };
      });
      const L = new Loft();
      L.loft(rings, usFor(N), FULL, 10 + side, { start: [pts[0].x, pts[0].y, pts[0].z], end: [pts[40].x, pts[40].y, pts[40].z] });
      body.add(shadowy(new THREE.Mesh(L.build(), mat)));
      // a brass slider on each strap
      const q = pts[30], t = curveP.getTangent(0.75);
      const sl = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 4), brassMat());
      sl.position.copy(q); sl.lookAt(q.clone().add(t)); sl.rotation.z += Math.PI / 4; sl.scale.set(1.6, 0.7, 1);
      body.add(shadowy(sl));
      if (side > 0) {
        // the name tag hangs off a little brass ring on the right strap
        const a = pts[12];
        const rg = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.009, 6, 14), brassMat());
        rg.position.set(a.x + 0.02, a.y - 0.02, a.z + 0.09); rg.rotation.y = Math.PI / 2;
        body.add(shadowy(rg));
        strapTagPoint.set(a.x + 0.02, a.y - 0.06, a.z + 0.09);
      }
    }
  }
  // ---------------------------------------------------------------- D-rings (keychain, name tag) and rivets
  const dring = (x: number, y: number, z: number, side: number) => {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 16, Math.PI * 1.25), brass);
    t.rotation.set(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, -Math.PI * 0.62);
    g.add(t);
    const tabm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.09), tabMat);
    tabm.position.set(-side * 0.02, 0.04, 0);
    g.add(tabm);
    const rv = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), brass); rv.position.set(side * 0.005, 0.07, 0); g.add(rv);
    g.position.set(x, y, z);
    body.add(shadowy(g));
    const a = new THREE.Object3D(); a.position.set(x + side * 0.03, y - 0.05, z); body.add(a);
    return a;
  };
  const keyAnchor = dring(OX * 0.99, 0.6, 0.1, 1);
  const tagAnchor = new THREE.Object3D(); body.add(tagAnchor); tagAnchor.position.set(-0.5, CY - OY * 0.84 - 0.1, ZR + 0.13);
  // ---------------------------------------------------------------- grab handle on top
  {
    const st = strap.map.clone(); st.needsUpdate = true; st.repeat.set(1, 3); st.wrapS = st.wrapT = THREE.RepeatWrapping;
    const L = new Loft();
    const pts: V3[] = Array.from({ length: 17 }, (_, i) => { const t = i / 16; return [Math.cos(Math.PI * (1 - t)) * 0.3, CY + OY * 0.96 + Math.sin(Math.PI * t) * 0.2, -0.28] as V3; });
    L.tube(pts, () => 0.04, 8, FULL, 5, { capStart: true, capEnd: true });
    body.add(shadowy(new THREE.Mesh(L.build(), std({ map: st, roughness: 0.6 }))));
    for (const sx of [-1, 1]) { const rv = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), brass); rv.position.set(sx * 0.3, CY + OY * 0.97, -0.28); body.add(shadowy(rv)); }
  }
  // ---------------------------------------------------------------- receiving buckles on the front bottom
  const strapLight = strapTex(false);
  const strapMat = std({ map: strapLight.map, normalMap: strapLight.normal, roughness: 0.65 });
  const buckle = () => {
    const g = new THREE.Group();
    const bw = 0.17, bh = 0.13, th = 0.016;
    for (const [x, y, w, h] of [[0, bh / 2, bw, th], [0, -bh / 2, bw, th], [-bw / 2, 0, th, bh], [bw / 2, 0, th, bh]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w + th, h + th, th * 1.6), brass); b.position.set(x, y, 0); g.add(b);
    }
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, bh, 6), brass); pin.position.set(0, 0, 0.01); g.add(pin);
    return shadowy(g);
  };
  for (const sx of [-0.5, 0.5]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.36, 0.02), strapMat);
    s.position.set(sx, CY - OY * 0.9, ZR + 0.07); s.rotation.x = -0.35;
    body.add(shadowy(s));
    const b = buckle(); b.position.set(sx, CY - OY * 0.84, ZR + 0.11); b.rotation.x = -0.35; body.add(b);
    for (const dy of [-0.13]) { const rv = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), brass); rv.position.set(sx, CY - OY * 0.9 + dy, ZR + 0.035); body.add(rv); }
  }
  // ---------------------------------------------------------------- the flap
  const flapPivot = new THREE.Group();
  flapPivot.position.set(0, CY + IY + 0.06, ZR + 0.02);
  root.add(flapPivot);
  const flapParts: THREE.Object3D[] = [];
  {
    const W = 1.0, Lg = 1.62, TH = 0.05, R = 0.5;
    const flap = buildFlap(W, Lg, TH, R);
    const fl = leatherSheet(200, 168, 11, { border: 6 });
    const edge = strapTex(true);
    const em = edge.map.clone(); em.needsUpdate = true; em.wrapS = em.wrapT = THREE.RepeatWrapping; em.repeat.set(1, 30);
    const flapMesh = new THREE.Mesh(flap, [
      std({ map: fl.map, normalMap: fl.normal, roughness: 0.7 }),
      std({ map: flapLiningTex(), roughness: 0.95 }),
      std({ map: em, roughness: 0.6, side: THREE.DoubleSide }),
    ]);
    flapPivot.add(shadowy(flapMesh)); flapParts.push(flapMesh);
    // two buckle straps running down the outside and past the tip
    for (const sx of [-0.5, 0.5]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.5, 0.016), strapMat);
      st.position.set(sx, -0.9, 0.035 + 0.09 * (1 - sx * sx)); st.rotation.x = 0.07;
      flapPivot.add(shadowy(st)); flapParts.push(st);
      const b = buckle(); b.position.set(sx, -1.62, 0.05); flapPivot.add(b); flapParts.push(b);
      for (const y of [-0.22, -1.4]) { const rv = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), brass); rv.position.set(sx, y, 0.05 + 0.09 * (1 - sx * sx) * Math.min(1, -y / 0.4)); flapPivot.add(rv); }
    }
    // a little brass corner protector on each flap corner (hinge side)
    for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), brass); c.scale.set(1, 1, 0.5); c.position.set(sx * (W - 0.08), -0.08, 0.03); flapPivot.add(c); }
  }
  // ---------------------------------------------------------------- keychain: chain links + a tiny blobfish lure
  const links: THREE.Mesh[] = [];
  const steel = std({ color: '#c8d0dc', roughness: 0.3, metalness: 0.6, emissive: '#1a1e26' });
  for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 5, 10), steel); l.scale.set(1, 1.5, 1); l.castShadow = true; links.push(l); root.add(l); }
  const lure = new THREE.Group();
  const lv = voxelMesh(LURE_DEF, 1, paintLure());
  lv.scale.setScalar(0.9);
  lv.position.y = -0.24;
  lure.add(lv);
  root.add(lure);
  // ---------------------------------------------------------------- name tag on a string
  const tagObj = new THREE.Group();
  const ttex = nameTagTex('BLOB');
  const th = 0.3, tw = th * 32 / 44, k = th / 44;
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), std({ map: ttex, alphaTest: 0.5, roughness: 0.65, side: THREE.FrontSide }));
    m.position.set(0, -(th / 2 - 7 * k), side * 0.004); if (side < 0) m.rotation.y = Math.PI;
    m.castShadow = true;
    tagObj.add(m);
  }
  const holder = new THREE.Group(); holder.add(tagObj); // hangs from its eyelet
  root.add(holder);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 5), std({ color: '#d8c8a0', roughness: 0.9 }));
  root.add(string);
  return {
    root, body, flapPivot, flapParts, cellGlows, keyAnchor, tagAnchor, lining, floorW, floorH, floorZ,
    keychain: { links, lure }, tag: { obj: holder, string },
  };
}

// ------------------------------------------------------------------ the keychain lure: a tiny pink blobfish
const LURE_DEF = { id: 'blobLure', name: 'Blob Lure', kind: 'trinket', shape: [[0, 0]], rarity: 'common', desc: '', maxLevel: 1, look: 'soft', thick: 0.8 } as ItemDef;
function paintLure(): HTMLCanvasElement {
  const c = new Ic(32, 32, 5);
  const pink = c.mat(P.pink, { spec: 0.8, shin: 12, dither: 0.35 }), st = c.mat(P.steel, { metal: 0.6, spec: 0.7, shin: 18, dither: 0.3 });
  c.ring(16, 3.5, 2.6, 2.6, 1, st);
  c.tube([[16, 6], [16, 9]], 0.8, st);
  c.dome(16, 15, 10, 7.5, pink, { h: 6 });
  c.dome(16, 19, 4.2, 3.6, pink, { h: 3, z: 5 });   // droopy nose
  c.px(11, 13, '#140810'); c.px(12, 13, '#140810'); c.px(20, 13, '#140810'); c.px(21, 13, '#140810'); c.px(11, 12, '#ffffff'); c.px(20, 12, '#ffffff');
  c.line(13, 23, 19, 23, '#6e2240');
  for (const dir of [-1, 1]) c.tube(bez([16, 23], [16 + dir * 1, 29], [16 + dir * 4, 27]), 0.75, st);
  c.tube([[16, 22], [16, 29]], 0.75, st);
  c.glint(12, 10, 0);
  return c.render().canvas();
}

// ------------------------------------------------------------------ flap geometry: a thick, gently domed leather slab
// with a U-shaped tip. Outer face (group 0, leather), inner face (group 1, lining), edge band (group 2).
function buildFlap(W: number, L: number, TH: number, R: number): THREE.BufferGeometry {
  const NX = 24, NY = 28;
  const halfW = (y: number) => { const t = Math.max(0, Math.min(1, (-y - (L - R)) / R)); return W * Math.pow(1 - Math.pow(t, 2.4), 1 / 2.4); };
  const bulge = (x: number, y: number) => 0.09 * (1 - (x / W) ** 2) * Math.min(1, -y / 0.4);
  const P: number[] = [], UV: number[] = [], I: number[] = [];
  const groups: [number, number, number][] = [];
  const grid = (side: 1 | -1) => {
    const base = P.length / 3, i0 = I.length;
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const y = -L * (j / NY), x = (-1 + (2 * i) / NX) * Math.max(0.002, halfW(y));
      P.push(x, y, side * TH / 2 + bulge(x, y) + (side < 0 ? 0 : 0));
      if (side > 0) UV.push(x / (2 * W) + 0.5, 1 + y / L); else UV.push(x / (2 * W) + 0.5, -y / L);
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = base + j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      if (side > 0) I.push(a, c, b, b, c, d); else I.push(a, b, c, b, d, c);
    }
    groups.push([i0, I.length - i0, side > 0 ? 0 : 1]);
  };
  grid(1); grid(-1);
  // edge band around the outline (sides + tip; the hinge edge too)
  const outline: [number, number][] = [];
  for (let j = 0; j <= NY; j++) outline.push([-halfW(-L * j / NY), -L * j / NY]);
  for (let j = NY; j >= 0; j--) outline.push([halfW(-L * j / NY), -L * j / NY]);
  outline.push(outline[0]);
  const base = P.length / 3, i0 = I.length;
  let acc = 0;
  outline.forEach(([x, y], k) => {
    if (k) acc += Math.hypot(x - outline[k - 1][0], y - outline[k - 1][1]);
    const z = bulge(x, y);
    P.push(x, y, z + TH / 2, x, y, z - TH / 2);
    UV.push(0, acc * 4, 1, acc * 4);
  });
  for (let k = 0; k + 1 < outline.length; k++) { const a = base + k * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  groups.push([i0, I.length - i0, 2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I);
  for (const [st, n, m] of groups) g.addGroup(st, n, m);
  g.computeVertexNormals();
  return g;
}

/** the inside of the flap: teal lining, a stitched border, a woven name label and a pinned note of controls */
function flapLiningTex(): THREE.Texture {
  const w = 200, h = 162;
  const p = new Px(w, h);
  const r = ramp(['#081419', '#0f222a', '#163039', '#1f414c', '#2b5562', '#3a6a74'], 5, 0.5);
  p.fill((x, y) => {
    const ed = Math.min(x, w - 1 - x, h - 1 - y, y);
    return r(0.5 + (((x + y) & 1) ? 0.05 : -0.05) + (pxNoise(x, y, 18, 3, 4) - 0.5) * 0.4 - Math.max(0, 1 - ed / 10) * 0.3, x, y);
  });
  // stitched border
  for (let k = 12; k < w - 12; k++) for (const y of [10, h - 22]) if (k % 6 < 4) p.set(k, y, '#8a8a72');
  for (let k = 10; k < h - 22; k++) for (const x of [12, w - 13]) if (k % 6 < 4) p.set(x, k, '#8a8a72');
  const card = (cx: number, cy: number, cw: number, ch: number, bg: string[], lines: { t: string; st: TextStyle }[], pin: boolean, tilt: number) => {
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d')!;
    const pr = ramp(bg, bg.length - 1, 0.5);
    const img = ctx.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const c = pr(0.6 + (pxNoise(x, y, 8, 2, 9) - 0.5) * 0.3 - (x === 0 || y === 0 || x === cw - 1 || y === ch - 1 ? 0.35 : 0), x, y);
      const i = (y * cw + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    let yy = 3;
    for (const l of lines) { const tc = textCanvas(l.t, l.st); ctx.drawImage(tc.canvas, Math.round((cw - tc.w) / 2), yy - 3); yy += tc.h - 7; }
    const src = ctx.getImageData(0, 0, cw, ch).data;
    // stamp into the lining with a slight tilt (nearest sampling keeps it pixel-crisp)
    const c0 = Math.cos(tilt), s0 = Math.sin(tilt);
    for (let y = -ch; y < ch; y++) for (let x = -cw; x < cw; x++) {
      const u = Math.round(x * c0 + y * s0 + cw / 2), v = Math.round(-x * s0 + y * c0 + ch / 2);
      if (u < 0 || v < 0 || u >= cw || v >= ch) continue;
      const i = (v * cw + u) * 4;
      p.set(cx + x, cy + y, [src[i], src[i + 1], src[i + 2]]);
    }
    // drop shadow below/right
    if (pin) { p.set(cx, cy - ch / 2 + 2, '#f6d880'); p.set(cx + 1, cy - ch / 2 + 2, '#a87420'); p.set(cx, cy - ch / 2 + 3, '#7a5014'); }
  };
  const ink: TextStyle = { font: 'M6x11', px: 16, fill: '#3a2414' };
  card(w / 2, 117, 146, 50, ['#6e5a40', '#a89070', '#d8c8a0', '#ecdfbc', '#f6eed6'], [
    { t: 'drag to pack  ·  R: turn', st: ink }, { t: 'drop on a match to fuse', st: ink }, { t: 'Tab: close the bag', st: ink },
  ], true, -0.05);
  const red: TextStyle = { font: 'Tiny5', px: 8, fill: '#a02020' };
  card(w / 2 + 2, 151, 70, 20, ['#a89880', '#d8ccb0', '#ece4d0', '#f6f0e0'], [{ t: 'PROPERTY OF', st: red }, { t: 'B L O B', st: red }], false, 0.03);
  const t = p.texture();
  return t;
}
