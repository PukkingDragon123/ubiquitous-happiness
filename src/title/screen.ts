// TitleScreen ('title'), v7: a letterboxed side-on travelling shot through the layered ocean (travel.ts): the
// blobfish swims left to right and comes to rest beside an old underwater signpost (sign.ts, no words on it). Every
// word is 2D, drawn on the UI over the scene (no 3D text):
//   - the BLOBFISH / REEL REBELLION logo (logo.ts) drops in letter by letter early in the swim,
//   - the menu (menu2d.ts) floats in under it on arrival:
//       CONTINUE  (only with a save)  -> opts.onResume()   the blobfish swims back home (left)
//       NEW GAME                      -> opts.onNew()      it swims on (right); over a save it asks first (START OVER?)
//       SETTINGS / CREDITS            -> a kit page over the scene (pages.ts)
//   - the caption bar (the bottom letterbox bar) says what the chosen item does, with the key hints.
// Choosing an item knocks its board on the sign (the way on, the way home, the gear; the lantern for CREDITS), and
// the blobfish looks at it. Poke the blobfish and it does a happy little flip; leave it alone and it dozes off.
// Keyboard: up / down (W / S) choose, Enter / Space go, Esc closes a page. Mouse: hover chooses, click goes (the
// boards on the sign work too). A click / key during the swim skips ahead to the arrival.
//
//   const t = new TitleScreen(game, { onNew, onResume, hasSave }); game.register(t);
//   game.go('title', { quick?: true })   (quick: a shorter swim in, for coming back from the hideout)
//   test hooks (window.title): skip() jumps to the arrival (menu live at once); itemPoint(id) -> the CSS-pixel centre
//   of a menu item ('continue' | 'new' | 'settings' | 'credits'); boardPoint(id) is the v6 name and still works
//   ('new' -> NEW GAME, 'resume' -> CONTINUE, 'gear' -> SETTINGS); items() -> the ids shown
import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { POST } from '../gfx/post';
import { UW } from '../gfx/shaders/underwater';
import { SKY } from '../gfx/sky';
import { SURF } from '../gfx/water/surface';
import { PixelUI } from '../ui/pixel/ui';
import { KIT, C } from '../ui/pixel/skins';
import { audio } from '../audio/audio';
import { META } from '../meta/meta';
import { damp, clamp01 } from '../core/math';
import { TravelSet, floorAt } from './travel';
import type { BoardId } from './sign';
import { SettingsPanel, SETTINGS_W, SETTINGS_H, CreditsPanel, CREDITS_W, CREDITS_H } from './pages';
import { Logo } from './logo';
import { TitleMenu, ROW, type ItemId, type MenuItem } from './menu2d';

export interface TitleOpts {
  /** NEW GAME */ onNew: () => void;
  /** CONTINUE (only shown while hasSave()) */ onResume: () => void;
  /** is there anything to continue (CONTINUE is left out otherwise) */ hasSave: () => boolean;
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

type Phase = 'travel' | 'idle';
/** the menu item each board on the sign stands for, and back */
const BOARD_ITEM: Record<BoardId, ItemId> = { new: 'new', resume: 'continue', gear: 'settings' };
const ITEM_BOARD: Partial<Record<ItemId, BoardId>> = { new: 'new', continue: 'resume', settings: 'gear' };
/** the letterbox in the idle shot (the layout is fixed against it) */
const LB_IDLE = 0.66;
/** seconds of no input before the blobfish dozes off */
const DOZE = 14;

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
  private leaving: { id: ItemId; dir: number; t: number } | null = null;
  private page: 'settings' | 'credits' | null = null;
  private settings = new SettingsPanel();
  private credits = new CreditsPanel();
  private logo = new Logo();
  private menu = new TitleMenu();
  /** seconds since the logo / the menu started showing (-1: not yet) */
  private logoT = -1;
  private menuT = -1;
  /** NEW GAME over a save: START OVER? is up for this long */
  private confirmT = 0;
  private snap: [string, unknown][][] | null = null;
  private ambience: ReturnType<typeof audio.loop> | null = null;
  private ray = new THREE.Raycaster();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private fadeIn = 1;
  private yaw = 0;
  private lastBoard: BoardId | 'lantern' | null = null;
  private lastLook: ItemId | null = null;
  /** the blobfish's little moments: dozing off, a poke */
  private quietT = 0;
  private dozing = false;
  private wakeT = 9;
  private pokeT = 9;
  private boardOver: BoardId | null = null;
  /** the menu takes input from this time on (screen clock) */
  private liveAt = 0;
  /** layout (UI px), set every frame */
  private menuX = 0; private menuY = 0; private logoX = 0; private logoY = 0;

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
    this.rest.set(s.x - 3.35, floorAt(s.x - 3.35, 0) + 1.95, 0.4);
    this.hx = this.rest.x - (d.quick ? 13 : 30); this.hy = this.rest.y + 1.4; this.vx = 3.6;
    this.phase = 'travel'; this.phaseT = 0; this.t = 0;
    this.leaving = null; this.page = null; this.confirmT = 0;
    this.logoT = d.quick ? 0.6 : -1; this.menuT = -1;
    this.menu.reset();
    this.menu.select(this.opts.hasSave() ? 'continue' : 'new');
    this.yaw = 0; this.quietT = 0; this.dozing = false; this.wakeT = 9; this.pokeT = 9;
    this.lastBoard = null; this.lastLook = null; this.liveAt = 0;
    this.ui.opacity = 1;
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
    this.ui.opacity = 1;
    audio.setUnderwater(0);
    this.game.cursor = 'normal';
  }

  // ---------------------------------------------------------------- test hooks
  /** the menu items on show, top to bottom */
  items(): ItemId[] { return this.menuItems().map((i) => i.id); }
  /** CSS-pixel centre of a menu item (for click tests) */
  itemPoint(id: ItemId): [number, number] | null {
    const i = this.items().indexOf(id);
    if (i < 0) return null;
    // the middle of the word's first letters (from the layout: right even before the menu has slid in)
    const ux = this.menuX + 30, uy = this.menuY + i * ROW + 8;
    const k = this.ui.scale / this.game.renderer.getPixelRatio();
    return [Math.round(ux * k), Math.round(uy * k)];
  }
  /** v6 name: 'new' -> NEW GAME, 'resume' -> CONTINUE, 'gear' -> SETTINGS (null when that item isn't shown) */
  boardPoint(id: BoardId | ItemId): [number, number] | null { return this.itemPoint((BOARD_ITEM as Record<string, ItemId>)[id] ?? (id as ItemId)); }
  /** jump to the arrival: the hero at rest, the camera on the wide shot, the logo and the menu live at once */
  skip() {
    if (this.leaving) return;
    this.hx = this.rest.x; this.hy = this.rest.y;
    if (this.phase === 'travel') { this.phase = 'idle'; this.phaseT = 0; this.set.hero.play('idle'); }
    this.logoT = Math.max(this.logoT, 3); this.menuT = Math.max(this.menuT, 3);
    this.placeCamera(1, true);
    POST.uLetterbox.value = LB_IDLE;
    this.fadeIn = 0;
  }

  private menuItems(): MenuItem[] {
    const save = this.opts.hasSave();
    const out: MenuItem[] = [];
    if (save) out.push({ id: 'continue', label: 'CONTINUE', desc: META.activeRun ? 'Dive back into the run you left.' : 'Swim back home to your house on the seabed.' });
    out.push({
      id: 'new', label: 'NEW GAME',
      desc: this.confirmT > 0 ? 'Your home and stash will be lost! Pick it again to start over.' : save ? 'Start the rebellion again from the very beginning.' : 'The hooks took everything. Time to bite back.',
      warn: this.confirmT > 0 ? 'START OVER?' : undefined,
    });
    out.push({ id: 'settings', label: 'SETTINGS', desc: 'Sound, music, motion blur, quality and the controls.', stay: true });
    out.push({ id: 'credits', label: 'CREDITS', desc: 'The fonts, the sounds and the people behind the fish.', stay: true });
    return out;
  }

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
      ui.opacity = 1 - clamp01((L.t - 0.35) / 0.6);
      if (L.t > 1.45) { this.leaving = null; const id = L.id; (id === 'new' ? this.opts.onNew : this.opts.onResume)(); return; }
    }
    POST.uFade.value = fade;
    POST.uLetterbox.value = damp(POST.uLetterbox.value, this.phase === 'idle' ? LB_IDLE : 1, 2, dt);
    // any input keeps the blobfish awake
    const busy = input.mouse.moved || input.pressed.size > 0;
    if (busy) this.quietT = 0; else this.quietT += dt;

    ui.begin(this.leaving ? null : input, dt);
    // ---- the hero swims in, then hangs about by the sign
    const h = this.set.hero;
    if (this.phase === 'travel') {
      const togo = this.rest.x - this.hx;
      // impatient players: any click / key during the swim jumps ahead to the arrival
      if (this.phaseT > 0.3 && (ui.pressed || input.keyHit('Enter') || input.keyHit('Space') || input.keyHit('Escape'))) { this.skip(); this.liveAt = this.t + 0.4; audio.play('swish_a', { vol: 0.25 }); }
      else {
        this.vx = Math.min(3.6, togo * 0.85 + 0.12);
        this.hx += this.vx * dt;
        this.hy = damp(this.hy, this.rest.y + Math.sin(this.hx * 0.22) * 0.5 * clamp01(togo / 8), 2, dt);
        if (togo < 0.04) { this.hx = this.rest.x; this.phase = 'idle'; this.phaseT = 0; h.play('idle'); audio.play('bubble2', { vol: 0.25 }); }
      }
      // the logo drops in a little way into the swim
      if (this.logoT < 0 && this.phaseT > 1.4) this.logoT = 0;
    } else if (!this.leaving) {
      this.hx = damp(this.hx, this.rest.x, 2, dt);
      const doze = this.dozing ? 0.5 : 1;
      this.hy = damp(this.hy, this.rest.y + Math.sin(this.t * 1.3 * doze) * 0.08 - (this.dozing ? 0.12 : 0), 3, dt);
      if (this.menuT < 0) this.menuT = 0;
      if (this.logoT < 0) this.logoT = 0.8;
    }
    if (this.logoT >= 0) this.logoT += dt;
    if (this.menuT >= 0) this.menuT += dt;
    if (this.leaving) {
      // turn and swim off the way the board points, accelerating
      const L = this.leaving;
      this.vx = damp(this.vx, L.dir * 6, 1.6, dt);
      if (L.t > 0.25) this.hx += this.vx * dt;
      this.hy += Math.sin(L.t * 3) * dt * 0.3 + (L.id === 'continue' ? -0.15 : 0.25) * dt;
    }
    const yawGoal = this.leaving ? (this.leaving.dir > 0 ? 0 : Math.PI) : this.phase === 'idle' ? -0.5 : 0;
    this.yaw = damp(this.yaw, yawGoal, this.leaving ? 7 : 2.5, dt);
    h.root.position.set(this.hx, this.hy, this.rest.z);
    h.root.rotation.y = this.yaw;
    // a poke: a happy little flip
    this.pokeT += dt;
    const flip = this.pokeT < 0.7 ? Math.sin(clamp01(this.pokeT / 0.7) * Math.PI) : 0;
    h.root.rotation.z = this.phase === 'travel' ? Math.sin(this.t * 1.1) * 0.05 : flip * 0.5 * Math.sin(this.pokeT * 9);
    h.root.position.y += flip * 0.35;
    h.current.set(-Math.abs(this.vx) * 0.6, 0);
    h.update(dt, { t: this.t, move: this.phase === 'travel' || this.leaving ? Math.min(1, Math.abs(this.vx) / 3) : 0 });
    if (this.phase === 'travel' && Math.random() < dt * 3) this.set.bubbles.emit(this.hx - 0.5, this.hy + 0.2, 0, { vy: 0.4, life: 2.5, size: 0.04 + Math.random() * 0.04 });

    // ---- the 2D layer: logo, menu, caption bar, pages
    const bar = this.barH();
    this.logo.prepare(ui);
    this.logoX = 30; this.logoY = bar + 16;
    this.menuX = this.logoX + 22; this.menuY = this.logoY + this.logo.h + 22;
    this.drawShade();
    if (this.logoT >= 0) {
      this.logo.draw(ui, this.logoX, this.logoY, { t: this.t, appear: this.logoT });
      // a click on the logo pokes it
      const r = this.logo.rect(this.logoX, this.logoY);
      if (this.phase === 'idle' && !this.page && !this.leaving && ui.hover(...r)) { ui.cursor = 'point'; if (ui.pressed) { this.logo.poke(); audio.play('squish1', { vol: 0.3, rate: 1.2 }); audio.play('bubbles_a', { vol: 0.2 }); } }
    }
    let chosen: ItemId | null = null;
    const items = this.menuItems();
    if (this.phase === 'idle' && this.menuT >= 0 && !this.page) {
      // (the key / click that skipped the swim doesn't also pick an item)
      const live = !this.leaving && this.menuT > 0.3 && this.t > this.liveAt;
      const r = this.menu.draw(ui, this.menuX, this.menuY, { items, t: this.t, appear: this.menuT, live });
      chosen = this.menu.sel;
      if (live) {
        let act = r.activate;
        // the boards on the sign answer the mouse too (when it isn't over a word)
        this.boardOver = null;
        if (!r.over && ui.inside && !ui.hover(...this.logo.rect(this.logoX, this.logoY))) {
          this.ray.setFromCamera(new THREE.Vector2(input.mouse.nx, input.mouse.ny), this.camera);
          const b = this.set.sign.pick(this.ray);
          const it = b ? BOARD_ITEM[b] : null;
          if (b && it && items.some((q) => q.id === it)) {
            this.boardOver = b; ui.cursor = 'point';
            if (input.mouse.moved) this.menu.select(it);
            if (ui.pressed) { act = it; this.menu.flash(it); }
          } else if (this.overHero()) {
            ui.cursor = 'point';
            if (ui.pressed) this.pokeHero();
          }
        }
        if (act) this.activate(act);
      }
    }
    if (this.phase === 'idle' && this.page && !this.leaving) this.drawPage(dt);
    this.drawBar(bar, items, chosen);
    ui.drawCursor = this.phase === 'idle' && !this.leaving;
    ui.end();

    // ---- the sign and the hero answer the chosen item
    this.confirmT -= dt;
    const look: ItemId | null = this.leaving ? this.leaving.id : this.page === 'settings' ? 'settings' : this.page === 'credits' ? 'credits' : this.phase === 'idle' ? chosen : null;
    const board = look ? ITEM_BOARD[look] ?? null : null;
    const hot: BoardId | 'lantern' | null = board ?? (look === 'credits' ? 'lantern' : null);
    if (hot !== this.lastBoard) {
      if (board && this.set.sign.boards[board].enabled && this.phase === 'idle') { this.set.sign.knock(board, 0.5); audio.play('wood_knock1', { vol: 0.16, rate: 1.3 + Math.random() * 0.2 }); audio.play('rope_creak1', { vol: 0.1 }); }
      this.lastBoard = hot;
    }
    this.set.sign.update(dt, this.t, board, hot === 'lantern');
    // dozing off when left alone; waking with a start
    if (this.phase === 'idle' && !this.leaving && !this.page) {
      if (!this.dozing && this.quietT > DOZE) { this.dozing = true; h.setExpression('sleep'); audio.play('snore1', { vol: 0.18 }); }
      else if (this.dozing && this.quietT === 0) { this.dozing = false; this.wakeT = 0; h.setExpression('scared'); audio.play('bubble3', { vol: 0.3 }); this.hy += 0.25; }
      if (this.dozing && (this.t % 2.6) < dt) { this.set.bubbles.emit(this.hx + 0.45, this.hy + 0.35, 0.3, { vy: 0.35, life: 3, size: 0.09 }); }
    }
    this.wakeT += dt;
    if (this.phase === 'idle' && !this.dozing) {
      const lp = look === 'credits' ? this.set.sign.lanternWorld() : board ? this.set.sign.boardWorld(board) : this.set.sign.lanternWorld();
      h.lookAt(this.wakeT < 0.6 ? null : lp);
      if (look !== this.lastLook || (this.wakeT > 0.6 && this.wakeT - dt <= 0.6)) {
        this.lastLook = look;
        h.setExpression(look === 'new' ? 'brave' : look === 'continue' ? 'happy' : look === 'settings' ? 'focus' : look === 'credits' ? 'cool' : 'happy');
      }
    } else if (this.phase !== 'idle') h.lookAt(null);
    const lp = this.set.sign.lanternWorld();
    if (this.set.lamp) { this.set.lamp.set(lp.x, lp.y, lp.z); this.set.lamp.light.intensity = 3.2 * this.set.sign.lanternK; }

    this.placeCamera(dt);
    this.set.update(dt, this.t, this.camera);
  }

  /** the letterbox bar height in UI px for the idle shot */
  private barH() {
    const a = this.game.w / Math.max(1, this.game.h);
    return Math.round(this.ui.h * LB_IDLE * Math.max(0, 1 - a / 2.39) * 0.5);
  }

  /** a soft cinematic shade down the left of the frame, so the logo and the words read over the bright meadow */
  private drawShade() {
    const ui = this.ui, k = this.logoT >= 0 ? clamp01(this.logoT / 0.8) : 0;
    if (k <= 0) return;
    const W = Math.round(ui.w * 0.48);
    // stepped columns (8 px bands), darkest at the left edge
    for (let x = 0; x < W; x += 8) {
      const f = 1 - x / W;
      ui.fill(x, 0, 8, ui.h, C.ink, 0.55 * f * f * k);
    }
  }

  /** the caption bar: what the chosen item does on the left, the key hints on the right */
  private drawBar(bar: number, items: MenuItem[], chosen: ItemId | null) {
    const ui = this.ui;
    const y = ui.h - bar + Math.max(0, Math.round((bar - 13) / 2)) - (bar < 18 ? 16 : 0);
    if (this.phase === 'travel') {
      const a = clamp01((this.phaseT - 1.2) * 2);
      if (a > 0) {
        const w = ui.hintW('ENTER', 'skip');
        ui.hint('ENTER', 'skip', ui.w - w - 10, y, { color: KIT.textDim });
      }
      return;
    }
    if (this.page || this.menuT < 0.4) return;
    // hints: arrows choose, ENTER go (laid out first: the caption gets the room that is left)
    const hintsW = ui.hintW('ENTER', 'select') + 13 * 2 + 3 + Math.ceil(ui.measure('choose', 'small')) + 10;
    const it = items.find((q) => q.id === chosen);
    if (it) {
      const a = clamp01((this.menuT - 0.4) * 3), cx = Math.min(this.menuX - 4, 24), room = ui.w - 10 - hintsW - cx - 8;
      const font = ui.measure(it.desc, 'body') <= room ? 'body' : 'small';
      ui.text(it.desc, cx, y + (font === 'body' ? 1 : 3), { font, color: it.warn ? KIT.badLight : KIT.text, shadow: C.ink, alpha: a });
    }
    let x = ui.w - 10;
    // (a touch screen: the words are the buttons, no keys to show)
    if (PixelUI.touch) { const w0 = ui.hintW('ENTER', 'a word'); ui.hint('ENTER', 'a word', x - w0, y, { color: KIT.textDim }); return; }
    const w2 = ui.hintW('ENTER', 'select');
    x -= w2; ui.hint('ENTER', 'select', x, y, { color: KIT.textDim });
    const w1 = 13 * 2 + 3 + Math.ceil(ui.measure('choose', 'small')) + 10;
    x -= w1;
    ui.keycap('', x, y); this.arrow(x + 4, y + 4, -1);
    ui.keycap('', x + 15, y); this.arrow(x + 19, y + 4, 1);
    ui.text('choose', x + 32, y + Math.round((13 - 1 - ui.cap('small')) / 2), { font: 'small', color: KIT.textDim, shadow: C.ink });
  }
  /** a tiny ink arrow (up -1 / down 1) inside a keycap */
  private arrow(x: number, y: number, d: number) {
    const ui = this.ui;
    for (let i = 0; i < 3; i++) { const yy = d < 0 ? y + i : y + 2 - i; ui.fill(x + 2 - i, yy, 1 + i * 2, 1, KIT.ink); }
  }

  private drawPage(dt: number) {
    const ui = this.ui, input = this.game.input;
    ui.fill(0, 0, ui.w, ui.h, C.ink, 0.4);
    let close = false;
    if (this.page === 'settings') close = this.settings.draw(ui, Math.round((ui.w - SETTINGS_W) / 2), Math.round((ui.h - SETTINGS_H) / 2) + 4, dt);
    else close = this.credits.draw(ui, Math.round((ui.w - CREDITS_W) / 2), Math.round((ui.h - CREDITS_H) / 2) + 4, dt);
    void input;
    if (close) { this.page = null; this.liveAt = this.t + 0.1; audio.play('k_back2', { vol: 0.35, dry: true }); }
  }

  private overHero() {
    const hits = this.ray.intersectObject(this.set.hero.root, true);
    return hits.length > 0;
  }
  private pokeHero() {
    if (this.pokeT < 0.6) return;
    this.pokeT = 0; this.dozing = false; this.quietT = 0;
    const h = this.set.hero;
    h.setExpression('happy'); this.wakeT = 0.6;
    audio.play('squish1', { vol: 0.35, rate: 1.1 + Math.random() * 0.2 }); audio.play('bubbles_a', { vol: 0.25 });
    for (let i = 0; i < 12; i++) this.set.bubbles.emit(this.hx + (Math.random() - 0.5) * 0.8, this.hy + Math.random() * 0.5, 0.3, { vy: 0.5 + Math.random() * 0.6, life: 2, size: 0.03 + Math.random() * 0.05 });
  }

  private activate(id: ItemId) {
    const sign = this.set.sign;
    this.quietT = 0;
    if (id === 'settings' || id === 'credits') {
      this.page = id;
      if (id === 'settings') { this.settings.open(); sign.knock('gear', 1); } else this.credits.open();
      audio.play('k_open1', { vol: 0.4, dry: true }); audio.play('wood_knock1', { vol: 0.22 });
      return;
    }
    if (id === 'continue' && !this.opts.hasSave()) return;
    // NEW GAME over a save starts over: the first press asks (START OVER?), a second one within a few seconds goes
    if (id === 'new' && this.opts.hasSave() && this.confirmT <= 0) {
      this.confirmT = 4;
      sign.knock('new', 0.9);
      audio.play('page1', { vol: 0.4, dry: true }); audio.play('wood_knock1', { vol: 0.3, rate: 0.85 });
      return;
    }
    const board = ITEM_BOARD[id]!;
    sign.knock(board, 1.2);
    audio.play('wood_knock1', { vol: 0.4 }); audio.play('k_confirm3', { vol: 0.4, dry: true });
    audio.play('swish_a', { vol: 0.35, delay: 0.2 }); audio.play('bubbles_a', { vol: 0.35, delay: 0.3 });
    this.set.hero.setExpression(id === 'new' ? 'brave' : 'happy');
    this.set.hero.play('swim');
    this.dozing = false;
    this.vx = 0;
    this.leaving = { id, dir: sign.boards[board].dir || 1, t: 0 };
    this.confirmT = 0;
    audio.music(null, 1.2);
  }

  // ---------------------------------------------------------------- camera
  /**
   * tracking alongside the swim, settling into a wide shot as it slows: the hero a little left of centre, the sign on
   * the right, open water on the left for the logo and the words
   */
  private placeCamera(dt: number, snap = false) {
    const s = this.set.signAt;
    const togo = this.rest.x - this.hx;
    const k = this.phase === 'idle' || this.leaving ? 1 : clamp01(1 - (togo - 1) / 9);
    const ks = k * k * (3 - 2 * k);
    const tx = THREE.MathUtils.lerp(this.hx + 1.6, s.x - 3.0, ks), ty = THREE.MathUtils.lerp(this.hy + 0.45, s.y + 3.0, ks);
    const dist = THREE.MathUtils.lerp(7.6, 12.6, ks);
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
