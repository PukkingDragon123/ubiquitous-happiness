// The small pages shared by the title and the game (v7 polish):
//   SettingsPanel  SOUND (volume, music), PICTURE (motion blur, low quality), CONTROLS (the keys), RESET SAVE; a kit
//                  card: a lacquered driftwood panel with its name plank, carved section heads with rope rules,
//                  rows that light up under the pointer, values that count, and a little hermit crab that potters
//                  along the bottom and blows a bubble whenever you change something.
//   CreditsPanel   a slow scroll (gold heads, cream names) that fades in and out at the edges of the window, with the
//                  hermit crab waving its claw goodbye at the end.
//   PausePanel     an in-game pause screen in the title's style: the scene dimmed, a jelly-letter title (PAUSED / HOME)
//                  and the choices as big floating words (no boxes) with the pearl cursor; the caller gives the items.
// draw() returns true (Settings / Credits) when the page wants to close; they fill exactly SETTINGS_W x SETTINGS_H /
// CREDITS_W x CREDITS_H UI px from (x, y).
//
//   const p = new PausePanel();  p.open();
//   const id = p.draw(ui, dt, { title: 'PAUSED', sub: 'KELP CATHEDRAL · 40 M DEEP', items: [{ id: 'resume', label:
//     'RESUME' }, { id: 'quit', label: 'QUIT TO HOME', danger: true }] });   // id of the picked item, 'close' on Esc
import { PixelUI } from '../ui/pixel/ui';
import { KIT } from '../ui/pixel/skins';
import { META, saveMeta, resetMeta } from '../meta/meta';
import { audio } from '../audio/audio';
import { clamp01 } from '../core/math';
import { hermitCrab } from './seaSprites';
import { TitleMenu, type MenuItem } from './menu2d';
import { JellyWord, SEAGLASS } from './logo';

export const SETTINGS_W = 268, SETTINGS_H = 222;
export const CREDITS_W = 260, CREDITS_H = 214;
const LABEL = KIT.brass[3], W = KIT.text, D = KIT.textDim;
const ROPE = ['#3e2b12', '#8c6e38', '#d6b874'];
const BLUR = ['OFF', 'LOW', 'MID', 'HIGH', 'MAX'];

/** a carved section head: a little icon, the word in brass, a twisted rope rule running on to the right edge */
function sectionHead(ui: PixelUI, label: string, icon: string, x: number, y: number, w: number) {
  const iw = ui.icon(icon, x, y - 2);
  const tw = ui.text(label, x + iw + 4, y, { font: 'small', color: LABEL, outline: KIT.ink });
  const rx = Math.round(x + iw + 4 + tw + 6), ry = y + Math.round(ui.cap('small') / 2) - 1;
  for (let u = 0; rx + u < x + w; u++) {
    const k = u % 4;
    ui.fill(rx + u, ry + (k < 2 ? 0 : 1), 1, 1, ROPE[k === 0 || k === 2 ? 2 : 1]);
    ui.fill(rx + u, ry + (k < 2 ? 1 : 0), 1, 1, ROPE[0]);
  }
  ui.fill(rx, ry + 2, x + w - rx, 1, '#000000', 0.25);
}

/** a row that lights up under the pointer: a soft band of caustic light and a kelp tick at its left */
function rowGlow(ui: PixelUI, id: string, x: number, y: number, w: number, h: number): number {
  const over = ui.hover(x, y, w, h);
  const k = ui.ease('rowglow:' + id, over ? 1 : 0, 16);
  if (k > 0.02) {
    ui.fill(x, y, w, h, '#8fe6e0', 0.07 * k);
    ui.fill(x, y + 2, 2, h - 4, KIT.kelp[3], k);
    ui.fill(x + 2, y + 2, 1, h - 4, KIT.kelp[1], k);
  }
  return k;
}

/** a hermit crab pottering about in a strip (x0..x1) at y; it waves and blows a bubble when nudged */
class Potterer {
  private x = -1; private dir = 1; private puff = -1; private t = 0; private wait = 0;
  nudge() { this.puff = 0; }
  draw(ui: PixelUI, x0: number, x1: number, y: number, dt: number) {
    this.t += dt;
    const walking = this.wait <= 0 && this.puff < 0;
    const spr = hermitCrab(this.puff >= 0 && this.puff < 0.6 ? 2 : walking ? ((Math.floor(this.t * 7) % 2) as 0 | 1) : 0);
    y += 5; // (it is shorter than the old fellow: sit it on the same line)
    if (this.x < 0) this.x = x0;
    if (this.wait > 0) this.wait -= dt;
    else if (this.puff < 0) {
      this.x += this.dir * dt * 9;
      if (this.x > x1 - spr.width) { this.x = x1 - spr.width; this.dir = -1; this.wait = 1.2; }
      if (this.x < x0) { this.x = x0; this.dir = 1; this.wait = 1.6; }
    }
    if (this.puff >= 0) {
      this.puff += dt;
      if (this.puff > 0.25 && this.puff - dt <= 0.25) { const mx = this.dir > 0 ? this.x + spr.width - 4 : this.x + 4; ui.bubble(mx, y + 4, { r: 2, vy: -16, life: 1.2 }); ui.bubble(mx + this.dir * 2, y + 1, { r: 1, vy: -20, delay: 0.1 }); }
      if (this.puff > 0.6) this.puff = -1;
    }
    // a scuttle: a hop of a pixel on every other step
    const bob = walking && Math.floor(this.t * 7) % 2 ? -1 : 0;
    ui.img(spr, Math.round(this.x), y + bob, { flipX: this.dir < 0, w: spr.width, h: spr.height });
  }
}

export class SettingsPanel {
  private arm = 0;
  private confirm = false;
  private crab = new Potterer();
  open() { this.arm = 0; this.confirm = false; }
  draw(ui: PixelUI, x: number, y: number, dt: number): boolean {
    const w = SETTINGS_W, h = SETTINGS_H;
    ui.fill(0, 0, ui.w, ui.h, '#000000', 0.25);
    ui.panel('wood', x, y, w, h, this.confirm ? 'ERASE?' : 'SETTINGS', { id: 'settings' });
    let close = ui.closeButton('set:x', x + w - 15, y - 6, { size: 18 });
    if (this.confirm) {
      this.arm = Math.max(0, this.arm - dt);
      const sk = ui.icon('skull', x + w / 2 - 5, y + 22);
      void sk;
      ui.text('ERASE EVERYTHING?', x + w / 2, y + 40, { font: 'title', color: KIT.coral[3], outline: KIT.ink, align: 'center' });
      ui.textBox('Your stash, materials, home, mastery, nemeses, cosmetics and achievements will be forgotten. This cannot be undone.', x + 22, y + 66, w - 44, { font: 'body', color: W, align: 'center' });
      if (ui.button('set:yes', this.arm > 0 ? 'REALLY?' : 'ERASE', x + 16, y + h - 36, 104, 24, { style: 'red' })) {
        if (this.arm > 0) { resetMeta(); audio.play('k_glitch1', { vol: 0.5, dry: true }); location.reload(); } else this.arm = 3;
      }
      if (ui.button('set:no', 'KEEP IT', x + w - 120, y + h - 36, 104, 24, { style: 'green', key: 'Escape', keyLabel: 'ESC' })) { this.confirm = false; close = false; }
      return close && !this.confirm;
    }
    const ix = x + 14, iw = w - 28;
    let yy = y + 20;
    let changed = false;
    // ---- SOUND
    sectionHead(ui, 'SOUND', 'bubble', ix, yy, iw);
    yy += 15;
    const slider = (id: string, label: string, v: number, o: { step?: number; words?: string[] } = {}) => {
      const k = rowGlow(ui, id, ix - 4, yy - 4, iw + 8, 20);
      ui.text(label, ix + 6 + Math.round(k), yy, { font: 'body', color: k > 0.5 ? '#ffffff' : W, shadow: '#06141a' });
      const nv = ui.slider(id, v, ix + 98, yy, 96, { step: o.step });
      const val = o.words ? o.words[Math.round(nv * (o.words.length - 1))] : `${ui.count(id + ':n', Math.round(nv * 100), { sfx: false })}%`;
      ui.text(val, x + w - 16, yy, { font: 'body', color: nv > 0 ? W : D, align: 'right', shadow: '#06141a' });
      yy += 21;
      if (nv !== v) changed = true;
      return nv;
    };
    const v = slider('set:vol', 'Volume', audio.volume.master);
    if (v !== audio.volume.master) { audio.volume.master = v; META.settings.volume = v; audio.setVolumes(); saveMeta(); }
    const mu = slider('set:mus', 'Music', audio.volume.music);
    if (mu !== audio.volume.music) { audio.volume.music = mu; META.settings.music = mu; audio.setVolumes(); saveMeta(); }
    yy += 2;
    // ---- PICTURE
    sectionHead(ui, 'PICTURE', 'tv', ix, yy, iw);
    yy += 15;
    const mb = slider('set:mb', 'Motion blur', META.settings.motionBlur, { step: 0.25, words: BLUR });
    if (mb !== META.settings.motionBlur) { META.settings.motionBlur = mb; saveMeta(); }
    rowGlow(ui, 'set:lqrow', ix - 4, yy - 4, iw + 8, 20);
    const lq = ui.toggle('set:lq', META.settings.lowQuality, 'Low quality', ix + 6, yy - 2);
    ui.text('reloads the game', x + w - 16, yy, { font: 'small', color: D, align: 'right', shadow: '#06141a' });
    if (lq !== META.settings.lowQuality) { changed = true; META.settings.lowQuality = lq; try { localStorage.setItem('blobfish.lq', lq ? '1' : '0'); } catch { /* ignore */ } saveMeta(); }
    yy += 22;
    // ---- CONTROLS: two tidy columns of keycaps
    sectionHead(ui, 'CONTROLS', 'move', ix, yy, iw);
    yy += 15;
    // (a touch screen: the on-screen keys, src/ui/touch.ts)
    const keys: [string, string][] = PixelUI.touch
      ? [['STICK', 'swim'], ['ATTACK', 'hit'], ['GUARD', 'parry'], ['DASH', 'dart'], ['SKILL', 'cast'], ['USE', 'use']]
      : [['WASD', 'swim'], ['LMB', 'attack'], ['RMB', 'skill'], ['SHIFT', 'dash'], ['E', 'use'], ['TAB', 'bag']];
    // columns as wide as their widest hint, spread across the row
    const cw = [0, 1, 2].map((c) => Math.max(ui.hintW(...keys[c]), ui.hintW(...keys[c + 3])));
    const gap = Math.max(0, Math.floor((iw - 6 - cw[0] - cw[1] - cw[2]) / 2));
    const cols = [ix + 6, ix + 6 + cw[0] + gap, ix + 6 + cw[0] + cw[1] + gap * 2];
    keys.forEach(([k, l], i) => ui.hint(k, l, cols[i % 3], yy + Math.floor(i / 3) * 16));
    // ---- the buttons, and the hermit crab pottering between them
    if (changed) this.crab.nudge();
    const by = y + h - 33;
    if (ui.button('set:reset', 'RESET SAVE', x + 13, by, 98, 22, { style: 'red' })) { this.confirm = true; this.arm = 0; }
    if (ui.button('set:back', 'BACK', x + w - 95, by, 82, 22, { style: 'green', key: 'Escape', keyLabel: 'ESC' })) close = true;
    if (ui.deco) this.crab.draw(ui, x + 116, x + w - 100, by + 2, dt);
    return close;
  }
}

const LINES: [string, string, 'head' | 'big' | 'body' | 'small' | 'gap'][] = [
  ['BLOBFISH', KIT.brass[3], 'big'], ['REEL REBELLION', KIT.cream[2], 'head'], ['', '', 'gap'],
  ['A revenge story, 30 metres down', W, 'body'], ['Made with three.js', W, 'body'], ['', '', 'gap'],
  ['FONTS', LABEL, 'head'], ['Jersey 10 / 15 / 20 - OFL', W, 'body'], ['Alagard - Hewett Tsoi', W, 'body'], ['m6x11plus, m5x7 - Daniel Linssen', W, 'body'], ['Jacquard 24, Tiny5, Pixelify Sans - OFL', W, 'body'], ['TBME Goofy - from Chewy (Apache 2.0)', W, 'body'], ['', '', 'gap'],
  ['SOUND & MUSIC', LABEL, 'head'], ['CC0 / public domain recordings', W, 'body'], ['Kenney, rubberduck, Memoraphile', W, 'body'], ['cynicmusic, joth, TAD, umplix', W, 'body'], ['OpenGameArt.org contributors', W, 'body'], ['US National Park Service', W, 'body'], ['', '', 'gap'],
  ['ALSO', LABEL, 'head'], ['Water from FISHTOP', W, 'body'], ['People from Limbophobia', W, 'body'], ['Every texture painted in code', W, 'body'], ['Every hat woven by hand', W, 'body'], ['', '', 'gap'],
  ['Full list in CREDITS.md', D, 'small'], ['', '', 'gap'], ['thanks for playing', KIT.brass[3], 'head'], ['', '', 'gap'], ['', '', 'gap'],
];
const LH: Record<string, number> = { big: 28, head: 20, body: 14, small: 13, gap: 10 };

export class CreditsPanel {
  private t = 0;
  open() { this.t = 0; }
  draw(ui: PixelUI, x: number, y: number, dt: number): boolean {
    this.t += dt;
    const w = CREDITS_W, h = CREDITS_H;
    ui.panel('wood', x, y, w, h, 'CREDITS', { id: 'credits' });
    const close = ui.closeButton('cred:x', x + w - 15, y - 6, { size: 18, key: null });
    // the scroll window (inside the frame, above the button)
    const wy0 = y + 12, wy1 = y + h - 40, cx = x + w / 2;
    const total = LINES.reduce((a, l) => a + LH[l[2]], 0) + 24;
    const off = (Math.max(0, this.t - 1.0) * 13) % total;
    ui.clip(x + 9, wy0, w - 18, wy1 - wy0);
    for (const rep of [0, total]) {
      let yy = wy0 + 10 - off + rep;
      for (const [l, c, f] of LINES) {
        const lh = LH[f];
        if (l && yy > wy0 - 30 && yy < wy1 + 4) {
          // fade in from the bottom edge, out at the top
          const a = clamp01((yy - wy0) / 14) * clamp01((wy1 - (yy + lh)) / 14);
          if (f === 'big') ui.text(l, cx, yy, { font: 'big', color: '#ffd6bc', color2: '#e9767c', outline: '#2a0b24', align: 'center', alpha: a });
          else ui.text(l, cx, yy, { font: f === 'head' ? 'title' : f === 'small' ? 'small' : 'body', color: c || W, align: 'center', outline: f === 'head' ? KIT.ink : undefined, shadow: f === 'head' ? undefined : '#06141a', alpha: a });
          // the hermit crab under the last line, waving its claw goodbye
          if (l === 'thanks for playing') {
            const spr = hermitCrab(Math.floor(this.t * 3) % 2 ? 2 : 0);
            const fa = clamp01((yy + 22 - wy0) / 14) * clamp01((wy1 - (yy + 40)) / 14);
            if (fa > 0) ui.img(spr, Math.round(cx - spr.width / 2 + Math.sin(this.t * 2) * 3), yy + 20 + Math.round(Math.sin(this.t * 3) * 1), { alpha: fa, w: spr.width, h: spr.height });
          }
        }
        yy += lh;
      }
    }
    ui.unclip();
    // a rope rule over the button
    for (let u = x + 14; u < x + w - 14; u++) { const k = (u - x) % 4; ui.fill(u, wy1 + 4 + (k < 2 ? 0 : 1), 1, 1, ROPE[k === 0 || k === 2 ? 2 : 1]); ui.fill(u, wy1 + 4 + (k < 2 ? 1 : 0), 1, 1, ROPE[0]); }
    return ui.button('cred:back', 'BACK', x + (w - 90) / 2, y + h - 32, 90, 22, { style: 'green', key: 'Escape', keyLabel: 'ESC' }) || close;
  }
}

export interface PauseItem { id: string; label: string; desc?: string; danger?: boolean }

/**
 * the in-game pause screen in the title's style (see the header): call open() when it opens, draw() every frame while
 * it is up (inside ui.begin / end); returns the picked item's id, 'close' for Esc, else null
 */
export class PausePanel {
  private menu = new TitleMenu<string>();
  private t = 0;
  private titles = new Map<string, JellyWord>();
  open(first?: string) { this.t = 0; this.menu.reset(); if (first) this.menu.select(first); }
  draw(ui: PixelUI, dt: number, o: { title?: string; sub?: string; items: PauseItem[]; escClose?: boolean }): string | null {
    this.t += dt;
    const a = clamp01(this.t * 5);
    // the scene sinks into the dark: stepped bands, darkest at the edges
    ui.fill(0, 0, ui.w, ui.h, '#02080e', 0.5 * a);
    for (let i = 0; i < 6; i++) { ui.fill(0, i * 6, ui.w, 6, '#02080e', 0.07 * (6 - i) * a); ui.fill(0, ui.h - (i + 1) * 6, ui.w, 6, '#02080e', 0.07 * (6 - i) * a); }
    ui.block(0, 0, ui.w, ui.h);
    const title = o.title ?? 'PAUSED';
    let jw = this.titles.get(title);
    if (!jw) { jw = new JellyWord(title, 30, SEAGLASS); this.titles.set(title, jw); }
    const [tw, th] = jw.size();
    const n = o.items.length;
    const blockH = th + (o.sub ? 16 : 6) + 12 + n * 30;
    let y = Math.round((ui.h - blockH) / 2);
    jw.draw(ui, Math.round((ui.w - tw) / 2), y, this.t, this.t * 1.4);
    y += th + 4;
    if (o.sub) { ui.text(o.sub, ui.w / 2, y, { font: 'body', color: KIT.brass[3], outline: KIT.ink, align: 'center', alpha: clamp01(this.t * 4 - 0.6) }); y += 16; }
    y += 12;
    // bubbles drifting up behind the words
    if (ui.deco && (this.t * 3) % 1 < dt * 3) ui.bubble(ui.w / 2 - 120 + ((this.t * 97) % 240), ui.h - 8, { r: 1 + (Math.floor(this.t * 3) % 2), vy: -22, life: 3 });
    const items: MenuItem<string>[] = o.items.map((it) => ({ id: it.id, label: it.label, desc: it.desc ?? '', danger: it.danger }));
    const r = this.menu.draw(ui, Math.round(ui.w / 2), y, { items, t: this.t, appear: this.t * 1.6, live: this.t > 0.15, align: 'center', idPrefix: 'pause:' });
    // the chosen item's line, and the hints
    const it = o.items.find((q) => q.id === this.menu.sel);
    const hy = ui.h - 22;
    if (it?.desc) ui.text(it.desc, ui.w / 2, hy - 16, { font: 'body', color: KIT.textDim, align: 'center', shadow: '#000000', alpha: a });
    const hw = ui.hintW('ENTER', 'select') + ui.hintW('ESC', 'back');
    let hx = Math.round((ui.w - hw) / 2);
    hx += ui.hint('ENTER', 'select', hx, hy, { color: KIT.textDim });
    ui.hint('ESC', 'back', hx, hy, { color: KIT.textDim });
    if (r.activate) { audio.play('k_confirm1', { vol: 0.35, dry: true }); return r.activate; }
    if ((o.escClose ?? true) && this.t > 0.15 && ui.input?.keyHit('Escape')) return 'close';
    return null;
  }
}
