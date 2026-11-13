// The TV's pixel picture (a 320 x 240 canvas shown through the CRT material): cosy décor now that the main menu is
// the title screen (src/title). It loops a little nature channel: kelp swaying, a pixel blobfish gliding past, the
// channel bug and a news ticker. Clicking the TV in the hideout takes you to the main menu.
import type { Input } from '../core/input';
import { PixelUI } from '../ui/pixel/ui';
import { blobSprite, fishSprite } from './tvArt';

export type TvPage = 'idle';
export const TV_W = 320, TV_H = 240;

export class TvUI {
  ui = new PixelUI({ fixed: [TV_W, TV_H] });
  page: TvPage = 'idle';
  /** a static burst (decays) */
  staticK = 0;
  private t = 0;

  go(_p: TvPage) { this.staticK = 1; }

  draw(input: Input | null, dt: number, map?: (x: number, y: number) => [number, number] | null) {
    this.t += dt;
    this.staticK = Math.max(0, this.staticK - dt * 3.2);
    const ui = this.ui;
    ui.drawCursor = false;
    ui.begin(input, dt, map);
    this.channel();
    ui.end();
  }

  /** a nature programme: banded water, light, kelp, the blobfish gliding by, fish, bubbles, a ticker */
  private channel() {
    const ui = this.ui, t = this.t;
    const bands = ['#1a4a7a', '#163f6c', '#12355e', '#0e2b50', '#0a2242', '#071a34'];
    bands.forEach((c, i) => ui.fill(0, i * 40, TV_W, 40, c));
    ui.ctx.fillStyle = '#245a8c';
    for (let i = 0; i < 4; i++) { const x0 = ((i * 97 + t * 5) % (TV_W + 120)) - 60; for (let y = 0; y < 150; y += 2) ui.ctx.fillRect(Math.round(x0 + y * 0.45), y, 9 - Math.floor(y / 30), 2); }
    for (let i = 0; i < 7; i++) {
      const x = 14 + i * 48 + Math.sin(t * 0.5 + i) * 3;
      for (let y = 110 + (i % 3) * 12; y < 240; y += 2) { const xx = x + Math.sin(y * 0.05 + t * 0.8 + i) * 4; ui.fill(xx, y, 3, 2, i % 2 ? '#2a5a2a' : '#3a7a3a'); if (y % 14 === 0) ui.fill(xx + (y % 28 ? 3 : -4), y, 4, 2, '#4a8a3a'); }
    }
    ui.fill(0, 214, TV_W, 26, '#2a2416');
    for (let x = 0; x < TV_W; x += 3) ui.fill(x, 212 + Math.round(Math.sin(x * 0.3) * 1.5), 3, 3, '#4a3e24');
    // the star of the show: a blobfish in a straw kasa, gliding by
    const bx = ((t * 16) % (TV_W + 60)) - 30, by = 120 + Math.round(Math.sin(t * 1.4) * 6);
    ui.img(blobSprite(Math.floor(t * 4)), Math.round(bx), by);
    const hx = Math.round(bx) + 6, hy = by - 6;
    for (let r = 0; r < 6; r++) ui.fill(hx + 6 - r * 2, hy + r, 4 + r * 4, 1, r === 5 ? '#7a5a2a' : r % 2 ? '#c8a458' : '#e8cc84');
    ui.fill(hx + 7, hy - 1, 2, 1, '#c8342c');
    for (let i = 0; i < 3; i++) if (Math.sin(t * 2 + i) > 0.6) ui.fill(Math.round(bx) + 20, by - 3 - i * 4 - Math.floor((t * 10) % 4), 2, 2, '#9ad8ff');
    for (let i = 0; i < 4; i++) { const fx = TV_W - ((t * (20 + i * 6) + i * 90) % (TV_W + 40)) + 20; ui.img(fishSprite(i), Math.round(fx), 90 + i * 22 + Math.round(Math.sin(t * 3 + i) * 2), { flipX: true }); }
    for (let i = 0; i < 10; i++) { const x = (i * 71 + Math.round(Math.sin(t + i) * 3)) % TV_W, y = TV_H - (Math.floor(t * (14 + (i % 3) * 6) + i * 29) % (TV_H + 10)); ui.fill(x, y, 2, 2, '#7ab8ff'); ui.fill(x, y, 1, 1, '#e8f6ff'); }
    // channel bug, LIVE, ticker
    ui.text('CH 3', TV_W - 8, 8, { font: 'title', color: '#ffffff', shadow: '#000', align: 'right', alpha: 0.85 });
    ui.text('LIVE', 10, 8, { font: 'small', color: '#ff4a4a', shadow: '#000' });
    if (Math.sin(t * 3) > 0) ui.fill(36, 9, 4, 4, '#ff4a4a');
    ui.fill(0, 226, TV_W, 14, '#000818');
    const tick = 'BLOBFISH TV  •  CLICK THE TV FOR THE MAIN MENU  •  TONIGHT: HUMANS, WHY?  •  WEATHER: WET  •  HATS ARE BACK  •  ';
    const w = ui.measure(tick, 'small');
    const off = -((t * 30) % w);
    ui.text(tick + tick, Math.round(off), 229, { font: 'small', color: '#ffe04a' });
  }
}
