// v3 flow: BOOT -> TITLE (the travelling shot to the underwater signpost, src/title) -> HIDEOUT (the hub you
// start in, src/hideout) -> RUN (the dungeon floors) -> back to the HIDEOUT with a result card.
//
//   const flow = setupFlow(game); game.go('title', {});
//
//   TITLE  NEW GAME  first time: the prologue (src/story/intro.ts) -> afterIntro -> the hideout (+ the welcome reveal)
//                    later: the run in progress is abandoned, then the hideout
//          RESUME    the run in progress if there is one, else the hideout (greyed on the sign with no save)
//   HIDEOUT  the planning table's lever -> the gear-up + swim-out cinematic -> flow.startRun(cfg)
//            -> game.go('dungeon', { cfg }) (agent J's screen; until it exists the v2 'run' screen)
//   RUN      flow.runEnded(result) -> the hideout with the result card; quitting from the pause menu -> hideout
//
// Every function here is stable API: the run screens (J) and the story (G) call into it.
import * as THREE from 'three';
import type { Game, Screen } from './game';
import { RunScreen } from './runScreen';
import { HideoutScreen } from '../hideout/screen';
import { BackpackScreen } from '../backpack/backpack';
import { PixelUI } from '../ui/pixel/ui';
import { META, saveMeta, type RunConfig, type RunResult } from '../meta/meta';
import { MASTERY } from '../hideout/mastery';
import { ITEMS } from './items';
import { audio } from '../audio/audio';
import { POST } from '../gfx/post';
import { IntroScreen } from '../story/intro';
import { WelcomeHome } from '../story/welcome';
import { TitleScreen } from '../title/screen';
import { installCosmetics } from '../cosmetics';
import { CosmeticPuppet } from '../cosmetics/rig';
import { installAchievements, achEvent } from '../achievements';
import type { HideoutHero } from '../hideout/hero';

/**
 * apply META.settings (written by the settings page): audio volumes and the motion blur strength.
 * Low quality is read by the Game at boot (syncLowQuality() before it is built); a change needs a reload.
 */
export function applySettings() {
  const st = META.settings;
  audio.volume.master = st.volume; audio.volume.music = st.music;
  audio.setVolumes();
  // ?mb=0 (tests, captures) keeps motion blur off whatever the save says
  const k = new URLSearchParams(location.search).get('mb') === '0' ? 0 : Math.max(0, st.motionBlur);
  POST.uMotionBlur.value = 2.0 * k;
  POST.uMotionTrail.value = 0.35 * Math.min(1, k);
}
/** before the Game is built: META.settings.lowQuality -> the 'blobfish.lq' flag the Game reads (?lq= wins) */
export function syncLowQuality() {
  if (new URLSearchParams(location.search).get('lq') !== null) return;
  try { localStorage.setItem('blobfish.lq', META.settings.lowQuality ? '1' : '0'); } catch { /* storage blocked */ }
}

/** the prologue has not been seen yet (or ?intro=1 forces it; ?intro=0 skips it) */
export function wantsIntro() {
  const q = new URLSearchParams(location.search).get('intro');
  if (q !== null) return q !== '0';
  return !META.introDone;
}
/** there is something to RESUME: a run in progress, or a hideout to go back to */
export function hasSave() { return !!META.activeRun || META.introDone || META.runs > 0; }

export interface Flow {
  hideout: HideoutScreen; run: RunScreen; intro: IntroScreen; title: TitleScreen;
  /** start a run with this config (abandons the one in progress): the dungeon screen, or the v2 run screen */
  startRun(cfg: RunConfig): void;
  /** continue META.activeRun; false when there is none (or it is from an older version) */
  resume(): boolean;
  /** the title's NEW GAME: the prologue the first time, else the hideout with a fresh run state */
  newGame(): void;
  /** the title's RESUME: the run in progress, else the hideout */
  continueGame(): void;
  /** a run ended (lost / won; META already updated): home to the hideout with the result card */
  runEnded(result: RunResult): void;
  /** back to the title (the hideout's pause card) */
  toTitle(): void;
  /** the dungeon's pause menu QUIT: home through the hatch (the run stays in META.activeRun for RESUME) */
  dungeonQuit(): void;
  /** the prologue finished (skipped = held ESC). META.introDone is already set; reassign to route elsewhere */
  afterIntro: (skipped: boolean) => void;
}

/** agent J's dungeon screen, picked up when its module lands (src/game/dungeonScreen.ts exporting DungeonScreen) */
const DUNGEON = import.meta.glob('./dungeonScreen.ts', { eager: true }) as Record<string, { DungeonScreen?: new (g: Game) => Screen }>;

export function setupFlow(game: Game): Flow {
  // cosmetics hook the gear looks before any blobfish is built; achievements watch runs, META and draw the toast
  installCosmetics();
  installAchievements(game);
  const run = new RunScreen(game);
  const runScreen = () => (game.get('dungeon') ? 'dungeon' : 'run');
  const startRun = (cfg: RunConfig) => {
    // a new run abandons the one in progress (its backpack is lost, like a death without the card)
    if (META.activeRun) { META.activeRun = null; saveMeta(); }
    game.go(runScreen(), { cfg });
  };
  const resume = (): boolean => {
    const s = META.activeRun as (typeof META.activeRun & { v?: number }) | null;
    if (!s) return false;
    // a dungeon save resumes in the dungeon screen; a v2 wave-defense save in the run screen
    const target = s.v === 2 ? 'run' : game.get('dungeon') ? 'dungeon' : null;
    if (!target) { META.activeRun = null; saveMeta(); return false; }
    game.go(target, { resume: s });
    return true;
  };
  const intro = new IntroScreen(game);
  const hideout = new HideoutScreen(game, {
    onEnterRun: startRun,
    onResume: () => { resume(); },
    onPrologue: () => game.go('intro', { replay: true }),
    onMenu: () => game.go('title', { quick: true }),
    hero: () => new CosmeticPuppet() as unknown as HideoutHero,
  });
  // the first trip home after the prologue plays the welcome reveal
  let welcome = false;
  const home = (data: Record<string, unknown> = {}) => {
    game.go('hideout', data);
    if (welcome) { welcome = false; game.openModal('welcome'); }
  };
  const flow: Flow = {
    hideout, run, intro, title: null as unknown as TitleScreen, startRun, resume,
    newGame: () => {
      if (wantsIntro()) { game.go('intro', {}); return; }
      if (META.activeRun) { META.activeRun = null; saveMeta(); }
      home({ arrive: true });
    },
    continueGame: () => { if (!resume()) home({ arrive: true }); },
    runEnded: (r) => { game.go('hideout', { arrive: true }); game.openModal('result', r); },
    toTitle: () => game.go('title', { quick: true }),
    dungeonQuit: () => home({ arrive: true }),
    afterIntro: (skipped) => { welcome = !skipped; home({ arrive: true }); },
  };
  const title = new TitleScreen(game, { onNew: () => flow.newGame(), onResume: () => flow.continueGame(), hasSave });
  flow.title = title;
  game.register(title);
  // the prologue ends -> flow.afterIntro (by default home: the welcome card is the cosy reveal, not after a skip)
  intro.onDone = (skipped) => { META.introDone = true; saveMeta(); if (!skipped) achEvent('prologue'); flow.afterIntro(skipped); };
  // the settings take effect when you leave the title / hideout (and at boot)
  const hideoutExit = hideout.exit.bind(hideout);
  hideout.exit = () => { hideoutExit(); applySettings(); };
  const titleExit = title.exit.bind(title);
  title.exit = () => { titleExit(); applySettings(); };
  applySettings();
  const card = new ResultCard(game, hideout);
  game.register(hideout);
  game.register(run);
  game.register(card);
  game.register(intro);
  game.register(new WelcomeHome(game, hideout));
  if (!game.get('backpack')) game.register(new BackpackScreen(game));
  // the dungeon (J): registered here once its module exists, unless J registers it first
  for (const m of Object.values(DUNGEON)) if (m.DungeonScreen && !game.get('dungeon')) game.register(new m.DungeonScreen(game));
  run.onEnd = (r) => flow.runEnded(r);
  run.onQuit = () => home({ arrive: true });
  Object.assign(window, { flow, META }); // console handles for testing
  return flow;
}

/** the end-of-run card: YOU DIED (what was lost, who did it) / VICTORY (what came home), over the hideout */
class ResultCard implements Screen {
  name = 'result';
  underwater = false;
  ui = new PixelUI({ targetH: 240 });
  r!: RunResult;
  private t = 0;
  constructor(private game: Game, private hideout: HideoutScreen) {}
  get scene(): THREE.Scene { return this.hideout.scene; }
  get camera(): THREE.PerspectiveCamera { return this.hideout.camera; }
  get overlays() { return [...(this.hideout.overlays ?? []), this.ui.layer]; }
  resize(w: number, h: number) { this.ui.resize(w, h, this.game.renderer.getPixelRatio()); this.hideout.resize(w, h); }
  enter(data?: unknown) {
    this.r = data as RunResult;
    this.t = 0;
    this.ui.drawCursor = true;
    this.hideout.ui.drawCursor = false;
    audio.play(this.r.outcome === 'victory' ? 'jin_legend' : 'deflate1', { vol: 0.6, dry: true });
  }
  exit() { this.hideout.ui.drawCursor = true; }
  update(dt: number) {
    this.t += dt;
    const inp = this.game.input, ui = this.ui;
    ui.begin(inp, dt);
    const done = this.draw();
    ui.end();
    // the hideout keeps living underneath, but it gets no clicks or keys while the card is up
    inp.pressed.clear(); inp.released.clear();
    for (const k of [...inp.down]) inp.down.delete(k);
    this.hideout.update(dt);
    if (done) this.game.closeModal();
  }

  private draw(): boolean {
    const ui = this.ui, r = this.r as RunResult & { floor?: number; floors?: number };
    const win = r.outcome === 'victory';
    const w = Math.min(ui.w - 16, 236), h = Math.min(ui.h - 16, 176);
    const x = Math.round((ui.w - w) / 2), y = Math.round((ui.h - h) / 2) + Math.round(Math.max(0, 1 - this.t * 3) * 20);
    ui.fill(0, 0, ui.w, ui.h, '#000000', Math.min(0.55, this.t * 1.5));
    ui.panel(win ? 'wood' : 'stone', x, y, w, h);
    const cx = x + w / 2;
    let yy = y + 10;
    ui.text(win ? 'VICTORY!' : r.outcome === 'sunk' ? 'WRECK LOST' : 'YOU DIED', cx, yy, { font: 'big', color: win ? '#fff6c8' : '#ffd0c8', color2: win ? '#ffb43a' : '#e83a3a', outline: '#1a0604', shadow: '#000', align: 'center' });
    yy += ui.lh('big') + 2;
    const where = r.floor !== undefined
      ? `${(r.areaName ?? '').toUpperCase()} · FLOOR ${r.floor}${r.floors ? '/' + r.floors : ''} · M${r.mastery}`
      : `${(r.areaName ?? '').toUpperCase()} · AREA ${(r.areaIdx ?? 0) + 1}/3 · WAVE ${Math.max(1, r.wave ?? 1)} · M${r.mastery}`;
    ui.text(where, cx, yy, { font: 'small', color: '#f0e4cc', outline: '#140a06', align: 'center' });
    yy += ui.lh('small') + 4;
    // who did it
    if (!win && r.killer) {
      ui.text(r.outcome === 'sunk' ? 'SUNK BY' : 'SLAIN BY', cx, yy, { font: 'small', color: '#ffb0a0', outline: '#140a06', align: 'center' });
      yy += ui.lh('small');
      ui.text(r.killer.name.toUpperCase(), cx, yy, { font: 'title', color: '#ffffff', color2: '#ffd860', outline: '#000', align: 'center' });
      yy += ui.lh('title');
      const sub = [r.killer.title, r.killer.nemesis ? 'now your nemesis' : ''].filter(Boolean).join(' · ');
      if (sub) { ui.text(sub, cx, yy, { font: 'small', color: r.killer.nemesis ? '#ff9a7a' : '#d8ccc0', outline: '#140a06', align: 'center' }); yy += ui.lh('small'); }
      yy += 3;
    }
    if (win && r.unlocked !== undefined) {
      ui.text(`MASTERY ${r.unlocked} UNLOCKED: ${MASTERY[r.unlocked]?.name.toUpperCase() ?? ''}`, cx, yy, { font: 'small', color: '#aaf08a', outline: '#140a06', align: 'center' });
      yy += ui.lh('small') + 3;
    }
    // what was lost / brought home
    const ids = (r.items ?? []).filter((id) => ITEMS[id]);
    const counts: [string, number][] = [];
    for (const id of ids) { const c = counts.find((q) => q[0] === id); if (c) c[1]++; else counts.push([id, 1]); }
    ui.text(win ? 'BROUGHT HOME' : ids.length ? 'LOST AT SEA' : 'NOTHING LOST', x + 12, yy, { font: 'small', color: win ? '#ffe07a' : '#ff9a8a', outline: '#140a06' });
    yy += ui.lh('small') + 1;
    // the items fill the space between here and the tally line (laid out from the bottom up)
    const tallyY = y + h - 26 - ui.lh('small') - 3;
    const cell = 16, cols = Math.floor((w - 24) / cell);
    const rows = Math.max(1, Math.min(3, Math.floor((tallyY - 2 - yy) / cell)));
    const fit = counts.length > cols * rows ? cols * rows - 1 : counts.length;
    counts.slice(0, fit).forEach(([id, n], i) => {
      const ix = x + 12 + (i % cols) * cell, iy = yy + Math.floor(i / cols) * cell;
      ui.item(id, ix, iy, 14, 14, 1, win ? 1 : 0.75);
      if (n > 1) ui.text(String(n), ix + 15, iy + 8, { font: 'small', color: '#ffffff', outline: '#000', align: 'right' });
    });
    if (fit < counts.length) { const i = fit; ui.text(`+${counts.length - fit}`, x + 12 + (i % cols) * cell + 1, yy + Math.floor(i / cols) * cell + 4, { font: 'small', color: '#ffe07a', outline: '#140a06' }); }
    // tally
    const tl = r.tally ?? { kills: 0, waves: 0, extracted: 0, time: 0 };
    const line = `${tl.kills ?? 0} KILLS · ${tl.extracted ?? 0} SENT HOME · ${Math.floor((tl.time ?? 0) / 60)}m${String(Math.floor((tl.time ?? 0) % 60)).padStart(2, '0')}`;
    ui.text(line, cx, tallyY, { font: 'small', color: '#c8bca8', outline: '#140a06', align: 'center' });
    const ok = this.t > 0.8 && ui.button('res:ok', win ? 'HOME SWEET HOME' : 'BACK TO THE HIDEOUT', x + 20, y + h - 26, w - 40, 18, { style: win ? 'gold' : 'wood', key: 'Enter' });
    return ok || (this.t > 0.8 && (this.game.input.keyHit('Escape') || this.game.input.keyHit('Space')));
  }
}
