// FX wrappers for the waves module. The particle system (src/gfx/particles.ts, agent A) grows gore / bleed /
// explosion / muzzle helpers; every call here is guarded and falls back to the basic emit kinds so the module
// works against either version.
import type { World } from '../game/types';
import type { Particles } from '../gfx/particles';

interface FxExt {
  gore?(x: number, y: number, amount?: number, dir?: number | { x: number; y: number }, z?: number): void;
  bleed?(x: number, y: number, k?: number, z?: number): void;
  gibs?(x: number, y: number, n: number, speed?: number, dir?: number, spreadAng?: number, z?: number): void;
  explosion?(x: number, y: number, size?: number, z?: number): void;
  muzzle?(x: number, y: number, angle: number, size?: number, z?: number): void;
  silt?(x: number, y: number, n?: number, spread?: number, z?: number): void;
  sparks?(x: number, y: number, n?: number, dir?: number, speed?: number, color?: string, z?: number): void;
  shockwave?(x: number, y: number, size?: number, color?: string, z?: number): void;
  smoke?(x: number, y: number, n?: number, z?: number): void;
  light?(x: number, y: number, color: string, intensity?: number, dur?: number): void;
}
const X = (w: World) => w.fx as unknown as Particles & FxExt;
type EmitKind = Parameters<Particles['emit']>[0];
const emit = (w: World, k: string, x: number, y: number, o: Record<string, unknown>) => { try { w.fx.emit(k as EmitKind, x, y, o); } catch { /* unknown kind on this particle version */ } };


/** a blood cloud bursting from a wound (amount ~ 0.3 graze .. 3 dismemberment) */
export function gore(w: World, x: number, y: number, amount = 1, dirX = 0, dirY = 0) {
  const f = X(w);
  if (typeof f.gore === 'function') f.gore(x, y, amount * 0.55, { x: dirX, y: dirY });
  else {
    // fallback (older particle set): a cloud of blood-red pixel puffs that bloom and drift, plus droplets
    const n = Math.round(4 + amount * 7);
    for (let i = 0; i < n; i++) emit(w, 'dust', x + (Math.random() - 0.5) * 0.25 * amount, y + (Math.random() - 0.5) * 0.25 * amount, { color: ['#d01818', '#a00c10', '#ff3020'][i % 3], size: 0.12 + Math.random() * 0.12, size1: 0.3 + amount * 0.18 + Math.random() * 0.2, life: 1.6 + amount * 0.8, vx: dirX * 1.2 + (Math.random() - 0.5) * (0.8 + amount), vy: dirY * 1.2 + (Math.random() - 0.5) * (0.6 + amount * 0.6) + 0.1, grav: 0, drag: 2.2 });
    emit(w, 'goo', x, y, { n: Math.round(2 + amount * 4), color: '#c02020', speed: 2 + amount, life: 0.8, size: 0.07 });
  }
  w.emit('gore', { x, y, k: amount });
}
/** a wisp of blood from a wound (call every frame or so while bleeding) */
export function bleed(w: World, x: number, y: number, k = 0.4) {
  const f = X(w);
  if (typeof f.bleed === 'function') f.bleed(x, y, k);
  else if (Math.random() < k) emit(w, 'dust', x, y, { color: ['#c01414', '#900c10', '#e02818'][(Math.random() * 3) | 0], size: 0.06 + k * 0.08, size1: 0.18 + k * 0.2, life: 1.6, vy: 0.12, grav: 0, drag: 3 });
}
/** flesh chunk sprites / gib bits */
export function gibBits(w: World, x: number, y: number, n: number, speed = 3) {
  const f = X(w);
  if (typeof f.gibs === 'function') f.gibs(x, y, n, speed);
  else w.fx.debrisBurst(x, y, n, '#8a1a18', speed, 0.07);
}
export function explosion(w: World, x: number, y: number, size = 1) {
  const f = X(w);
  if (typeof f.explosion === 'function') f.explosion(x, y, size);
  else {
    w.fx.burst('spark', x, y, Math.round(14 * size), 6 * size);
    emit(w, 'bubbleBig', x, y, { n: Math.round(16 * size), spread: 0.6 * size, speed: 3 * size, vy: 2 });
    emit(w, 'glow', x, y, { n: 1, size: 2.5 * size, life: 0.3, color: '#ffd080' });
    emit(w, 'ring', x, y, { n: 1, size: 0.4, size1: 4 * size, life: 0.45, alpha: 0.8, add: true, grav: 0 });
    w.fx.debrisBurst(x, y, Math.round(10 * size), '#6a645a', 5 * size, 0.1);
  }
}
export function muzzle(w: World, x: number, y: number, ang: number, size = 0.6) {
  const f = X(w);
  if (typeof f.muzzle === 'function') f.muzzle(x, y, ang, size);
  emit(w, 'bubble', x, y, { n: Math.round(6 * size + 3), spread: 0.08, vx: Math.cos(ang) * 2.5, vy: Math.sin(ang) * 2.5 + 0.5, speed: 1.2, life: 1.4, size: 0.09 });
}
export function silt(w: World, x: number, y: number, n = 6) {
  const f = X(w);
  if (typeof f.silt === 'function') f.silt(x, y, n);
  else emit(w, 'dust', x, y, { n, spread: 0.3, speed: 1.2, life: 1.6, grav: 0, drag: 2.5, size: 0.3 });
}
export function sparks(w: World, x: number, y: number, n = 8, dir?: number) {
  const f = X(w);
  if (typeof f.sparks === 'function') f.sparks(x, y, n, dir);
  else w.fx.burst('spark', x, y, n, 4);
}
export function flash(w: World, x: number, y: number, color: string, k = 6, dur = 0.12) {
  const f = X(w);
  if (typeof f.light === 'function') f.light(x, y, color, k, dur);
}
export function bubbles(w: World, x: number, y: number, n = 4, vy = 0.6) {
  emit(w, 'bubble', x, y, { n, spread: 0.12, vy, speed: 0.4, life: 2.4, size: 0.1 });
}
