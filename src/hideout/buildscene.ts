// The BUILD SCENE: a short animated rebuild of one piece. The camera pushes in on the spot; Mr. Crab scuttles over
// and the blobfish waddles up; planks and stones fly in on arcs and thunk into place (dust, a knock, a little
// shake) while the crab hammers with his big claw; the piece grows out of its blueprint ghost, pops, sparkles and a
// BUILT card (drawUi, the kit's panel with a photo of the piece) says what it unlocks and what is next. Click / Esc / Space skips to the end; it always finishes (nothing to get stuck in).
//
//   const b = new BuildScene(...); b.start('stash');  each frame: if (b.active) b.update(dt)
//   b.onDone = () => ...   (the piece is already built in the save when the scene starts)
import * as THREE from 'three';
import { Kit } from './kit';
import { MAT } from './tex';
import type { House } from './house';
import type { HubPlayer } from './player';
import type { MrCrab } from '../story/crab';
import type { CamRig } from './camera';
import type { Motes } from './ocean';
import { PIECE, nextGoal } from './rebuild';
import type { PixelUI } from '../ui/pixel/ui';
import { photo } from '../ui/obj/studio';
import { C, tag } from '../ui/pixel/skins';
import { audio } from '../audio/audio';
import { clamp01, easeOutBack } from '../core/math';

/** seconds the BUILT card stays up */
const DONE_T = 3.2;
interface Flyer { m: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; spin: THREE.Vector3; landed: boolean }

export class BuildScene {
  active = false;
  id = '';
  phase: 'gather' | 'hammer' | 'done' = 'done';
  private t = 0;
  private pt = 0;
  private flyers: Flyer[] = [];
  private nextFly = 0;
  private nextHit = 0;
  /** the BUILT card: what was built, what it unlocks, what's next, a studio photo of the piece */
  private card: { name: string; unlock: string; next: string; pic: HTMLCanvasElement | null; t: number; stamped?: boolean } | null = null;
  private crabFrom = new THREE.Vector3();
  private crabTo = new THREE.Vector3();
  onDone?: () => void;
  onShake?: (k: number) => void;

  constructor(private house: House, private player: HubPlayer, private crab: MrCrab, private rig: CamRig, private dust: Motes, private sparks: Motes, private cam: THREE.PerspectiveCamera, private internalH: () => number) {
  }

  start(id: string) {
    const s = this.house.spots.get(id); if (!s) return;
    this.id = id; this.active = true; this.phase = 'gather'; this.t = 0; this.pt = 0; this.nextFly = 0; this.nextHit = 0;
    this.house.setGrow(id, 0);
    // where the blobfish watches from: a step back from the piece, and never between it and the camera (the camera
    // looks from the south, so a piece facing the camera gets watched from its left side)
    const p = s.piece, side = new THREE.Vector3(s.stand.x - p.x, 0, s.stand.z - p.z).normalize();
    const watch = side.z > 0.5
      ? new THREE.Vector3(p.x - p.w / 2 - 0.95, 0, p.z + p.d / 2 + 0.45)
      : new THREE.Vector3(p.x, 0, p.z).addScaledVector(side, p.d / 2 + 1.05);
    const at = this.house.nearestWalkable(watch.x, watch.z) ?? s.stand.clone();
    // the camera pushes in on the piece and the watcher, side by side
    const c = new THREE.Vector3(p.x, (p.wall ?? 0) + 0.7, p.z);
    // pieces on the back wall are shot from lower down, under the roof beams (the window sits high on the wall)
    const back = side.z > 0.5, high = (p.wall ?? 0) > 1;
    // the low shot would look through the roof beams: lift the roof off while we film
    this.house.shell.roof.visible = !back;
    this.rig.shot = { target: c.clone().lerp(at, high ? 0.15 : 0.4), yaw: 0, pitch: high ? 0.22 : back ? 0.45 : 0.82, dist: back ? 6.6 : 7.2, fov: 30 };
    this.rig.k = 2.4;
    // the blobfish and the crab walk up (the crab to the piece's other side)
    const path = this.house.path(this.player.hero.root.position.clone(), at);
    if (path.length) this.player.goTo(path); else this.player.hero.root.position.copy(at);
    this.crabFrom.copy(this.crab.group.position);
    const perp = new THREE.Vector3(-side.z, 0, side.x);
    const crabAt = (k: number) => new THREE.Vector3(p.x, 0, p.z).addScaledVector(side, p.d / 2 + 0.45).addScaledVector(perp, k * (p.w / 2 + 0.55));
    // the crab takes the side away from the blobfish
    const a = crabAt(1), b = crabAt(-1);
    const [first, second] = a.distanceTo(at) > b.distanceTo(at) ? [a, b] : [b, a];
    const ok = (v: THREE.Vector3) => this.house.walkable(v.x, v.z, 0.2);
    this.crabTo.copy(ok(first) ? first : ok(second) ? second : this.house.nearestWalkable(first.x, first.z) ?? s.stand);
    audio.play('k_confirm1', { vol: 0.4, dry: true }); audio.play('crab_click1', { vol: 0.4 });
    this.card = null;
  }
  /** click / Esc: jump to the end of the hammering, or (once the card has been up a moment) wrap up */
  skip() { if (!this.active) return; if (this.phase !== 'done') this.finish(); else if (this.pt > 0.8) this.pt = Math.max(this.pt, DONE_T - 0.05); }

  private finish() {
    this.phase = 'done'; this.pt = 0;
    this.house.setGrow(this.id, 1);
    for (const f of this.flyers) f.m.removeFromParent();
    this.flyers = [];
    const s = this.house.spots.get(this.id)!;
    const c = new THREE.Vector3(s.piece.x, (s.piece.wall ?? 0) + 0.9, s.piece.z);
    for (let i = 0; i < 26; i++) this.sparks.emit(c.x, c.y, c.z, { vx: (Math.random() - 0.5) * 3.5, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 3.5, life: 0.7 + Math.random() * 0.5, size: 0.11 });
    audio.play('jin_good', { vol: 0.45, dry: true }); audio.play('pickup_sparkle1', { vol: 0.35, dry: true });
    this.player.hero.play?.('hop'); this.player.hero.expression?.('happy');
    const p = PIECE[this.id];
    const nx = nextGoal();
    this.card = { name: p.name.toUpperCase(), unlock: p.unlock, next: nx ? nx.name : '', pic: null, t: 0 };
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt; this.pt += dt;
    const s = this.house.spots.get(this.id)!;
    const cr = this.crab.group.position;
    // the crab scuttles (sideways) toward his work spot, and home again at the end
    const goal = this.phase === 'done' && this.pt > 0.9 ? this.crabFrom : this.crabTo;
    const d = goal.clone().sub(cr).setY(0), L = d.length();
    if (L > 0.05) { const sp = Math.min(L, 3.2 * dt); cr.addScaledVector(d.normalize(), sp); this.crab.move = (d.x >= 0 ? 1 : -1) * Math.min(1, L * 2); } else this.crab.move = 0;
    this.crab.lookX = s.piece.x;
    const target = new THREE.Vector3(s.piece.x, 0.4, s.piece.z);
    if (this.phase === 'gather') {
      this.player.face(target, dt);
      if ((L < 0.1 && !this.player.walking) || this.pt > 2.4) { this.phase = 'hammer'; this.pt = 0; this.player.stop(); }
    } else if (this.phase === 'hammer') {
      this.player.face(target, dt);
      const dur = 2.8;
      const k = clamp01(this.pt / dur);
      // planks and stones fly in on arcs and thunk into place
      this.nextFly -= dt;
      if (this.nextFly <= 0 && this.pt < dur - 0.6) {
        this.nextFly = 0.28;
        const kit = new Kit();
        if (Math.random() < 0.6) kit.box(MAT.wood(['pine', 'oak', 'drift'][Math.floor(Math.random() * 3)]), 0.9, 0.06, 0.18, 0, 0, 0);
        else kit.box(MAT.rock(), 0.28, 0.2, 0.24, 0, 0, 0);
        const m = kit.build();
        const a = Math.random() * Math.PI * 2;
        const from = new THREE.Vector3(s.piece.x + Math.cos(a) * 4.5, 3.5 + Math.random() * 1.5, s.piece.z + Math.sin(a) * 3 + 1.5);
        const to = new THREE.Vector3(s.piece.x + (Math.random() - 0.5) * s.piece.w * 0.7, (s.piece.wall ?? 0) + 0.2 + Math.random() * 0.7, s.piece.z + (Math.random() - 0.5) * s.piece.d * 0.6);
        m.position.copy(from);
        this.house.group.add(m);
        this.flyers.push({ m, from, to, t0: this.pt, dur: 0.45, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), landed: false });
        audio.play('swish_a', { vol: 0.12, rate: 1.3 + Math.random() * 0.3 });
      }
      for (const f of this.flyers) {
        const u = clamp01((this.pt - f.t0) / f.dur);
        if (!f.landed) {
          f.m.position.lerpVectors(f.from, f.to, u); f.m.position.y += Math.sin(u * Math.PI) * 1.2;
          f.m.rotation.set(f.spin.x * u, f.spin.y * u, f.spin.z * u);
          if (u >= 1) {
            f.landed = true;
            audio.play(Math.random() < 0.5 ? 'wood_knock1' : 'thud_heavy1', { vol: 0.32, rate: 0.9 + Math.random() * 0.3 });
            for (let i = 0; i < 6; i++) this.dust.emit(f.to.x, f.to.y, f.to.z, { vx: (Math.random() - 0.5) * 1.6, vy: Math.random() * 0.8, vz: (Math.random() - 0.5) * 1.6, life: 0.8, size: 0.12 });
            this.onShake?.(0.05);
          }
        } else f.m.scale.multiplyScalar(Math.exp(-dt * 6));
      }
      this.flyers = this.flyers.filter((f) => { if (f.landed && f.m.scale.x < 0.05) { f.m.removeFromParent(); return false; } return true; });
      // the crab hammers with his claw, the blobfish hops along
      this.nextHit -= dt;
      if (this.nextHit <= 0) { this.nextHit = 0.36; this.crab.snip(); audio.play('clank2', { vol: 0.16, rate: 1.2 + Math.random() * 0.4 }); if (Math.random() < 0.35) this.player.hero.play?.('hop'); }
      this.house.setGrow(this.id, easeOutBack(k, 1.2) * 0.98);
      if (this.pt > dur) this.finish();
    } else {
      // done: the card is up (drawUi), the camera eases back out
      if (this.pt > 0.9) { this.rig.shot = null; this.rig.k = 2.2; }
      if (this.pt > 1.6) this.house.shell.roof.visible = true;
      if (this.pt > DONE_T) { this.active = false; this.card = null; this.crab.move = 0; this.house.shell.roof.visible = true; this.onDone?.(); }
    }
  }

  /**
   * the BUILT card near the bottom of the letterboxed shot (the kit's panel, a 6 px rise + fade): the piece's photo
   * in a well, a gold BUILT tag, its name, what it unlocks and what's next. Call inside ui.begin/end.
   */
  drawUi(ui: PixelUI, dt: number) {
    const c = this.card;
    if (!c || !this.active) return;
    c.t += dt;
    const k = Math.min(1, c.t / 0.28), e = 1 - (1 - k) ** 3;
    const P = 64, w = Math.min(ui.w - 24, 340);
    const tx0 = 12 + P + 12, tw = w - tx0 - 12;
    const unlockH = ui.textBox(c.unlock, -9999, -9999, tw, { font: 'body' });
    const h = Math.max(P + 24, 12 + 16 + ui.lh('title') + 2 + ui.lh('small') + unlockH + (c.next ? ui.lh('small') + 3 : 0) + 12);
    const bar = Math.round(ui.h * 0.6 * Math.max(0, 1 - (ui.w / ui.h) / 2.39) * 0.5);
    const x = Math.round((ui.w - w) / 2), y = Math.round(ui.h - bar - h - 12 + (1 - e) * 6);
    if (!c.stamped) c.stamped = true;
    ui.panel('wood', x, y, w, h, undefined, { id: 'build:card' });
    // the piece's photo in a well
    if (!c.pic || c.pic.width !== P * ui.hd) c.pic = this.photo(P * ui.hd, P * ui.hd);
    const fx = x + 12, fy = y + Math.round((h - P) / 2);
    ui.frame('inset', fx - 1, fy - 1, P + 2, P + 2);
    if (c.pic) ui.img(c.pic, fx, fy, { w: P, h: P });
    // the words
    const tx = x + tx0;
    let yy = y + 10;
    tag(ui, 'BUILT', tx, yy, 'sage'); yy += 16;
    ui.text(c.name, tx, yy, { font: 'title', color: C.gold2, shadow: C.ink }); yy += ui.lh('title') + 2;
    ui.text('UNLOCKS', tx, yy, { font: 'small', color: C.dim, shadow: null }); yy += ui.lh('small');
    yy += ui.textBox(c.unlock, tx, yy, tw, { font: 'body', color: C.bone, shadow: C.ink }) + 3;
    if (c.next) ui.text(`next up: ${c.next}`, tx, yy, { font: 'small', color: C.faint, shadow: null });
    if (c.t > 0.3 && c.t - dt <= 0.3) audio.play('k_confirm2', { vol: 0.3, dry: true });
  }
  /** a studio photo of the finished piece (a clone, so the house keeps its model) */
  private photo(w: number, h: number): HTMLCanvasElement | null {
    const s = this.house.spots.get(this.id);
    try { if (s?.built) { const c = s.built.clone(true); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1); return photo(c, w, h, { yaw: -0.5, pitch: 0.35, fill: 1, ss: 2 }); } } catch { /* no GL */ }
    return null;
  }
}
