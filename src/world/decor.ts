// Seabed art: painted pixel textures (sand ripples, cracked rock, cross-section strata with ores and fossils),
// lumpy rock meshes, voxel coral (branching, brain, tube, fan), voxel crystal clusters like gem sprites,
// swaying kelp and anemones, harbour junk. All cached per biome so chunks just clone.
import * as THREE from 'three';
import { Px, ramp, hex, mix, pxNoise, worley, RGB } from '../gfx/px';
import { uw, UW } from '../gfx/shaders/underwater';
import { Voxels, voxelMaterial } from '../gfx/voxel';
import { Rng } from '../core/rng';
import { hash2, fbm, smooth, TAU } from '../core/math';
import type { Biome } from './biomes';

const cache = new Map<string, unknown>();
function memo<T>(k: string, f: () => T): T { if (!cache.has(k)) cache.set(k, f()); return cache.get(k) as T; }

// ------------------------------------------------------------------ textures
export function sandTex(b: Biome) {
  return memo('sand' + b.id, () => {
    const N = 128, r = ramp(b.sand, 7, 0.6);
    const p = new Px(N, N);
    const H = new Float32Array(N * N);
    p.fill((x, y) => {
      const n = pxNoise(x, y, 20, 4, 3, N);
      const rip = Math.sin((x + pxNoise(x, y, 14, 2, 8, N) * 18) * TAU / 12) * 0.5 + 0.5;
      const peb = hash2(x, y, 5);
      const [f1, , cid] = worley(x, y, 9, 2, N);
      const pebble = f1 < 1.5 && cid > 0.82;
      const shell = f1 < 1.1 && cid > 0.97;
      H[y * N + x] = rip * 0.6 + n * 0.5 + (pebble ? 0.8 : 0);
      if (shell) return hex('#f6ecdc');
      if (pebble) return r(0.25 + cid * 0.3, x, y);
      return r(0.35 + rip * 0.22 + (n - 0.5) * 0.5 + (peb > 0.97 ? 0.2 : 0), x, y);
    });
    const map = p.texture({ repeat: true });
    const nrm = Px.normalMap(N, N, (x, y) => H[y * N + x], 1.5, true);
    return { map, nrm };
  });
}

export function rockTex(b: Biome) {
  return memo('rock' + b.id, () => {
    const N = 128, r = ramp(b.rock, 7, 0.6);
    const p = new Px(N, N);
    const H = new Float32Array(N * N);
    const lichen = b.id === 'abyss' ? ['#1a3a4a', '#2aa0a0'] : b.id === 'arctic' ? ['#a0b8c8', '#dce8f0'] : ['#4a6a2a', '#8aa04a'];
    p.fill((x, y) => {
      const [f1, f2] = worley(x, y, 22, 4, N);
      const crack = f2 - f1 < 1.8;
      const n = pxNoise(x, y, 14, 4, 2, N);
      const big = pxNoise(x, y, 40, 2, 6, N);
      H[y * N + x] = (crack ? -0.6 : 0) + n * 0.8 + big * 0.5;
      const lich = pxNoise(x, y, 8, 3, 33, N) > 0.68;
      if (lich && !crack) return mix(hex(lichen[0]), hex(lichen[1]), hash2(x, y, 3)) as RGB;
      return r(0.45 + (n - 0.5) * 0.5 + (big - 0.5) * 0.4 - (crack ? 0.4 : 0) + (hash2(x, y, 7) > 0.95 ? 0.18 : 0), x, y);
    });
    const map = p.texture({ repeat: true });
    const nrm = Px.normalMap(N, N, (x, y) => H[y * N + x], 2.2, true);
    return { map, nrm };
  });
}

/** the front cross-section wall: strata bands with ores, fossils and pebbles (u repeats along x, v = depth) */
export function strataTex(b: Biome) {
  return memo('strata' + b.id, () => {
    const W = 128, H = 256;
    const p = new Px(W, H);
    const HH = new Float32Array(W * H);
    const layers = b.strata;
    const ores = ['#ff9f1c', '#2ec4b6', '#e71d36', '#b388ff', '#ffd23f', '#7bf1a8'];
    p.fill((x, y) => {
      // wavy band boundaries
      const wob = (pxNoise(x, y, 24, 2, 4, W) - 0.5) * 18;
      const d = Math.max(0, (y + wob) / H); // 0 top .. 1 deep
      const li = Math.min(layers.length - 1, Math.floor(Math.pow(d, 0.8) * layers.length * 1.05));
      const L = layers[li];
      const n = pxNoise(x, y, 6, 3, 9 + li, W);
      const [f1, f2, cid] = worley(x, y, 7 + li * 2, 5 + li, W);
      const pebbleEdge = f2 - f1 < 1.2;
      let c: RGB = mix(hex(L[0]), hex(L[1]), n);
      if (li >= 1 && cid > 0.55 && f1 < 3 + li) c = mix(c, hex(L[1]), 0.6);
      if (li >= 1 && pebbleEdge && cid > 0.55) c = mix(c, [0, 0, 0], 0.35);
      // thin dark lines between bands
      const dd = Math.pow(d, 0.8) * layers.length * 1.05;
      if (Math.abs(dd - Math.round(dd)) < 0.012 && dd > 0.5) c = mix(c, [0, 0, 0], 0.4);
      HH[y * W + x] = n * 0.4 + (pebbleEdge ? -0.4 : 0.2);
      return c;
    });
    // ore gems (2-3 px chunky gems with a highlight) and spiral fossils
    const rng = new Rng(77 + b.id.length);
    for (let i = 0; i < 40; i++) {
      const x = rng.int(2, W - 4), y = rng.int(40, H - 6);
      const col = hex(ores[rng.int(0, ores.length - 1)]);
      const s = rng.int(2, 3);
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) p.set(x + dx, y + dy, mix(col, [0, 0, 0], (dx + dy) / (s * 3)) as RGB);
      p.set(x, y, mix(col, [255, 255, 255], 0.6) as RGB);
      p.set(x - 1, y + 1, '#1a1410'); p.set(x + s, y + 1, '#1a1410');
    }
    for (let i = 0; i < 6; i++) {
      const cx = rng.int(8, W - 8), cy = rng.int(60, H - 10);
      for (let a = 0; a < 18; a += 0.25) { const rr = a * 0.28; p.set(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8, '#d8c8a8'); }
    }
    const map = p.texture({ repeat: true });
    const nrm = Px.normalMap(W, H, (x, y) => HH[y * W + x], 1.8, true);
    return { map, nrm };
  });
}

// ------------------------------------------------------------------ ground material: sand on flats, rock on slopes
export function groundMaterial(b: Biome) {
  return memo('groundMat' + b.id, () => {
    const s = sandTex(b), r = rockTex(b);
    const m = uw(new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.nrm, roughness: 0.95, normalScale: new THREE.Vector2(0.8, 0.8) }));
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, rr) => {
      prev(sh, rr);
      sh.uniforms.uRockMap = { value: r.map };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW; varying vec3 vGN;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz; vGN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uRockMap; varying vec3 vGW; varying vec3 vGN;')
        .replace('#include <map_fragment>', `
          vec4 sandC = texture2D(map, vGW.xz * 0.22);
          vec2 ruv = abs(vGN.x) > abs(vGN.z) ? vGW.zy : vGW.xy;
          vec4 rockC = texture2D(uRockMap, ruv * 0.22);
          float rk = 1.0 - smoothstep(0.55, 0.82, vGN.y);
          diffuseColor *= mix(sandC, rockC, rk);`);
    };
    return m;
  });
}

export function rockMaterial(b: Biome) {
  return memo('rockMat' + b.id, () => {
    const r = rockTex(b);
    const m = uw(new THREE.MeshStandardMaterial({ map: r.map, normalMap: r.nrm, roughness: 0.92, normalScale: new THREE.Vector2(1.2, 1.2) }));
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, rr) => {
      prev(sh, rr);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz; vRN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;')
        .replace('#include <map_fragment>', `
          vec3 bw = pow(abs(vRN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec4 tc = texture2D(map, vRW.zy * 0.3) * bw.x + texture2D(map, vRW.xz * 0.3) * bw.y + texture2D(map, vRW.xy * 0.3) * bw.z;
          // mossy/sandy tops
          diffuseColor *= tc;`);
    };
    return m;
  });
}

// ------------------------------------------------------------------ rocks
export function rockGeometry(seed: number) {
  return memo('rockGeo' + (seed % 10), () => {
    const g = new THREE.IcosahedronGeometry(1, 4);
    const p = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const s = seed % 10;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = fbm(v.x * 1.3 + s * 3.1, v.y * 1.3 + v.z * 0.9 + s, 4, s);
      const flat = v.y < -0.3 ? 0.7 + (v.y + 0.3) * 0.4 : 1; // flattened bottom
      const k = (0.78 + n * 0.45) * flat;
      // terraced facets: quantise the radius a little for a chiselled look
      const kq = Math.round(k * 14) / 14;
      v.multiplyScalar(kq * 0.7 + k * 0.3);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

// ------------------------------------------------------------------ voxel coral & crystals
export function coralGeo(b: Biome, variant: number): THREE.BufferGeometry {
  return memo(`coral${b.id}${variant}`, () => {
    const rng = new Rng(variant * 977 + b.id.length * 13);
    const pal = b.coral;
    const base = hex(pal[variant % pal.length]);
    const toInt = (c: RGB) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
    const shadeC = (k: number) => toInt([Math.min(255, base[0] * k), Math.min(255, base[1] * k), Math.min(255, base[2] * k)]);
    const kind = variant % 4;
    const V = new Voxels(26, 30, 26);
    const glow = b.glow ? 1 : 0;
    if (kind === 0) {
      // branching coral: recursive random walk branches
      const branch = (x: number, y: number, z: number, dx: number, dz: number, len: number, depth: number) => {
        for (let i = 0; i < len; i++) {
          V.set(x, y, z, shadeC(0.75 + y / 60), glow * (i === len - 1 ? 200 : 0));
          V.set(x + 1, y, z, shadeC(0.65 + y / 60));
          y++; if (rng.chance(0.35)) x += dx; if (rng.chance(0.35)) z += dz;
          if (depth < 3 && rng.chance(0.12)) branch(x, y, z, rng.sign(), rng.sign(), Math.floor(len * 0.6), depth + 1);
        }
        V.sphere(x + 0.5, y, z + 0.5, 1.3, () => shadeC(1.15));
      };
      for (let k = 0; k < 3; k++) branch(13 + rng.int(-2, 2), 0, 13 + rng.int(-2, 2), rng.sign(), rng.sign(), rng.int(10, 18), 0);
    } else if (kind === 1) {
      // brain coral: a dome with maze grooves
      V.sphere(13, 0, 13, 9, (x, y, z) => {
        const g = Math.sin(x * 0.9 + Math.sin(z * 0.7) * 2) * Math.sin(z * 0.8 + Math.cos(x * 0.6) * 2);
        return y < 0 ? -1 : g > 0.2 ? shadeC(1.05) : shadeC(0.78);
      });
    } else if (kind === 2) {
      // tube coral: a cluster of hollow pipes with bright rims
      for (let t = 0; t < 7; t++) {
        const cx = 13 + rng.int(-7, 7), cz = 13 + rng.int(-7, 7), h = rng.int(6, 20), r = rng.int(1, 2);
        for (let y = 0; y < h; y++) for (let a = 0; a < 16; a++) {
          const x = Math.round(cx + Math.cos((a / 16) * TAU) * r), z = Math.round(cz + Math.sin((a / 16) * TAU) * r);
          V.set(x, y, z, y > h - 2 ? shadeC(1.35) : shadeC(0.7 + (y / h) * 0.4), y > h - 2 ? glow * 255 : 0);
        }
      }
    } else {
      // sea fan: a flat lattice
      for (let i = 0; i < 260; i++) {
        const a = rng.range(-1.2, 1.2), rr = rng.range(0, 13);
        const x = Math.round(13 + Math.sin(a) * rr), y = Math.round(Math.cos(a) * rr * 1.4);
        if (y < 0) continue;
        V.set(x, y, 13, shadeC(0.8 + rr / 30));
        if (rng.chance(0.4)) V.set(x, y, 12, shadeC(0.7));
      }
      for (let y = 0; y < 4; y++) V.set(13, y, 13, shadeC(0.6));
    }
    return V.mesh(0.07);
  });
}

export function crystalGeo(b: Biome, variant: number): THREE.BufferGeometry {
  return memo(`crystal${b.id}${variant}`, () => {
    const rng = new Rng(variant * 331 + 5);
    const cols = b.id === 'arctic' ? ['#9fe8ff', '#d8f8ff'] : b.id === 'abyss' ? ['#c06cff', '#7cf8ff'] : [['#ff4a6a', '#ffd23f'], ['#5cff8a', '#2ec4b6'], ['#b388ff', '#ff9ef0']][variant % 3];
    const [c1, c2] = cols as string[];
    const toInt = (s: string) => parseInt(s.slice(1), 16);
    const V = new Voxels(18, 24, 18);
    // rocky base
    V.sphere(9, 0, 9, 4, (x, y) => (y < 0 ? -1 : toInt(b.rock[1])));
    for (let k = 0; k < 5; k++) {
      const ax = rng.range(-0.5, 0.5), az = rng.range(-0.5, 0.5), len = rng.int(7, 18), w = rng.range(1.2, 2.2);
      const x0 = 9 + rng.int(-2, 2), z0 = 9 + rng.int(-2, 2);
      for (let i = 0; i < len; i++) {
        const taper = i > len - 4 ? (len - i) / 4 : 1;
        const cx = x0 + ax * i, cz = z0 + az * i;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > w * taper) continue;
          const lit = dx < 0 || dz < 0;
          V.set(Math.round(cx + dx), i + 2, Math.round(cz + dz), toInt(lit ? c2 : c1), 140);
        }
      }
    }
    return V.mesh(0.06);
  });
}

// ------------------------------------------------------------------ kelp + anemones (shader sway)
export function kelpMaterial(b: Biome) {
  return memo('kelpMat' + b.id, () => {
    const p = new Px(32, 128);
    const r = ramp(b.kelpCol, 6, 0.6);
    p.fill((x, y) => {
      const edge = Math.abs(x - 16) / 16;
      const wav = Math.sin(y * 0.4) * 0.12;
      if (edge > 0.85 + wav) return null;
      const vein = Math.abs(x - 16) < 1 ? 0.25 : 0;
      const bladder = (y % 32) > 26 && edge < 0.3 ? 0.35 : 0;
      return r(0.6 - edge * 0.4 + vein + bladder + (hash2(x, y, 4) - 0.5) * 0.2, x, y);
    });
    const map = p.texture({ repeat: true });
    const m = uw(new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }), { sss: [0.6, 0.9, 0.3], sssK: 0.6 });
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, rr) => {
      prev(sh, rr);
      sh.uniforms.uKT = UW.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uKT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            float h = position.y;
            vec4 wp0 = vec4(0.0, 0.0, 0.0, 1.0);
            #ifdef USE_INSTANCING
              wp0 = instanceMatrix * wp0;
            #endif
            float ph = wp0.x * 0.37 + wp0.z * 0.21;
            float k = h * h * 0.012;
            transformed.x += sin(uKT * 0.9 + ph + h * 0.25) * k + sin(uKT * 2.1 + ph * 2.0 + h * 0.6) * k * 0.15;
            transformed.z += cos(uKT * 0.7 + ph) * k * 0.4;
          }`);
    };
    m.customProgramCacheKey = () => 'kelp';
    return m;
  });
}
export function kelpGeometry() {
  return memo('kelpGeo', () => {
    // two crossed blade strips with a gentle S-curve so a stalk has volume from any angle
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 2; k++) {
      const g = new THREE.PlaneGeometry(1.05, 10, 2, 30);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 5; p.setX(i, p.getX(i) * (0.55 + 0.45 * Math.sin(Math.min(1, y / 1.5) * 1.57)) + Math.sin(y * 0.45 + k) * 0.25); p.setY(i, y); }
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 4);
      g.rotateY(k * Math.PI / 2);
      parts.push(g);
    }
    const pos: number[] = [], uvs: number[] = [], nor: number[] = [], idx: number[] = [];
    let off = 0;
    for (const g of parts) {
      pos.push(...(g.attributes.position.array as Float32Array)); uvs.push(...(g.attributes.uv.array as Float32Array)); nor.push(...(g.attributes.normal.array as Float32Array));
      idx.push(...Array.from(g.index!.array as Uint16Array, (v) => v + off)); off += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setIndex(idx);
    return out;
  });
}

export function anemoneGeo(b: Biome, variant: number) {
  return memo(`anem${b.id}${variant}`, () => {
    const rng = new Rng(variant * 71 + 3);
    const col = hex(b.coral[(variant + 2) % b.coral.length]);
    const toInt = (c: RGB) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
    const V = new Voxels(20, 16, 20);
    V.sphere(10, 0, 10, 3.5, (x, y) => (y < 0 ? -1 : toInt(mix(col, [40, 20, 30], 0.4) as RGB)));
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, TAU), rr = rng.range(1, 3.5), len = rng.int(4, 9);
      let x = 10 + Math.cos(a) * rr, z = 10 + Math.sin(a) * rr;
      for (let y = 2; y < 2 + len; y++) {
        x += Math.cos(a) * 0.35; z += Math.sin(a) * 0.35;
        V.set(x, y, z, toInt(mix(col, [255, 255, 255], y === 1 + len ? 0.5 : (y - 2) / len * 0.3) as RGB), b.glow && y === 1 + len ? 255 : 0);
      }
    }
    return V.mesh(0.05);
  });
}

export function swayVoxelMaterial(b: Biome, amp = 0.05) {
  return memo('swayVox' + b.id + amp, () => {
    const m = uw(voxelMaterial({ roughness: 0.6 }), { sss: [1, 0.6, 0.6], sssK: 0.35 });
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, rr) => {
      prev(sh, rr);
      sh.uniforms.uKT = UW.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uKT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          { vec4 o = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0); float h = max(0.0, position.y);
            transformed.x += sin(uKT * 1.3 + o.x * 0.7 + h * 3.0) * h * ${amp.toFixed(3)} * 3.0;
            transformed.z += cos(uKT * 1.1 + o.x * 0.4) * h * ${amp.toFixed(3)}; }`);
    };
    m.customProgramCacheKey = () => 'swayvox' + amp;
    return m;
  });
}
export function staticVoxelMaterial() { return memo('statVox', () => uw(voxelMaterial({ roughness: 0.55 }), { sss: [0.8, 0.8, 1], sssK: 0.2 })); }

// ------------------------------------------------------------------ harbour junk
export function junkObject(kind: number, b: Biome): THREE.Object3D {
  const k = kind % 4;
  if (k === 0) {
    const t = memo('tyreMat', () => {
      const p = new Px(64, 16); const r = ramp(['#141414', '#262626', '#3a3a3a'], 3);
      p.fill((x, y) => r(0.5 + ((x + y * 2) % 6 < 2 ? 0.3 : 0) + (hash2(x, y, 2) - 0.5) * 0.2, x, y));
      return uw(new THREE.MeshStandardMaterial({ map: p.texture({ repeat: true }), roughness: 0.9 }));
    });
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.17, 12, 24), t);
    m.rotation.set(1.2, 0.3, 0.2); m.position.y = 0.18;
    return m;
  }
  if (k === 1) {
    // a glass bottle
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) { const y = i / 16 * 0.6; const r = y < 0.38 ? 0.11 : y < 0.48 ? 0.11 - (y - 0.38) * 0.75 : 0.035; pts.push(new THREE.Vector2(r, y)); }
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), uw(new THREE.MeshPhysicalMaterial({ color: b.id === 'harbor' ? '#3a7a3a' : '#7a5a2a', roughness: 0.1, metalness: 0, clearcoat: 1, emissive: '#102010', emissiveIntensity: 0.3 }), { rim: 0.6 }));
    m.rotation.z = 1.4; m.position.y = 0.1;
    return m;
  }
  if (k === 2) {
    // a voxel crate
    const V = new Voxels(12, 12, 12);
    for (let y = 0; y < 12; y++) for (let z = 0; z < 12; z++) for (let x = 0; x < 12; x++) {
      const edge = Number(x === 0 || x === 11) + Number(y === 0 || y === 11) + Number(z === 0 || z === 11);
      if (!edge) continue;
      const plank = (y % 4 === 0) ? 0x5a3a1e : 0x8a5e32;
      V.set(x, y, z, edge >= 2 ? 0x3a2410 : plank);
    }
    const m = new THREE.Mesh(V.mesh(0.07), staticVoxelMaterial());
    m.rotation.set(0.2, 0.6, 0.15);
    return m;
  }
  // an anchor with a rusty chain stub
  const g = new THREE.Group();
  const mat = uw(new THREE.MeshStandardMaterial({ color: '#5a3a28', metalness: 0.6, roughness: 0.7 }));
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), mat); shank.position.y = 0.55;
  const arms = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 8, 16, Math.PI), mat); arms.rotation.z = Math.PI; arms.position.y = 0.2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12), mat); ring.position.y = 1.15;
  g.add(shank, arms, ring);
  g.rotation.z = 0.9;
  return g;
}

export { smooth };
