// Humans: the fishermen of Blobfish: Reel Rebellion and the boats / docks / ice they fish from.
//
//   import { makeFisherman, makeBoat, makeDock, makeIceShelf } from '../humans';
//   const boat = makeBoat('rowboat', 7); scene.add(boat.group); boat.setX(4);
//   const f = makeFisherman('oldSalt', 7); boat.seats[0].add(f.group); f.setSeating('sit'); f.setFacing(-1);
//   f.onCastRelease = () => line.start(f.rodTip(v)); f.play('cast');
//   each frame: boat.update(dt, world.water); f.setTension(k); f.update(dt); f.rodTip(lineStart);
export { makeFisherman, Fisherman } from './fisherman';
export type { PlayOpts, Seating } from './fisherman';
export type { State } from './anim';
export { STATES } from './anim';
export type { ExprName } from './face';
export { EXPRS } from './face';
export type { Archetype, Look } from './looks';
export { ARCHETYPES, makeLook } from './looks';
export { makeBoat } from './boats';
export type { Vessel, BoatKind, Collider } from './boats';
export { makeDock, makeIceShelf } from './spots';

// v2 divers (wave enemies): PS1 low-poly people in dive kit, procedural swim poses, weapon IK, ragdoll + severing
export { makeDiver, DiverRig, SEVERABLE } from './diver';
export type { DiverMode, DiverAct, SeverPart, DiverOpts } from './diver';
export type { WeaponKind } from './weapons';
export { DIVER_ARCHETYPES, isDiverArch } from './looks';
export type { DiverArch, DiveKit } from './looks';
export { DETAIL } from './rig';
