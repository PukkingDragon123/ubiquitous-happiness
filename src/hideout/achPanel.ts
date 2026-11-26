// ACHIEVEMENTS (v5): the TROPHY CASE: a polished brass frame round a navy velvet back, the medals pinned in rows (a
// progress bar under each), and a brass-edged card for the one under the mouse (or the keyboard selection): the
// medal big, what to do, how far along you are, and the cosmetic it unlocks.
import { PixelUI } from '../ui/pixel/ui';
import { META } from '../meta/meta';
import { ACHIEVEMENTS, progress, isDone } from '../achievements';
import { medal } from '../achievements/medals';
import { cosmeticIcon } from '../cosmetics/icons';
import { COSMETIC, SLOT_NAME } from '../cosmetics';
import { K, brassPlate } from './itemCard';
import { panelArt, PANEL_IN, cushionArt, plateArt, cellArt } from './panelArt';
import { wobble, SeaFx } from './seaFx';
import { panelLife } from './panels';

const COLS = 8, CW = 38, CH = 56, DW = 160;
const ROWS = Math.ceil(ACHIEVEMENTS.length / COLS);
export const ACH_W = PANEL_IN.trophy[0] + PANEL_IN.trophy[2] + COLS * CW + 8 + DW;
export const ACH_H = PANEL_IN.trophy[1] + PANEL_IN.trophy[3] + ROWS * CH + 28;

export class AchievementsPanel {
  private sel = 0;
  private t = 0;
  private fx = new SeaFx();
  open() { this.t = 0; }
  draw(ui: PixelUI, x: number, y: number, dt: number): boolean {
    this.t += dt;
    const inp = ui.input;
    y += wobble(this.t);
    ui.block(x, y - 10, ACH_W, ACH_H + 10);
    ui.fill(x + 4, y + 5, ACH_W, ACH_H, '#000000', 0.4);
    ui.img(panelArt('trophy', ACH_W, ACH_H), x, y);
    brassPlate(ui, 'TROPHY CASE', x + ACH_W / 2, y - 9, { font: 'title' });
    let close = ui.closeButton('ach:x', x + ACH_W - 16, y - 6, { size: 20, key: null });
    const [il, it] = PANEL_IN.trophy;
    const done = META.achievements.unlocked.length;
    // the tally along the top rail
    // (v7: clear of the kelp that hangs over the frame's top-left corner)
    ui.text(`${done}/${ACHIEVEMENTS.length} EARNED`, x + il + 18, y + 8, { font: 'small', color: '#3a2008', shadow: '#f8dc90' });
    ui.bar(x + il + 22 + ui.measure(`${done}/${ACHIEVEMENTS.length} EARNED`, 'small'), y + 9, 90, 5, Math.min(1, done / ACHIEVEMENTS.length), '#f0c040');
    if (inp?.keyHit('ArrowRight')) this.sel = (this.sel + 1) % ACHIEVEMENTS.length;
    if (inp?.keyHit('ArrowLeft')) this.sel = (this.sel + ACHIEVEMENTS.length - 1) % ACHIEVEMENTS.length;
    if (inp?.keyHit('ArrowDown')) this.sel = Math.min(ACHIEVEMENTS.length - 1, this.sel + COLS);
    if (inp?.keyHit('ArrowUp')) this.sel = Math.max(0, this.sel - COLS);
    // ---- the medals, pinned to the velvet
    const gx = x + il + 2, gy = y + it + 4;
    ACHIEVEMENTS.forEach((a, i) => {
      const cx = gx + (i % COLS) * CW, cy = gy + Math.floor(i / COLS) * CH;
      const got = isDone(a.id), p = progress(a);
      const over = ui.hover(cx, cy, CW - 2, CH - 2);
      ui.mark('ach:' + a.id, cx, cy, CW - 2, CH - 2);
      if (over) { this.sel = i; ui.cursor = 'point'; }
      const on = this.sel === i;
      // a velvet cushion per medal with a brass hook at its top (brass-framed when selected)
      ui.img(cushionArt(CW - 2, CH - 2, on ? 'on' : over ? 'hover' : 'off'), cx, cy);
      const bob = got && on ? Math.round(Math.sin(this.t * 5) * 1) : 0;
      ui.img(medal(a.emblem, a.tier, !got), cx + Math.round((CW - 2 - 28) / 2), cy + 4 + bob);
      if (got && Math.sin(this.t * 2.5 + i * 1.3) > 0.85) { ui.fill(cx + 12, cy + 15, 1, 3, '#ffffff'); ui.fill(cx + 11, cy + 16, 3, 1, '#ffffff'); }
      ui.bar(cx + 4, cy + 38, CW - 10, 4, got ? 1 : p / a.goal, got ? '#f0c040' : '#5ac8ff');
      let label = got ? 'DONE' : `${p}/${a.goal}`;
      if (ui.measure(label, 'small') > CW - 4) label = `${Math.floor((p / a.goal) * 100)}%`;
      ui.text(label, cx + (CW - 2) / 2, cy + 44, { font: 'small', color: got ? K.brass2 : '#9aa4cc', shadow: '#0c0f26', align: 'center' });
      ui.block(cx, cy, CW - 2, CH - 2);
    });
    // ---- the card: a brass-edged plate on the velvet
    const a = ACHIEVEMENTS[this.sel], got = isDone(a.id), p = progress(a);
    const dx = gx + COLS * CW + 6, dy = gy, dw = DW - 4, dh = ROWS * CH - 2;
    ui.fill(dx + 2, dy + 2, dw, dh, '#000000', 0.35);
    ui.img(plateArt(dw, dh), dx, dy);
    ui.img(medal(a.emblem, a.tier, !got), dx + 6, dy + 6);
    let ty = dy + 6;
    ty += ui.textBox(a.name.toUpperCase(), dx + 38, ty, dw - 42, { font: 'body', color: got ? K.brass2 : K.cream, shadow: '#000' });
    ui.text(a.tier.toUpperCase(), dx + 38, ty + 1, { font: 'small', color: a.tier === 'gold' ? '#f0c040' : a.tier === 'silver' ? '#c4ccda' : '#e0905a' });
    ty = Math.max(ty + ui.lh('small') + 3, dy + 42);
    ty += ui.textBox(a.desc, dx + 7, ty, dw - 14, { font: 'body', color: '#ffffff', shadow: '#000' }) + 4;
    ui.bar(dx + 7, ty, dw - 14, 6, got ? 1 : p / a.goal, got ? '#f0c040' : '#5ac8ff');
    ui.text(got ? `UNLOCKED ${new Date(META.achievements.at[a.id] ?? Date.now()).toLocaleDateString()}` : `${p} / ${a.goal}`, dx + dw / 2, ty + 9, { font: 'small', color: got ? K.brass2 : '#c8d8ff', align: 'center' });
    // the reward
    const c = COSMETIC[a.reward];
    const ry = dy + dh - 40;
    ui.fill(dx + 7, ry - 4, dw - 14, 1, '#0d1430'); ui.fill(dx + 7, ry - 3, dw - 14, 1, '#3e4c84');
    ui.text('REWARD', dx + 7, ry, { font: 'small', color: K.brass2 });
    if (c) ui.text(SLOT_NAME[c.slot], dx + dw - 7, ry, { font: 'small', color: '#8a94b0', align: 'right' });
    ui.img(cellArt(26, got ? 'on' : 'off'), dx + 7, ry + 11);
    ui.img(cosmeticIcon(a.reward, 22), dx + 9, ry + 13, { w: 22, h: 22, alpha: got ? 1 : 0.4 });
    if (c) ui.textBox(c.name.toUpperCase(), dx + 38, ry + 14, dw - 44, { font: 'small', color: got ? '#ffffff' : '#a8a0b0' });
    // the bottom rail: browse keys and BACK
    const by = y + ACH_H - PANEL_IN.trophy[3] - 22;
    let hx = gx;
    hx += ui.icon('left', hx, by + 7) + 2; hx += ui.icon('right', hx, by + 7) + 5;
    ui.text('browse', hx, by + 6, { font: 'small', color: '#c8d8ff', shadow: '#000' });
    panelLife(ui, this.fx, { x, y, w: ACH_W, h: ACH_H }, { x: gx, y: gy, w: COLS * CW, h: ROWS * CH }, 9, dt);
    if (ui.button('ach:back', 'BACK', x + ACH_W - PANEL_IN.trophy[2] - 84, by, 82, 20, { style: 'dark', key: 'Escape', keyLabel: 'ESC', sfx: '' })) close = true;
    return close;
  }
}
