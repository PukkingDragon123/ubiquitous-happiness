// The title's small pages: SETTINGS (volumes, motion blur, low quality, reset save) and CREDITS (a slow scroll).
// Both are kit cards (a lacquered wood panel with a brass title plaque) drawn over the scene; draw() returns true
// when the page wants to close. They fill exactly SETTINGS_W x SETTINGS_H / CREDITS_W x CREDITS_H UI px from (x, y).
import { PixelUI } from '../ui/pixel/ui';
import { KIT } from '../ui/pixel/skins';
import { META, saveMeta, resetMeta } from '../meta/meta';
import { audio } from '../audio/audio';

export const SETTINGS_W = 236, SETTINGS_H = 182;
export const CREDITS_W = 236, CREDITS_H = 190;
const LABEL = KIT.brass[3], W = KIT.text, D = KIT.textDim;

export class SettingsPanel {
  private arm = 0;
  private confirm = false;
  open() { this.arm = 0; this.confirm = false; }
  draw(ui: PixelUI, x: number, y: number, dt: number): boolean {
    const w = SETTINGS_W, h = SETTINGS_H;
    ui.fill(0, 0, ui.w, ui.h, '#000000', 0.25);
    ui.panel('wood', x, y, w, h, this.confirm ? 'ERASE?' : 'SETTINGS', { id: 'settings' });
    let close = ui.closeButton('set:x', x + w - 15, y - 6, { size: 18 });
    if (this.confirm) {
      this.arm = Math.max(0, this.arm - dt);
      ui.text('ERASE EVERYTHING?', x + w / 2, y + 26, { font: 'title', color: KIT.coral[3], outline: KIT.ink, align: 'center' });
      ui.textBox('Your stash, materials, hideout, mastery, nemeses, cosmetics and achievements will be forgotten.', x + 16, y + 52, w - 32, { font: 'body', color: W, align: 'center' });
      if (ui.button('set:yes', this.arm > 0 ? 'REALLY?' : 'ERASE', x + 14, y + h - 34, 96, 24, { style: 'red' })) {
        if (this.arm > 0) { resetMeta(); audio.play('k_glitch1', { vol: 0.5, dry: true }); location.reload(); } else this.arm = 3;
      }
      if (ui.button('set:no', 'KEEP IT', x + w - 110, y + h - 34, 96, 24, { style: 'green' })) this.confirm = false;
      return close;
    }
    let yy = y + 20;
    const slider = (id: string, label: string, v: number, o: { step?: number } = {}) => {
      ui.text(label, x + 14, yy + 3, { font: 'small', color: LABEL, outline: KIT.ink });
      const nv = ui.slider(id, v, x + 98, yy, 88, o);
      ui.text(`${Math.round(nv * 100)}%`, x + w - 14, yy + 3, { font: 'small', color: W, align: 'right' });
      yy += 19;
      return nv;
    };
    const v = slider('set:vol', 'VOLUME', audio.volume.master);
    if (v !== audio.volume.master) { audio.volume.master = v; META.settings.volume = v; audio.setVolumes(); saveMeta(); }
    const mu = slider('set:mus', 'MUSIC', audio.volume.music);
    if (mu !== audio.volume.music) { audio.volume.music = mu; META.settings.music = mu; audio.setVolumes(); saveMeta(); }
    const mb = slider('set:mb', 'MOTION BLUR', META.settings.motionBlur, { step: 0.25 });
    if (mb !== META.settings.motionBlur) { META.settings.motionBlur = mb; saveMeta(); }
    const lq = ui.toggle('set:lq', META.settings.lowQuality, 'Low quality (reloads)', x + 14, yy + 1);
    if (lq !== META.settings.lowQuality) { META.settings.lowQuality = lq; try { localStorage.setItem('blobfish.lq', lq ? '1' : '0'); } catch { /* ignore */ } saveMeta(); }
    yy += 20;
    // a brass rule, then the controls
    ui.fill(x + 12, yy, w - 24, 1, KIT.brass[1]); ui.fill(x + 12, yy + 1, w - 24, 1, KIT.ink, 0.6);
    yy += 6;
    ui.text('CONTROLS', x + 14, yy, { font: 'small', color: LABEL, outline: KIT.ink });
    yy += 13;
    let hx = x + 14;
    hx += ui.hint('WASD', 'swim', hx, yy);
    hx += ui.hint('LMB', 'attack', hx, yy);
    ui.hint('RMB', 'skill', hx, yy);
    yy += 16; hx = x + 14;
    hx += ui.hint('SPC', 'dash', hx, yy);
    hx += ui.hint('E', 'use', hx, yy);
    ui.hint('TAB', 'bag', hx, yy);
    if (ui.button('set:reset', 'RESET SAVE', x + 12, y + h - 32, 96, 22, { style: 'red' })) { this.confirm = true; this.arm = 0; }
    if (ui.button('set:back', 'BACK', x + w - 92, y + h - 32, 80, 22, { style: 'dark', key: 'Escape', keyLabel: 'ESC' })) close = true;
    return close;
  }
}

const LINES: [string, string, string?][] = [
  ['BLOBFISH: REEL REBELLION', KIT.brass[3], 'title'], ['', ''], ['A revenge story, 30 metres down', W], ['Made with three.js', W], ['', ''],
  ['FONTS', LABEL, 'body'], ['Jersey 10 / 15 / 20 — OFL', W], ['Alagard — Hewett Tsoi', W], ['m6x11plus, m5x7 — Daniel Linssen', W], ['Jacquard 24, Tiny5, Pixelify Sans — OFL', W], ['TBME Goofy — from Chewy (Apache 2.0)', W], ['', ''],
  ['SOUND & MUSIC', LABEL, 'body'], ['CC0 / public domain recordings', W], ['Kenney, rubberduck, Memoraphile', W], ['cynicmusic, joth, TAD, umplix', W], ['OpenGameArt.org contributors', W], ['US National Park Service', W], ['', ''],
  ['ALSO', LABEL, 'body'], ['Water from FISHTOP', W], ['People from Limbophobia', W], ['Every texture painted in code', W], ['Every hat woven by hand', W], ['', ''],
  ['Full list in CREDITS.md', D], ['', ''], ['thanks for playing', KIT.brass[3], 'body'],
];

export class CreditsPanel {
  private t = 0;
  open() { this.t = 0; }
  draw(ui: PixelUI, x: number, y: number, dt: number): boolean {
    this.t += dt;
    const w = CREDITS_W, h = CREDITS_H;
    ui.panel('wood', x, y, w, h, 'CREDITS', { id: 'credits' });
    const lh = 13, H2 = LINES.length * lh + 40;
    // starts full, scrolls up, loops seamlessly
    const off = (Math.max(0, this.t - 1.2) * 12) % H2;
    ui.clip(x + 8, y + 9, w - 16, h - 44);
    for (const rep of [0, H2]) LINES.forEach(([l, c, f], i) => {
      const yy = y + 16 + i * lh - off + rep;
      if (yy > y - 16 && yy < y + h - 34) ui.text(l, x + w / 2, yy, { font: f === 'title' ? 'body' : f === 'body' ? 'body' : 'small', color: c || W, align: 'center', outline: f ? KIT.ink : undefined });
    });
    ui.unclip();
    return ui.button('cred:back', 'BACK', x + (w - 84) / 2, y + h - 32, 84, 22, { style: 'dark', key: 'Escape', keyLabel: 'ESC' });
  }
}
