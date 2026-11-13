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
import { spawnCreature, SeaTurtle } from '../creatures';
import type { Entity } from '../game/types';

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
      let row: FishModel[] = [], x = 0, y = -0.5;
      const hOf = (m: FishModel) => { const b = m.mesh.geometry.boundingBox; return b ? b.max.y - b.min.y : m.length * 0.3; };
      const flush = () => {
        const rowH = Math.max(...row.map(hOf)) + 0.7;
        const w = row.reduce((s, m) => s + m.length + 0.5, -0.5);
        let cx = -w / 2;
        for (const m of row) {
          const p = new THREE.Vector3(cx + m.length / 2, y - rowH / 2, 0);
          add(m, p);
          const label = textSprite(m.species, STYLES.small, 0.26);
          label.position.set(p.x, p.y - hOf(m) * 0.5 - 0.22, 0.3);
          this.overlay.add(label);
          cx += m.length + 0.5;
        }
        y -= rowH; row = []; x = 0;
      };
      for (const m of ms) { if (x + m.length > maxW && row.length) flush(); row.push(m); x += m.length + 0.5; }
      if (row.length) flush();
      this.camTarget.set(num('cx', 0), (y - 0.5) / 2 - 0.8 + num('cy', 0), 0);
      this.camDist = num('dist', 22);
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

// ------------------------------------------------------------------------------------------- live AI scene
// WASD swim, click / Space = sword poke (hits within 1.2 m), E = bite, R = ride a nearby turtle,
// H = toggle "hooked" (the hermit crab comes to snip the line), B = spawn the boss again.
class FishAI extends MockScreen {
  declare hud: HTMLDivElement;
  declare riding: SeaTurtle | null;
  declare baseSun: number; declare baseHemi: number;
  declare slashT: number;
  declare ff: number;
  update(dt: number) {
    // &ff=N: fast-forward N seconds of simulation in fixed steps on the first frame (deterministic shots)
    if (this.ff > 0) { const n = Math.round(this.ff * 30); this.ff = 0; for (let i = 0; i < n; i++) super.update(1 / 30); }
    super.update(dt);
  }
  setup() {
    this.ff = num('ff', 0);
    const w = this.world;
    this.riding = null; this.slashT = 0;
    this.baseSun = this.light.sun.intensity; this.baseHemi = this.light.hemi.intensity;
    w.run.on('heal', (d) => { w.player.hp = Math.min(w.player.maxHp ?? 6, (w.player.hp ?? 6) + ((d.amount as number) ?? 1)); });
    w.run.on('darkness', (d) => { const k = d.k as number; this.light.sun.intensity = this.baseSun * (1 - k * 0.92); this.light.hemi.intensity = this.baseHemi * (1 - k * 0.9); });
    const F = (x: number) => w.terrain.floorAt(x);
    const boss = Q.get('boss');
    if (boss) {
      spawnCreature(boss === 'angler' ? 'mother_angler' : 'old_ichthy', w, 0, -5);
      w.player.x = -3; w.player.y = -4;
    } else {
      for (let i = 0; i < 5; i++) spawnCreature('piranha', w, 7 + i * 0.5, -4 + (i % 2) * 0.6);
      spawnCreature('pufferfish', w, -3.5, -5.5);
      spawnCreature('moray', w, -6 + 1.15, -8.5);
      spawnCreature('barracuda', w, 13, -3);
      spawnCreature('jellyfish', w, 3, -2.2);
      spawnCreature('jellyfish', w, -9, -3);
      spawnCreature('crab', w, 2.5, F(2.5) + 0.3);
      spawnCreature('anglerfish', w, -13, -6);
      spawnCreature('sardines', w, 0, -2.5);
      spawnCreature('cleaner_wrasse', w, -2, -7);
      spawnCreature('sea_turtle', w, 9, -6);
      spawnCreature('hermit', w, -1, F(-1) + 0.2);
      spawnCreature('triggerfish', w, 16, -7.5);
      spawnCreature('stingray', w, -14, F(-14) + 0.6);
      spawnCreature('cichlid', w, 4, -6.5);
      spawnCreature('cichlid_blue', w, 5, -7);
    }
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:fixed;left:8px;top:8px;color:#e8fbff;font:12px monospace;text-shadow:0 1px 2px #000;z-index:10;pointer-events:none;white-space:pre';
    document.body.appendChild(this.hud);
  }
  tick(dt: number) {
    const w = this.world, p = w.player, inp = this.game.input;
    this.slashT -= dt;
    if ((inp.keyHit('Space') || inp.keyHit('Mouse0')) && this.slashT <= 0) {
      this.slashT = 0.3;
      for (const e of w.near(p.x + p.facing * 0.5, p.y, 1.2) as Entity[]) {
        if (e === p || !e.hit) continue;
        const dx = e.x - p.x, dy = e.y - p.y, l = Math.hypot(dx, dy) || 1;
        e.hit(1, dx / l, dy / l, w, p, 'sword');
      }
      w.fx.burst('spark', p.x + p.facing * 0.7, p.y, 6, 3);
      w.sfx('sw_swish1', p.x);
    }
    if (inp.keyHit('KeyE')) for (const e of w.near(p.x, p.y, 0.9)) if (e.biteable && e.onBite) { e.onBite(w); break; }
    if (inp.keyHit('KeyR')) {
      if (this.riding) { this.riding.dismount(); this.riding = null; }
      else for (const e of w.near(p.x, p.y, 1.5)) if (e instanceof SeaTurtle) { this.riding = e; break; }
    }
    if (this.riding) { if (!this.riding.alive) this.riding = null; else this.riding.carry(dt, p); }
    if (inp.keyHit('KeyH')) p.hooked = !p.hooked;
    if (inp.keyHit('KeyB')) spawnCreature(Q.get('boss') === 'angler' ? 'mother_angler' : 'old_ichthy', w, p.x + 6, -5);
    const boss = w.entities.find((e) => e.isBoss && e.alive);
    this.hud.textContent = `hp ${p.hp}/${p.maxHp}  ${p.hooked ? 'HOOKED ' : ''}${this.riding ? 'RIDING ' : ''}entities ${w.entities.length}  fps ${this.game.fps.toFixed(0)}\n` +
      (boss ? `${boss.bossName}: ${Math.max(0, boss.hp ?? 0).toFixed(0)}/${boss.maxHp}\n` : '') +
      'WASD swim  Space/click poke  E bite  R ride turtle  H hooked  B boss';
    if (p.hp !== undefined && p.hp <= 0) p.hp = p.maxHp;
  }
}

export default function make(game: Game): Screen {
  if (Q.get('mode') === 'ai') return new FishAI(game, 'fish', Q.get('look') || (Q.get('boss') === 'angler' ? 'abyss' : 'reef'));
  return new FishGallery(game, 'fish');
}
