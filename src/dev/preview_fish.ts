// Dev preview for the fish + creatures modules.
//   ?preview=fish                   lineup gallery of every species at true scale (WASD pans, wheel zooms)
//   ?preview=fish&sheet=1           contact sheet: every species normalised to 1 m, in a grid (&cols=4 &only=a,b)
//   ?preview=fish&sp=piranha        one species close-up (&dist= camera distance, &cx/&cy offsets in body lengths,
//                                   &ry/&rx model rotation, &spin=1 turntable, &jaw=1, &morph=1, &page=2 texture)
//   ?preview=fish&mode=ai           live scene: enemies + friendlies (+ &boss=ichthy|angler)
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { MockScreen } from './mockWorld';
import { buildFish, SPECIES, FishModel } from '../fish';
import { textSprite, STYLES } from '../ui/text';

const Q = new URLSearchParams(location.search);
const num = (k: string, d: number) => { const v = Q.get(k); return v === null ? d : parseFloat(v); };

class FishGallery extends MockScreen {
  declare models: { m: FishModel; base: THREE.Vector3; spd: number }[];
  declare t: number;
  setup() {
    this.models = []; this.t = 0;
    this.world.player.obj!.visible = false;
    const one = Q.get('sp');
    const only = Q.get('only');
    const list = one ? one.split(',') : only ? only.split(',') : SPECIES;
    this.followPlayer = false;
    const add = (m: FishModel, p: THREE.Vector3, k = 1) => {
      m.group.position.copy(p); m.group.scale.setScalar(k);
      this.scene.add(m.group);
      this.models.push({ m, base: p.clone(), spd: m.length * 0.9 });
    };
    if (one) {
      list.forEach((s, i) => { const m = buildFish(s, i + 1); add(m, new THREE.Vector3(i * m.length * 1.4, -4, 0)); });
      const L0 = this.models[0].m.length;
      if (Q.get('page') === '2') {
        const cv = this.models[0].m.material.map!.image as HTMLCanvasElement;
        cv.style.cssText = 'position:fixed;left:0;top:0;height:100vh;image-rendering:pixelated;z-index:10;background:#345';
        document.body.appendChild(cv);
      }
      this.camDist = num('dist', L0 * 3.2);
      this.camTarget.set((this.models.length - 1) * L0 * 0.7 + num('cx', 0) * L0, -4 - 0.8 + num('cy', 0) * L0, 0);
    } else if (Q.get('sheet')) {
      const cols = num('cols', 4), cw = 1.35, ch = 0.85;
      const rows = Math.ceil(list.length / cols);
      list.forEach((s, i) => {
        const m = buildFish(s, i + 1);
        const c = i % cols, r = Math.floor(i / cols);
        const p = new THREE.Vector3((c - (cols - 1) / 2) * cw, -4 - (r - (rows - 1) / 2) * ch, 0);
        add(m, p, 1 / m.length);
        if (s.startsWith('stingray')) m.group.rotation.x = 1.1;
        const label = textSprite(s, STYLES.small, 0.1);
        label.position.set(p.x, p.y - 0.36, 0.3);
        this.overlay.add(label);
      });
      this.camTarget.set(0, -4 - 0.8, 0);
      const th = Math.tan((18 * Math.PI) / 180);
      this.camDist = num('dist', Math.max((cols * cw) / (2 * th * (16 / 10)), (rows * ch) / (2 * th)) * 1.05);
    } else {
      // true-scale lineup, smallest first, wrapped into rows
      const ms = list.map((s, i) => buildFish(s, i + 1)).sort((a, b) => a.length - b.length);
      const maxW = num('w', 16);
      let row: FishModel[] = [], x = 0, y = -1.2;
      const flush = () => {
        const rowH = Math.max(...row.map((m) => m.length * 0.5)) + 0.45;
        const w = row.reduce((s, m) => s + m.length + 0.5, -0.5);
        let cx = -w / 2;
        for (const m of row) {
          const p = new THREE.Vector3(cx + m.length / 2, y - rowH / 2, 0);
          add(m, p);
          const label = textSprite(m.species, STYLES.small, 0.16);
          label.position.set(p.x, p.y - m.length * 0.25 - 0.14, 0.3);
          this.overlay.add(label);
          cx += m.length + 0.5;
        }
        y -= rowH; row = []; x = 0;
      };
      for (const m of ms) { if (x + m.length > maxW && row.length) flush(); row.push(m); x += m.length + 0.5; }
      if (row.length) flush();
      this.camTarget.set(num('cx', 0), (y - 1.2) / 2 - 0.8 + num('cy', 0), 0);
      this.camDist = num('dist', 24);
    }
  }
  tick(dt: number) {
    this.t += dt;
    const spin = Q.get('spin');
    for (const { m, base, spd } of this.models) {
      m.update(dt, spd, 0);
      if (spin) m.group.rotation.y = this.t * 0.6;
      else if (Q.get('ry') || Q.get('rx')) m.group.rotation.set(num('rx', m.group.rotation.x), num('ry', 0), 0);
      m.setJaw(Q.get('jaw') ? 0.5 + 0.5 * Math.sin(this.t * 3) : 0);
      m.lookAt(Math.cos(this.t * 0.8), Math.sin(this.t * 1.3) * 0.5);
      if (Q.get('morph')) m.setMorph(0.5 + 0.5 * Math.sin(this.t * 1.5));
      m.group.position.y = base.y + Math.sin(this.t * 1.3 + base.x) * 0.01 * m.group.scale.y;
    }
    const inp = this.game.input;
    const ax = inp.axis();
    this.camTarget.x += ax.x * dt * this.camDist * 0.3; this.camTarget.y += ax.y * dt * this.camDist * 0.3;
    if (inp.mouse.wheel) { this.camDist = Math.max(0.3, this.camDist * (1 + inp.mouse.wheel * 0.1)); inp.mouse.wheel = 0; }
  }
}

export default function make(game: Game): Screen {
  return new FishGallery(game, 'fish');
}
