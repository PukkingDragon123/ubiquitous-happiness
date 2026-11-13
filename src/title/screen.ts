// TitleScreen ('title'): the main menu as a cinematic hero shot. The blobfish stands on its ledge at the hideout's
// mouth, toothpick planted, kasa tassels and scarf streaming in the current, the ocean opening out beyond. Letterbox,
// a slow dolly / orbit with a handheld drift, music. The chunky BLOBFISH: REEL REBELLION logo, and the menu down the
// left: NEW RUN (the camera swoops in and the run config panel opens; ENTER plays the hideout's gear-up + walk-out
// cinematic), RESUME, HIDEOUT, WARDROBE (a turntable close-up), ACHIEVEMENTS, SETTINGS, PROLOGUE, CREDITS. The hero
// reacts to whatever you hover: glances, raises the sword with a glint, tips the hat.
//
//   const t = new TitleScreen(game, { onNewRun, onResume, onHideout, onPrologue }); game.register(t);
//   game.go('title', { page?: 'config' | 'wardrobe' | 'ach' | 'settings' | 'credits', quick?: true })
//   (?page=wardrobe works too; window.title.menuPoint('wardrobe') gives a menu item's CSS-pixel centre for tests)
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { POST } from '../gfx/post';
import { UW } from '../gfx/shaders/underwater';
import { SKY } from '../gfx/sky';
import { SURF } from '../gfx/water/surface';
import { META, type RunConfig } from '../meta/meta';
import { PixelUI } from '../ui/pixel/ui';
import { audio } from '../audio/audio';
import { damp, clamp01, easeOutCubic } from '../core/math';
import { HeroSet, TITLE_LOOK, HERO_YAW } from './scene';
import { drawTitleLogo } from './logo';
import { RunConfigPanel } from './runConfig';
import { SettingsPanel, CreditsPanel } from './pages';
import { WardrobePanel, WARD_W } from './wardrobe';
import { AchievementsPanel, ACH_W, ACH_H } from './achPanel';
import { ACHIEVEMENTS } from '../achievements';
import { COSMETIC } from '../cosmetics';

export interface TitleOpts {
  /** ENTER on the run config: play the gear-up + walk-out cinematic, then start the run */
  onNewRun: (cfg: RunConfig) => void;
  onResume: () => void;
  onHideout: () => void;
  onPrologue?: () => void;
}
export type TitlePage = 'main' | 'config' | 'wardrobe' | 'ach' | 'settings' | 'credits';

interface Item { id: string; label: string; desc: () => string; on: () => boolean }
interface Shot { target: THREE.Vector3; dist: number; yaw: number; pitch: number; fov: number }

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

export class TitleScreen implements Screen {
  name = 'title';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  ui = new PixelUI({ targetH: 300 });
  overlays: { scene: THREE.Scene; camera: THREE.Camera }[] = [this.ui.layer];
  set: HeroSet;
  page: TitlePage = 'main';
  private t = 0;
  private pageT = 0;
  private sel = 0;
  private hk: number[] = [];
  private pressId: string | null = null;
  private items: Item[];
  private cfg = new RunConfigPanel();
  private settings = new SettingsPanel();
  private credits = new CreditsPanel();
  private ward = new WardrobePanel();
  private achP = new AchievementsPanel();
  private cur: Shot;
  private snap: [string, unknown][][] | null = null;
  private leaving: { fn: () => void; t: number } | null = null;
  private fadeIn = 1;
  private intro = 0;
  private ambience: ReturnType<typeof audio.loop> | null = null;
  // hero reactions
  private react = { id: '', t: 0 };
  private swordK = 0;   // 0 planted .. 1 at the ready
  private tilt = 0;
  private glint = -1;
  private spin = 0;
  private spinV = 0;
  private lastHover: string | null = null;
  private v = new THREE.Vector3();
  private dragX: number | null = null;
  /** the keyboard has been used to move the selection (then the selection drives the reactions) */
  private kbd = false;

  constructor(private game: Game, private opts: TitleOpts) {
    this.set = new HeroSet();
    this.scene.add(this.set.group);
    this.scene.background = new THREE.Color('#06223a');
    this.items = [
      { id: 'new', label: 'NEW RUN', desc: () => 'Pick a loadout. Go hunting.', on: () => true },
      { id: 'resume', label: 'RESUME', desc: () => { const r = META.activeRun; return r ? `Area ${r.areaIdx + 1} of 3 · ${r.wavesCleared} waves down · M${r.cfg.mastery}` : 'No run in progress.'; }, on: () => !!META.activeRun },
      { id: 'hideout', label: 'HIDEOUT', desc: () => 'Home: build, stash, craft, nap.', on: () => true },
      { id: 'wardrobe', label: 'WARDROBE', desc: () => 'Hats, skins, swords, scarves and trails.', on: () => true },
      { id: 'ach', label: 'ACHIEVEMENTS', desc: () => `${META.achievements.unlocked.length} of ${ACHIEVEMENTS.length} · each one unlocks a cosmetic`, on: () => true },
      { id: 'settings', label: 'SETTINGS', desc: () => 'Volume, motion blur, quality.', on: () => true },
      { id: 'prologue', label: 'PROLOGUE', desc: () => 'Where it began. The bread.', on: () => !!this.opts.onPrologue },
      { id: 'credits', label: 'CREDITS', desc: () => 'Who made the blobfish.', on: () => true },
    ];
    this.hk = this.items.map(() => 0);
    this.cur = this.shot('main');
    this.set.onWhale = () => audio.play('whale' + (1 + Math.floor(Math.random() * 3)), { vol: 0.35 });
    this.ui.drawCursor = true;
    (window as unknown as { title: TitleScreen }).title = this;
  }

  // ---------------------------------------------------------------- Screen
  get underwater() { return true; }
  resize(w: number, h: number) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.ui.resize(w, h, this.game.renderer.getPixelRatio());
    this.set.setScale(440 / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
  }

  enter(data?: unknown) {
    const d = (data ?? {}) as { page?: TitlePage; quick?: boolean };
    this.snap = snapshot();
    this.set.light.applyLook(TITLE_LOOK);
    this.set.light.setSun(HeroSet.SUN_AIR.clone());
    UW.uWaterY.value = 0;
    POST.uFade.value = 1; POST.uLetterbox.value = 0.75;
    this.fadeIn = 1; this.leaving = null;
    this.t = 0; this.pageT = 0; this.intro = d.quick ? 9 : 0;
    this.sel = 0; this.pressId = null; this.spin = 0; this.react = { id: '', t: 0 }; this.kbd = false;
    const q = new URLSearchParams(location.search).get('page') as TitlePage | null;
    this.go(d.page ?? q ?? 'main', true);
    this.cur = this.shot(this.page);
    if (!d.quick && this.page === 'main') {
      // the opening: looking up at the boats' hulls against the bright surface, tilting down onto the hero
      this.cur.target.set(this.set.H.x - 3, this.set.H.y + 7.5, this.set.H.z - 9); this.cur.dist = 3; this.cur.pitch = -0.2; this.cur.yaw = 0.15;
    }
    this.game.cursor = 'none';
    audio.music('mu_fjord', 2);
    audio.setUnderwater(0.25);
    this.ambience?.stop(); this.ambience = audio.loop('uw_amb1', 0.25);
    this.set.hero.rig.preview = {}; this.set.hero.rig.sync();
    this.game.post.cut?.();
  }
  exit() {
    this.ambience?.stop(0.6); this.ambience = null;
    if (this.snap) restore(this.snap);
    this.snap = null;
    POST.uLetterbox.value = 0; POST.uFade.value = 0;
    audio.setUnderwater(0);
    this.game.cursor = 'normal';
    this.set.hero.rig.preview = {}; this.set.hero.rig.apply();
  }

  /** switch page (and its camera shot) */
  go(p: TitlePage, instant = false) {
    this.page = p; this.pageT = 0;
    if (p === 'config') this.cfg.open();
    if (p === 'settings') this.settings.open();
    if (p === 'credits') this.credits.open();
    if (p === 'wardrobe') this.ward.open();
    if (p === 'ach') this.achP.open();
    if (p !== 'wardrobe') { this.set.hero.rig.preview = {}; this.set.hero.rig.sync(); }
    if (instant) this.cur = this.shot(p);
    if (!instant) audio.play(p === 'main' ? 'k_back2' : 'swish_a', { vol: 0.35, dry: true });
  }

  private leave(fn: () => void) {
    if (this.leaving) return;
    this.leaving = { fn, t: 0 };
    audio.play('k_confirm3', { vol: 0.45, dry: true });
  }

  // ---------------------------------------------------------------- camera
  /** a shot round the hero: `side` pushes the hero that many metres toward screen right (room for the UI) */
  private shot(p: TitlePage): Shot {
    const H = this.set.H, t = this.t;
    const mk = (yaw: number, dist: number, pitch: number, fov: number, side: number, up: number, back = 0): Shot => {
      const target = new THREE.Vector3(H.x - Math.cos(yaw) * side, H.y + up, H.z + Math.sin(yaw) * side - back);
      return { target, dist, yaw, pitch, fov };
    };
    switch (p) {
      case 'config': return mk(0.82, 3.7, 0.03, 36, 1.4, 0.42);
      case 'wardrobe': return mk(0.3, 3.9, 0.06, 36, 1.2, 0.6);
      case 'ach': return mk(0.34 + Math.sin(t * 0.05) * 0.06, 9.5, -0.02, 42, 0, 1.8, 1.5);
      case 'settings': case 'credits': return mk(0.42 + Math.sin(t * 0.045) * 0.08, 4.8, -0.03, 38, 0.95, 0.5);
      default: return mk(0.3 + Math.sin(t * 0.042) * 0.17, 4.7 + Math.sin(t * 0.05) * 0.4, -0.13 + Math.sin(t * 0.06) * 0.025, 38, 1.05 + Math.sin(t * 0.031) * 0.08, 0.62);
    }
  }
  private updateCamera(dt: number) {
    const goal = this.shot(this.page), c = this.cur;
    const k = this.page === 'main' && this.intro < 5 ? 0.55 + this.intro * 0.1 : this.page === 'config' || this.page === 'wardrobe' ? 2.6 : 1.6;
    c.target.x = damp(c.target.x, goal.target.x, k, dt); c.target.y = damp(c.target.y, goal.target.y, k, dt); c.target.z = damp(c.target.z, goal.target.z, k, dt);
    c.dist = damp(c.dist, goal.dist, k, dt); c.yaw = damp(c.yaw, goal.yaw, k, dt); c.pitch = damp(c.pitch, goal.pitch, k, dt); c.fov = damp(c.fov, goal.fov, k, dt);
    const t = this.t, cam = this.camera;
    // a gentle handheld drift
    const hx = (Math.sin(t * 0.61) + Math.sin(t * 1.37 + 1) * 0.5) * 0.018, hy = (Math.sin(t * 0.83 + 2) + Math.sin(t * 1.71) * 0.4) * 0.014;
    cam.position.set(
      c.target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist + hx,
      c.target.y + Math.sin(c.pitch) * c.dist + hy,
      c.target.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist,
    );
    cam.lookAt(c.target.x + hx * 0.4, c.target.y + hy * 0.4, c.target.z);
    cam.rotateZ(Math.sin(t * 0.37) * 0.006);
    if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- test hooks
  /** CSS-pixel centre of a widget drawn last frame ('menu:new', 'cfg:enter', 'ward:tricorn', 'ach:butcher') */
  uiPoint(id: string): [number, number] | null {
    const r = this.ui.rects.get(id);
    if (!r) return null;
    const k = this.ui.scale / this.game.renderer.getPixelRatio();
    return [(r[0] + r[2] / 2) * k, (r[1] + r[3] / 2) * k];
  }
  menuPoint(id: string) { return this.uiPoint('menu:' + id); }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    this.t += dt; this.pageT += dt; this.intro += dt;
    const ui = this.ui, input = this.game.input;
    this.game.cursor = 'none';
    // fades
    this.fadeIn = Math.max(0, this.fadeIn - dt * 0.9);
    let fade = this.fadeIn;
    if (this.leaving) {
      this.leaving.t += dt;
      fade = Math.max(fade, clamp01(this.leaving.t / 0.55));
      if (this.leaving.t >= 0.6) { const fn = this.leaving.fn; this.leaving = null; fn(); return; }
    }
    POST.uFade.value = fade;
    POST.uLetterbox.value = damp(POST.uLetterbox.value, this.page === 'main' ? 0.75 : 0.45, 3, dt);

    ui.begin(this.leaving ? null : input, dt);
    if (this.intro > 1.0) drawTitleLogo(ui, this.page === 'main' ? 12 : 12, this.page === 'main' ? 14 : -200, this.intro - 1.0);
    switch (this.page) {
      case 'main': this.menu(dt); break;
      case 'config': {
        const r = this.cfg.draw(ui, 10, Math.max(4, Math.round((ui.h - 214) / 2) - 4), dt);
        if (r === 'back') this.go('main');
        else if (r) { const cfg = r; this.leave(() => this.opts.onNewRun(cfg)); }
        break;
      }
      case 'settings': if (this.settings.draw(ui, 14, Math.round((ui.h - 182) / 2), dt)) this.go('main'); break;
      case 'credits': if (this.credits.draw(ui, 14, Math.round((ui.h - 190) / 2), dt)) this.go('main'); break;
      case 'wardrobe': {
        const close = this.ward.draw(ui, 8, Math.round((ui.h - 242) / 2), dt);
        const want = this.ward.hover;
        if (want !== this.lastHover) {
          this.lastHover = want;
          const c = want ? COSMETIC[want] : null;
          this.set.hero.rig.preview = c ? { [c.slot]: c.id } : {};
          this.set.hero.rig.apply();
        }
        if (this.ward.equipped) { this.set.hero.rig.preview = {}; this.set.hero.rig.apply(); this.set.hero.play('gearUp', true); this.lastHover = null; }
        if (close) this.go('main');
        // spin him: drag with either button away from the panel
        const free = !ui.mouseOnUI && ui.mx > WARD_W + 12;
        if ((ui.pressed && free) || ui.rpressed) this.dragX = ui.mx;
        if (this.dragX !== null && (ui.down || ui.rdown)) { this.spinV = (ui.mx - this.dragX) * 0.06; this.spin += (ui.mx - this.dragX) * 0.03; this.dragX = ui.mx; ui.cursor = 'grab'; }
        else this.dragX = null;
        break;
      }
      case 'ach': if (this.achP.draw(ui, Math.round((ui.w - ACH_W) / 2), Math.max(4, Math.round((ui.h - ACH_H) / 2)), dt)) this.go('main'); break;
    }
    if (this.page !== 'main' && this.page !== 'config' && input.keyHit('Escape') && this.pageT > 0.1) this.go('main');
    ui.end();

    this.heroLife(dt);
    this.updateCamera(dt);
    this.set.update(dt, this.t, this.camera);
  }

  // ---------------------------------------------------------------- the menu
  private menu(dt: number) {
    const ui = this.ui, inp = this.game.input;
    const n = this.items.length, rowH = 16;
    const x0 = 24, y0 = Math.max(108, Math.min(Math.round(ui.h * 0.42), ui.h - 30 - n * rowH - 14));
    const appear = this.intro - 1.5;
    if (appear > 0 && !this.leaving) {
      if (inp.keyHit('ArrowDown') || inp.keyHit('KeyS')) { this.sel = this.nextOn(this.sel, 1); this.kbd = true; audio.play('k_tick1', { vol: 0.2, dry: true }); }
      if (inp.keyHit('ArrowUp') || inp.keyHit('KeyW')) { this.sel = this.nextOn(this.sel, -1); this.kbd = true; audio.play('k_tick1', { vol: 0.2, dry: true }); }
    }
    let hovered = -1;
    this.items.forEach((it, i) => {
      const y = y0 + i * rowH;
      const k = clamp01((appear - i * 0.07) / 0.35);
      if (k <= 0) return;
      const slide = Math.round((1 - easeOutCubic(k)) * -120);
      const on = it.on();
      const w = 150;
      const over = k >= 1 && ui.hover(x0 - 14, y - 3, w, rowH - 1);
      ui.mark('menu:' + it.id, x0 - 14, y - 3, w, rowH - 1);
      ui.block(x0 - 14, y - 3, w, rowH - 1);
      if (over) { hovered = i; this.kbd = false; if (on) { this.sel = i; ui.cursor = 'point'; } }
      if (over && ui.pressed && on) this.pressId = it.id;
      const clicked = over && ui.released && this.pressId === it.id;
      const hot = this.sel === i && on;
      this.hk[i] = damp(this.hk[i], hot ? 1 : 0, 14, dt);
      const h = this.hk[i];
      const x = x0 + slide + Math.round(h * 7);
      const tw = ui.measure(it.label, 'title');
      // a slanted crimson ribbon sweeping in behind the hot item
      if (h > 0.02) {
        const bw = Math.round((tw + 34) * easeOutCubic(h));
        for (let r = 0; r < 14; r++) {
          const c = r === 0 ? '#f86a4a' : r === 13 ? '#3a0610' : r < 3 ? '#c8342c' : '#8a1a22';
          ui.fill(x0 - 12 + slide + Math.round((13 - r) * 0.5), y - 3 + r, bw, 1, c, 0.92 * h);
        }
        ui.fill(x0 - 12 + slide + bw, y - 3, 2, 14, '#f0c040', h);
        // the toothpick pointer sliding in
        const px = x0 - 26 + slide + Math.round(h * 10);
        ui.fill(px, y + 3, 10, 1, '#c49c62'); ui.fill(px, y + 4, 10, 1, '#74502e'); ui.fill(px + 10, y + 3, 2, 1, '#fff0c0');
        ui.fill(px - 3, y + 2, 3, 4, '#94703e'); ui.fill(px - 5, y + 1, 2, 1, '#ff3b5c'); ui.fill(px - 5, y + 6, 2, 1, '#3bd1ff'); ui.fill(px - 6, y + 3, 1, 2, '#ffd23b');
      }
      const col = !on ? { color: '#5a5862', shadow: '#000' } : hot ? { color: '#fff6dc', color2: '#ffd060', outline: '#2a0408' } : { color: '#e4e0d8', color2: '#aca6a0', shadow: '#000' };
      ui.text(it.label, x, y, { font: 'title', alpha: Math.min(1, k * 1.5), ...col });
      if (clicked && on) this.activate(it.id);
    });
    if (ui.released) this.pressId = null;
    if (appear > 0.6 && !this.leaving && (inp.keyHit('Enter') || inp.keyHit('Space'))) { const it = this.items[this.sel]; if (it.on()) this.activate(it.id); }
    // the hot item's caption
    const it = this.items[this.sel];
    const a = clamp01(appear - 0.5);
    if (a > 0) {
      ui.fill(x0 - 12, y0 + n * rowH + 2, 168, 1, '#f0c040', 0.6 * a);
      ui.text(it.desc(), x0 - 12, y0 + n * rowH + 6, { font: 'small', color: '#c8dce8', shadow: '#000', alpha: a });
    }
    // footer in the lower letterbox bar
    if (appear > 0.4) {
      const fy = ui.h - 13;
      ui.text(`MASTERY ${META.masteryUnlocked}  ·  ${META.runs} RUNS  ·  ${META.wins} WINS  ·  ${META.achievements.unlocked.length}/${ACHIEVEMENTS.length} ACHIEVEMENTS`, 12, fy, { font: 'small', color: '#8a9ab0' });
      let hx = ui.w - 128;
      hx += ui.hint('W', '', hx, fy - 3, { color: '#a8b8d0' }) - 8;
      hx += ui.hint('S', 'select', hx, fy - 3, { color: '#a8b8d0' });
      ui.hint('ENTER', 'go', hx, fy - 3, { color: '#a8b8d0' });
    }
    // the hero reacts to the hot item
    const id = hovered >= 0 && this.items[hovered].on() ? this.items[hovered].id : this.kbd ? this.items[this.sel].id : '';
    if (id !== this.react.id) { this.react = { id, t: 0 }; this.onReact(id); }
  }
  private nextOn(i: number, d: number) { for (let k = 0; k < this.items.length; k++) { i = (i + d + this.items.length) % this.items.length; if (this.items[i].on()) return i; } return i; }

  private activate(id: string) {
    if (this.leaving) return;
    audio.play('k_select1', { vol: 0.45, dry: true });
    switch (id) {
      case 'new': this.go('config'); audio.play('sw_swish1', { vol: 0.4 }); break;
      case 'resume': if (META.activeRun) this.leave(() => this.opts.onResume()); break;
      case 'hideout': this.leave(() => this.opts.onHideout()); break;
      case 'wardrobe': this.go('wardrobe'); break;
      case 'ach': this.go('ach'); break;
      case 'settings': this.go('settings'); break;
      case 'prologue': this.leave(() => this.opts.onPrologue?.()); break;
      case 'credits': this.go('credits'); break;
    }
  }

  // ---------------------------------------------------------------- the hero
  private onReact(id: string) {
    const h = this.set.hero;
    if (id === 'new') { this.glint = 0; audio.play('shimmer1', { vol: 0.3 }); }
    if (id === 'wardrobe') audio.play('cloth1', { vol: 0.25 });
    h.setExpression(id === 'new' ? 'brave' : id === 'prologue' ? 'sad' : id === 'ach' ? 'cheer' : id === 'credits' || id === 'hideout' ? 'happy' : id === 'resume' || id === 'settings' ? 'focus' : 'cool');
  }
  private heroLife(dt: number) {
    const s = this.set, h = s.hero, m = h.model, H = s.H, t = this.t;
    const page = this.page, id = page === 'main' ? this.react.id : page;
    this.react.t += dt;
    // where he looks: out to sea by default; at the camera, back at the hatch, or down, depending on the item
    const cam = this.camera.position;
    const look = id === 'hideout' ? this.v.set(H.x + 2.1, H.y + 0.8, H.z - 2) : id === 'prologue' ? this.v.set(H.x - 2, H.y - 2.5, H.z + 1) :
      id === 'new' || id === 'resume' || id === 'settings' || id === 'credits' || id === 'wardrobe' || id === 'config' ? this.v.copy(cam) :
      id === 'ach' ? this.v.set(H.x - 4, H.y + 4, H.z - 3) : this.v.set(H.x - 9 + Math.sin(t * 0.2) * 2, H.y + 0.6, H.z - 6 + Math.sin(t * 0.13) * 3);
    h.lookAt(look);
    // the sword: planted in the rock, raised to the ready for NEW RUN, with a glint running up the blade
    const ready = id === 'new' || id === 'config' ? 1 : page === 'wardrobe' ? 0.75 : 0;
    this.swordK = damp(this.swordK, ready, 6, dt);
    m.weaponCtl = 'external';
    const hand = m.handWorld(new THREE.Vector3());
    h.root.worldToLocal(hand);
    m.weaponZ = -Math.abs(hand.z) - 0.06;
    m.weaponAng = -1.42 + Math.sin(t * 0.7) * 0.015 + this.swordK * (1.42 + 0.62 + Math.sin(t * 1.3) * 0.03);
    if (this.glint >= 0) {
      this.glint += dt;
      const k = this.glint / 0.45;
      if (k <= 1) { const tip = m.weaponTip(new THREE.Vector3()), piv = m.weaponPivot.getWorldPosition(new THREE.Vector3()); const p = piv.lerp(tip, k); s.fx.emit('sparkle', p.x, p.y, { z: p.z, n: 1, size: 0.16, life: 0.35, color: '#ffffff', add: true }); }
      else this.glint = -1;
    }
    // the hat tips on WARDROBE (and nods when you equip)
    const tiltGoal = id === 'wardrobe' && page === 'main' ? 0.24 + Math.sin(this.react.t * 6) * 0.04 * Math.max(0, 1 - this.react.t) : 0;
    this.tilt = damp(this.tilt, tiltGoal, 8, dt);
    const hat = m.parts.hat?.root.getObjectByName('hatTilt') ?? m.parts.hat?.root.getObjectByName('hatRig');
    if (hat) { hat.userData.rz0 ??= hat.rotation.z; hat.rotation.z = (hat.userData.rz0 as number) + this.tilt; }
    // turntable in the wardrobe, back to the hero pose elsewhere
    if (page === 'wardrobe') { if (this.dragX === null) this.spin += dt * 0.35 + this.spinV * dt; this.spinV *= Math.exp(-dt * 3); }
    else this.spin = damp(this.spin, Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2, 3, dt);
    h.root.rotation.y = HERO_YAW + (page === 'wardrobe' ? 0.45 : 0) + this.spin + Math.sin(t * 0.25) * 0.04;
    h.update(dt, { t });
    // the trail shows behind him in the wardrobe
    if (page === 'wardrobe') { const tp = m.tail.getWorldPosition(new THREE.Vector3()); h.rig.trail(s.fx, tp.x, tp.y, tp.z, 1.6, dt * 0.5, true, 0.6); }
  }
}
