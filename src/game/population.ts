// Populating the dives with creatures from the creatures module: biome-appropriate groups at the right depths,
// off-screen ambient respawns as you explore the endless ocean (and despawns far behind you), ambushes for
// mystery nodes, and creature bosses (Old Ichthy, Mother Angler) that sometimes take an elite node.
import type { World, Entity } from './types';
import type { Biome } from '../world/biomes';
import type { DiveNode } from './dive';
import { CREATURES, spawnCreature, CreatureInfo } from '../creatures';
import { preloadFish } from '../fish';
import { ITEMS } from './items';
import { clamp } from '../core/math';

/** creature drops use their own ids; map them onto real items (with a small chance of an ability core) */
const ALIAS: Record<string, [string, string?, number?]> = {
  piranha_tooth: ['sharkTooth'], barracuda_fang: ['sharkTooth'], crab_claw: ['crabClaw'], ichthy_fang: ['sharkNecklace'], angler_lantern: ['anglerLantern'],
  puffer_spine: ['urchinSpine', 'pufferSpines', 0.2], eel_skin: ['lineScrap', 'eelBattery', 0.2], glow_bulb: ['glassLens', 'anglerLantern', 0.2],
};
export function resolveDrop(id: string, r: number): string | null {
  if (ITEMS[id]) return id;
  const a = ALIAS[id];
  if (!a) return null;
  return a[1] && r < (a[2] ?? 0) ? a[1] : a[0];
}

const SPECIES_OF: Record<string, string[]> = {
  reef: ['piranha', 'cichlid', 'pufferfish', 'triggerfish', 'sardine', 'unicornfish', 'snapper', 'stingray', 'crab', 'jellyfish', 'sea_turtle', 'cleaner_wrasse'],
  kelp: ['piranha', 'cichlid', 'pike', 'peacock_bass', 'sardine', 'pumpkinseed', 'crab', 'moray', 'stingray'],
  harbor: ['piranha', 'barracuda', 'grouper', 'pike', 'crab', 'sardine', 'moray', 'jellyfish'],
  arctic: ['pike', 'jellyfish', 'crab', 'sardine', 'orca', 'stingray_blue'],
  abyss: ['anglerfish', 'jellyfish', 'sea_cucumber', 'sperm_whale'],
  sunset: ['piranha', 'pufferfish', 'barracuda', 'cichlid', 'unicornfish', 'sardine', 'snapper', 'sea_turtle'],
};

function eligible(b: Biome, teams: string[]) {
  return CREATURES.filter((c) => !c.boss && c.rarity > 0 && (c.biomes as string[]).includes(b.id) && teams.includes(c.team));
}

function spawnGroup(w: World, c: CreatureInfo, x: number, out: Entity[]) {
  const fl = w.terrain.floorAt(x);
  const lo = Math.max(c.depth[0], fl + 0.8), hi = Math.min(c.depth[1], -1.5);
  if (lo > hi && !c.floor) return;
  const n = c.group ? w.rng.int(c.group[0], c.group[1]) : 1;
  for (let i = 0; i < n; i++) {
    const xx = x + (w.rng.next() - 0.5) * 3;
    const y = c.floor ? w.terrain.floorAt(xx) + 0.45 : clamp(lo + (hi - lo) * w.rng.next(), fl + 0.8, -1.5);
    try { out.push(spawnCreature(c.kind, w, xx, y)); } catch (e) { console.warn('spawn failed', c.kind, e); }
    if (c.kind === 'sardines' || c.kind === 'cleaner_wrasse' || c.kind === 'sea_turtle') break;
  }
}

export function preloadBiome(b: Biome) {
  try { preloadFish(SPECIES_OF[b.id] ?? SPECIES_OF.reef); } catch (e) { console.warn(e); }
}

export function populate(w: World, b: Biome, node: DiveNode, x0: number, x1: number) {
  preloadBiome(b);
  const out: Entity[] = [];
  const enemies = eligible(b, ['enemy']), calm = eligible(b, ['neutral']), friends = eligible(b, ['friend']);
  const groups = 4 + Math.round(node.difficulty * 1.5);
  for (let i = 0; i < groups; i++) {
    const x = x0 + (x1 - x0) * w.rng.next();
    if (Math.abs(x - (-18)) < 7) continue; // the arrival point stays calm
    const pool = w.rng.next() < 0.45 + node.difficulty * 0.06 ? enemies : calm;
    if (!pool.length) continue;
    spawnGroup(w, w.rng.weighted(pool, (c) => c.rarity), x, out);
  }
  // always a friend or two: a sardine school near the start, something rare further out
  const sard = friends.find((f) => f.kind === 'sardines');
  if (sard) spawnGroup(w, sard, -10, out);
  if (friends.length) spawnGroup(w, w.rng.weighted(friends, (c) => c.rarity), x0 + (x1 - x0) * w.rng.next(), out);
}

let acc = 0;
export function ambientSpawn(w: World, b: Biome, camX: number, dt: number) {
  acc += dt;
  if (acc < 1.5) return;
  acc = 0;
  // despawn far-away ordinary creatures (the ocean is endless; keep the cast near the camera)
  let near = 0;
  for (const e of w.entities) {
    if (!e.alive || e.isBoss || (e.team !== 'enemy' && e.team !== 'neutral' && e.team !== 'friend')) continue;
    if (e.kind === 'angler' || e.kind === 'line' || e.kind === 'bait' || e.kind === 'pickup' || e.kind === 'current' || e.kind === 'pips' || e.kind === 'chest' || e.kind === 'shop' || e.kind === 'spring' || e.kind === 'bossPart') continue;
    const d = Math.abs(e.x - camX);
    if (d > 70) { e.alive = false; continue; }
    if (d < 32) near++;
  }
  if (near >= 10) return;
  const side = w.rng.sign();
  const x = camX + side * w.rng.range(20, 28);
  const pool = w.rng.next() < 0.5 ? eligible(b, ['enemy']) : eligible(b, ['neutral', 'friend']);
  if (pool.length) spawnGroup(w, w.rng.weighted(pool, (c) => c.rarity), x, []);
}

export function ambush(w: World, x: number, y: number, n: number, done: () => void) {
  const b = { id: 'reef' } as Biome;
  const pool = CREATURES.filter((c) => c.team === 'enemy' && !c.boss && !c.floor && c.rarity > 0.3);
  const spawned: Entity[] = [];
  for (let i = 0; i < n; i++) {
    const c = w.rng.weighted(pool, (cc) => cc.rarity);
    try { spawned.push(spawnCreature(c.kind, w, x + (w.rng.next() - 0.5) * 6, clamp(y + (w.rng.next() - 0.5) * 3, w.terrain.floorAt(x) + 1, -1.5))); } catch { /* skip */ }
  }
  void b;
  const poll = () => { if (spawned.every((e) => !e.alive || (e.hp ?? 1) <= 0)) done(); else setTimeout(poll, 500); };
  setTimeout(poll, 1500);
}

/** elites sometimes belong to a creature boss instead of a fishing tournament */
export function creatureElite(w: World, node: DiveNode, done: () => void): boolean {
  const act = w.run.act;
  const kind = act >= 3 ? 'mother_angler' : 'old_ichthy';
  if (node.type !== 'elite' || w.rng.next() > 0.45) return false;
  const y = kind === 'mother_angler' ? Math.max(w.terrain.floorAt(8) + 4, -18) : -6;
  const boss = spawnCreature(kind, w, 10, y);
  const poll = () => { if (!boss.alive || (boss.hp ?? 1) <= 0) setTimeout(done, 1200); else setTimeout(poll, 400); };
  setTimeout(poll, 2000);
  return true;
}
