// ACHIEVEMENTS (v8b kit): the TROPHY CASE: the kit's main panel, the medals in a grid of slots (a progress bar under
// each), and a sub panel for the one under the mouse (or the keyboard selection): the medal, what to do, how far
// along you are, and the cosmetic it unlocks.
import { PixelUI } from '../ui/pixel/ui';
import { META } from '../meta/meta';
import { ACHIEVEMENTS, progress, isDone } from '../achievements';
import { medal } from '../achievements/medals';
import { cosmeticIcon } from '../cosmetics/icons';
import { COSMETIC, SLOT_NAME } from '../cosmetics';
import { PANEL_IN, cushionArt, plateArt, cellArt } from './panelArt';
import { C, sectionHead } from '../ui/pixel/skins';

const COLS = 8, CW = 38, CH = 56, DW = 160;
const ROWS = Math.ceil(ACHIEVEMENTS.length / COLS);
export const ACH_W = PANEL_IN.trophy[0] + PANEL_IN.trophy[2] + COLS * CW + 8 + DW;
export const ACH_H = PANEL_IN.trophy[1] + PANEL_IN.trophy[3] + ROWS * CH + 28;

export class AchievementsPanel {
  private sel = 0;
  private t = 0;
  open() { this.t = 0; }
  draw(ui: PixelUI, x: number, y: number, dt: number): boolean {
    this.t += dt;
    const inp = ui.input;
    ui.panel('wood', x, y, ACH_W, ACH_H, 'TROPHY CASE', { id: 'home:trophy' });
    let close = ui.closeButton('ach:x', x + ACH_W - 24, y + 8, { size: 15, key: null });
    const [il, it] = PANEL_IN.trophy;
    const done = META.achievements.unlocked.length;
    // the tally, top left
    const tl = `${done}/${ACHIEVEMENTS.length} EARNED`;
    ui.text(tl, x + il + 2, y + 9, { font: 'small', color: C.dim, shadow: null });
    ui.bar(x + il + 8 + ui.measure(tl, 'small'), y + 10, 56, 5, Math.min(1, done / ACHIEVEMENTS.length), C.gold);
    if (inp?.keyHit('ArrowRight')) this.sel = (this.sel + 1) % ACHIEVEMENTS.length;
    if (inp?.keyHit('ArrowLeft')) this.sel = (this.sel + ACHIEVEMENTS.length - 1) % ACHIEVEMENTS.length;
    if (inp?.keyHit('ArrowDown')) this.sel = Math.min(ACHIEVEMENTS.length - 1, this.sel + COLS);
    if (inp?.keyHit('ArrowUp')) this.sel = Math.max(0, this.sel - COLS);
    // ---- the medals, pinned to the velvet
    const gx = x + il + 2, gy = y + it + 8;
    ACHIEVEMENTS.forEach((a, i) => {
      const cx = gx + (i % COLS) * CW, cy = gy + Math.floor(i / COLS) * CH;
      const got = isDone(a.id), p = progress(a);
      const over = ui.hover(cx, cy, CW - 2, CH - 2);
      ui.mark('ach:' + a.id, cx, cy, CW - 2, CH - 2);
      if (over) { this.sel = i; ui.cursor = 'point'; }
      const on = this.sel === i;
      // a slot per medal (gold-bordered when selected)
      ui.img(cushionArt(CW - 2, CH - 2, on ? 'on' : over ? 'hover' : 'off'), cx, cy);
      ui.img(medal(a.emblem, a.tier, !got), cx + Math.round((CW - 2 - 28) / 2), cy + 4 - (on ? 1 : 0), { alpha: got ? 1 : 0.55 });
      ui.bar(cx + 4, cy + 37, CW - 10, 3, got ? 1 : p / a.goal, got ? C.gold : C.steel);
      let label = got ? 'DONE' : `${p}/${a.goal}`;
      if (ui.measure(label, 'small') > CW - 4) label = `${Math.floor((p / a.goal) * 100)}%`;
      ui.text(label, cx + (CW - 2) / 2, cy + 43, { font: 'small', color: got ? C.gold : C.faint, shadow: null, align: 'center' });
      ui.block(cx, cy, CW - 2, CH - 2);
    });
    // ---- the card: a sub panel
    const a = ACHIEVEMENTS[this.sel], got = isDone(a.id), p = progress(a);
    const dx = gx + COLS * CW + 6, dy = gy, dw = DW - 4, dh = ROWS * CH - 2;
    ui.img(plateArt(dw, dh), dx, dy);
    ui.img(medal(a.emblem, a.tier, !got), dx + 8, dy + 8, { alpha: got ? 1 : 0.55 });
    let ty = dy + 9;
    ty += ui.textBox(a.name.toUpperCase(), dx + 42, ty, dw - 48, { font: 'body', color: got ? C.gold : C.bone2, shadow: C.ink });
    ui.text(a.tier.toUpperCase(), dx + 42, ty + 1, { font: 'small', color: C.dim, shadow: null });
    ty = Math.max(ty + ui.lh('small') + 4, dy + 44);
    ty += ui.textBox(a.desc, dx + 9, ty, dw - 18, { font: 'body', color: C.bone, shadow: C.ink }) + 6;
    ui.bar(dx + 9, ty, dw - 18, 5, got ? 1 : p / a.goal, got ? C.gold : C.steel);
    ui.text(got ? `UNLOCKED ${new Date(META.achievements.at[a.id] ?? Date.now()).toLocaleDateString()}` : `${p} / ${a.goal}`, dx + 9, ty + 10, { font: 'small', color: got ? C.gold : C.dim, shadow: null });
    // the reward
    const c = COSMETIC[a.reward];
    const ry = dy + dh - 44;
    sectionHead(ui, 'REWARD', dx + 9, ry, dw - 18);
    if (c) ui.text(SLOT_NAME[c.slot], dx + dw - 9, ry + 12, { font: 'small', color: C.faint, shadow: null, align: 'right' });
    ui.img(cellArt(26, got ? 'on' : 'off'), dx + 9, ry + 13);
    ui.img(cosmeticIcon(a.reward, 22), dx + 11, ry + 15, { w: 22, h: 22, alpha: got ? 1 : 0.4 });
    if (c) ui.textBox(c.name.toUpperCase(), dx + 42, ry + 24, dw - 48, { font: 'small', color: got ? C.bone : C.dim, shadow: null });
    // the bottom rail: browse keys and BACK
    const by = y + ACH_H - PANEL_IN.trophy[3] - 22;
    let hx = gx;
    hx += ui.icon('left', hx, by + 7) + 2; hx += ui.icon('right', hx, by + 7) + 5;
    ui.text('browse', hx, by + 6, { font: 'small', color: C.dim, shadow: null });
    void dt;
    if (ui.button('ach:back', 'BACK', x + ACH_W - PANEL_IN.trophy[2] - 84, by, 82, 20, { style: 'dark', key: 'Escape', keyLabel: 'ESC', sfx: '' })) close = true;
    return close;
  }
}
