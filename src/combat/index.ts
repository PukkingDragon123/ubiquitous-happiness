// Souls-like combat: public API for the dungeon levels (agent J) and the HUD (agent L).
//
//   import { spawnEnemy, ENEMIES_FOR, spawnBoss, bindArena } from '../combat';
//   const e = spawnEnemy(world, 'knife', x, y);                  // a roamer: patrols round (x, y), notices the
//                                                                 // player, chases within a leash, goes home
//   const e = spawnEnemy(world, 'knife', x, y, { arena });        // locked in an arena-lock encounter box
//   bindArena(e, arena) / bindArena(e, null)                      // lock / release an existing enemy
//   ENEMIES_FOR('reef', 0.4)                                      // weighted kind list (repeat = weight)
//   const b = spawnBoss(world, 'reef', arena); b.onDefeated = () => openGate(); b.bar() -> { name, hp, max, phase }
//
// Events (world.emit): 'kill' {kind, x, y, elite, boss} when an enemy dies (drops are J's job),
// 'parry' {perfect}, 'riposte' {kind}, 'guardBreak' {}, 'bossIntro' {id, name, title}, 'bossPhase' {id, phase},
// 'bossDefeated' {id}, 'flask' {left}, 'dodge' {perfect}.
// Player side: (world.player as Blobfish).combat.hud() -> PlayerCombatHud (stamina, flasks, parry state).
import type { World, Entity } from '../game/types';
import type { Arena, EnemyKind, FloorId, SpawnOpts, BossEntity } from './types';
import { setArena } from './arena';
import { buildEnemy } from './roster';
import { buildBoss } from '../bosses';

export type { Arena, EnemyKind, FloorId, SpawnOpts, BossEntity, BossBar, AttackSpec, DefenseResult, PlayerCombatHud } from './types';
export { ENEMY_KINDS } from './types';
export { setArena, arenaOf } from './arena';
export { bindArena } from './roster';
export { PlayerCombat } from './moveset';
export { attackPlayer } from './resolve';
export { BOSS_INFO } from '../bosses';

/** build an enemy of `kind` at (x, y) inside the arena and add it to the world */
export function spawnEnemy(world: World, kind: EnemyKind, x: number, y: number, opts: SpawnOpts = {}): Entity {
  const e = buildEnemy(world, kind, x, y, { ...opts, arena: opts.arena ?? null });
  if (!opts.noAdd) world.add(e);
  (e as Entity & { onSpawn?(w: World): void }).onSpawn?.(world);
  return e;
}

/** relative weights per floor: [kind, weight, min difficulty] */
const TABLE: Record<FloorId, [EnemyKind, number, number][]> = {
  reef: [['crab', 3, 0], ['puffer', 2, 0], ['knife', 3, 0], ['harpoon', 2, 0], ['moray', 2, 0.15], ['barracuda', 1, 0.3], ['net', 1, 0.5]],
  kelp: [['knife', 3, 0], ['harpoon', 3, 0], ['moray', 2, 0], ['barracuda', 2, 0], ['net', 2, 0.2], ['medic', 1, 0.3], ['jelly', 1, 0.3]],
  graveyard: [['knife', 3, 0], ['harpoon', 3, 0], ['net', 2, 0], ['heavy', 1, 0.2], ['medic', 2, 0.2], ['moray', 2, 0], ['crab', 1, 0]],
  arctic: [['harpoon', 3, 0], ['heavy', 2, 0], ['knife', 2, 0], ['jelly', 2, 0], ['net', 2, 0.2], ['medic', 1, 0.3], ['barracuda', 1, 0.3]],
  abyss: [['angler', 3, 0], ['jelly', 3, 0], ['barracuda', 2, 0], ['heavy', 2, 0.2], ['moray', 2, 0], ['knife', 1, 0.4], ['harpoon', 1, 0.4]],
};

/** a weighted list of enemy kinds for a combat room on this floor (pick uniformly; repeats are the weights) */
export function ENEMIES_FOR(floorId: FloorId | string, difficulty = 0): EnemyKind[] {
  const t = TABLE[(floorId as FloorId)] ?? TABLE.reef;
  const out: EnemyKind[] = [];
  for (const [k, wgt, min] of t) if (difficulty >= min) for (let i = 0; i < wgt; i++) out.push(k);
  return out;
}

/** how many enemies a combat room should hold at this difficulty (a hint for the room builder) */
export function roomBudget(difficulty = 0): [number, number] {
  return [2 + Math.floor(difficulty * 2), 3 + Math.floor(difficulty * 3)];
}

/** the floor's boss, placed in the arena (it plays its intro when the player comes in) */
export function spawnBoss(world: World, floorId: FloorId | string, arena: Arena): BossEntity {
  setArena(world, arena);
  const b = buildBoss(world, (floorId as FloorId), arena);
  world.add(b);
  (b as BossEntity & { onSpawn?(w: World): void }).onSpawn?.(world);
  return b;
}
