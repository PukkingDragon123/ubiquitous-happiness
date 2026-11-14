// Floor bosses (one per floor). (Stub.)
import type { World } from '../game/types';
import type { Arena, FloorId, BossEntity } from '../combat/types';
import { Human, newSquad } from '../waves/human';

export const BOSS_INFO: Record<FloorId, { id: string; name: string; title: string }> = {
  reef: { id: 'kingCrab', name: 'KING KRAKKUS', title: 'Warlord of the Reef' },
  kelp: { id: 'kelpWitch', name: 'THE KELP STRANGLER', title: 'Mother of Moray' },
  graveyard: { id: 'captainGaff', name: 'CAPTAIN GAFF', title: 'and his Anchor' },
  arctic: { id: 'frostbeard', name: 'CAPTAIN FROSTBEARD', title: 'Butcher of the Floe' },
  abyss: { id: 'leviathan', name: 'THE LEVIATHAN', title: 'Engine of the Deep' },
};

export function buildBoss(_w: World, floor: FloorId, a: Arena): BossEntity {
  const info = BOSS_INFO[floor] ?? BOSS_INFO.reef;
  const h = new Human('titan', (a.x0 + a.x1) / 2 + 4, a.floor + 1.5, newSquad(), null, null, {}) as unknown as BossEntity;
  Object.assign(h, { isBoss: true, bossId: info.id, bossName: info.name });
  h.bar = () => ({ name: info.name, title: info.title, hp: h.hp ?? 0, max: h.maxHp ?? 1, phase: 1, phases: 1, poise: 1, visible: true });
  return h;
}
