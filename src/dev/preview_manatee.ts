// Marge's model studio (?preview=manatee): several Marges side by side under the game's lighting, posed without
// the swim logic.
//   &views=side,34,front,rear,top,left   one Marge per view (side = as in the game, facing right, idle 3/4 turn)
//   &anim=idle|swim|talk|wave|roll|munch|all   what they do (all cycles through talk, wave, roll)
//   &dist=9 camera distance  &gap=4 spacing  &y=-4.5 height  &speed=3 swim speed for anim=swim  &lookY=0
//   &cx=0 &cy=0 aim the camera off-centre (close-ups of the head: &views=side&dist=2.2&cx=0.9)
// Console (deterministic frames under a slow GL): studio.frozen = true; studio.advance(1.2) steps 1/60 s at a time.
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { MockScreen } from './mockWorld';
import { Manatee } from '../area/manatee';

/** extra turn of the holder on top of her own idle 3/4 turn (about 0.46 rad toward the camera) */
const YAW: Record<string, number> = { side: 0, left: 0, '34': -0.55, front: -1.1, rear: 2.1, top: 0, under: 0 };

class Studio extends MockScreen {
  declare marges: { m: Manatee; face: number }[];
  declare anim: string;
  declare speed: number;
  declare lookY: number;
  declare clock: number;
  declare frozen: boolean;
  setup() {
    const q = new URLSearchParams(location.search);
    this.marges = [];
    this.clock = 0;
    this.frozen = false;
    this.world.player.obj?.removeFromParent();
    this.followPlayer = false;
    this.anim = q.get('anim') || 'idle';
    this.speed = +(q.get('speed') || 3);
    this.lookY = +(q.get('lookY') || 0);
    const views = (q.get('views') || 'side,34,front').split(',');
    const gap = +(q.get('gap') || 4.2), y = +(q.get('y') || -4.5);
    views.forEach((v, i) => {
      const m = new Manatee();
      const holder = new THREE.Group();
      holder.position.set((i - (views.length - 1) / 2) * gap, y, 0);
      holder.rotation.y = YAW[v] ?? 0;
      if (v === 'top') holder.rotation.x = 1.1;
      if (v === 'under') holder.rotation.x = -0.9;
      m.x = 0; m.y = 0; m.z = 0;
      holder.add(m.root);
      this.scene.add(holder);
      this.marges.push({ m, face: v === 'left' ? 1 : 0 });
    });
    this.camTarget.set(+(q.get('cx') || 0), y + +(q.get('cy') || 0), 0);
    this.camDist = +(q.get('dist') || 9);
    this.camYOff = +(q.get('camY') || 0.3);
    (window as unknown as { studio: Studio }).studio = this;
  }
  /** step every Marge forward `sec` seconds in fixed 1/60 s steps */
  advance(sec: number) { for (let t = 0; t < sec; t += 1 / 60) this.step(1 / 60); }
  tick(dt: number) { if (!this.frozen) this.step(dt); }
  step(dt: number) {
    this.clock += dt;
    const c = this.clock, a = this.anim;
    for (const { m, face } of this.marges) {
      if (a === 'talk' || (a === 'all' && c % 9 < 3)) m.talk(0.2);
      if ((a === 'wave' && c % 3 < dt) || (a === 'all' && Math.abs((c % 9) - 3.2) < dt / 2)) m.wave();
      if ((a === 'roll' && c % 3.5 < dt) || (a === 'all' && Math.abs((c % 9) - 5.6) < dt / 2)) m.celebrate();
      m.studio(dt, face, a === 'swim' ? this.speed : 0, 4, this.lookY);
    }
  }
}
export default function make(game: Game): Screen { return new Studio(game, 'manatee'); }
