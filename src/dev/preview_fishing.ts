// Dev preview for the fishing systems (?preview=fishing [&hook=1] [&qte=mash|hold|push]).
import type { Game, Screen } from '../game/game';
import { MockScreen } from './mockWorld';
import { Blobfish } from '../player/blobfish';
import { BASE_STATS } from '../game/run';
import { FishingSystem } from '../fishing/angler';

class FishingPreview extends MockScreen {
  declare blob: Blobfish;
  declare sys: FishingSystem;
  setup() {
    const q = new URLSearchParams(location.search);
    this.world.player.obj?.removeFromParent();
    this.blob = new Blobfish(1, -5);
    this.blob.setStats({ ...BASE_STATS, abilities: ['laserEyes', 'rockBody', 'zap'] });
    this.world.player = this.blob;
    this.scene.add(this.blob.obj);
    this.sys = new FishingSystem();
    this.overlay.add(this.sys.qte.group);
    const a = this.sys.spawn(this.world, 'oldSalt', -6, 1);
    this.sys.spawn(this.world, 'weekendDad', 9, -1);
    if (q.get('hook')) setTimeout(() => { if (a.line) a.hookPlayer(this.world); }, 3500);
    if (q.get('qte')) setTimeout(() => this.sys.qte.start(q.get('qte') as 'mash', () => {}), 1500);
  }
  tick(dt: number) { this.sys.update(dt, this.world); }
}
export default function make(game: Game): Screen { return new FishingPreview(game, 'fishing'); }
