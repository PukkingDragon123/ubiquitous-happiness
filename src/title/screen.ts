// TitleScreen ('title'): no menu text at all. A letterboxed side-on travelling shot: the blobfish swims steadily
// left to right through the layered ocean (travel.ts) and slows to a stop at an old underwater signpost
// (sign.ts) whose plank carries the game's name. The only words are the ones carved on the sign:
//   NEW GAME  (the arrow points on)          -> opts.onNew()     (the prologue the first time, else the hideout)
//   RESUME    (the arrow points back home)   -> opts.onResume()  (greyed and dusty with no save)
//   the carved gear on the post              -> settings (a pixel panel over the scene)
// Hover a board: it warms, wobbles on its peg, the lantern brightens and the blobfish looks at it. Click (on the
// press frame) / Enter: the blobfish turns and swims off the way the arrow points, fade, then the callback.
// Keyboard: arrows pick a board (left = RESUME, right = NEW GAME, up / down cycle incl. the gear), Enter goes.
// Click / Enter / Space during the swim skips ahead to the sign.
//
//   const t = new TitleScreen(game, { onNew, onResume, hasSave }); game.register(t);
//   game.go('title', { quick?: true })   (quick: a shorter swim in, for coming back from the hideout)
//   window.title.boardPoint('new' | 'resume' | 'gear') -> CSS-pixel centre of a board (tests); title.skip()
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { POST } from '../gfx/post';
import { UW } from '../gfx/shaders/underwater';
import { SKY } from '../gfx/sky';
import { SURF } from '../gfx/water/surface';
import { PixelUI } from '../ui/pixel/ui';
import { audio } from '../audio/audio';
import { damp, clamp01 } from '../core/math';
import { TravelSet, floorAt } from './travel';
import type { BoardId } from './sign';
import { SettingsPanel } from './pages';

export interface TitleOpts {
  /** NEW GAME */ onNew: () => void;
  /** RESUME (only reachable while hasSave()) */ onResume: () => void;
  /** is there anything to resume (RESUME is greyed and dead otherwise) */ hasSave: () => boolean;
}

/** uniforms the title changes and gives back on exit */
const SAVED: Record<string, { value: unknown }>[] = [POST as unknown as Record<string, { value: unknown }>, UW as unknown as Record<string, { value: unknown }>, SKY as unknown as Record<string, { value: unknown }>, SURF as unknown as Record<string, { value: unknown }>];
const SKIP = new Set(['uTime', 'uFade', 'uLetterbox', 'uFlash', 'uLift', 'uRip', 'uMotionBlur', 'uMotionTrail']);
function snapshot() {
  return SAVED.map((o) => Object.entries(o).filter(([k, u]) => !SKIP.has(k) && u && typeof u === 'object' && 'value' in u).map(([k, u]) => {
    const v = u.value as { clone?: () => unknown };
    return [k, v && typeof v === 'object' && typeof v.clone === 'function' ? v.clone() : Array.isArray(v) ? v.map((q) => (q?.clone ? q.clone() : q)) : v] as [string, unknown];
  }));
}
function restore(snap: [string, unknown][][]) {
  snap.forEach((list, i) => {
    const o = SAVED[i];
    for (const [k, v] of list) {
      const u = o[k]; if (!u) continue;
      const cur = u.value as { copy?: (x: unknown) => void };
      if (cur && typeof cur === 'object' && typeof cur.copy === 'function') cur.copy(v);
      else if (Array.isArray(cur) && Array.isArray(v)) cur.forEach((q, j) => (q?.copy ? q.copy(v[j]) : (cur[j] = v[j])));
      else u.value = v;
    }
  });
}

type Phase = 'travel' | 'idle' | 'leave';
const ORDER: BoardId[] = ['new', 'resume', 'gear'];

export class TitleScreen implements Screen {
  name = 'title';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  ui = new PixelUI({ targetH: 300 });
  overlays: { scene: THREE.Scene; camera: THREE.Camera }[] = [this.ui.layer];
  set = new TravelSet();
  phase: Phase = 'travel';
  private t = 0;
  private phaseT = 0;
  private hx = 0;
  private hy = 0;
  private vx = 0;
  /** where the hero comes to rest beside the sign */
  private rest = new THREE.Vector3();
  private hot: BoardId | null = null;
  private kbdSel: BoardId | null = null;
  private lastHot: BoardId | null = null;
  private leaving: { id: BoardId; dir: number; t: number } | null = null;
  private settings = new SettingsPanel();
  private settingsOpen = false;
  private snap: [string, unknown][][] | null = null;
  private ambience: ReturnType<typeof audio.loop> | null = null;
  private ray = new THREE.Raycaster();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private fadeIn = 1;
  private yaw = 0;

  constructor(private game: Game, private opts: TitleOpts) {
    this.scene.add(this.set.group);
    this.scene.background = new THREE.Color('#06223a');
    this.ui.drawCursor = true;
    this.set.onWhale = () => audio.play('whale' + (1 + Math.floor(Math.random() * 3)), { vol: 0.3 });
    (window as unknown as { title: TitleScreen }).title = this;
  }

  get underwater() { return true; }
  resize(w: number, h: number) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.ui.resize(w, h, this.game.renderer.getPixelRatio());
    this.set.setScale(440 / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
  }

  enter(data?: unknown) {
    const d = (data ?? {}) as { quick?: boolean };
    this.snap = snapshot();
    this.set.applyLook();
    this.set.light.setSun(new THREE.Vector3(-0.38, 0.62, -0.42));
    UW.uWaterY.value = 0;
    POST.uFade.value = 1; POST.uLetterbox.value = 1;
    this.fadeIn = 1;
    const s = this.set.signAt;
    this.rest.set(s.x - 2.35, floorAt(s.x - 2.35, 0) + 1.75, 0.3);
    this.hx = this.rest.x - (d.quick ? 13 : 30); this.hy = this.rest.y + 1.4; this.vx = 3.6;
    this.phase = 'travel'; this.phaseT = 0; this.t = 0;
    this.hot = null; this.kbdSel = null; this.lastHot = null; this.leaving = null; this.settingsOpen = false;
    this.yaw = 0;
    this.set.sign.setEnabled('resume', this.opts.hasSave());
    const h = this.set.hero;
    h.root.position.set(this.hx, this.hy, 0); h.root.rotation.set(0, 0, 0);
    h.play('swim'); h.setExpression('brave');
    this.set.seedSnow(this.hx);
    this.placeCamera(1, true);
    this.game.cursor = 'none';
    audio.music('mu_fjord', 2);
    audio.setUnderwater(0.3);
    this.ambience?.stop(); this.ambience = audio.loop('uw_amb1', 0.28);
    this.game.post.cut?.();
  }
  exit() {
    this.ambience?.stop(0.6); this.ambience = null;
    if (this.snap) restore(this.snap);
    this.snap = null;
    POST.uLetterbox.value = 0; POST.uFade.value = 0;
    audio.setUnderwater(0);
    this.game.cursor = 'normal';
  }

  // ---------------------------------------------------------------- test hooks
  /** CSS-pixel centre of a board on screen (for click tests) */
  boardPoint(id: BoardId): [number, number] {
    const p = this.set.sign.boardWorld(id).project(this.camera);
    return [Math.round((p.x * 0.5 + 0.5) * this.game.w), Math.round((-p.y * 0.5 + 0.5) * this.game.h)];
  }
  /** jump to the arrival (the board clicks then work) */
  skip() { if (this.phase === 'travel') this.hx = Math.max(this.hx, this.rest.x - 0.05); }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    this.t += dt; this.phaseT += dt;
    const input = this.game.input, ui = this.ui;
    this.game.cursor = 'none';
    this.fadeIn = Math.max(0, this.fadeIn - dt * 0.8);
    let fade = this.fadeIn;
    if (this.leaving) {
      const L = this.leaving;
      L.t += dt;
      fade = Math.max(fade, clamp01((L.t - 0.55) / 0.8));
      if (L.t > 1.45) { this.leaving = null; const id = L.id; (id === 'new' ? this.opts.onNew : this.opts.onResume)(); return; }
    }
    POST.uFade.value = fade;
    POST.uLetterbox.value = damp(POST.uLetterbox.value, this.phase === 'idle' ? 0.7 : 1, 2, dt);

    ui.begin(this.leaving ? null : input, dt);
    // ---- the hero swims in, then hangs about by the sign
    const h = this.set.hero;
    if (this.phase === 'travel') {
      const togo = this.rest.x - this.hx;
      // impatient players: any click / key during the swim jumps ahead to just short of the sign
      if (this.phaseT > 0.3 && togo > 4 && (ui.pressed || input.keyHit('Enter') || input.keyHit('Space'))) { this.hx = this.rest.x - 4; this.placeCamera(1, true); }
      this.vx = Math.min(3.6, togo * 0.85 + 0.12);
      this.hx += this.vx * dt;
      this.hy = damp(this.hy, this.rest.y + Math.sin(this.hx * 0.22) * 0.5 * clamp01(togo / 8) + 0.0, 2, dt);
      if (togo < 0.04) { this.hx = this.rest.x; this.phase = 'idle'; this.phaseT = 0; h.play('idle'); audio.play('bubble2', { vol: 0.25 }); }
    } else if (this.phase === 'idle' && !this.leaving) {
      this.hx = damp(this.hx, this.rest.x, 2, dt);
      this.hy = damp(this.hy, this.rest.y + Math.sin(this.t * 1.3) * 0.08, 3, dt);
    }
    if (this.leaving) {
      // turn and swim off the way the arrow points, accelerating
      const L = this.leaving;
      this.vx = damp(this.vx, L.dir * 6, 1.6, dt);
      if (L.t > 0.25) this.hx += this.vx * dt;
      this.hy += Math.sin(L.t * 3) * dt * 0.3 + (L.id === 'resume' ? -0.15 : 0.25) * dt;
    }
    const yawGoal = this.leaving ? (this.leaving.dir > 0 ? 0 : Math.PI) : this.phase === 'idle' ? -0.5 : 0;
    this.yaw = damp(this.yaw, yawGoal, this.leaving ? 7 : 2.5, dt);
    h.root.position.set(this.hx, this.hy, this.rest.z);
    h.root.rotation.y = this.yaw;
    h.root.rotation.z = this.phase === 'travel' ? Math.sin(this.t * 1.1) * 0.05 : 0;
    h.current.set(-Math.abs(this.vx) * 0.6, 0);
    h.update(dt, { t: this.t, move: this.phase === 'travel' || this.leaving ? Math.min(1, Math.abs(this.vx) / 3) : 0 });
    if (this.phase === 'travel' && Math.random() < dt * 3) this.set.bubbles.emit(this.hx - 0.5, this.hy + 0.2, 0, { vy: 0.4, life: 2.5, size: 0.04 + Math.random() * 0.04 });

    // ---- the sign: hover, keys, clicks
    this.hot = null;
    if (this.phase === 'idle' && !this.leaving) {
      if (this.settingsOpen) {
        const sw = 236, sh = 182;
        if (this.settings.draw(ui, Math.round((ui.w - sw) / 2), Math.round((ui.h - sh) / 2), dt) || (input.keyHit('Escape'))) { this.settingsOpen = false; audio.play('k_back2', { vol: 0.35, dry: true }); }
      } else this.interact(dt);
    }
    // the hero looks at whatever is hot
    const look = this.hot ?? this.kbdSel;
    if (this.phase === 'idle') h.lookAt(look ? this.set.sign.boardWorld(look) : this.set.sign.lanternWorld());
    else h.lookAt(null);
    if (look !== this.lastHot) {
      this.lastHot = look;
      if (look) h.setExpression(look === 'new' ? 'brave' : look === 'resume' ? 'happy' : 'focus');
    }
    this.set.sign.update(dt, this.t, this.leaving ? this.leaving.id : this.settingsOpen ? 'gear' : look);
    const lp = this.set.sign.lanternWorld();
    if (this.set.lamp) { this.set.lamp.set(lp.x, lp.y, lp.z); this.set.lamp.light.intensity = 3.2 * this.set.sign.lanternK; }
    ui.drawCursor = this.phase === 'idle' && !this.leaving;
    ui.end();

    this.placeCamera(dt);
    this.set.update(dt, this.t, this.camera);
  }

  private interact(_dt: number) {
    const ui = this.ui, input = this.game.input, sign = this.set.sign;
    // mouse: ray against the boards
    let over: BoardId | null = null;
    if (ui.inside) {
      this.ray.setFromCamera(new THREE.Vector2(input.mouse.nx, input.mouse.ny), this.camera);
      over = sign.pick(this.ray);
    }
    if (over) { this.kbdSel = null; ui.cursor = sign.boards[over].enabled ? 'point' : 'arrow'; }
    // keys
    const step = (id: BoardId) => { if (sign.boards[id].enabled) { this.kbdSel = id; audio.play('k_tick1', { vol: 0.2, dry: true }); } };
    if (input.keyHit('ArrowRight') || input.keyHit('KeyD')) step('new');
    if (input.keyHit('ArrowLeft') || input.keyHit('KeyA')) step(this.opts.hasSave() ? 'resume' : 'new');
    if (input.keyHit('ArrowDown') || input.keyHit('ArrowUp') || input.keyHit('KeyS') || input.keyHit('KeyW')) {
      const d = input.keyHit('ArrowUp') || input.keyHit('KeyW') ? -1 : 1;
      let i = Math.max(0, ORDER.indexOf(this.kbdSel ?? 'new'));
      for (let k = 0; k < ORDER.length; k++) { i = (i + d + ORDER.length) % ORDER.length; if (sign.boards[ORDER[i]].enabled) break; }
      step(ORDER[i]);
    }
    this.hot = over;
    const cur = over ?? this.kbdSel;
    if (cur !== this.lastHotSfx) {
      if (cur && sign.boards[cur].enabled) { sign.knock(cur, 0.5); audio.play('wood_knock1', { vol: 0.18, rate: 1.3 + Math.random() * 0.2 }); audio.play('rope_creak1', { vol: 0.12 }); }
      this.lastHotSfx = cur;
    }
    // clicks register on the press frame
    if (ui.pressed && over) this.activate(over);
    else if ((input.keyHit('Enter') || input.keyHit('Space')) && this.kbdSel) this.activate(this.kbdSel);
    else if ((input.keyHit('Enter') || input.keyHit('Space')) && !this.kbdSel && this.phaseT > 0.2) this.kbdSel = 'new';
  }
  private lastHotSfx: BoardId | null = null;

  private activate(id: BoardId) {
    const sign = this.set.sign, b = sign.boards[id];
    if (!b.enabled) {
      // the dead RESUME board: a dull knock, a puff of silt
      sign.knock(id, 0.8);
      audio.play('wood_knock1', { vol: 0.35, rate: 0.7 });
      const p = sign.boardWorld(id);
      for (let i = 0; i < 14; i++) this.set.bubbles.emit(p.x + (Math.random() - 0.5) * 2, p.y + Math.random() * 0.3, p.z + 0.2, { vy: 0.1, life: 2, size: 0.03 });
      return;
    }
    if (id === 'gear') { this.settingsOpen = true; this.settings.open(); sign.knock('gear', 1); audio.play('k_open1', { vol: 0.4, dry: true }); audio.play('wood_knock1', { vol: 0.25 }); return; }
    sign.knock(id, 1.2);
    audio.play('wood_knock1', { vol: 0.4 }); audio.play('k_confirm3', { vol: 0.4, dry: true });
    audio.play('swish_a', { vol: 0.35, delay: 0.2 }); audio.play('bubbles_a', { vol: 0.35, delay: 0.3 });
    this.set.hero.setExpression(id === 'new' ? 'brave' : 'happy');
    this.set.hero.play('swim');
    this.vx = 0;
    this.leaving = { id, dir: b.dir || 1, t: 0 };
    audio.music(null, 1.2);
  }

  // ---------------------------------------------------------------- camera
  /** tracking alongside the swim, settling into a wide shot of the sign and the hero as it slows */
  private placeCamera(dt: number, snap = false) {
    const s = this.set.signAt;
    const togo = this.rest.x - this.hx;
    const k = this.phase === 'idle' || this.leaving ? 1 : clamp01(1 - (togo - 1) / 9);
    const ks = k * k * (3 - 2 * k);
    // travel: just ahead of the fish, close; arrival: the sign and the fish together, wider
    const tx = THREE.MathUtils.lerp(this.hx + 1.6, s.x - 0.35, ks), ty = THREE.MathUtils.lerp(this.hy + 0.55, s.y + 2.95, ks);
    const dist = THREE.MathUtils.lerp(8.2, 11.2, ks);
    const lx = this.leaving ? (this.hx - tx) * clamp01(this.leaving.t - 0.3) * 0.35 : 0;
    const t = this.t;
    const hx = (Math.sin(t * 0.61) + Math.sin(t * 1.37 + 1) * 0.5) * 0.03, hy = (Math.sin(t * 0.83 + 2) + Math.sin(t * 1.71) * 0.4) * 0.025;
    const goalPos = new THREE.Vector3(tx + lx + hx, ty + 0.75 + hy, dist), goalLook = new THREE.Vector3(tx + lx, ty, -1.5);
    if (snap) { this.camPos.copy(goalPos); this.camLook.copy(goalLook); }
    else {
      const kk = this.phase === 'travel' ? 4 : 2.2;
      this.camPos.x = damp(this.camPos.x, goalPos.x, kk, dt); this.camPos.y = damp(this.camPos.y, goalPos.y, kk, dt); this.camPos.z = damp(this.camPos.z, goalPos.z, 1.6, dt);
      this.camLook.x = damp(this.camLook.x, goalLook.x, kk, dt); this.camLook.y = damp(this.camLook.y, goalLook.y, kk, dt); this.camLook.z = goalLook.z;
    }
    const cam = this.camera;
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    cam.rotateZ(Math.sin(t * 0.37) * 0.004);
    cam.updateMatrixWorld();
  }
}
