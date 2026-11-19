// v5 "ocean" life for the home + bag screens: small things drawn fresh each frame with a few fills (never a
// repaint of a big canvas), all deterministic from time + a seed (no random noise):
//
//   bubbles(ui, x, y, w, t, seed)        a few rings rising off a panel's top edge (x .. x + w at y)
//   kelp(ui, x, y, len, t, seed, dir)    a kelp blade draped over an edge at (x, y), swaying (dir 1 hangs right)
//   caustics(ui, x, y, w, h, t, a)       slow drifting light lines over a dark or sandy area (clipped)
//   barnacles(ui, x, y, seed)            a little cluster of barnacles + a shell (for frame corners)
//   rope(ui, x, y, len, vertical)        a twisted rope segment (lashing)
//   wobble(t)                            the pop-in offset of a panel (a damped bob, px)
//   const fx = new SeaFx(); fx.burst(x, y); fx.draw(ui, dt)   a splash of bubbles (hover, press, drops)
import type { PixelUI } from '../ui/pixel/ui';
import { bubbleArt } from '../ui/pixel/skins';
import { Px, R, SPR, stamp } from '../ui/pixel/decor';

const h1 = (n: number) => { let x = (n * 374761393) | 0; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967295; };

/** a bubble (the kit's hand-drawn bubble sprite: a lit rim, a shaded rim, a glint), r 1..3, on whole UI pixels */
export function bubble(ui: PixelUI, x: number, y: number, r: number, a = 1) {
  const b = bubbleArt(Math.max(1, Math.min(3, Math.round(r))));
  ui.img(b, Math.round(x), Math.round(y), { alpha: a, w: b.width, h: b.height });
}

/** a few bubbles rising off an edge: each starts at its own spot along it, rises `rise` px wobbling, then pops */
export function bubbles(ui: PixelUI, x: number, y: number, w: number, t: number, seed = 1, n = 4, rise = 26) {
  for (let i = 0; i < n; i++) {
    const per = 2.6 + h1(seed * 31 + i) * 2.4, ph = h1(seed * 17 + i * 7) * per;
    const k = ((t + ph) % per) / per;            // 0..1 through this bubble's life
    if (k > 0.85) continue;                      // a pause before the next one
    const u = k / 0.85;
    const bx = x + 6 + h1(seed * 13 + i * 3 + Math.floor((t + ph) / per)) * Math.max(1, w - 12) + Math.sin(u * 9 + i) * 1.6;
    const by = y - u * rise;
    bubble(ui, bx, by, 1 + (i % 3 === 0 ? 1 : 0) + (u > 0.6 && i % 2 ? 1 : 0), 1 - Math.max(0, u - 0.7) / 0.3);
  }
}

const KELP = ['#0c200e', '#183a14', '#28561c', '#3c7426', '#559234', '#78b04a', '#a8d06c'];
/**
 * a kelp frond hanging from (x, y): `len` px of ruffled ribbon (an ink-green rim, a lit margin on the light side, a
 * paler midrib, a shaded margin), swaying more toward its tip on whole UI pixels, a cast shadow, a gas bladder at the
 * stipe (dir 1 drifts right, -1 left)
 */
export function kelp(ui: PixelUI, x: number, y: number, len: number, t: number, seed = 1, dir: 1 | -1 = 1) {
  const K = KELP;
  const rows: [number, number, number][] = [];
  for (let i = 0; i < len; i++) {
    const k = i / len;
    const sway = Math.sin(t * 1.3 + seed + k * 3) * k * k * 4.5 * dir + Math.sin(t * 0.6 + seed) * k;
    const cx = x + sway + dir * Math.sin(k * 2.2) * 3;
    const w = i < 2 ? 2 : k > 0.88 ? 1 : k > 0.74 ? 2 : 3 + ((i >> 2) % 2);
    rows.push([Math.round(cx - w / 2 + 1), y + i, w]);
  }
  for (const [rx, ry, w] of rows) ui.fill(rx + 1, ry + 1, w, 1, '#000000', 0.25);
  for (const [rx, ry, w] of rows) ui.fill(rx - 1, ry - 1, w + 2, 3, K[0]);
  rows.forEach(([rx, ry, w], i) => {
    if (w === 1) { ui.fill(rx, ry, 1, 1, K[4]); return; }
    ui.fill(rx, ry, w, 1, K[3]);
    ui.fill(rx, ry, 1, 1, K[5]); ui.fill(rx + w - 1, ry, 1, 1, K[2]);
    if (w >= 3) ui.fill(rx + Math.floor(w / 2), ry, 1, 1, (i >> 1) % 3 === 0 ? K[6] : K[4]);
  });
  // a gas bladder at the stipe
  const [bx, by] = rows[Math.min(rows.length - 1, 2)];
  ui.fill(bx - 2, by - 1, 4, 4, K[0]);
  ui.fill(bx - 1, by, 2, 2, '#a08a2c'); ui.fill(bx - 1, by, 1, 1, '#ecd878'); ui.fill(bx, by + 1, 1, 1, '#6e5c1c');
}

/** slow caustic light: a few wavy bright lines drifting across a rect (low alpha; clipped) */
export function caustics(ui: PixelUI, x: number, y: number, w: number, h: number, t: number, a = 0.07, col = '#bff0ff') {
  ui.clip(x, y, w, h);
  for (let i = 0; i < 5; i++) {
    const yy = y + ((i * 0.23 + t * 0.018 * (1 + i * 0.13)) % 1.2 - 0.1) * h;
    for (let xx = 0; xx < w; xx += 3) {
      const off = Math.sin(xx * 0.045 + t * 0.7 + i * 1.9) * 6 + Math.sin(xx * 0.11 - t * 0.5 + i) * 2;
      if (Math.sin(xx * 0.07 + i * 3 + t * 0.3) < -0.2) continue;
      ui.fill(x + xx, Math.round(yy + off), 3, 1, col, a);
    }
  }
  ui.unclip();
}

const clusterCache = new Map<number, HTMLCanvasElement>();
/** a barnacle cluster with a limpet and a tiny scallop (about 16 x 9 px), for a frame corner: the kit's sprites */
export function barnacles(ui: PixelUI, x: number, y: number, seed = 1) {
  const k = seed % 4;
  let c = clusterCache.get(k);
  if (!c) {
    const px = new Px(18, 10);
    stamp(px, SPR.barnacleL, 1, 2); stamp(px, SPR.barnacleM, 5 + (k % 2), 4); stamp(px, SPR.barnacleS, 0, 6);
    stamp(px, SPR.scallop, 10, 2);
    c = px.done(); clusterCache.set(k, c);
  }
  ui.img(c, Math.round(x), Math.round(y), { w: c.width, h: c.height });
}

/** a twisted rope segment (4 px thick: ink rims, a lit strand side, a shaded strand side, splits every 3 px) */
export function rope(ui: PixelUI, x: number, y: number, len: number, vertical = false) {
  const C = R.rope.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''));
  for (let i = 0; i < len; i++) {
    const k = i % 3;
    const a = k === 0 ? C[6] : k === 1 ? C[5] : C[3];
    const b = k === 0 ? C[3] : k === 1 ? C[2] : C[1];
    if (vertical) { ui.fill(x, y + i, 1, 1, C[0]); ui.fill(x + 1, y + i, 1, 1, a); ui.fill(x + 2, y + i, 1, 1, b); ui.fill(x + 3, y + i, 1, 1, C[0]); }
    else { ui.fill(x + i, y, 1, 1, C[0]); ui.fill(x + i, y + 1, 1, 1, a); ui.fill(x + i, y + 2, 1, 1, b); ui.fill(x + i, y + 3, 1, 1, C[0]); }
  }
}
/** a panel's pop-in: rises with a damped water bob (px; 0 once settled). t = seconds since it opened */
export function wobble(t: number) { return t > 1.2 ? 0 : Math.round(Math.exp(-t * 5) * Math.cos(t * 16) * 14); }

/** a splash of bubbles (hover, press, drops): call burst(), then draw() every frame */
export class SeaFx {
  private p: { x: number; y: number; vx: number; vy: number; t: number; life: number; r: number }[] = [];
  burst(x: number, y: number, n = 7) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / Math.max(1, n - 1) - 0.5) * 2.2;
      const s = 30 + ((i * 37) % 23) * 2;
      this.p.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.45 + ((i * 13) % 7) * 0.05, r: 1 + (i % 3 === 0 ? 1 : 0) });
    }
    if (this.p.length > 120) this.p.splice(0, this.p.length - 120);
  }
  draw(ui: PixelUI, dt: number) {
    for (const q of this.p) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.exp(-dt * 4); q.vy = q.vy * Math.exp(-dt * 3) - 40 * dt; }
    this.p = this.p.filter((q) => q.t < q.life);
    for (const q of this.p) bubble(ui, q.x, q.y, q.r, 1 - q.t / q.life);
  }
}
