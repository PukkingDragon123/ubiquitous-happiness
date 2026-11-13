// The SKILLS registry: every active skill (granted by items via ItemDef.skill, or the legacy ability cores).
//
//   SKILLS.megalodon.cast(world, player, aimX, aimY, level)
//   skillSlotsFor(stats)        the four slot ids for a stats object (granted skills first, then ability cores)
//
// Mage skills spend mana; everything has a cooldown (cut by cdr and set bonuses, see combat.skillMods).
import * as THREE from 'three';
import type { World } from '../game/types';
import type { Stats } from '../game/run';
import type { SkillDef, SkillCaster } from './types';
import { strike, foes, nearestFoe, blast, skillMods } from './combat';
import { applyStatus } from './status';
import { FX, emit } from './fx';
import { Projectile, Lightning, Effect, manaBoltShot } from './projectiles';
import { shardMesh, magmaMesh, inkBombMesh, vialMesh, netBallMesh } from './models';
import { PetCrab, Piranha, InkPal } from './summons';
import { JunkTurret, Ballista, SeaMine, NetTrap } from './gadgets';
import { MegalodonSummon } from './megalodon';
import { TAU } from '../core/math';

const pw = (p: SkillCaster, tags: string[]) => skillMods(p, tags).power;
const angTo = (p: SkillCaster, x: number, y: number) => Math.atan2(y - p.y, x - p.x);
/** clamp a target point to a max distance from the caster */
const reach = (p: SkillCaster, x: number, y: number, max: number) => { const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy); return d <= max ? { x, y } : { x: p.x + (dx / d) * max, y: p.y + (dy / d) * max }; };
/** keep at most n of a kind alive (the oldest goes; the world loop disposes it) */
const cap = (p: SkillCaster, kind: string, n: number) => { const mine = p.owned.filter((e) => e.alive && e.kind === kind); for (let i = 0; i <= mine.length - n; i++) mine[i].alive = false; };
const own = <T extends { alive: boolean; kind: string }>(w: World, p: SkillCaster, e: T) => { w.add(e as never); p.owned.push(e as never); return e; };

const legacy = (id: string, name: string, cd: number, color: string, desc: string, hold = false): SkillDef => ({
  id, name, tags: ['legacy'], cooldown: cd, color, desc, hold, cast: (w, p) => { p.legacy?.(id, w); },
});

export const SKILLS: Record<string, SkillDef> = {
  // ================================================================ mage
  manaBolt: {
    id: 'manaBolt', name: 'Mana Volley', tags: ['mage'], cooldown: 1.2, mana: 6, color: '#9a7aff',
    desc: 'Fire three homing mana bolts.',
    cast(w, p, x, y, lv) {
      const a = angTo(p, x, y), t = p.tip(new THREE.Vector3());
      const n = 3 + (lv - 1);
      for (let k = 0; k < n; k++) setTimeout(() => manaBoltShot(w, p, t.x, t.y, a + (k - (n - 1) / 2) * 0.32, 1.4 * pw(p, this.tags)), k * 60);
      w.sfx('magic1', p.x, 0.6); p.setExpr('focus', 0.4);
    },
  },
  frostNova: {
    id: 'frostNova', name: 'Frost Nova', tags: ['mage', 'frost'], cooldown: 7, mana: 14, color: '#8ae0ff',
    desc: 'A ring of ice shards bursts out; anything close freezes solid.',
    cast(w, p, _x, _y, lv) {
      const P = pw(p, this.tags), n = 14 + lv * 2;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU, sp = 9;
        w.add(new Projectile({ x: p.x + Math.cos(a) * 0.5, y: p.y + Math.sin(a) * 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 0.12, dmg: 1.2 * P, kind: 'spike', life: 0.55, src: p, mesh: shardMesh(), status: ['slow', 3], cutLines: true, trail: (ww, pr) => { if (Math.random() < 0.4) emit(ww, 'snow', pr.x, pr.y, { size: 0.08, life: 0.6 }); } }));
      }
      for (const e of foes(w, p.x, p.y, 2.8 + lv * 0.3)) { applyStatus(w, e, 'freeze', 2.2 + lv * 0.4, { src: p }); strike(w, p, e, 1.5 * P, e.x - p.x, e.y - p.y, 'spike', { quiet: true }); }
      FX.shock(w, p.x, p.y, 1.6, '#c8f4ff'); FX.magic(w, p.x, p.y, '#8ae0ff', 22); FX.light(w, p.x, p.y, '#8ae0ff', 8, 0.3);
      w.fx.emit('snow', p.x, p.y, { n: 40, spread: 1.4, speed: 2, life: 1.6, size: 0.06 });
      w.sfx('ice_big', p.x, 0.9); w.sfx('magic2', p.x, 0.5, 0.8); w.game.flash('#c8f4ff', 0.18); w.game.addShake(0.15);
      p.setExpr('attack', 0.5);
    },
  },
  chainZap: {
    id: 'chainZap', name: 'Chain Lightning', tags: ['mage', 'shock'], cooldown: 4, mana: 12, color: '#bff4ff',
    desc: 'Lightning leaps from your wand through up to five enemies.',
    cast(w, p, x, y, lv) {
      const P = pw(p, this.tags);
      const t = p.tip(new THREE.Vector3());
      let cur = nearestFoe(w, x, y, 3.5) ?? nearestFoe(w, p.x, p.y, 8, { dx: Math.cos(angTo(p, x, y)), dy: Math.sin(angTo(p, x, y)), cos: 0.5 });
      const pts: { x: number; y: number }[] = [{ x: t.x, y: t.y }];
      const hit = new Set();
      for (let k = 0; k < 4 + lv && cur; k++) {
        hit.add(cur); pts.push({ x: cur.x, y: cur.y });
        strike(w, p, cur, (2.4 - k * 0.25) * P, cur.x - pts[pts.length - 2].x, cur.y - pts[pts.length - 2].y, 'zap');
        applyStatus(w, cur, 'stun', 0.5, { src: p });
        FX.sparks(w, cur.x, cur.y, 10, undefined, 6, '#bff4ff');
        const from: { x: number; y: number } = cur;
        cur = foes(w, from.x, from.y, 4.5).filter((e) => !hit.has(e)).sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0] ?? null;
      }
      if (pts.length < 2) { const a = angTo(p, x, y); pts.push({ x: t.x + Math.cos(a) * 5, y: t.y + Math.sin(a) * 5 }); }
      // lines in the way get fried too
      for (const e of w.entities) if (e.alive && e.slash) for (let i = 0; i + 1 < pts.length; i++) e.slash(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, 6, w);
      w.add(new Lightning(pts, 0.3, '#bff4ff', 0.08)); w.add(new Lightning(pts, 0.2, '#ffffff', 0.03));
      FX.light(w, t.x, t.y, '#bff4ff', 8, 0.2); w.game.flash('#e0faff', 0.12);
      w.sfx('zap', p.x, 0.9); w.sfx('thunder', p.x, 0.4, 1.4);
    },
  },
  magmaOrb: {
    id: 'magmaOrb', name: 'Magma Orb', tags: ['mage', 'fire'], cooldown: 5, mana: 16, color: '#ff8a30',
    desc: 'Lob a ball of seafloor magma that bursts and sets enemies smouldering.',
    cast(w, p, x, y, lv) {
      const P = pw(p, this.tags), t = p.tip(new THREE.Vector3());
      const a = angTo(p, x, y), sp = 9;
      w.add(new Projectile({
        x: t.x, y: t.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, r: 0.2, dmg: 1, kind: 'explosion', life: 2.2, grav: -6, src: p, mesh: magmaMesh(), spin: 4,
        trail: (ww, pr) => { emit(ww, 'ember', pr.x, pr.y, { n: 2, spread: 0.1, speed: 0.6, color: '#ff8a30', life: 0.6, size: 0.14 }); if (Math.random() < 0.5) emit(ww, 'bubble', pr.x, pr.y, { size: 0.08 }); },
        onEnd: (ww, pr) => {
          FX.boom(ww, pr.x, pr.y, 1.1 + lv * 0.15);
          for (const e of blast(ww, p, pr.x, pr.y, 2.3 + lv * 0.25, 3.5 * P, 'explosion', { gore: 0.8 })) applyStatus(ww, e, 'burn', 3, { dps: 1 * P, src: p });
          ww.sfx('boom_uw1', pr.x, 0.9); ww.game.addShake(0.25);
        },
      }));
      w.sfx('magic_whoosh1', p.x, 0.7, 0.7); w.sfx('lp_fire', p.x, 0.3);
    },
  },
  bubbleBarrage: {
    id: 'bubbleBarrage', name: 'Bubble Barrage', tags: ['mage', 'water'], cooldown: 3, mana: 10, color: '#8ff1da',
    desc: 'Blow a burst of hard bubbles that pop for damage and shove enemies away.',
    cast(w, p, x, y, lv) {
      const P = pw(p, this.tags), t = p.tip(new THREE.Vector3()), a = angTo(p, x, y);
      for (let k = 0; k < 7 + lv * 2; k++) setTimeout(() => {
        const aa = a + (Math.random() - 0.5) * 0.5, sp = 6 + Math.random() * 3;
        w.add(new Projectile({ x: t.x, y: t.y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, r: 0.18, dmg: 0.9 * P, kind: 'zap', life: 1.1, drag: 1.2, src: p, knock: 5, cutLines: true,
          trail: (ww, pr) => emit(ww, 'bubbleBig', pr.x, pr.y, { n: 1, size: 0.22, life: 0.08, vy: 0 }),
          onEnd: (ww, pr) => { emit(ww, 'bubble', pr.x, pr.y, { n: 6, spread: 0.15, speed: 1.6 }); ww.sfx('pop', pr.x, 0.3, 1 + Math.random()); } }));
      }, k * 45);
      w.sfx('bubbles_a', p.x, 0.8);
    },
  },
  // ================================================================ warrior
  whirlwind: {
    id: 'whirlwind', name: 'Whirlwind', tags: ['warrior'], cooldown: 6, color: '#ffd080',
    desc: 'Spin your blade in a whirling storm of steel for a moment.',
    cast(w, p, _x, _y, lv) {
      const b = p as SkillCaster & { whirl?: (d: number, m: number) => void };
      b.whirl?.(1.1 + lv * 0.25, 0.9 * pw(p, this.tags));
      w.add(new Effect(p.x, p.y, 1.1 + lv * 0.25, (ww, e) => { e.x = p.x; e.y = p.y; if (Math.random() < 0.6) emit(ww, 'bubble', p.x + (Math.random() - 0.5) * 1.6, p.y + (Math.random() - 0.5) * 1.6, { size: 0.1, vx: (Math.random() - 0.5) * 4 }); }));
      FX.shock(w, p.x, p.y, 1, '#ffe8b0'); w.sfx('sw_swish', p.x, 0.8, 0.7);
      w.text.pop('WHIRLWIND!', p.x, p.y + 1, 'shout', { size: 0.32 });
    },
  },
  shieldBash: {
    id: 'shieldBash', name: 'Clam Bash', tags: ['warrior'], cooldown: 5, color: '#e8c890',
    desc: 'Charge behind your clam shield: stun and fling whatever you hit.',
    cast(w, p, x, y, lv) {
      const a = angTo(p, x, y), dx = Math.cos(a), dy = Math.sin(a);
      p.lunge(dx, dy, 13);
      p.invuln = Math.max(p.invuln, 0.4);
      const hit = new Set();
      w.add(new Effect(p.x, p.y, 0.4, (ww) => {
        for (const e of foes(ww, p.x + dx * 0.6, p.y + dy * 0.6, 0.9)) {
          if (hit.has(e)) continue; hit.add(e);
          strike(ww, p, e, 2 * pw(p, ['warrior']), dx, dy + 0.3, 'crush', { stopTime: 0.06 });
          applyStatus(ww, e, 'stun', 1.2 + lv * 0.3, { src: p });
          e.vx += dx * 9; e.vy += dy * 9 + 2;
          ww.sfx('clank', e.x, 0.9, 0.8); ww.game.addShake(0.2);
          FX.shock(ww, e.x, e.y, 0.7, '#fff0c0');
        }
      }));
      w.sfx('swish_b', p.x, 0.8, 0.8); p.setExpr('attack', 0.5);
    },
  },
  warCry: {
    id: 'warCry', name: 'Conch War Cry', tags: ['warrior'], cooldown: 14, color: '#ff8a5a',
    desc: 'Blow the war conch: enemies reel back stunned and your hits land 50% harder for 6 s.',
    cast(w, p, _x, _y, lv) {
      p.buff('dmg', 1.5 + (lv - 1) * 0.15, 6);
      for (const e of foes(w, p.x, p.y, 5)) { applyStatus(w, e, 'stun', 1 + lv * 0.3, { src: p }); const d = Math.hypot(e.x - p.x, e.y - p.y) || 1; e.vx += ((e.x - p.x) / d) * 7; e.vy += ((e.y - p.y) / d) * 7; }
      for (let i = 0; i < 3; i++) setTimeout(() => FX.shock(w, p.x, p.y, 1 + i * 0.7, '#ffb080'), i * 110);
      w.text.pop('RAAAAH!', p.x, p.y + 1.1, 'danger', { size: 0.45 });
      w.sfx('honk', p.x, 1, 0.6); w.sfx('roar', p.x, 0.4, 1.5); w.game.addShake(0.3);
      p.playAnim?.('cheer'); setTimeout(() => p.playAnim?.('swim'), 700);
      p.setExpr('attack', 1);
    },
  },
  // ================================================================ summoner / toymaker
  megalodon: {
    id: 'megalodon', name: 'Wind-Up Megalodon', tags: ['summoner'], cooldown: 45, color: '#9ab8d8',
    desc: 'Toss a clockwork shark that smells of chum. Something enormous comes to eat it, and everything near it.',
    cast(w, p, x, y, lv) {
      w.add(new MegalodonSummon(w, p, x, y, lv, pw(p, this.tags)));
      p.setExpr('happy', 0.8);
    },
  },
  piranhas: {
    id: 'piranhas', name: 'Piranha Jar', tags: ['summoner'], cooldown: 12, color: '#ff6a4a',
    desc: 'Uncork the jar: a hungry school of piranhas strips anything nearby.',
    cast(w, p, _x, _y, lv) {
      const P = pw(p, this.tags);
      for (let k = 0; k < 5 + lv; k++) own(w, p, new Piranha(p.x + p.facing * 0.5, p.y, p, P));
      w.fx.emit('glow', p.x, p.y, { color: '#a8e8ff', size: 1.2, life: 0.3 });
      emit(w, 'bubble', p.x, p.y, { n: 16, spread: 0.3, speed: 2 });
      w.sfx('pop', p.x, 0.8, 0.8); w.sfx('k_glass', p.x, 0.6);
    },
  },
  petCrab: {
    id: 'petCrab', name: 'Pet Crab', tags: ['summoner'], cooldown: 18, color: '#ff8a4a',
    desc: 'Your crab buddy scuttles along the seabed snipping at divers. Re-summon to swap him in fresh.',
    cast(w, p, _x, _y, lv) {
      cap(p, 'petCrab', lv >= 3 ? 2 : 1);
      own(w, p, new PetCrab(p.x, p.y, p, pw(p, this.tags) * (1 + (lv - 1) * 0.3)));
      FX.magic(w, p.x, p.y, '#ffb080', 10); w.sfx('crab_click1', p.x, 0.8);
    },
  },
  inkPal: {
    id: 'inkPal', name: 'Octopus Pal', tags: ['summoner', 'rogue'], cooldown: 16, color: '#d06ab0',
    desc: 'An octopus friend grabs the nearest diver, squeezes, and inks the whole crowd blind.',
    cast(w, p, _x, _y, lv) { own(w, p, new InkPal(p.x + p.facing * 0.4, p.y + 0.3, p, pw(p, this.tags) * (1 + (lv - 1) * 0.25))); FX.magic(w, p.x, p.y, '#f0a0d8', 10); w.sfx('gloop', p.x, 0.6, 1.3); },
  },
  // ================================================================ tinkerer
  junkTurret: {
    id: 'junkTurret', name: 'Junk Turret', tags: ['tinkerer'], cooldown: 14, color: '#d0a060',
    desc: 'Drop a tin-can turret that spits rusty nails at anything in range.',
    cast(w, p, x, y, lv) { cap(p, 'junkTurret', lv >= 2 ? 2 : 1); const t = reach(p, x, y, 6); own(w, p, new JunkTurret(t.x, t.y, p, pw(p, this.tags) * (1 + (lv - 1) * 0.2))); w.sfx('clank', p.x, 0.7); },
  },
  netTrap: {
    id: 'netTrap', name: 'Net Trap', tags: ['tinkerer'], cooldown: 8, color: '#e0c890',
    desc: 'Throw a weighted net: snares what it hits, or lies in wait on the seabed.',
    cast(w, p, x, y, lv) {
      const a = angTo(p, x, y), sp = 10, P = pw(p, this.tags);
      w.add(new Projectile({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 1.5, r: 0.35, dmg: 0.5 * P, kind: 'spike', life: 1.6, grav: -7, drag: 0.6, src: p, mesh: netBallMesh(), spin: 6, status: ['snare', 3.5 + lv * 0.5],
        onHit: (ww, _pr, e) => { ww.sfx('net1', e.x, 0.8); ww.text.pop('NETTED!', e.x, e.y + 1, 'gold', { size: 0.28 }); },
        onEnd: (ww, pr, why) => { if (why !== 'hit') own(ww, p, new NetTrap(pr.x, Math.max(pr.y, ww.terrain.floorAt(pr.x)), p, P)); } }));
      w.sfx('swish_c', p.x, 0.6, 0.8);
    },
  },
  seaMine: {
    id: 'seaMine', name: 'Sea Mine', tags: ['tinkerer', 'fire'], cooldown: 6, color: '#ff5040',
    desc: 'Moor a spiky mine where you aim. Anything that swims too close goes boom. (3 at a time.)',
    cast(w, p, x, y, lv) { cap(p, 'seaMine', 3 + (lv - 1)); const t = reach(p, x, y, 5); own(w, p, new SeaMine(t.x, Math.min(t.y, w.water.heightAt(t.x) - 0.8), p, pw(p, this.tags))); w.sfx('chain1', p.x, 0.6); w.sfx('k_tick2', p.x, 0.5); },
  },
  ballista: {
    id: 'ballista', name: 'Harpoon Ballista', tags: ['tinkerer'], cooldown: 22, color: '#c89060',
    desc: 'Deploy a ballista that fires huge piercing harpoons at the toughest thing in range.',
    cast(w, p, x, y, lv) { cap(p, 'ballista', 1); const t = reach(p, x, y, 5); own(w, p, new Ballista(t.x, t.y, p, pw(p, this.tags) * (1 + (lv - 1) * 0.25))); w.sfx('wood_knock1', p.x, 0.8); },
  },
  // ================================================================ rogue
  backstab: {
    id: 'backstab', name: 'Backstab', tags: ['rogue'], cooldown: 4, color: '#a060ff',
    desc: 'Vanish in a puff of ink and reappear behind your target for a brutal stab.',
    cast(w, p, x, y, lv) {
      const a = angTo(p, x, y);
      const e = nearestFoe(w, x, y, 3) ?? nearestFoe(w, p.x, p.y, 7.5, { dx: Math.cos(a), dy: Math.sin(a), cos: 0.4 });
      w.fx.emit('ink', p.x, p.y, { n: 8, spread: 0.3, speed: 1.5, size: 0.8, color: '#1a1030', alpha: 0.9, life: 1.5 });
      if (!e) { p.lunge(Math.cos(a), Math.sin(a), 14); w.sfx('swish_a', p.x, 0.6, 1.4); return; }
      const side = Math.sign(e.x - p.x) || 1;
      const bx = e.x + side * (e.r + 0.6), by = e.y + 0.1;
      const b = p as SkillCaster & { sb?: { place(x: number, y: number): void } };
      if (w.terrain.sdf(bx, by) > 0.4) { b.sb?.place(bx, by); p.x = bx; p.y = by; }
      p.facing = -side;
      p.aim.set(-side, 0);
      p.invuln = Math.max(p.invuln, 0.35);
      w.fx.emit('ink', p.x, p.y, { n: 6, spread: 0.3, speed: 1.2, size: 0.7, color: '#1a1030', alpha: 0.9, life: 1.2 });
      setTimeout(() => {
        if (!e.alive) return;
        const crit = (p.stats.sets?.rogue ?? 0) >= 6 ? 3.5 : 2.5;
        strike(w, p, e, p.stats.swordDmg * crit * (1 + (lv - 1) * 0.3) * pw(p, ['rogue']), -side, 0.2, 'sword', { gore: 1.2, crit: false, stopTime: 0.09 });
        w.text.pop('BACKSTAB!', e.x, e.y + e.r + 0.5, 'danger', { size: 0.34 });
        FX.sparks(w, e.x, e.y, 16, Math.PI * (side > 0 ? 1 : 0), 6, '#e0b0ff');
        w.sfx('sw_slash', e.x, 0.9, 0.8); w.game.addShake(0.2);
      }, 90);
      w.sfx('swish_c', p.x, 0.6, 1.5); p.setExpr('attack', 0.5);
    },
  },
  poisonCloud: {
    id: 'poisonCloud', name: 'Venom Cloud', tags: ['rogue', 'poison'], cooldown: 9, color: '#8aff5a',
    desc: 'Shatter a lionfish-venom vial: a green cloud that poisons everything inside.',
    cast(w, p, x, y, lv) {
      const a = angTo(p, x, y), sp = 9, P = pw(p, this.tags);
      w.add(new Projectile({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, r: 0.14, dmg: 0.3, kind: 'spike', life: 1.4, grav: -8, src: p, mesh: vialMesh(), spin: 8,
        onEnd: (ww, pr) => {
          ww.sfx('k_glass', pr.x, 0.8); ww.sfx('steam1', pr.x, 0.5);
          const cx = pr.x, cy = pr.y, R = 2.2 + lv * 0.3;
          ww.add(new Effect(cx, cy, 5, (www, ef, dt) => {
            if (Math.random() < dt * 30) www.fx.emit('ink', cx + (Math.random() - 0.5) * R * 1.6, cy + (Math.random() - 0.5) * R, { size: 0.9 + Math.random() * 0.6, color: '#3a8a2a', alpha: 0.55, life: 1.4, vy: 0.2 });
            if (Math.random() < dt * 20) emit(www, 'bubble', cx + (Math.random() - 0.5) * R * 1.6, cy + (Math.random() - 0.5) * R, { color: '#aaff7a', size: 0.1 });
            if (Math.floor(ef.t * 2) !== Math.floor((ef.t - dt) * 2)) for (const e of foes(www, cx, cy, R)) applyStatus(www, e, 'poison', 2.5, { dps: (1.2 + (p.stats.poison ?? 0)) * P, src: p });
          }));
        } }));
      w.sfx('swish_c', p.x, 0.5, 1.2);
    },
  },
  inkBomb: {
    id: 'inkBomb', name: 'Ink Bomb', tags: ['rogue'], cooldown: 7, color: '#6a5aa0',
    desc: 'Lob a squid-ink bomb: it bursts into a blinding cloud. Blind enemies lose track of you.',
    cast(w, p, x, y, lv) {
      const a = angTo(p, x, y), sp = 10, P = pw(p, this.tags);
      w.add(new Projectile({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, r: 0.15, dmg: 0.5, kind: 'explosion', life: 1.3, grav: -8, src: p, mesh: inkBombMesh(), spin: 5,
        trail: (ww, pr) => { if (Math.random() < 0.6) emit(ww, 'spark', pr.x, pr.y + 0.15, { color: '#ffd080', size: 0.12, life: 0.15 }); },
        onEnd: (ww, pr) => {
          for (let i = 0; i < 28; i++) ww.fx.emit('ink', pr.x, pr.y, { spread: 0.4, speed: 3, life: 3.4, size: 1.0 + Math.random(), color: '#140e28', alpha: 0.95 });
          for (const e of blast(ww, p, pr.x, pr.y, 3 + lv * 0.3, 1.2 * P, 'explosion', { quiet: true })) applyStatus(ww, e, 'blind', 4 + lv, { src: p });
          ww.emit('ink', { x: pr.x, y: pr.y, r: 3.2 });
          FX.shock(ww, pr.x, pr.y, 1, '#8a7ac0'); ww.sfx('gloop', pr.x, 0.9, 0.6); ww.sfx('boom_uw1', pr.x, 0.4, 1.4);
        } }));
      w.sfx('swish_c', p.x, 0.5);
    },
  },
  // ================================================================ legacy ability cores (implemented by the controller)
  rockBody: legacy('rockBody', 'Rock Body', 7, '#a39b90', 'Turn to stone: sink, shrug off hits, crush things you land on.'),
  laserEyes: legacy('laserEyes', 'Laser Eyes', 0, '#ff5a7a', 'Hold to fire twin eye lasers (energy recharges).', true),
  bubbleShield: legacy('bubbleShield', 'Bubble Shield', 10, '#8ff1da', 'A soap bubble that pops instead of you.'),
  inkCloud: legacy('inkCloud', 'Ink Cloud', 9, '#3a2a5a', 'Squirt a cloud of ink and slip away.'),
  zap: legacy('zap', 'Eel Zap', 6, '#bff4ff', 'Zap everything around you and fry nearby lines.'),
  puff: legacy('puff', 'Puffer Puff', 8, '#f0c040', 'Inflate into a spiky ball.'),
};

/** the four slot ids for a stats object: granted skills first (grid order), then ability cores */
export function skillSlotsFor(s: Stats): (string | null)[] {
  const ids: string[] = [];
  for (const id of s.skills ?? []) if (SKILLS[id] && !ids.includes(id)) ids.push(id);
  for (const a of s.abilities ?? []) if (SKILLS[a] && !ids.includes(a)) ids.push(a);
  const out: (string | null)[] = ids.slice(0, 4);
  while (out.length < 4) out.push(null);
  return out;
}
