// Dev preview for the v2 areas (?preview=area&area=reef|kelp|graveyard|arctic|abyss).
//   WASD swim (the pink ball stands in for the blobfish), click = sword poke (breaks resource nodes),
//   1-5 switch area, B ring the mail bell, E deposit loot to the manatee, R repair the wreck one stage,
//   X explosion at the mouse, T toggle the auto tour.
//   URL: &x=<start x> &y=<start y> &tour=1 (auto-swim through the area) &seed=<n> &cam=<distance>
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { MockScreen } from './mockWorld';
import { buildArea, Area, AREA_IDS } from '../area';
import { LOOKS } from '../gfx/lighting';
import { clamp, damp } from '../core/math';
import { ENV } from '../world/mats';

class AreaPreview extends MockScreen {
  area!: Area;
  areaId = 'reef';
  tour = false;
  tourDir = 1;
  seed = 7;
  private hud!: HTMLDivElement;
  private loot: string[] = [];

  private inited = false;
  enter() {
    if (this.inited) return;
    this.inited = true;
    const q = new URLSearchParams(location.search);
    this.areaId = q.get('area') || 'reef';
    this.tour = q.get('tour') === '1';
    this.seed = Number(q.get('seed') || 7);
    this.camDist = Number(q.get('cam') || 16);
    this.terrainObj.visible = false;
    this.followPlayer = false;
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:fixed;left:8px;top:8px;color:#e8fff8;font:12px monospace;text-shadow:0 1px 0 #000;pointer-events:none;white-space:pre;z-index:10';
    document.body.appendChild(this.hud);
    this.load(this.areaId);
    const sx = q.get('x'), sy = q.get('y');
    if (sx) { this.world.player.x = Number(sx); this.world.player.y = sy ? Number(sy) : this.area.sand.heightAt(Number(sx)) + 3; }
    // collect drops into a fake loot bag
    const w = this.world;
    w.drop = (x: number, y: number, what: { coins?: number; item?: string }) => {
      if (what.item) { this.loot.push(what.item); w.text.pop('+' + what.item, x, y + 0.4, 'gold', { size: 0.26, life: 1.4 }); }
    };
    w.run.on('extract', (d) => { w.text.pop('EXTRACTED ' + ((d.items as string[])?.length ?? 0), w.player.x, w.player.y + 1.4, 'magic', { size: 0.35, life: 2 }); });
    w.run.on('repair', (d) => { w.text.pop('REPAIRED stage ' + d.stage, w.player.x, w.player.y + 1.4, 'magic', { size: 0.35, life: 2 }); });
  }

  load(id: string) {
    const w = this.world;
    if (this.area) {
      this.area.dispose();
      for (const e of w.entities) { e.alive = false; e.dispose?.(w); e.obj?.removeFromParent(); }
      w.entities.length = 0;
    }
    this.areaId = id;
    this.area = buildArea(w, id, this.seed);
    this.light.applyLook(this.area.look ?? LOOKS[this.area.lookId]);
    this.area.setLighting(this.light);
    w.water.sim.setSwell(this.area.swell);
    w.player.x = this.area.spawns.player.x; w.player.y = this.area.spawns.player.y;
  }

  tick(dt: number) {
    const w = this.world, inp = this.game.input, p = w.player;
    for (let i = 0; i < AREA_IDS.length; i++) if (inp.keyHit('Digit' + (i + 1))) this.load(AREA_IDS[i]);
    if (inp.keyHit('KeyT')) this.tour = !this.tour;
    if (inp.keyHit('KeyB')) this.area.mailbox.ring();
    if (inp.keyHit('KeyE')) { const items = this.loot.splice(0); this.area.mailbox.deposit(items); }
    if (inp.keyHit('KeyR')) {
      const need = this.area.shipwreck.needs();
      this.area.shipwreck.repair(need);
    }
    if (inp.keyHit('KeyX')) { const m = this.game.mouseWorld(this.camera); w.emit('explosion', { x: m.x, y: m.y, r: 1.8, k: 1.2 }); w.fx.burst('bubbleBig', m.x, m.y, 12, 3); this.game.addShake(0.3); }
    if (inp.keyHit('Mouse0') || inp.hit('attack')) this.poke();
    if (this.tour) {
      const b = this.area.bounds;
      if (p.x > b.x1 - 2) this.tourDir = -1; if (p.x < b.x0 + 2) this.tourDir = 1;
      p.vx = damp(p.vx, this.tourDir * 4, 2, dt);
      const fy = this.area.sand.heightAt(p.x + this.tourDir * 3);
      p.vy = damp(p.vy, clamp((fy + 2.6 + Math.sin(w.time * 0.4) * 1.5 - p.y) * 1.2, -3, 3), 2, dt);
    }
    this.area.update(dt, this.camTarget.x);
    // keep the camera inside the area
    const b = this.area.bounds;
    this.camTarget.x = clamp(p.x, b.x0, b.x1);
    this.camTarget.y = clamp(p.y, b.floor + 3, -3.5);
    const ship = this.area.shipwreck, mb = this.area.mailbox;
    this.hud.textContent = `${this.area.name}  x ${p.x.toFixed(1)} y ${p.y.toFixed(1)}  fps ${this.game.fps.toFixed(0)}\n` +
      `wreck stage ${ship.stage} hp ${Math.round(ship.hp)}  needs ${JSON.stringify(ship.needs())}\n` +
      `manatee ${mb.present ? 'HERE' : 'away'}  bag: ${this.loot.length} items  [1-5 area, B bell, E deposit, R repair, X boom, T tour]`;
  }

  private poke() {
    const w = this.world, p = w.player;
    const m = this.game.mouseWorld(this.camera);
    const dx = m.x - p.x, dy = m.y - p.y, l = Math.hypot(dx, dy) || 1;
    const tx = p.x + (dx / l) * 1.2, ty = p.y + (dy / l) * 1.2;
    for (const e of w.entities) {
      if (!e.alive || !e.hit || e.team === 'player') continue;
      if (Math.hypot(e.x - tx, e.y - ty) < e.r + 0.7) e.hit(1, Math.sign(e.x - p.x) || 1, 0.3, w, p, 'sword');
    }
    w.fx.burst('spark', tx, ty, 4, 2);
  }
}

export default function make(game: Game): Screen {
  const s = new AreaPreview(game, 'area');
  (window as unknown as { areaDebug: unknown }).areaDebug = { ENV, s, THREE };
  (window as unknown as { areaPreview: AreaPreview }).areaPreview = s;
  void THREE;
  return s;
}
