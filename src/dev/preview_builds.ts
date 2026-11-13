// Dev preview for builds (?preview=builds): blobfish v2 in every build's gear, its animations, and every skill.
//
//   ?preview=builds                        lineup: default / mage / warrior / summoner / tinkerer / rogue on the
//                                          seabed, cycling the animations (idle, waddle, cheer, gearUp, hurt, die, swim)
//   &anim=cheer                            hold one animation      &build=mage   only that build (big, close up)
//   &close=1                               camera close-up of the lineup / single puppet
//   &blob=mage                             play as that build (WASD, J attack, 1-4 skills, right mouse cast, Q cycle)
//                                          with training dummies, the skill bar HUD and the backpack's set bonuses
//   &skill=megalodon                       auto-cast that skill at the dummies every few seconds (with &blob=...)
//   &auto=1                                auto-cast the build's skills in turn
//   &mega=1                                the megalodon model alone, turning slowly (art review)
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import type { Entity, World, Team, DamageKind } from '../game/types';
import { MockScreen } from './mockWorld';
import { Blobfish } from '../player/blobfish';
import { BlobPuppet } from '../player/puppet';
import { BUILD_GEAR, type BuildId } from '../player/gear';
import { BLOB_ANIMS, type BlobAnim } from '../player/blobModel';
import { findSpot, installItemSystem, skillLevels, setBonuses } from '../game/items';
import { SkillBar } from '../skills/hud';
import { SKILLS } from '../skills/registry';
import { buildMegalodon } from '../skills/megalodon';
import { FX } from '../skills/fx';
import { psxMat, mesh, facet, xf, page } from '../player/psx';
import { ramp } from '../gfx/px';
import { textSprite, STYLES } from '../ui/text';
import type { Run } from '../game/run';

const BUILDS: BuildId[] = ['default', 'mage', 'warrior', 'summoner', 'tinkerer', 'rogue'];
const LABEL: Record<BuildId, string> = { default: 'Blobfish', mage: 'Mage', warrior: 'Warrior', summoner: 'Toymaker', tinkerer: 'Tinkerer', rogue: 'Rogue' };
export const BUILD_ITEMS: Record<BuildId, string[]> = {
  default: ['whetstone', 'corkBobber', 'luckyLure'],
  mage: ['coralStaff', 'kelpRobe', 'wizardHat', 'frostTome', 'stormTome', 'bubblePipe', 'apprenticeWand', 'manaCrystal'],
  warrior: ['cutlass', 'chainmail', 'plumedHelm', 'heroCape', 'clamShield', 'warConch', 'whetstone', 'sharkNecklace'],
  summoner: ['windUpMegalodon', 'piranhaJar', 'petCrab', 'octopusPal', 'tideCrown', 'toyPack', 'tideTrident', 'brassKey'],
  tinkerer: ['junkTurret', 'netTrap', 'seaMine', 'harpoonBallista', 'pipeWrench', 'brassGoggles', 'scubaTank', 'clockworkHeart'],
  rogue: ['stingrayBarb', 'venomVial', 'inkBomb', 'shadowHood', 'cutpursePouch', 'boneDice', 'octopusPal', 'inkSac'],
};

/** pack a build's items into a run's 5x5 grid */
export function packBuild(run: Run, b: BuildId) {
  run.items = [];
  for (const id of BUILD_ITEMS[b]) {
    const it = run.addItem(id);
    const spot = findSpot(run.items, it);
    if (spot) { it.gx = spot.gx; it.gy = spot.gy; it.rot = spot.rot; }
  }
  installItemSystem(run);
}

// ------------------------------------------------------------------ a training dummy (a stuffed burlap diver)
let dummyParts: { body: THREE.BufferGeometry; head: THREE.BufferGeometry; mat: THREE.Material; mask: THREE.Material } | null = null;
class Dummy implements Entity {
  kind = 'dummy'; team: Team = 'enemy';
  vx = 0; vy = 0; r = 0.45; alive = true; hp = 12; maxHp = 12;
  obj = new THREE.Group();
  private flash = 0; private t = Math.random() * 10; private hx: number; private hy: number;
  constructor(public x: number, public y: number) {
    this.hx = x; this.hy = y;
    if (!dummyParts) {
      const burlap = page(32, 32, (p) => { const r = ramp(['#3a2a14', '#6a5030', '#9a7a4a', '#c8a870'], 4); p.fill((x, y) => r(0.55 + ((x + y) % 2 ? 0.1 : -0.1) + (x % 8 === 0 || y % 8 === 0 ? -0.25 : 0), x, y)); for (let k = 0; k < 4; k++) p.line(4 + k * 7, 12, 8 + k * 7, 18, '#2a1a0a'); });
      dummyParts = {
        body: facet(xf(new THREE.CapsuleGeometry(0.3, 0.6, 2, 6), [0, 0, 0], [0, 0, 0.2])),
        head: facet(new THREE.IcosahedronGeometry(0.24, 0)),
        mat: psxMat(burlap, { rough: 0.95 }), mask: psxMat(null, { color: '#2a4a5a', metal: 0.4, rough: 0.1 }),
      };
    }
    const b = mesh(dummyParts.body, dummyParts.mat); this.obj.add(b);
    const h = mesh(dummyParts.head, dummyParts.mat); h.position.set(0.12, 0.6, 0); this.obj.add(h);
    const m = mesh(facet(xf(new THREE.BoxGeometry(0.1, 0.12, 0.3), [0.3, 0.62, 0])), dummyParts.mask); this.obj.add(m);
    for (const s of [-1, 1]) { const f = mesh(facet(xf(new THREE.BoxGeometry(0.35, 0.04, 0.16), [-0.25, -0.62, s * 0.1], [0, 0, 0.4])), dummyParts.mask); this.obj.add(f); }
    this.obj.add(textSprite('DUMMY', STYLES.small, 0.16).translateY(1.0));
  }
  update(dt: number, w: World) {
    this.t += dt;
    const st = (this as Entity & { status?: Record<string, number> }).status ?? {};
    const frozen = (st.freeze ?? 0) > 0 || (st.stun ?? 0) > 0 || (st.snare ?? 0) > 0;
    if (!frozen) {
      this.vx += ((this.hx + Math.sin(this.t * 0.6) * 1.2 - this.x) * 2 - this.vx * 1.6) * dt;
      this.vy += ((this.hy + Math.sin(this.t * 0.9) * 0.4 - this.y) * 2 - this.vy * 1.6) * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    this.obj.position.set(this.x, this.y, 0);
    this.obj.rotation.z = Math.sin(this.t * 1.3) * 0.15 + this.vx * 0.05;
    this.obj.scale.setScalar(1 + this.flash * 0.15);
    void w;
  }
  hit(dmg: number, dx: number, dy: number, w: World, _src: Entity | null, _kind?: DamageKind): boolean {
    this.hp -= dmg; this.flash = 1; this.vx += dx * 3; this.vy += dy * 3;
    w.text.pop(String(+dmg.toFixed(1)), this.x + (Math.random() - 0.5) * 0.3, this.y + 0.9, 'damage', { size: 0.26 });
    if (this.hp <= 0) {
      this.alive = false;
      FX.gore(w, this.x, this.y, 1.2);
      w.fx.debrisBurst(this.x, this.y, 12, '#9a7a4a', 3, 0.08);
      w.emit('kill', { kind: this.kind, x: this.x, y: this.y });
      const hx = this.hx, hy = this.hy;
      setTimeout(() => w.add(new Dummy(hx, hy)), 1800);
    }
    return true;
  }
}

class BuildsPreview extends MockScreen {
  // MockScreen calls setup() from its constructor, before subclass field initialisers run: declare only
  declare puppets: { p: BlobPuppet; b: BuildId; label: THREE.Sprite }[];
  declare blob: Blobfish | null;
  declare bar: SkillBar;
  declare animI: number; declare animT: number; declare castT: number; declare castI: number;
  declare animLabel: THREE.Sprite | null;
  declare mega: ReturnType<typeof buildMegalodon> | null;
  declare q: URLSearchParams;

  setup() {
    this.puppets = []; this.blob = null; this.bar = new SkillBar(); this.animI = 0; this.animT = 0; this.castT = 1.5; this.castI = 0;
    this.animLabel = null; this.mega = null; this.q = new URLSearchParams(location.search);
    const q = this.q;
    if (q.get('mega')) return this.setupMega();
    const play = q.get('blob') as BuildId | null;
    if (play) return this.setupPlay(play);
    // ---- lineup on the seabed
    this.world.player.obj!.visible = false;
    this.followPlayer = false;
    const one = q.get('build') as BuildId | null;
    const list = one ? [one] : BUILDS;
    const gap = 1.7;
    list.forEach((b, i) => {
      const x = (i - (list.length - 1) / 2) * gap;
      const p = new BlobPuppet(BUILD_GEAR[b], (q.get('anim') as BlobAnim) || 'idle');
      p.root.position.set(x, this.world.terrain.floorAt(x) + 0.02, -1.5);
      p.heading = -0.55;
      this.scene.add(p.root);
      const label = textSprite(LABEL[b], STYLES.title, 0.24);
      label.position.set(x, this.world.terrain.floorAt(x) + 1.5, -1.5);
      this.scene.add(label);
      p.onEvent = (e) => { if (e === 'pop') { FX.magic(this.world, p.root.position.x, p.root.position.y + 0.6, '#ffe8a0', 10); } };
      this.puppets.push({ p, b, label });
    });
    const fy = this.world.terrain.floorAt(0);
    this.camTarget.set(0, fy + 0.55, 0);
    this.camDist = one ? 3.2 : q.get('close') ? 6 : 9.5;
    this.camYOff = 0.25;
    this.animLabel = textSprite('idle', STYLES.hint, 0.22);
    this.scene.add(this.animLabel);
    (window as unknown as { pv: BuildsPreview }).pv = this;
  }

  setupMega() {
    this.world.player.obj!.visible = false;
    this.followPlayer = false;
    this.mega = buildMegalodon(9);
    this.mega.root.position.set(0, -4, 0);
    this.scene.add(this.mega.root);
    this.camTarget.set(0, -4, 0); this.camDist = 15; this.camYOff = 0;
  }

  setupPlay(b: BuildId) {
    const old = this.world.player;
    old.obj?.removeFromParent();
    const blob = new Blobfish(-3, -5);
    this.blob = blob;
    packBuild(this.world.run, b);
    blob.setStats(this.world.run.stats());
    blob.skillLv = skillLevels(this.world.run);
    blob.mana = blob.maxMana;
    this.world.player = blob;
    this.scene.add(blob.obj);
    for (const [x, y] of [[2, -4.5], [4.5, -6], [6.5, -3.8], [3.5, -2.8], [8, -6.5]] as [number, number][]) this.world.add(new Dummy(x, y));
    this.overlays.push({ scene: this.bar.scene, camera: this.bar.camera as unknown as THREE.Camera });
    this.camDist = 13;
    const sets = setBonuses(this.world.run).map((s) => `${s.name} ${s.count}${s.tier ? ` (${s.tier})` : ''}`).join('   ');
    const lbl = textSprite(`${LABEL[b]}: ${sets}`, STYLES.small, 0.22);
    this.animLabel = lbl;
    this.scene.add(lbl);
    (window as unknown as { blob: Blobfish }).blob = blob;
  }

  resize(w: number, h: number) { super.resize(w, h); this.bar?.resize(w, h); }

  update(dt: number) {
    super.update(dt);
    if (this.puppets.length) {
      // lineup camera: a little above, looking down at the sand
      const one = this.puppets.length === 1, d = one ? 3.4 : this.q.get('close') ? 6.5 : 9.5;
      const yaw = parseFloat(this.q.get('yaw') || '0');
      const t = new THREE.Vector3(this.camTarget.x, this.camTarget.y + (one ? 0.05 : 0.2), -1.5);
      const sh = this.game.shakeOffset();
      this.camera.position.set(t.x + Math.sin(yaw) * d + sh.x, t.y + d * 0.28 + sh.y, t.z + Math.cos(yaw) * d);
      this.camera.lookAt(t);
    }
  }

  tick(dt: number) {
    const q = this.q;
    if (this.mega) {
      this.mega.root.rotation.y += dt * 0.3;
      this.mega.U.uSwimT.value += dt * 4;
      this.mega.open(0.5 + Math.sin(this.world.time * 1.5) * 0.5);
      this.mega.roll(Math.sin(this.world.time * 1.5) > 0.6 ? 1 : 0);
      return;
    }
    if (this.blob) {
      const p = this.blob;
      this.bar.update(dt, p.skillHud());
      if (this.animLabel) this.animLabel.position.set(p.x, p.y + 2.2, 0.5);
      const want = q.get('skill') || (q.get('auto') ? p.slots.filter(Boolean)[this.castI % Math.max(1, p.slots.filter(Boolean).length)] : null);
      if (want && SKILLS[want]) {
        this.castT -= dt;
        if (this.castT <= 0) {
          const t = this.world.entities.filter((e) => e.alive && e.team === 'enemy').sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
          p.skillCd[want] = 0; p.mana = p.maxMana;
          p.cast(want, this.world, t ? t.x : p.x + 4, t ? t.y : p.y);
          this.castT = want === 'megalodon' ? 8 : 3; this.castI++;
        }
      }
      return;
    }
    // lineup: cycle animations
    const fixed = q.get('anim') as BlobAnim | null;
    this.animT += dt;
    const order: BlobAnim[] = ['idle', 'waddle', 'cheer', 'gearUp', 'hurt', 'die', 'swim'];
    if (!fixed && this.animT > (order[this.animI] === 'gearUp' ? 3.4 : 3)) {
      this.animT = 0; this.animI = (this.animI + 1) % order.length;
      for (const { p } of this.puppets) p.play(order[this.animI], true);
      if (this.animLabel) { this.scene.remove(this.animLabel); this.animLabel = textSprite(order[this.animI], STYLES.hint, 0.22); this.scene.add(this.animLabel); }
    }
    if (this.animLabel) this.animLabel.position.set(this.camTarget.x, this.camTarget.y + (this.puppets.length === 1 ? 1.0 : 1.35), -1.5);
    for (const { p } of this.puppets) {
      p.onLand = p.model.anim !== 'swim';
      p.update(dt);
    }
    void BLOB_ANIMS;
  }
}

export default function make(game: Game): Screen { return new BuildsPreview(game, 'builds'); }
