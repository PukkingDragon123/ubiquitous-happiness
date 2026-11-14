// The dungeon run's HUD layer: agent L's Hud (src/ui/hud3.ts: hearts, stamina, flasks, counters, the strip map,
// the boss bar, title cards, pickup streaks) drawn into one PixelUI together with the run's own interactive bits:
// [key] prompts anchored in the world, the post office's mail picker and the pause menu.
//
//   const hud = new DungeonHud();  overlays: [..., hud.ui.layer];  hud.resize(w, h, pr)
//   const act = hud.draw(dt, state, input)   -> 'resume' | 'bag' | 'quit' | 'mail:send' | 'mail:close' | 'mail:<uid>' | null
//   hud.l.title(...) / hud.l.pickup(id) / hud.l.flash('pack')
import { PixelUI } from '../ui/pixel/ui';
import { Hud, type HudData } from '../ui/hud3';
import { audio } from '../audio/audio';
import { ITEMS, getItem } from '../game/items';
import type { ItemInst } from '../game/run';

export interface HudAnchor { x: number; y: number; on: boolean }
export interface Prompt { key: string; label: string; at?: HudAnchor; bad?: boolean }
export interface MailState { items: ItemInst[]; picked: Set<number>; capacity: number; used: number }

/** everything the dungeon HUD shows: L's HudData + the run's prompts and menus */
export interface DungeonHudState {
  data: HudData;
  prompt: Prompt | null;
  paused: boolean;
  mail: MailState | null;
  /** "SUNLIT REEF · FLOOR 1/3" for the pause menu */
  where: string;
}

const C = { white: '#f4f0e6', red: '#ff6a5a', ink: '#06080e' };

export class DungeonHud {
  ui = new PixelUI();
  l = new Hud();
  resize(w: number, h: number, pr: number) { this.ui.resize(w, h, pr); this.l.resize(w, h, pr); }

  draw(dt: number, s: DungeonHudState, input: Parameters<PixelUI['begin']>[0], extra?: (ui: PixelUI) => void): string | null {
    const ui = this.ui;
    ui.drawCursor = s.paused || !!s.mail;
    ui.begin(input, dt);
    this.l.drawInto(ui, dt, s.data);
    let out: string | null = null;
    if (s.prompt && !s.paused && !s.mail) this.prompt(s.prompt);
    extra?.(ui);
    if (s.mail) out = this.mailPicker(s.mail);
    if (s.paused) out = this.pauseMenu(s) ?? out;
    ui.end();
    return out;
  }

  private prompt(p: Prompt) {
    const ui = this.ui;
    const at = p.at && p.at.on ? p.at : { x: ui.w / 2, y: ui.h - 46, on: true };
    const lw = ui.measure(p.label, 'small');
    const kw = p.key ? ui.keycap(p.key, 0, -100) : 0;
    const w = lw + (kw ? kw + 4 : 0);
    const x = Math.round(Math.max(4, Math.min(ui.w - w - 4, at.x - w / 2))), y = Math.round(Math.max(4, at.y - 22));
    ui.fill(x - 3, y - 2, w + 6, 15, '#000000', 0.55);
    if (kw) ui.keycap(p.key, x, y, true);
    ui.text(p.label, x + (kw ? kw + 4 : 0), y + 3, { font: 'small', color: p.bad ? C.red : C.white, outline: C.ink });
  }

  private mailPicker(m: MailState): string | null {
    const ui = this.ui;
    const cols = 7, cell = 26;
    const rows = Math.max(1, Math.ceil(m.items.length / cols));
    const w = cols * cell + 28, h = rows * cell + 74;
    const x = Math.round((ui.w - w) / 2), y = Math.round((ui.h - h) / 2);
    ui.panel('paper', x, y, w, h, 'POST OFFICE');
    ui.text(`MAILBAG ${m.used}/${m.capacity} CELLS · CLICK TO PICK`, x + w / 2, y + 18, { font: 'small', color: m.used > m.capacity ? '#c8283a' : '#3a2a1a', align: 'center' });
    let out: string | null = null;
    m.items.forEach((it, i) => {
      const ix = x + 14 + (i % cols) * cell, iy = y + 32 + Math.floor(i / cols) * cell;
      const on = m.picked.has(it.uid);
      ui.fill(ix, iy, cell - 2, cell - 2, on ? '#ffe07a' : '#2a1a10', on ? 0.9 : 0.25);
      ui.item(it.id, ix + 1, iy + 1, cell - 4, cell - 4, it.level ?? 1, 1);
      if ((it.n ?? 1) > 1) ui.text(String(it.n), ix + cell - 3, iy + cell - 10, { font: 'small', color: '#ffffff', outline: '#000', align: 'right' });
      if (ui.hover(ix, iy, cell - 2, cell - 2)) {
        const cells = getItem(it.id).shape.length;
        ui.tooltip(ui.itemTip(it.id, it.level ?? 1, [`${cells} cell${cells > 1 ? 's' : ''} · ${ITEMS[it.id]?.kind === 'material' ? 'to your materials' : 'to your stash'}`]));
        if (ui.pressed) { out = 'mail:' + it.uid; audio.play('k_click1', { vol: 0.3, dry: true }); }
      }
    });
    if (!m.items.length) ui.text('YOUR PACK IS EMPTY', x + w / 2, y + 40, { font: 'small', color: '#6a5a4a', align: 'center' });
    const by = y + h - 26;
    if (ui.button('mail:send', `SEND ${m.picked.size} HOME`, x + 12, by, w / 2 - 16, 18, { style: 'green', disabled: !m.picked.size || m.used > m.capacity, key: 'Enter' })) out = 'mail:send';
    if (ui.button('mail:close', 'DONE', x + w / 2 + 4, by, w / 2 - 16, 18, { style: 'wood', key: 'Escape' })) out = 'mail:close';
    return out;
  }

  private pauseMenu(s: DungeonHudState): string | null {
    const ui = this.ui;
    ui.fill(0, 0, ui.w, ui.h, '#000000', 0.5);
    const w = 170, h = 124, x = Math.round((ui.w - w) / 2), y = Math.round((ui.h - h) / 2);
    ui.panel('wood', x, y, w, h, 'PAUSED');
    const ix = x + 14, bw = w - 28;
    let out: string | null = null;
    if (ui.button('p:resume', 'RESUME', ix, y + 20, bw, 22, { style: 'green' })) out = 'resume';
    if (ui.button('p:bag', 'BACKPACK', ix, y + 46, bw, 22, { style: 'wood', key: 'Tab' })) out = 'bag';
    if (ui.button('p:quit', 'QUIT TO HIDEOUT', ix, y + 72, bw, 22, { style: 'red', tip: ['The run is saved: RESUME it from the hideout.'] })) out = 'quit';
    ui.text(s.where, x + w / 2, y + 102, { font: 'small', color: '#ffe7b0', outline: '#140a06', align: 'center' });
    if (out) audio.play('k_click1', { vol: 0.3, dry: true });
    return out;
  }
}
