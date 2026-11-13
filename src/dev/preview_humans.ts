// Dev preview for the humans module (?preview=humans). (work in progress: fishermen on platforms)
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { MockScreen } from './mockWorld';
import { makeFisherman, ARCHETYPES, STATES } from '../humans';
import type { Fisherman, State } from '../humans';

const KEYS: Record<string, State> = { Digit1: 'idle', Digit2: 'cast', Digit3: 'wait', Digit4: 'nibble', Digit5: 'reel', Digit6: 'yank', Digit7: 'struggle', Digit8: 'snapFall', Digit9: 'angry', Digit0: 'cheer', Minus: 'surprised', Equal: 'throw', KeyN: 'net' };
const TENSION: Partial<Record<State, number>> = { reel: 0.45, yank: 0.8, struggle: 0.95, nibble: 0.15, wait: 0.08 };

class HumansPreview extends MockScreen {
  declare fs: { f: Fisherman; line: THREE.Line; t: number; i: number }[];
  declare q: URLSearchParams;
  setup() {
    this.fs = [];
    const q = (this.q = new URLSearchParams(location.search));
    this.followPlayer = false;
    const only = q.get('arch');
    const list = only ? only.split(',') : ARCHETYPES;
    const n = list.length;
    list.forEach((a, i) => {
      const f = makeFisherman(a as (typeof ARCHETYPES)[number], +(q.get('seed') || 1) + i * 0);
      f.group.position.set((i - (n - 1) / 2) * 2.4, 0.5, 0);
      f.setFacing(i % 2 ? 1 : -1);
      if (q.get('face')) f.setFacing(+q.get('face')!);
      this.scene.add(f.group);
      const g = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, () => new THREE.Vector3()));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xf4f4ea }));
      line.frustumCulled = false;
      this.scene.add(line);
      const st = (q.get('state') as State) || 'wait';
      f.play(st);
      this.fs.push({ f, line, t: i * 0.7, i });
    });
    this.camTarget.set(+(q.get('cx') || 0), +(q.get('cy') || 0.5), 0);
    this.camDist = +(q.get('d') || (q.get('mode') === 'close' ? 3.4 : 16));
  }
  tick(dt: number) {
    const inp = this.game.input;
    const q = this.q;
    for (const [k, st] of Object.entries(KEYS)) if (inp.keyHit(k)) for (const e of this.fs) e.f.play(st);
    const auto = q.get('auto') !== '0' && !q.get('state');
    const tip = new THREE.Vector3();
    for (const e of this.fs) {
      const f = e.f;
      e.t += dt;
      if (auto && e.t > 4) { e.t = 0; f.play(STATES[(STATES.indexOf(f.state) + 1) % STATES.length]); }
      const k = TENSION[f.state] ?? 0.05;
      f.setTension(k);
      const hookX = f.group.position.x + f.facingDir * 2.2, hookY = f.state === 'struggle' || f.state === 'reel' ? -2.5 : -0.6;
      f.pullToward(hookX, hookY);
      if (q.get('look')) f.lookAt(this.world.player.x, this.world.player.y);
      f.update(dt);
      // the fishing line: a sagging curve from the bent tip to the hook
      f.rodTip(tip);
      const pos = e.line.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 24; i++) {
        const t = i / 23;
        const sag = (1 - k) * 0.6 * Math.sin(t * Math.PI);
        pos.setXYZ(i, tip.x + (hookX - tip.x) * t, tip.y + (hookY - tip.y) * t - sag, tip.z * (1 - t));
      }
      pos.needsUpdate = true;
    }
    if (q.get('mode') === 'close' && this.fs.length) {
      const e = this.fs[+(q.get('i') || 0)] ?? this.fs[0];
      const v = new THREE.Vector3(); e.f.headWorld(v);
      this.camTarget.set(v.x + +(q.get('ox') || 0), v.y - 0.8 - +(q.get('oy') || 0.55), 0);
    }
  }
}
export default function make(game: Game): Screen { return new HumansPreview(game, 'humans', 'harbor'); }
