// The cosy reveal after the prologue: a modal over the live hideout (like the result card). The room fades in,
// Mr. Crab (off screen, at the door) says "This is your home now", the kid answers, and HOME floats up over the
// sofa in 3D. Then the hideout is yours.
//
//   game.register(new WelcomeHome(game, hideout)); game.go('hideout', {}); game.openModal('welcome');
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import type { HideoutScreen } from '../hideout/screen';
import { PixelUI } from '../ui/pixel/ui';
import { Text3DLayer, T3D } from '../ui/text3d';
import { audio } from '../audio/audio';
import { Dialogue } from './dialogue';

export class WelcomeHome implements Screen {
  name = 'welcome';
  underwater = false;
  ui = new PixelUI({ targetH: 240 });
  dlg: Dialogue;
  t3d = new Text3DLayer();
  private t = 0;
  private phase: 'in' | 'talk' | 'home' | 'out' = 'in';
  private homeT = 0;
  constructor(private game: Game, private hideout: HideoutScreen) {
    this.dlg = new Dialogue(this.ui, () => this.hideout.camera);
    this.dlg.speaker({ id: 'crab', name: 'MR. CRAB', color: '#c8402a', voice: 'crab_click', pitch: 0.9, vol: 0.34 });
    this.dlg.speaker({ id: 'kid', name: 'BUBBLE', color: '#e0587e', voice: 'squeak', pitch: 1.85, vol: 0.22, anchor: () => this.hideout.hero.root.localToWorld(new THREE.Vector3(0, 1.2, 0)) });
  }
  get scene() { return this.hideout.scene; }
  get camera() { return this.hideout.camera; }
  get overlays() { return [...(this.hideout.overlays ?? []), this.ui.layer]; }
  resize(w: number, h: number) { this.ui.resize(w, h, this.game.renderer.getPixelRatio()); this.hideout.resize(w, h); }

  enter() {
    this.t = 0; this.phase = 'in'; this.homeT = 0;
    this.hideout.scene.add(this.t3d.group);
    this.hideout.ui.drawCursor = false;
    this.ui.drawCursor = false;
  }
  exit() {
    this.dlg.finish();
    this.t3d.clear();
    this.t3d.group.removeFromParent();
    this.hideout.ui.drawCursor = true;
  }

  private sofa(): THREE.Vector3 {
    const s = this.hideout.furn.byBp('sofa');
    const p = s ? s.obj.position.clone() : this.hideout.hero.root.position.clone();
    return p.add(new THREE.Vector3(0, 2.1, 0));
  }

  update(dt: number) {
    this.t += dt;
    const inp = this.game.input;
    this.ui.begin(inp, dt);
    this.dlg.update(dt, inp);
    if (this.phase === 'in' && this.t > 1.4) {
      this.phase = 'talk';
      this.dlg.play([
        { who: 'crab', text: 'This is your home now.' },
        { who: 'crab', text: 'Rest up, kid. When you\'re ready, the TV knows the way out.' },
        { who: 'kid', text: '...{p=0.3}Home.' },
      ]).then(() => {
        this.phase = 'home';
        const p = this.sofa();
        this.t3d.add('HOME', p.x, p.y, p.z, T3D.title, { size: 0.42, stagger: 0.1, enter: 'drop', face: 1, angle: 0.15, life: 3.4 });
        audio.play('jin_arrive', { vol: 0.5, dry: true });
      });
    }
    if (this.phase === 'home') { this.homeT += dt; if (this.homeT > 4) this.phase = 'out'; }
    // the hideout lives underneath but gets no clicks or keys until we're done
    inp.pressed.clear(); inp.released.clear();
    inp.down.delete('Mouse0'); inp.down.delete('Mouse2');
    this.hideout.update(dt);
    this.t3d.update(dt, this.hideout.camera);
    this.dlg.draw();
    this.ui.end();
    if (this.phase === 'out') this.game.closeModal();
  }
}
