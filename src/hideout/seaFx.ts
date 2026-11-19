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

const h1 = (n: number) => { let x = (n * 374761393) | 0; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967295; };

/** a bubble ring: r 1 (a dot with a glint), 2 or 3 */
export function bubble(ui: PixelUI, x: number, y: number, r: number, a = 1) {
  x = Math.round(x); y = Math.round(y);
  const rim = '#bfe8f0', hi = '#ffffff';
  if (r <= 1) { ui.fill(x, y, 2, 2, rim, 0.75 * a); ui.fill(x, y, 1, 1, hi, 0.9 * a); return; }
  if (r === 2) { ui.fill(x + 1, y, 2, 1, rim, 0.8 * a); ui.fill(x + 1, y + 3, 2, 1, rim, 0.8 * a); ui.fill(x, y + 1, 1, 2, rim, 0.8 * a); ui.fill(x + 3, y + 1, 1, 2, rim, 0.8 * a); ui.fill(x + 1, y + 1, 1, 1, hi, 0.9 * a); return; }
  ui.fill(x + 2, y, 2, 1, rim, 0.8 * a); ui.fill(x + 2, y + 5, 2, 1, rim, 0.8 * a); ui.fill(x, y + 2, 1, 2, rim, 0.8 * a); ui.fill(x + 5, y + 2, 1, 2, rim, 0.8 * a);
  ui.fill(x + 1, y + 1, 1, 1, rim, 0.8 * a); ui.fill(x + 4, y + 1, 1, 1, rim, 0.8 * a); ui.fill(x + 1, y + 4, 1, 1, rim, 0.8 * a); ui.fill(x + 4, y + 4, 1, 1, rim, 0.8 * a);
  ui.fill(x + 1, y + 2, 1, 1, hi, 0.9 * a); ui.fill(x + 2, y + 1, 1, 1, hi, 0.9 * a);
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

/** a kelp blade hanging from (x, y): `len` px of segments that sway, darker on one edge, a bladder near the tip */
export function kelp(ui: PixelUI, x: number, y: number, len: number, t: number, seed = 1, dir: 1 | -1 = 1) {
  const C = ['#1e4a1c', '#3a7a28', '#5fae3f', '#8ccc5a'];
  let px = x;
  for (let i = 0; i < len; i++) {
    const k = i / len;
    const sway = Math.sin(t * 1.3 + seed + k * 3) * k * k * 5 * dir;
    px = x + Math.round(sway + dir * Math.sin(k * 2.2) * 3);
    const wdt = i < 2 ? 2 : k > 0.85 ? 2 : 3;
    ui.fill(px, y + i, wdt, 1, i % 4 === 0 ? C[2] : C[1]);
    ui.fill(px + (dir > 0 ? wdt : -1), y + i, 1, 1, C[0]);
    if (i % 5 === 2) ui.fill(px + 1, y + i, 1, 1, C[3]);
  }
  // a gas bladder near the end
  ui.fill(px - 1, y + len, 4, 3, C[0]); ui.fill(px, y + len, 2, 2, '#b8a040'); ui.fill(px, y + len, 1, 1, '#f0e080');
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

/** a barnacle cluster with a tiny scallop shell (about 12 x 8 px), for a frame corner */
export function barnacles(ui: PixelUI, x: number, y: number, seed = 1) {
  const B = ['#3a3630', '#7a7266', '#b8aea0', '#e8e0d4'];
  const cone = (cx: number, cy: number, r: number) => { ui.fill(cx - r, cy, r * 2 + 1, r, B[0]); ui.fill(cx - r + 1, cy, r * 2 - 1, r - 1, B[2]); ui.fill(cx - r + 1, cy, r, 1, B[3]); ui.fill(cx - 1, cy, 3, 1, B[0]); };
  cone(x + 3, y + 3, 3); cone(x + 8 + Math.round(h1(seed) * 2), y + 4, 2); cone(x + 5, y + 6, 2);
  // the scallop
  const sx = x + 10, sy = y + 5;
  ui.fill(sx, sy + 1, 5, 3, '#6e3e3a'); ui.fill(sx + 1, sy, 3, 1, '#6e3e3a'); ui.fill(sx + 1, sy + 1, 3, 2, '#f0b8a0'); ui.fill(sx + 2, sy + 1, 1, 2, '#c08070');
}

/** a twisted rope segment (3 px thick), horizontal or vertical */
export function rope(ui: PixelUI, x: number, y: number, len: number, vertical = false) {
  const C = ['#3a2a14', '#8a6a3a', '#c8a464', '#ecd29a'];
  for (let i = 0; i < len; i++) {
    const k = i % 4;
    const a = k === 0 ? C[3] : k === 1 ? C[2] : k === 2 ? C[1] : C[0];
    const b = k === 1 ? C[3] : k === 2 ? C[2] : k === 3 ? C[1] : C[0];
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
