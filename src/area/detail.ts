// The area's fine detail layer, built with the scenery (before Scenery.finish(), so den rocks, vent worms and
// other static bits merge into the chunk meshes) and run every frame by the Area:
//   critters (every area: gobies, crabs, shrimp, nudibranchs; morays in the reef and kelp dens),
//   the deep (abyss: lantern-fish, giant isopods, vent worms + heat haze, a blue back light),
//   parallax motes (graveyard dust, abyss bioluminescent plankton that swirls and flares in the blobfish's wake).
import * as THREE from 'three';
import type { World } from '../game/types';
import type { Scenery } from './scenery';
import { Critters } from './critters';
import { Deep } from './deep';
import { Motes, MoteLayer } from './motes';

const MOTES: Record<string, MoteLayer[]> = {
  graveyard: [
    { n: 900, z0: -26, z1: -8, size: 0.06, k: 0.32, col: '#c8d0c0', drift: 0.6, twinkle: 0.6 },
    { n: 700, z0: -3, z1: 2.2, size: 0.04, k: 0.5, col: '#e0e4d4', drift: 1, swirl: 1.6, flare: 0.35 },
    { n: 140, z0: 4, z1: 9, size: 0.055, k: 0.42, col: '#d8dcd0', drift: 1.7 },
  ],
  abyss: [
    { n: 1100, z0: -30, z1: -8, size: 0.06, k: 0.5, col: '#4ab8ff', drift: 0.5, twinkle: 1.6 },
    { n: 1300, z0: -3, z1: 2.5, size: 0.04, k: 0.42, col: '#7cf8ff', drift: 0.8, twinkle: 1.3, swirl: 2, flare: 1.8 },
    { n: 320, z0: -6, z1: 1, size: 0.045, k: 0.45, col: '#ff6ad8', drift: 0.7, twinkle: 2.2, swirl: 1.6, flare: 1.2 },
    { n: 180, z0: 4, z1: 9, size: 0.055, k: 0.5, col: '#9fe8ff', drift: 1.4, twinkle: 1.2 },
    // dinoflagellates: dark until the blobfish (or a blast) stirs the water, then a sparkling wake
    { n: 2600, z0: -1.4, z1: 1.4, size: 0.035, k: 0.75, col: '#8af8ff', drift: 0.3, swirl: 2.2, flare: 2.4, box: [22, 14], wake: true },
  ],
};

export class Detail {
  group = new THREE.Group();
  critters: Critters;
  deep: Deep | null = null;
  motes: Motes | null = null;
  constructor(public scen: Scenery, public w: World, seed: number) {
    this.critters = new Critters(scen, w, seed);
    this.group.add(this.critters.group);
    if (scen.a.id === 'abyss') { this.deep = new Deep(scen, w, seed); this.group.add(this.deep.group); }
    const ml = MOTES[scen.a.id];
    if (ml) { this.motes = new Motes(ml, w); this.group.add(this.motes.group); }
    this.group.name = 'detail';
  }
  update(dt: number, camX: number) {
    const p = this.w.player;
    this.critters.update(dt, camX);
    this.deep?.update(dt, camX);
    this.motes?.update(dt, camX, this.w.camera.position.y, p.x, p.y, Math.hypot(p.vx, p.vy));
  }
  scare(x: number, y: number, r: number) {
    this.critters.scare(x, y, r);
    this.deep?.scare(x, y, r);
    this.motes?.stir(x, y, 1.5);
  }
  dispose() {
    this.critters.dispose();
    this.deep?.dispose();
    this.motes?.dispose();
    this.group.removeFromParent();
  }
}
