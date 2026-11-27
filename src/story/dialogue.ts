// Dialogue (v7): no box. The words float in the water near the speaker (low in the frame when there is no one to
// point at): crisp pixel-font text with a soft dark outline so it reads over anything, the speaker's name as a small
// line in their colour above it, a typewriter reveal (each new letter rises a pixel into place) with per-character
// voice blips (pitch per speaker), punctuation pauses and inline emphasis tags, and a gentle drift and bob while it
// hangs there. Small, real-looking air bubbles let go of the letters now and then, rise and pop; when a line is
// done it lifts away and its bubbles pop. The advance hint is tiny ([E] / click) and lines can offer up to three
// choices (click or 1-3), floating under the words. Advance with click / E / Space; hold to fast-forward.
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
import { PixelUI } from '../ui/pixel/ui';
import type { FontName } from '../ui/pixel/font';
import { KIT, keycapBody, KEYCAP_H } from '../ui/pixel/skins';
import { mouseTex } from '../ui/pixel/art';
import { audio } from '../audio/audio';
import { SeaBubbles, seaArt, seaDraw, rawCanvas, letterboxBar, readable, bubbleSprite, type SeaStyle, type Tier } from '../ui/seaText';

export interface Speaker {
  id: string;
  name: string;
  /** name colour */
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

/** inline colours, light enough to read as floating text on the dark outline */
const COLORS: Record<string, string> = { red: '#ff8a76', gold: '#ffd45e', blue: '#8cc8ff', green: '#90e68a', pink: '#ff9ccc', grey: '#b8b2ba', white: '#ffffff' };
const INK = '#fbf5e8';
const FONT: FontName = 'body';
const TIER: Tier = 'body';
/** the floating line's leading (UI px): a touch more air than a panel's, for the outline */
const LH = 15;
const EDGE = '#06121a';
/** how long a finished line takes to lift away, and a bark to fade */
const LEAVE = 0.22;
const BARK_FADE = 0.35;

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
        else if (COLORS[name] || name.startsWith('#')) { if (close) col.pop(); else col.push(COLORS[name] ?? readable(name)); }
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

/** the floating-text style of an ink colour (a lighter top, the colour below, the soft dark outline) */
const styleCache = new Map<string, SeaStyle>();
function inkStyle(c: string): SeaStyle {
  let s = styleCache.get(c);
  if (!s) {
    const v = c.replace('#', '');
    const n = parseInt(v.length === 3 ? v.split('').map((x) => x + x).join('') : v.slice(0, 6), 16) || 0;
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const up = (x: number) => Math.round(x + (255 - x) * 0.3).toString(16).padStart(2, '0');
    s = c === INK ? { top: '#fffcf4', bottom: '#eee4cc', edge: EDGE } : { top: '#' + up(r) + up(g) + up(b), bottom: c, edge: EDGE };
    styleCache.set(c, s);
  }
  return s;
}

interface Active {
  line: Line;
  sp: Speaker;
  chs: Ch[];
  lines: [number, number][];
  /** each wrapped line's width (UI px) */
  lw: number[];
  shown: number;      // characters revealed (float)
  t: number;          // time on this line
  doneT: number;      // time since fully typed
  pause: number;
  w: number; h: number;
  bark: boolean;
  life: number;
  pick: number;
  blip: number;
  /** seconds before typing starts (a beat after the previous line lifts away) */
  wait: number;
  /** where it floats (UI px: block centre x, block top y), eased toward its target */
  px: number; py: number; placed: boolean;
  /** anchored to a speaker (left-aligned, name on top, a little bubble tail toward them) or a caption (centred) */
  anchored: boolean;
  /** the speaker's point on screen (UI px), for the tail */
  ax: number; ay: number;
  /** >= 0: lifting away (seconds since) */
  out: number;
  seed: number;
  bubT: number;
}

/** a touch screen: click -> tap (clicks -> taps, clicked -> tapped, clicking -> tapping), keeping the case */
function touchWords(t: string) {
  const END: Record<string, string> = { '': '', s: 's', ed: 'ped', ing: 'ping' };
  return t.replace(/\b(click|Click|CLICK)(s|ed|ing)?\b/g, (_m, w: string, e = '') => {
    const out = 'tap' + (END[e.toLowerCase()] ?? '');
    return w === 'CLICK' ? out.toUpperCase() : w === 'Click' ? 'T' + out.slice(1) : out;
  });
}

export class Dialogue {
  speakers = new Map<string, Speaker>();
  /** a conversation that wants the player's attention (the owner should suspend gameplay input) */
  blocking = false;
  /** characters per second */
  cps = 34;
  /** the widest a floating line may run (UI px) */
  maxW = 220;
  private queue: Line[] = [];
  private cur: Active | null = null;
  private barks: Active[] = [];
  /** finished lines lifting away */
  private leaving: Active[] = [];
  private resolve: ((picks: number[]) => void) | null = null;
  private picks: number[] = [];
  private holdT = 0;
  private t = 0;
  private dt = 0;
  private v = new THREE.Vector3();
  private hoverChoice = -1;
  private fx = new SeaBubbles();
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
    const old = this.barks.find((b) => b.sp.id === who);
    if (old) this.retire(old);
    this.barks = this.barks.filter((b) => b.sp.id !== who);
    if (this.barks.length > 2) this.retire(this.barks.shift()!);
    const b = this.make({ who, text }, sp, true, life);
    // a new bark over the same speaker waits for the old one to lift away (no words over words)
    if (old && old.placed && old.shown >= 1) b.wait = LEAVE * 0.9;
    this.barks.push(b);
  }

  get busy() { return !!this.cur; }
  /** a question is up (its choices take the clicks / taps) */
  get choosing() { return !!this.cur?.line.choices?.length; }
  /** drop everything (skips, screen exits) */
  finish() {
    const r = this.resolve;
    this.resolve = null; this.cur = null; this.queue = []; this.blocking = false; this.barks = []; this.leaving = []; this.fx.clear();
    r?.(this.picks);
  }

  private make(line: Line, sp: Speaker, bark: boolean, life = 0): Active {
    const ui = this.ui;
    // (a touch screen: the words say tap, not click)
    const chs = parseTags(PixelUI.touch ? touchWords(line.text) : line.text);
    const maxW = Math.min(bark ? 170 : this.maxW, ui.w - 40);
    const m = (t: string) => ui.measure(t, FONT);
    const lines = wrapChars(chs, maxW, m);
    const plain = chs.map((c) => c.c).join('');
    const lw = lines.map(([a, b]) => Math.ceil(m(plain.slice(a, b))));
    let w = 0;
    for (const x of lw) w = Math.max(w, x);
    const nameW = sp.name ? ui.measure(sp.name, 'small') + 20 : 0;
    w = Math.ceil(Math.max(w, nameW));
    const h = Math.max(1, lines.length) * LH;
    const wait = !bark && (this.cur || this.leaving.length) ? LEAVE * 0.9 : 0;
    return { line, sp, chs, lines, lw, shown: 0, t: 0, doneT: 0, pause: 0, w, h, bark, life, pick: -1, blip: 0, wait, px: 0, py: 0, placed: false, anchored: false, ax: 0, ay: 0, out: -1, seed: Math.random() * 6.28, bubT: 0.3 + Math.random() * 0.4 };
  }

  /** a line that is done: it lifts away (and lets its bubbles go) */
  private retire(a: Active) {
    if (!a.placed || a.shown < 1) return;
    a.out = 0;
    this.leaving.push(a);
    // a few bubbles from the words, popping a moment later
    const n = Math.min(5, 1 + Math.floor(a.shown / 14));
    for (let i = 0; i < n; i++) {
      const li = Math.floor(Math.random() * a.lines.length);
      this.fx.add(a.px - a.lw[li] / 2 + Math.random() * a.lw[li], a.py + li * LH + 2 + Math.random() * 4, { r: 1.2 + Math.random() * 1.3, life: 0.15 + Math.random() * 0.35, vy: -16 - Math.random() * 10 });
    }
  }

  private next() {
    if (this.cur) this.retire(this.cur);
    const line = this.queue.shift();
    if (!line) {
      this.cur = null; this.blocking = false;
      const r = this.resolve; this.resolve = null;
      r?.(this.picks);
      return;
    }
    const sp = this.speakers.get(line.who) ?? { id: line.who, name: line.who.toUpperCase(), color: '#9ab4d8', voice: 'k_tick', pitch: 1 };
    this.cur = this.make(line, sp, false);
    line.do?.();
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number, input: Input | null) {
    this.t += dt;
    this.dt += dt;
    for (const b of this.barks) this.type(b, dt, 1);
    for (const b of this.barks) if (b.doneT >= b.life + BARK_FADE) b.out = 1;
    this.barks = this.barks.filter((b) => b.doneT < b.life + BARK_FADE);
    for (const l of this.leaving) l.out += dt;
    this.leaving = this.leaving.filter((l) => l.out < LEAVE);
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
      if (adv && a.t > 0.08) { a.shown = total; a.pause = 0; a.wait = 0; }
      return;
    }
    // choices
    if (a.line.choices?.length) {
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
    if (a.t < a.wait) return;
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
    const dt = Math.min(0.1, this.dt); this.dt = 0;
    this.lastDt = dt;
    this.fx.step(dt);
    const all = [...this.leaving, ...this.barks, ...(this.cur ? [this.cur] : [])];
    // the conversation first, then the barks, each kept clear of what is already placed (no words over words)
    const taken: [number, number, number, number][] = [];
    for (const a of [...(this.cur ? [this.cur] : []), ...this.barks]) if (a.out < 0) this.place(a, dt, taken);
    const bar = this.bar();
    // every line's soft outline first, then the letters, so no outline ever cuts into a neighbour's glyphs
    rawCanvas(ui, (ctx, hd) => {
      for (const a of all) this.tail(a, ctx, hd);
      for (const a of all) this.words(a, ctx, hd, 'edge');
      for (const a of all) this.words(a, ctx, hd, 'fill');
    });
    this.fx.draw(ui, [bar, ui.h - bar]);
    const a = this.cur;
    if (a && a.out < 0 && a.shown >= a.chs.length) {
      if (a.line.choices?.length) this.choices(a);
      else if (a.line.auto === undefined) this.hint(a);
    }
  }

  /** letterbox bar height in UI px (words stay off the bars) */
  private bar() { return letterboxBar(this.ui); }

  private project(p: THREE.Vector3): { x: number; y: number; behind: boolean } {
    const ui = this.ui;
    const cam = this.cam();
    cam.updateMatrixWorld();
    const v = this.v.copy(p).project(cam);
    const behind = v.z > 1;
    let x = (v.x * 0.5 + 0.5) * ui.w, y = (1 - (v.y * 0.5 + 0.5)) * ui.h;
    if (behind) { x = ui.w - x; y = ui.h; }
    return { x, y, behind };
  }

  /** where a line floats: over the speaker's head (kept on screen and off the bars), else low in the frame */
  private place(a: Active, dt: number, taken: [number, number, number, number][] = []) {
    const ui = this.ui, bar = this.bar();
    const anchor = a.sp.anchor?.() ?? null;
    const nameH = a.sp.name && !a.bark ? 12 : 0;
    const m = 10;
    let cx: number, top: number;
    a.anchored = !!anchor;
    if (anchor) {
      const s = this.project(anchor);
      a.ax = s.x; a.ay = s.behind ? ui.h : s.y;
      cx = s.x; top = s.y - a.h - 16;
    } else {
      cx = ui.w / 2; top = ui.h - bar - a.h - 26;
    }
    cx = Math.max(m + a.w / 2, Math.min(ui.w - m - a.w / 2, cx));
    top = Math.max(bar + m + nameH, Math.min(ui.h - bar - a.h - 20, top));
    // keep clear of the lines already placed this frame: above them, or below when there is no room above
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const [rx, ry, rw, rh] of taken) {
        const x0 = cx - a.w / 2 - 3, y0 = top - nameH - 3;
        if (x0 >= rx + rw || x0 + a.w + 6 <= rx || y0 >= ry + rh || y0 + a.h + nameH + 6 <= ry) continue;
        const up = ry - 4 - a.h, dn = ry + rh + 4 + nameH;
        top = up - nameH >= bar + 4 ? up : dn;
        moved = true;
      }
      if (!moved) break;
    }
    taken.push([cx - a.w / 2, top - nameH, a.w, a.h + nameH]);
    if (!a.placed) { a.px = cx; a.py = top; a.placed = true; return; }
    // follow the speaker smoothly (no jitter when the camera or the speaker moves)
    const k = 1 - Math.exp(-dt * 9);
    a.px += (cx - a.px) * k; a.py += (top - a.py) * k;
  }

  /** a line's name and letters, one pass (outline or fill) */
  private words(a: Active, ctx: CanvasRenderingContext2D, hd: number, pass: 'edge' | 'fill') {
    if (!a.placed) return;
    const ui = this.ui;
    const t = this.t;
    // fading: a bark's last moments, or a finished line lifting away (letters fade in on their own as they type)
    let alpha = 1;
    let lift = 0;
    if (a.out >= 0 && !a.bark) { const q = Math.min(1, a.out / LEAVE); alpha *= 1 - q; lift = q * 7; }
    if (a.bark && a.doneT > a.life) { const q = Math.min(1, (a.doneT - a.life) / BARK_FADE); alpha *= 1 - q; lift = q * 5; }
    if (alpha <= 0.01) return;
    // the gentle drift and bob of words hanging in the water
    const ox = Math.sin(t * 0.55 + a.seed) * 1.6, oy = Math.sin(t * 0.9 + a.seed * 1.3) * 1.3 - lift;
    const cx = a.px + ox, top = a.py + oy;
    // the speaker's name: a small line in their colour, with a short rule either side
    if (a.sp.name && !a.bark) {
      const nst = this.nameStyle(a.sp.color);
      const art = seaArt(a.sp.name, nst, 'small', hd);
      const left = a.anchored ? Math.round((cx - a.w / 2) * hd) : Math.round(cx * hd - art.adv / 2);
      const X = left, Y = Math.round((top - 11) * hd);
      seaDraw(ctx, art, X, Y, pass, alpha * Math.max(0, Math.min(1, (a.t - a.wait) / 0.2)));
      if (pass === 'fill') {
        // a short rule in their colour after the name (and before it on a centred caption)
        const ry = Y + Math.round(art.cap / 2), rw = 8 * hd, gap = 3 * hd, th = Math.max(1, Math.round(hd / 2));
        ctx.globalAlpha = alpha * 0.75;
        ctx.fillStyle = EDGE;
        ctx.fillRect(X + art.adv + gap - 1, ry - 1, rw + 2, th + 2);
        if (!a.anchored) ctx.fillRect(X - gap - rw - 1, ry - 1, rw + 2, th + 2);
        ctx.fillStyle = nst.bottom;
        ctx.fillRect(X + art.adv + gap, ry, rw, th);
        if (!a.anchored) ctx.fillRect(X - gap - rw, ry, rw, th);
      }
    }
    // the letters
    const plain = a.chs.map((c) => c.c).join('');
    const shown = Math.floor(a.shown);
    a.lines.forEach(([s, e], li) => {
      const x0 = Math.round(this.lineLeft(a, li, cx) * hd);
      const y = top + li * LH;
      for (let i = s; i < e && i < shown; i++) {
        const ch = a.chs[i];
        if (ch.c === ' ') continue;
        const X = x0 + Math.round(ui.measure(plain.slice(s, i), FONT) * hd);
        let dx = 0, dy = Math.sin(t * 2.4 - i * 0.45 + a.seed) * 0.45;
        if (ch.shake) { const q = Math.floor(t * 20) + i * 7; dx += ((q * 13) % 3) - 1; dy += ((q * 7) % 3) - 1; }
        if (ch.wave) dy += Math.sin(t * 7 - i * 0.7) * 1.5;
        // a fresh letter fades in rising a few pixels into place
        const age = a.shown - i;
        const k = Math.min(1, age / 2.2);
        dy += (1 - k) * 3;
        seaDraw(ctx, seaArt(ch.c, inkStyle(ch.color), TIER, hd), X + Math.round(dx * hd), Math.round((y + dy) * hd), pass, alpha * (0.25 + 0.75 * k));
      }
    });
    if (pass !== 'fill' || a.out >= 0) return;
    // bubbles: a speck now and then from a fresh letter while typing, a slow trickle off the words once they sit
    a.bubT -= this.dtLast();
    if (a.bubT <= 0 && shown > 0) {
      const typing = a.shown < a.chs.length;
      a.bubT = typing ? 0.28 + Math.random() * 0.3 : 0.7 + Math.random() * 1.1;
      const i = typing ? Math.max(0, shown - 1) : Math.floor(Math.random() * shown);
      const li = Math.max(0, a.lines.findIndex(([s, e]) => i >= s && i < e));
      const [s] = a.lines[li] ?? [0];
      const x = this.lineLeft(a, li, cx) + ui.measure(plain.slice(s, i), FONT) + 2 + Math.random() * 3;
      if (a.chs[i] && a.chs[i].c !== ' ') this.fx.add(x, top + li * LH - 1, { r: typing ? 1 + Math.random() * 0.6 : 1.2 + Math.random() * 1.2, life: 0.6 + Math.random() * 0.9 });
    }
    // the text swallows world clicks under it (like any UI)
    if (!a.bark) ui.block(Math.round(cx - a.w / 2) - 4, Math.round(top) - 14, Math.ceil(a.w) + 8, a.h + 18);
  }
  /** where a wrapped line starts (UI px): speech is left-aligned in its block, a caption's lines are centred */
  private lineLeft(a: Active, li: number, cx: number) { return a.anchored ? cx - a.w / 2 : cx - (a.lw[li] ?? 0) / 2; }

  /** a little trail of air bubbles from the words toward the speaker (the tail a speech bubble would have) */
  private tail(a: Active, ctx: CanvasRenderingContext2D, hd: number) {
    if (!a.anchored || !a.placed || a.out >= 0) return;
    const ui = this.ui, t = this.t;
    const ox = Math.sin(t * 0.55 + a.seed) * 1.6, oy = Math.sin(t * 0.9 + a.seed * 1.3) * 1.3;
    const left = a.px + ox - a.w / 2, top = a.py + oy;
    const ex = Math.max(4, Math.min(ui.w - 4, a.ax)), ey = Math.max(4, Math.min(ui.h - 4, a.ay));
    const below = ey > top + a.h + 10, above = ey < top - 24;
    if (!below && !above) return;
    const sx = Math.max(left + 4, Math.min(left + a.w - 4, ex)), sy = below ? top + a.h + 2 : top - 15;
    const dx = ex - sx, dy = (below ? ey - 6 : ey + 6) - sy;
    const len = Math.hypot(dx, dy);
    if (len < 8) return;
    const fade = Math.max(0, Math.min(1, (a.t - a.wait) / 0.3)) * (a.bark && a.doneT > a.life ? Math.max(0, 1 - (a.doneT - a.life) / BARK_FADE) : 1);
    [[4, 1.6], [12, 1.2], [19, 0.9]].forEach(([d, r], i) => {
      if (d > len - 3) return;
      const k = d / len;
      const x = sx + dx * k + Math.sin(t * 2.6 + i * 1.9 + a.seed) * 0.8, y = sy + dy * k + Math.sin(t * 2.1 + i * 1.3) * 0.6;
      const D = Math.max(3, Math.round(r * 2 * hd));
      ctx.globalAlpha = fade;
      ctx.drawImage(bubbleSprite(D), Math.round(x * hd - D / 2), Math.round(y * hd - D / 2));
    });
  }

  private lastDt = 1 / 60;
  private dtLast() { return this.lastDt; }

  private nameCache = new Map<string, SeaStyle>();
  private nameStyle(c: string): SeaStyle {
    let s = this.nameCache.get(c);
    if (!s) { const v = readable(c, 0.55); s = { top: readable(v, 0.72), bottom: v, edge: EDGE }; this.nameCache.set(c, s); }
    return s;
  }

  /** the advance hint: a tiny [E] / click after the last word, bobbing */
  private hint(a: Active) {
    const ui = this.ui;
    const t = this.t;
    const li = a.lines.length - 1;
    const ox = Math.sin(t * 0.55 + a.seed) * 1.6, oy = Math.sin(t * 0.9 + a.seed * 1.3) * 1.3;
    const lw = a.lw[Math.max(0, li)] ?? 0;
    const appear = Math.min(1, a.doneT / 0.25);
    const x = Math.round(this.lineLeft(a, Math.max(0, li), a.px + ox) + lw + 5), y = Math.round(a.py + oy + Math.max(0, li) * LH - 2 - Math.max(0, Math.sin(t * 5)) * 1.5);
    // (a touch screen: just TAP)
    const kw = this.keycap(PixelUI.touch ? 'TAP' : 'E', x, y, true, false, 0.9 * appear);
    const mg = mouseTex('L');
    if (!PixelUI.touch) ui.img(mg, x + kw + 3, y + Math.round((KEYCAP_H - mg.height) / 2), { alpha: 0.9 * appear });
  }

  /** a kit keycap that can fade (ui.keycap always draws opaque) */
  private keycap(label: string, x: number, y: number, dark: boolean, down: boolean, alpha: number) {
    const ui = this.ui;
    const w = ui.keycapW(label);
    ui.img(keycapBody(w, KEYCAP_H, dark, down), x, y, { w, h: KEYCAP_H, alpha });
    ui.text(label, x + w / 2, y + (down ? 3 : 1) + Math.round((8 - ui.cap('small')) / 2), { font: 'small', color: dark ? KIT.text : KIT.ink, shadow: null, align: 'center', alpha });
    return w;
  }

  private choices(a: Active) {
    const ui = this.ui;
    const cs = a.line.choices!;
    const rowH = 17;
    const hd = Math.max(1, ui.hd);
    let w = 0;
    for (const c of cs) w = Math.max(w, ui.measure(c.text, FONT) + ui.keycapW('1') + 12);
    w = Math.ceil(w);
    const total = cs.length * rowH;
    const bar = this.bar();
    let y = Math.round(a.py + a.h + 8);
    if (y + total > ui.h - bar - 4) y = Math.round(a.py - (a.sp.name ? 14 : 0) - total - 6);
    const x = Math.round(Math.max(6, Math.min(ui.w - w - 6, a.anchored ? a.px - a.w / 2 : a.px - w / 2)));
    const rows: { i: number; yy: number; hov: boolean; appear: number }[] = [];
    cs.forEach((_c, i) => {
      // each row floats in a little after the one above
      const appear = Math.max(0, Math.min(1, (a.doneT - i * 0.08) / 0.22));
      const yy = y + i * rowH + Math.round((1 - appear) * 5 + Math.sin(this.t * 1.8 + i * 1.3) * 0.6);
      const hov = appear > 0.5 && ui.hover(x - 4, yy - 2, w + 8, rowH);
      this.choiceRects[i] = { x, y: yy, w, h: rowH - 2 };
      ui.mark('dlg:choice:' + i, x, yy, w, rowH - 2);
      ui.block(x - 4, yy - 2, w + 8, rowH);
      if (hov) { this.hoverChoice = i; ui.cursor = 'point'; }
      rows.push({ i, yy, hov, appear });
    });
    const st = inkStyle(INK), hot: SeaStyle = { top: '#fff4c8', bottom: '#ffcf5a', edge: EDGE };
    rawCanvas(ui, (ctx) => {
      for (const pass of ['edge', 'fill'] as const) for (const r of rows) {
        const tx = x + ui.keycapW('1') + 5 + (r.hov ? 2 : 0);
        const art = seaArt(cs[r.i].text, r.hov ? hot : st, TIER, hd);
        seaDraw(ctx, art, Math.round(tx * hd), Math.round((r.yy + 2) * hd), pass, r.appear);
      }
    });
    for (const r of rows) {
      this.keycap(String(r.i + 1), x + (r.hov ? 1 : 0), r.yy, !r.hov, r.hov && ui.down, r.appear);
      // a small bubble marks the hovered answer
      if (r.hov && Math.random() < 0.06) this.fx.add(x - 4, r.yy + 6, { r: 1 + Math.random() * 0.6, life: 0.5 });
    }
  }
}
