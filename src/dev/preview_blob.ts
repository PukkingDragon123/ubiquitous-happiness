// Dev preview for the player blobfish (?preview=blob [&close=1] [&expr=happy] [&ability=rockBody]).
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { MockScreen } from './mockWorld';
import { Blobfish } from '../player/blobfish';
import { BASE_STATS, AbilityId } from '../game/run';

class BlobPreview extends MockScreen {
  declare blob: Blobfish;
  setup() {
    const q = new URLSearchParams(location.search);
    const old = this.world.player;
    old.obj?.removeFromParent();
    this.blob = new Blobfish(0, -4);
    const ab = (q.get('ability') || 'rockBody,laserEyes,bubbleShield,inkCloud,zap,puff').split(',') as AbilityId[];
    this.blob.setStats({ ...BASE_STATS, abilities: ab });
    this.world.player = this.blob;
    this.scene.add(this.blob.obj);
    if (q.get('close')) { this.camDist = 3.2; this.camYOff = 0.05; }
  }
  tick() {
    const q = new URLSearchParams(location.search);
    const e = q.get('expr');
    if (e) this.blob.setExpr(e, 1);
  }
}
export default function make(game: Game): Screen { return new BlobPreview(game, 'blob'); }
void THREE;
