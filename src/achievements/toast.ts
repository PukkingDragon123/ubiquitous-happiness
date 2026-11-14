// The unlock toast: a crisp pixel banner that drops in from the top of any screen with the achievement's medal,
// "COSMETIC UNLOCKED: ..." and the cosmetic's icon, a shine sweep and a jingle. Queued; one at a time.
import type { Game } from '../game/game';
import { PixelUI } from '../ui/pixel/ui';
import { audio } from '../audio/audio';
import { easeOutBack } from '../core/math';
import { medal } from './medals';
import { cosmeticIcon } from '../cosmetics/icons';
import { COSMETIC } from '../cosmetics';
import { ACH } from './index';

const IN = 0.4, HOLD = 3.8, OUT = 0.35;

export class Toasts {
  ui = new PixelUI({ targetH: 260 });
  private q: { ach: string; reward: string }[] = [];
  private cur: { ach: string; reward: string; t: number } | null = null;
  private size = '';
  constructor(private game: Game) {}
  push(ach: string, reward: string) { this.q.push({ ach, reward }); }
  get busy() { return !!this.cur || this.q.length > 0; }

  /** advance + draw; returns the overlay layer while a toast is up */
  frame(dt: number): { scene: import('three').Scene; camera: import('three').Camera } | null {
    if (!this.cur) {
      const n = this.q.shift();
      if (!n) return null;
      this.cur = { ...n, t: 0 };
      audio.play('jin_rare1', { vol: 0.55, dry: true });
      audio.play('pickup_sparkle1', { vol: 0.35, dry: true, delay: 0.25 });
    }
    const g = this.game, pr = g.renderer.getPixelRatio();
    const key = `${g.w}x${g.h}@${pr}`;
    if (key !== this.size) { this.size = key; this.ui.resize(g.w, g.h, pr); }
    const c = this.cur;
    c.t += Math.min(dt, 0.1);
    if (c.t > IN + HOLD + OUT) { this.cur = null; return this.q.length ? this.frame(0) : null; }
    const ui = this.ui;
    ui.begin(null, dt);
    this.draw(c.ach, c.reward, c.t);
    ui.end();
    return ui.layer;
  }

  private draw(achId: string, reward: string, t: number) {
    const ui = this.ui;
    const a = ACH[achId], cd = COSMETIC[reward];
    // size the banner to its text (the full cosmetic name must fit; never truncate)
    const label = `${(a?.name ?? 'ACHIEVEMENT').toUpperCase()} COMPLETE`, unlock = `UNLOCKED: ${(cd?.name ?? reward).toUpperCase()}`;
    const need = Math.max(ui.measure(label, 'small'), ui.measure(unlock, 'body')) + 38 + 36;
    const W = Math.min(ui.w - 40, Math.max(220, Math.ceil(need))), H = 36;
    const k = t < IN ? easeOutBack(t / IN, 1.6) : t > IN + HOLD ? 1 - (t - IN - HOLD) / OUT : 1;
    const x = Math.round((ui.w - W) / 2), y = Math.round(-H - 8 + (H + 18) * Math.max(0, k));
    const ctx = ui.ctx;
    // banner body: notched ribbon tails, gold double border, deep navy face
    // ribbon tails with a V notch, behind the banner ends
    const th = H - 10, mid = (th - 1) / 2;
    for (let i = 0; i < th; i++) {
      const notch = Math.round(6 * (1 - Math.abs(i - mid) / mid)), w = 16 - notch;
      const col = i === 0 || i === th - 1 ? '#0e0a14' : i === 1 ? '#e04a3a' : i === th - 2 ? '#5a0a12' : '#a81c24';
      ui.fill(x - 14 + notch, y + 5 + i, w, 1, col); ui.fill(x - 14 + notch, y + 5 + i, 1, 1, '#0e0a14');
      ui.fill(x + W - 2, y + 5 + i, w, 1, col); ui.fill(x + W - 3 + w, y + 5 + i, 1, 1, '#0e0a14');
    }
    ui.fill(x, y, W, H, '#0e0a14');
    ui.fill(x + 1, y + 1, W - 2, H - 2, '#f0c040');
    ui.fill(x + 2, y + 2, W - 4, H - 4, '#8a520a');
    ui.fill(x + 3, y + 3, W - 6, H - 6, '#0e1230');
    ui.fill(x + 3, y + 3, W - 6, 1, '#2a3266');
    ui.fill(x + 3, y + H - 4, W - 6, 1, '#060818');
    // shine sweep across the face
    const sx = x + ((t * 220) % (W + 80)) - 40;
    ctx.save(); ctx.beginPath(); ctx.rect(x + 3, y + 3, W - 6, H - 6); ctx.clip();
    for (let i = 0; i < H; i++) { ui.fill(sx + i * 0.5, y + i, 6, 1, '#ffffff', 0.18); ui.fill(sx + 10 + i * 0.5, y + i, 2, 1, '#ffffff', 0.12); }
    ctx.restore();
    // medal poking out over the left, the cosmetic in a slot on the right
    ui.img(medal(a?.emblem ?? 'crown', a?.tier ?? 'gold'), x + 6, y - 2 + Math.round(Math.sin(t * 5) * 1));
    const ix = x + W - 30;
    ui.frame('slot', ix, y + 6, 24, 24);
    ui.img(cosmeticIcon(reward), ix + 2, y + 8);
    // twinkles
    for (let i = 0; i < 4; i++) {
      const ph = t * 3 + i * 1.7;
      if (Math.sin(ph) > 0.4) { const tx = x + 4 + [2, 26, 30, 8][i], ty = y + [2, 4, 26, 30][i]; ui.fill(tx, ty - 1, 1, 3, '#fff6c0'); ui.fill(tx - 1, ty, 3, 1, '#fff6c0'); }
    }
    const tx = x + 38;
    ui.text(label, tx, y + 7, { font: 'small', color: '#ffe07a', outline: '#1a0c04' });
    ui.text(unlock, tx, y + 19, { font: 'body', color: '#ffffff', color2: '#cfe6ff', outline: '#000814' });
  }
}
