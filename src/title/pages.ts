// The title's small pages: SETTINGS (volumes, motion blur, low quality, reset save) and CREDITS (a slow scroll).
// Both are pixel panels drawn over the scene; draw() returns true when the page wants to close.
import { PixelUI } from '../ui/pixel/ui';
import { META, saveMeta, resetMeta } from '../meta/meta';
import { audio } from '../audio/audio';

const H = '#ffd27a', W = '#ffffff', D = '#8a94b0';

export class SettingsPanel {
  private arm = 0;
  private confirm = false;
  open() { this.arm = 0; this.confirm = false; }
  draw(ui: PixelUI, x: number, y: number, dt: number): boolean {
    const w = 236, h = 182;
    ui.panel('dark', x, y, w, h, undefined, { alpha: 0.94 });
    ui.fill(x + 4, y + 4, w - 8, 15, '#1a0c08', 0.9); ui.fill(x + 4, y + 18, w - 8, 1, '#f0c040');
    ui.text('SETTINGS', x + 9, y + 8, { font: 'title', color: '#fff4dc', color2: '#ffd27a', shadow: '#000' });
    let close = ui.iconButton('set:x', 'close', x + w - 22, y + 4, { style: 'red', size: 13, key: 'Escape', keyLabel: '' });
    if (this.confirm) {
      this.arm = Math.max(0, this.arm - dt);
      ui.text('ERASE EVERYTHING?', x + w / 2, y + 44, { font: 'title', color: '#ff6a5a', shadow: '#000', align: 'center' });
      ui.textBox('Your stash, materials, hideout, mastery, nemeses, cosmetics and achievements will be forgotten.', x + 16, y + 64, w - 32, { font: 'small', color: W, align: 'center' });
      if (ui.button('set:yes', this.arm > 0 ? 'REALLY?' : 'ERASE', x + 30, y + 118, 80, 18, { style: 'red' })) {
        if (this.arm > 0) { resetMeta(); audio.play('k_glitch1', { vol: 0.5, dry: true }); location.reload(); } else this.arm = 3;
      }
      if (ui.button('set:no', 'KEEP IT', x + w - 110, y + 118, 80, 18, { style: 'dark' })) this.confirm = false;
      return false;
    }
    let yy = y + 30;
    const row = (label: string) => ui.text(label, x + 12, yy + 1, { font: 'small', color: H });
    row('MASTER VOLUME');
    const v = ui.slider('set:vol', audio.volume.master, x + 110, yy, 110, { style: 'blue' });
    if (v !== audio.volume.master) { audio.volume.master = v; META.settings.volume = v; audio.setVolumes(); saveMeta(); }
    yy += 20; row('MUSIC');
    const mu = ui.slider('set:mus', audio.volume.music, x + 110, yy, 110, { style: 'blue' });
    if (mu !== audio.volume.music) { audio.volume.music = mu; META.settings.music = mu; audio.setVolumes(); saveMeta(); }
    yy += 20; row('MOTION BLUR');
    const mb = ui.slider('set:mb', META.settings.motionBlur, x + 110, yy, 110, { style: 'blue', step: 0.25 });
    if (mb !== META.settings.motionBlur) { META.settings.motionBlur = mb; saveMeta(); }
    yy += 22;
    const lq = ui.toggle('set:lq', META.settings.lowQuality, 'LOW QUALITY (needs reload)', x + 12, yy, { style: 'dark', font: 'small' });
    if (lq !== META.settings.lowQuality) { META.settings.lowQuality = lq; try { localStorage.setItem('blobfish.lq', lq ? '1' : '0'); } catch { /* ignore */ } saveMeta(); }
    yy += 22;
    ui.text('CONTROLS', x + 12, yy, { font: 'small', color: H });
    yy += 12;
    let hx = x + 12;
    hx += ui.hint('WASD', 'swim', hx, yy, { color: '#c8d8ff' });
    hx += ui.hint('LMB', 'attack', hx, yy, { color: '#c8d8ff' });
    ui.hint('RMB', 'skill', hx, yy, { color: '#c8d8ff' });
    yy += 15; hx = x + 12;
    hx += ui.hint('SPC', 'dash', hx, yy, { color: '#c8d8ff' });
    hx += ui.hint('E', 'use', hx, yy, { color: '#c8d8ff' });
    ui.hint('TAB', 'bag', hx, yy, { color: '#c8d8ff' });
    if (ui.button('set:reset', 'RESET SAVE', x + 12, y + h - 26, 90, 18, { style: 'red', font: 'small' })) { this.confirm = true; this.arm = 0; }
    if (ui.button('set:back', 'BACK', x + w - 72, y + h - 26, 60, 18, { style: 'dark' })) close = true;
    return close;
  }
}

const LINES: [string, string, string?][] = [
  ['BLOBFISH: REEL REBELLION', '#ffd27a', 'title'], ['', ''], ['A revenge story, 30 metres down', W], ['Made with three.js', W], ['', ''],
  ['FONTS', H], ['Alagard — Hewett Tsoi', W], ['m6x11plus, m5x7 — Daniel Linssen', W], ['Jacquard 24, Tiny5, Pixelify Sans — OFL', W], ['TBME Goofy — from Chewy (Apache 2.0)', W], ['', ''],
  ['SOUND & MUSIC', H], ['CC0 / public domain recordings', W], ['Kenney, rubberduck, Memoraphile', W], ['cynicmusic, joth, TAD, umplix', W], ['OpenGameArt.org contributors', W], ['US National Park Service', W], ['', ''],
  ['ALSO', H], ['Water from FISHTOP', W], ['People from Limbophobia', W], ['Every texture painted in code', W], ['Every hat woven by hand', W], ['', ''],
  ['Full list in CREDITS.md', D], ['', ''], ['thanks for playing', '#ffd27a'],
];

export class CreditsPanel {
  private t = 0;
  open() { this.t = 0; }
  draw(ui: PixelUI, x: number, y: number, dt: number): boolean {
    this.t += dt;
    const w = 236, h = 190;
    ui.panel('dark', x, y, w, h, undefined, { alpha: 0.9 });
    const lh = 11, H2 = LINES.length * lh + 40;
    // starts full, scrolls up, loops seamlessly
    const off = (Math.max(0, this.t - 1.2) * 12) % H2;
    ui.clip(x + 4, y + 6, w - 8, h - 34);
    for (const rep of [0, H2]) LINES.forEach(([l, c, f], i) => { const yy = y + 12 + i * lh - off + rep; if (yy > y - 12 && yy < y + h - 26) ui.text(l, x + w / 2, yy, { font: f === 'title' ? 'title' : 'small', color: c || W, align: 'center', shadow: '#000' }); });
    ui.unclip();
    return ui.button('cred:back', 'BACK', x + (w - 60) / 2, y + h - 24, 60, 18, { style: 'dark', key: 'Escape', keyLabel: '' });
  }
}
