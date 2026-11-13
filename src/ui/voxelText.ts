// Pixel-font text extruded into chunky voxels: every pixel of the rendered (outlined, gradient-filled) word
// becomes a voxel column, so titles are real lit 3D objects with crisp pixel edges.
import * as THREE from 'three';
import { textCanvas, TextStyle } from './text';
import { Voxels, voxelMaterial } from '../gfx/voxel';

export function voxelText(text: string, st: TextStyle, height = 1, depth = 3): THREE.Mesh {
  const c = textCanvas(text, { ...st, shadow: undefined });
  const ctx = c.canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.w, c.h).data;
  const V = new Voxels(c.w, c.h, depth + 1);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const i = (y * c.w + x) * 4;
    if (img[i + 3] < 128) continue;
    const col = (img[i] << 16) | (img[i + 1] << 8) | img[i + 2];
    const lum = (img[i] * 0.3 + img[i + 1] * 0.59 + img[i + 2] * 0.11) / 255;
    // outline pixels sit one voxel deeper so the fill letters stand proud of their outline
    const d = lum < 0.25 ? depth - 1 : depth;
    for (let z = 0; z < d; z++) V.set(x, c.h - 1 - y, z, col, lum > 0.85 ? 40 : 0);
  }
  const s = (height / (st.px * 1.15)) ;
  const geo = V.mesh(s);
  geo.center();
  const m = new THREE.Mesh(geo, voxelMaterial({ roughness: 0.45, metalness: 0.15 }));
  m.castShadow = true;
  return m;
}
