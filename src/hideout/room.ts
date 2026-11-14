// The hideout cave: a 12 x 10 m grotto carved into a basalt outcrop on the seabed, open to the water above (cold
// caustic light pours in), with warm lamps inside. Walls are thick faceted rock; the ones between the camera and
// the room drop down to a waist-high cut (clipping plane + dark section on the back faces) as you orbit, so the
// diorama always reads. A round brass hatch in the left wall opens onto a shimmering water membrane; a porthole
// in the right wall looks out into the blue.
import * as THREE from 'three';
import { retro } from '../gfx/retro';
import { MAT, TEX } from './tex';
import { Kit } from './kit';
import { oceanFog } from './ocean';
import { GRID_W, GRID_D } from './blueprints';
import { MOUNTS } from './decor';
import { fbm, hash2, damp, clamp01 } from '../core/math';
import { Px } from '../gfx/px';

export const HALF_W = GRID_W / 2, HALF_D = GRID_D / 2;
export const WALL_H = 4.6;
/** door centre (on the -x wall) and the big round window centre (on the -z wall), world space */
export const DOOR = new THREE.Vector3(-HALF_W, 1.05, 2);
export const PORTHOLE = new THREE.Vector3(0, 2.62, -HALF_D);
export const WINDOW_R = 1.05;

/**
 * Nooks carved deep into the back walls (pockets pushed into the rock): the bed loft and the trophy niche in the
 * north wall, the map room (the planning table) in the west wall. u = along the wall (world x on n, z on w),
 * y0..y1 = the opening (arched: the top drops by `arch` toward the sides), depth = how far back.
 */
export interface Nook { id: 'loft' | 'trophy' | 'maproom'; side: 'n' | 'w'; u0: number; u1: number; y0: number; y1: number; arch: number; depth: number }
export const NOOKS: Nook[] = [
  { id: 'loft', side: 'n', u0: -4.45, u1: -1.55, y0: 0.55, y1: 3.0, arch: 0.55, depth: 2.5 },
  { id: 'trophy', side: 'n', u0: 1.45, u1: 4.15, y0: 0.42, y1: 2.95, arch: 0.4, depth: 0.95 },
  { id: 'maproom', side: 'w', u0: -3.65, u1: -0.55, y0: -0.4, y1: 3.55, arch: 0.7, depth: 2.6 },
];
/** how far a nook pushes the inner wall face back at (u, y): 0 outside, depth inside, eased at the edges */
export function nookPush(side: 'n' | 'w' | 's' | 'e', u: number, y: number): number {
  let best = 0;
  for (const n of NOOKS) {
    if (n.side !== side) continue;
    const c = (n.u0 + n.u1) / 2, hw = (n.u1 - n.u0) / 2;
    const ku = Math.abs(u - c) / hw;
    if (ku >= 1) continue;
    const top = n.y1 - n.arch * ku * ku;
    if (y < n.y0 || y > top) continue;
    best = Math.max(best, n.depth);
  }
  return best;
}

/** a thick, faceted rock wall slab: box -> displaced by world-space noise (continuous across faces) */
function rockSlab(cx: number, cz: number, len: number, alongX: boolean, inwardSign: number, mat: THREE.Material, o: { H?: number; T?: number; carve?: { p: THREE.Vector3; r: number }[]; seed?: number; seg?: number; nook?: 'n' | 'w' } = {}): THREE.Mesh {
  const T = o.T ?? 1.8, H = o.H ?? WALL_H;
  const inner = alongX ? cz + inwardSign * T / 2 : cx + inwardSign * T / 2;
  const sx = alongX ? len : T, sz = alongX ? T : len;
  // big facets: ~1.1 m quads (finer where nooks are carved), displaced by low-frequency noise so each face reads
  // as a flat rock slab
  const sg = o.seg ?? 1.1;
  const g = new THREE.BoxGeometry(sx, H + 0.6, sz, Math.max(1, Math.round(sx / sg)), Math.max(1, Math.round(H / Math.min(0.95, sg))), Math.max(1, Math.round(sz / sg)));
  g.translate(cx, (H + 0.6) / 2 - 0.3, cz);
  const sd = o.seed ?? 0;
  const P = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const n1 = fbm(x * 0.32 + 3, y * 0.3 + z * 0.32, 2, 11 + sd) - 0.5, n2 = fbm(z * 0.32 - 7, y * 0.3 + x * 0.32, 2, 12 + sd) - 0.5, n3 = fbm(x * 0.25 + z * 0.25, y * 0.25, 1, 13 + sd) - 0.5;
    const hk = clamp01(y / 0.8); // keep the floor line tidy
    let dx = n1 * 1.3 * hk, dz = n2 * 1.3 * hk, dy = n3 * 0.6;
    // lean in toward the top (overhang) on the room side
    const lean = Math.max(0, y - 2.6) * 0.22;
    if (alongX) dz += inwardSign * lean; else dx += inwardSign * lean;
    // a jagged ridge on top
    if (y > H) dy += (fbm(x * 0.45, z * 0.45, 1, 14 + sd) - 0.4) * (H > 2 ? 1.6 : 0.5);
    // carve a flat recess where a fixture (door, porthole) is mounted: push the rock back behind it
    const outer = inner - inwardSign * T;
    const onInner = alongX ? Math.abs(z - inner) < 0.01 : Math.abs(x - inner) < 0.01;
    const onOuter = alongX ? Math.abs(z - outer) < 0.01 : Math.abs(x - outer) < 0.01;
    if ((onInner || onOuter) && o.carve) for (const c of o.carve) {
      const u = alongX ? x - c.p.x : z - c.p.z, v = y - c.p.y;
      const d = Math.hypot(u, v);
      const k = clamp01((d - c.r) / 0.9);
      if (k < 1) { const back = (onInner ? -inwardSign : inwardSign) * 0.35 * (1 - k); if (alongX) dz = dz * k + back; else dx = dx * k + back; }
    }
    // nooks: the inner face is pushed deep into the rock, and everything behind it within the slab (its end faces
    // at the segment seams) is squeezed back behind the pocket, so no seam fins poke into it
    if (o.nook) {
      const push = nookPush(o.nook, alongX ? x : z, y);
      if (push > 0) {
        const d = Math.abs((alongX ? z : x) - inner);
        const nd = push + (d * (T - push)) / T;
        const tame = onInner ? 0.35 : 1;
        if (alongX) { dz = dz * tame - inwardSign * (nd - d); dx *= tame; } else { dx = dx * tame - inwardSign * (nd - d); dz *= tame; }
        dy *= tame;
      }
    }
    P.setXYZ(i, x + dx, y + dy, z + dz);
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals(); // flat facets
  // uvs by dominant axis in world space (2 m tile)
  const N = ng.attributes.normal as THREE.BufferAttribute, Q = ng.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(Q.count * 2);
  for (let i = 0; i < Q.count; i++) {
    const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i));
    const x = Q.getX(i), y = Q.getY(i), z = Q.getZ(i);
    const [u, v] = ay > ax && ay > az ? [x, z] : ax > az ? [z, y] : [x, y];
    uv[i * 2] = u / 2; uv[i * 2 + 1] = v / 2;
  }
  ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const m = new THREE.Mesh(ng, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** a big weathered boulder (outside) */
function boulder(r: number, seed: number, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.IcosahedronGeometry(r, r > 2.5 ? 1 : 0);
  const P = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const k = 1 + (fbm(x * 0.5 + seed, y * 0.5, 1, seed) - 0.5) * 0.8;
    P.setXYZ(i, x * k, Math.max(-r * 0.3, y * k * 1.15), z * k);
  }
  const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals();
  const Q = ng.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(Q.count * 2);
  for (let i = 0; i < Q.count; i++) { uv[i * 2] = (Q.getX(i) + Q.getZ(i)) / 2; uv[i * 2 + 1] = Q.getY(i) / 2; }
  ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const m = new THREE.Mesh(ng, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** an animated caustic pattern for the overhead spotlight's projected map */
class Caustics {
  cv = document.createElement('canvas');
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  private img: ImageData;
  private acc = 0;
  constructor(private S = 64) {
    this.cv.width = this.cv.height = S;
    this.ctx = this.cv.getContext('2d')!;
    this.img = this.ctx.createImageData(S, S);
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.draw(0);
  }
  draw(t: number) {
    const S = this.S, d = this.img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x / S) * 6.28 * 2, v = (y / S) * 6.28 * 2;
      let c = 0;
      let px = u, py = v;
      for (let i = 0; i < 3; i++) { const tt = t * (0.6 + i * 0.25); const nx = px + Math.cos(tt - py) + Math.sin(tt + px * 0.5); const ny = py + Math.sin(tt - px) + Math.cos(tt + py * 0.5); px = nx; py = ny; c += 1 / Math.hypot(Math.sin(px) * 3, Math.cos(py) * 3); }
      c = Math.min(1, Math.pow(c / 3, 2.2) * 2.4);
      const r = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2);
      const fall = clamp01(1.25 - r * 1.1);
      const q = Math.round((0.35 + c * 0.9) * fall * 6) / 6;
      const i4 = (y * S + x) * 4;
      d[i4] = 140 * q + 60 * c * fall; d[i4 + 1] = 210 * q + 40 * c * fall; d[i4 + 2] = 255 * q; d[i4 + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.tex.needsUpdate = true;
  }
  update(dt: number, t: number) { this.acc += dt; if (this.acc > 1 / 15) { this.acc = 0; this.draw(t); } }
}

/** the round water membrane behind the door / the view through the porthole */
function waterWindow(kind: 'membrane' | 'porthole'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpen: { value: kind === 'porthole' ? 1 : 0 }, uKind: { value: kind === 'porthole' ? 1 : 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uOpen; uniform float uKind; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main() {
        vec2 q = floor(vUv * 48.0) / 48.0; // pixelated view
        vec2 c = q - 0.5;
        float r = length(c) * 2.0;
        if (r > 1.0) discard;
        float t = uTime;
        vec3 deep = vec3(0.01, 0.07, 0.12), mid = vec3(0.04, 0.3, 0.42), top = vec3(0.3, 0.75, 0.85);
        vec3 col = mix(deep, mid, smoothstep(-0.5, 0.5, c.y));
        col = mix(col, top, smoothstep(0.25, 0.6, c.y) * 0.5);
        // shafts
        float s = smoothstep(0.6, 1.0, n(vec2(c.x * 6.0 + c.y * 2.0 + t * 0.1, 0.5)));
        col += vec3(0.2, 0.45, 0.5) * s * smoothstep(-0.3, 0.5, c.y) * 0.6;
        // kelp silhouettes swaying
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float kx = -0.32 + fi * 0.3 + sin(t * 0.6 + fi * 2.0 + c.y * 3.0) * 0.04 * (c.y + 0.5);
          float w = 0.035 - fi * 0.006;
          col = mix(col, vec3(0.02, 0.08, 0.06) + fi * 0.02, step(abs(c.x - kx), w) * step(c.y, 0.35 - fi * 0.15) * 0.85);
        }
        // a fish passing
        float fx = fract(t * 0.05) * 2.4 - 1.2;
        vec2 fp = (c - vec2(fx, 0.12 + sin(t * 0.3) * 0.05)) * vec2(1.0, 2.2);
        col = mix(col, vec3(0.02, 0.1, 0.14), smoothstep(0.09, 0.07, length(fp)) * 0.9);
        // surface ripples (membrane only) + rim glow
        if (uKind < 0.5) {
          float rip = sin(r * 22.0 - t * 3.0) * 0.5 + 0.5;
          col += vec3(0.25, 0.55, 0.6) * rip * 0.18 * (1.0 - r) ;
          col += vec3(0.4, 0.9, 1.0) * smoothstep(0.8, 1.0, r) * 0.7;
          col = mix(vec3(0.0), col, uOpen);
        } else {
          // glass: glare and a little dirt
          col += vec3(0.25) * smoothstep(0.2, 0.0, length(c - vec2(-0.18, 0.2))) ;
          col *= 0.9 + 0.1 * n(q * 30.0);
        }
        gl_FragColor = vec4(col * 1.6, 1.0);
      }`,
  });
}

export interface WallSide { group: THREE.Group; normal: THREE.Vector2; centre: THREE.Vector2; up: number; target: number; lights: { l: THREE.PointLight; base: number }[] }

export class Room {
  group = new THREE.Group();
  walls: WallSide[] = [];
  spot: THREE.SpotLight;
  hemi: THREE.HemisphereLight;
  tvLight: THREE.PointLight;
  keyLamp: THREE.SpotLight;
  pool: THREE.PointLight[] = [];
  caustics = new Caustics();
  door: { pivot: THREE.Group; wheel: THREE.Object3D; open: number; target: number; membrane: THREE.ShaderMaterial };
  private portMat: THREE.ShaderMaterial;
  private fairy: { m: THREE.Mesh; ph: number }[] = [];
  floor: THREE.Mesh;
  outerHatch!: THREE.Group;
  /** the wall segment a world point belongs to (decor rides it) */
  wallFor: (p: THREE.Vector3) => WallSide = () => this.walls[0];
  grid: THREE.Mesh;
  gridMat: THREE.MeshBasicMaterial;
  private t = 0;

  constructor(lowQuality = false) {
    // floor (flagstones) under the room and the walls
    const fg = new THREE.PlaneGeometry(GRID_W + 3, GRID_D + 3, 1, 1); fg.rotateX(-Math.PI / 2);
    const fuv = fg.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * (GRID_W + 3) / 2, fuv.getY(i) * (GRID_D + 3) / 2);
    this.floor = new THREE.Mesh(fg, MAT.floor());
    this.floor.receiveShadow = true;
    this.group.add(this.floor);
    // walls: one thick faceted slab per side, in a group that sinks below the floor when it would block the view
    // (it takes its fixtures, boulders and decorations with it); a low rubble rim always stays
    const sides: [number, number, number, boolean, number, [number, number]][] = [
      [0, -HALF_D - 1.8, GRID_W + 3.6, true, 1, [0, -1]],   // 0 back right (-z): thick, the loft + trophy niche
      [-HALF_W - 1.8, 0, GRID_D + 3.6, false, 1, [-1, 0]],  // 1 back left (-x): thick, the map room
      [0, HALF_D + 0.9, GRID_W + 3.6, true, -1, [0, 1]],    // 2 front left (+z)
      [HALF_W + 0.9, 0, GRID_D + 3.6, false, -1, [1, 0]],   // 3 front right (+x)
    ];
    const carve = [{ p: DOOR, r: 1.05 }, { p: PORTHOLE, r: WINDOW_R + 0.25 }, ...MOUNTS];
    const wallMat = MAT.rock();
    const SEG = 3;
    sides.forEach(([cx, cz, len, ax, inw, nrm], si) => {
      for (let k = 0; k < SEG; k++) {
        const off = (k - (SEG - 1) / 2) * (len / SEG);
        const sx = ax ? cx + off : cx, sz = ax ? cz : cz + off;
        const g = new THREE.Group();
        const thick = si < 2;
        g.add(rockSlab(sx, sz, len / SEG + 0.02, ax, inw, wallMat, thick ? { carve, T: 3.6, seg: 0.42, nook: si === 0 ? 'n' : 'w' } : { carve }));
        this.group.add(g);
        this.walls.push({ group: g, normal: new THREE.Vector2(nrm[0], nrm[1]), centre: new THREE.Vector2(Math.max(-1, Math.min(1, sx / HALF_W)), Math.max(-1, Math.min(1, sz / HALF_D))), up: 1, target: 1, lights: [] });
      }
      if (si >= 2) {
        const rim = rockSlab(ax ? cx : cx - inw * 0.25, ax ? cz - inw * 0.25 : cz, len - 0.4, ax, inw, wallMat, { H: 0.55, T: 1.3, seed: 40 + si });
        this.group.add(rim);
      }
    });
    const lens = [GRID_W + 3.6, GRID_D + 3.6, GRID_W + 3.6, GRID_D + 3.6];
    /** which wall segment a world xz belongs to (for boulders / fixtures / decorations) */
    const segOf = (x: number, z: number) => {
      const side = Math.abs(x) / HALF_W > Math.abs(z) / HALF_D ? (x < 0 ? 1 : 3) : z < 0 ? 0 : 2;
      const along = side === 0 || side === 2 ? x : z, L = lens[side];
      const k = Math.max(0, Math.min(SEG - 1, Math.floor((along + L / 2) / (L / SEG))));
      return this.walls[side * SEG + k];
    };
    const segAt = (p: THREE.Vector3) => segOf(p.x, p.z);
    this.wallFor = segAt;
    // the outcrop outside: boulders piled against the walls (they sink with their wall)
    const outM = oceanFog(retro(new THREE.MeshStandardMaterial({ map: TEX.rockOut(), roughness: 0.95, flatShading: true })), 1);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + hash2(i, 1, 3) * 0.2;
      const rx = (HALF_W + 2.4 + hash2(i, 2, 3) * 2.2) * Math.sign(Math.cos(a)) * Math.min(1, Math.abs(Math.cos(a)) * 1.6);
      const rz = (HALF_D + 2.4 + hash2(i, 3, 3) * 2.2) * Math.sign(Math.sin(a)) * Math.min(1, Math.abs(Math.sin(a)) * 1.6);
      if (rx < -HALF_W + 0.5 && rz > DOOR.z - 3.2) continue; // keep the outer hatch and the exterior camera clear
      if (rx < -HALF_W - 0.5 || rz < -HALF_D - 0.5) continue; // the thick back walls hold the nooks: no boulders in them
      const r = 1.8 + hash2(i, 4, 3) * 2.2;
      const b = boulder(r, i, outM);
      b.position.set(rx, r * 0.3, rz);
      b.rotation.y = hash2(i, 5, 3) * 6;
      segOf(rx, rz).group.add(b);
    }
    // door hatch on the -x wall
    const doorG = new THREE.Group();
    doorG.position.copy(DOOR);
    doorG.rotation.y = Math.PI / 2; // faces +x (into the room)
    const kr = new Kit();
    kr.add(MAT.brass(), new THREE.TorusGeometry(0.86, 0.11, 6, 16), 0, 0, 0.05);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; kr.sphere(MAT.brass(), 0.04, Math.cos(a) * 0.86, Math.sin(a) * 0.86, 0.15, { w: 5, h: 4 }); }
    kr.box(MAT.metal('grey'), 0.3, 0.25, 0.25, 0.97, 0, 0.0); // hinge housing
    kr.cyl(MAT.dark(), 0.78, 0.78, 0.5, 0, 0, -0.27, { rx: Math.PI / 2, seg: 16, open: true }); // dark throat
    doorG.add(kr.build());
    const membrane = waterWindow('membrane');
    const mem = new THREE.Mesh(new THREE.CircleGeometry(0.78, 20), membrane);
    mem.position.z = -0.02;
    doorG.add(mem);
    const pivot = new THREE.Group(); pivot.position.set(0.86, 0, 0.12);
    const kd = new Kit();
    kd.cyl(MAT.metal('grey'), 0.8, 0.8, 0.1, -0.86, 0, 0, { rx: Math.PI / 2, seg: 16 });
    kd.cyl(MAT.metal('grey'), 0.6, 0.6, 0.06, -0.86, 0, 0.07, { rx: Math.PI / 2, seg: 14 });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; kd.sphere(plain2(), 0.03, -0.86 + Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0.06, { w: 4, h: 3 }); }
    kd.box(MAT.brass(), 0.08, 0.08, 0.3, -0.86, 0, 0.18);
    kd.cyl(MAT.glow('#9ff0ff'), 0.12, 0.12, 0.02, -0.86, 0.48, 0.11, { rx: Math.PI / 2, seg: 10 });
    kd.add(MAT.brass(), new THREE.TorusGeometry(0.13, 0.025, 4, 10), -0.86, 0.48, 0.12);
    pivot.add(kd.build());
    const wheel = new THREE.Group(); wheel.position.set(-0.86, 0, 0.33);
    const kw = new Kit();
    kw.add(MAT.metal('red'), new THREE.TorusGeometry(0.28, 0.03, 5, 12));
    for (let i = 0; i < 3; i++) kw.box(MAT.metal('red'), 0.56, 0.035, 0.035, 0, 0, 0, { rz: (i / 3) * Math.PI });
    kw.cyl(MAT.brass(), 0.06, 0.06, 0.06, 0, 0, 0, { rx: Math.PI / 2, seg: 8 });
    wheel.add(kw.build());
    pivot.add(wheel);
    doorG.add(pivot);
    segAt(DOOR).group.add(doorG);
    this.door = { pivot, wheel, open: 0, target: 0, membrane };
    // the same hatch seen from outside, on the rock face
    const outG = new THREE.Group();
    outG.position.set(-HALF_W - 1.8 - 0.02, DOOR.y, DOOR.z);
    outG.rotation.y = -Math.PI / 2;
    const ko = new Kit();
    ko.add(MAT.brass(), new THREE.TorusGeometry(0.86, 0.13, 6, 16), 0, 0, 0.05);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ko.sphere(MAT.brass(), 0.045, Math.cos(a) * 0.86, Math.sin(a) * 0.86, 0.16, { w: 5, h: 4 }); }
    ko.cyl(MAT.metal('grey'), 0.8, 0.8, 0.1, 0, 0, 0.02, { rx: Math.PI / 2, seg: 16 });
    ko.add(MAT.metal('red'), new THREE.TorusGeometry(0.26, 0.03, 5, 12), 0, 0, 0.12);
    for (let i = 0; i < 3; i++) ko.box(MAT.metal('red'), 0.52, 0.035, 0.035, 0, 0, 0.12, { rz: (i / 3) * Math.PI });
    outG.add(ko.build());
    segAt(DOOR).group.add(outG);
    this.outerHatch = outG;
    // a doormat
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.4).rotateX(-Math.PI / 2), retro(new THREE.MeshStandardMaterial({ map: TEX.knit('#6a4a2a/#3a2a1a'), roughness: 1 })));
    mat.position.set(-HALF_W + 0.75, 0.012, DOOR.z); mat.receiveShadow = true;
    this.group.add(mat);
    // porthole on the -z wall
    const port = new THREE.Group(); port.position.copy(PORTHOLE); port.position.z += 0.05;
    const kp = new Kit();
    const WR = WINDOW_R;
    kp.add(MAT.brass(), new THREE.TorusGeometry(WR + 0.06, 0.13, 6, 20), 0, 0, 0.08);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; kp.sphere(MAT.brass(), 0.045, Math.cos(a) * (WR + 0.06), Math.sin(a) * (WR + 0.06), 0.2, { w: 5, h: 4 }); }
    // the window's iron cross-bars and a deep throat through the rock
    for (const r of [0, Math.PI / 2]) kp.box(MAT.metal('grey'), WR * 2, 0.06, 0.06, 0, 0, 0.1, { rz: r });
    kp.add(MAT.brass(), new THREE.TorusGeometry(0.16, 0.04, 4, 10), 0, 0, 0.12);
    kp.cyl(MAT.dark(), WR, WR, 1.2, 0, 0, -0.55, { rx: Math.PI / 2, seg: 16, open: true });
    port.add(kp.build());
    this.portMat = waterWindow('porthole');
    const glass = new THREE.Mesh(new THREE.CircleGeometry(WR, 22), this.portMat);
    glass.position.z = 0.06;
    port.add(glass);
    segAt(PORTHOLE).group.add(port);
    // stalactites under the overhangs (every wall)
    const sts = this.walls.map(() => new Kit());
    for (let i = 0; i < 44; i++) {
      const side = i % 4;
      const u = hash2(i, 1, 4) * 2 - 1, inset = 0.35 + hash2(i, 2, 4) * 0.3;
      const x = side === 0 || side === 2 ? u * HALF_W * 0.95 : side === 1 ? -HALF_W + inset : HALF_W - inset;
      const z = side === 1 || side === 3 ? u * HALF_D * 0.95 : side === 0 ? -HALF_D + inset : HALF_D - inset;
      const L = 0.3 + hash2(i, 3, 4) * 0.8;
      sts[this.walls.indexOf(segOf(x, z))].add(MAT.rock(), new THREE.ConeGeometry(0.08 + hash2(i, 4, 4) * 0.1, L, 5), x, WALL_H - 0.1 - L / 2 + 0.25, z, { rx: Math.PI });
    }
    sts.forEach((k, i) => this.walls[i].group.add(k.build()));
    // fairy lights strung along the back walls
    const bulbG = new THREE.SphereGeometry(0.045, 5, 4);
    const cols = ['#ffcf6a', '#ff8a5a', '#ffe9b0', '#ffb34a'];
    const addString = (_side: number, a: THREE.Vector3, b: THREE.Vector3, n: number, sag: number) => {
      let wire: THREE.Vector3[] = [];
      let seg: WallSide | null = null;
      const flush = () => { if (seg && wire.length > 1) seg.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: '#1a1410' }))); };
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * sag;
        const sg = segAt(p);
        if (sg !== seg) { if (seg) wire.push(p.clone()); flush(); wire = seg ? [wire[wire.length - 1] ?? p.clone()] : []; seg = sg; }
        wire.push(p);
        if (i % 2 === 1) { const m = new THREE.Mesh(bulbG, MAT.glow(cols[i % 4])); m.position.copy(p).add(new THREE.Vector3(0, -0.05, 0)); sg.group.add(m); this.fairy.push({ m, ph: hash2(i, n, 7) * 6 }); }
      }
      flush();
    };
    // hanging roots / vines down the walls
    const vine = retro(new THREE.MeshStandardMaterial({ map: TEX.kelp(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, color: '#7a8a5a' }));
    for (let i = 0; i < 14; i++) {
      const L = 1.2 + hash2(i, 1, 6) * 1.8;
      const g = new THREE.PlaneGeometry(0.22, L); g.translate(0, -L / 2, 0);
      const m = new THREE.Mesh(g, vine);
      const side = i % 4;
      const u = hash2(i, 2, 6) * 2 - 1;
      if ((side === 0 && nookPush('n', u * HALF_W * 0.9, 2) > 0) || (side === 1 && nookPush('w', u * HALF_D * 0.9, 2) > 0)) continue;
      if (side === 0) m.position.set(u * HALF_W * 0.9, WALL_H + 0.1, -HALF_D + 0.3);
      else if (side === 2) m.position.set(u * HALF_W * 0.9, WALL_H + 0.1, HALF_D - 0.3);
      else { m.position.set(side === 1 ? -HALF_W + 0.3 : HALF_W - 0.3, WALL_H + 0.1, u * HALF_D * 0.9); m.rotation.y = Math.PI / 2; }
      segAt(m.position).group.add(m);
    }
    // ---- lights
    this.hemi = new THREE.HemisphereLight('#2e5470', '#3a2618', 0.7);
    this.group.add(this.hemi);
    this.group.add(new THREE.AmbientLight('#22202c', 0.25));
    // cold caustic light pouring down through the opening
    this.spot = new THREE.SpotLight('#9ad0f0', 650, 0, 0.42, 0.7, 2);
    this.spot.position.set(3, 24, 6);
    this.spot.target.position.set(-0.5, 0, -0.5);
    this.spot.map = this.caustics.tex;
    this.spot.castShadow = false;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.bias = -0.0004;
    this.spot.shadow.camera.near = 10; this.spot.shadow.camera.far = 40;
    this.group.add(this.spot, this.spot.target);
    // cold light from the open water above, mostly for the outside of the outcrop
    const moon = new THREE.DirectionalLight('#8ac4e8', 1.2);
    moon.position.set(-14, 20, 6); moon.target.position.set(-6, 0, 1);
    this.group.add(moon, moon.target);
    // a soft cool fill from the porthole
    const pf = new THREE.PointLight('#5ab8ff', 2.5, 6, 1.6);
    pf.position.set(PORTHOLE.x, PORTHOLE.y - 0.3, PORTHOLE.z + 1.2);
    this.group.add(pf);
    // the TV glow (positioned by the screen)
    this.tvLight = new THREE.PointLight('#9ad8ff', 2.4, 6.5, 1.8);
    this.group.add(this.tvLight);
    // the key light: a warm, shadow-casting cone from the main lamp (handed over by the furniture)
    this.keyLamp = new THREE.SpotLight('#ffb064', 0, 0, 1.2, 0.6, 1);
    this.keyLamp.castShadow = !lowQuality;
    this.keyLamp.shadow.mapSize.set(1024, 1024);
    this.keyLamp.shadow.bias = -0.0006;
    this.keyLamp.shadow.camera.near = 0.2; this.keyLamp.shadow.camera.far = 14;
    this.group.add(this.keyLamp, this.keyLamp.target);
    // a pool of warm lights handed to lamps / stoves / stations
    for (let i = 0; i < 6; i++) { const l = new THREE.PointLight('#ffb866', 0, 6, 1.7); this.pool.push(l); this.group.add(l); }

    // build grid overlay (shown in build mode)
    const gp = new Px(GRID_W * 8, GRID_D * 8);
    for (let y = 0; y < gp.h; y++) for (let x = 0; x < gp.w; x++) {
      const ex = x % 8 === 0, ey = y % 8 === 0;
      if (ex || ey) gp.set(x, y, '#bfe6ff', (x + y) % 2 ? 210 : 120);
      else if ((x % 8 === 4 && y % 8 === 4)) gp.set(x, y, '#bfe6ff', 90);
    }
    const gt = gp.texture({ mip: false });
    this.gridMat = new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W, GRID_D).rotateX(-Math.PI / 2), this.gridMat);
    this.grid.position.y = 0.02;
    this.grid.renderOrder = 3;
    this.group.add(this.grid);
  }

  /** sink the walls that stand between the camera and the room below the floor (snap = no animation) */
  updateWalls(camPos: THREE.Vector3, target: THREE.Vector3, dt: number, allUp = false, snap = false) {
    const dx = camPos.x - target.x, dz = camPos.z - target.z, l = Math.hypot(dx, dz) || 1;
    const vx = dx / l, vz = dz / l;
    for (const w of this.walls) {
      const dn = w.normal.x * vx + w.normal.y * vz;
      const dc = w.centre.x * vx + w.centre.y * vz;
      // facing the camera, or the near end of a wall seen side-on
      const hide = dn > 0.25 || (dn > -0.5 && dc > 0.55);
      w.target = allUp || !hide ? 1 : 0;
      w.up = snap ? w.target : damp(w.up, w.target, 5, dt);
      const k = w.up;
      w.group.position.y = -(1 - k * k * (3 - 2 * k)) * (WALL_H + 2.2);
      w.group.visible = k > 0.01;
      for (const L of w.lights) L.l.intensity = L.base * k;
    }
  }

  private flick = 0;
  update(dt: number, t: number) {
    this.t = t;
    this.caustics.update(dt, t);
    this.portMat.uniforms.uTime.value = t;
    this.door.membrane.uniforms.uTime.value = t;
    // door: swing on the hinge, membrane fades in
    this.door.open = damp(this.door.open, this.door.target, 2.2, dt);
    this.door.pivot.rotation.y = this.door.open * 1.75;
    this.door.membrane.uniforms.uOpen.value = clamp01(this.door.open * 1.5);
    for (const f of this.fairy) f.m.scale.setScalar(0.85 + 0.25 * Math.sin(t * 2 + f.ph));
    this.flick += dt;
  }
}

function plain2() { return MAT.plain('#5a5a60/0.4/0.7'); }
