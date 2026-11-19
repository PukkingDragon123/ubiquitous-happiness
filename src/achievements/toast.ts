// The unlock toast: a kit card (lacquered wood, brass corners) that drops in from the top of any screen with the
// achievement's medal, "Unlocked: ..." and the cosmetic's icon in a slot, a shine sweep and a jingle. Queued; one at
// a time.
import type { Game } from '../game/game';
import { PixelUI } from '../ui/pixel/ui';
import { KIT } from '../ui/pixel/skins';
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
    // a lacquered kit card sized to its text (the full cosmetic name must fit; never truncate), dropping in from the
    // top with an overshoot: the medal hangs off its left end, the cosmetic sits in a slot on the right
    const label = `ACHIEVEMENT · ${(a?.name ?? 'ACHIEVEMENT').toUpperCase()}`, unlock = `Unlocked: ${cd?.name ?? reward}`;
    const need = Math.max(ui.measure(label, 'small'), ui.measure(unlock, 'body')) + 46 + 44;
    const W = Math.min(ui.w - 24, Math.max(220, Math.ceil(need))), H = 46;
    const k = t < IN ? easeOutBack(t / IN, 1.6) : t > IN + HOLD ? 1 - (t - IN - HOLD) / OUT : 1;
    const x = Math.round((ui.w - W) / 2), y = Math.round(-H - 10 + (H + 20) * Math.max(0, k));
    const ctx = ui.ctx;
    ui.fill(x + 3, y + 3, W, H, '#000000', 0.3);
    ui.frame('wood', x, y, W, H);
    // a shine sweep across the inset
    const sx = x + ((t * 240) % (W + 90)) - 45;
    ctx.save(); ctx.beginPath(); ctx.rect(x + 7, y + 7, W - 14, H - 14); ctx.clip();
    for (let i = 0; i < H; i++) { ui.fill(sx + i * 0.5, y + i, 7, 1, '#ffffff', 0.12); ui.fill(sx + 11 + i * 0.5, y + i, 2, 1, '#ffffff', 0.09); }
    ctx.restore();
    // the medal swinging on the left end, the reward in a recessed slot on the right
    ui.img(medal(a?.emblem ?? 'crown', a?.tier ?? 'gold'), x + 8, y + 6 + Math.round(Math.sin(t * 5) * 1));
    const ix = x + W - 38;
    ui.frame('slot', ix, y + 9, 28, 28);
    ui.img(cosmeticIcon(reward), ix + 4, y + 13);
    // twinkles round the medal and the slot
    for (let i = 0; i < 5; i++) {
      const ph = t * 3 + i * 1.7;
      if (Math.sin(ph) > 0.4) { const tx = [x + 6, x + 34, x + 30, ix - 3, ix + 30][i], ty = y + [5, 9, 38, 8, 36][i]; ui.fill(tx, ty - 1, 1, 3, '#fff6c0'); ui.fill(tx - 1, ty, 3, 1, '#fff6c0'); }
    }
    const tx = x + 42;
    ui.text(label, tx, y + 11, { font: 'small', color: KIT.brass[3], outline: KIT.ink });
    ui.text(unlock, tx, y + 24, { font: 'body', color: KIT.cream[3], outline: KIT.ink });
  }
}
