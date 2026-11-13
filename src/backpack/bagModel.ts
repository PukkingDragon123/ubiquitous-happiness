// The backpack itself, built in its own local frame: the open compartment faces +z, its quilted 5x5 floor
// lies in the z = 0 plane, +y is the top (where the flap hinges). Worn lofted leather shell, rolled rim,
// teal lining, canvas side pockets with snap flaps, brass D-rings, buckles and rivets, a grab handle, the
// flap (leather outside, lining inside, two buckle straps) and a pocket-highlight overlay per cell.
import * as THREE from 'three';
import { Loft, ring, usFor, FULL, type V3 } from '../gfx/loft';
import { smooth } from '../core/math';
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
  const keyAnchor = dring(OX * 0.99, 0.5, 0.08, 1);
  const tagAnchor = dring(-OX * 0.99, 0.35, 0.08, -1);
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
    const W = 1.0, Lg = 1.62;
    const sh = new THREE.Shape();
    sh.moveTo(-W, 0);
    sh.lineTo(-W, -Lg + 0.45);
    sh.bezierCurveTo(-W, -Lg + 0.05, -0.5, -Lg - 0.04, 0, -Lg - 0.04);
    sh.bezierCurveTo(0.5, -Lg - 0.04, W, -Lg + 0.05, W, -Lg + 0.45);
    sh.lineTo(W, 0);
    sh.lineTo(-W, 0);
    const bend = (g: THREE.BufferGeometry, k: number) => {
      const pa = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i); pa.setZ(i, pa.getZ(i) + k * (1 - (x / W) ** 2) * 0.12 * Math.min(1, -y / 0.4) + 0.02); }
      g.computeVertexNormals();
    };
    const fl = leatherSheet(200, 168, 11, { border: 6 });
    fl.map.repeat.set(1 / (2 * W), 1 / (Lg + 0.06)); fl.map.offset.set(0.5, 1);
    fl.normal.repeat.copy(fl.map.repeat); fl.normal.offset.copy(fl.map.offset);
    const edge = strapTex(true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.022, bevelSegments: 2, curveSegments: 18 });
    bend(g, 1);
    const flap = new THREE.Mesh(g, [std({ map: fl.map, normalMap: fl.normal, roughness: 0.7 }), std({ map: edge.map, roughness: 0.6 })]);
    flapPivot.add(shadowy(flap)); flapParts.push(flap);
    // inside lining with a stitched border
    const lg = new THREE.ShapeGeometry(sh, 18);
    lg.scale(0.93, 0.95, 1); lg.translate(0, -0.03, -0.021);
    bend(lg, 1);
    const ltex = liningPlain(96, 80, 9);
    ltex.repeat.set(1 / (2 * W), 1 / Lg); ltex.offset.set(0.5, 1);
    const lin = new THREE.Mesh(lg, std({ map: ltex, roughness: 0.95, side: THREE.BackSide }));
    lin.receiveShadow = true;
    flapPivot.add(lin); flapParts.push(lin);
    // two buckle straps running down the outside and past the tip
    for (const sx of [-0.5, 0.5]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.5, 0.016), strapMat);
      st.position.set(sx, -0.95, 0.16); st.rotation.x = 0.04;
      flapPivot.add(shadowy(st)); flapParts.push(st);
      const b = buckle(); b.position.set(sx, -1.62, 0.16); flapPivot.add(b); flapParts.push(b);
      for (const y of [-0.22, -1.4]) { const rv = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), brass); rv.position.set(sx, y, 0.175); flapPivot.add(rv); }
    }
    // a little brass corner protector on each flap corner (hinge side)
    for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), brass); c.scale.set(1, 1, 0.5); c.position.set(sx * (W - 0.06), -0.06, 0.07); flapPivot.add(c); }
  }
  // ---------------------------------------------------------------- keychain: chain links + a tiny blobfish lure
  const links: THREE.Mesh[] = [];
  const steel = std({ color: '#c8d0dc', roughness: 0.3, metalness: 0.6, emissive: '#1a1e26' });
  for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 5, 10), steel); l.scale.set(1, 1.5, 1); l.castShadow = true; links.push(l); root.add(l); }
  const lure = new THREE.Group();
  const lv = voxelMesh(LURE_DEF, 1, paintLure());
  lv.scale.setScalar(0.62);
  lv.position.y = -0.18;
  lure.add(lv);
  root.add(lure);
  // ---------------------------------------------------------------- name tag on a string
  const tagObj = new THREE.Group();
  const ttex = nameTagTex('BLOB');
  const tw = 0.3, th = 0.19;
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), std({ map: ttex, alphaTest: 0.5, roughness: 0.65, side: THREE.FrontSide }));
    m.position.set(tw / 2 - 0.035, 0, side * 0.004); if (side < 0) m.rotation.y = Math.PI;
    m.castShadow = true;
    tagObj.add(m);
  }
  const holder = new THREE.Group(); holder.add(tagObj); tagObj.rotation.z = -Math.PI / 2; // hangs hole-up
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
