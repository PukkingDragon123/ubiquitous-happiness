// Waves: roguelike wave defense against smart humans (divers, boats, subs, bosses), gore and nemeses.
//
//   import { WaveDirector } from '../waves';
//   const waves = new WaveDirector(world, area, { mastery: META.mastery, nemeses: META.nemeses });
//   waves.start(1); each frame: waves.update(dt); waves.active / waves.remaining
export { WaveDirector, MODIFIERS } from './director';
export type { BossKind, Unit } from './director';
export type { WaveArea, WaveOpts, Target } from './types';
export { Human, ROLES, Squad, newSquad } from './human';
export type { Role, RoleDef, HumanMods } from './human';
export { SurfaceBoat } from './boat';
export type { BoatJob } from './boat';
export { MiniSub } from './sub';
export { Harpoon, ThrownNet, NetSnare, DepthCharge, Torpedo, Flare } from './projectiles';
export { LimpetMine } from './limpet';
export { promote, defeat, introLine, nemesisLoot, pickReturning } from './nemesis';
export { spawnLimb, chunks, LimbGib } from './gore';
export { board } from './board';
