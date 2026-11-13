// Blueprint line art: the actual 3D model of a blueprint, projected in a 3/4 view and drawn as crisp white
// technical lines on transparent pixels — z-buffered so visible edges are solid and hidden edges dotted, with a
// faint face tint for volume, a ground shadow and dimension ticks. Used by the build cards and the plan sheet.
//
//   blueprintArt('sofa', 64, 44)  -> canvas (cached)
import * as THREE from 'three';
import { buildProp } from './models';
import { BLUEPRINTS } from './blueprints';

const cache = new Map<string, HTMLCanvasElement>();

export function blueprintArt(id: string, W: number, H: number, o: { yaw?: number; pitch?: number; dims?: boolean } = {}): HTMLCanvasElement {
  const key = `${id}|${W}|${H}|${o.yaw ?? ''}|${o.dims ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const prop = buildProp(id);
  prop.group.updateMatrixWorld(true);
  const yaw = o.yaw ?? -0.62, pitch = o.pitch ?? 0.5;
  const rot = new THREE.Matrix4().makeRotationX(pitch).multiply(new THREE.Matrix4().makeRotationY(yaw));
  // collect triangles + feature edges in view space
  const tris: number[] = []; const edges: number[] = [];
  const v = new THREE.Vector3();
  prop.group.traverse((ob) => {
    const m = ob as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const mat = m.material as THREE.Material & { opacity?: number; transparent?: boolean };
    if (mat.transparent && (mat.opacity ?? 1) < 0.5) return;
    const g = m.geometry as THREE.BufferGeometry;
    const P = g.attributes.position as THREE.BufferAttribute;
    const mw = new THREE.Matrix4().multiplyMatrices(rot, m.matrixWorld);
    const idx = g.index;
    const n = idx ? idx.count : P.count;
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, idx ? idx.getX(i) : i).applyMatrix4(mw); tris.push(v.x, v.y, v.z); }
    const eg = new THREE.EdgesGeometry(g, 28);
    const E = eg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < E.count; i++) { v.fromBufferAttribute(E, i).applyMatrix4(mw); edges.push(v.x, v.y, v.z); }
    eg.dispose();
  });
  // fit
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < tris.length; i += 3) { x0 = Math.min(x0, tris[i]); x1 = Math.max(x1, tris[i]); y0 = Math.min(y0, tris[i + 1]); y1 = Math.max(y1, tris[i + 1]); }
  if (!isFinite(x0)) { x0 = -1; x1 = 1; y0 = -1; y1 = 1; }
  const m = 4;
  const s = Math.min((W - m * 2) / (x1 - x0 || 1), (H - m * 2 - 2) / (y1 - y0 || 1));
  const ox = (W - (x1 - x0) * s) / 2 - x0 * s, oy = (H - (y1 - y0) * s) / 2 + y1 * s - 1;
  const SX = (x: number) => x * s + ox, SY = (y: number) => -y * s + oy;
  // z-buffer + face shade
  const Z = new Float32Array(W * H).fill(-Infinity);
  const shadeBuf = new Float32Array(W * H);
  for (let i = 0; i < tris.length; i += 9) {
    const ax = SX(tris[i]), ay = SY(tris[i + 1]), az = tris[i + 2];
    const bx = SX(tris[i + 3]), by = SY(tris[i + 4]), bz = tris[i + 5];
    const cx = SX(tris[i + 6]), cy = SY(tris[i + 7]), cz = tris[i + 8];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-6) continue;
    // face normal (view space) for a little tone
    const ux = tris[i + 3] - tris[i], uy = tris[i + 4] - tris[i + 1], uz = tris[i + 5] - tris[i + 2];
    const wx = tris[i + 6] - tris[i], wy = tris[i + 7] - tris[i + 1], wz = tris[i + 8] - tris[i + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const tone = 0.35 + 0.65 * Math.max(0, ny * 0.7 + Math.abs(nz) * 0.3 - nx * 0.2);
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.01 || w1 < -0.01 || w2 < -0.01) continue;
      const z = w0 * az + w1 * bz + w2 * cz;
      const j = y * W + x;
      if (z > Z[j]) { Z[j] = z; shadeBuf[j] = tone; }
    }
  }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const D = img.data;
  const put = (x: number, y: number, r: number, g: number, b: number, a: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const j = (y * W + x) * 4; if (D[j + 3] > a) return; D[j] = r; D[j + 1] = g; D[j + 2] = b; D[j + 3] = a; };
  // faint fills, banded
  for (let j = 0; j < W * H; j++) if (Z[j] > -Infinity) { const q = Math.round(shadeBuf[j] * 3) / 3; D[j * 4] = 180; D[j * 4 + 1] = 220; D[j * 4 + 2] = 255; D[j * 4 + 3] = 22 + q * 40; }
  // edges, depth-tested (visible solid, hidden dotted)
  for (let i = 0; i < edges.length; i += 6) {
    let xa = SX(edges[i]), ya = SY(edges[i + 1]); const za = edges[i + 2];
    const xb = SX(edges[i + 3]), yb = SY(edges[i + 4]), zb = edges[i + 5];
    const n = Math.ceil(Math.max(Math.abs(xb - xa), Math.abs(yb - ya))) + 1;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = Math.floor(xa + (xb - xa) * t), y = Math.floor(ya + (yb - ya) * t), z = za + (zb - za) * t;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const vis = z >= Z[y * W + x] - 0.04;
      if (vis) put(x, y, 236, 248, 255, 255);
      else if ((x + y) % 3 === 0) put(x, y, 150, 200, 240, 120);
    }
    void xa; xa = 0;
  }
  // silhouette outline (coverage boundary)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const j = y * W + x; if (Z[j] === -Infinity) continue;
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || Z[j - 1] === -Infinity || Z[j + 1] === -Infinity || Z[j - W] === -Infinity || Z[j + W] === -Infinity;
    if (edge) put(x, y, 255, 255, 255, 255);
  }
  ctx.putImageData(img, 0, 0);
  // dimension ticks along the bottom: footprint in cells
  if (o.dims !== false) {
    const bp = BLUEPRINTS[id];
    if (bp) {
      ctx.fillStyle = 'rgba(200,232,255,0.9)';
      const yb = H - 2;
      ctx.fillRect(m, yb, W - m * 2, 1);
      ctx.fillRect(m, yb - 2, 1, 3); ctx.fillRect(W - m - 1, yb - 2, 1, 3);
      for (let i = 1; i < bp.size[0]; i++) ctx.fillRect(Math.round(m + ((W - m * 2) * i) / bp.size[0]), yb - 1, 1, 2);
    }
  }
  cache.set(key, cv);
  return cv;
}
