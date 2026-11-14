// Pixel-font text, rendered crisp: drawn at the font's native pixel size into a canvas (with a stepped
// outline + drop shadow drawn pixel by pixel, never anti-aliased), then shown via nearest-filtered textures.
//
//   textCanvas('SNAP!', STYLES.shout) -> { canvas, w, h }        (native pixels)
//   textSprite('Laser Eyes', STYLES.item, 0.5)                    a THREE.Sprite, world height 0.5
//   floatText.pop('YOINK!', x, y, 'shout')                        an animated floating word in the world
//
// Fonts (all bundled in public/fonts, see CREDITS.md), always at their TRUE native px (see ui/pixel/font.ts):
//   Alagard 16 (Hewett Tsoi) – titles, numbers, item names; Goofy (TBME Goofy, from Chewy, Apache-2.0) – exclamations;
//   m6x11plus 18 (Daniel Linssen) – body, hints; m5x7 16 (Daniel Linssen) – small labels.
import * as THREE from 'three';
import { easeOutBack, clamp01 } from '../core/math';

export interface TextStyle {
  font: string;      // css family
  px: number;        // native pixel size of the font
  fill: string | string[];  // solid colour or a top->bottom stepped gradient
  outline?: string;
  outline2?: string; // second, outer outline
  shadow?: string;
  spacing?: number;
}

export const STYLES = {
  title: { font: 'Alagard', px: 16, fill: ['#fff7d6', '#ffd36b', '#f29a3a'], outline: '#5a2410', outline2: '#1a0a12', shadow: '#00000088' },
  shout: { font: 'Goofy', px: 20, fill: ['#ffffff', '#fff1a8', '#ffc23d'], outline: '#7a2c00', outline2: '#250c03', shadow: '#0008' },
  damage: { font: 'Alagard', px: 16, fill: ['#ffffff', '#ffd0d0', '#ff5a5a'], outline: '#5a0614', outline2: '#14020a' },
  heal: { font: 'Alagard', px: 16, fill: ['#ffffff', '#c8ffd8', '#4fe08a'], outline: '#0b4a2a', outline2: '#021a0e' },
  gold: { font: 'Goofy', px: 20, fill: ['#fffbe0', '#ffe27a', '#e8a224'], outline: '#5e3500', outline2: '#1f1000' },
  item: { font: 'Alagard', px: 16, fill: ['#ffffff', '#e8f6ff', '#9fd6ff'], outline: '#0c2a4a', outline2: '#020a14', shadow: '#0007' },
  body: { font: 'M6x11', px: 18, fill: '#f3f7ff', outline: '#0b1626', shadow: '#0006' },
  small: { font: 'M5x7', px: 16, fill: '#e8f2ff', outline: '#0b1626' },
  hint: { font: 'M6x11', px: 18, fill: ['#e8fdff', '#9ff0ff'], outline: '#06303f', outline2: '#011018' },
  danger: { font: 'Goofy', px: 20, fill: ['#ffffff', '#ffb3b3', '#ff4040'], outline: '#4a0008', outline2: '#120002' },
  magic: { font: 'Alagard', px: 16, fill: ['#ffffff', '#f0d8ff', '#c08cff'], outline: '#2a0c4a', outline2: '#0a0214' },
} satisfies Record<string, TextStyle>;
export type StyleName = keyof typeof STYLES;

const cache = new Map<string, { canvas: HTMLCanvasElement; w: number; h: number; tex?: THREE.CanvasTexture }>();

/** draw text at native size with crisp stepped outlines; returns a canvas sized to fit */
export function textCanvas(text: string, st: TextStyle, maxW = 0): { canvas: HTMLCanvasElement; w: number; h: number } {
  const key = text + '|' + JSON.stringify(st) + '|' + maxW;
  const hit = cache.get(key);
  if (hit) return hit;
  const meas = document.createElement('canvas').getContext('2d')!;
  meas.font = `${st.px}px '${st.font}'`;
  // word wrap
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    if (!maxW) { lines.push(para); continue; }
    let cur = '';
    for (const word of para.split(' ')) {
      const tryL = cur ? cur + ' ' + word : word;
      if (meas.measureText(tryL).width > maxW && cur) { lines.push(cur); cur = word; } else cur = tryL;
    }
    lines.push(cur);
  }
  const pad = 4;
  const lh = Math.ceil(st.px * 1.15);
  const w = Math.ceil(Math.max(...lines.map((l) => meas.measureText(l).width))) + pad * 2 + 2;
  const h = lh * lines.length + pad * 2 + 2;
  // 1) glyph mask, thresholded to hard pixels
  const mask = document.createElement('canvas'); mask.width = w; mask.height = h;
  const mc = mask.getContext('2d')!;
  mc.font = meas.font; mc.textBaseline = 'top'; mc.fillStyle = '#fff';
  lines.forEach((l, i) => { const lw = meas.measureText(l).width; mc.fillText(l, Math.round((w - lw) / 2), pad + i * lh + Math.round(st.px * 0.08)); });
  const md = mc.getImageData(0, 0, w, h).data;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = md[i * 4 + 3] > 110 ? 1 : 0;
  const hasN = (arr: Uint8Array, x: number, y: number, diag: boolean) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; if (!diag && dx && dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && arr[yy * w + xx]) return true;
    }
    return false;
  };
  const ring1 = new Uint8Array(w * h), ring2 = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!on[y * w + x] && hasN(on, x, y, true)) ring1[y * w + x] = 1;
  const both = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) both[i] = on[i] | ring1[i];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!both[y * w + x] && hasN(both, x, y, false)) ring2[y * w + x] = 1;
  // 2) compose
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const put = (i: number, c: string) => {
    const s = c.replace('#', '');
    const hasA = s.length === 8 || s.length === 4;
    const full = s.length <= 4 ? s.split('').map((ch) => ch + ch).join('') : s;
    img.data[i * 4] = parseInt(full.slice(0, 2), 16); img.data[i * 4 + 1] = parseInt(full.slice(2, 4), 16); img.data[i * 4 + 2] = parseInt(full.slice(4, 6), 16);
    img.data[i * 4 + 3] = hasA ? parseInt(full.slice(6, 8), 16) : 255;
  };
  const fills = Array.isArray(st.fill) ? st.fill : [st.fill];
  // per-line vertical band index for the gradient
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (st.shadow && y > 0 && x > 0 && !on[i] && !ring1[i] && !ring2[i]) {
      const j = (y - 2) * w + (x - 1);
      if (y >= 2 && (on[j] || ring1[j] || ring2[j])) put(i, st.shadow);
    }
    if (ring2[i] && st.outline2) put(i, st.outline2);
    if (ring1[i] && st.outline) put(i, st.outline);
    if (on[i]) {
      const ly = ((y - pad) % lh) / (st.px * 1.05);
      put(i, fills[Math.min(fills.length - 1, Math.max(0, Math.floor(ly * fills.length)))]);
    }
  }
  ctx.putImageData(img, 0, 0);
  const out = { canvas: cv, w, h };
  cache.set(key, out);
  return out;
}

export function textTexture(text: string, st: TextStyle, maxW = 0): { tex: THREE.CanvasTexture; w: number; h: number } {
  const c = textCanvas(text, st, maxW) as { canvas: HTMLCanvasElement; w: number; h: number; tex?: THREE.CanvasTexture };
  if (!c.tex) {
    const t = new THREE.CanvasTexture(c.canvas);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    c.tex = t;
  }
  return { tex: c.tex, w: c.w, h: c.h };
}

/** a camera-facing sprite of text, `height` world units tall per text line */
export function textSprite(text: string, st: TextStyle, height = 0.5, maxW = 0): THREE.Sprite {
  const { tex, w, h } = textTexture(text, st, maxW);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const s = new THREE.Sprite(mat);
  const k = height / (st.px * 1.15);
  s.scale.set(w * k, h * k, 1);
  s.userData.aspect = w / h;
  return s;
}

/** a flat mesh of text (for text placed on objects, signs, the backpack tag) */
export function textPlane(text: string, st: TextStyle, height = 0.5, maxW = 0): THREE.Mesh {
  const { tex, w, h } = textTexture(text, st, maxW);
  const k = height / (st.px * 1.15);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w * k, h * k), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5 }));
  return m;
}

// ------------------------------------------------------------------ floating world text
interface Floater { s: THREE.Sprite; x: number; y: number; vy: number; t: number; life: number; base: THREE.Vector2; jitter: number; wobble: number; follow?: () => { x: number; y: number } }

export class FloatText {
  group = new THREE.Group();
  private items: Floater[] = [];

  pop(text: string, x: number, y: number, style: StyleName = 'shout', o: { size?: number; life?: number; vy?: number; jitter?: number; follow?: () => { x: number; y: number } } = {}) {
    const st = STYLES[style];
    const s = textSprite(text, st, o.size ?? 0.42);
    s.renderOrder = 100;
    this.group.add(s);
    const f: Floater = { s, x, y, vy: o.vy ?? 0.9, t: 0, life: o.life ?? 1.3, base: new THREE.Vector2(s.scale.x, s.scale.y), jitter: o.jitter ?? (style === 'shout' || style === 'danger' ? 1 : 0), wobble: Math.random() * 6, follow: o.follow };
    this.items.push(f);
    if (this.items.length > 40) this.kill(this.items[0]);
    return f;
  }

  private kill(f: Floater) {
    this.group.remove(f.s);
    (f.s.material as THREE.SpriteMaterial).dispose();
    this.items.splice(this.items.indexOf(f), 1);
  }

  update(dt: number) {
    for (const f of [...this.items]) {
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { this.kill(f); continue; }
      f.vy *= Math.exp(-dt * 2.2);
      f.y += f.vy * dt;
      const pop = f.t < 0.3 ? easeOutBack(clamp01(f.t / 0.3), 3) : 1;
      const squash = 1 + Math.sin(f.t * 22) * Math.exp(-f.t * 6) * 0.18;
      const fade = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const base = f.follow ? f.follow() : { x: 0, y: 0 };
      const jx = f.jitter ? (Math.random() - 0.5) * 0.04 * Math.exp(-f.t * 3) : 0;
      f.s.position.set(base.x + f.x + jx + Math.sin(f.t * 3 + f.wobble) * 0.04, base.y + f.y, 1.5);
      f.s.scale.set(f.base.x * pop * squash, f.base.y * pop / squash, 1);
      f.s.material.rotation = Math.sin(f.t * 4 + f.wobble) * 0.06 * fade;
      (f.s.material as THREE.SpriteMaterial).opacity = fade;
    }
  }
  clear() { for (const f of [...this.items]) this.kill(f); }
}

/** wait for every bundled font so canvas text never falls back */
export async function loadFonts() {
  const fams = ['Alagard', 'Goofy', 'Jacquard', 'M6x11', 'M5x7', 'Tiny5', 'Pixelify'];
  await Promise.all(fams.map((f) => document.fonts.load(`16px '${f}'`).catch(() => null)));
}
