// The wave director: roguelike wave defense against ever smarter humans.
//
//   const waves = new WaveDirector(world, area, { mastery, nemeses: META.nemeses });
//   waves.start(1);            // or start() for the next wave
//   each frame: waves.update(dt)
//   waves.active / waves.remaining / waves.wave / waves.isBossWave(n) / waves.dispose()
//   events (world.emit): waveStart {n, boss, mods}, waveCleared {n}, nemesis {id, line, name, title},
//                        nemesisDefeated {id, name}, kill {kind, x, y}, gore {x, y, k}, escaped, flare, netted
//
// Composition is a budget spent on squads (harpooners, spearfishers, frogmen, netters, medics, hard hats) and
// surface/sub support (depth-charge boats, line boats, trawlers, dive boats, mini-subs), unlocked as the waves
// climb. Every 5th wave is a boss wave (rotating): Captain Gaff's attack sub, the Harpoon Trawler, the Brass
// Titan. Mastery raises the budget, hp, damage and the humans' iq (reaction, aim, leading, cover, flanking,
// retreating) and adds modifiers. Returning nemeses join waves with an intro; the human who kills the blobfish,
// and anyone who gets away with a story, is promoted (nemesis.ts).
import * as THREE from 'three';
import type { World, Entity, DamageKind } from '../game/types';
import type { Nemesis } from '../meta/meta';
import { META } from '../meta/meta';
import { Rng } from '../core/rng';
import type { WaveArea, WaveOpts, Target } from './types';
import { areaName } from './types';
import { Human, Squad, newSquad, ROLES, VARIANTS } from './human';
import { modelParts } from '../humans/model';
import type { Archetype as HArch } from '../humans/looks';
import type { Role } from './human';
import { SurfaceBoat } from './boat';
import type { BoatJob } from './boat';
import { MiniSub } from './sub';
import { board } from './board';
import { promote, defeat, pickReturning, roleOf, introLine, nemesisLoot } from './nemesis';
import { bark } from './barks';
import type { BoatKind, Archetype } from '../humans';

export type Unit = Role | 'boatCharges' | 'boatLines' | 'trawler' | 'diveBoat' | 'sub';
const COST: Record<Unit, number> = { harpoon: 2, spear: 2, knife: 2.5, net: 3, medic: 2.5, heavy: 6, titan: 40, boatCharges: 4.5, boatLines: 4, trawler: 7, diveBoat: 5, sub: 8 };
/** first wave each unit can appear in (mastery pulls them earlier) */
const UNLOCK: Record<Unit, number> = { harpoon: 1, spear: 1, knife: 2, boatCharges: 2, net: 3, medic: 3, boatLines: 3, diveBoat: 4, heavy: 4, trawler: 6, sub: 6, titan: 99 };
export type BossKind = 'captain' | 'trawler' | 'titan';
export const MODIFIERS = ['Armoured', 'Trigger-Happy', 'Reinforced', 'Bloodhounds', 'Depth-Chargers', 'Elite Squads'] as const;

interface Pending { t: number; role: Role; x: number; y: number; squad: Squad; nemesis?: Nemesis; from: 'edge' | 'surface' | 'sub' }

export class WaveDirector {
  wave = 0;
  active = false;
  mastery: number;
  humans: Human[] = [];
  boats: SurfaceBoat[] = [];
  subs: MiniSub[] = [];
  bosses: Entity[] = [];
  /** modifiers in effect this wave */
  mods: string[] = [];
  /** promotions this run (for the end screen) */
  promoted: Nemesis[] = [];
  private nemeses: Nemesis[];
  private target: Target | null;
  private rng: Rng;
  private queue: Pending[] = [];
  private t = 0;
  private playerAlive = true;
  private returning = new Set<string>();
  private save: boolean;
  private x0: number; private x1: number;
  private clearT = 0;
  /** model looks to build ahead of time, one per frame (arch, seed) */
  private warm: [HArch, number][] = [];

  constructor(public w: World, public area: WaveArea | null, o: WaveOpts = {}) {
    this.mastery = o.mastery ?? 0;
    this.nemeses = o.nemeses ?? META.nemeses;
    this.target = o.target ?? area?.shipwreck ?? null;
    this.rng = new Rng(o.seed ?? ((Math.random() * 1e9) | 0));
    this.save = !o.noSave;
    this.x0 = area?.bounds.x0 ?? -30;
    this.x1 = area?.bounds.x1 ?? 30;
    board(w);
    // pre-build the looks of the early roles so the first spawns don't hitch
    for (const r of ['harpoon', 'spear', 'knife', 'net', 'medic', 'heavy'] as Role[]) for (let v = 1; v <= VARIANTS; v++) this.warm.push([ROLES[r].arch, v]);
  }

  /** humans + vessels still to beat this wave (including ones not spawned yet) */
  get remaining() {
    // support boats don't hold a wave open (they leave once the divers are gone); boss boats and subs do
    return this.queue.length + this.humans.filter((h) => h.alive && h.state !== 'dead').length + this.boats.filter((b) => b.alive && b.state !== 'sinking' && b.isBoss).length + this.subs.filter((s) => s.alive && s.team === 'enemy').length;
  }
  isBossWave(n = this.wave) { return n > 0 && n % 5 === 0; }
  bossKind(n = this.wave): BossKind { return (['captain', 'trawler', 'titan'] as BossKind[])[(Math.floor(n / 5) - 1 + this.mastery) % 3]; }
  /** derived difficulty knobs for wave n */
  knobs(n = this.wave) {
    const m = this.mastery;
    return {
      budget: 4 + n * 2.3 + m * 3,
      hpMul: 1 + m * 0.25 + n * 0.04,
      dmgMul: 1 + m * 0.15 + (n > 8 ? 0.2 : 0),
      iq: Math.min(1.05, 0.28 + m * 0.13 + n * 0.035),
      elite: Math.min(0.5, n * 0.03 + m * 0.08),
    };
  }

  start(n = this.wave + 1) {
    this.wave = n;
    this.active = true;
    this.clearT = 0;
    const k = this.knobs(n);
    const r = this.rng;
    // modifiers (mastery 1+): one per mastery level, rolled per wave
    this.mods = [];
    for (let i = 0; i < Math.min(this.mastery, 3); i++) { const m = r.pick(MODIFIERS); if (!this.mods.includes(m)) this.mods.push(m); }
    const boss = this.isBossWave(n);
    let budget = k.budget * (this.mods.includes('Reinforced') ? 1.25 : 1) * (boss ? 0.55 : 1);
    // ---- spend the budget on squads and support
    const units: Unit[] = (Object.keys(COST) as Unit[]).filter((u) => UNLOCK[u] <= n + this.mastery && u !== 'titan');
    const picks: Unit[] = [];
    let guard = 0;
    while (budget > 1.9 && guard++ < 60) {
      const afford = units.filter((u) => COST[u] <= budget);
      if (!afford.length) break;
      // weight: plenty of harpooners, support thinner; more boats with Depth-Chargers
      const u = r.weighted(afford, (u) => (u === 'harpoon' ? 3 : u === 'spear' ? 2 : u === 'boatCharges' && this.mods.includes('Depth-Chargers') ? 3 : u === 'sub' || u === 'trawler' ? 0.6 : 1.2) * (picks.filter((p) => p === u).length > 2 ? 0.3 : 1));
      picks.push(u); budget -= COST[u];
    }
    // ---- squads of divers (2-4), each led by its first member; medics join squads
    const divers = picks.filter((u): u is Role => u in ROLES);
    const support = picks.filter((u) => !(u in ROLES));
    let delay = 1.5;
    while (divers.length) {
      const sq = newSquad();
      const size = Math.min(divers.length, 2 + r.int(0, 2));
      const side = r.sign();
      const entry = this.entryFor(side);
      for (let i = 0; i < size; i++) {
        const role = divers.shift()!;
        const fromSurface = role === 'spear' || (role === 'harpoon' && r.chance(0.25));
        this.queue.push({ t: delay + i * 0.7, role, x: fromSurface ? entry.x * 0.3 + (this.x0 + this.x1) * 0.35 + r.range(-6, 6) : entry.x, y: entry.y + r.range(-1, 1), squad: sq, from: fromSurface ? 'surface' : 'edge' });
      }
      delay += 4 + r.range(0, 3);
    }
    for (const u of support) { this.spawnSupport(u, k); }
    // ---- bosses
    if (boss) this.spawnBoss(this.bossKind(n), k);
    // ---- returning nemeses
    for (const nem of pickReturning(this.nemeses, n, this.mastery, this.returning, r)) {
      this.returning.add(nem.id);
      const sq = newSquad();
      const e = this.entryFor(r.sign());
      this.queue.push({ t: delay * 0.5 + 2, role: roleOf(nem), x: e.x, y: e.y, squad: sq, nemesis: nem, from: 'edge' });
    }
    this.w.emit('waveStart', { n, boss, mods: [...this.mods], bossKind: boss ? this.bossKind(n) : null });
    this.w.text.pop(boss ? `WAVE ${n}: BOSS` : `WAVE ${n}`, this.w.player.x, this.w.player.y + 2.4, boss ? 'danger' : 'title', { size: 0.8, life: 2.6, vy: 0.2 });
    if (this.mods.length) this.w.text.pop(this.mods.join(' / '), this.w.player.x, this.w.player.y + 1.7, 'hint', { size: 0.3, life: 2.6, vy: 0.2 });
  }

  private entryFor(side: number): { x: number; y: number } {
    const es = this.area?.spawns.entries ?? [];
    const pool = es.filter((e) => (e.side ?? Math.sign(e.x)) === side);
    if (pool.length) { const e = this.rng.pick(pool); return { x: e.x, y: e.y }; }
    if (es.length) { const e = this.rng.pick(es); return { x: e.x, y: e.y }; }
    const x = side > 0 ? this.x1 + 3 : this.x0 - 3;
    const fl = this.w.terrain.floorAt(x);
    return { x, y: Math.max(fl + 2, -4 - this.rng.range(0, 2)) };
  }
  private surfaceX(): number {
    const s = this.area?.spawns.surface ?? [];
    if (s.length) return this.rng.pick(s) + this.rng.range(-2, 2);
    return this.rng.range(this.x0 + 5, this.x1 - 5);
  }

  private mods_(k: ReturnType<WaveDirector['knobs']>, elite: boolean) {
    const armoured = this.mods.includes('Armoured');
    return { hpMul: k.hpMul * (armoured ? 1.3 : 1), dmgMul: k.dmgMul, iq: k.iq + (this.mods.includes('Bloodhounds') ? 0.15 : 0), reloadMul: this.mods.includes('Trigger-Happy') ? 0.7 : 1, elite: elite || this.mods.includes('Elite Squads') && this.rng.chance(0.4), seed: this.rng.int(1, 1e6) };
  }

  private spawnHuman(p: Pending): Human {
    const k = this.knobs();
    const h = new Human(p.role, p.x, p.y, p.squad, this.area, this.target, { ...this.mods_(k, this.rng.chance(k.elite)), nemesis: p.nemesis ?? null });
    h.onDeath = (hh, w, src, kind) => this.humanDied(hh, w, src, kind);
    h.onEscape = (hh, w) => this.humanEscaped(hh, w);
    h.onFlare = (x) => this.reinforce(x);
    this.w.add(h);
    h.mountTag(this.w.scene);
    if (p.role === 'heavy' || p.role === 'titan') h.attachHose(this.w);
    if (p.from === 'surface') { this.w.fx.splash(p.x, 1.1); this.w.sfx('splash_b', p.x, 0.6); h.y = Math.min(h.y, this.w.water.heightAt(p.x) - 0.6); }
    if (p.role === 'heavy' || p.role === 'titan') h.y = this.w.terrain.floorAt(h.x) + h.rig.pivotHeight;
    this.humans.push(h);
    if (p.nemesis) this.introduce(h, p.nemesis);
    return h;
  }

  /** Shadow of Mordor-ish intro: freeze, name card, the grudge line */
  private introduce(h: Human, n: Nemesis) {
    const w = this.w;
    w.game.freeze(0.25);
    w.game.addShake(0.2);
    w.text.pop(n.name.toUpperCase(), h.x, h.y + 2.2, 'title', { size: 0.55, life: 3.8, vy: 0.05 });
    w.text.pop(n.title, h.x, h.y + 1.7, 'magic', { size: 0.42, life: 3.8, vy: 0.05 });
    const line = introLine(n);
    bark(w, [line], h.x, h.y + 0.3, { force: true, style: 'danger', size: 0.3, follow: () => ({ x: h.x, y: h.y + 0.4 }) });
    w.sfx('boss_growl', h.x, 0.5, 1.3);
    w.emit('nemesis', { id: n.id, line, name: n.name, title: n.title, level: n.level });
  }

  private spawnSupport(u: Unit, k: ReturnType<WaveDirector['knobs']>) {
    const r = this.rng;
    const side = r.sign();
    switch (u) {
      case 'boatCharges': case 'boatLines': case 'trawler': case 'diveBoat': {
        const job: BoatJob = u === 'boatCharges' ? 'charges' : u === 'boatLines' ? 'lines' : u === 'trawler' ? 'trawl' : 'drop';
        const kind: BoatKind = u === 'trawler' ? 'trawler' : u === 'boatLines' ? r.pick(['skiff', 'dinghy'] as BoatKind[]) : u === 'diveBoat' ? 'dinghy' : r.pick(['rowboat', 'dinghy', 'skiff'] as BoatKind[]);
        const crew: Archetype[] = job === 'lines' ? ['proAngler', 'oldSalt'] : job === 'charges' ? ['dockWorker'] : ['oldSalt'];
        const b = new SurfaceBoat(job, kind, this.surfaceX(), side, r.int(1, 3), { iq: k.iq, hpMul: k.hpMul, crew, drops: job === 'drop' ? 3 : 0 });
        if (job === 'drop') {
          const sq = newSquad();
          b.onDrop = (x) => this.queue.push({ t: 0, role: r.pick(['harpoon', 'harpoon', 'knife', 'net'] as Role[]), x, y: this.w.water.heightAt(x) - 0.8, squad: sq, from: 'surface' });
        }
        this.w.add(b);
        this.boats.push(b);
        break;
      }
      case 'sub': {
        const e = this.entryFor(side);
        const s = new MiniSub(e.x + side * 3, Math.max(e.y, -5), k.iq, false, k.hpMul);
        this.w.add(s);
        this.subs.push(s);
        break;
      }
    }
  }

  private spawnBoss(kind: BossKind, k: ReturnType<WaveDirector['knobs']>) {
    const w = this.w, r = this.rng;
    const side = r.sign();
    if (kind === 'captain') {
      const e = this.entryFor(side);
      const s = new MiniSub(e.x + side * 5, Math.max(e.y, -5.5), Math.max(0.6, k.iq), true, k.hpMul);
      s.onDeploy = (x, y) => { const sq = newSquad(); this.queue.push({ t: 0.2, role: r.pick(['harpoon', 'knife', 'net'] as Role[]), x, y, squad: sq, from: 'sub' }); };
      w.add(s); this.subs.push(s); this.bosses.push(s);
      bark(w, ['Gaff here. Sink the wreck. Bring me that fish.'], s.x, s.y + 2, { force: true, style: 'danger' });
    } else if (kind === 'trawler') {
      const b = new SurfaceBoat('cannon', 'trawler', this.surfaceX(), side, r.int(1, 1e6), { iq: Math.max(0.6, k.iq), hpMul: k.hpMul, crew: ['captainGaff', 'dockWorker'], boss: true });
      w.add(b); this.boats.push(b); this.bosses.push(b);
    } else {
      const sq = newSquad();
      const e = this.entryFor(side);
      this.queue.push({ t: 1, role: 'titan', x: e.x, y: e.y, squad: sq, from: 'edge' });
      this.queue.push({ t: 2.5, role: 'medic', x: e.x, y: e.y + 1, squad: sq, from: 'edge' });
      this.queue.push({ t: 3, role: 'heavy', x: e.x, y: e.y, squad: sq, from: 'edge' });
    }
    w.emit('boss', { kind });
  }

  /** a flare reached the surface: a squad arrives at x */
  private reinforce(x: number) {
    const r = this.rng;
    const sq = newSquad();
    const n = 2 + (this.mods.includes('Reinforced') ? 1 : 0) + (this.mastery > 1 ? 1 : 0);
    for (let i = 0; i < n; i++) this.queue.push({ t: 5 + i * 0.8, role: r.pick(['harpoon', 'harpoon', 'knife', 'spear'] as Role[]), x: x + r.range(-2, 2), y: this.w.water.heightAt(x) - 0.8, squad: sq, from: 'surface' });
    this.w.text.pop('REINFORCEMENTS INCOMING', x, this.w.water.heightAt(x) + 1, 'danger', { size: 0.34, life: 2.5 });
  }

  // ---------------------------------------------------------------- deaths, escapes, the blobfish dying
  private humanDied(h: Human, w: World, src: Entity | null, kind: DamageKind | undefined) {
    if (h.nemesis) {
      const n = h.nemesis;
      const { survived } = defeat(n, { area: areaName(this.area), save: this.save }, this.nemeses);
      w.text.pop(survived ? `${n.name.split(' ')[0].toUpperCase()} CRAWLS AWAY...` : 'NEMESIS SLAIN', h.x, h.y + 1.6, survived ? 'hint' : 'gold', { size: 0.5, life: 3 });
      for (const it of nemesisLoot(n)) w.drop(h.x + (Math.random() - 0.5), h.y + 0.3, { item: it });
      w.drop(h.x, h.y, { coins: 25 * n.level });
      w.emit('nemesisDefeated', { id: n.id, name: n.name, survived });
    }
    void src; void kind;
  }
  private humanEscaped(h: Human, w: World) {
    // only humans with a story come back: wounded ones, or the ones who hurt you
    const story = h.scars.size > 0 || h.dealt > 0 || h.nemesis;
    if (!story && Math.random() < 0.6) return;
    const n = promote(h, { area: areaName(this.area), wave: this.wave, how: 'escaped', save: this.save }, this.nemeses);
    if (!this.promoted.includes(n)) this.promoted.push(n);
    w.text.pop(`${n.name} ${n.title}`, h.x, h.y + 1.2, 'magic', { size: 0.3, life: 3 });
    w.emit('nemesis', { id: n.id, line: 'promoted', name: n.name, title: n.title, level: n.level, promoted: true });
  }
  private playerDied() {
    const w = this.w, b = board(w);
    const by = b.lastHurt.by;
    if (!by || b.time - b.lastHurt.t > 4) return;
    const h = this.humans.find((x) => x === by);
    if (h && h.state !== 'dead') {
      h.say(w, 'killed', true);
      const n = promote(h, { area: areaName(this.area), wave: this.wave, how: 'killed', save: this.save }, this.nemeses);
      if (!this.promoted.includes(n)) this.promoted.push(n);
      w.emit('nemesis', { id: n.id, line: 'killed you', name: n.name, title: n.title, level: n.level, promoted: true });
    }
    for (const o of this.humans) if (o.alive && o.state !== 'dead' && o !== h && Math.random() < 0.4) o.say(w, 'killed');
  }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    const w = this.w;
    const b = board(w);
    b.time += dt;
    this.t += dt;
    if (this.warm.length) { const [a, sd] = this.warm.shift()!; modelParts(a, sd); }
    // spawns
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.t -= dt;
      if (q.t <= 0) { this.queue.splice(i, 1); this.spawnHuman(q); }
    }
    // the blobfish died: whoever did it gets promoted
    const pa = w.player.alive && (w.player.hp ?? 1) > 0;
    if (this.playerAlive && !pa) this.playerDied();
    this.playerAlive = pa;
    // housekeeping
    this.humans = this.humans.filter((h) => h.alive);
    this.boats = this.boats.filter((x) => x.alive);
    this.subs = this.subs.filter((x) => x.alive);
    // the divers are done: the support boats pack up and motor off
    if (this.active && !this.queue.length && !this.humans.some((h) => h.alive && h.state !== 'dead')) for (const bt of this.boats) if (!bt.isBoss && bt.state === 'work' && bt.job !== 'trawl') bt.state = 'leave';
    if (this.active && this.remaining === 0) {
      this.clearT += dt;
      if (this.clearT > 1.2) {
        this.active = false;
        // the dive boats and anyone still treading water leave
        for (const bt of this.boats) bt.state = 'leave';
        w.emit('waveCleared', { n: this.wave });
        w.text.pop(`WAVE ${this.wave} CLEARED`, w.player.x, w.player.y + 2, 'gold', { size: 0.6, life: 2.4, vy: 0.3 });
        w.sfx('jin_good', w.player.x, 0.7);
      }
    } else this.clearT = 0;
  }

  /** remove everything this director spawned */
  dispose() {
    for (const h of this.humans) h.alive = false;
    for (const x of this.boats) x.alive = false;
    for (const x of this.subs) x.alive = false;
    this.queue.length = 0;
    this.active = false;
  }
}
export { THREE };
