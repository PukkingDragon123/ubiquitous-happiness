// The RUN SUMMARY card (v4): the end of every journey in one look. A stamped result (EXTRACTED / SURFACED / LOST),
// how far and how deep you went, what you fought, and the loot that made it home laid out as icons.
//
//   const card = new RunSummaryCard({ result: 'extracted', depth: 182, distance: 940, time: 412, floors: 3,
//                                     kills: { fish: 31, giants: 2 }, loot: ['amethyst', 'giantClam'], pearls: 37, record: true });
//   each frame inside ui.begin()/end():  if (card.draw(ui, dt) === 'continue') goHome();
//
// CONTINUE is the only exit: its button, Enter, Space, Esc or a click anywhere once the stats have landed.
import type { PixelUI } from './pixel/ui';
import { ITEMS, RARITY_COLOR, getItem } from '../game/items';
import { audio } from '../audio/audio';

export interface RunSummary {
  result: 'extracted' | 'surfaced' | 'lost' | 'quit';
  /** deepest metre reached */
  depth: number;
  /** metres travelled away from home (the journey) */
  distance?: number;
  /** seconds */
  time?: number;
  floors?: number;
  kills?: { fish: number; giants: number };
  /** item ids that made it home (sent by post or carried up) */
  loot?: string[];
  pearls?: number;
  /** a new depth / distance record */
  record?: boolean;
  /** what ended it ("Reeled in by the Fisherman") */
  cause?: string;
}

const RESULT: Record<RunSummary['result'], [string, string, string]> = {
  extracted: ['EXTRACTED', '#7af07a', '#1a5a1a'],
  surfaced: ['SURFACED', '#8ae0ff', '#0a3a5a'],
  lost: ['LOST AT SEA', '#ff6a5a', '#5a0a0a'],
  quit: ['ABANDONED', '#e8d8b0', '#4a3a1a'],
};

export class RunSummaryCard {
  t = 0;
  private landed = 0;
  constructor(public s: RunSummary) {}

  /** draw the card; returns 'continue' on the frame the player dismisses it */
  draw(ui: PixelUI, dt: number): 'continue' | null {
    this.t += dt;
    const s = this.s, t = this.t;
    const W = Math.min(ui.w - 24, 300), H = Math.min(ui.h - 24, 252);
    const x = Math.round((ui.w - W) / 2), y = Math.round((ui.h - H) / 2) + Math.round((1 - Math.min(1, t * 4)) ** 3 * 60);
    ui.fill(0, 0, ui.w, ui.h, '#02060c', Math.min(0.6, t * 2));
    ui.block(0, 0, ui.w, ui.h);
    ui.frame('paper', x, y, W, H);
    // the result stamp: slams in (big, rotated feel via a 1 px offset echo), ink colour per result
    const [word, col, ink] = RESULT[s.result];
    const st = Math.min(1, Math.max(0, (t - 0.25) / 0.18));
    if (st > 0) {
      if (this.landed === 0) { this.landed = 1; audio.play('thud_heavy1', { vol: 0.4, dry: true }); }
      const sw = ui.measure(word, 'big') + 16, sx = x + Math.round((W - sw) / 2), sy = y + 12;
      ui.rect(sx, sy, sw, ui.cap('big') + 12, ink); ui.rect(sx + 1, sy + 1, sw - 2, ui.cap('big') + 10, ink);
      ui.text(word, x + W / 2 + 1, sy + 7, { font: 'big', color: ink, shadow: null, align: 'center', alpha: st });
      ui.text(word, x + W / 2, sy + 6, { font: 'big', color: col, color2: ink, outline: ink, align: 'center', alpha: st });
    }
    let yy = y + 26 + ui.cap('big');
    if (s.cause) { ui.text(s.cause, x + W / 2, yy, { font: 'small', color: '#7a4a2a', shadow: null, align: 'center' }); yy += 12; }
    if (s.record) { const a = 0.6 + 0.4 * Math.sin(t * 6); ui.text('NEW RECORD!', x + W / 2, yy, { font: 'body', color: '#c8501a', shadow: null, align: 'center', alpha: a }); yy += 14; }
    yy += 4;
    // stat rows, ticking in one by one
    const rows: [string, string][] = [['DEEPEST', `-${Math.round(s.depth)} m`]];
    if (s.distance !== undefined) rows.push(['TRAVELLED', `${Math.round(s.distance)} m from home`]);
    if (s.floors !== undefined) rows.push(['FLOORS', String(s.floors)]);
    if (s.time !== undefined) rows.push(['TIME', `${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`]);
    if (s.kills) rows.push(['FISH BEATEN', String(s.kills.fish)], ['GIANTS BEATEN', String(s.kills.giants)]);
    if (s.pearls !== undefined) rows.push(['PEARLS', String(s.pearls)]);
    rows.forEach(([k, v], i) => {
      const a = Math.min(1, Math.max(0, (t - 0.5 - i * 0.08) * 6));
      if (a <= 0) return;
      ui.text(k, x + 18, yy, { font: 'small', color: '#7a5a3a', shadow: null, alpha: a });
      ui.text(v, x + W - 18, yy - 1, { font: 'body', color: '#2a1408', shadow: null, align: 'right', alpha: a });
      for (let dx = x + 18 + ui.measure(k, 'small') + 4; dx < x + W - 22 - ui.measure(v, 'body'); dx += 3) ui.fill(dx, yy + 5, 1, 1, '#b89a70');
      yy += 13;
    });
    // the loot that made it home
    const loot = (s.loot ?? []).filter((id) => ITEMS[id]);
    yy += 4;
    ui.text(loot.length ? 'BROUGHT HOME' : 'NOTHING MADE IT HOME', x + 18, yy, { font: 'small', color: '#7a5a3a', shadow: null });
    yy += 12;
    const ic = 22, per = Math.max(1, Math.floor((W - 36) / (ic + 3)));
    loot.slice(0, per * 2).forEach((id, i) => {
      const a = Math.min(1, Math.max(0, (t - 0.9 - i * 0.05) * 5));
      if (a <= 0) return;
      const lx = x + 18 + (i % per) * (ic + 3), ly = yy + Math.floor(i / per) * (ic + 3);
      ui.fill(lx, ly, ic, ic, '#e8d4a8'); ui.rect(lx, ly, ic, ic, RARITY_COLOR[getItem(id).rarity]);
      ui.item(id, lx + 2, ly + 2, ic - 4, ic - 4, 1, a);
    });
    if (loot.length > per * 2) ui.text(`+${loot.length - per * 2}`, x + W - 18, yy + ic + 6, { font: 'small', color: '#5a3a1c', shadow: null, align: 'right' });
    // continue
    const ready = t > 1.0;
    const bw = 110, bx = x + Math.round((W - bw) / 2), by = y + H - 26;
    const go = ui.button('runsum:continue', 'CONTINUE', bx, by, bw, 18, { style: 'green', key: 'Enter', disabled: !ready });
    if (ready && (go || ui.input?.keyHit('Space') || ui.input?.keyHit('Escape') || (ui.pressed && !ui.hover(x, y, W, H)))) return 'continue';
    return null;
  }
}
