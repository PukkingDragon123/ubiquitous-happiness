// v6 SIGNATURE GAUGES: the HUD's bars as objects from the blobfish's sea, painted per frame at ONE texel per UI px
// (chunky, nearest-filtered) on hue-shifted 4-6 tone ramps, every change juicy:
//
//   JellyFloat     HP: a glass fishing float in a rope net, full of living pink jelly. The net's cords and knots mark
//                  every 10 HP. The jelly wobbles at its front, slow cells drift in it, bubbles rise; a hit flashes
//                  it, leaves a pale cracked chip that breaks off in chunks falling out of the float, and splashes; a
//                  heal pours in glowing pink with sparkles and droplets; at low HP it throbs with a heartbeat.
//   BubbleChain    STAMINA: ten air bubbles strung on a kelp thread, 10% each. Spending POPS them (a star burst and
//                  droplets); they re-inflate one by one with a wobble; amber while regen waits, red and flickering
//                  when the guard breaks, white on a parry, gold for a riposte.
//   GlowKelp       MANA: a bioluminescent kelp frond, lit from its stem up to the mana level: violet-cyan cells, a
//                  glowing midrib, light pulses travelling along it, plankton twinkling; air bladders at 25 / 50 / 75%
//                  light up as it fills; spending throws off glowing motes and leaves a dim afterglow.
//   HarpoonGauge   BOSS: a carved harpoon: a barbed iron head, a wooden shaft with the health inlaid in red coral
//                  lacquer in a carved channel, notches every 10%, iron collars at the phase thresholds (cracked once
//                  passed), a rope-wrapped butt with a red streamer; damage flashes the inlay and chips off chunks of
//                  lacquer and wood that fly and fall; poise is a gold twine under the shaft.
//
//   each frame: gauge.draw(ui, x, y, w, state)            x / y: top-left in UI px (integers)
import type { PixelUI } from '../pixel/ui';

// ------------------------------------------------------------------ a per-pixel buffer
type U = number;
/** '#rrggbb' -> a little-endian RGBA uint32 (opaque) */
const pk = (hex: string): U => { const n = parseInt(hex.slice(1, 7), 16); return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0; };
const P = (...hex: string[]) => hex.map(pk);
const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

class Buf {
  w = 0; h = 0;
  cv = document.createElement('canvas');
  sh = document.createElement('canvas');
  private ctx = this.cv.getContext('2d')!;
  private img: ImageData | null = null;
  u: Uint32Array = new Uint32Array(0);
  /** resize; true when the size changed (static layers must be rebuilt) */
  size(w: number, h: number) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (w === this.w && h === this.h) return false;
    this.w = w; this.h = h; this.cv.width = w; this.cv.height = h; this.sh.width = w; this.sh.height = h;
    this.img = this.ctx.createImageData(w, h); this.u = new Uint32Array(this.img.data.buffer);
    return true;
  }
  clear() { this.u.fill(0); }
  set(x: number, y: number, c: U) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.u[y * this.w + x] = c; }
  get(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.u[y * this.w + x] : 0; }
  put() { this.ctx.putImageData(this.img!, 0, 0); }
  /** a black silhouette of what is painted (the drop shadow that keeps the gauge readable over a busy sea) */
  shadow() {
    const x = this.sh.getContext('2d')!;
    x.clearRect(0, 0, this.w, this.h); x.drawImage(this.cv, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = '#02060a'; x.fillRect(0, 0, this.w, this.h); x.globalCompositeOperation = 'source-over';
    return this.sh;
  }
}

interface Bit { x: number; y: number; vx: number; vy: number; t: number; life: number; c: string; w: number; h: number; g: number }
/** flying bits (chunks, droplets, motes) in UI px, drawn straight onto the PixelUI */
class Bits {
  list: Bit[] = [];
  add(b: Partial<Bit> & { x: number; y: number }) { if (this.list.length < 90) this.list.push({ vx: 0, vy: 0, t: 0, life: 0.7, c: '#ffffff', w: 1, h: 1, g: 260, ...b }); }
  draw(ui: PixelUI, dt: number, alpha = 1) {
    for (const b of this.list) {
      b.t += dt; b.vy += b.g * dt; b.vx *= 1 - dt * 1.2; b.x += b.vx * dt; b.y += b.vy * dt;
      const a = Math.max(0, 1 - Math.max(0, b.t - b.life * 0.6) / (b.life * 0.4));
      ui.fill(Math.round(b.x), Math.round(b.y), b.w, b.h, b.c, a * alpha);
    }
    this.list = this.list.filter((b) => b.t < b.life);
  }
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ HP: the jelly float
const J = P('#3e0616', '#7a1028', '#b82038', '#e0444e', '#ff7a78', '#ffc4b8', '#fff2ee');
const JHEX = ['#3e0616', '#7a1028', '#b82038', '#e0444e', '#ff7a78', '#ffc4b8'];
const GLASS = P('#06121a', '#0c1e26', '#12303a', '#1c4a52', '#5a9aa0', '#cfeef0');
const ROPE = P('#1e1309', '#3e2b12', '#644a22', '#8c6e38', '#b49250', '#d6b874', '#efdba4');
const CORK = P('#2a1608', '#5a3418', '#8a5a2a', '#b8824a', '#d8a870');
const INK = pk('#0a0604'), WHITE = pk('#ffffff');
const CHIP = P('#c88a88', '#f0c8c0', '#ffe8e0'), POUR = P('#c84a8a', '#ff8ac0', '#ffc8e8');
const isCav = (c: U) => c === GLASS[0] || c === GLASS[1] || c === GLASS[2];

export interface JellyState {
  /** 0..1 shown, the pale chip of the last hit (>= v), a heal's ghost target (>= v) */
  v: number; chip: number; gain?: number;
  /** segments the net marks (HP / 10) */
  segs: number;
  crit?: boolean;
  /** 0..1 white hit flash */
  flash?: number;
  t: number; dt: number;
}
export class JellyFloat {
  private b = new Buf();
  private bits = new Bits();
  private stat: Uint32Array = new Uint32Array(0);
  private key = '';
  private lastV = -1; private slosh = 0; private lastChip = -1; private chipBreak = 0;
  /** where the jelly's front is (UI px) this frame: heal sparkles aim here */
  front = { x: 0, y: 0 };

  draw(ui: PixelUI, x: number, y: number, w: number, s: JellyState) {
    const h = 14, b = this.b;
    const capW = w - 6; // the float; a cork stopper on the right
    const key = `${w}|${s.segs}`;
    if (b.size(w, h) || key !== this.key) { this.key = key; this.paintStatic(w, h, capW, s.segs); }
    const r = h / 2, cw = capW - 4;
    const fill = Math.round(Math.max(0, Math.min(1, s.v)) * cw), chipPx = Math.round(Math.max(0, Math.min(1, s.chip)) * cw);
    const gainPx = s.gain !== undefined ? Math.round(Math.max(0, Math.min(1, s.gain)) * cw) : 0;
    // what changed: a hit splashes and throws chunks; the chip then crumbles off its right edge
    if (this.lastV >= 0) {
      const dv = this.lastV - s.v;
      if (dv > 0.004) {
        this.slosh = 1;
        const n = Math.max(3, Math.min(12, Math.round(dv * cw / 2.5)));
        for (let i = 0; i < n; i++) this.bits.add({ x: x + 2 + fill + rnd(0, dv * cw), y: y + rnd(3, h - 3), vx: rnd(-25, 30), vy: rnd(-70, -20), c: JHEX[3 + (i % 3)] ?? '#ffc4b8', w: i % 3 ? 2 : 1, h: i % 2 ? 2 : 1, life: rnd(0.5, 0.85) });
        for (let i = 0; i < 4; i++) this.bits.add({ x: x + 2 + fill, y: y + 3 + i * 2, vx: rnd(-40, -10), vy: rnd(-50, -20), c: '#ffffff', life: 0.35 });
      } else if (dv < -0.004) this.slosh = Math.max(this.slosh, 0.6);
    }
    this.lastV = s.v;
    if (this.lastChip >= 0 && chipPx > fill + 1 && s.chip < this.lastChip - 0.001) {
      this.chipBreak += (this.lastChip - s.chip) * cw;
      while (this.chipBreak > 2) { this.chipBreak -= 2; this.bits.add({ x: x + 2 + chipPx + rnd(-1, 1), y: y + rnd(4, h - 4), vx: rnd(-6, 10), vy: rnd(-10, 10), c: '#ffe0d8', w: 2, h: 1, g: 220, life: 0.6 }); }
    }
    this.lastChip = s.chip;
    // a heal pours in: pink drops fall into the float at the jelly's front and splash
    if (gainPx > fill + 1 && Math.random() < s.dt * 22) {
      this.bits.add({ x: x + 2 + fill + rnd(-1, 2), y: y - rnd(4, 9), vx: rnd(-4, 4), vy: rnd(20, 50), c: Math.random() < 0.3 ? '#ffffff' : '#ff9ac8', w: 1, h: 2, g: 320, life: 0.16 });
      if (Math.random() < 0.5) this.bits.add({ x: x + 2 + fill, y: y + 3, vx: rnd(-30, 30), vy: rnd(-40, -15), c: '#ffc8e8', g: 260, life: 0.3 });
    }
    this.slosh = Math.max(0, this.slosh - s.dt * 1.6);
    const t = s.t, beat = s.crit ? Math.max(0, Math.sin(t * 7.5)) ** 8 : 0, up = beat > 0.35 ? 1 : 0;
    const flash = s.flash ?? 0;
    b.u.set(this.stat);
    const amp = 0.4 + this.slosh * 1.7;
    for (let yy = 2; yy < h - 2; yy++) {
      const ry = (yy - 2) / (h - 4);
      // the jelly's front wobbles; its top and bottom rows lag a pixel (a rounded meniscus)
      const lag = yy === 2 || yy === h - 3 ? 1 : 0;
      const front = 2 + fill + Math.round(Math.sin(yy * 1.1 + t * 7) * amp) - lag;
      for (let xx = 2; xx < capW - 2; xx++) {
        const i = yy * w + xx;
        if (!isCav(this.stat[i])) continue; // only the cavity
        if (fill > 0 && xx < front) {
          let k = ry < 0.12 ? 4 : ry < 0.26 ? ((xx + Math.floor(t * 6)) % 13 < 8 ? 5 : 4) : ry < 0.6 ? 3 : ry < 0.86 ? 2 : 1;
          // living jelly: lighter cells drifting slowly, a few darker flecks
          if (ry > 0.25 && ry < 0.86) { if ((xx * 3 + yy * 5 + Math.floor(t * 2)) % 17 === 0) k = 4; else if ((xx * 7 + yy * 3) % 29 === 0) k = 2; }
          if (xx >= front - 1) k = 5; else if (xx === front - 2) k = Math.max(k, 4);
          k = Math.min(6, k + up);
          b.u[i] = flash > 0.5 ? J[6] : flash > 0.2 ? J[5] : J[k];
        } else if (gainPx > fill && xx < 2 + gainPx) {
          // a heal pouring in: glowing pink with sparkles drifting along it
          const sp = (xx + Math.floor(t * 30) + yy * 3) % 11 === 0;
          b.u[i] = sp ? WHITE : ry < 0.3 ? POUR[2] : ry > 0.8 ? POUR[0] : POUR[1];
        } else if (chipPx > fill && xx < 2 + chipPx) {
          // the chip: pale bruised jelly, cracked, about to break off
          b.u[i] = (xx + yy * 2) % 5 === 0 ? CHIP[0] : ry < 0.3 ? CHIP[2] : CHIP[1];
        }
      }
    }
    // bubbles rising through the jelly
    if (fill > 6) for (let i = 0; i < 4; i++) {
      const bx = 3 + ((i * 37 + 11) % Math.max(1, fill - 4)), by = h - 3 - Math.floor(((t * (0.45 + 0.13 * i) + i * 0.31) % 1) * (h - 5));
      if (isCav(this.stat[by * w + bx]) && isCav(this.stat[(by - 1) * w + bx])) { b.set(bx, by, J[5]); if (i % 2 === 0) b.set(bx, by - 1, WHITE); }
    }
    // the net over it all (cords, knots, rim ropes) and the glass glints: the static overlay, re-applied
    const ov = this.over;
    for (let i = 0; i < ov.length; i += 2) b.u[ov[i]] = ov[i + 1];
    // heartbeat: the outline throbs red
    if (beat > 0.5) for (let i = 0; i < b.u.length; i++) if (b.u[i] === INK) b.u[i] = pk('#9a1028');
    b.put();
    ui.img(b.shadow(), x + 1, y + 1, { alpha: 0.5 });
    ui.img(b.cv, x, y);
    this.front = { x: x + 2 + fill, y: y + r };
    // the cork's rope tail, hanging and swaying
    const tx = x + w - 3, ty = y + h - 2;
    for (let k = 0; k < 6; k++) { const sx = tx + Math.round(Math.sin(t * 2.2 + k * 0.5) * (k / 6) * 1.5); ui.fill(sx, ty + k, 1, 1, k % 2 ? '#8c6e38' : '#d6b874'); ui.fill(sx + 1, ty + k, 1, 1, '#3e2b12'); }
    ui.fill(tx - 1 + Math.round(Math.sin(t * 2.2 + 3) * 1.5), ty + 6, 3, 2, '#b49250');
    this.bits.draw(ui, s.dt);
  }

  private over: number[] = [];
  private paintStatic(w: number, h: number, capW: number, segs: number) {
    const b = this.b, r = h / 2, cw = capW - 4;
    b.clear();
    const dist = (x: number, y: number) => { const px = x + 0.5, py = y + 0.5, nx = Math.max(r, Math.min(capW - r, px)); return Math.hypot(px - nx, py - r); };
    for (let y = 0; y < h; y++) for (let x = 0; x < capW; x++) {
      const d = dist(x, y);
      if (d > r) continue;
      if (d > r - 1) { b.set(x, y, INK); continue; }
      if (d > r - 2) { b.set(x, y, y < r ? GLASS[5] : GLASS[3]); continue; } // the glass wall: lit top, shaded bottom
      // the empty cavity: dark water behind glass, a faint slanted shaft of light
      const shaft = (x - y * 2 + 400) % 23 < 3;
      b.set(x, y, y < r - 1 ? (shaft ? GLASS[2] : GLASS[1]) : shaft ? GLASS[1] : GLASS[0]);
    }
    // the cork stopper on the right end: pored cork in a darker collar
    const kx = capW - 1;
    for (let y = 2; y < h - 2; y++) for (let x = kx; x < w - 1; x++) {
      const e = x === w - 2 || y === 2 || y === h - 3;
      b.set(x, y, e ? CORK[0] : (x * 5 + y * 3) % 7 === 0 ? CORK[1] : y < r ? CORK[4] : CORK[3]);
    }
    b.set(w - 1, Math.floor(r), INK); b.set(w - 1, Math.floor(r) - 1, INK);
    this.stat = new Uint32Array(b.u);
    // the overlay: rim ropes, segment cords and knots, glass glints (pairs of index, colour)
    const ov: number[] = [];
    const put = (x: number, y: number, c: U) => { if (x >= 0 && y >= 0 && x < w && y < h) ov.push(y * w + x, c); };
    for (let x = Math.ceil(r) - 1; x < capW - r + 1; x++) { const ph = x % 3; put(x, 0, ph === 0 ? ROPE[5] : ph === 1 ? ROPE[4] : ROPE[2]); put(x, h - 1, ph === 0 ? ROPE[3] : ph === 1 ? ROPE[2] : ROPE[1]); }
    const n = Math.max(1, Math.min(40, segs));
    for (let k = 1; k < n; k++) {
      const bx = 2 + Math.round((k / n) * cw);
      for (let y = 1; y < h - 1; y++) put(bx, y, y % 2 ? ROPE[4] : ROPE[2]);
      for (const [dx, dy, c] of [[-1, 0, ROPE[3]], [0, 0, ROPE[6]], [1, 0, ROPE[2]], [-1, 1, ROPE[2]], [0, 1, ROPE[4]], [1, 1, ROPE[1]], [-1, h - 2, ROPE[3]], [0, h - 2, ROPE[5]], [1, h - 2, ROPE[2]], [-1, h - 1, ROPE[1]], [0, h - 1, ROPE[3]], [1, h - 1, ROPE[1]]] as [number, number, U][]) put(bx + dx, dy, c);
    }
    // glass glints: a broken streak along the top and a short diagonal near the left end
    for (let x = Math.ceil(r) + 2; x < capW * 0.6; x++) if (x % 9 < 5) put(x, 2, GLASS[5]);
    for (let k = 0; k < 3; k++) put(4 + k, 9 - k * 2, WHITE);
    this.over = ov;
  }
}

// ------------------------------------------------------------------ STAMINA: the bubble chain
type BState = 'ok' | 'wait' | 'broken' | 'riposte' | 'flash';
const BPAL: Record<BState, U[]> = {
  // rim light, rim dark, inside light, inside dark, deep
  ok: P('#e8fcff', '#4aa0ae', '#7ae0d8', '#2a9a9a', '#16606a'),
  wait: P('#fff0c0', '#b88a2a', '#f0c858', '#b8841e', '#7a5210'),
  broken: P('#ffd8d0', '#a83a30', '#ff8a78', '#c83a30', '#7a1a14'),
  riposte: P('#fff8d0', '#c8913a', '#ffe48a', '#d8a440', '#8a5a1a'),
  flash: P('#ffffff', '#c8f4ff', '#ffffff', '#e8fcff', '#a8e8f0'),
};
const THREAD = P('#183a14', '#2e5a1e', '#4a8a2e', '#78b04a');
export interface BubbleState { v: number; chip: number; state: BState; t: number; dt: number }
export class BubbleChain {
  private b = new Buf();
  private bits = new Bits();
  private prevF: number[] = [];
  private wob: number[] = [];
  private pops: { x: number; y: number; t: number }[] = [];
  readonly n = 10;
  draw(ui: PixelUI, x: number, y: number, w: number, s: BubbleState) {
    const h = 11, b = this.b, n = this.n, sp = w / n, cy = 5, t = s.t;
    b.size(w, h); b.clear();
    // the kelp thread they are strung on
    for (let xx = 0; xx < w; xx++) { b.set(xx, cy, (xx >> 1) % 2 ? THREAD[2] : THREAD[1]); if (xx % 5 === 0) b.set(xx, cy, THREAD[3]); b.set(xx, cy + 1, THREAD[0]); }
    const pal = BPAL[s.state];
    for (let i = 0; i < n; i++) {
      const f = Math.max(0, Math.min(1, s.v * n - i)), fc = Math.max(0, Math.min(1, s.chip * n - i));
      const cx = Math.round(sp * (i + 0.5)) - 1;
      const prev = this.prevF[i] ?? f;
      if (prev > 0.08 && f <= 0.08) { this.pops.push({ x: cx, y: cy, t: 0 }); for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + i; this.bits.add({ x: x + cx + Math.cos(a) * 3, y: y + cy + Math.sin(a) * 3, vx: Math.cos(a) * 45, vy: Math.sin(a) * 45 - 20, c: k % 2 ? '#e8fcff' : '#7ae0d8', g: 120, life: 0.35 }); } }
      if (prev <= 0.08 && f > 0.08) this.wob[i] = 1;
      this.prevF[i] = f;
      this.wob[i] = Math.max(0, (this.wob[i] ?? 0) - s.dt * 2.5);
      const bob = Math.sin(t * 2.2 + i * 0.9) > 0.75 ? -1 : 0;
      if (f <= 0.08) {
        // an empty knot on the thread, and (just spent) a cracked ghost ring fading
        b.set(cx, cy, THREAD[3]); b.set(cx + 1, cy, THREAD[2]); b.set(cx, cy + 1, THREAD[1]);
        if (fc > 0.08) for (let a = 0; a < 8; a++) if (a % 2 === 0 || Math.sin(t * 30) > 0) b.set(cx + Math.round(Math.cos(a * 0.785) * 3.5), cy + Math.round(Math.sin(a * 0.785) * 3.5), pk('#9ab4b4'));
        continue;
      }
      const rr = (f >= 1 ? 4.2 : 1.6 + 2.6 * f) * (1 + Math.sin(t * 28) * 0.18 * this.wob[i]);
      const by = cy + bob;
      for (let yy = Math.floor(by - rr - 1); yy <= by + rr + 1; yy++) for (let xx = Math.floor(cx - rr - 1); xx <= cx + rr + 1; xx++) {
        const dx = xx + 0.5 - (cx + 0.5), dy = yy + 0.5 - (by + 0.5), d = Math.hypot(dx, dy);
        if (d > rr) continue;
        const lit = dx + dy < 0;
        b.set(xx, yy, d > rr - 1 ? (lit ? pal[0] : pal[1]) : dx + dy < -rr * 0.35 ? pal[2] : dy > rr * 0.35 ? pal[4] : pal[3]);
      }
      // the glint (two pixels top-left) and the little reflection bottom-right
      const g = Math.max(1, Math.round(rr * 0.45));
      b.set(cx - g, by - g, WHITE); if (rr > 3) b.set(cx - g + 1, by - g, WHITE);
      if (rr > 2.5) b.set(cx + g, by + g - 1, pal[2]);
    }
    b.put();
    ui.img(b.shadow(), x + 1, y + 1, { alpha: 0.45 });
    ui.img(b.cv, x, y);
    // pops: a white star, then four rays spreading
    for (const p of this.pops) {
      p.t += s.dt;
      const px = x + p.x, py = y + p.y;
      if (p.t < 0.07) { ui.fill(px - 1, py, 3, 1, '#ffffff'); ui.fill(px, py - 1, 1, 3, '#ffffff'); ui.fill(px - 2, py, 1, 1, '#cfeef0'); ui.fill(px + 2, py, 1, 1, '#cfeef0'); ui.fill(px, py - 2, 1, 1, '#cfeef0'); ui.fill(px, py + 2, 1, 1, '#cfeef0'); }
      else { const k = (p.t - 0.07) / 0.15, rr = 3 + k * 3; for (let a = 0; a < 4; a++) ui.fill(Math.round(px + Math.cos(a * 1.571 + 0.785) * rr), Math.round(py + Math.sin(a * 1.571 + 0.785) * rr), 1, 1, '#e8fcff', 1 - k); }
    }
    this.pops = this.pops.filter((p) => p.t < 0.22);
    this.bits.draw(ui, s.dt);
  }
}

// ------------------------------------------------------------------ MANA: the bioluminescent kelp
const KD = P('#0c1a0a', '#1a3414', '#24461c', '#2e5626', '#3e6a2c', '#56823a');   // dull kelp (unlit), dark -> light
const GL = P('#160c48', '#2e2a96', '#4446d8', '#5c6af0', '#86b4ff', '#c8f4ff', '#ffffff'); // bioluminescence
const BLAD = P('#3a3010', '#6e5c1c', '#a08a2c', '#ecd878');
export interface KelpState { v: number; chip: number; t: number; dt: number }
export class GlowKelp {
  private b = new Buf();
  private bits = new Bits();
  private lastV = -1;
  draw(ui: PixelUI, x: number, y: number, w: number, s: KelpState) {
    const h = 11, b = this.b, t = s.t, cy = 5;
    b.size(w, h); b.clear();
    const x0 = 5, span = w - x0 - 3;
    const fill = x0 + Math.round(Math.max(0, Math.min(1, s.v)) * span), chip = x0 + Math.round(Math.max(0, Math.min(1, s.chip)) * span);
    if (this.lastV >= 0 && s.v < this.lastV - 0.003) for (let i = 0; i < 7; i++) this.bits.add({ x: x + fill + rnd(-2, 2), y: y + rnd(2, 8), vx: rnd(-10, 18), vy: rnd(-45, -15), c: i % 2 ? '#ffffff' : '#86b4ff', g: -10, life: rnd(0.4, 0.8) });
    this.lastV = s.v;
    const pulse = (t * 46) % Math.max(20, fill + 24) - 12;
    const glowCols: [number, number, number][] = [];
    for (let xx = 0; xx < w; xx++) {
      const lit = xx < fill, after = !lit && xx < chip;
      if (xx < x0) {
        // the stipe: a narrow stem from a little holdfast
        for (const yy of [cy, cy + 1]) b.set(xx, yy, lit ? (yy === cy ? GL[5] : GL[3]) : (yy === cy ? KD[5] : KD[2]));
        b.set(xx, cy - 1, INK); b.set(xx, cy + 2, INK);
        continue;
      }
      // the blade: tapering in from the stem and out to the tip, its margins ruffled (the frill steps in and out)
      const taper = Math.min(1, (xx - x0 + 1) / 7) * Math.min(1, (w - 1 - xx) / 10);
      const hw = 3.4 * taper;
      const rt = Math.sin(xx * 1.05) > 0.4 ? 1 : 0, rb = Math.sin(xx * 1.05 + 2.4) > 0.4 ? 1 : 0;
      const top = Math.max(1, Math.round(cy - hw) + rt), bot = Math.min(h - 2, Math.round(cy + 1 + hw) - rb);
      if (bot < top) continue;
      b.set(xx, top - 1, INK); b.set(xx, bot + 1, INK);
      if (lit) glowCols.push([xx, top - 1, bot + 1]);
      const near = Math.abs(xx - pulse) <= 3;
      const vein = (xx - x0) % 5 === 0; // the blade's cells, divided by faint veins
      for (let yy = top; yy <= bot; yy++) {
        const edge = yy === top || yy === bot, mid = yy === cy, lower = yy > cy;
        let c: U;
        if (lit) {
          c = mid ? (near ? GL[6] : GL[5]) : edge ? (lower ? GL[1] : GL[3]) : vein ? GL[2] : lower ? GL[3] : GL[4];
          if (near && !mid) c = edge ? GL[4] : GL[5];
          if (!mid && !edge && hash(xx, yy) < 0.08 && Math.sin(t * 5 + hash(yy, xx) * 30) > 0.55) c = GL[6]; // plankton twinkling
          if (xx >= fill - 1 && !edge) c = GL[6];                                                            // the glowing front
        } else if (after) c = mid ? GL[3] : edge ? GL[0] : GL[1];                                           // a dim afterglow
        else c = mid ? KD[5] : edge ? (lower ? KD[0] : KD[2]) : vein ? KD[1] : lower ? KD[2] : KD[3];
        b.set(xx, yy, c);
      }
    }
    // air bladders on the midrib at 25 / 50 / 75%: olive-gold when dark, lit white-violet once the mana reaches them
    for (const k of [0.25, 0.5, 0.75]) {
      const bx = x0 + Math.round(k * span), on = bx < fill;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) b.set(bx + dx, cy + dy, on ? GL[4] : BLAD[1]);
      b.set(bx, cy, on ? GL[6] : BLAD[3]); b.set(bx - 1, cy - 1, on ? GL[5] : BLAD[2]); b.set(bx + 1, cy + 1, on ? GL[2] : BLAD[0]);
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) if (b.get(bx + dx, cy + dy) === INK) b.set(bx + dx, cy + dy, INK);
    }
    b.put();
    ui.img(b.shadow(), x + 1, y + 1, { alpha: 0.45 });
    // the glow: a soft light hugging the lit blade's outline, breathing
    const ga = 0.16 + 0.08 * Math.sin(t * 2.4);
    for (const [gx, gt, gb] of glowCols) { ui.fill(x + gx, y + gt - 1, 1, 1, '#86b4ff', ga); ui.fill(x + gx, y + gb + 1, 1, 1, '#86b4ff', ga); }
    ui.img(b.cv, x, y);
    this.bits.draw(ui, s.dt);
  }
}

// ------------------------------------------------------------------ BOSS: the carved harpoon
const WD = P('#1a0e14', '#2e1a1c', '#48291f', '#653b27', '#845230', '#a26b3e', '#bd8751', '#d6a76c', '#ecca95');
const IR = P('#0c0e14', '#1e2230', '#363c4a', '#56606a', '#848e96', '#bcc4c8');
const RU = P('#5a2414', '#84391c', '#aa5626');
const LAC = P('#2a040c', '#6a0c1c', '#a8182a', '#d83440', '#ff6a5a', '#ffb8a0', '#fff0e8');
const RAW = P('#3a2210', '#5a3a1a', '#7a5228', '#e8c898', '#c8a070');
const TWINE = P('#5a3a14', '#c8913a', '#f2c66d', '#fff0b0');
export interface HarpoonState { v: number; chip: number; flash?: number; phase?: number; phases?: number; poise?: number; t: number; dt: number; alpha?: number }
export class HarpoonGauge {
  private b = new Buf();
  private bits = new Bits();
  private stat: Uint32Array = new Uint32Array(0);
  private key = '';
  private lastV = -1;
  /** the inlay channel's span (buffer px) */
  private ch = { l: 0, r: 0 };
  draw(ui: PixelUI, x: number, y: number, w: number, s: HarpoonState) {
    const h = 20, b = this.b, t = s.t, a = s.alpha ?? 1;
    const n = Math.max(1, s.phases ?? 1);
    const key = `${w}|${n}`;
    if (b.size(w, h) || key !== this.key) { this.key = key; this.paintStatic(w, h, n); }
    const { l, r } = this.ch, cw = r - l;
    const fill = l + Math.round(Math.max(0, Math.min(1, s.v)) * cw), chip = l + Math.round(Math.max(0, Math.min(1, s.chip)) * cw);
    if (this.lastV >= 0) {
      const dv = this.lastV - s.v;
      if (dv > 0.0005) {
        const k = Math.max(3, Math.min(16, Math.round(dv * cw / 2)));
        for (let i = 0; i < k; i++) {
          const wood = i % 3 === 0;
          this.bits.add({ x: x + fill + rnd(0, Math.max(2, dv * cw)), y: y + rnd(7, 12), vx: rnd(-40, 45), vy: rnd(-95, -35), c: wood ? '#d6a76c' : ['#a8182a', '#d83440', '#ff6a5a'][i % 3], w: wood ? 1 : 2, h: wood ? 3 : 2, g: 300, life: rnd(0.6, 1.0) });
        }
        for (let i = 0; i < 3; i++) this.bits.add({ x: x + fill, y: y + 9, vx: rnd(-70, 70), vy: rnd(-60, 10), c: '#fff0c0', g: 0, life: 0.18 });
      }
    }
    this.lastV = s.v;
    b.u.set(this.stat);
    const flash = s.flash ?? 0;
    const sheen = (t * 70) % Math.max(40, fill - l + 60) + l - 30;
    for (let yy = 7; yy <= 11; yy++) for (let xx = l; xx < r; xx++) {
      const i = yy * w + xx;
      if (xx < fill) {
        let k = yy === 7 ? 4 : yy === 8 ? ((xx + 3) % 17 < 11 ? 5 : 4) : yy === 11 ? 2 : 3;
        if (Math.abs(xx - sheen) < 3 && yy < 10) k = Math.min(6, k + 1);
        if (xx === fill - 1) k = 5;
        b.u[i] = flash > 0.5 ? LAC[6] : LAC[k];
      } else if (xx < chip) {
        // freshly broken: pale raw wood, splintered
        b.u[i] = flash > 0.3 ? WHITE : (xx * 3 + yy) % 7 === 0 ? RAW[1] : yy < 9 ? RAW[3] : RAW[4];
      }
    }
    // the collars sit over the inlay
    for (let k = 1; k < n; k++) { const cx = l + Math.round((k / n) * cw); for (let yy = 7; yy <= 11; yy++) for (let xx = cx - 1; xx <= cx + 2; xx++) b.u[yy * w + xx] = this.stat[yy * w + xx]; }
    // the notches every 10% stay readable over the inlay: a darker seam
    for (let k = 1; k < 10; k++) { const nx = l + Math.round((k / 10) * cw); if (nx < fill - 1) for (let yy = 8; yy <= 10; yy++) b.u[yy * w + nx] = LAC[2]; }
    // the phase collars: cracked and dulled once the health has fallen past them
    for (let k = 1; k < n; k++) {
      const cx = l + Math.round((k / n) * cw);
      if (cx >= fill) for (let d = 0; d < 7; d++) { const yy = 4 + d * 2 - (d > 3 ? 1 : 0); b.set(cx + (d % 2), Math.min(15, yy), IR[0]); }
    }
    // poise: a gold twine wound under the shaft
    const po = Math.max(0, Math.min(1, s.poise ?? 1));
    if (po < 0.999) for (let xx = l; xx < l + Math.round(po * cw); xx++) { b.set(xx, 17, (xx >> 1) % 2 ? TWINE[2] : TWINE[1]); b.set(xx, 18, TWINE[0]); if (xx % 4 === 0) b.set(xx, 17, TWINE[3]); }
    b.put();
    ui.img(b.shadow(), x + 2, y + 2, { alpha: 0.5 * a });
    ui.img(b.cv, x, y, { alpha: a });
    // the red cloth streamer off the butt, flowing in the current
    const sx = x + w - 3, sy = y + 13;
    for (let k = 0; k < 9; k++) {
      const yy = sy + k * 0.6 + Math.sin(t * 4 - k * 0.6) * (k / 9) * 2.5, xx = sx + k;
      ui.fill(Math.round(xx), Math.round(yy), 1, 2, k % 3 === 0 ? '#ff6a5a' : '#b8202e', a); ui.fill(Math.round(xx), Math.round(yy) + 2, 1, 1, '#5a0814', a);
    }
    this.bits.draw(ui, s.dt, a);
  }

  private paintStatic(w: number, h: number, n: number) {
    const b = this.b;
    b.clear();
    const headL = 28, tailL = 22, l = headL + 5, r = w - tailL - 2;
    this.ch = { l, r };
    // the shaft: wood with grain, lit top, shaded bottom, ink outline
    for (let x = headL - 2; x < w - 6; x++) for (let y = 3; y <= 15; y++) {
      let c: U;
      if (y === 3 || y === 15) c = INK;
      else if (y === 4) c = WD[7];
      else if (y === 14) c = WD[2];
      else if (y === 13) c = WD[3];
      else if (y === 5) c = (x + 7) % 23 < 15 ? WD[6] : WD[5];
      else if (y === 12) c = (x * 3) % 19 < 11 ? WD[4] : WD[3];
      else c = WD[5];
      b.set(x, y, c);
    }
    // the carved channel: a shadowed top wall, raw dark wood inside, a lit lower lip
    for (let x = l; x < r; x++) {
      b.set(x, 6, WD[0]);
      for (let y = 7; y <= 11; y++) b.set(x, y, (x + y * 5) % 13 === 0 ? RAW[1] : y === 9 && x % 7 < 4 ? RAW[1] : RAW[0]);
      b.set(x, 12, WD[7]);
    }
    b.set(l - 1, 6, WD[0]); for (let y = 7; y <= 11; y++) b.set(l - 1, y, WD[1]); b.set(r, 7, WD[6]);
    // notches every 10% on the shaft's top and bottom faces
    const cw = r - l;
    for (let k = 1; k < 10; k++) { const nx = l + Math.round((k / 10) * cw); b.set(nx, 4, WD[2]); b.set(nx + 1, 4, WD[8]); b.set(nx, 5, WD[3]); b.set(nx, 13, WD[1]); b.set(nx, 14, WD[1]); }
    // the head: a long barbed iron point with a bright cutting edge, a ridged socket lashed to the shaft, rust
    for (let x = 0; x <= 17; x++) {
      const hw = (x / 17) * 5.2;
      for (let y = 0; y < h; y++) {
        const dy = y + 0.5 - 9.5, ad = Math.abs(dy);
        if (ad > hw + 0.5) continue;
        b.set(x, y, ad > hw - 0.5 ? INK : Math.abs(dy) < 0.6 ? IR[5] : dy < 0 ? (ad > hw - 1.5 ? IR[5] : IR[4]) : ad > hw - 1.5 ? IR[1] : IR[2]);
      }
    }
    // the barbs, swept back from the blade's shoulders
    for (const sgn of [-1, 1]) for (let k = 0; k <= 9; k++) {
      const bx = 11 + k, edge = 9.5 + sgn * (4.2 + k * 0.62);
      for (let q = 0; q < 3 - Math.floor(k / 4); q++) { const yy = Math.round(edge - sgn * q); b.set(bx, yy, q === 0 ? INK : sgn < 0 ? (q === 1 ? IR[5] : IR[4]) : (q === 1 ? IR[2] : IR[3])); }
      b.set(bx, Math.round(edge + sgn), INK);
    }
    for (let x = 17; x <= headL + 2; x++) for (let y = 5; y <= 14; y++) {
      const e = y === 5 || y === 14, ridge = (x - 17) % 4 === 0;
      b.set(x, y, e ? INK : ridge ? IR[1] : y < 9 ? IR[4] : y === 9 ? IR[5] : IR[3]);
    }
    b.set(20, 7, IR[5]); b.set(21, 8, IR[1]); b.set(24, 11, IR[5]); b.set(25, 12, IR[1]);
    for (const [rx, ry] of [[7, 11], [12, 12], [19, 12], [22, 12], [14, 7]]) { b.set(rx, ry, RU[1]); b.set(rx + 1, ry, RU[0]); b.set(rx, ry - 1, RU[2]); }
    // twine lashing where the socket meets the shaft
    for (let x = headL - 1; x <= headL + 2; x++) for (let y = 3; y <= 15; y++) b.set(x, y, y === 3 || y === 15 ? ROPE[0] : (x + y) % 3 === 0 ? ROPE[2] : (x + y) % 3 === 1 ? ROPE[5] : ROPE[4]);
    // the butt: a rope binding (twisted, diagonal), then the end grain
    for (let x = w - tailL; x < w - 8; x++) for (let y = 2; y <= 16; y++) {
      const ph = (x + y) % 4;
      b.set(x, y, y === 2 || y === 16 ? ROPE[0] : ph === 0 ? ROPE[1] : ph === 1 ? ROPE[5] : ph === 2 ? ROPE[4] : ROPE[3]);
    }
    for (let x = w - 8; x < w - 3; x++) for (let y = 4; y <= 14; y++) b.set(x, y, x === w - 4 || y === 4 || y === 14 ? INK : (Math.abs(y - 9) + (x - (w - 8))) % 3 === 0 ? WD[3] : WD[6]);
    // the phase collars: iron bands round the shaft with rivets
    for (let k = 1; k < n; k++) {
      const cx = l + Math.round((k / n) * cw);
      for (let x = cx - 1; x <= cx + 2; x++) for (let y = 2; y <= 16; y++) b.set(x, y, y === 2 || y === 16 || x === cx + 2 ? INK : x === cx - 1 ? IR[4] : x === cx ? IR[3] : IR[2]);
      b.set(cx, 4, IR[5]); b.set(cx, 14, IR[5]); b.set(cx + 1, 4, IR[1]); b.set(cx + 1, 14, IR[1]);
    }
    this.stat = new Uint32Array(b.u);
  }
}
