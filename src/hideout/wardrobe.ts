// WARDROBE (v5): the open door of a green-black lacquered wardrobe (gold trim, bevelled panels) on the left of the
// room, a row per cosmetic slot (hat, skin, sword, scarf, trail). Hover an item to try it on (locked ones too: the
// hero wears it as a preview, and the tooltip says which achievement unlocks it), click an owned one to wear it (the
// hero does a little gear-up hop). The blobfish stays in view on the right, wearing what you point at.
import { PixelUI, type TipLine } from '../ui/pixel/ui';
import { SLOTS, SLOT_NAME, bySlot, owned, equippedLook, equip, COSMETIC, type Slot } from '../cosmetics';
import { cosmeticIcon } from '../cosmetics/icons';
import { achFor, progress } from '../achievements';
import { audio } from '../audio/audio';
import { K, brassPlate } from './itemCard';
import { panelArt, PANEL_IN } from './panelArt';

const CELL = 28, ROW = 46;
export const WARD_W = PANEL_IN.wardrobe[0] + PANEL_IN.wardrobe[2] + 12 * CELL + 14;
export function wardRect(ui: PixelUI) {
  const h = Math.min(ui.h - 22, PANEL_IN.wardrobe[1] + PANEL_IN.wardrobe[3] + SLOTS.length * ROW + 24);
  return { x: 10, y: Math.max(14, Math.round((ui.h - h) / 2) + 4), w: Math.min(WARD_W, ui.w - 20), h };
}

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
    const r = wardRect(ui), W = r.w, H = r.h;
    // slide in from the left, like a door swinging open
    const k = Math.min(1, this.t * 6), ox = Math.round((1 - (1 - (1 - k) ** 3)) * -40);
    x += ox;
    ui.block(x, y - 10, W, H + 10);
    ui.fill(x + 4, y + 5, W, H, '#000000', 0.4);
    ui.img(panelArt('wardrobe', W, H), x, y);
    brassPlate(ui, 'WARDROBE', x + W / 2, y - 9, { font: 'title' });
    let close = ui.closeButton('ward:x', x + W - 16, y - 6, { size: 20, key: null });
    const [il, it] = PANEL_IN.wardrobe;
    const ix = x + il + 2, iw = W - il * 2 - 4;
    const n = SLOTS.reduce((a, s) => a + bySlot(s).filter((c) => owned(c.id)).length, 0), tot = SLOTS.reduce((a, s) => a + bySlot(s).length, 0);
    ui.text(`${n}/${tot} OWNED`, x + W - il - 4, y + 7, { font: 'small', color: K.brass2, shadow: '#060c0a', align: 'right' });
    const rowsH = H - it - PANEL_IN.wardrobe[3] - 24, rowH = Math.min(ROW, Math.floor(rowsH / SLOTS.length));
    SLOTS.forEach((slot: Slot, si) => {
      const ry = y + it + 2 + si * rowH;
      // a recessed drawer per slot: its name, what you wear, the items
      ui.fill(ix - 2, ry, iw + 4, rowH - 3, '#08120e');
      ui.fill(ix - 1, ry + 1, iw + 2, rowH - 5, '#12221a');
      ui.fill(ix - 1, ry + rowH - 5, iw + 2, 1, '#2c5040');
      ui.text(SLOT_NAME[slot].toUpperCase(), ix + 3, ry + 3, { font: 'body', color: K.brass2, shadow: '#060c0a' });
      const cur = COSMETIC[look[slot]];
      ui.text(cur ? cur.name : '', ix + iw - 3, ry + 4, { font: 'small', color: K.cream2, shadow: '#060c0a', align: 'right' });
      const cy = ry + 4 + ui.lh('body');
      bySlot(slot).forEach((c, i) => {
        const cx = ix + 2 + i * CELL;
        const own = owned(c.id), on = look[slot] === c.id;
        const over = ui.hover(cx, cy, CELL - 2, CELL - 2);
        ui.mark('ward:' + c.id, cx, cy, CELL - 2, CELL - 2);
        ui.block(cx, cy, CELL - 2, CELL - 2);
        ui.fill(cx, cy, CELL - 2, CELL - 2, '#04080a');
        ui.fill(cx + 1, cy + 1, CELL - 4, CELL - 4, on ? '#3a2a10' : over ? '#24484e' : '#173a40');
        ui.fill(cx + 1, cy + 1, CELL - 4, 1, '#0b1d22');
        const S = CELL - 6;
        ui.img(cosmeticIcon(c.id, S * ui.hd), cx + 2, cy + 2, { w: S, h: S, alpha: own ? 1 : 0.3 });
        if (!own) ui.icon('lock', cx + CELL - 11, cy + CELL - 12);
        if (on) { ui.rect(cx - 1, cy - 1, CELL, CELL, K.brass2); if (Math.sin(this.t * 4 + i) > 0.6) ui.fill(cx + CELL - 5, cy, 1, 1, '#ffffff'); }
        if (over) {
          ui.rect(cx, cy, CELL - 2, CELL - 2, '#ffffff');
          ui.cursor = own ? 'point' : 'arrow';
          this.hover = c.id;
          const tip: TipLine[] = [{ text: c.name, font: 'title', color: own ? '#2a1808' : '#5a4a3a' }, { text: c.desc, color: '#3a2810', gap: 1 }];
          if (!own) {
            const a = achFor(c.id);
            if (a) { tip.push({ text: `LOCKED: ${a.name.toUpperCase()}`, font: 'small', color: '#a01a1a', gap: 3 }); tip.push({ text: `${a.desc} (${progress(a)}/${a.goal})`, font: 'small', color: '#5a2a1a' }); }
            tip.push({ text: 'trying it on', font: 'small', color: '#1a4a7a', gap: 2 });
          } else if (!on) tip.push({ text: 'click to wear', font: 'small', color: '#1a4a7a', gap: 3 });
          else tip.push({ text: 'wearing it', font: 'small', color: '#2a6a2a', gap: 3 });
          ui.tooltip(tip, { maxW: 180 });
          if (ui.pressed) {
            if (own && !on && equip(c.id)) { this.equipped = c.id; audio.play('k_confirm1', { vol: 0.5, dry: true }); audio.play('cloth1', { vol: 0.4 }); }
            else if (!own) audio.play('k_err1', { vol: 0.35, dry: true });
          }
        }
      });
    });
    const by = y + H - PANEL_IN.wardrobe[3] - 21;
    let hx = ix + 2;
    hx += ui.hint('LMB', 'wear', hx, by + 4, { color: K.cream2 });
    ui.hint('RMB', 'spin him', hx, by + 4, { color: K.cream2 });
    if (ui.button('ward:back', 'BACK', x + W - il - 84, by, 82, 20, { style: 'dark', key: 'Escape', keyLabel: 'ESC', sfx: '' })) close = true;
    return close;
  }
}
