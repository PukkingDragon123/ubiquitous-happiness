// The title's menu (v8b forged kit): each item is a physical tile, a ceramic slab in a pewter bezel (src/ui/obj/
// forge.ts), the word in Alagard on it. The chosen tile turns to sea-glass enamel, tips toward you and slides 6 px out;
// a nacre lozenge glides beside it. Activating presses the tile in. Tiles rise in one after another.
//
//   const m = new TitleMenu();                      (TitleMenu<string> for other lists: the pause screen)
//   const r = m.draw(ui, x, y, { items, t, appear, live, align? });   r.activate = the item picked this frame (or null)
//   m.sel / m.select(id) / m.rect(id) (UI px) ; m.flash(id) when the screen activates an item itself
import type { PixelUI } from '../ui/pixel/ui';
import { C, btnSkin } from '../ui/pixel/skins';
import { clamp01, damp } from '../core/math';
import { audio } from '../audio/audio';

export type ItemId = 'new' | 'continue' | 'settings' | 'credits';
export interface MenuItem<T extends string = ItemId> {
  id: T; label: string;
  /** one line for the caption bar */ desc: string;
  /** a warning state: the label is swapped, red (NEW GAME over a save: START OVER?) */ warn?: string;
  /** a red word (QUIT) */ danger?: boolean;
  /** it opens a page over the menu (SETTINGS, CREDITS) */ stay?: boolean;
}

/** the row pitch (UI px) */
export const ROW = 26;
const FONT = 'title' as const;

interface ItemState { hov: number; selT: number }

export class TitleMenu<T extends string = ItemId> {
  /** the selected item */
  sel: T = 'new' as T;
  private st = new Map<T, ItemState>();
  private rects = new Map<T, [number, number, number, number]>();
  private barY = -1; private barX = 0;
  private lastM: [number, number] = [-999, -999];
  private flashT = -1; private flashId: T | null = null;
  private lastSel: T | null = null;
  private warnT = 0;

  select(id: T) { this.sel = id; }
  /** the item's hit rect last frame (UI px) */
  rect(id: T) { return this.rects.get(id) ?? null; }
  /** the activation blink (the screen calls it whatever triggered the activation) */
  flash(id: T) { this.flashT = 0; this.flashId = id; }
  /** forget the per-item motion (the screen re-entered) */
  reset() { this.st.clear(); this.barY = -1; this.flashT = -1; this.flashId = null; this.lastSel = null; this.lastM = [-999, -999]; }

  /**
   * draw the list with its top-left (or top-centre, align 'center') at (x, y). appear: seconds since the menu started
   * showing (staggered fade-in); live: takes mouse / keys. Returns the item activated this frame and the one under
   * the pointer.
   */
  draw(ui: PixelUI, x: number, y: number, o: { items: MenuItem<T>[]; t: number; appear: number; live: boolean; align?: 'left' | 'center'; idPrefix?: string }): { activate: T | null; over: T | null } {
    const { items, t } = o, dt = ui.dt, input = ui.input, center = o.align === 'center';
    if (!items.some((it) => it.id === this.sel)) this.sel = items[0]?.id ?? this.sel;
    let activate: T | null = null, over: T | null = null;
    // ---- mouse: hovering selects (only once the pointer moves, so a resting cursor doesn't steal the keys' choice)
    const moved = ui.mx !== this.lastM[0] || ui.my !== this.lastM[1];
    this.lastM = [ui.mx, ui.my];
    if (o.live) {
      for (const it of items) {
        const r = this.rects.get(it.id);
        if (!r) continue;
        ui.mark((o.idPrefix ?? 'title:') + it.id, r[0], r[1], r[2], r[3]);
        if (!ui.hover(r[0], r[1], r[2], r[3])) continue;
        over = it.id; ui.cursor = 'point';
        if (moved || ui.pressed) this.sel = it.id;
        if (ui.pressed) activate = it.id;
      }
      // ---- keys
      const idx = items.findIndex((it) => it.id === this.sel);
      const step = (d: number) => { this.sel = items[(idx + d + items.length) % items.length].id; audio.play('k_tick1', { vol: 0.2, dry: true, rate: 1.1 + (d > 0 ? 0 : 0.1) }); };
      if (input?.keyHit('ArrowDown') || input?.keyHit('KeyS')) step(1);
      else if (input?.keyHit('ArrowUp') || input?.keyHit('KeyW')) step(-1);
      if (!activate && (input?.keyHit('Enter') || input?.keyHit('Space') || input?.keyHit('NumpadEnter'))) activate = this.sel;
    }
    if (this.sel !== this.lastSel) {
      const s = this.state(this.sel); s.selT = 0;
      if (this.lastSel && !o.live) audio.play('k_tick1', { vol: 0.12, dry: true });
      this.lastSel = this.sel;
    }
    if (activate) this.flash(activate);
    this.flashT = this.flashT >= 0 ? this.flashT + dt : -1;
    // ---- the words
    const cap = Math.round(ui.cap(FONT));
    let selY = -1, selX = x;
    items.forEach((it, i) => {
      const s = this.state(it.id), on = it.id === this.sel;
      s.hov = damp(s.hov, on ? 1 : 0, 16, dt);
      s.selT += dt;
      const k = clamp01((o.appear - i * 0.07) / 0.3);
      if (k <= 0) { this.rects.delete(it.id); return; }
      const label = it.warn ?? it.label;
      if (it.warn) this.warnT += dt; else if (on) this.warnT = 0;
      const w = Math.ceil(ui.measure(label, FONT));
      const TW = Math.max(160, w + 40), TH = ROW - 3;
      const x0 = center ? Math.round(x - w / 2) : x;
      const nudge = center ? 0 : Math.round(s.hov * 6);
      const rise = Math.round((1 - k) * 6);
      const shake = it.warn ? Math.round(Math.sin(t * 40) * 1.5 * Math.exp(-this.warnT * 4)) : 0;
      const wx = x0 + nudge + shake - (center ? 0 : Math.round((1 - k) * 8)), wy = y + i * ROW + rise;
      // the tile: a forged slab under the word (the chosen one sea-glass, tipped toward you; pressed when activated)
      const tx0 = (center ? Math.round(x - TW / 2) : x - 14) + (center ? 0 : Math.round(s.hov * 6)) - (center ? 0 : Math.round((1 - k) * 8)), ty0 = y + i * ROW - 6 + rise;
      this.rects.set(it.id, [tx0, ty0, TW, TH]);
      const pressedNow = this.flashId === it.id && this.flashT >= 0 && this.flashT < 0.2;
      const style = it.warn || it.danger ? 'red' : 'green';
      ui.fill(tx0 + 2, ty0 + 3, TW, TH, '#000000', 0.25 * k);
      ui.img(btnSkin('dark', 'normal', TW, TH, ui.hd), tx0, ty0, { w: TW, h: TH, alpha: k * (1 - s.hov) * 0.92 });
      if (s.hov > 0.02) ui.img(btnSkin(style, pressedNow ? 'down' : 'hover', TW, TH, ui.hd), tx0, ty0, { w: TW, h: TH, alpha: k * s.hov });
      const lx = center ? Math.round(tx0 + TW / 2 - w / 2) : tx0 + 14 + nudge * 0, ly = ty0 + Math.round((TH - cap) / 2) + (pressedNow ? 1 : 0);
      void wx;
      if (on) { selY = ly; selX = lx; }
      const col = it.warn ? '#f6e6de' : on ? '#fffaf0' : it.danger ? '#d9a296' : C.bone;
      ui.text(label, lx, ly, { font: FONT, color: col, shadow: C.ink, alpha: k * (on || it.warn ? 1 : 0.92) });
    });
    // ---- the marker: a small gold bar gliding to the chosen item
    if (selY >= 0 && o.appear > 0.15) {
      const ty = selY + Math.round(cap / 2) - 1, tx = center ? selX - 30 : x - 22;
      if (this.barY < 0) { this.barY = ty; this.barX = tx; }
      this.barY = damp(this.barY, ty, 18, dt); this.barX = damp(this.barX, tx, 18, dt);
      const a = clamp01((o.appear - 0.15) * 4);
      // a nacre lozenge beside the chosen tile, gliding from tile to tile
      const bx = Math.round(this.barX) - (center ? 0 : 6), by = Math.round(this.barY);
      ui.fill(bx - 1, by - 2, 3, 5, C.ink, a * 0.6); ui.fill(bx, by - 3, 1, 7, '#e7ddcb', a); ui.fill(bx - 1, by - 1, 3, 3, '#e7ddcb', a); ui.fill(bx, by, 1, 1, '#ffffff', a);
    }
    return { activate, over };
  }

  private state(id: T) { let s = this.st.get(id); if (!s) { s = { hov: 0, selT: 9 }; this.st.set(id, s); } return s; }
}
