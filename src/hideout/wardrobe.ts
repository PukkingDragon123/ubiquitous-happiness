// WARDROBE (v8b kit): a panel on the left of the room, a row per cosmetic slot (hat, skin, sword, scarf, trail). Hover an item to try it on (locked ones too: the
// hero wears it as a preview, and the tooltip says which achievement unlocks it), click an owned one to wear it (the
// hero does a little gear-up hop). The blobfish stays in view on the right, wearing what you point at.
import { PixelUI, type TipLine } from '../ui/pixel/ui';
import { SLOTS, SLOT_NAME, bySlot, owned, equippedLook, equip, COSMETIC, type Slot } from '../cosmetics';
import { cosmeticIcon } from '../cosmetics/icons';
import { achFor, progress } from '../achievements';
import { audio } from '../audio/audio';
import { PANEL_IN, cell } from './panelArt';
import { C, tag } from '../ui/pixel/skins';

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
    ui.panel('wood', x, y, W, H, 'WARDROBE', { id: 'home:wardrobe' });
    let close = ui.closeButton('ward:x', x + W - 24, y + 8, { size: 15, key: null });
    const [il, it] = PANEL_IN.wardrobe;
    const ix = x + il + 2, iw = W - il * 2 - 4;
    const n = SLOTS.reduce((a, s) => a + bySlot(s).filter((c) => owned(c.id)).length, 0), tot = SLOTS.reduce((a, s) => a + bySlot(s).length, 0);
    const rowsH = H - it - PANEL_IN.wardrobe[3] - 24, rowH = Math.min(ROW, Math.floor(rowsH / SLOTS.length));
    SLOTS.forEach((slot: Slot, si) => {
      const ry = y + it + 2 + si * rowH;
      // a row per slot: its name, what you wear, the items; a 1 px rule between rows
      if (si) ui.fill(ix, ry - 2, iw, 1, C.line);
      ui.text(SLOT_NAME[slot].toUpperCase(), ix + 2, ry + 3, { font: 'small', color: C.gold, shadow: null });
      const cur = COSMETIC[look[slot]];
      ui.text(cur ? cur.name : '', ix + iw - 2, ry + 3, { font: 'small', color: C.dim, shadow: null, align: 'right' });
      const cy = ry + 5 + ui.lh('small');
      bySlot(slot).forEach((c, i) => {
        const cx = ix + 2 + i * CELL;
        const own = owned(c.id), on = look[slot] === c.id;
        const over = ui.hover(cx, cy, CELL - 2, CELL - 2);
        ui.mark('ward:' + c.id, cx, cy, CELL - 2, CELL - 2);
        ui.block(cx, cy, CELL - 2, CELL - 2);
        // a slot per piece (gold when worn); the icon at 1x like the kit
        cell(ui, cx, cy, CELL - 2, on ? 'on' : over ? 'hover' : 'off');
        const S = CELL - 6;
        ui.img(cosmeticIcon(c.id, S), cx + 2, cy + 2, { w: S, h: S, alpha: own ? 1 : 0.3 });
        if (!own) ui.icon('lock', cx + CELL - 12, cy + CELL - 13);
        if (over) {
          ui.cursor = own ? 'point' : 'arrow';
          this.hover = c.id;
          const tip: TipLine[] = [{ text: c.name, font: 'title', color: own ? C.inkT : C.inkT2 }, { text: c.desc, color: C.inkT, gap: 1 }];
          if (!own) {
            const a = achFor(c.id);
            if (a) { tip.push({ text: `LOCKED: ${a.name.toUpperCase()}`, font: 'small', color: '#8a3a2e', gap: 3 }); tip.push({ text: `${a.desc} (${progress(a)}/${a.goal})`, font: 'small', color: C.inkT2 }); }
            tip.push({ text: 'trying it on', font: 'small', color: C.steel0, gap: 2 });
          } else if (!on) tip.push({ text: 'click to wear', font: 'small', color: C.steel0, gap: 3 });
          else tip.push({ text: 'wearing it', font: 'small', color: C.sage0, gap: 3 });
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
    hx += ui.hint('LMB', 'wear', hx, by + 4, { color: C.dim });
    ui.hint('RMB', 'spin him', hx, by + 4, { color: C.dim });
    // the tally, a small tag on the bottom rail beside BACK
    const tally = `${n}/${tot} OWNED`, tw = Math.ceil(ui.measure(tally, 'small')) + 8;
    tag(ui, tally, x + W - il - 92 - tw, by + 4, 'dim');
    if (ui.button('ward:back', 'BACK', x + W - il - 84, by, 82, 20, { style: 'dark', key: 'Escape', keyLabel: 'ESC', sfx: '' })) close = true;
    return close;
  }
}
