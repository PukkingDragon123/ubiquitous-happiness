// Lead's blobfish model studio (?preview=blobstudio [&expr=happy] [&anim=idle] [&views=side,34,front] [&dist=5]):
// several BlobModels side by side (side view, three-quarter, front) under the game's lighting, no controller.
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { MockScreen } from './mockWorld';
import { BlobModel, type BlobAnim } from '../player/blobModel';

const ZERO = { disp: (_a: number, out: { x: number; y: number }) => { out.x = 0; out.y = 0; return out; } };
const YAW: Record<string, number> = { side: 0, '34': -0.75, front: -Math.PI / 2, back34: 0.9, top: 0 };

class Studio extends MockScreen {
  declare models: BlobModel[];
  setup() {
    const q = new URLSearchParams(location.search);
    this.models = [];
    this.world.player.obj?.removeFromParent();
    this.followPlayer = false;
    const views = (q.get('views') || 'side,34,front').split(',');
    const gap = +(q.get('gap') || 1.9);
    views.forEach((v, i) => {
      const m = new BlobModel(q.get('gear') ? JSON.parse(q.get('gear')!) : { armor: 'none', hat: 'none', back: 'none' });
      const holder = new THREE.Group();
      holder.position.set((i - (views.length - 1) / 2) * gap, -4, 0);
      holder.rotation.y = YAW[v] ?? 0;
      if (v === 'top') holder.rotation.x = 0.9;
      holder.add(m.root);
      this.scene.add(holder);
      m.attach(holder);
      m.play((q.get('anim') || 'idle') as BlobAnim);
      const e = q.get('expr'); if (e) m.setExpression(e);
      this.models.push(m);
    });
    this.camTarget.set(0, -4, 0);
    this.camDist = +(q.get('dist') || 5.2);
    this.camYOff = 0.25;
  }
  tick(dt: number) {
    for (const m of this.models) m.update(dt, { sb: ZERO, swim: 0, time: this.world.time, vel: new THREE.Vector2() });
  }
}
export default function make(game: Game): Screen { return new Studio(game, 'blobstudio'); }
