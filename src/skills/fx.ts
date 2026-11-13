// FX adapter for skills: calls agent A's pixel FX helpers on Particles (gore, magic, explosion, sparks,
// shockwave, light, smoke, silt, muzzle) when they exist and falls back to the original sprite kinds.
import * as THREE from 'three';
import type { World } from '../game/types';
import type { PKind, Particles, EmitOpts } from '../gfx/particles';

type Dir = number | { x: number; y: number };
type FxPlus = Particles & Partial<{
  gore(x: number, y: number, amount?: number, dir?: Dir, z?: number): void;
  magic(x: number, y: number, color?: string, n?: number, z?: number): void;
  explosion(x: number, y: number, size?: number, z?: number): void;
  sparks(x: number, y: number, n?: number, dir?: number, speed?: number, color?: string, z?: number): void;
  shockwave(x: number, y: number, size?: number, color?: string, z?: number): void;
  light(x: number, y: number, color: string, intensity?: number, dur?: number): void;
  smoke(x: number, y: number, n?: number, z?: number): void;
  silt(x: number, y: number, n?: number, spread?: number, z?: number): void;
  muzzle(x: number, y: number, angle: number, size?: number, z?: number): void;
  bleed(x: number, y: number, k?: number, z?: number): void;
}>;
const F = (w: World) => w.fx as FxPlus;
/** emit any kind (new kinds from agent A fall back to 'glow' inside Particles if missing) */
export const emit = (w: World, k: string, x: number, y: number, o: EmitOpts & Record<string, unknown> = {}) => w.fx.emit(k as PKind, x, y, o);

export const FX = {
  gore(w: World, x: number, y: number, amount = 1, dir?: Dir) {
    const f = F(w);
    if (f.gore) return f.gore(x, y, amount, dir);
    w.fx.emit('goo', x, y, { n: Math.round(6 + amount * 8), speed: 2.5, color: '#b0182a', life: 1.2, size: 0.18 });
    w.fx.emit('ink', x, y, { n: Math.round(2 + amount * 2), speed: 0.6, color: '#7a0a14', alpha: 0.8, life: 2.4, size: 0.6 });
  },
  magic(w: World, x: number, y: number, color = '#8a7aff', n = 14) {
    const f = F(w);
    if (f.magic) return f.magic(x, y, color, n);
    w.fx.burst('star', x, y, n, 2.4, { color, life: 0.6, size: 0.14 });
    w.fx.emit('glow', x, y, { color, size: 1.2, life: 0.35 });
  },
  boom(w: World, x: number, y: number, size = 1) {
    const f = F(w);
    if (f.explosion) return f.explosion(x, y, size);
    w.fx.emit('glow', x, y, { color: '#ffd090', size: 2.5 * size, life: 0.3 });
    w.fx.emit('bubbleBig', x, y, { n: Math.round(16 * size), spread: 0.5 * size, speed: 3 * size, life: 2 });
    w.fx.debrisBurst(x, y, Math.round(8 * size), '#5a5048', 4 * size);
  },
  sparks(w: World, x: number, y: number, n = 10, dir?: number, speed = 5, color = '#ffffff') {
    const f = F(w);
    if (f.sparks) return f.sparks(x, y, n, dir, speed, color);
    w.fx.burst('spark', x, y, n, speed * 0.6, { color });
  },
  shock(w: World, x: number, y: number, size = 1, color = '#ffffff') {
    const f = F(w);
    if (f.shockwave) return f.shockwave(x, y, size, color);
    w.fx.emit('ring', x, y, { size: 0.3, size1: 2.4 * size, life: 0.4, color, alpha: 0.8, add: true });
  },
  light(w: World, x: number, y: number, color: string, intensity = 5, dur = 0.2) { F(w).light?.(x, y, color, intensity, dur); },
  smoke(w: World, x: number, y: number, n = 3) { const f = F(w); if (f.smoke) return f.smoke(x, y, n); w.fx.emit('dust', x, y, { n, spread: 0.3, speed: 0.6, size: 0.4, life: 1.5 }); },
  silt(w: World, x: number, y: number, n = 8, spread = 0.6) { const f = F(w); if (f.silt) return f.silt(x, y, n, spread); w.fx.emit('dust', x, y, { n, spread, speed: 1, size: 0.3, life: 1.5 }); },
  muzzle(w: World, x: number, y: number, ang: number, size = 1) { const f = F(w); if (f.muzzle) return f.muzzle(x, y, ang, size); w.fx.emit('glow', x, y, { color: '#ffd38a', size: 0.6 * size, life: 0.1 }); },
  bleed(w: World, x: number, y: number, k = 0.4) { const f = F(w); if (f.bleed) return f.bleed(x, y, k); w.fx.emit('goo', x, y, { color: '#a01020', size: 0.12, life: 0.8 }); },
};

export const col = (c: string) => new THREE.Color(c);

/** a tinted billowing cloud (agent A's 'smoke' volume sprite; grey, so it takes any colour) */
export function cloud(w: World, x: number, y: number, color: string, o: { n?: number; spread?: number; size?: number; life?: number; bright?: number; speed?: number } = {}) {
  const n = o.n ?? 6;
  for (let i = 0; i < n; i++) emit(w, 'smoke', x + (Math.random() - 0.5) * (o.spread ?? 0.6) * 2, y + (Math.random() - 0.5) * (o.spread ?? 0.6), {
    color, bright: o.bright ?? 1, size: (o.size ?? 1) * (0.7 + Math.random() * 0.5), size1: (o.size ?? 1) * 1.9, life: (o.life ?? 2.4) * (0.8 + Math.random() * 0.4),
    vx: (Math.random() - 0.5) * (o.speed ?? 0.8), vy: (Math.random() - 0.3) * (o.speed ?? 0.8), drag: 1.5, grav: 0, drift: 0.6, delay: Math.random() * 0.15,
  });
}
