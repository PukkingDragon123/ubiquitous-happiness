// The small pages shared by the title and the game (v8b, the kit's calm style):
//   SettingsPanel  SOUND (volume, music), PICTURE (motion blur, low quality), CONTROLS (the keys), RESET SAVE: a main
//                  kit panel with its title in the top border, gold section heads with a rule, rows that light up
//                  under the pointer, values that count.
//   CreditsPanel   a slow scroll (gold heads, bone names) that fades in and out at the edges of its window.
//   PausePanel     the in-game pause screen: the scene dimmed, the title as a big Alagard word, where you are, the
//                  choices as a calm list with the gold marker, a note and the key hints; the caller gives the items.
// draw() returns true (Settings / Credits) when the page wants to close; they fill exactly SETTINGS_W x SETTINGS_H /
// CREDITS_W x CREDITS_H UI px from (x, y).
//
//   const p = new PausePanel();  p.open();
//   const id = p.draw(ui, dt, { title: 'PAUSED', sub: 'KELP CATHEDRAL - 40 M DEEP', items: [{ id: 'resume', label:
//     'RESUME' }, { id: 'quit', label: 'QUIT TO HOME', danger: true }] });   // id of the picked item, 'close' on Esc
import { PixelUI } from '../ui/pixel/ui';
import { KIT, C, sectionHead, rule } from '../ui/pixel/skins';
import { META, saveMeta, resetMeta } from '../meta/meta';
import { audio } from '../audio/audio';
import { clamp01 } from '../core/math';
import { TitleMenu, ROW, type MenuItem } from './menu2d';
import { JellyWord } from './logo';

export const SETTINGS_W = 300, SETTINGS_H = 262;
export const CREDITS_W = 270, CREDITS_H = 226;
const W = KIT.text, D = KIT.textDim;
const BLUR = ['OFF', 'LOW', 'MID', 'HIGH', 'MAX'];

/** a row that lights up under the pointer: a raised band and a 2 px gold bar at its left */
function rowGlow(ui: PixelUI, id: string, x: number, y: number, w: number, h: number): number {
  const over = ui.hover(x, y, w, h);
  const k = ui.ease('rowglow:' + id, over ? 1 : 0, 18);
  if (k > 0.02) { ui.fill(x, y, w, h, C.navy2, 0.9 * k); ui.fill(x, y + 3, 2, h - 6, C.gold, k); }
  return k;
}

export class SettingsPanel {
  private arm = 0;
  private confirm = false;
  open() { this.arm = 0; this.confirm = false; }
  draw(ui: PixelUI, x: number, y: number, dt: number): boolean {
    const w = SETTINGS_W, h = SETTINGS_H;
    ui.fill(0, 0, ui.w, ui.h, '#000000', 0.25);
    ui.panel('wood', x, y, w, h, this.confirm ? 'ERASE?' : 'SETTINGS', { id: 'settings' });
    let close = ui.closeButton('set:x', x + w - 24, y + 8, { size: 15 });
    if (this.confirm) {
      this.arm = Math.max(0, this.arm - dt);
      ui.text('ERASE EVERYTHING?', x + w / 2, y + 34, { font: 'title', color: C.red2, shadow: C.ink, align: 'center' });
      ui.textBox('Your stash, materials, home, mastery, nemeses, cosmetics and achievements will be forgotten. This cannot be undone.', x + 26, y + 64, w - 52, { font: 'body', color: W, align: 'center' });
      if (ui.button('set:yes', this.arm > 0 ? 'REALLY?' : 'ERASE', x + 18, y + h - 40, 110, 24, { style: 'red' })) {
        if (this.arm > 0) { resetMeta(); audio.play('k_glitch1', { vol: 0.5, dry: true }); location.reload(); } else this.arm = 3;
      }
      if (ui.button('set:no', 'KEEP IT', x + w - 128, y + h - 40, 110, 24, { style: 'green', key: 'Escape', keyLabel: 'ESC' })) { this.confirm = false; close = false; }
      return close && !this.confirm;
    }
    const ix = x + 18, iw = w - 36;
    let yy = y + 22;
    // ---- SOUND
    yy += sectionHead(ui, 'SOUND', ix, yy, iw) + 4;
    const rowH = 20;
    const slider = (id: string, label: string, v: number, o: { step?: number; words?: string[] } = {}) => {
      const k = rowGlow(ui, id, ix - 6, yy - 5, iw + 12, rowH);
      const ty = yy + Math.round((rowH - 10 - ui.cap('body')) / 2) - 1;
      ui.text(label, ix + 4 + Math.round(k), ty, { font: 'body', color: k > 0.5 ? C.bone2 : W, shadow: null });
      const nv = ui.slider(id, v, ix + 112, yy - 1, 108, { step: o.step });
      const val = o.words ? o.words[Math.round(nv * (o.words.length - 1))] : `${ui.count(id + ':n', Math.round(nv * 100), { sfx: false })}%`;
      ui.text(val, x + w - 18, ty, { font: 'body', color: nv > 0 ? W : D, align: 'right', shadow: null });
      yy += rowH + 2;
      return nv;
    };
    const v = slider('set:vol', 'Volume', audio.volume.master);
    if (v !== audio.volume.master) { audio.volume.master = v; META.settings.volume = v; audio.setVolumes(); saveMeta(); }
    const mu = slider('set:mus', 'Music', audio.volume.music);
    if (mu !== audio.volume.music) { audio.volume.music = mu; META.settings.music = mu; audio.setVolumes(); saveMeta(); }
    yy += 6;
    // ---- PICTURE
    yy += sectionHead(ui, 'PICTURE', ix, yy, iw) + 4;
    const mb = slider('set:mb', 'Motion blur', META.settings.motionBlur, { step: 0.25, words: BLUR });
    if (mb !== META.settings.motionBlur) { META.settings.motionBlur = mb; saveMeta(); }
    rowGlow(ui, 'set:lqrow', ix - 6, yy - 5, iw + 12, rowH);
    const lq = ui.toggle('set:lq', META.settings.lowQuality, 'Low quality', ix + 4, yy - 2);
    ui.text('reloads the game', x + w - 18, yy + Math.round((13 - ui.cap('small')) / 2) - 2, { font: 'small', color: C.faint, align: 'right', shadow: null });
    if (lq !== META.settings.lowQuality) { META.settings.lowQuality = lq; try { localStorage.setItem('blobfish.lq', lq ? '1' : '0'); } catch { /* ignore */ } saveMeta(); }
    yy += rowH + 8;
    // ---- CONTROLS: three tidy columns of keycaps
    yy += sectionHead(ui, 'CONTROLS', ix, yy, iw) + 4;
    // (a touch screen: the on-screen keys, src/ui/touch.ts)
    const keys: [string, string][] = PixelUI.touch
      ? [['STICK', 'swim'], ['ATTACK', 'hit'], ['GUARD', 'parry'], ['DASH', 'dart'], ['SKILL', 'cast'], ['USE', 'use']]
      : [['WASD', 'swim'], ['LMB', 'attack'], ['RMB', 'skill'], ['SHIFT', 'dash'], ['E', 'use'], ['TAB', 'bag']];
    const cw = [0, 1, 2].map((c) => Math.max(ui.hintW(...keys[c]), ui.hintW(...keys[c + 3])));
    const gap = Math.max(0, Math.floor((iw - 4 - cw[0] - cw[1] - cw[2]) / 2));
    const cols = [ix + 4, ix + 4 + cw[0] + gap, ix + 4 + cw[0] + cw[1] + gap * 2];
    keys.forEach(([k, l], i) => ui.hint(k, l, cols[i % 3], yy + Math.floor(i / 3) * 17, { color: C.dim }));
    // ---- the buttons
    const by = y + h - 36;
    rule(ui, ix, by - 9, iw, { notch: false, col: C.line });
    if (ui.button('set:reset', 'RESET SAVE', x + 16, by, 108, 22, { style: 'red' })) { this.confirm = true; this.arm = 0; }
    if (ui.button('set:back', 'BACK', x + w - 106, by, 90, 22, { style: 'green', key: 'Escape', keyLabel: 'ESC' })) close = true;
    return close;
  }
}

const LINES: [string, string, 'head' | 'big' | 'body' | 'small' | 'gap'][] = [
  ['BLOBFISH', C.bone2, 'big'], ['REEL REBELLION', C.gold, 'head'], ['', '', 'gap'],
  ['A revenge story, 30 metres down', W, 'body'], ['Made with three.js', W, 'body'], ['', '', 'gap'],
  ['FONT', C.gold, 'head'], ['Alagard - Hewett Tsoi', W, 'body'], ['', '', 'gap'],
  ['SOUND & MUSIC', C.gold, 'head'], ['CC0 / public domain recordings', W, 'body'], ['Kenney, rubberduck, Memoraphile', W, 'body'], ['cynicmusic, joth, TAD, umplix', W, 'body'], ['OpenGameArt.org contributors', W, 'body'], ['US National Park Service', W, 'body'], ['', '', 'gap'],
  ['ALSO', C.gold, 'head'], ['Water from FISHTOP', W, 'body'], ['People from Limbophobia', W, 'body'], ['Every texture painted in code', W, 'body'], ['Every hat woven by hand', W, 'body'], ['', '', 'gap'],
  ['Full list in CREDITS.md', D, 'small'], ['', '', 'gap'], ['thanks for playing', C.gold, 'head'], ['', '', 'gap'], ['', '', 'gap'],
];
const LH: Record<string, number> = { big: 34, head: 22, body: 16, small: 13, gap: 12 };

export class CreditsPanel {
  private t = 0;
  open() { this.t = 0; }
  draw(ui: PixelUI, x: number, y: number, dt: number): boolean {
    this.t += dt;
    const w = CREDITS_W, h = CREDITS_H;
    ui.panel('wood', x, y, w, h, 'CREDITS', { id: 'credits' });
    const close = ui.closeButton('cred:x', x + w - 24, y + 8, { size: 15, key: null });
    // the scroll window (inside the frame, above the button)
    const wy0 = y + 16, wy1 = y + h - 44, cx = x + w / 2;
    const total = LINES.reduce((a, l) => a + LH[l[2]], 0) + 24;
    const off = (Math.max(0, this.t - 1.0) * 13) % total;
    ui.clip(x + 9, wy0, w - 18, wy1 - wy0);
    for (const rep of [0, total]) {
      let yy = wy0 + 10 - off + rep;
      for (const [l, c, f] of LINES) {
        const lh = LH[f];
        if (l && yy > wy0 - 40 && yy < wy1 + 4) {
          // fade in from the bottom edge, out at the top
          const a = clamp01((yy - wy0) / 16) * clamp01((wy1 - (yy + lh)) / 16);
          if (f === 'big') ui.text(l, cx, yy, { font: 'body', size: 2, color: c, shadow: C.ink, align: 'center', alpha: a });
          else ui.text(l, cx, yy, { font: f === 'head' ? 'title' : f === 'small' ? 'small' : 'body', color: c || W, align: 'center', shadow: C.ink, alpha: a });
        }
        yy += lh;
      }
    }
    ui.unclip();
    rule(ui, x + 18, wy1 + 6, w - 36, { notch: false, col: C.line });
    return ui.button('cred:back', 'BACK', x + (w - 96) / 2, y + h - 34, 96, 22, { style: 'green', key: 'Escape', keyLabel: 'ESC' }) || close;
  }
}

export interface PauseItem { id: string; label: string; desc?: string; danger?: boolean }

/**
 * the in-game pause screen (see the header): call open() when it opens, draw() every frame while it is up (inside
 * ui.begin / end); returns the picked item's id, 'close' for Esc, else null. o.keys maps extra key codes to items
 * ({ Tab: 'bag' }); o.note is a small line under the list.
 */
export class PausePanel {
  private menu = new TitleMenu<string>();
  private t = 0;
  private titles = new Map<string, JellyWord>();
  open(first?: string) { this.t = 0; this.menu.reset(); if (first) this.menu.select(first); }
  draw(ui: PixelUI, dt: number, o: { title?: string; sub?: string; items: PauseItem[]; escClose?: boolean; keys?: Record<string, string>; note?: string }): string | null {
    this.t += dt;
    const a = clamp01(this.t * 6);
    // the scene sinks into the dark
    ui.fill(0, 0, ui.w, ui.h, C.ink, 0.74 * a);
    ui.block(0, 0, ui.w, ui.h);
    const title = o.title ?? 'PAUSED';
    let jw = this.titles.get(title);
    if (!jw) { jw = new JellyWord(title, 33); this.titles.set(title, jw); }
    const [tw, th] = jw.measure(ui);
    const n = o.items.length;
    const capS = Math.round(ui.cap('small'));
    const blockH = th + 12 + (o.sub ? capS + 12 : 0) + 16 + n * ROW + (o.note ? 10 + capS : 0);
    let y = Math.round((ui.h - blockH) / 2) - 6;
    jw.draw(ui, Math.round((ui.w - tw) / 2), y, this.t, this.t * 1.6);
    y += th + 12;
    if (o.sub) { ui.text(o.sub, ui.w / 2, y, { font: 'small', color: C.gold, shadow: C.ink, align: 'center', alpha: clamp01(this.t * 4 - 0.4) }); y += capS + 12; }
    // a short rule with the notch in the middle
    const ra = clamp01(this.t * 4 - 0.5);
    ui.fill(Math.round(ui.w / 2 - 40), y, 80, 1, C.line2, ra); ui.fill(Math.round(ui.w / 2 - 1), y - 1, 2, 3, C.gold, ra);
    y += 16;
    const items: MenuItem<string>[] = o.items.map((it) => ({ id: it.id, label: it.label, desc: it.desc ?? '', danger: it.danger }));
    const r = this.menu.draw(ui, Math.round(ui.w / 2), y, { items, t: this.t, appear: this.t * 1.8, live: this.t > 0.15, align: 'center', idPrefix: 'pause:' });
    y += n * ROW;
    if (o.note) ui.text(o.note, ui.w / 2, y + 6, { font: 'small', color: C.dim, align: 'center', shadow: null, alpha: a });
    // the chosen item's line, and the hints
    const it = o.items.find((q) => q.id === this.menu.sel);
    const hy = ui.h - 24;
    if (it?.desc) ui.text(it.desc, ui.w / 2, hy - 18, { font: 'small', color: C.dim, align: 'center', shadow: null, alpha: a });
    if (!PixelUI.touch) {
      const hw = ui.hintW('ENTER', 'select') + ui.hintW('ESC', 'back');
      let hx = Math.round((ui.w - hw) / 2);
      hx += ui.hint('ENTER', 'select', hx, hy, { color: C.dim });
      ui.hint('ESC', 'back', hx, hy, { color: C.dim });
    }
    if (r.activate) { audio.play('k_confirm1', { vol: 0.35, dry: true }); return r.activate; }
    if (this.t > 0.15 && o.keys) for (const [code, id] of Object.entries(o.keys)) if (ui.input?.keyHit(code)) { this.menu.flash(id); return id; }
    if ((o.escClose ?? true) && this.t > 0.15 && ui.input?.keyHit('Escape')) return 'close';
    return null;
  }
}
