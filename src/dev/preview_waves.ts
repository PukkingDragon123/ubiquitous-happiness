// Dev preview for the waves module (?preview=waves).
//
// A mock reef with a dummy shipwreck to defend, the real blobfish (WASD swim, J / click slash, Space dash) and
// the WaveDirector running waves of smart humans, boats and subs.
//   keys  N next wave   B jump to the next boss wave   K kill every human (gore)   G dismember the nearest
//         M spawn a nemesis (a made-up record with scars)   1-7 spawn harpoon / spear / knife / net / medic /
//         heavy / titan next to you   O boat (charges)   P mini-sub   H heal + invulnerable toggle
// URL:   &wave=N (start at wave N)  &mastery=M  &nemesis=1 (a nemesis joins wave 1)  &god=1  &auto=1 (next wave
//        when cleared)  &spawn=harpoon,knife (just those, no director)  &d=<camera dist>
//        &mode=models [&arch=scuba,heavyDiver&pose=swim|tread&weapon=..&scars=..&focus=i&nogear=1&hi=1] lineup
//        &mode=gore (a diver is dismembered in front of you on a loop)
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import type { Entity, World, Team, DamageKind } from '../game/types';
import { MockScreen } from './mockWorld';
import { makeDiver, DIVER_ARCHETYPES, DETAIL } from '../humans';
import type { DiverRig, DiverMode, WeaponKind, DiverArch } from '../humans';
import { Blobfish } from '../player/blobfish';
import { BASE_STATS } from '../game/run';
import { WaveDirector, Human, newSquad, SurfaceBoat, MiniSub } from '../waves';
import type { WaveArea, Role } from '../waves';
import type { Nemesis } from '../meta/meta';
import { Loft, FULL } from '../gfx/loft';
import { kitMat } from '../humans/diveGear';
import { band, hh, nz } from '../humans/fabric';
import { textSprite, STYLES } from '../ui/text';

const WEAPON: Record<DiverArch, WeaponKind> = { scuba: 'speargun', freediver: 'bandgun', netDiver: 'net', commando: 'knife', medic: 'flaregun', heavyDiver: 'cannon', titan: 'cannon' };

/** a stand-in shipwreck: a broken low-poly hull lying on the sand, with an hp bar */
class DummyWreck implements Entity {
  kind = 'shipwreck'; team: Team = 'friend';
  x: number; y: number; vx = 0; vy = 0; r = 2.6; alive = true; hp = 240; maxHp = 240;
  obj = new THREE.Group();
  private bar: THREE.Mesh; private flash = 0;
  private hullMat: THREE.MeshStandardMaterial;
  constructor(x: number, floorY: number) {
    this.x = x; this.y = floorY + 1.3;
    const B = new Loft(false);
    // an upturned, broken hull: a half shell of planks, ragged at one end, a snapped mast
    const n = 9, L = 6.4;
    const rings = Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1), x0 = -L / 2 + t * L;
      const w = 1.4 * Math.sin(Math.min(1, t * 1.2 + 0.1) * Math.PI * 0.95 + 0.1);
      const pts: [number, number, number][] = [];
      for (let j = 0; j <= 8; j++) { const a = Math.PI * (j / 8); pts.push([x0, -Math.sin(a) * w * 0.9 + w * 0.9 + (i === n - 1 ? -0.3 * (j % 2) : 0), Math.cos(a) * w]); }
      return { pts, v: t };
    });
    B.loft(rings, Array.from({ length: 9 }, (_, j) => j / 8), FULL, 1, {});
    B.loft(rings, Array.from({ length: 9 }, (_, j) => j / 8), FULL, 2, { flip: true });
    B.box([0.6, 2.4, 0], [0.18, 3.2, 0.18], FULL, undefined, new THREE.Matrix4().makeRotationZ(0.35));
    this.hullMat = kitMat('dummyWreck', 64, 64, (x, y) => {
      const plank = (y >> 3) & 1;
      let c = band(plank ? [128, 96, 64] : [112, 84, 56], 0.9 + (nz(x * 3, y, 5, 9) - 0.5) * 0.4 + ((x + y * 7) % 13 === 0 ? -0.2 : 0), x, y);
      if (nz(x, y, 6, 3) > 0.7) c = band([60, 90, 60], 0.9, x, y);
      if (y % 8 === 0) c = band([40, 30, 22], 1, x, y);
      if (hh(x, y, 4) > 0.97) c = band([200, 200, 190], 1, x, y);
      return c;
    }, { rough: 0.9 }) as THREE.MeshStandardMaterial;
    const m = new THREE.Mesh(B.build(), this.hullMat);
    m.rotation.z = 0.08; m.position.y = -1.3;
    m.castShadow = m.receiveShadow = true;
    this.obj.add(m);
    this.bar = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.12), new THREE.MeshBasicMaterial({ color: 0x40e070, depthTest: false }));
    this.bar.position.set(0, 2.2, 1); this.bar.renderOrder = 50;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.2), new THREE.MeshBasicMaterial({ color: 0x101418, depthTest: false }));
    back.position.set(0, 2.2, 0.99); back.renderOrder = 49;
    const label = textSprite('SHIPWRECK', STYLES.small, 0.22); label.position.set(0, 2.5, 1);
    this.obj.add(back, this.bar, label);
    this.obj.position.set(this.x, this.y, -0.6);
  }
  update(dt: number) {
    this.flash = Math.max(0, this.flash - dt * 4);
    this.hullMat.emissive.setRGB(this.flash * 0.6, this.flash * 0.1, 0);
    const k = Math.max(0, this.hp / this.maxHp);
    this.bar.scale.x = Math.max(0.001, k); this.bar.position.x = -1.2 * (1 - k);
    (this.bar.material as THREE.MeshBasicMaterial).color.setHSL(0.33 * k, 0.7, 0.5);
  }
  hit(dmg: number, _dx: number, _dy: number, w: World, _src: Entity | null, kind?: DamageKind): boolean {
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 1;
    w.text.pop('-' + Math.round(dmg), this.x + (Math.random() - 0.5) * 2, this.y + 1.5, 'damage', { size: 0.3 });
    void kind;
    return true;
  }
}

const FAKE_NEMESES: Nemesis[] = [
  { id: 'demo1', name: "Gary 'Two-Lines' Petersen", title: 'Hook-Hand', arch: 'netDiver:net', level: 2, scars: ['hookHand', 'eyepatch', 'bandage'], memories: ['you took his hand at the Sunlit Reef', 'got away from you at the Kelp Cathedral'], kills: 1, defeats: 0, seed: 77, alive: true },
  { id: 'demo2', name: "Marta 'Lungs' Coldwater", title: 'the Scorched', arch: 'freediver:spear', level: 1, scars: ['burns', 'stitches'], memories: ['you burned him at the Frost Shelf'], kills: 0, defeats: 0, seed: 31, alive: true },
  { id: 'demo3', name: "Dale 'Deadeye' Quint", title: 'the Bitten', arch: 'scuba:harpoon', level: 3, scars: ['bite', 'eyepatch', 'scar'], memories: ['killed you at the Shipwreck Graveyard', 'you bit him at the Sunlit Reef'], kills: 2, defeats: 0, seed: 12, alive: true },
];

class WavesPreview extends MockScreen {
  declare q: URLSearchParams;
  declare divers: DiverRig[];
  declare blob: Blobfish;
  declare wreck: DummyWreck;
  declare dir: WaveDirector | null;
  declare area: WaveArea;
  declare hud: HTMLDivElement;
  declare god: boolean;
  declare goreT: number;
  declare goreVictim: Human | null;
  declare nemI: number;

  setup() {
    const q = (this.q = new URLSearchParams(location.search));
    if (q.get('hi')) DETAIL.low = false;
    this.divers = []; this.dir = null; this.goreT = 0; this.goreVictim = null; this.nemI = 0;
    this.camDist = +(q.get('d') || 17);
    if (q.get('mode') === 'models') { this.setupModels(q); return; }
    // the real blobfish
    this.world.player.obj?.removeFromParent();
    this.blob = q.get('mode') === 'gore' ? new Blobfish(-2, -7.2) : new Blobfish(-4, -5);
    this.blob.setStats({ ...BASE_STATS, abilities: ['laserEyes', 'rockBody', 'zap'] });
    this.world.player = this.blob;
    this.scene.add(this.blob.obj);
    this.god = q.get('god') === '1';
    // the wreck + a mock area
    const wx = 2;
    this.wreck = new DummyWreck(wx, this.world.terrain.floorAt(wx));
    this.world.add(this.wreck);
    this.area = {
      id: 'reef', bounds: { x0: -26, x1: 26, surface: 0 },
      shipwreck: this.wreck,
      spawns: { surface: [-14, -4, 9, 18], entries: [{ x: -29, y: -5, side: -1 }, { x: -29, y: -3, side: -1 }, { x: 29, y: -4.5, side: 1 }, { x: 29, y: -6, side: 1 }] },
    };
    this.hud = document.createElement('div');
    Object.assign(this.hud.style, { position: 'fixed', left: '8px', top: '8px', color: '#e8f4ff', font: '12px monospace', textShadow: '1px 1px 0 #000', pointerEvents: 'none', whiteSpace: 'pre', zIndex: '10' });
    document.body.appendChild(this.hud);
    window.addEventListener('keydown', (e) => this.key(e.code));
    if (q.get('mode') === 'gore') { this.god = true; this.followPlayer = false; this.camTarget.set(1.2, -5.6, 0); return; }
    const only = q.get('spawn');
    if (only) { for (const r of only.split(',')) this.spawnRole(r as Role, this.blob.x + 6 + Math.random() * 3, this.blob.y + (Math.random() - 0.5) * 2); return; }
    this.dir = new WaveDirector(this.world, this.area, { mastery: +(q.get('mastery') || 0), nemeses: q.get('nemesis') ? FAKE_NEMESES.map((n) => ({ ...n })) : [], noSave: true, seed: +(q.get('seed') || 7) });
    this.dir.start(+(q.get('wave') || 1));
    if (q.get('cam') === 'wreck') { this.followPlayer = false; this.camTarget.set(this.wreck.x + +(q.get('cx') || 0), -5.5 + +(q.get('cy') || 0), 0); }
    if (q.get('nemesis')) this.spawnNemesis();
  }

  private spawnRole(role: Role, x: number, y: number, nem?: Nemesis): Human {
    const h = new Human(role, x, y, newSquad(), this.area, this.wreck, { iq: 0.7, nemesis: nem ?? null });
    if (role === 'heavy' || role === 'titan') h.y = this.world.terrain.floorAt(x) + h.rig.height * 0.47;
    this.world.add(h);
    h.mountTag(this.scene);
    if (role === 'heavy' || role === 'titan') h.attachHose(this.world);
    if (this.dir) this.dir.humans.push(h);
    return h;
  }
  private spawnNemesis() {
    const n = FAKE_NEMESES[this.nemI++ % FAKE_NEMESES.length];
    const role = n.arch.split(':')[1] as Role;
    const h = this.spawnRole(role, this.blob.x + 7, this.blob.y + 1, { ...n });
    this.world.text.pop(n.name.toUpperCase(), h.x, h.y + 2.2, 'title', { size: 0.55, life: 3.8, vy: 0.05 });
    this.world.text.pop(n.title, h.x, h.y + 1.7, 'magic', { size: 0.42, life: 3.8, vy: 0.05 });
    h.provoke(this.world, 'spot');
  }

  private key(code: string) {
    const w = this.world;
    const roles: Role[] = ['harpoon', 'spear', 'knife', 'net', 'medic', 'heavy', 'titan'];
    if (code === 'KeyN' && this.dir) this.dir.start();
    if (code === 'KeyB' && this.dir) this.dir.start(Math.ceil((this.dir.wave + 1) / 5) * 5);
    if (code === 'KeyK') for (const e of [...w.entities]) if (e instanceof Human && e.state !== 'dead') e.hit(99, Math.sign(e.x - this.blob.x) || 1, 0.3, w, this.blob, 'sword');
    if (code === 'KeyG') { const h = this.nearest(); if (h) h.cut(w, (['farmR', 'farmL', 'shinL', 'head', 'uarmR', 'thighR'] as const)[Math.floor(Math.random() * 6)], 1, 0.5); }
    if (code === 'KeyM') this.spawnNemesis();
    if (code === 'KeyH') { this.god = !this.god; this.blob.hp = this.blob.maxHp; }
    if (code === 'KeyO') w.add(new SurfaceBoat('charges', 'dinghy', this.blob.x + 2, 1, 5, { iq: 0.6 }));
    if (code === 'KeyP') w.add(new MiniSub(this.blob.x + 12, this.blob.y, 0.6));
    const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'].indexOf(code);
    if (i >= 0) this.spawnRole(roles[i], this.blob.x + 6, this.blob.y + 1);
  }
  private nearest(): Human | null {
    let best: Human | null = null, bd = 1e9;
    for (const e of this.world.entities) if (e instanceof Human && e.alive) { const d = Math.hypot(e.x - this.blob.x, e.y - this.blob.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ---------------------------------------------------------------- model lineup
  private setupModels(q: URLSearchParams) {
    this.followPlayer = false;
    const mode = (q.get('pose') || 'swim') as DiverMode;
    const list = q.get('arch') ? (q.get('arch')!.split(',') as DiverArch[]) : DIVER_ARCHETYPES;
    list.forEach((a, i) => {
      const scars = q.get('scars')?.split(',') ?? [];
      const d = makeDiver(a, 3 + i, { weapon: (q.get('weapon') as WeaponKind) || WEAPON[a], scars });
      const heavy = a === 'heavyDiver' || a === 'titan';
      d.mode = heavy ? 'walk' : mode;
      d.facing = i % 2 ? -1 : 1;
      if (q.get('face')) d.facing = +q.get('face')! as 1 | -1;
      d.speed = 0.6;
      d.group.position.set((i - (list.length - 1) / 2) * 3.2, heavy ? -9 + d.height * 0.47 : -4.5, 0);
      if (q.get('nogear')) for (const pp of d.model.dive.parts) pp.visible = false;
      this.scene.add(d.group);
      this.divers.push(d);
    });
    this.camTarget.set(+(q.get('cx') || 0), +(q.get('cy') || -5), 0);
    if (q.get('focus')) { const f = this.divers[+q.get('focus')!]; this.camTarget.set(f.group.position.x + +(q.get('cx') || 0), f.group.position.y + +(q.get('cy') || 0), 0); }
  }

  tick(dt: number) {
    const w = this.world;
    if (this.divers.length) {
      for (const d of this.divers) { if (this.q.get('aim') !== '0') d.aimAt(w.player.x, w.player.y); d.update(dt); }
      return;
    }
    if (this.god) { this.blob.hp = this.blob.maxHp; this.blob.alive = true; }
    this.dir?.update(dt);
    if (this.q.get('auto') && this.dir && !this.dir.active) this.dir.start();
    if (this.q.get('mode') === 'gore') this.goreLoop(dt);
    this.camYOff = this.q.get('mode') === 'gore' ? -0.8 : 0.6;
    const d = this.dir;
    this.hud.textContent = d
      ? `WAVE ${d.wave}${d.isBossWave() ? ' (BOSS ' + d.bossKind() + ')' : ''}  remaining ${d.remaining}  active ${d.active}\nmastery ${d.mastery}  iq ${d.knobs().iq.toFixed(2)}  mods ${d.mods.join(', ') || '-'}\nwreck ${Math.round(this.wreck.hp)}/${this.wreck.maxHp}  blobfish ${this.blob.hp}/${this.blob.maxHp}${this.god ? ' (god)' : ''}\nnemeses promoted: ${d.promoted.map((n) => n.name + ' ' + n.title).join('; ') || '-'}\n[N] next  [B] boss  [K] kill all  [G] dismember  [M] nemesis  [1-7] spawn  [O] boat  [P] sub  [H] god`
      : `[1-7] spawn  [G] dismember  [K] kill  [M] nemesis`;
  }

  /** a diver swims up, gets taken apart limb by limb, a fresh one follows */
  private goreLoop(dt: number) {
    const w = this.world;
    this.goreT += dt;
    if (!this.goreVictim || (this.goreVictim.state === 'dead' && this.goreT > 7)) {
      const roles: Role[] = ['harpoon', 'knife', 'spear', 'net', 'heavy'];
      this.goreVictim = this.spawnRole(roles[Math.floor(this.goreT * 7) % roles.length], 1.5, -6.6);
      this.goreVictim.ai = false;
      this.goreT = 0;
    }
    const h = this.goreVictim;
    if (h.state === 'dead') return;
    const steps: [number, () => void][] = [
      [1.6, () => h.cut(w, 'farmL', -1, 0.4)],
      [2.6, () => h.cut(w, 'shinR', 1, -0.2)],
      [3.6, () => h.hit(3, 1, 0.2, w, this.blob, 'bite')],
      [4.6, () => { h.hit(99, 1, 0.3, w, this.blob, 'sword'); if (!h.rig.isSevered('head')) h.cut(w, 'head', 0.5, 1); }],
    ];
    for (const [t, f] of steps) if (this.goreT - dt < t && this.goreT >= t) f();
  }
  exit() { this.hud?.remove(); }
}

export default function make(game: Game): Screen { return new WavesPreview(game, 'waves'); }
