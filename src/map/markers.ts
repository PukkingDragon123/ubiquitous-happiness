// Node markers: a physical float per node type (red-and-white bobber, hazard spar buoy, floating barrel,
// life ring, treasure crate, message bottle, the giant bell buoy for the boss) carrying a painted pixel
// medallion on a post. Available nodes bob and glow on the water, the hovered one springs up, visited
// ones sit low and dim with a little pixel flag planted on top.
import * as THREE from 'three';
import { Loft, V3 } from '../gfx/loft';
import { clamp01, damp } from '../core/math';
import { A } from './tex';
import { barrel, blob, bottle, box, lathe, membrane, rod, weightsToAttr } from './build';
import { DIO, dio, glowRingMaterial } from './shaders';
import type { MapNode, NodeType } from './gen';

/** markers read a little larger than life so the icons stay legible */
export const MARKER_SCALE = 1.3;

export type MarkerState = 'locked' | 'available' | 'visited' | 'current';

const GLOW: Record<NodeType, string> = {
  fishing: '#7ff6ff', elite: '#ff7a5a', shop: '#ffd27a', rest: '#8affb0', treasure: '#ffe27a', mystery: '#c69aff', boss: '#ff5a4a',
};

function body(L: Loft, t: NodeType): number {
  switch (t) {
    case 'fishing':
      lathe(L, [[0.0, -0.2], [0.09, -0.185], [0.15, -0.11], [0.165, -0.02], [0.165, 0.0]], 14, A.white, { capBot: true });
      lathe(L, [[0.165, 0.0], [0.168, 0.025]], 14, A.black);
      lathe(L, [[0.165, 0.025], [0.15, 0.1], [0.09, 0.155], [0.0, 0.17]], 14, A.red, { capTop: true });
      rod(L, [0, 0.16, 0], [0, 0.32, 0], 0.016, 0.012, 6, A.white);
      return 0.32;
    case 'elite':
      lathe(L, [[0.0, -0.26], [0.12, -0.25], [0.15, -0.05], [0.15, 0.26], [0.1, 0.33], [0.0, 0.34]], 14, A.buoyYB, { capBot: true, capTop: true });
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; rod(L, [Math.cos(a) * 0.09, 0.32, Math.sin(a) * 0.09], [Math.cos(a) * 0.03, 0.5, Math.sin(a) * 0.03], 0.008, 0.008, 4, A.black); }
      blob(L, [0, 0.5, 0], 0.045, 0.045, 0.045, A.red, 8);
      return 0.52;
    case 'shop':
      barrel(L, [0, -0.12, 0], 0.14, 0.3);
      rod(L, [0, 0.17, 0], [0, 0.3, 0], 0.014, 0.012, 5, A.darkWood);
      return 0.3;
    case 'rest': {
      const path: V3[] = [];
      for (let k = 0; k <= 20; k++) { const a = (k / 20) * Math.PI * 2; path.push([Math.cos(a) * 0.17, 0.02, Math.sin(a) * 0.17]); }
      L.tube(path, () => 0.05, 8, A.buoyRW, 777);
      rod(L, [0, -0.3, 0], [0, 0.3, 0], 0.014, 0.012, 5, A.white);
      lathe(L, [[0.05, -0.02], [0.07, 0.02], [0.05, 0.06], [0.0, 0.07]], 10, A.moss, { capBot: true });
      return 0.3;
    }
    case 'treasure':
      box(L, [0, -0.02, 0], [0.3, 0.2, 0.22], A.chest, 0.3);
      box(L, [0, 0.085, 0], [0.31, 0.02, 0.23], A.gold, 0.3);
      rod(L, [0, 0.08, 0], [0, 0.32, 0], 0.016, 0.012, 5, A.darkWood);
      return 0.32;
    case 'mystery':
      bottle(L, 1.7);
      rod(L, [0, 0.05, 0], [0, 0.3, 0], 0.008, 0.008, 4, A.rope);
      return 0.3;
    case 'boss': {
      lathe(L, [[0.0, -0.3], [0.38, -0.28], [0.5, -0.1], [0.52, 0.08], [0.45, 0.18], [0.0, 0.2]], 18, A.buoyRW, { capBot: true, capTop: true });
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; rod(L, [Math.cos(a) * 0.36, 0.17, Math.sin(a) * 0.36], [Math.cos(a) * 0.16, 1.0, Math.sin(a) * 0.16], 0.022, 0.018, 5, A.redPaint); }
      lathe(L, [[0.2, 0.98], [0.2, 1.04], [0.0, 1.05]], 12, A.redPaint, { capTop: true });
      lathe(L, [[0.0, 0.42], [0.17, 0.44], [0.15, 0.55], [0.1, 0.72], [0.04, 0.78], [0.0, 0.8]], 14, A.gold, { capBot: true });
      blob(L, [0, 0.42, 0], 0.04, 0.04, 0.04, A.metal, 6);
      lathe(L, [[0.07, 1.05], [0.07, 1.16], [0.0, 1.2]], 10, A.lamp, { capBot: true });
      rod(L, [0, 1.15, 0], [0, 1.55, 0], 0.025, 0.02, 6, A.black);
      return 1.55;
    }
  }
}

let SHARED: { atlas: THREE.Material; flagMat: THREE.Material; rim: THREE.Material; back: THREE.Material } | null = null;

export class Marker {
  node: MapNode;
  root = new THREE.Group();
  float = new THREE.Group();
  medal = new THREE.Group();
  medalMat: THREE.MeshStandardMaterial;
  glow: THREE.Mesh;
  glowMat: THREE.ShaderMaterial;
  flag: THREE.Group;
  pennant: THREE.Mesh;
  state: MarkerState = 'locked';
  hover = 0;
  private lift = 0; private liftV = 0; private sc = MARKER_SCALE; private scV = 0;
  private flagK = 0;
  private ph = Math.random() * 6.28;
  topY: number;
  medalR: number;
  medalY: number;
  big: boolean;
  /** extra lift while the token rides toward this node */
  focus = 0;

  constructor(node: MapNode, atlasMat: THREE.MeshStandardMaterial, medTex: THREE.Texture, medUV: { x: number; y: number; w: number; h: number }) {
    this.node = node;
    this.big = node.type === 'boss';
    if (!SHARED) {
      SHARED = {
        atlas: atlasMat,
        flagMat: dio(new THREE.MeshStandardMaterial({ map: atlasMat.map, side: THREE.DoubleSide, roughness: 0.8 }), { sway: 'flag' }),
        rim: dio(new THREE.MeshStandardMaterial({ color: '#c8963a', roughness: 0.35, metalness: 0.7 })),
        back: dio(new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.8 })),
      };
    }
    const L = new Loft();
    const top = body(L, node.type);
    // medallion on its post
    this.medalR = this.big ? 0.58 : 0.3;
    this.medalY = top + this.medalR * 0.95;
    rod(L, [0, top - 0.02, 0], [0, this.medalY, 0], this.big ? 0.03 : 0.013, this.big ? 0.025 : 0.011, 5, A.darkWood);
    const bm = new THREE.Mesh(L.build(), atlasMat);
    bm.castShadow = true; bm.receiveShadow = true;
    this.float.add(bm);
    const R = this.medalR, th = R * 0.16;
    const front = new THREE.CircleGeometry(R, 32);
    const uv = front.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, medUV.x + uv.getX(i) * medUV.w, 1 - (medUV.y + (1 - uv.getY(i)) * medUV.h));
    this.medalMat = dio(new THREE.MeshStandardMaterial({ map: medTex, emissiveMap: medTex, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.5, metalness: 0.05 }), { cloud: 0.6 });
    const fm = new THREE.Mesh(front, this.medalMat); fm.position.z = th / 2 + 0.001; fm.castShadow = true;
    const bk = new THREE.Mesh(new THREE.CircleGeometry(R * 0.98, 24), SHARED.back); bk.rotation.y = Math.PI; bk.position.z = -th / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(R, R, th, 32, 1, true), SHARED.rim); rim.rotation.x = Math.PI / 2; rim.castShadow = true;
    this.medal.add(fm, bk, rim);
    this.medal.position.y = this.medalY;
    this.float.add(this.medal);
    // pennant above the medallion (flutters while available)
    const pl = new Loft();
    const pw = this.big ? 0.5 : 0.24, ph = this.big ? 0.22 : 0.11;
    membrane(pl, [0, 1, 2].map((i) => [0, 1, 2, 3, 4].map((j): V3 => [j / 4 * pw, -i / 2 * ph * (1 - j / 4 * 0.85) - (j / 4) * ph * 0.08, 0])), A.pennant[node.type === 'elite' || node.type === 'boss' ? 0 : node.type === 'shop' || node.type === 'treasure' ? 1 : node.type === 'rest' ? 2 : 3], (_i, j) => j / 4);
    rod(pl, [0, -ph * 1.3, 0], [0, 0.02, 0], 0.006, 0.006, 4, A.black);
    const pg = weightsToAttr(pl.build());
    this.pennant = new THREE.Mesh(pg, SHARED.flagMat);
    this.pennant.position.set(0, this.medalY + R + ph * 1.3 + 0.02, 0);
    this.pennant.castShadow = true;
    this.float.add(this.pennant);
    // visited flag (a little green pennant planted on the float)
    const fl = new Loft();
    rod(fl, [0, 0, 0], [0, 0.36, 0], 0.007, 0.006, 4, A.white);
    membrane(fl, [0, 1].map((i) => [0, 1, 2, 3].map((j): V3 => [j / 3 * 0.17, 0.35 - i * 0.1 * (1 - j / 3 * 0.9), 0])), A.pennant[2], (_i, j) => j / 3);
    const fg = weightsToAttr(fl.build());
    const fmesh = new THREE.Mesh(fg, SHARED.flagMat); fmesh.castShadow = true;
    this.flag = new THREE.Group(); this.flag.add(fmesh);
    this.flag.position.set(this.big ? 0.3 : 0.1, top * 0.6, this.big ? 0.2 : 0.06);
    this.flag.scale.setScalar(0.001);
    this.float.add(this.flag);
    this.topY = this.medalY + R;
    // glow ring on the water
    this.glowMat = glowRingMaterial(new THREE.Color(GLOW[node.type]));
    this.glowMat.uniforms.uPh.value = Math.random();
    const gs = this.big ? 3.2 : 1.6;
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(gs, gs, 1, 1).rotateX(-Math.PI / 2), this.glowMat);
    this.glow.renderOrder = 4;
    this.glow.frustumCulled = false;
    this.float.scale.setScalar(MARKER_SCALE);
    this.root.add(this.float, this.glow);
    this.root.position.set(node.x, 0, node.z);
    this.float.rotation.y = (node.seed % 628) / 100;
  }

  setState(s: MarkerState) { this.state = s; }

  update(dt: number, t: number, cam: THREE.Camera) {
    const st = this.state;
    const avail = st === 'available', visited = st === 'visited' || st === 'current';
    // springy hover lift + squash
    const tl = this.hover * (this.big ? 0.4 : 0.26) + this.focus * 0.15;
    this.liftV += ((tl - this.lift) * 160 - this.liftV * 13) * dt;
    this.lift += this.liftV * dt;
    const ts = MARKER_SCALE * (1 + this.hover * 0.16 + (avail ? 0.04 : 0) + this.focus * 0.08);
    this.scV += ((ts - this.sc) * 220 - this.scV * 12) * dt;
    this.sc += this.scV * dt;
    const amp = avail ? 0.045 : visited ? 0.012 : 0.022;
    const sink = visited ? -0.06 : 0;
    const bob = Math.sin(t * (avail ? 2.6 : 1.6) + this.ph) * amp;
    this.float.position.y = sink + bob + this.lift;
    this.float.rotation.z = Math.sin(t * 1.3 + this.ph) * (avail ? 0.07 : 0.035);
    this.float.rotation.x = Math.cos(t * 1.1 + this.ph * 1.3) * (avail ? 0.06 : 0.03);
    const sq = Math.max(0, -this.liftV) * 0.01;
    this.float.scale.set(this.sc * (1 + sq), this.sc * (1 - sq), this.sc * (1 + sq));
    // medallion faces the camera
    this.medal.updateWorldMatrix(true, false);
    const pq = new THREE.Quaternion();
    this.float.getWorldQuaternion(pq);
    this.medal.quaternion.copy(pq.invert().multiply(cam.quaternion));
    this.medal.rotateY(Math.sin(t * 0.9 + this.ph) * 0.12 * (avail ? 1 : 0.3));
    // look
    const dimC = st === 'locked' ? 0.82 : visited ? 0.5 : 1;
    this.medalMat.color.setScalar(dimC);
    if (visited) this.medalMat.color.setRGB(0.52, 0.54, 0.6);
    const pulse = avail ? 0.22 + Math.sin(t * 3.2 + this.ph) * 0.1 : 0;
    const nightLift = DIO.uDNight.value * (visited ? 0.12 : 0.3);
    this.medalMat.emissiveIntensity = damp(this.medalMat.emissiveIntensity, nightLift + pulse + this.hover * 0.55 + this.focus * 0.4 + (this.big && !visited ? 0.12 : 0), 10, dt);
    this.glow.visible = avail || this.big || this.focus > 0.01;
    this.glowMat.uniforms.uK.value = damp(this.glowMat.uniforms.uK.value, (avail ? 1.1 : this.big ? 0.55 : 0) + this.hover * 0.9 + this.focus, 6, dt);
    this.pennant.visible = !visited;
    this.flagK = damp(this.flagK, visited ? 1 : 0, 7, dt);
    this.flag.scale.setScalar(Math.max(0.001, this.flagK * (1 + Math.sin(this.flagK * Math.PI) * 0.4)));
    void clamp01;
  }
  /** world point to anchor the floating label to */
  labelAnchor(out: THREE.Vector3) { return this.root.localToWorld(out.set(0, this.float.position.y + this.topY * this.sc + (this.big ? 0.35 : 0.22), 0)); }
}
