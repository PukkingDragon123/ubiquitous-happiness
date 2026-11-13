// Struggle QTEs, drawn diegetically next to the blobfish: hand-painted pixel keycaps inside wobbling bubbles,
// a brass ring gauge with a sweet-spot wedge, popping bubbles for each correct press. No panels, no bars.
//
//   mash   – tap SPACE fast: each tap squashes the keycap and fills the ring of pearls
//   hold   – hold SPACE: a needle sweeps the gauge; release inside the wedge
//   push   – press the arrow sequence in order; each correct key pops its bubble
//   timing – (nibble) a ring closes in on the bait; press E when it lines up
import * as THREE from 'three';
import { Px, hex, ramp, mix } from '../gfx/px';
import type { Input } from '../core/input';
import { audio } from '../audio/audio';
import { easeOutBack, clamp01, TAU } from '../core/math';
import { textTexture } from '../ui/text';

export type QteKind = 'mash' | 'hold' | 'push' | 'timing';
type Key = 'Space' | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'KeyE';
const KEY_LABEL: Record<Key, string> = { Space: 'SPACE', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', KeyE: 'E' };
const KEY_ALT: Partial<Record<Key, string>> = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD' };

const keyTex = new Map<string, THREE.Texture>();
/** a chunky pixel keycap: bevelled cream plastic with a shadowed side, painted label */
function keycap(label: string, wide: boolean, pressed: boolean): THREE.Texture {
  const k = label + wide + pressed;
  const hit = keyTex.get(k);
  if (hit) return hit;
  const W = wide ? 56 : 28, H = 28;
  const p = new Px(W, H);
  const off = pressed ? 2 : 0;
  const face = ramp(['#b8a888', '#e8dcc0', '#fff8e6'], 3);
  // shadow / side
  p.rect(1, 4, W - 2, H - 5, '#5a4a38');
  p.rect(2, 3, W - 4, H - 4, '#8a7656');
  // top face
  for (let y = 2 + off; y < H - 6 + off; y++) for (let x = 3; x < W - 3; x++) {
    const t = 1 - (y - 2 - off) / (H - 8);
    p.set(x, y, face(0.35 + t * 0.6, x, y));
  }
  p.rect(4, 3 + off, W - 8, 1, '#ffffff');
  p.outline('#1c140c');
  const cv = p.canvas();
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const t = textTexture(label, { font: label.length > 1 ? 'Tiny5' : 'M6x11', px: label.length > 1 ? 8 : 16, fill: '#3a2a1a' });
  const img = t.tex.image as HTMLCanvasElement;
  ctx.drawImage(img, Math.round((W - img.width) / 2), Math.round((H - 6 - img.height) / 2) + off + 1);
  const tx = new THREE.CanvasTexture(cv);
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.colorSpace = THREE.SRGBColorSpace;
  keyTex.set(k, tx);
  return tx;
}

let bubbleTex: THREE.Texture | null = null;
function bubble(): THREE.Texture {
  if (bubbleTex) return bubbleTex;
  const p = new Px(48, 48);
  p.ellipse(24, 24, 23, 23, (nx, ny) => { const d = Math.hypot(nx, ny); return d > 0.9 ? [200, 250, 255] : d > 0.82 ? [120, 210, 240] : null; });
  p.ellipse(24, 24, 20, 20, (nx, ny) => mix([60, 150, 200], [150, 230, 255], clamp01(-ny * 0.5 + 0.3)), 50);
  p.rect(11, 10, 5, 2, '#ffffff'); p.rect(10, 12, 2, 4, '#ffffff'); p.rect(34, 35, 2, 2, '#e0fbff');
  bubbleTex = p.texture({ mip: false });
  return bubbleTex;
}

function spriteOf(tex: THREE.Texture, w: number, h: number) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(w, h, 1);
  s.renderOrder = 120;
  return s;
}

export interface QteResult { ok: boolean; quality: number; kind: QteKind }

export class QTE {
  group = new THREE.Group();
  kind: QteKind | null = null;
  t = 0; dur = 0;
  private fill = 0;
  private seq: Key[] = [];
  private seqI = 0;
  private needle = 0; private wedge = 0; private wedgeW = 0.6; private holding = false; private held = false;
  private cb: ((r: QteResult) => void) | null = null;
  private sprites: THREE.Sprite[] = [];
  private gaugeCv = document.createElement('canvas');
  private gaugeTex: THREE.CanvasTexture;
  private gauge: THREE.Sprite;
  private pulse = 0;
  private done = 0;
  private result: QteResult | null = null;
  timingTarget = 0;

  constructor() {
    this.gaugeCv.width = 64; this.gaugeCv.height = 64;
    this.gaugeTex = new THREE.CanvasTexture(this.gaugeCv);
    this.gaugeTex.magFilter = THREE.NearestFilter; this.gaugeTex.minFilter = THREE.NearestFilter; this.gaugeTex.generateMipmaps = false; this.gaugeTex.colorSpace = THREE.SRGBColorSpace;
    this.gauge = spriteOf(this.gaugeTex, 1.6, 1.6);
    this.group.add(this.gauge);
    this.gauge.visible = false;
  }

  get active() { return this.kind !== null; }

  start(kind: QteKind, cb: (r: QteResult) => void, o: { dur?: number; len?: number; difficulty?: number } = {}) {
    this.clear();
    this.kind = kind; this.cb = cb; this.t = 0; this.fill = 0; this.seqI = 0; this.done = 0; this.result = null;
    const d = o.difficulty ?? 1;
    this.dur = o.dur ?? (kind === 'mash' ? 1.8 : kind === 'hold' ? 3.2 : kind === 'push' ? 2.4 : 1.6) / Math.sqrt(d);
    if (kind === 'push') {
      const keys: Key[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      this.seq = Array.from({ length: o.len ?? 3 + Math.round(d - 1) }, () => keys[Math.floor(Math.random() * 4)]);
      this.seq.forEach((k, i) => { const s = spriteOf(keycap(KEY_LABEL[k], false, false), 0.36, 0.36); const b = spriteOf(bubble(), 0.56, 0.56); b.userData.i = i; s.userData.i = i; this.group.add(b, s); this.sprites.push(b, s); });
    } else if (kind === 'mash' || kind === 'hold' || kind === 'timing') {
      const key: Key = kind === 'timing' ? 'KeyE' : 'Space';
      const s = spriteOf(keycap(KEY_LABEL[key], key === 'Space', false), key === 'Space' ? 0.72 : 0.36, 0.36);
      const b = spriteOf(bubble(), key === 'Space' ? 0.95 : 0.6, key === 'Space' ? 0.95 : 0.6);
      this.group.add(b, s); this.sprites.push(b, s);
      this.gauge.visible = true;
      if (kind === 'hold') { this.needle = 0; this.wedge = 0.45 + Math.random() * 0.4; this.wedgeW = 0.16 / Math.sqrt(d) + 0.05; this.holding = false; this.held = false; }
      if (kind === 'timing') this.timingTarget = 0.55 + Math.random() * 0.3;
    }
    audio.play('k_pluck', { vol: 0.5, rate: 1.3 });
  }

  private clear() { for (const s of this.sprites) { this.group.remove(s); s.material.dispose(); } this.sprites = []; this.gauge.visible = false; }

  private finish(ok: boolean, quality: number) {
    if (this.result) return;
    this.result = { ok, quality, kind: this.kind! };
    this.done = 0.001;
    audio.play(ok ? 'k_confirm' : 'k_err', { vol: 0.6 });
    if (ok) audio.play('pop', { vol: 0.5, rate: 1.2 });
  }

  update(dt: number, input: Input, ax: number, ay: number, time: number) {
    if (!this.kind) return;
    this.pulse = Math.max(0, this.pulse - dt * 6);
    if (this.done > 0) {
      // result pop: everything bursts outward then disappears
      this.done += dt;
      const k = this.done / 0.3;
      for (const s of this.sprites) { s.material.opacity = 1 - k; s.scale.multiplyScalar(1 + dt * 3); }
      this.gauge.material.opacity = 1 - k;
      if (k >= 1) { const r = this.result!, cb = this.cb; this.kind = null; this.clear(); this.gauge.material.opacity = 1; cb?.(r); }
      return;
    }
    this.t += dt;
    const k = this.kind;
    const intro = easeOutBack(clamp01(this.t / 0.25), 2.2);
    const bob = Math.sin(time * 5) * 0.04;
    if (k === 'mash') {
      if (input.keyHit('Space')) { this.fill += 0.13; this.pulse = 1; audio.play('bub', { vol: 0.35, rate: 0.9 + this.fill * 0.6 }); }
      this.fill = Math.max(0, this.fill - dt * 0.18);
      if (this.fill >= 1) this.finish(true, 1 - this.t / this.dur);
      else if (this.t > this.dur) this.finish(false, this.fill);
    } else if (k === 'hold') {
      const down = input.key('Space');
      if (down) { this.holding = true; this.needle += dt / (this.dur * 0.55); }
      if (this.holding && !down && !this.held) {
        this.held = true;
        const d = Math.abs(this.needle - this.wedge);
        this.finish(d < this.wedgeW / 2, 1 - d / this.wedgeW);
      }
      if (this.needle > 1.02 || this.t > this.dur) this.finish(false, 0);
    } else if (k === 'push') {
      const want = this.seq[this.seqI];
      for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD']) {
        if (!input.keyHit(code)) continue;
        if (code === want || KEY_ALT[want] === code) {
          this.seqI++; this.pulse = 1;
          audio.play('pop', { vol: 0.45, rate: 1 + this.seqI * 0.12 });
          if (this.seqI >= this.seq.length) this.finish(true, 1 - this.t / this.dur);
        } else { this.finish(false, this.seqI / this.seq.length); }
        break;
      }
      if (this.t > this.dur) this.finish(false, this.seqI / this.seq.length);
    } else if (k === 'timing') {
      const ring = 1 - this.t / this.dur; // closes from 1 to 0
      if (input.keyHit('KeyE')) { const d = Math.abs(ring - (1 - this.timingTarget)); this.finish(d < 0.12, 1 - d / 0.12); }
      if (this.t > this.dur) this.finish(false, 0);
    }
    // ---- place sprites
    const cx = ax, cy = ay + 1.15 + bob;
    if (k === 'push') {
      const n = this.seq.length;
      for (const s of this.sprites) {
        const i = s.userData.i as number;
        const x = cx + (i - (n - 1) / 2) * 0.62;
        const popped = i < this.seqI;
        const cur = i === this.seqI;
        const sc = popped ? 0 : intro * (cur ? 1.15 + this.pulse * 0.2 + Math.sin(time * 12) * 0.04 : 0.9);
        s.position.set(x, cy + (cur ? 0.08 : 0) + Math.sin(time * 4 + i) * 0.03, 2);
        const base = s.material.map === bubble() ? 0.56 : 0.36;
        s.scale.set(base * sc, base * sc, 1);
      }
    } else {
      const [b, s] = this.sprites;
      const sq = 1 - this.pulse * 0.25;
      const bw = ((s.material.map as THREE.Texture).image as HTMLCanvasElement).width > 30 ? 0.95 : 0.6;
      b.position.set(cx, cy, 2); s.position.set(cx, cy - this.pulse * 0.03, 2.01);
      b.scale.set(bw * intro / sq, bw * intro * sq, 1);
      const kw = bw > 0.9 ? 0.72 : 0.36;
      s.scale.set(kw * intro / sq, 0.36 * intro * sq, 1);
      if (this.kind === 'hold' && this.holding) s.material.map = keycap('SPACE', true, true); else if (this.kind !== 'timing') s.material.map = keycap('SPACE', true, this.pulse > 0.5);
      this.gauge.position.set(cx, cy, 1.99);
      this.gauge.scale.setScalar((bw + 0.7) * intro);
      this.drawGauge(time);
    }
  }

  /** the brass ring around the key: pearls for mash, needle+wedge for hold, closing ring for timing */
  private drawGauge(time: number) {
    const c = this.gaugeCv.getContext('2d')!;
    const img = c.createImageData(64, 64);
    const put = (x: number, y: number, col: [number, number, number], a = 255) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x > 63 || y > 63) return;
      const i = (y * 64 + x) * 4; img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = a;
    };
    const ring = (r: number, col: (a: number) => [number, number, number] | null, th = 1) => {
      for (let i = 0; i < 720; i++) {
        const a = (i / 720) * TAU;
        const cc = col(a);
        if (!cc) continue;
        for (let t = 0; t < th; t++) put(32 + Math.sin(a) * (r + t), 32 - Math.cos(a) * (r + t), cc);
      }
    };
    const brass: [number, number, number] = hex('#c8a050'), dark: [number, number, number] = hex('#4a3010'), lit: [number, number, number] = hex('#ffe8a0');
    ring(29, () => dark, 2);
    ring(27, (a) => (a < Math.PI ? lit : brass), 2);
    if (this.kind === 'mash') {
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, on = i / n < this.fill;
        const px = 32 + Math.sin(a) * 27, py = 32 - Math.cos(a) * 27;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 4) put(px + dx, py + dy, on ? (dx < 0 && dy < 0 ? [255, 255, 255] : hex('#ffd0e0')) : hex('#3a2a20'));
      }
    } else if (this.kind === 'hold') {
      const w0 = (this.wedge - this.wedgeW / 2) * TAU, w1 = (this.wedge + this.wedgeW / 2) * TAU;
      ring(23, (a) => (a >= w0 && a <= w1 ? (Math.floor(time * 10) % 2 ? hex('#7dff8a') : hex('#3ad060')) : hex('#2a3a4a')), 4);
      const na = this.needle * TAU;
      for (let r = 6; r < 28; r++) put(32 + Math.sin(na) * r, 32 - Math.cos(na) * r, r > 24 ? [255, 255, 255] : hex('#ff3a3a'));
    } else if (this.kind === 'timing') {
      const target = (1 - this.timingTarget);
      const cur = 1 - this.t / this.dur;
      ring(8 + target * 20, () => hex('#7dff8a'), 2);
      ring(8 + cur * 20, () => [255, 255, 255], 1);
    }
    c.putImageData(img, 0, 0);
    this.gaugeTex.needsUpdate = true;
  }

  cancel() { this.kind = null; this.cb = null; this.clear(); }
}
