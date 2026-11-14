// Dev preview for the souls-like combat (?preview=combat).
//
// A flat walled arena (24 x 11 m), the real blobfish with the full moveset, and enemies / a boss from the URL:
//   &enemy=knife,harpoon,moray   spawn these (spawnEnemy)        &boss=reef|kelp|graveyard|arctic|abyss
//   &elite=1   elites   &roam=1 roamers (patrol / notice / leash) instead of arena-locked   &god=1  no damage               &dummy=1 (default with nothing else) a
//   training dummy that swings white, white, RED on a rhythm and logs every defense + parry timing
//   &dummy=still  a dummy that doesn't attack (combo / heavy practice)   &d=<camera distance>   &look=<area>
//   &auto=parry:<ms>|block|dodge:<ms>  auto-defend the first enemy's attacks (timing tests)   &pauseOn=<event> freeze
//   the sim on an event (screenshots of the parry flash: &pauseOn=parry)
// Keys: J / LMB light (hold: heavy), K / RMB parry (hold: block), Space dodge, R / H flask, 1-4 skills,
//       [ respawn the URL's enemies, ] refill hp / flasks / stamina, \ toggle the dummy's attacks.
// window.combatPreview: { world, blob, spawn(kind, x, y), dummy, log() } for console-driven tests.
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import type { Terrain, DamageKind, Entity } from '../game/types';
import { MockScreen } from './mockWorld';
import { Blobfish } from '../player/blobfish';
import { BASE_STATS } from '../game/run';
import { spawnEnemy, spawnBoss, setArena } from '../combat';
import type { Arena, EnemyKind, BossEntity, FloorId } from '../combat';
import { TrainingDummy } from '../combat/dummy';
import { Text3DLayer, Float3D } from '../ui/text3d';
import { kitMat } from '../humans/diveGear';
import { band, nz, hh } from '../humans/fabric';

class ArenaTerrain implements Terrain {
  constructor(public a: Arena) {}
  floorAt() { return this.a.floor; }
  sdf(x: number, y: number) { const a = this.a; return Math.min(y - a.floor, x - a.x0, a.x1 - x, a.top + 3 - y); }
  normal(x: number, y: number) {
    const e = 0.05, dx = this.sdf(x + e, y) - this.sdf(x - e, y), dy = this.sdf(x, y + e) - this.sdf(x, y - e);
    const l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l };
  }
  snags() { return []; }
}

function arenaMeshes(a: Arena): THREE.Group {
  const g = new THREE.Group();
  const sand = kitMat('arenaSand', 64, 64, (x, y) => band([138, 118, 90], 0.9 + (nz(x, y, 16, 3) - 0.5) * 0.16 + (((x + (y >> 2)) % 9) === 0 ? 0.06 : 0), x, y, 0.05), { rough: 0.95 });
  const stone = kitMat('arenaStone', 64, 64, (x, y) => {
    const row = y >> 4, bx = (x + (row & 1) * 12) % 24, by = y % 16;
    const edge = bx === 0 || by === 0;
    return band([96, 104, 108], edge ? 0.62 : 0.88 + (nz(x, y, 12, row) - 0.5) * 0.14 + (hh(x >> 3, y >> 3, 5) - 0.5) * 0.08, x, y, 0.06);
  }, { rough: 0.9 });
  const w = a.x1 - a.x0, h = a.top - a.floor;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 1, 8), sand);
  floor.position.set((a.x0 + a.x1) / 2, a.floor - 0.5, -2);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 4, h + 4, 1), stone);
  back.position.set((a.x0 + a.x1) / 2, a.floor + h / 2 + 1, -5.5);
  const wl = new THREE.Mesh(new THREE.BoxGeometry(1.6, h + 4, 8), stone); wl.position.set(a.x0 - 0.8, a.floor + h / 2 + 1, -2);
  const wr = wl.clone(); wr.position.x = a.x1 + 0.8;
  for (const m of [floor, back, wl, wr]) { m.receiveShadow = true; m.castShadow = true; }
  // fit the uvs to world metres so the textures don't stretch
  for (const m of [floor, back, wl, wr]) {
    const geo = m.geometry as THREE.BufferGeometry, pos = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute, nrm = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i) + m.position.x, py = pos.getY(i) + m.position.y, pz = pos.getZ(i) + m.position.z;
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      const [u, v] = ny > 0.5 ? [px, pz] : nx > 0.5 ? [pz, py] : [px, py];
      uv.setXY(i, u / 3, v / 3);
    }
    const map = (m.material as THREE.MeshStandardMaterial).map; if (map) { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.needsUpdate = true; }
  }
  g.add(floor, back, wl, wr);
  return g;
}

class CombatPreview extends MockScreen {
  declare q: URLSearchParams;
  declare blob: Blobfish;
  declare arena: Arena;
  declare t3d: Text3DLayer;
  declare hud: HTMLDivElement;
  declare dummy: TrainingDummy | null;
  declare boss: BossEntity | null;
  declare god: boolean;
  declare spawned: Entity[];

  setup() {
    const q = (this.q = new URLSearchParams(location.search));
    const a: Arena = (this.arena = { x0: -12, x1: 12, floor: -12, top: -1.2 });
    this.terrainObj.visible = false;
    this.world.terrain = new ArenaTerrain(a);
    this.world.fx.floorAt = () => a.floor;
    this.scene.add(arenaMeshes(a));
    setArena(this.world, a);
    this.camDist = +(q.get('d') || 15);
    this.camYOff = 0.6;
    this.followPlayer = false;
    // 3D damage numbers / call-outs
    this.t3d = new Text3DLayer();
    this.scene.add(this.t3d.group);
    const ft = new Float3D(this.t3d);
    this.overlay.add(ft.group);
    this.world.text = ft;
    // the real blobfish
    this.world.player.obj?.removeFromParent();
    this.blob = new Blobfish(-1.6, a.floor + 1.4);
    this.blob.setStats({ ...BASE_STATS, abilities: ['rockBody', 'zap'], gear: { weapon: 'toothpick' } as never });
    this.world.player = this.blob;
    this.scene.add(this.blob.obj);
    this.god = q.get('god') === '1';
    const blob = this.blob, self = this;
    this.world.hurtPlayer = (dmg: number, fx: number, fy: number, kind?: DamageKind) => {
      if (self.god) { if (!blob.combat.resolving && blob.combat.legacyDefend(self.world, dmg, fx, fy, kind)) return; console.log(`[god] blocked a ${dmg} dmg ${kind ?? ''} hit`); return; }
      blob.damage(dmg, fx, fy, self.world, kind);
      if (blob.hp <= 0) setTimeout(() => self.revive(), 2500);
    };
    const pauseOn = q.get('pauseOn');
    this.world.emit = (ev: string, d?: Record<string, unknown>) => {
      if (pauseOn === ev && !(window as unknown as { __paused?: boolean }).__paused) { (window as unknown as { __paused?: boolean }).__paused = true; setTimeout(() => { this.game.timeScale = 0.00001; }, +(q.get('pauseDelay') || 0)); setTimeout(() => { this.game.timeScale = 1; }, 15000); }
      this.world.run.fire(ev, d); if (ev === 'kill' || ev === 'parry' || ev === 'bossDefeated' || ev === 'bossPhase' || ev === 'guardBreak' || ev === 'riposte') console.log(`[event] ${ev} ${JSON.stringify(d ?? {})}`); };
    this.keyQ = [];
    this.spawned = []; this.dummy = null; this.boss = null; this.autoT = 0; this.autoKey = null; this.autoMove = null;
    this.spawnAll();
    this.makeHud();
    (window as unknown as { combatPreview: unknown }).combatPreview = {
      world: this.world, blob: this.blob, arena: a,
      spawn: (k: EnemyKind, x = 3, y = a.floor + 2) => spawnEnemy(this.world, k, x, y, { arena: a }),
      get dummy() { return self.dummy; }, get boss() { return self.boss; },
      log: () => ({ dummy: self.dummy?.log ?? [], parry: blob.combat.parryLog, hud: blob.combat.hud(), boss: self.boss?.bar() ?? null }),
      /** press a key / mouse code for holdMs (console-driven tests: press('KeyJ'), press('KeyJ', 900) = heavy) */
      press: (code: string, holdMs = 60) => { const inp = self.game.input; inp.pressed.add(code); inp.down.add(code); setTimeout(() => { inp.down.delete(code); inp.released.add(code); }, holdMs); },
      moves: [] as string[],
      /** game-time key script (software GL frames are slow): [[t, code, holdSec], ...] relative to now */
      script: (steps: [number, string, number?][]) => { const t0 = self.world.time; for (const [t, code, hold] of steps) self.keyQ.push({ at: t0 + t, code, hold: hold ?? 0.05, down: false }); },
      entities: () => self.world.entities.filter((e) => e.team === 'enemy').map((e) => { const r = e as unknown as { aware?: boolean; returning?: boolean }; return { kind: e.kind, x: +e.x.toFixed(2), y: +e.y.toFixed(2), hp: e.hp, aware: r.aware, returning: r.returning }; }),
    };
  }

  private spawnAll() {
    const q = this.q, a = this.arena, w = this.world;
    for (const e of this.spawned) if (e.alive) { e.alive = false; }
    this.spawned = [];
    const kinds = (q.get('enemy') || '').split(',').filter(Boolean) as EnemyKind[];
    const bossId = q.get('boss') as FloorId | null;
    const dm = q.get('dummy');
    if (dm || (!kinds.length && !bossId)) {
      this.dummy = new TrainingDummy(0, 0, a);
      this.dummy.attacks = dm !== 'still';
      w.add(this.dummy);
      this.spawned.push(this.dummy);
    }
    kinds.forEach((k, i) => {
      const x = 2 + i * (8 / Math.max(1, kinds.length)) + (k === 'moray' ? 0 : 0);
      const y = k === 'crab' || k === 'heavy' ? a.floor + 0.5 : k === 'moray' ? a.floor + 0.8 : a.floor + 2.5 + (i % 2) * 1.5;
      this.spawned.push(spawnEnemy(w, k, k === 'moray' ? a.x1 - 0.3 : x, y, { arena: q.get('roam') ? null : a, elite: q.get('elite') === '1' }));
    });
    if (bossId) { this.boss = spawnBoss(w, bossId, a); this.spawned.push(this.boss); }
  }

  declare autoT: number; declare autoKey: string | null; declare autoMove: unknown;
  /** &auto=parry:<ms>|block|dodge:<ms>|none — press the key <ms> before the dummy's / first enemy's hit lands (headless timing tests) */
  private autoDefend(dt: number) {
    const spec = this.q.get('auto');
    const inp = this.game.input;
    if (this.autoKey) { this.autoT -= dt; if (this.autoT <= 0) { inp.down.delete(this.autoKey); inp.released.add(this.autoKey); this.autoKey = null; } }
    if (!spec) return;
    const foe = this.dummy ?? this.world.entities.find((e) => e.team === 'enemy' && (e as unknown as { core?: unknown }).core);
    const c = (foe as unknown as { core?: import('../combat/core').EnemyCore } | undefined)?.core;
    if (!c || c.phase !== 'windup' || this.autoMove === Math.round((this.world.time - c.t) * 100)) return;
    const [mode, msS] = spec.split(':');
    const lead = (+(msS ?? 60)) / 1000;
    const left = c.move!.windup / c.speed - c.t;
    if (left > lead) return;
    this.autoMove = Math.round((this.world.time - c.t) * 100);
    const key = mode === 'dodge' ? 'Space' : mode === 'parry' || mode === 'block' ? 'KeyK' : null;
    if (!key) return;
    inp.pressed.add(key); inp.down.add(key);
    this.autoKey = key; this.autoT = mode === 'block' ? 1.2 : 0.08;
    console.log(`[auto] ${mode} pressed ${Math.round(left * 1000)}ms before ${c.move!.id}`);
  }

  private revive() {
    const b = this.blob;
    if (b.alive) return;
    b.alive = true; b.hp = b.maxHp; b.combat.refill(); b.combat.stamina = b.combat.staminaMax;
    b.model.play('swim', true);
    this.game.timeScale = 1;
  }

  private makeHud() {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:8px;bottom:8px;font:12px/1.35 monospace;color:#e8f6ff;background:#0a1a24cc;padding:6px 8px;border:1px solid #3a6a80;pointer-events:none;white-space:pre;z-index:9';
    document.body.appendChild(d);
    this.hud = d;
  }

  declare keyQ: { at: number; code: string; hold: number; down: boolean }[];
  update(dt: number) {
    this.autoDefend(dt);
    // scripted keys, in game time
    const inp = this.game.input, now = this.world.time + dt;
    for (const k of this.keyQ) {
      if (!k.down && now >= k.at) { k.down = true; inp.pressed.add(k.code); inp.down.add(k.code); }
      else if (k.down && now >= k.at + k.hold) { inp.down.delete(k.code); inp.released.add(k.code); k.at = -1; }
    }
    this.keyQ = this.keyQ.filter((k) => k.at >= 0);
    super.update(dt);
  }

  tick(dt: number) {
    const inp = this.game.input, b = this.blob, a = this.arena;
    const cp = (window as unknown as { combatPreview: { moves: string[] } }).combatPreview;
    const mv = b.combat.move;
    if (mv && cp.moves[cp.moves.length - 1] !== mv) { cp.moves.push(mv); if (cp.moves.length > 50) cp.moves.shift(); }
    if (!mv && cp.moves[cp.moves.length - 1] !== '-') cp.moves.push('-');
    if (inp.keyHit('BracketLeft')) this.spawnAll();
    if (inp.keyHit('BracketRight')) { b.hp = b.maxHp; b.combat.refill(); b.combat.stamina = b.combat.staminaMax; }
    if (inp.keyHit('Backslash') && this.dummy) this.dummy.attacks = !this.dummy.attacks;
    // soft arena walls for the player
    if (b.x < a.x0 + 0.5) b.applyForce((a.x0 + 0.5 - b.x) * 80, 0);
    if (b.x > a.x1 - 0.5) b.applyForce((a.x1 - 0.5 - b.x) * 80, 0);
    if (b.y > a.top) b.applyForce(0, (a.top - b.y) * 60);
    // camera: follow, clamped to the arena
    const halfW = this.camDist * Math.tan((this.camera.fov / 2) * Math.PI / 180) * this.camera.aspect;
    const cx = Math.min(Math.max(b.x, a.x0 + halfW - 1.5), a.x1 - halfW + 1.5);
    this.camTarget.x += (cx - this.camTarget.x) * Math.min(1, dt * 5);
    this.camTarget.y += (Math.min(Math.max(b.y, a.floor + this.camDist * 0.2), a.top - 3) - this.camTarget.y) * Math.min(1, dt * 5);
    this.t3d.update(dt, this.camera);
    // dev readout (the real HUD is agent L's)
    const h = b.combat.hud();
    const bar = (v: number, m: number, n = 20) => '#'.repeat(Math.round((v / m) * n)).padEnd(n, '.');
    const last = b.combat.parryLog[b.combat.parryLog.length - 1];
    const bb = this.boss?.bar();
    this.hud.textContent = `HP ${b.hp}/${b.maxHp}  STA [${bar(h.stamina, h.staminaMax)}] ${Math.round(h.stamina)}  TEA ${'o'.repeat(h.flasks)}${'.'.repeat(h.flasksMax - h.flasks)}\n` +
      `guard ${h.guard}${h.parryWindow > 0 ? ' (window)' : ''}  move ${h.move ?? '-'}${h.charge ? ' charge ' + h.charge.toFixed(2) : ''}${h.iframes ? '  IFRAMES' : ''}  mana ${b.mana.toFixed(0)}\n` +
      `last parry: ${last ? last.result + ' ' + last.dt + 'ms' : '-'}  ${this.dummy ? 'dummy: ' + (this.dummy.attacks ? 'attacking' : 'still') + ' (\\)' : ''}` +
      (bb ? `\nBOSS ${bb.name} ${bb.title}  [${bar(bb.hp, bb.max, 30)}] phase ${bb.phase}/${bb.phases}` : '');
  }
}

export default (g: Game): Screen => new CombatPreview(g, 'combat-preview');
