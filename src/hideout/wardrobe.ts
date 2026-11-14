// WARDROBE: a pixel panel per cosmetic slot (hat, skin, sword, scarf, trail) beside a turntable close-up of the
// blobfish. Hover an item to try it on (locked ones too: the hero wears it as a preview), click an owned one to
// equip it (the hero does a little gear-up hop). Locked items show the achievement that unlocks them.
import { PixelUI, type TipLine } from '../ui/pixel/ui';
import { SLOTS, SLOT_NAME, bySlot, owned, equippedLook, equip, COSMETIC, type Slot } from '../cosmetics';
import { cosmeticIcon } from '../cosmetics/icons';
import { achFor, progress } from '../achievements';
import { audio } from '../audio/audio';

export const WARD_W = 262;
const CELL = 23;

export class WardrobePanel {
  /** the item under the mouse (try-on) */
  hover: string | null = null;
  /** an item was equipped this frame */
  equipped: string | null = null;
  private t = 0;
  open() { this.t = 0; this.hover = null; }
  /** returns true to close */
  draw(ui: PixelUI, x: number, y: number, dt: number): boolean {
    this.t += dt;
    this.hover = null; this.equipped = null;
    const look = equippedLook();
    const rowH = 38, H = 24 + SLOTS.length * rowH + 28;
    ui.panel('dark', x, y, WARD_W, H, undefined, { alpha: 0.93 });
    ui.fill(x + 4, y + 4, WARD_W - 8, 15, '#1a0c08', 0.9); ui.fill(x + 4, y + 18, WARD_W - 8, 1, '#f0c040');
    ui.text('WARDROBE', x + 9, y + 8, { font: 'title', color: '#fff4dc', color2: '#ffd27a', shadow: '#000' });
    const n = SLOTS.reduce((a, s) => a + bySlot(s).filter((c) => owned(c.id)).length, 0), tot = SLOTS.reduce((a, s) => a + bySlot(s).length, 0);
    ui.text(`${n}/${tot} OWNED`, x + WARD_W - 26, y + 9, { font: 'small', color: '#8a94b0', align: 'right' });
    let close = ui.iconButton('ward:x', 'close', x + WARD_W - 22, y + 4, { style: 'red', size: 13, key: 'Escape', keyLabel: '' });
    SLOTS.forEach((slot: Slot, si) => {
      const ry = y + 24 + si * rowH;
      ui.frame('dark', x + 5, ry, WARD_W - 10, rowH - 3, 0.85);
      ui.text(SLOT_NAME[slot], x + 11, ry + 4, { font: 'small', color: '#ffd27a' });
      const cur = COSMETIC[look[slot]];
      ui.text(cur ? cur.name.toUpperCase() : '', x + WARD_W - 11, ry + 4, { font: 'small', color: '#c8d8ff', align: 'right' });
      bySlot(slot).forEach((c, i) => {
        const cx = x + 9 + i * CELL, cy = ry + 12;
        const own = owned(c.id), on = look[slot] === c.id;
        const over = ui.hover(cx, cy, CELL - 1, CELL - 1);
        ui.mark('ward:' + c.id, cx, cy, CELL - 1, CELL - 1);
        ui.block(cx, cy, CELL - 1, CELL - 1);
        ui.frame(on ? 'cardSel' : 'slot', cx, cy, CELL - 1, CELL - 1);
        ui.img(cosmeticIcon(c.id), cx + 1, cy + 1, { alpha: own ? 1 : 0.28 });
        if (!own) ui.icon('lock', cx + CELL - 9, cy + CELL - 10);
        if (on) { ui.rect(cx - 1, cy - 1, CELL + 1, CELL + 1, '#f0c040'); if (Math.sin(this.t * 4 + i) > 0.6) ui.fill(cx + CELL - 4, cy, 1, 1, '#ffffff'); }
        if (over) {
          ui.rect(cx, cy, CELL - 1, CELL - 1, '#ffffff');
          ui.cursor = own ? 'point' : 'arrow';
          this.hover = c.id;
          const tip: TipLine[] = [{ text: c.name, font: 'title', color: own ? '#2a1808' : '#5a4a3a' }, { text: c.desc, color: '#3a2810', gap: 1 }];
          if (!own) {
            const a = achFor(c.id);
            if (a) { tip.push({ text: `LOCKED: ${a.name.toUpperCase()}`, font: 'small', color: '#a01a1a', gap: 3 }); tip.push({ text: `${a.desc} (${progress(a)}/${a.goal})`, font: 'small', color: '#5a2a1a' }); }
            tip.push({ text: 'trying it on', font: 'small', color: '#1a4a7a', gap: 2 });
          } else if (!on) tip.push({ text: 'click to wear', font: 'small', color: '#1a4a7a', gap: 3 });
          else tip.push({ text: 'wearing it', font: 'small', color: '#2a6a2a', gap: 3 });
          ui.tooltip(tip, { maxW: 170 });
          if (ui.pressed) {
            if (own && !on && equip(c.id)) { this.equipped = c.id; audio.play('k_confirm1', { vol: 0.5, dry: true }); audio.play('cloth1', { vol: 0.4 }); }
            else if (!own) audio.play('k_err1', { vol: 0.35, dry: true });
          }
        }
      });
    });
    ui.hint('LMB', 'wear', x + 10, y + H - 21, { color: '#c8d8ff' });
    ui.hint('RMB', 'spin him', x + 64, y + H - 21, { color: '#c8d8ff' });
    if (ui.button('ward:back', 'BACK', x + WARD_W - 66, y + H - 24, 58, 18, { style: 'dark' })) close = true;
    return close;
  }
}
