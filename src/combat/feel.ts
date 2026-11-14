// Hit feel: hit-stop, shake, flashes, clangs, sparks, damage numbers. One place so every blow in the game
// (player, enemies, bosses) lands with the same weight.
import type { World } from '../game/types';
import { gore as waveGore } from '../waves/fx';

export type Weight = 'light' | 'heavy' | 'crit' | 'riposte';
const STOP: Record<Weight, number> = { light: 0.055, heavy: 0.1, crit: 0.12, riposte: 0.16 };
const SHAKE: Record<Weight, number> = { light: 0.06, heavy: 0.16, crit: 0.18, riposte: 0.26 };

/** a blade landing on flesh / shell at (x, y); ang = blow direction */
export function impact(w: World, x: number, y: number, ang: number, weight: Weight = 'light', o: { gore?: number; armour?: boolean; color?: string } = {}) {
  w.game.freeze(STOP[weight]);
  w.game.addShake(SHAKE[weight]);
  const crit = weight === 'crit' || weight === 'riposte';
  w.fx.hit(x, y, crit ? 'crit' : 'hit', ang, o.color ?? (crit ? '#fff0a0' : '#ffffff'));
  if (weight !== 'light') w.fx.slash(x, y, ang + Math.PI / 2, weight === 'heavy' ? 1.1 : 1.4, crit ? '#ffe070' : '#ffffff');
  if (o.armour) { w.fx.sparks(x, y, crit ? 16 : 9, ang, 6, '#ffe8b0'); w.sfx('clank', x, 0.6, 1.1); }
  else if (o.gore) waveGore(w, x, y, o.gore, Math.cos(ang), Math.sin(ang));
  w.sfx(weight === 'light' ? 'sw_slash' : 'hit_squish1', x, weight === 'light' ? 0.6 : 0.85, weight === 'light' ? 1.05 + Math.random() * 0.15 : 0.8);
  if (weight !== 'light') w.sfx('thud_heavy', x, crit ? 0.7 : 0.5, crit ? 1.2 : 1);
  if (crit) { w.game.flash('#fff6d0', 0.22); w.fx.light(x, y, '#fff0c0', 5, 0.14); }
}

/** steel on steel: a blocked blow (no damage) */
export function clang(w: World, x: number, y: number, ang: number, big = false) {
  w.game.freeze(big ? 0.08 : 0.04);
  w.game.addShake(big ? 0.14 : 0.07);
  w.fx.hit(x, y, 'block', ang);
  w.fx.sparks(x, y, big ? 18 : 10, ang + Math.PI, 7, '#ffe8b0');
  w.sfx('sw_clang', x, big ? 0.9 : 0.65, big ? 0.85 : 1.15);
}

/** the perfect parry: bright clang, long hit-stop, a white screen flash, a ring of sparks */
export function parryFlash(w: World, x: number, y: number, ang: number) {
  w.game.freeze(0.16);
  w.game.addShake(0.22);
  w.game.flash('#ffffff', 0.6);
  w.fx.hit(x, y, 'crit', ang, '#ffffff');
  w.fx.emit('ring', x, y, { size: 0.5, size1: 2.6, life: 0.35, color: '#ffffff', spread: 0, add: true, z: 0.6 });
  w.fx.emit('shock', x, y, { size: 1.6, life: 0.3, color: '#d8f0ff', spread: 0, z: 0.5 });
  w.fx.sparks(x, y, 26, ang + Math.PI, 9, '#fff6d0');
  w.fx.light(x, y, '#ffffff', 9, 0.18);
  w.sfx('sw_parry', x, 1, 1.05); w.sfx('sw_clang', x, 0.8, 1.6); w.sfx('k_glass', x, 0.5, 2);
}

/** a damage number (3D when world.text is a Float3D) */
export function dmgNumber(w: World, n: number, x: number, y: number, crit = false) {
  if (n <= 0) return;
  const s = n >= 10 ? String(Math.round(n)) : String(+n.toFixed(1));
  w.text.pop(s + (crit ? '!' : ''), x + (Math.random() - 0.5) * 0.3, y, 'damage', { size: crit ? 0.6 : 0.4, life: crit ? 1.2 : 0.85, vy: 1.4 });
}

/** a call-out over a fighter (PARRY!, STAGGER, GUARD BREAK...) */
export function callout(w: World, text: string, x: number, y: number, style: 'gold' | 'danger' | 'hint' | 'shout' = 'gold', size = 0.42) {
  w.text.pop(text, x, y, style, { size, life: 1, vy: 0.7 });
}
