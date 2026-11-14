// Floor bosses, one per floor (spawnBoss in src/combat/index.ts builds them into the level's boss arena):
//   reef       KING KRAKKUS, Warlord of the Reef      giant crowned king crab: a big readable melee duel
//   kelp       THE KELP STRANGLER, Mother of Morays   a huge moray striking from dens in the kelp walls
//   graveyard  CAPTAIN GAFF, and his Anchor           the scuba captain swinging a ship's anchor on a chain
//   arctic     THE BRASS TITAN, Iron Lung of the Floe  the giant brass-helmet diver: cannon, ice, hyper armour
//   abyss      THE LEVIATHAN, Lantern of the Abyss     a colossal anglerfish: blinding lure, darkness, jaws
import type { World } from '../game/types';
import type { Arena, FloorId, BossEntity } from '../combat/types';
import { KingCrab } from './kingCrab';
import { MotherMoray, Leviathan } from './fishBosses';
import { CaptainGaff, BrassTitan } from './diverBosses';

export const BOSS_INFO: Record<FloorId, { id: string; name: string; title: string }> = {
  reef: { id: 'kingCrab', name: 'KING KRAKKUS', title: 'Warlord of the Reef' },
  kelp: { id: 'motherMoray', name: 'THE KELP STRANGLER', title: 'Mother of Morays' },
  graveyard: { id: 'captainGaff', name: 'CAPTAIN GAFF', title: 'and his Anchor' },
  arctic: { id: 'brassTitan', name: 'THE BRASS TITAN', title: 'Iron Lung of the Floe' },
  abyss: { id: 'leviathan', name: 'THE LEVIATHAN', title: 'Lantern of the Abyss' },
};

export function buildBoss(w: World, floor: FloorId, a: Arena): BossEntity {
  switch (floor) {
    case 'kelp': return new MotherMoray(a, w);
    case 'graveyard': return new CaptainGaff(a, w);
    case 'arctic': return new BrassTitan(a, w);
    case 'abyss': return new Leviathan(a, w);
    default: return new KingCrab(a);
  }
}

export { BossBase } from './base';
