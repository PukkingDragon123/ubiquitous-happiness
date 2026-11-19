// Dialogue: sailcloth speech bubbles with a rope edge (kit skin 'sail'), the speaker's name on a little driftwood
// plaque, a trail of sea bubbles for the tail and a gentle bob while the words come. Anchored over the speaker in 3D
// (they follow the entity and stay on screen, the tail pointing at the speaker even when it is off to one side), a typewriter with per-character voice
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
import type { FontName } from '../ui/pixel/font';
import { KIT } from '../ui/pixel/skins';
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
function wrapChars(chs: Ch[], maxW: number, measure: (s: string) => number): [number, number][] {
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
      if (measure(text.slice(start, end + 1)) > maxW && end > start) { if (lastSpace > start) end = lastSpace; break; }
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
  maxW = 230;
  private queue: Line[] = [];
  private cur: Active | null = null;
  private barks: Active[] = [];
  private resolve: ((picks: number[]) => void) | null = null;
  private picks: number[] = [];
  private holdT = 0;
  private t = 0;
  private v = new THREE.Vector3();
  private hoverChoice = -1;
  /** where the current choice rows were drawn (UI pixels): tests and tools click these */
  choiceRects: { x: number; y: number; w: number; h: number }[] = [];

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
    const ui = this.ui;
    const chs = parseTags(line.text);
    const maxW = Math.min(bark ? 160 : this.maxW, ui.w - 40);
    const m = (t: string) => ui.measure(t, FONT);
    const lines = wrapChars(chs, maxW, m);
    const plain = chs.map((c) => c.c).join('');
    let w = 0;
    for (const [a, b] of lines) w = Math.max(w, m(plain.slice(a, b)));
    const lh = ui.lh(FONT);
    const nameW = sp.name ? ui.measure(sp.name, 'small') + 14 : 0;
    w = Math.ceil(Math.max(w + 24, nameW + 26, 60));
    const h = lines.length * lh + (bark ? 16 : 22);
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
    this.choiceRects = [];
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
    const pop = Math.min(1, a.t / 0.16);
    const m = 6;
    let bx: number, by: number, tx: number | null = null, ty = 0;
    if (anchor) {
      const s = this.project(anchor);
      bx = s.x - W / 2;
      by = s.y - H - 20;
      // keep on screen (and off the letterbox bars), leaving room for the name plaque on top
      const minY = bar + m + 10, maxY = ui.h - bar - m - H - 4;
      const cx = Math.max(m, Math.min(ui.w - m - W, bx));
      const cy = Math.max(minY, Math.min(maxY, by));
      tx = Math.max(cx + 12, Math.min(cx + W - 13, s.x));
      ty = s.y;
      bx = cx; by = cy;
    } else {
      // narrator / off-screen: a caption low in the frame
      bx = (ui.w - W) / 2; by = ui.h - bar - H - 12;
    }
    // pop: rise 6 px with a soft overshoot; a gentle bob (like a sail on a swell) while the words are coming
    const typed = a.shown >= a.chs.length;
    const k = pop < 1 ? 1 - Math.pow(1 - pop, 3) * Math.cos(pop * 4) : 1;
    const bob = typed ? 0 : Math.round(Math.sin(this.t * 4.2) * 1.2);
    bx = Math.round(bx); by = Math.round(by + (1 - k) * 6 + bob);
    const alpha = Math.min(1, pop * 2.5);
    const f = (x: number, y: number, w: number, h: number, c: string, al = 1) => ui.fill(x, y, w, h, c, al * alpha);
    ui.block(bx, by, W, H);
    // ---- the tail: a little trail of bubbles drifting from the sail toward the speaker
    if (tx !== null) {
      const down = ty > by + H, up = ty < by;
      if (down || up) {
        const ex = Math.round(tx), ey = down ? by + H : by;
        const dist = Math.min(26, Math.max(8, Math.abs(ty - ey) - 4));
        const lean = Math.max(-8, Math.min(8, (ex - (bx + W / 2)) * 0.15));
        [[0.18, 4], [0.52, 3], [0.86, 2]].forEach(([q, r], i) => {
          const px = ex + lean * q + Math.sin(this.t * 3 + i * 1.7) * 0.8, py = ey + (down ? 1 : -1) * (3 + dist * q) + Math.sin(this.t * 2.4 + i) * 0.6;
          this.trailBubble(Math.round(px), Math.round(py), r, alpha);
        });
      }
    }
    // ---- the body: a sailcloth card with a twisted rope edge (and a soft shadow under it)
    f(bx + 3, by + 3, W, H, '#000000', 0.22);
    ui.frame('sail', bx, by, W, H, alpha);
    // ---- the speaker's name on a little driftwood plaque nailed over the top edge, a stripe of their colour
    if (a.sp.name) {
      const nw = Math.ceil(ui.measure(a.sp.name, 'small')) + 18, nh = 14;
      const nx = bx + 9, ny = by - 9;
      ui.frame('plaque', nx, ny, nw, nh, alpha);
      f(nx + 4, ny + nh - 3, nw - 8, 1, a.sp.color, 0.9);
      ui.text(a.sp.name, nx + nw / 2, ny + 3, { font: 'small', color: KIT.ink, shadow: '#e6dec8', align: 'center', alpha });
    }
    // ---- the text, one character at a time (a fresh letter pops up a pixel)
    const lh = ui.lh(FONT);
    const plain = a.chs.map((c) => c.c).join('');
    const shown = Math.floor(a.shown);
    const top = by + (a.bark ? 8 : 10);
    a.lines.forEach(([s, e], li) => {
      const y = top + li * lh;
      for (let i = s; i < e && i < shown; i++) {
        const ch = a.chs[i];
        if (ch.c === ' ') continue;
        const xx = bx + 12 + ui.measure(plain.slice(s, i), FONT);
        let dx = 0, dy = 0;
        if (ch.shake) { const q = Math.floor(this.t * 20) + i * 7; dx = ((q * 13) % 3) - 1; dy = ((q * 7) % 3) - 1; }
        if (ch.wave) dy += Math.round(Math.sin(this.t * 7 - i * 0.7) * 1.5);
        const age = a.shown - i;
        if (age < 1.5) dy -= 1;
        ui.text(ch.c, xx + dx, y + dy, { font: FONT, color: ch.color, shadow: null, alpha });
      }
    });
    // ---- continue prompt (click / E) in the bottom-right corner, bobbing; or the choices
    if (!a.bark && typed && !a.line.choices?.length && a.line.auto === undefined) {
      const b = Math.round(Math.max(0, Math.sin(this.t * 6)) * 2);
      const kw = ui.keycapW('E');
      const px = bx + W - kw - 9, py = by + H - 15 - b;
      ui.keycap('E', px, py);
      // a bobbing brass arrow beside the key, inside the sail
      const line = KIT.ink;
      const ax = px - 10, ay = py + 3;
      f(ax, ay, 7, 1, line); f(ax + 1, ay + 1, 5, 1, KIT.brass[2]); f(ax, ay + 1, 1, 1, line); f(ax + 6, ay + 1, 1, 1, line);
      f(ax + 1, ay + 2, 5, 1, line); f(ax + 2, ay + 2, 3, 1, KIT.brass[2]); f(ax + 1, ay + 2, 1, 1, line); f(ax + 5, ay + 2, 1, 1, line);
      f(ax + 2, ay + 3, 3, 1, line); f(ax + 3, ay + 3, 1, 1, KIT.brass[3]); f(ax + 3, ay + 4, 1, 1, line);
    }
    if (!a.bark && typed && a.line.choices?.length) this.choices(a, bx, by, W, H);
  }

  /** one bubble of the tail trail: an ink-rimmed sea bubble (r 1..3 UI px) with a glint, readable on any backdrop */
  private trailBubble(cx: number, cy: number, r: number, alpha: number) {
    const ui = this.ui;
    for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y);
      if (d > r + 0.75) continue;
      const col = d > r - 0.25 ? KIT.ink : x + y < -r * 0.6 ? '#ffffff' : d > r - 1.2 ? '#bfeef0' : '#e8f8f2';
      ui.fill(cx + x, cy + y, 1, 1, col, alpha * (col === '#e8f8f2' ? 0.85 : 1));
    }
  }

  private choices(a: Active, bx: number, by: number, W: number, H: number) {
    const ui = this.ui;
    const cs = a.line.choices!;
    const rowH = 22;
    let w = 0;
    for (const c of cs) w = Math.max(w, ui.measure(c.text, FONT) + 40);
    w = Math.ceil(Math.max(w, 120));
    const total = cs.length * (rowH + 3);
    const bar = this.bar();
    let x = Math.round(bx + W / 2 - w / 2), y = by + H + 8;
    if (y + total > ui.h - bar - 2) y = by - total - 12;
    x = Math.max(4, Math.min(ui.w - w - 4, x));
    cs.forEach((c, i) => {
      // each row slides in a little after the one above
      const appear = Math.max(0, Math.min(1, (a.doneT - i * 0.06) / 0.18));
      const yy = y + i * (rowH + 3) + Math.round((1 - appear) * 6);
      const hov = ui.hover(x, yy, w, rowH);
      this.choiceRects[i] = { x, y: yy, w, h: rowH };
      if (hov) this.hoverChoice = i;
      ui.button('dlg:choice:' + i, '', x, yy, w, rowH, { style: hov ? 'wood' : 'dark', sfx: '', state: hov ? (ui.down ? 'down' : 'hover') : 'normal' });
      const [ft, fh] = hov ? (ui.down ? [4, rowH - 5] : [1, rowH - 5]) : [2, rowH - 5];
      ui.keycap(String(i + 1), x + 5, yy + ft + Math.round((fh - 13) / 2), !hov);
      ui.text(c.text, x + 24, yy + ft + Math.round((fh - ui.cap(FONT)) / 2), hov ? { font: FONT, color: KIT.ink, shadow: '#f2c66d', alpha: appear } : { font: FONT, color: KIT.text, shadow: '#06141a', alpha: appear });
      if (hov) ui.cursor = 'point';
    });
  }
}
