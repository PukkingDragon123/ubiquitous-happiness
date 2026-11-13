// v2 flow: HIDEOUT (hub + main menu) -> RUN (three areas of wave defense) -> back to the HIDEOUT with a result card.
//
//   setupFlow(game); game.go('hideout');
//
// The hideout's TV starts a run (onEnterRun(cfg) after the gear-up cinematic) or resumes META.activeRun
// (onResume). The run screen calls onEnd(result) when it is lost / won (META already updated) or onQuit() from
// the pause menu (the run stays in META.activeRun). The result card is a modal over the live hideout.
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

export interface Flow { hideout: HideoutScreen; run: RunScreen; startRun(cfg: RunConfig): void; resume(): boolean }

export function setupFlow(game: Game): Flow {
  const run = new RunScreen(game);
  const startRun = (cfg: RunConfig) => {
    // a new run abandons the one in progress (its backpack and bag are lost, like a death without the card)
    if (META.activeRun) { META.activeRun = null; saveMeta(); }
    game.go('run', { cfg });
  };
  const resume = (): boolean => {
    const s = META.activeRun;
    if (!s || s.v !== 2) { META.activeRun = null; saveMeta(); return false; }
    game.go('run', { resume: s });
    return true;
  };
  const hideout = new HideoutScreen(game, { onEnterRun: startRun, onResume: () => { resume(); } });
  const card = new ResultCard(game, hideout);
  game.register(hideout);
  game.register(run);
  game.register(card);
  if (!game.get('backpack')) game.register(new BackpackScreen(game));
  run.onEnd = (r) => { game.go('hideout', {}); game.openModal('result', r); };
  run.onQuit = () => { game.go('hideout', {}); };
  return { hideout, run, startRun, resume };
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
    inp.down.delete('Mouse0'); inp.down.delete('Mouse2');
    this.hideout.update(dt);
    if (done) this.game.closeModal();
  }

  private draw(): boolean {
    const ui = this.ui, r = this.r;
    const win = r.outcome === 'victory';
    const w = Math.min(ui.w - 16, 236), h = Math.min(ui.h - 16, 176);
    const x = Math.round((ui.w - w) / 2), y = Math.round((ui.h - h) / 2) + Math.round(Math.max(0, 1 - this.t * 3) * 20);
    ui.fill(0, 0, ui.w, ui.h, '#000000', Math.min(0.55, this.t * 1.5));
    ui.panel(win ? 'wood' : 'stone', x, y, w, h);
    const cx = x + w / 2;
    let yy = y + 10;
    ui.text(win ? 'VICTORY!' : r.outcome === 'sunk' ? 'WRECK LOST' : 'YOU DIED', cx, yy, { font: 'big', color: win ? '#fff6c8' : '#ffd0c8', color2: win ? '#ffb43a' : '#e83a3a', outline: '#1a0604', shadow: '#000', align: 'center' });
    yy += ui.lh('big') + 2;
    const where = `${r.areaName.toUpperCase()} · AREA ${r.areaIdx + 1}/3 · WAVE ${Math.max(1, r.wave)} · M${r.mastery}`;
    ui.text(where, cx, yy, { font: 'small', color: win ? '#3a2408' : '#e8e0d8', align: 'center' });
    yy += ui.lh('small') + 4;
    // who did it
    if (!win && r.killer) {
      ui.text('SLAIN BY', cx, yy, { font: 'small', color: '#ffb0a0', align: 'center' });
      yy += ui.lh('small');
      ui.text(r.killer.name.toUpperCase(), cx, yy, { font: 'title', color: '#ffffff', color2: '#ffd860', outline: '#000', align: 'center' });
      yy += ui.lh('title');
      const sub = [r.killer.title, r.killer.nemesis ? 'now your nemesis' : ''].filter(Boolean).join(' · ');
      if (sub) { ui.text(sub, cx, yy, { font: 'small', color: r.killer.nemesis ? '#ff9a7a' : '#c8b8a8', align: 'center' }); yy += ui.lh('small'); }
      yy += 3;
    }
    if (win && r.unlocked !== undefined) {
      ui.text(`MASTERY ${r.unlocked} UNLOCKED: ${MASTERY[r.unlocked]?.name.toUpperCase() ?? ''}`, cx, yy, { font: 'small', color: '#2a6a1a', align: 'center' });
      yy += ui.lh('small') + 3;
    }
    // what was lost / brought home
    const ids = r.items.filter((id) => ITEMS[id]);
    const counts: [string, number][] = [];
    for (const id of ids) { const c = counts.find((q) => q[0] === id); if (c) c[1]++; else counts.push([id, 1]); }
    ui.text(win ? 'BROUGHT HOME' : ids.length ? 'LOST AT SEA' : 'NOTHING LOST', x + 12, yy, { font: 'small', color: win ? '#3a2408' : '#ff9a8a' });
    yy += ui.lh('small') + 1;
    const cell = 16, cols = Math.floor((w - 24) / cell);
    counts.slice(0, cols * 2).forEach(([id, n], i) => {
      const ix = x + 12 + (i % cols) * cell, iy = yy + Math.floor(i / cols) * cell;
      ui.item(id, ix, iy, 14, 14, 1, win ? 1 : 0.75);
      if (n > 1) ui.text(String(n), ix + 15, iy + 8, { font: 'small', color: '#ffffff', outline: '#000', align: 'right' });
    });
    if (counts.length > cols * 2) ui.text(`+${counts.length - cols * 2} more`, x + w - 12, yy + cell * 2, { font: 'small', color: '#c8b8a8', align: 'right' });
    yy += Math.min(2, Math.ceil(counts.length / cols)) * cell + 4;
    // tally
    const tl = r.tally;
    const line = `${tl.kills} KILLS · ${tl.waves} WAVES · ${tl.extracted} SENT HOME · ${Math.floor(tl.time / 60)}m${String(Math.floor(tl.time % 60)).padStart(2, '0')}`;
    ui.text(line, cx, Math.min(yy, y + h - 34), { font: 'small', color: win ? '#5a3a18' : '#a8a0a0', align: 'center' });
    const ok = this.t > 0.8 && ui.button('res:ok', win ? 'HOME SWEET HOME' : 'BACK TO THE HIDEOUT', x + 20, y + h - 26, w - 40, 18, { style: win ? 'gold' : 'wood', key: 'Enter' });
    return ok || (this.t > 0.8 && (this.game.input.keyHit('Escape') || this.game.input.keyHit('Space')));
  }
}
