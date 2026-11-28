// SWIMMING OUT (v7): the short cinematic from SWIM OUT to the run's first playable moment, about 5.4 s, played every
// run. Esc / Enter / Space (or a click after a moment) skips it at once. Letterboxed, four shots:
//   READY     the camera swoops in on the blobfish; it hops, the satchel leaps off its crate onto its back and buckles
//             shut (a squash, a puff of bubbles); it turns to face the open sea
//   LAUNCH    cut out to sea, low on the sand looking back at the house: the doorway glows warm behind it as it
//             kicks off the porch and swims up over the camera, trailing bubbles, light shafts in the water
//   PAST      cut wide and high: it swims out past the house and away over the reef, the camera craning up after it
//   TITLE     cut below it, looking up into the light: it rises toward the surface while the destination's title card
//             (2D floating words, no box) fades up, bubbles rising off it; the water whitens into the run
// SFX hits on every beat (buckle, splash, the arrival jingle, a whale far off, a shimmer under the title).
// The run picks up from here (src/game/dungeonScreen.ts): cfg.cine = 'title' (the card was shown: the run skips its
// own area card on the first stage) or 'skip'; it fades up from the same pale water and eases the camera out.
//
//   const c = new ExitCine(); c.start(env, cfg, satchel); each frame: if (c.update(dt, ui, input, live)) startRun(cfg)
//   c.fade / c.bars: what the screen should show (POST fade 0..1, letterbox 0..1);  c.stop() puts everything back
import * as THREE from 'three';
import type { HideoutHero } from './hero';
import type { CamRig, Shot } from './camera';
import type { Motes } from './ocean';
import { keyName, type PixelUI } from '../ui/pixel/ui';
import type { Input } from '../core/input';
import type { RunConfig } from '../meta/meta';
import { audio } from '../audio/audio';
import { clamp01, smooth, dampAngle, damp } from '../core/math';
import { POST } from '../gfx/post';
import { AREAS, masteryScalars } from './mastery';
import { floorAreas, floorsForMastery } from '../dungeon/level';
import { biomeDef } from '../dungeon/biomes';
import { C } from '../ui/pixel/skins';
import { rayCard } from './kitWall';

export interface CineEnv {
  hero: HideoutHero;
  rig: CamRig;
  /** world-space bubbles (the ocean's) */
  bubbles: Motes;
  /** the screen's scene (the satchel is carried across it, the light shafts live in it) */
  scene: THREE.Object3D;
  /** the hub player: its move drives the swim animation */
  player: { move: number };
  /** a camera cut (motion-blur history reset) */
  cut(): void;
}

const T = { launch: 1.0, past: 2.45, title: 3.85, whiten: 4.7, end: 5.4 };
/** the swim path (offsets from where the blobfish stood, world axes) and when it passes each point */
const PATH: [number, number, number, number][] = [
  [1.0, 0, 0.45, 0], [1.45, 0.12, 0.72, 1.3], [1.95, 0.32, 1.45, 3.5], [2.45, 0.55, 2.45, 6.0], [3.0, 1.7, 3.35, 8.2],
  [3.5, 3.6, 4.25, 9.8], [3.85, 5.1, 4.95, 10.8], [4.6, 7.2, 6.9, 12.2], [5.4, 8.8, 9.8, 13.4], [6.2, 10, 13, 14.2],
];
/** a rig shot from a camera position looking at a target */
function look(cam: THREE.Vector3, tgt: THREE.Vector3, fov: number): Shot {
  const d = cam.clone().sub(tgt), dist = d.length();
  return { target: tgt.clone(), yaw: Math.atan2(d.x, d.z), pitch: Math.asin(Math.max(-0.99, Math.min(0.99, d.y / dist))), dist, fov };
}

export class ExitCine {
  active = false;
  t = 0;
  /** what the screen should show: POST fade (0..1) and the letterbox (0..1) */
  fade = 0;
  bars = 0;
  private env!: CineEnv;
  private cfg!: RunConfig & { cine?: string };
  private satchel: { root: THREE.Object3D; gulp(k?: number): void; update(dt: number, fill: number, open: boolean): void } | null = null;
  private fill = 0;
  private from = new THREE.Vector3();
  private yaw0 = 0;
  private cues = new Set<string>();
  private rays: THREE.Mesh[] = [];
  private shot = -1;
  private carry: { a: THREE.Vector3; q: THREE.Quaternion; s: number } | null = null;
  private onBack = false;
  private title = { kicker: 'SWIMMING OUT TO', name: '', sub: '', desc: '' };
  private v = new THREE.Vector3();
  private prev = new THREE.Vector3();
  private bubT = 0;

  start(env: CineEnv, cfg: RunConfig, satchel: ExitCine['satchel'], fill: number) {
    this.env = env; this.cfg = cfg; this.satchel = satchel; this.fill = fill;
    this.active = true; this.t = 0; this.fade = 0; this.bars = 1; this.shot = -1;
    this.cues.clear(); this.onBack = false; this.carry = null;
    this.from.copy(env.hero.root.position);
    this.yaw0 = env.hero.root.rotation.y;
    // the destination: the first stage of the voyage at this mastery
    const n = floorsForMastery(cfg.mastery, masteryScalars(cfg.mastery) as { floors?: number });
    const area = floorAreas(cfg.startArea, n)[0] ?? cfg.startArea;
    const info = AREAS.find((a) => a.id === area);
    this.title.name = (info?.name ?? biomeDef(area).name).toUpperCase();
    this.title.sub = `STAGE 1 OF ${n}  ·  OUTSIDE YOUR FRONT DOOR`;
    this.title.desc = info?.desc ?? '';
    // light shafts slanting down along the way out
    if (!this.rays.length) for (const [x, z, w, h] of [[1, 6, 2.4, 15], [4.5, 10, 3.2, 17], [-2.5, 9, 2.2, 14], [8, 12, 2.8, 16], [2.5, 14, 3, 18]]) {
      const r = rayCard(w, h, '#bfefff', 0); r.userData.at = [x, z]; this.rays.push(r);
    }
    for (const r of this.rays) { const [x, z] = r.userData.at as [number, number]; r.position.set(this.from.x + x, 13.5, this.from.z + z); r.rotation.z = 0.22; env.scene.add(r); }
    env.hero.play?.('hop'); env.hero.expression?.('happy');
    audio.play('k_confirm2', { vol: 0.4, dry: true });
  }

  /** put the hero, the satchel and the scene back (skip, finish, leaving the screen) */
  stop() {
    if (!this.env) return;
    const h = this.env.hero as HideoutHero & { onLand?: boolean };
    if (this.onBack || this.carry) this.satchel?.root.removeFromParent();
    this.onBack = false; this.carry = null;
    h.onLand = true;
    h.root.rotation.z = 0; h.root.rotation.x = 0;
    this.env.player.move = 0;
    for (const r of this.rays) r.removeFromParent();
    POST.uFadeCol.value.set('#000000');
    this.active = false;
  }

  /** the swim path at time t (world) */
  private pathAt(t: number, out = new THREE.Vector3()): THREE.Vector3 {
    const P = PATH;
    if (t <= P[0][0]) return out.set(this.from.x, this.from.y + P[0][2], this.from.z);
    let i = 0; while (i < P.length - 2 && t > P[i + 1][0]) i++;
    const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
    const u = clamp01((t - b[0]) / (c[0] - b[0])), u2 = u * u, u3 = u2 * u;
    const cr = (k: number) => 0.5 * (2 * b[k] + (-a[k] + c[k]) * u + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * u2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * u3);
    return out.set(this.from.x + cr(1), this.from.y + cr(2), this.from.z + cr(3));
  }
  private cue(id: string, at: number, fn: () => void) { if (this.t >= at && !this.cues.has(id)) { this.cues.add(id); fn(); } }

  /** a frame; true when the run should start (finished or skipped) */
  update(dt: number, ui: PixelUI, input: Input, live: boolean): boolean {
    if (!this.active) return true;
    this.t += dt;
    const t = this.t, e = this.env, h = e.hero as HideoutHero & { onLand?: boolean; sb?: { poke(x: number, y: number, k: number): void } }, r = h.root;
    // ---- skip
    const skip = live && ((t > 0.15 && (input.keyHit('Escape') || input.keyHit('Enter') || input.keyHit('Space'))) || (t > 0.45 && ui.pressed));
    if (skip || t >= T.end) {
      this.cfg.cine = t >= T.title + 0.3 ? 'title' : 'skip';
      if (skip) audio.play('k_tick2', { vol: 0.3, dry: true });
      this.fade = 1;
      return true;
    }
    // ---- READY: hop, the satchel leaps onto its back, a turn toward the sea
    if (t < T.launch) {
      if (t > 0.72) r.rotation.y = dampAngle(r.rotation.y, -Math.PI / 2, 7, dt);
      this.cue('lift', 0.18, () => {
        const s = this.satchel; if (!s) return;
        s.root.updateWorldMatrix(true, false);
        const a = s.root.getWorldPosition(new THREE.Vector3()), q = s.root.getWorldQuaternion(new THREE.Quaternion()), sc = s.root.getWorldScale(new THREE.Vector3()).x;
        e.scene.attach(s.root);
        this.carry = { a, q, s: sc };
        audio.play('cloth1', { vol: 0.35 }); audio.play('swish_a', { vol: 0.2, delay: 0.05 });
      });
      if (this.carry && this.satchel) {
        const k = smooth(0.18, 0.52, t), sr = this.satchel.root;
        const back = r.localToWorld(this.v.set(-0.18, 0.86, 0));
        sr.position.lerpVectors(this.carry.a, back, k); sr.position.y += Math.sin(k * Math.PI) * 0.7;
        sr.quaternion.copy(this.carry.q).slerp(r.getWorldQuaternion(new THREE.Quaternion()), k);
        sr.rotation.z += Math.sin(k * Math.PI) * 0.8;
        sr.scale.setScalar(this.carry.s + (0.58 - this.carry.s) * k);
        if (t >= 0.52) {
          this.carry = null;
          if (h.attach) { h.attach('back', sr); sr.position.set(-0.24, 0.3, 0.12); } else { r.add(sr); sr.position.set(-0.24, 0.8, 0.12); }
          sr.rotation.set(0.15, 0, -0.25); sr.scale.setScalar(0.58);
          this.onBack = true;
          this.satchel.gulp(1.2);
          h.sb?.poke(0, -1, 4);
          audio.play('buckle1', { vol: 0.55 }); audio.play('bubbles_b', { vol: 0.3 });
          for (let i = 0; i < 14; i++) e.bubbles.emit(back.x + (Math.random() - 0.5) * 0.4, back.y, back.z + (Math.random() - 0.5) * 0.4, { vy: 0.4 + Math.random() * 0.6, life: 1.6, size: 0.05 + Math.random() * 0.05 });
        }
      }
      // the camera swoops in close on the blobfish, low and from the front
      if (this.shot !== 0) { this.shot = 0; e.rig.k = 3.4; }
      const tgt = this.from.clone().add(new THREE.Vector3(0.55, 0.62, 0.45));
      e.rig.shot = look(this.from.clone().add(this.v.set(2.0 - t * 0.25, 1.05, 3.7 - t * 0.5)), tgt, 32);
    }
    // ---- LAUNCH / PAST / TITLE: it swims the path
    if (t >= T.launch) {
      if (!this.cues.has('swim')) {
        this.cues.add('swim');
        h.onLand = false; h.play?.('swim');
        audio.play('splash_b', { vol: 0.4 }); audio.play('swish_b', { vol: 0.35 }); audio.play('jin_arrive', { vol: 0.45, dry: true, delay: 0.1 });
        for (let i = 0; i < 20; i++) e.bubbles.emit(this.from.x + (Math.random() - 0.5) * 0.8, 0.15, this.from.z + (Math.random() - 0.5) * 0.8, { vy: 0.6 + Math.random() * 0.8, life: 2, size: 0.05 + Math.random() * 0.07 });
      }
      e.player.move = 1;
      this.prev.copy(r.position);
      this.pathAt(t, r.position);
      const ahead = this.pathAt(t + 0.08, new THREE.Vector3()).sub(r.position);
      const yaw = Math.atan2(-ahead.z, ahead.x), pitch = Math.atan2(ahead.y, Math.hypot(ahead.x, ahead.z));
      r.rotation.y = dampAngle(r.rotation.y, yaw, 9, dt);
      r.rotation.z = damp(r.rotation.z, pitch * 0.55, 6, dt);
      // a stream of bubbles off its tail
      this.bubT -= dt;
      if (this.bubT <= 0) {
        this.bubT = 0.035;
        const tail = r.localToWorld(this.v.set(-0.5, 0.45, 0));
        e.bubbles.emit(tail.x, tail.y, tail.z, { vy: 0.3 + Math.random() * 0.4, life: 1.8, size: 0.04 + Math.random() * 0.06, spread: 0.15 });
      }
    }
    // ---- the shots
    const hp = r.position;
    if (t >= T.launch && t < T.past) {
      if (this.shot !== 1) { this.shot = 1; e.rig.k = 40; }
      const u = smooth(T.launch, T.past, t);
      const cam = this.from.clone().add(this.v.set(1.4, 0.5 + u * 0.3, 9.4));
      const tgt = new THREE.Vector3().lerpVectors(this.from.clone().add(new THREE.Vector3(0, 1.0, 0)), hp, 0.35 + u * 0.6);
      e.rig.shot = look(cam, tgt, 38);
      if (this.shot === 1 && !this.cues.has('cutB')) { this.cues.add('cutB'); e.rig.snap(); e.cut(); }
    } else if (t >= T.past && t < T.title) {
      if (this.shot !== 2) { this.shot = 2; e.rig.k = 40; }
      const u = smooth(T.past, T.title, t);
      const cam = this.from.clone().add(this.v.set(-1.6 + u * 1.2, 2.0 + u * 2.4, 17.5 + u * 0.8));
      const tgt = new THREE.Vector3().lerpVectors(this.from.clone().add(new THREE.Vector3(1.5, 1.4, 3)), hp, 0.55 + u * 0.3);
      e.rig.shot = look(cam, tgt, 42);
      if (!this.cues.has('cutC')) { this.cues.add('cutC'); e.rig.snap(); e.cut(); audio.play('swish_c', { vol: 0.25 }); audio.play('whale', { vol: 0.16, delay: 0.25, rate: 0.85 }); }
    } else if (t >= T.title) {
      if (this.shot !== 3) { this.shot = 3; e.rig.k = 40; this.titleFrom = hp.clone(); }
      // from below and behind, looking up into the light: it rises through the lower third, the words float above
      const tf = this.titleFrom!;
      const cam = tf.clone().add(this.v.set(-1.4, -3.4, 2.6));
      e.rig.shot = look(cam, tf.clone().add(new THREE.Vector3(0.6, 3.4, -0.4)), 48);
      if (!this.cues.has('cutD')) { this.cues.add('cutD'); e.rig.snap(); e.cut(); audio.play('shimmer1', { vol: 0.4, dry: true, delay: 0.1 }); }
      this.cue('rush', T.whiten - 0.1, () => audio.play('bubbles_a', { vol: 0.35 }));
    }
    // light shafts fade up and turn to the camera; the water whitens at the end
    const cp = e.rig.cam.position;
    for (const ray of this.rays) {
      ray.rotation.y = Math.atan2(cp.x - ray.position.x, cp.z - ray.position.z);
      (ray.material as THREE.MeshBasicMaterial).opacity = 0.2 * smooth(0.6, 1.6, t) * (0.8 + 0.2 * Math.sin(t * 1.3 + ray.position.x));
    }
    this.bars = 1;
    POST.uFadeCol.value.set('#cdf3ff');
    this.fade = smooth(T.whiten, T.end, t);
    // ---- the 2D layer: the title card, the skip hint
    this.drawTitle(ui, t);
    if (t > 0.2) {
      const a = Math.min(1, (t - 0.2) * 3) * 0.75;
      const lbl = 'skip', key = keyName('ESC') === 'ESC' ? 'ESC' : 'TAP', kw = ui.keycapW(key), x = ui.w - 14 - ui.measure(lbl, 'small') - kw - 4, y = ui.h - 22;
      ui.keycap(key, x, y, true);
      ui.text(lbl, x + kw + 4, y + 2, { font: 'small', color: C.dim, shadow: C.ink, alpha: a });
    }
    return false;
  }
  private titleFrom: THREE.Vector3 | null = null;

  // ---------------------------------------------------------------- the title card (the HUD's area-card look)
  /** the kicker in small caps, the name in the big role letter by letter (a 3 px rise + fade each) between two gold
   *  rules, the sub and the description under it */
  private drawTitle(ui: PixelUI, t: number) {
    const t0 = T.title + 0.1;
    if (t < t0) return;
    const k = t - t0;
    const a = Math.min(1, k / 0.35) * (1 - smooth(T.end - 0.25, T.end, t) * 0.4);
    const ease = (v: number) => 1 - (1 - Math.max(0, Math.min(1, v))) ** 3;
    const cx = Math.round(ui.w / 2), cy = Math.round(ui.h * 0.32);
    const capBig = Math.round(ui.cap('big'));
    ui.text(this.title.kicker.toUpperCase(), cx, cy - 20, { font: 'small', color: C.gold, shadow: C.ink, align: 'center', alpha: a * Math.min(1, k * 3) });
    const name = this.title.name.toUpperCase();
    const tw = Math.ceil(ui.measure(name, 'big'));
    let lx = Math.round(cx - tw / 2);
    [...name].forEach((ch, i) => {
      const kk = Math.max(0, Math.min(1, (k - 0.12 - i * 0.035) * 5));
      const w = ui.measure(ch, 'big');
      if (kk > 0 && ch !== ' ') ui.text(ch, lx, cy - Math.round((1 - ease(kk)) * 3), { font: 'big', color: C.bone2, shadow: C.ink, alpha: kk * a });
      lx += w;
    });
    const ra = Math.max(0, Math.min(1, (k - 0.3) * 3)) * a, rl = Math.round(Math.min(60, (ui.w - tw) / 2 - 24) * ease((k - 0.3) * 2));
    const ry = cy + Math.round(capBig / 2);
    if (rl > 0) {
      ui.fill(Math.round(cx - tw / 2 - 14 - rl), ry, rl, 1, C.gold, ra); ui.fill(Math.round(cx - tw / 2 - 16), ry - 1, 2, 3, C.gold, ra);
      ui.fill(Math.round(cx + tw / 2 + 14), ry, rl, 1, C.gold, ra); ui.fill(Math.round(cx + tw / 2 + 14), ry - 1, 2, 3, C.gold, ra);
    }
    if (k > 0.5) {
      const b = Math.min(1, (k - 0.5) / 0.3) * a;
      ui.text(this.title.sub.toUpperCase(), cx, cy + capBig + 10, { font: 'small', color: C.bone, shadow: C.ink, align: 'center', alpha: b });
      if (this.title.desc) ui.text(this.title.desc, cx, cy + capBig + 10 + ui.lh('small') + 2, { font: 'small', color: C.dim, shadow: C.ink, align: 'center', alpha: b * 0.9 });
    }
  }
}
