// Enemy factory behind spawnEnemy(): kind -> a built (not yet added) Entity. (Stub: maps onto the v2 creatures
// and wave divers until the souls-like versions land.)
import type { World, Entity } from '../game/types';
import type { EnemyKind, SpawnOpts, Arena } from './types';
import { Pufferfish, Moray, Barracuda, Jellyfish, Anglerfish, Crab } from '../creatures';
import { Human, newSquad } from '../waves/human';
import type { Role } from '../waves/human';

export function buildEnemy(w: World, kind: EnemyKind, x: number, y: number, o: SpawnOpts & { arena: Arena }): Entity {
  switch (kind) {
    case 'moray': return new Moray(x, y, w);
    case 'crab': return new Crab(x, y);
    case 'puffer': return new Pufferfish(x, y);
    case 'jelly': return new Jellyfish(x, y);
    case 'angler': return new Anglerfish(x, y);
    case 'barracuda': return new Barracuda(x, y);
    case 'dummy': return new Crab(x, y);
    default: {
      const h = new Human(kind as Role, x, y, newSquad(), null, null, { elite: o.elite, iq: 0.5 + (o.difficulty ?? 0) * 0.4 });
      return h;
    }
  }
}
