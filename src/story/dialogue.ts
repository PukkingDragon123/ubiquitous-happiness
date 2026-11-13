// Dialogue: chunky pixel-art speech bubbles anchored over the speaker in 3D (they follow the entity and stay on
// screen, the tail pointing at the speaker even when it is off to one side), a typewriter with per-character voice
// blips (pitch per speaker), punctuation pauses, inline emphasis tags and a speaker name tag. Lines can offer up to
// three choices (click or 1-3). Advance with click / E / Space; hold to fast-forward.
//
//   const dlg = new Dialogue(ui, () => camera);
//   dlg.speaker({ id: 'crab', name: 'MR. CRAB', color: '#e8603a', voice: 'crab_click', pitch: 0.9, anchor: () => crab.head() });
//   const picks = await dlg.play([
//     { who: 'crab', text: 'It ain\'t much, kid. Neither are you. {shake}Yet.{/shake}' },
//     { who: 'kid', text: '...', choices: [{ text: 'Thanks!' }, { text: 'A toothpick?', then: [{ who: 'crab', text: 'Make it work.' }] }] },
//   ]);                                               -> the index picked at each choice
//   dlg.bark('crab', 'Faster!', 2)                    a non-blocking line that times out (gameplay commentary)
//   each frame, inside ui.begin()/end():  dlg.update(dt, input); dlg.draw()
//   while dlg.blocking the owner should keep gameplay input away from the player.
//
// Tags: {shake}..{/shake} {wave}..{/wave} {red} {gold} {blue} {green} {pink} {grey}..{/red} etc, {p=0.4} (pause),
// {slow}..{/slow} (half speed). Unknown tags are ignored.
import * as THREE from 'three';
import type { Input } from '../core/input';
import type { PixelUI } from '../ui/pixel/ui';
import { measure, lineH, type FontName } from '../ui/pixel/font';
import { audio } from '../audio/audio';
import { POST } from '../gfx/post';

export interface Speaker {
  id: string;
  name: string;
  /** name tag colour */
  color: string;
  /** sfx id (variant group) for the voice blips and its playback rate */
  voice: string; pitch: number; vol?: number;
  /** world point over the speaker's head (null: off screen / a narrator caption) */
  anchor?: () => THREE.Vector3 | null;
  /** called while the speaker is "talking" (typing) */
  onTalk?: (k: number) => void;
}

export interface Choice { text: string; then?: Line[]; do?: () => void }
export interface Line {
  who: string;
  text: string;
  choices?: Choice[];
  /** auto-advance this many seconds after it finished typing (cinematic lines) */
  auto?: number;
  /** run when the line starts */
  do?: () => void;
  /** typing speed multiplier */
  speed?: number;
}

const COLORS: Record<string, string> = { red: '#d8283a', gold: '#c88a08', blue: '#2a64d0', green: '#2a9a3a', pink: '#d84a8a', grey: '#7a7078', white: '#ffffff' };
const INK = '#2a1a24';
const FONT: FontName = 'body';

interface Ch { c: string; shake: boolean; wave: boolean; color: string; pause: number; slow: boolean }

/** parse the inline tags into styled characters */
export function parseTags(src: string): Ch[] {
  const out: Ch[] = [];
  let shake = false, wave = false, slow = false, pause = 0;
  const col: string[] = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === '{') {
      const j = src.indexOf('}', i);
      if (j > i) {
        const tag = src.slice(i + 1, j);
        const close = tag.startsWith('/');
        const name = close ? tag.slice(1) : tag;
        if (name === 'shake') shake = !close;
        else if (name === 'wave') wave = !close;
        else if (name === 'slow') slow = !close;
        else if (name.startsWith('p=')) pause += Number(name.slice(2)) || 0;
        else if (COLORS[name] || name.startsWith('#')) { if (close) col.pop(); else col.push(COLORS[name] ?? name); }
        i = j + 1;
        continue;
      }
    }
    out.push({ c: src[i], shake, wave, slow, color: col[col.length - 1] ?? INK, pause });
    pause = 0;
    i++;
  }
  return out;
}

/** greedy wrap of styled chars to maxW pixels; returns [start, end) index pairs per line */
function wrapChars(chs: Ch[], maxW: number): [number, number][] {
  const lines: [number, number][] = [];
  const text = chs.map((c) => c.c).join('');
  let start = 0;
  while (start < chs.length) {
    // skip a leading space
    while (start < chs.length && chs[start].c === ' ') start++;
    if (start >= chs.length) break;
    let end = start, lastSpace = -1;
    while (end < chs.length && chs[end].c !== '\n') {
      if (chs[end].c === ' ') lastSpace = end;
      if (measure(text.slice(start, end + 1), FONT) > maxW && end > start) { if (lastSpace > start) end = lastSpace; break; }
      end++;
    }
    lines.push([start, end]);
    start = end < chs.length && chs[end].c === '\n' ? end + 1 : end;
  }
  return lines;
}

interface Active {
  line: Line;
  sp: Speaker;
  chs: Ch[];
  lines: [number, number][];
  shown: number;      // characters revealed (float)
  t: number;          // time on this line
  doneT: number;      // time since fully typed
  pause: number;
  w: number; h: number;
  bark: boolean;
  life: number;
  pick: number;
  blip: number;
}

export class Dialogue {
  speakers = new Map<string, Speaker>();
  /** a conversation that wants the player's attention (the owner should suspend gameplay input) */
  blocking = false;
  /** characters per second */
  cps = 34;
  /** the bubble's max text width (UI px) */
  maxW = 156;
  private queue: Line[] = [];
  private cur: Active | null = null;
  private barks: Active[] = [];
  private resolve: ((picks: number[]) => void) | null = null;
  private picks: number[] = [];
  private holdT = 0;
  private t = 0;
  private v = new THREE.Vector3();
  private hoverChoice = -1;

  constructor(public ui: PixelUI, public cam: () => THREE.Camera) {}

  speaker(s: Speaker) { this.speakers.set(s.id, s); return s; }

  /** run a conversation; resolves with the index chosen at each choice */
  play(lines: Line[]): Promise<number[]> {
    this.finish();
    this.queue = [...lines];
    this.picks = [];
    this.blocking = true;
    this.barks = [];
    const p = new Promise<number[]>((res) => { this.resolve = res; });
    this.next();
    return p;
  }

  /** a non-blocking line over a speaker that disappears after `life` seconds (after typing) */
  bark(who: string, text: string, life = 2.4) {
    const sp = this.speakers.get(who);
    if (!sp) return;
    this.barks = this.barks.filter((b) => b.sp.id !== who);
    if (this.barks.length > 2) this.barks.shift();
    this.barks.push(this.make({ who, text }, sp, true, life));
  }

  get busy() { return !!this.cur; }
  /** drop everything (skips, screen exits) */
  finish() {
    const r = this.resolve;
    this.resolve = null; this.cur = null; this.queue = []; this.blocking = false; this.barks = [];
    r?.(this.picks);
  }

  private make(line: Line, sp: Speaker, bark: boolean, life = 0): Active {
    const chs = parseTags(line.text);
    const maxW = bark ? 130 : this.maxW;
    const lines = wrapChars(chs, maxW);
    const plain = chs.map((c) => c.c).join('');
    let w = 0;
    for (const [a, b] of lines) w = Math.max(w, measure(plain.slice(a, b), FONT));
    const lh = lineH(FONT);
    const nameW = measure(sp.name, 'small') + 10;
    w = Math.max(w + 14, nameW + 10, 40);
    const h = lines.length * lh + 12;
    return { line, sp, chs, lines, shown: 0, t: 0, doneT: 0, pause: 0, w, h, bark, life, pick: -1, blip: 0 };
  }

  private next() {
    const line = this.queue.shift();
    if (!line) {
      this.cur = null; this.blocking = false;
      const r = this.resolve; this.resolve = null;
      r?.(this.picks);
      return;
    }
    const sp = this.speakers.get(line.who) ?? { id: line.who, name: line.who.toUpperCase(), color: '#5a6a8a', voice: 'k_tick', pitch: 1 };
    this.cur = this.make(line, sp, false);
    line.do?.();
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number, input: Input | null) {
    this.t += dt;
    for (const b of this.barks) this.type(b, dt, 1);
    this.barks = this.barks.filter((b) => b.doneT < b.life);
    const a = this.cur;
    if (!a) { this.holdT = 0; return; }
    const adv = !!input && (input.keyHit('Space') || input.keyHit('KeyE') || input.keyHit('Enter') || (input.pressed.has('Mouse0') && !a.line.choices));
    const held = !!input && (input.key('Space') || input.key('KeyE') || input.down.has('Mouse0'));
    this.holdT = held ? this.holdT + dt : 0;
    const fast = this.holdT > 0.3;
    this.type(a, dt, fast ? 6 : 1);
    const total = a.chs.length;
    const typed = a.shown >= total;
    if (input) for (const k of ['Space', 'KeyE', 'Enter', 'Mouse0']) input.pressed.delete(k);
    // a number key answers a choice straight away (even mid-typing)
    if (a.line.choices?.length && input) {
      for (let i = 0; i < a.line.choices.length; i++) if (input.keyHit('Digit' + (i + 1)) || input.keyHit('Numpad' + (i + 1))) { a.shown = total; this.choose(i); return; }
    }
    if (!typed) {
      if (adv && a.t > 0.08) { a.shown = total; a.pause = 0; }
      return;
    }
    // choices
    if (a.line.choices?.length) {
      const n = a.line.choices.length;
      void n;
      if (input && this.hoverChoice >= 0 && this.ui.released && a.doneT > 0.15) this.choose(this.hoverChoice);
      return;
    }
    const auto = a.line.auto !== undefined && a.doneT >= a.line.auto;
    if ((adv && a.doneT > 0.06) || auto || (fast && a.doneT > 0.18)) {
      if (adv) audio.play('k_tick1', { vol: 0.15, dry: true, rate: 1.4 });
      this.next();
    }
  }

  /** answer the current line's choice i (keys, clicks, or scripts/tests) */
  choose(i: number) {
    const a = this.cur;
    const c = a?.line.choices?.[i];
    if (!a || !c) return;
    this.picks.push(i);
    audio.play('k_confirm1', { vol: 0.4, dry: true });
    c.do?.();
    if (c.then?.length) this.queue.unshift(...c.then);
    this.next();
  }

  /** reveal characters (with punctuation pauses + voice blips) */
  private type(a: Active, dt: number, speed: number) {
    a.t += dt;
    const total = a.chs.length;
    if (a.shown >= total) { a.doneT += dt; return; }
    if (a.pause > 0) { a.pause -= dt * speed; if (a.pause > 0) return; }
    const i0 = Math.floor(a.shown);
    const cur = a.chs[Math.min(total - 1, i0)];
    const rate = this.cps * (a.line.speed ?? 1) * speed * (cur?.slow ? 0.45 : 1);
    a.shown = Math.min(total, a.shown + dt * rate);
    const i1 = Math.floor(a.shown);
    for (let i = i0; i < i1; i++) {
      const ch = a.chs[i];
      // punctuation: let it breathe
      const nx = a.chs[i + 1]?.c ?? ' ';
      if (ch.c === ',' || ch.c === ';' || ch.c === ':') a.pause = 0.12;
      else if ((ch.c === '.' || ch.c === '!' || ch.c === '?') && (nx === ' ' || nx === '\n')) a.pause = 0.28;
      else if (ch.c === '—') a.pause = 0.22;
      if (a.chs[i + 1]?.pause) a.pause += a.chs[i + 1].pause;
      // a blip every other letter, never on spaces or punctuation
      if (/[A-Za-z0-9]/.test(ch.c)) {
        a.blip++;
        if (a.blip % 2 === 1 && speed < 4) {
          const sp = a.sp;
          const up = ch.c === ch.c.toUpperCase() && /[A-Z]/.test(ch.c) ? 1.08 : 1;
          audio.play(sp.voice, { vol: (sp.vol ?? 0.32) * (a.bark ? 0.7 : 1) * (ch.shake ? 1.3 : 1), rate: sp.pitch * up * (0.94 + ((ch.c.charCodeAt(0) * 7) % 13) / 100), jitter: 0.03, dry: true });
        }
        a.sp.onTalk?.(1);
      }
      if (a.pause > 0) { a.shown = i + 1; break; }
    }
  }

  // ---------------------------------------------------------------- drawing
  draw() {
    const ui = this.ui;
    this.hoverChoice = -1;
    for (const b of this.barks) this.bubble(b);
    if (this.cur) this.bubble(this.cur);
    void ui;
  }

  /** letterbox bar height in UI px (bubbles stay off the bars) */
  private bar() {
    const ui = this.ui;
    const k = POST.uLetterbox.value * Math.max(0, 1 - (ui.w / ui.h) / 2.39) * 0.5;
    return Math.ceil(ui.h * k);
  }

  private project(p: THREE.Vector3): { x: number; y: number; on: boolean; behind: boolean } {
    const ui = this.ui;
    const v = this.v.copy(p).project(this.cam());
    const behind = v.z > 1;
    let x = (v.x * 0.5 + 0.5) * ui.w, y = (1 - (v.y * 0.5 + 0.5)) * ui.h;
    if (behind) { x = ui.w - x; y = ui.h; }
    return { x, y, on: !behind && x > 0 && x < ui.w && y > 0 && y < ui.h, behind };
  }

  private bubble(a: Active) {
    const ui = this.ui;
    const bar = this.bar();
    const anchor = a.sp.anchor?.() ?? null;
    const W = a.w, H = a.h;
    const pop = Math.min(1, a.t / 0.12);
    const m = 4;
    let bx: number, by: number, tx: number | null = null, ty = 0;
    if (anchor) {
      const s = this.project(anchor);
      bx = s.x - W / 2;
      by = s.y - H - 12;
      // keep on screen (and off the letterbox bars)
      const minY = bar + m + 7, maxY = ui.h - bar - m - H;
      const cx = Math.max(m, Math.min(ui.w - m - W, bx));
      const cy = Math.max(minY, Math.min(maxY, by));
      tx = Math.max(cx + 6, Math.min(cx + W - 7, s.x));
      ty = s.y;
      bx = cx; by = cy;
      // the speaker is above the bubble's spot (clamped down): put the tail on top
      if (s.y < by) ty = s.y;
    } else {
      // narrator / off-screen: a caption bubble low in the frame
      bx = (ui.w - W) / 2; by = ui.h - bar - H - 10;
    }
    bx = Math.round(bx); by = Math.round(by + (1 - pop) * 4);
    const bg = a.bark ? '#fdf6e8' : '#fffaf0', shade = '#e6d8c2', line = '#1a1020';
    // ---- body: a 2 px rounded rectangle with a 1 px ink outline + a bottom shade
    ui.block(bx, by, W, H);
    ui.fill(bx + 2, by, W - 4, H, line); ui.fill(bx, by + 2, W, H - 4, line); ui.fill(bx + 1, by + 1, W - 2, H - 2, line);
    ui.fill(bx + 2, by + 1, W - 4, H - 2, bg); ui.fill(bx + 1, by + 2, W - 2, H - 4, bg);
    ui.fill(bx + 2, by + H - 3, W - 4, 1, shade); ui.fill(bx + 1, by + H - 4, 1, 1, shade); ui.fill(bx + W - 2, by + H - 4, 1, 1, shade);
    ui.fill(bx + 3, by + 2, 2, 1, '#ffffff');
    // ---- tail toward the speaker
    if (tx !== null) {
      const down = ty > by + H;
      const up = ty < by;
      if (down || up) {
        const x0 = Math.round(tx), lean = Math.sign(Math.round(tx) - (bx + W / 2)) || 1;
        for (let i = 0; i < 6; i++) {
          const w = Math.max(1, 5 - i);
          const yy = down ? by + H - 1 + i : by - i;
          const xx = x0 - Math.floor(w / 2) + Math.round(i * 0.5 * lean);
          ui.fill(xx - 1, yy, w + 2, 1, line);
          if (i < 5) ui.fill(xx, yy, w, 1, bg);
        }
      }
    }
    // ---- name tag
    if (a.sp.name) {
      const nw = measure(a.sp.name, 'small') + 8;
      const nx = bx + 6, ny = by - 6;
      ui.fill(nx - 1, ny - 1, nw + 2, 10, line);
      ui.fill(nx, ny, nw, 8, a.sp.color);
      ui.fill(nx, ny, nw, 1, '#ffffff');
      ui.text(a.sp.name, nx + 4, ny + 1, { font: 'small', color: '#ffffff', shadow: '#1a1020' });
    }
    // ---- the text, one character at a time
    const lh = lineH(FONT);
    const plain = a.chs.map((c) => c.c).join('');
    const shown = Math.floor(a.shown);
    a.lines.forEach(([s, e], li) => {
      let x = bx + 7;
      const y = by + 6 + li * lh;
      for (let i = s; i < e && i < shown; i++) {
        const ch = a.chs[i];
        const xx = bx + 7 + measure(plain.slice(s, i), FONT);
        x = xx;
        if (ch.c === ' ') continue;
        let dx = 0, dy = 0;
        if (ch.shake) { const q = Math.floor(this.t * 20) + i * 7; dx = ((q * 13) % 3) - 1; dy = ((q * 7) % 3) - 1; }
        if (ch.wave) dy += Math.round(Math.sin(this.t * 7 - i * 0.7) * 1.5);
        // a fresh letter pops up a pixel
        const age = a.shown - i;
        if (age < 1.5) dy -= 1;
        ui.text(ch.c, x + dx, y + dy, { font: FONT, color: ch.color });
      }
    });
    // ---- next indicator / choices
    const typed = a.shown >= a.chs.length;
    if (!a.bark && typed && !a.line.choices?.length && a.line.auto === undefined) {
      const k = Math.floor(this.t * 3) % 2;
      const ix = bx + W - 9, iy = by + H - 7 + k;
      ui.fill(ix, iy, 5, 1, line); ui.fill(ix + 1, iy + 1, 3, 1, line); ui.fill(ix + 2, iy + 2, 1, 1, line);
    }
    if (!a.bark && typed && a.line.choices?.length) this.choices(a, bx, by, W, H);
  }

  private choices(a: Active, bx: number, by: number, W: number, H: number) {
    const ui = this.ui;
    const cs = a.line.choices!;
    const rowH = 16;
    let w = 0;
    for (const c of cs) w = Math.max(w, measure(c.text, FONT) + 30);
    w = Math.max(w, 90);
    const total = cs.length * (rowH + 2);
    const bar = this.bar();
    let x = Math.round(bx + W / 2 - w / 2), y = by + H + 6;
    if (y + total > ui.h - bar - 2) y = by - total - 10;
    x = Math.max(4, Math.min(ui.w - w - 4, x));
    const appear = Math.min(1, a.doneT / 0.2);
    cs.forEach((c, i) => {
      const yy = y + i * (rowH + 2) + Math.round((1 - appear) * 6);
      const hov = ui.hover(x, yy, w, rowH);
      if (hov) this.hoverChoice = i;
      ui.block(x, yy, w, rowH);
      ui.frame('dark', x, yy, w, rowH, 0.94);
      if (hov) ui.fill(x + 2, yy + 2, w - 4, rowH - 4, '#ffffff', 0.12);
      ui.keycap(String(i + 1), x + 3, yy + 2, false);
      ui.text(c.text, x + 18, yy + 4, { font: FONT, color: hov ? '#ffe07a' : '#f4ecd8', shadow: '#000' });
      if (hov) ui.cursor = 'point';
    });
  }
}
