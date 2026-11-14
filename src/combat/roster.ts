// Enemy factory behind spawnEnemy(): kind -> a built (not yet added) Entity on the souls kit.
// Divers are src/waves/human.ts Humans on their duel brain; sea life is src/combat/sealife.ts.
import type { World, Entity } from '../game/types';
import type { EnemyKind, SpawnOpts, Arena } from './types';
import { CombatMoray, CombatCrab, CombatPuffer, CombatJelly, CombatAngler, CombatBarracuda } from './sealife';
import { TrainingDummy } from './dummy';
import { Human } from '../waves/human';
import type { Role } from '../waves/human';
import { META } from '../meta/meta';
import { arenaOf } from './arena';

const DIVERS: Partial<Record<EnemyKind, Role>> = { harpoon: 'harpoon', knife: 'knife', net: 'net', heavy: 'heavy', medic: 'medic' };

export function buildEnemy(w: World, kind: EnemyKind, x: number, y: number, o: SpawnOpts & { arena: Arena | null }): Entity {
  const fo = { elite: o.elite, difficulty: o.difficulty, arena: o.arena };
  switch (kind) {
    case 'moray': return new CombatMoray(x, y, fo);
    case 'crab': { const c = new CombatCrab(x, y, fo); c.y = Math.max(o.arena?.floor ?? -1e9, w.terrain.floorAt(x)) + c.legH; return c; }
    case 'puffer': return new CombatPuffer(x, y, fo);
    case 'jelly': return new CombatJelly(x, y, fo);
    case 'angler': return new CombatAngler(x, y, fo);
    case 'barracuda': return new CombatBarracuda(x, y, fo);
    case 'dummy': return new TrainingDummy(x, y, o.arena ?? arenaOf(w));
  }
  const role = DIVERS[kind];
  if (!role) throw new Error('unknown enemy kind ' + kind);
  const d = o.difficulty ?? 0;
  const nemesis = o.nemesis ? META.nemeses?.find((n) => n.id === o.nemesis) ?? null : null;
  const h = new Human(role, x, y, Human.duelSquad(w), null, null, { souls: true, arena: o.arena, elite: o.elite, nemesis, iq: 0.45 + d * 0.4, hpMul: 1 + d * 0.5, dmgMul: 1 + d * 0.25 });
  if (role === 'heavy') h.y = Math.max(o.arena?.floor ?? -1e9, w.terrain.floorAt(x)) + h.rig.pivotHeight;
  (h as Entity & { onSpawn?(w: World): void }).onSpawn = (ww: World) => h.mountTag(ww.scene);
  return h;
}

/** lock an existing enemy into an arena (an arena-lock encounter starts) or release it to roam (null) */
export function bindArena(e: Entity, a: Arena | null) {
  (e as unknown as { bindArena?(a: Arena | null): void }).bindArena?.(a);
}
