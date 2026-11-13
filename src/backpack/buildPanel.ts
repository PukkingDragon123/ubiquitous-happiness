// The backpack's BUILD panel (pixel UI kit): every set the packed items feed, with 2/4/6 tier pips, the active
// bonus, the next threshold, and the skills the bag grants (slot keys 1-4). Hover a row for all of its tiers.
import type { Input } from '../core/input';
import type { Run } from '../game/run';
import { PixelUI, type TipLine } from '../ui/pixel';
import { setBonuses, skillItem, SKILL_NAMES, ABILITY_NAME, type SetState } from '../game/items';
import type { AbilityId } from '../game/run';
import { skillSlotsFor } from '../skills/registry';

export class BuildPanel {
  ui = new PixelUI({ targetH: 270 });
  private slide = 0;
  /** the panel's last rect in css pixels (for dodging) */
  rect = { x: 0, y: 0, w: 0, h: 0 };
  private pr = 1;
  resize(w: number, h: number, pr = 1) { this.pr = pr; this.ui.resize(w, h, pr); }

  /** draw this frame; show = 0..1 (slides in from the right) */
  draw(input: Input | null, dt: number, run: Run | null, show: number, highlight: string[] = []) {
    const ui = this.ui;
    ui.begin(input, dt);
    this.slide += (show - this.slide) * Math.min(1, dt * 10);
    if (run && this.slide > 0.01) this.panel(run, highlight); else this.rect = { x: 0, y: 0, w: 0, h: 0 };
    ui.end();
  }


  private panel(run: Run, highlight: string[]) {
    const ui = this.ui;
    const sets = setBonuses(run).slice(0, 7);
    const st = run.stats();
    const skills = skillSlotsFor(st).filter((x): x is string => !!x);
    const W = 142, rowH = 21;
    const H = 24 + Math.max(1, sets.length) * rowH + (skills.length ? 30 : 0) + 6;
    const x = Math.round(ui.w - (W + 6) * this.slide), y = 6;
    ui.panel('dark', x, y, W, H, 'BUILD');
    const k = ui.scale / this.pr;
    this.rect = { x: x * k, y: y * k, w: W * k, h: H * k };
    let yy = y + 20;
    if (!sets.length) { ui.textBox('Pack tagged items (mage, warrior, toymaker...) to stack set bonuses at 2, 4 and 6.', x + 7, yy, W - 14, { font: 'tiny', color: '#a8b0c8' }); yy += rowH; }
    for (const s of sets) {
      const hot = ui.hover(x + 3, yy - 1, W - 6, rowH - 1);
      const lit = highlight.includes(s.tag);
      if (hot || lit) ui.fill(x + 4, yy - 1, W - 8, rowH - 2, s.color, lit ? 0.22 + Math.sin(ui.t * 6) * 0.06 : 0.14);
      // a little faceted gem in the set colour, then the set name and its tag
      ui.fill(x + 8, yy + 1, 5, 7, '#0a0814'); ui.fill(x + 7, yy + 2, 7, 5, '#0a0814');
      ui.fill(x + 8, yy + 2, 5, 5, s.color); ui.fill(x + 9, yy + 2, 2, 1, '#ffffff'); ui.fill(x + 8, yy + 6, 5, 1, '#000000', 0.35);
      ui.text(s.name.toUpperCase(), x + 17, yy + 1, { font: 'tiny', color: s.tier ? s.color : '#c8c0b0', shadow: '#000' });
      // pips: one per item up to the top tier, grouped at the 2 / 4 / 6 thresholds
      const top = s.tiers[s.tiers.length - 1].n;
      let px = x + W - 8 - top * 4 - (top / 2 - 1) * 2;
      for (let n = 1; n <= top; n++) {
        const on = s.count >= n, tierOn = s.tier >= n;
        ui.fill(px, yy + 2, 3, 5, on ? (tierOn ? s.color : '#e8e0d0') : '#2a2c3a');
        if (on) ui.fill(px, yy + 2, 3, 1, '#ffffff', 0.55);
        px += 4 + (n % 2 === 0 ? 2 : 0);
      }
      const act = [...s.tiers].reverse().find((t) => t.active), next = s.tiers.find((t) => !t.active);
      const line = act ? act.text : next ? `${s.count}/${next.n}: ${next.text}` : '';
      ui.clip(x + 6, yy + 9, W - 12, 10);
      ui.text(line, x + 8, yy + 11, { font: 'tiny', color: act ? '#f0ecd8' : '#7a8098' });
      ui.unclip();
      if (hot) {
        const lines: TipLine[] = [{ text: `${s.name} (${s.tag})`, color: s.color, font: 'body' }, { text: `${s.count} packed`, color: '#a8b0c8', font: 'small' }];
        for (const t of s.tiers) lines.push({ text: `${t.n}  ${t.text}`, color: t.active ? '#ffe9a0' : '#7a8098', font: 'small' });
        ui.tooltip(lines, { kind: 'dark' });
      }
      yy += rowH;
    }
    if (skills.length) {
      ui.fill(x + 6, yy - 1, W - 12, 1, '#3a4058');
      ui.text('SKILLS', x + 7, yy + 2, { font: 'tiny', color: '#a8b0c8' });
      let sx = x + 36;
      skills.forEach((id, i) => {
        ui.frame('slot', sx, yy, 20, 20);
        const it = skillItem(id);
        if (it) ui.item(it.id, sx + 2, yy + 2, 16, 16);
        ui.text(String(i + 1), sx + 1, yy + 13, { font: 'tiny', color: '#ffe9a0', shadow: '#000' });
        if (ui.hover(sx, yy, 20, 20)) ui.tooltip([{ text: SKILL_NAMES[id] ?? ABILITY_NAME[id as AbilityId] ?? id, color: '#ffe9a0' }, { text: `key ${i + 1}`, color: '#a8b0c8', font: 'small' }], { kind: 'dark' });
        sx += 22;
      });
    }
  }
}
export type { SetState };
