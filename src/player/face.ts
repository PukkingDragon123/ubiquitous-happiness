// The blobfish's painted pixel face (PS1 style: expressions are texture swaps, like Mega Man Legends faces).
// An 80 x 56 canvas mapped onto a decal that wraps the front of the head: two big glossy eyes with lids and
// lashes, chunky brows, the wide blobfish mouth under the nose, dithered blush, and little extras (sweat
// drops, tears, sparkles, an anger cross). Redrawn only when the expression, gaze or blink changes.
import * as THREE from 'three';
import { Px, hex, mix, bayer, type RGB } from '../gfx/px';

export const FW = 80, FH = 56;
/** face projection: yaw +-TH degrees across the canvas, pitch PT (top row) .. PB (bottom row) */
export const TH = 80, PT = 48, PB = -58;
export const faceDeg = (x: number, y: number) => ({ th: ((x + 0.5) / FW - 0.5) * 2 * TH, ph: PT - ((y + 0.5) / FH) * (PT - PB) });

type EyeKind = 'open' | 'wide' | 'happy' | 'closed' | 'x' | 'squeeze' | 'swirl' | 'star';
type MouthKind = 'line' | 'smile' | 'open' | 'shout' | 'wavy' | 'smirk' | 'o' | 'grin';
export interface Face {
  eye: EyeKind; lid: number; tilt: number; low: number;
  brow: number; browTilt: number;
  mouth: MouthKind; curve: number; open: number;
  blush: number; extra?: 'sweat' | 'tear' | 'sparkle' | 'anger' | 'zzz';
  pupil?: number;
}

export const FACES: Record<string, Face> = {
  brave: { eye: 'open', lid: 0.16, tilt: 0.35, low: 0.1, brow: 0, browTilt: 0.55, mouth: 'line', curve: -0.45, open: 0, blush: 0.7 },
  cool: { eye: 'open', lid: 0.42, tilt: 0.15, low: 0.18, brow: 0, browTilt: 0.35, mouth: 'smirk', curve: 0.3, open: 0, blush: 0.4 },
  happy: { eye: 'happy', lid: 0, tilt: 0, low: 0, brow: 1, browTilt: -0.3, mouth: 'smile', curve: 1, open: 0.35, blush: 1 },
  cheer: { eye: 'star', lid: 0, tilt: 0, low: 0, brow: 2, browTilt: -0.4, mouth: 'smile', curve: 1, open: 0.8, blush: 1, extra: 'sparkle' },
  attack: { eye: 'open', lid: 0.34, tilt: 1, low: 0.25, brow: -1, browTilt: 1.3, mouth: 'shout', curve: -0.2, open: 0.6, blush: 0.5, extra: 'anger', pupil: 0.85 },
  hurt: { eye: 'squeeze', lid: 0, tilt: 0, low: 0, brow: 0, browTilt: -0.9, mouth: 'wavy', curve: -0.6, open: 0.45, blush: 0.4, extra: 'tear' },
  strain: { eye: 'open', lid: 0.6, tilt: 0.9, low: 0.35, brow: -1, browTilt: 1.1, mouth: 'grin', curve: -0.3, open: 0.3, blush: 0.8, extra: 'sweat', pupil: 0.8 },
  scared: { eye: 'wide', lid: 0, tilt: -0.5, low: 0, brow: 2, browTilt: -1, mouth: 'o', curve: -0.5, open: 0.5, blush: 0.2, extra: 'sweat', pupil: 0.6 },
  chomp: { eye: 'open', lid: 0.15, tilt: 0.2, low: 0.1, brow: 1, browTilt: 0, mouth: 'open', curve: 0.2, open: 1, blush: 0.8, pupil: 1.15 },
  dizzy: { eye: 'swirl', lid: 0, tilt: 0, low: 0, brow: 1, browTilt: -0.5, mouth: 'wavy', curve: -0.3, open: 0.15, blush: 0.5 },
  sad: { eye: 'open', lid: 0.35, tilt: -0.8, low: 0.15, brow: 1, browTilt: -1.1, mouth: 'line', curve: -1, open: 0, blush: 0.4, extra: 'tear', pupil: 1.2 },
  sleep: { eye: 'closed', lid: 1, tilt: 0, low: 0, brow: 0, browTilt: 0, mouth: 'line', curve: 0.1, open: 0, blush: 0.7, extra: 'zzz' },
  dead: { eye: 'x', lid: 0, tilt: 0, low: 0, brow: 0, browTilt: -0.3, mouth: 'wavy', curve: -0.5, open: 0.3, blush: 0 },
  focus: { eye: 'open', lid: 0.3, tilt: 0.6, low: 0.2, brow: -1, browTilt: 0.9, mouth: 'o', curve: 0, open: 0.25, blush: 0.6, pupil: 0.9 },
};

const OUT = hex('#3a0c22'), LASH = hex('#2a0616'), SCL = hex('#fbf6f2'), SCL2 = hex('#d8c8d6');
const IRIS0 = hex('#14040c'), IRIS1 = hex('#4a1a34'), IRIS2 = hex('#8a3a5e');
const SKIN = hex('#eb93a8'), SKIN2 = hex('#d27390'), BROW = hex('#8a2a4c'), BROW2 = hex('#5a1430');
const LIP = hex('#7a1e3c'), MOUTH_IN = hex('#3a0814'), TONGUE = hex('#ff7a92'), BLUSH = hex('#ff5a82');

export class FacePainter {
  px = new Px(FW, FH);
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  private key = '';
  private ctx: CanvasRenderingContext2D;
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = FW; this.canvas.height = FH;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
  }

  /** draw a face; lx, ly: gaze -1..1; blink 0..1 */
  draw(name: string, lx: number, ly: number, blink: number, time: number) {
    const f = FACES[name] ?? FACES.brave;
    const gx = Math.round(Math.max(-1, Math.min(1, lx)) * 2), gy = Math.round(Math.max(-1, Math.min(1, -ly)) * 1.5);
    const bl = blink > 0.5 && (f.eye === 'open' || f.eye === 'wide');
    const anim = f.extra === 'sparkle' || f.extra === 'zzz' || f.eye === 'swirl' ? Math.floor(time * 6) % 4 : 0;
    const key = `${name}|${gx}|${gy}|${bl ? 1 : 0}|${anim}`;
    if (key === this.key) return false;
    this.key = key;
    const p = this.px;
    p.d.fill(0);
    // blush first (under everything)
    if (f.blush > 0) for (const s of [-1, 1]) {
      const cx = 40 + s * 23, cy = 29;
      for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 6; x <= cx + 6; x++) {
        const d = ((x + 0.5 - cx) / 6) ** 2 + ((y + 0.5 - cy) / 3.2) ** 2;
        if (d < 1 && (1 - d) * f.blush * 1.3 > bayer(x, y)) p.set(x, y, mix(BLUSH, SKIN, 0.25 + d * 0.3));
      }
      // blush hatching, the classic anime cheek lines
      if (f.blush > 0.75) for (let k = 0; k < 3; k++) p.set(cx - 2 + k * 2, cy - 1, mix(BLUSH, LIP, 0.4));
    }
    for (const s of [-1, 1]) this.eye(f, s, bl ? 'closed' : f.eye, gx, gy, anim);
    this.mouth(f);
    this.extras(f, anim);
    const img = this.ctx.createImageData(FW, FH);
    img.data.set(p.d);
    this.ctx.putImageData(img, 0, 0);
    this.tex.needsUpdate = true;
    return true;
  }

  private eye(f: Face, s: number, kind: EyeKind, gx: number, gy: number, anim: number) {
    const p = this.px;
    const cx = 40 + s * 14, cy = 17;
    const rx = kind === 'wide' ? 7 : 6.2, ry = kind === 'wide' ? 8 : 7.4;
    const inner = -s; // direction toward the face centre
    // brows (drawn for every eye kind)
    {
      const by = cy - ry - 4 - f.brow * 1.5;
      const x0 = cx + inner * 6, x1 = cx - inner * 5;
      const y0 = by + f.browTilt * 2.2, y1 = by - f.browTilt * 1.6 + 1;
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * -1.2);
        p.set(x, y, BROW); p.set(x, y + 1, BROW2);
        if (t > 0.15 && t < 0.8) p.set(x, y - 1, BROW);
      }
    }
    if (kind === 'happy') {
      // ^ ^ arcs
      for (let k = -5; k <= 5; k++) { const y = Math.round(cy + 1 - Math.sqrt(Math.max(0, 25 - k * k)) * 0.8); p.set(cx + k, y, LASH); p.set(cx + k, y + 1, OUT); }
      return;
    }
    if (kind === 'closed') {
      for (let k = -5; k <= 5; k++) { const y = Math.round(cy + 1 + Math.sqrt(Math.max(0, 25 - k * k)) * 0.45); p.set(cx + k, y, LASH); if (Math.abs(k) < 4) p.set(cx + k, y + 1, OUT); }
      p.set(cx - s * 6, cy + 1, LASH); // lash flick at the outer corner
      return;
    }
    if (kind === 'squeeze') {
      // > <
      for (let k = 0; k <= 5; k++) { p.set(cx + inner * (k - 3), cy - 3 + k, LASH); p.set(cx + inner * (k - 3), cy + 3 - k + 1, LASH); p.set(cx + inner * (k - 3) - inner, cy - 3 + k, OUT); }
      return;
    }
    if (kind === 'x') {
      for (let k = -4; k <= 4; k++) { p.set(cx + k, cy + k, LASH); p.set(cx + k, cy - k, LASH); p.set(cx + k + 1, cy + k, OUT); p.set(cx + k + 1, cy - k, OUT); }
      return;
    }
    // sclera
    p.ellipse(cx, cy, rx + 1, ry + 1, OUT);
    p.ellipse(cx, cy, rx, ry, (nx, ny) => (ny > 0.55 || nx * -s > 0.7 ? SCL2 : SCL));
    if (kind === 'swirl') {
      for (let k = 0; k < 26; k++) { const a = k * 0.55 + anim * 1.5, r = k * 0.19; p.set(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), LASH); }
    } else {
      // iris: dark glossy disc with a lighter lower crescent, a pupil, catchlights
      const pr = (kind === 'wide' ? 2.8 : 4.3) * (f.pupil ?? 1);
      const ix = cx + gx, iy = cy + gy + 0.5;
      p.ellipse(ix, iy, pr, pr * 1.12, (nx, ny) => (ny > 0.35 ? IRIS2 : ny > -0.2 ? IRIS1 : IRIS0));
      p.ellipse(ix, iy - 0.3, pr * 0.5, pr * 0.55, IRIS0);
      if (kind === 'star') {
        // star-shaped sparkle pupils for cheering
        const c: RGB = [255, 240, 150];
        p.set(ix, iy - 2, c); p.set(ix, iy + 1, c); p.set(ix - 1, iy, c); p.set(ix + 1, iy, c); p.set(ix, iy, [255, 255, 255]); p.set(ix, iy - 1, c);
        p.set(ix - 2, iy - 2, anim & 1 ? c : IRIS1); p.set(ix + 2, iy + 1, anim & 1 ? IRIS1 : c);
      } else {
        p.rect(Math.round(ix - pr * 0.55), Math.round(iy - pr * 0.75), 2, 2, '#ffffff');
        p.set(Math.round(ix + pr * 0.5), Math.round(iy + pr * 0.45), '#ffe8f0');
      }
    }
    // upper lid (skin), with the lash line along its edge; tilt drops the inner corner (angry) or outer (sad)
    const top = cy - ry - 1;
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const k = (x + 0.5 - cx) / rx;
      const edge = top + f.lid * (2 * ry + 1) + f.tilt * k * inner * 2.6 + Math.abs(k) * 0.6;
      let lashed = false;
      for (let y = top - 1; y <= cy + ry + 1; y++) {
        if (!p.alpha(x, y)) continue;
        if (y < edge) p.set(x, y, y < edge - 1 ? SKIN : SKIN2);
        else if (!lashed) { p.set(x, y, LASH); if (f.lid > 0.05 || Math.abs(k) > 0.4) p.set(x, y - 1, LASH); lashed = true; }
      }
      // lower lid
      if (f.low > 0) {
        const le = cy + ry + 1 - f.low * ry * 1.4 + Math.abs(k) * 1.2;
        for (let y = Math.ceil(le); y <= cy + ry + 1; y++) if (p.alpha(x, y)) p.set(x, y, y <= le + 1 ? SKIN2 : SKIN);
      }
    }
    // a little lash flick at the outer corner
    p.set(cx - inner * (rx + 1), cy - ry + 1 + f.lid * 3, LASH); p.set(cx - inner * (rx + 2), cy - ry + f.lid * 3, LASH);
  }

  private mouth(f: Face) {
    const p = this.px;
    const cx = 40, cy = 44, hw = 15;
    const lipY = (x: number) => { const k = (x - cx) / hw; return cy - f.curve * 4 * (k * k) + f.curve * 1.2; };
    const thick = (x: number) => (Math.abs(x - cx) < hw - 3 ? 2 : 1);
    if (f.mouth === 'o') {
      const r = 2 + f.open * 2.5;
      p.ellipse(cx + 6, cy - 1, r + 1, r * 1.2 + 1, LIP); p.ellipse(cx + 6, cy - 1, r, r * 1.2, MOUTH_IN);
      return;
    }
    if (f.mouth === 'open' || f.mouth === 'shout' || (f.mouth === 'smile' && f.open > 0.1)) {
      // a lens between the upper lip curve and a sagging lower lip, dark inside with a tongue
      const depth = 2 + f.open * 6;
      for (let x = cx - hw; x <= cx + hw; x++) {
        const k = (x - cx) / hw, yU = Math.round(lipY(x) - (f.mouth === 'shout' ? 1.5 * (1 - k * k) : 0));
        const yL = Math.round(lipY(x) + depth * Math.sqrt(Math.max(0, 1 - k * k)) * (f.mouth === 'smile' ? 0.9 : 1));
        for (let y = yU; y <= yL; y++) p.set(x, y, y > yL - 2 && Math.abs(k) < 0.5 ? TONGUE : MOUTH_IN);
        p.set(x, yU - 1, LIP); p.set(x, yU, LIP); p.set(x, yL + 1, LIP);
        if (f.mouth === 'shout' && Math.abs(k) < 0.7 && (x & 1) === 0) p.set(x, yU + 1, '#fff4ea'); // tiny gummy teeth
      }
      return;
    }
    for (let x = cx - hw; x <= cx + hw; x++) {
      let y = lipY(x);
      if (f.mouth === 'wavy') y += Math.sin((x - cx) * 0.9) * 1.2;
      if (f.mouth === 'smirk') { const k = (x - cx) / hw; y = cy - 0.5 + (k > 0 ? -k * k * 4 : k * k * 1.5); }
      if (f.mouth === 'grin') y = cy + Math.sin((x - cx) * 1.1) * 0.8;
      const yi = Math.round(y);
      for (let t = 0; t < thick(x); t++) p.set(x, yi + t, LIP);
    }
    // dimples at the corners
    const kc = f.mouth === 'smirk' ? -4 : -f.curve * 2.8;
    p.set(cx - hw - 1, Math.round(lipY(cx - hw) + kc * 0.3), LIP);
    p.set(cx + hw + 1, Math.round(lipY(cx + hw) + kc * 0.3 - (f.mouth === 'smirk' ? 2 : 0)), LIP);
  }

  private extras(f: Face, anim: number) {
    const p = this.px;
    if (f.extra === 'sweat') {
      const x = 66, y = 6;
      p.set(x, y, '#bff0ff'); p.rect(x - 1, y + 1, 3, 2, '#7fd4ff'); p.rect(x - 1, y + 3, 3, 1, '#3a8ac8'); p.set(x - 1, y + 1, '#ffffff');
      p.set(x - 2, y + 2, '#1a4a7a'); p.set(x + 2, y + 2, '#1a4a7a'); p.set(x, y - 1, '#1a4a7a');
    }
    if (f.extra === 'tear') for (const s of [-1, 1]) {
      const x = 40 + s * 14 + s * 4, y = 26;
      p.rect(x, y, 1, 3, '#7fd4ff'); p.set(x, y + 3, '#3a8ac8'); p.set(x, y, '#ffffff');
    }
    if (f.extra === 'anger') {
      const x = 67, y = 5, c = '#ff2a4a';
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [3, 0], [4, 0], [4, 1], [0, 3], [0, 4], [1, 4], [4, 3], [4, 4], [3, 4]]) p.set(x + dx, y + dy, c);
    }
    if (f.extra === 'sparkle') for (const [x, y, ph] of [[8, 6, 0], [72, 10, 2], [70, 40, 1], [10, 38, 3]]) {
      const on = (anim + ph) % 4 < 2;
      const c: RGB = [255, 246, 190];
      p.set(x, y, c); if (on) { p.set(x - 1, y, c); p.set(x + 1, y, c); p.set(x, y - 1, c); p.set(x, y + 1, c); }
    }
  }
}
