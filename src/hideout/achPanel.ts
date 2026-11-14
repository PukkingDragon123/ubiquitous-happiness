// ACHIEVEMENTS: a pixel grid of medals with progress bars, and a detail card for the one under the mouse (or the
// keyboard selection): the medal big, what to do, how far along you are, and the cosmetic it unlocks.
import { PixelUI } from '../ui/pixel/ui';
import { META } from '../meta/meta';
import { ACHIEVEMENTS, progress, isDone } from '../achievements';
import { medal } from '../achievements/medals';
import { cosmeticIcon } from '../cosmetics/icons';
import { COSMETIC, SLOT_NAME } from '../cosmetics';

const COLS = 8, CW = 34, CH = 50;
export const ACH_W = COLS * CW + 14 + 126, ACH_H = 3 * CH + 52;

export class AchievementsPanel {
  private sel = 0;
  private t = 0;
  open() { this.t = 0; }
  draw(ui: PixelUI, x: number, y: number, dt: number): boolean {
    this.t += dt;
    const inp = ui.input;
    ui.panel('dark', x, y, ACH_W, ACH_H, undefined, { alpha: 0.93 });
    ui.fill(x + 4, y + 4, ACH_W - 8, 15, '#1a0c08', 0.9); ui.fill(x + 4, y + 18, ACH_W - 8, 1, '#f0c040');
    ui.text('ACHIEVEMENTS', x + 9, y + 8, { font: 'title', color: '#fff4dc', color2: '#ffd27a', shadow: '#000' });
    const done = META.achievements.unlocked.length;
    const hx = x + 16 + ui.measure('ACHIEVEMENTS', 'title');
    ui.text(`${done}/${ACHIEVEMENTS.length}`, hx, y + 9, { font: 'small', color: '#ffd27a' });
    ui.bar(hx + 28, y + 10, 90, 5, done / ACHIEVEMENTS.length, '#f0c040');
    let close = ui.iconButton('ach:x', 'close', x + ACH_W - 22, y + 4, { style: 'red', size: 13, key: 'Escape', keyLabel: '' });
    if (inp?.keyHit('ArrowRight')) this.sel = (this.sel + 1) % ACHIEVEMENTS.length;
    if (inp?.keyHit('ArrowLeft')) this.sel = (this.sel + ACHIEVEMENTS.length - 1) % ACHIEVEMENTS.length;
    if (inp?.keyHit('ArrowDown')) this.sel = Math.min(ACHIEVEMENTS.length - 1, this.sel + COLS);
    if (inp?.keyHit('ArrowUp')) this.sel = Math.max(0, this.sel - COLS);
    // ---- the grid
    const gx = x + 7, gy = y + 24;
    ACHIEVEMENTS.forEach((a, i) => {
      const cx = gx + (i % COLS) * CW, cy = gy + Math.floor(i / COLS) * CH;
      const got = isDone(a.id), p = progress(a);
      const over = ui.hover(cx, cy, CW - 2, CH - 2);
      ui.mark('ach:' + a.id, cx, cy, CW - 2, CH - 2);
      if (over) { this.sel = i; ui.cursor = 'point'; }
      const on = this.sel === i;
      ui.frame(on ? 'cardSel' : 'dark', cx, cy, CW - 2, CH - 2);
      const bob = got && on ? Math.round(Math.sin(this.t * 5) * 1) : 0;
      ui.img(medal(a.emblem, a.tier, !got), cx + 2, cy + 2 + bob);
      if (got && Math.sin(this.t * 2.5 + i * 1.3) > 0.85) { ui.fill(cx + 9, cy + 13, 1, 3, '#ffffff'); ui.fill(cx + 8, cy + 14, 3, 1, '#ffffff'); }
      // progress bar (full + gold once done)
      ui.bar(cx + 3, cy + 37, CW - 8, 4, got ? 1 : p / a.goal, got ? '#f0c040' : '#5ac8ff');
      let label = got ? 'DONE' : `${p}/${a.goal}`;
      if (ui.measure(label, 'small') > CW - 4) label = `${Math.floor((p / a.goal) * 100)}%`;
      ui.text(label, cx + (CW - 2) / 2, cy + 41, { font: 'small', color: got ? '#ffd27a' : '#8a94b0', align: 'center' });
      ui.block(cx, cy, CW - 2, CH - 2);
    });
    // ---- the detail card
    const a = ACHIEVEMENTS[this.sel], got = isDone(a.id), p = progress(a);
    const dx = x + 7 + COLS * CW + 2, dy = y + 24, dw = 118, dh = 3 * CH - 2;
    ui.frame('dark', dx, dy, dw, dh);
    ui.img(medal(a.emblem, a.tier, !got), dx + 5, dy + 5);
    let ty = dy + 6;
    ty += ui.textBox(a.name.toUpperCase(), dx + 36, ty, dw - 40, { font: 'body', color: got ? '#ffd27a' : '#e8e0d0', shadow: '#000' });
    ui.text(a.tier.toUpperCase(), dx + 36, ty + 1, { font: 'small', color: a.tier === 'gold' ? '#f0c040' : a.tier === 'silver' ? '#c4ccda' : '#e0905a' });
    ty = Math.max(ty + 12, dy + 40);
    ty += ui.textBox(a.desc, dx + 6, ty, dw - 12, { font: 'small', color: '#ffffff' }) + 3;
    ui.bar(dx + 6, ty, dw - 12, 6, got ? 1 : p / a.goal, got ? '#f0c040' : '#5ac8ff');
    ui.text(got ? `UNLOCKED ${new Date(META.achievements.at[a.id] ?? Date.now()).toLocaleDateString()}` : `${p} / ${a.goal}`, dx + dw / 2, ty + 9, { font: 'small', color: got ? '#ffd27a' : '#c8d8ff', align: 'center' });
    // the reward
    const c = COSMETIC[a.reward];
    const ry = dy + dh - 34;
    ui.fill(dx + 4, ry - 4, dw - 8, 1, '#3a3442');
    ui.text('REWARD', dx + 6, ry, { font: 'small', color: '#ffd27a' });
    ui.frame(got ? 'cardSel' : 'slot', dx + 6, ry + 9, 22, 22);
    ui.img(cosmeticIcon(a.reward), dx + 7, ry + 10, { alpha: got ? 1 : 0.4 });
    if (c) {
      ui.text(SLOT_NAME[c.slot], dx + dw - 6, ry, { font: 'small', color: '#8a94b0', align: 'right' });
      ui.textBox(c.name.toUpperCase(), dx + 32, ry + 10, dw - 36, { font: 'small', color: got ? '#ffffff' : '#a8a0b0' });
    }
    if (ui.button('ach:back', 'BACK', x + ACH_W - 66, y + ACH_H - 24, 58, 18, { style: 'dark' })) close = true;
    ui.icon('left', x + 11, y + ACH_H - 19); ui.icon('right', x + 19, y + ACH_H - 19);
    ui.text('browse', x + 28, y + ACH_H - 18, { font: 'small', color: '#c8d8ff', shadow: '#000' });
    return close;
  }
}
