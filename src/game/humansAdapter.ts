// Plugs the humans module (Limbophobia-derived fishermen, boats, docks, ice) into the angler system.
import { setRigFactory, AnglerRig, Vessel } from '../fishing/angler';
import { makeFisherman, makeBoat, makeDock, makeIceShelf, ARCHETYPES } from '../humans';
import type { Archetype, BoatKind } from '../humans';

let installed = false;
export function installHumans() {
  if (installed) return;
  installed = true;
  setRigFactory({
    rig: (arch, seed) => makeFisherman((ARCHETYPES.includes(arch as Archetype) ? arch : 'weekendDad') as Archetype, seed) as unknown as AnglerRig,
    vessel: (kind, seed) => {
      if (kind === 'dock') return makeDock(seed) as unknown as Vessel;
      if (kind === 'ice') return makeIceShelf(seed) as unknown as Vessel;
      return makeBoat(kind as BoatKind, seed) as unknown as Vessel;
    },
  });
}
