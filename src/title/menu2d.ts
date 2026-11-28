// The title's menu (v8b): a short list of words over the scene, 2D, no boxes, in the kit's calm style. Each item is
// Alagard at the 'title' role in bone; the chosen one turns gold, eases 6 px to the right and gets a small gold bar
// beside it that glides from item to item. Activating an item blinks it once. Items fade in one after another.
//
//   const m = new TitleMenu();                      (TitleMenu<string> for other lists: the pause screen)
//   const r = m.draw(ui, x, y, { items, t, appear, live, align? });   r.activate = the item picked this frame (or null)
//   m.sel / m.select(id) / m.rect(id) (UI px) ; m.flash(id) when the screen activates an item itself
import type { PixelUI } from '../ui/pixel/ui';
import { C } from '../ui/pixel/skins';
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
      const x0 = center ? Math.round(x - w / 2) : x;
      const nudge = center ? 0 : Math.round(s.hov * 6);
      const rise = Math.round((1 - k) * 6);
      const shake = it.warn ? Math.round(Math.sin(t * 40) * 1.5 * Math.exp(-this.warnT * 4)) : 0;
      const wx = x0 + nudge + shake - (center ? 0 : Math.round((1 - k) * 8)), wy = y + i * ROW + rise;
      this.rects.set(it.id, center ? [x0 - 24, y + i * ROW - 6, w + 48, ROW] : [x - 22, y + i * ROW - 6, Math.max(w + 44, 150), ROW]);
      if (on) { selY = wy; selX = wx; }
      const blink = this.flashId === it.id && this.flashT >= 0 && this.flashT < 0.36 ? (Math.floor(this.flashT * 16) % 2 ? 0.35 : 1) : 1;
      const col = it.warn ? C.red2 : on ? C.gold2 : it.danger ? '#c99083' : C.bone;
      ui.text(label, wx, wy, { font: FONT, color: col, shadow: C.ink, alpha: k * blink * (on || it.warn ? 1 : 0.9) });
    });
    // ---- the marker: a small gold bar gliding to the chosen item
    if (selY >= 0 && o.appear > 0.15) {
      const ty = selY + Math.round(cap / 2) - 1, tx = center ? selX - 14 : x - 12;
      if (this.barY < 0) { this.barY = ty; this.barX = tx; }
      this.barY = damp(this.barY, ty, 18, dt); this.barX = damp(this.barX, tx, 18, dt);
      const a = clamp01((o.appear - 0.15) * 4);
      ui.fill(Math.round(this.barX), Math.round(this.barY), 6, 2, C.gold, a);
      if (center) { const it = items.find((q) => q.id === this.sel); const w = it ? Math.ceil(ui.measure(it.warn ?? it.label, FONT)) : 0; ui.fill(Math.round(selX + w + 8), Math.round(this.barY), 6, 2, C.gold, a); }
    }
    return { activate, over };
  }

  private state(id: T) { let s = this.st.get(id); if (!s) { s = { hov: 0, selT: 9 }; this.st.set(id, s); } return s; }
}
