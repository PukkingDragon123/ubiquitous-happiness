// The CODEX (v4): a field journal of every fish and every giant human you have met. Entries unlock the first time
// you meet the creature; the page shows a photograph of the real model, a line of field notes, how many you have
// met and beaten and how deep you first saw one.
//
//   codexSeen('barracuda', depthM)        call when a creature is first on screen (cheap; repeat calls just count)
//   codexBeaten('fisherman')              call when one is beaten / eaten / escaped
//   registerCodex({ id, kind: 'giant', name, desc, model: () => obj })   add or override an entry (K's giants)
//   const book = new CodexBook(); book.open();  each frame: if (book.isOpen) book.draw(ui, dt)   (inside begin/end)
//
// The book closes with Esc, its close button, or a click outside it. Progress is saved in localStorage
// ('blobfish.codex.v1'), separate from the meta save so any screen can record sightings.
import * as THREE from 'three';
import type { PixelUI } from './pixel/ui';
import { photo } from './obj/studio';
import { SPECS } from '../fish/species';
import { buildFish } from '../fish';

export type CodexKind = 'fish' | 'giant';
export interface CodexEntry {
  id: string; kind: CodexKind; name: string; desc: string;
  /** where it lives (shown under the name) */
  habitat?: string;
  /** 1..5 skulls */
  danger?: number;
  /** a 3D model to photograph (fish default to the species model) */
  model?: () => THREE.Object3D;
}

const FISH_NOTES: Record<string, [string, string, number]> = {
  piranha: ['Piranha', 'All teeth, no manners. Travels in gossiping gangs.', 3],
  cichlid: ['Cichlid', 'Guards a pebble like it is the crown jewels.', 1],
  cichlid_blue: ['Blue Cichlid', 'The same pebble, but blue. Very proud of it.', 1],
  peacock_bass: ['Peacock Bass', 'Wears its eye-spot like a medal it did not earn.', 2],
  napoleon: ['Napoleon Wrasse', 'Huge forehead, huge opinions. Mostly harmless.', 2],
  triggerfish: ['Triggerfish', 'Bites divers for fun. Respect the trigger.', 3],
  sardine: ['Sardine', 'Never alone. Never quiet. Mostly lunch.', 1],
  barracuda: ['Barracuda', 'A silver knife that learned to swim. Hits fast.', 3],
  cleaner_wrasse: ['Cleaner Wrasse', 'Runs a spa. Will floss you without asking.', 1],
  pufferfish: ['Pufferfish', 'Inflates when upset. Upset often.', 2],
  moray: ['Moray Eel', 'Lives in a hole and judges everyone swimming past.', 3],
  anglerfish: ['Anglerfish', 'The light is a lie. The teeth are not.', 4],
  ichthyosaur: ['Ichthyosaur', 'Should be extinct. Did not get the memo.', 5],
  pumpkinseed: ['Pumpkinseed', 'Small, round, freckled. A snack with ambition.', 1],
  unicornfish: ['Unicornfish', 'The horn is decorative. The attitude is not.', 2],
  grouper: ['Grouper', 'Swallows things whole and pretends it did not.', 3],
  pike: ['Pike', 'A torpedo with a grudge.', 3],
  snapper: ['Snapper', 'Named for what it does to fingers.', 2],
  orca: ['Orca', 'Smart, social, and very much in charge here.', 5],
  sperm_whale: ['Sperm Whale', 'A building that swims. Clicks loud enough to rattle your teeth.', 4],
  lionfish: ['Lionfish', 'Beautiful, venomous, and absolutely knows it.', 3],
  stonefish: ['Stonefish', 'Looks like a rock. Is not a rock. Do not step.', 4],
};
const GIANTS: CodexEntry[] = [
  { id: 'fisherman', kind: 'giant', name: 'The Fisherman', desc: 'A giant with a rod and no conscience. Takes one of us every morning.', habitat: 'the shallows', danger: 3 },
  { id: 'diver', kind: 'giant', name: 'The Diver', desc: 'Glass face, rubber feet, a net the size of a reef. Counts what he catches.', habitat: 'reef and kelp', danger: 4 },
  { id: 'trawler', kind: 'giant', name: 'The Trawlerman', desc: 'Drags a net across the whole sea floor. Sings badly while he does it.', habitat: 'the open sand', danger: 4 },
  { id: 'harpoonKing', kind: 'giant', name: 'The Harpoon King', desc: 'Terror of the Reef. Has a harpoon for every day of the week.', habitat: 'the sunlit reef', danger: 5 },
  { id: 'abyssCollector', kind: 'giant', name: 'The Collector', desc: 'Keeps blobfish in jars. Labels them. Neatly.', habitat: 'the deep', danger: 5 },
];

const REG = new Map<string, CodexEntry>();
for (const id of Object.keys(SPECS)) {
  const n = FISH_NOTES[id];
  REG.set(id, { id, kind: 'fish', name: n?.[0] ?? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), desc: n?.[1] ?? 'Fishy.', danger: n?.[2] ?? 2 });
}
for (const g of GIANTS) REG.set(g.id, g);

/** add or override an entry (models, better notes, new giants) */
export function registerCodex(e: CodexEntry) { REG.set(e.id, { ...REG.get(e.id), ...e }); photos.delete(e.id); }
export function codexEntries(kind?: CodexKind) { return [...REG.values()].filter((e) => !kind || e.kind === kind); }

// ------------------------------------------------------------------ sightings (localStorage)
interface Seen { n: number; beaten: number; depth: number; at: number }
const KEY = 'blobfish.codex.v1';
let seen: Record<string, Seen> = {};
try { seen = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, Seen>; } catch { seen = {}; }
let dirty = 0;
function save() { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch { /* private mode */ } }
/** a creature was met (first sighting unlocks the page; later calls count) */
export function codexSeen(id: string, depth = 0) {
  const s = seen[id];
  if (s) { s.n++; s.depth = Math.min(s.depth, Math.round(depth)); } else { seen[id] = { n: 1, beaten: 0, depth: Math.round(depth), at: Date.now() }; newOnes.push(id); }
  if (++dirty > 10 || !s) { dirty = 0; save(); }
}
export function codexBeaten(id: string) { (seen[id] ??= { n: 1, beaten: 0, depth: 0, at: Date.now() }).beaten++; save(); }
export function codexKnown(id: string) { return !!seen[id]; }
export function codexCount(kind?: CodexKind) { const all = codexEntries(kind); return { known: all.filter((e) => seen[e.id]).length, total: all.length }; }
/** ids met for the first time since the last call (for "NEW CODEX ENTRY" toasts) */
const newOnes: string[] = [];
export function codexNews() { return newOnes.splice(0); }

// ------------------------------------------------------------------ photographs
const photos = new Map<string, HTMLCanvasElement>();
function photoOf(e: CodexEntry, size: number): HTMLCanvasElement | null {
  const k = e.id + '|' + size;
  let c = photos.get(k);
  if (c) return c;
  let obj: THREE.Object3D | null = null;
  try { obj = e.model ? e.model() : e.kind === 'fish' ? buildFish(e.id, 3).group : null; } catch { obj = null; }
  if (!obj) return null;
  c = photo(obj, size, Math.round(size * 0.66), { yaw: -0.55, pitch: 0.12, fill: 0.88, ss: 2 });
  photos.set(k, c);
  return c;
}
/** a dark ink silhouette of an unknown entry (the photo with every opaque pixel inked) */
function silhouetteOf(e: CodexEntry, size: number): HTMLCanvasElement | null {
  const k = e.id + '|sil|' + size;
  let c = photos.get(k);
  if (c) return c;
  const src = photoOf(e, size);
  if (!src) return null;
  c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d')!;
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#3a2a1a'; x.fillRect(0, 0, c.width, c.height);
  photos.set(k, c);
  return c;
}

// ------------------------------------------------------------------ the book
export class CodexBook {
  private on = false;
  private t = 0;
  private tab: CodexKind = 'fish';
  private sel = '';
  private scroll = 0;
  get isOpen() { return this.on; }
  open(tab: CodexKind = this.tab) { this.on = true; this.t = 0; this.tab = tab; }
  close() { this.on = false; }

  /** draw inside ui.begin()/end(); returns false once closed */
  draw(ui: PixelUI, dt: number): boolean {
    if (!this.on) return false;
    this.t += dt;
    const W = Math.min(ui.w - 24, 520), H = Math.min(ui.h - 30, 300);
    const x = Math.round((ui.w - W) / 2), y = Math.round((ui.h - H) / 2) + Math.round((1 - Math.min(1, this.t * 6)) ** 2 * 30);
    ui.fill(0, 0, ui.w, ui.h, '#02060c', 0.55 * Math.min(1, this.t * 6));
    // close: Esc, the button, a click outside the book
    if (ui.input?.keyHit('Escape') || (ui.pressed && !ui.hover(x - 6, y - 16, W + 12, H + 22))) { this.close(); return false; }
    ui.block(0, 0, ui.w, ui.h);
    // leather cover, two parchment pages, the spine
    ui.fill(x - 6, y - 6, W + 12, H + 12, '#2a1408'); ui.fill(x - 5, y - 5, W + 10, H + 10, '#5a3018'); ui.fill(x - 5, y - 5, W + 10, 1, '#8a5a30');
    const half = Math.floor(W / 2);
    ui.frame('paper', x, y, half - 2, H); ui.frame('paper', x + half + 2, y, W - half - 2, H);
    ui.fill(x + half - 2, y, 4, H, '#3a1c0a'); ui.fill(x + half - 1, y, 1, H, '#7a4a20');
    // header + tabs
    const cnt = codexCount();
    ui.text('CODEX', x + 12, y + 10, { font: 'title', color: '#3a2008', shadow: null });
    ui.text(`${cnt.known}/${cnt.total} met`, x + half - 12, y + 12, { font: 'small', color: '#7a5a3a', shadow: null, align: 'right' });
    const tabs: [CodexKind, string][] = [['fish', 'FISH'], ['giant', 'GIANTS']];
    let tx = x + 12;
    for (const [k, label] of tabs) {
      const c = codexCount(k);
      if (ui.button('codex:tab:' + k, `${label} ${c.known}/${c.total}`, tx, y + 26, 92, 16, { style: this.tab === k ? 'gold' : 'wood', font: 'small', on: this.tab === k })) { this.tab = k; this.scroll = 0; this.sel = ''; }
      tx += 96;
    }
    if (ui.button('codex:close', '', x + W - 16, y - 12, 14, 15, { style: 'red', icon: 'close', sfx: '' })) { this.close(); return false; }
    // the entry grid (left page)
    const list = codexEntries(this.tab);
    const cell = 46, cols = Math.max(1, Math.floor((half - 24) / cell));
    const gx = x + 12, gy = y + 48, rows = Math.ceil(list.length / cols), viewH = H - 58;
    this.scroll = Math.max(0, Math.min(Math.max(0, rows * cell - viewH), this.scroll - (ui.hover(gx, gy, cols * cell, viewH) ? ui.wheel * 0.3 : 0)));
    ui.clip(gx - 2, gy - 2, cols * cell + 4, viewH + 2);
    list.forEach((e, i) => {
      const cx = gx + (i % cols) * cell, cy = gy + Math.floor(i / cols) * cell - this.scroll;
      if (cy < gy - cell || cy > gy + viewH) return;
      const known = !!seen[e.id];
      const hov = ui.hover(cx, cy, cell - 4, cell - 4) && ui.hover(gx, gy, cols * cell, viewH);
      const selNow = this.sel === e.id;
      ui.frame(selNow ? 'cardSel' : 'slot', cx, cy, cell - 4, cell - 4);
      const pic = known ? photoOf(e, 84) : silhouetteOf(e, 84);
      if (pic) ui.img(pic, cx + 2, cy + 6, { w: cell - 8, h: Math.round((cell - 8) * 0.66), alpha: known ? 1 : 0.8 });
      else ui.text('?', cx + (cell - 4) / 2, cy + 12, { font: 'title', color: '#6a5a4a', shadow: null, align: 'center' });
      if (!known) ui.text('?', cx + cell - 12, cy + cell - 16, { font: 'small', color: '#8a7a6a', shadow: null });
      if (hov) { ui.cursor = 'point'; if (ui.pressed) this.sel = e.id; }
    });
    ui.unclip();
    if (!this.sel && list.length) this.sel = (list.find((e) => seen[e.id]) ?? list[0]).id;
    // the selected page (right)
    const e = REG.get(this.sel);
    const px = x + half + 12, pw = W - half - 26;
    if (e) {
      const known = !!seen[e.id], s = seen[e.id];
      const pic = known ? photoOf(e, 180) : silhouetteOf(e, 180);
      const ph = Math.round(pw * 0.62);
      ui.fill(px, y + 12, pw, ph, '#d8c49a'); ui.rect(px, y + 12, pw, ph, '#8a6a44');
      if (pic) ui.img(pic, px + 2, y + 14, { w: pw - 4, h: ph - 4 });
      // tape on the photo corners
      for (const [qx, qy] of [[px - 3, y + 9], [px + pw - 11, y + 9]]) ui.fill(qx, qy, 14, 6, '#e8e0c0', 0.85);
      let yy = y + 20 + ph;
      ui.text(known ? e.name : '???', px, yy, { font: 'title', color: '#2a1408', shadow: null }); yy += 16;
      if (e.habitat || known) { ui.text(known ? (e.habitat ?? (e.kind === 'fish' ? 'open water' : '')) : 'not yet met', px, yy, { font: 'small', color: '#7a5a3a', shadow: null }); yy += 12; }
      const dg = e.danger ?? 1;
      for (let i = 0; i < 5; i++) { const on = i < dg; ui.fill(px + i * 10, yy + 1, 7, 6, on ? '#7a1a10' : '#c8b088'); ui.fill(px + i * 10 + 1, yy + 2, 2, 2, on ? '#f0e0c0' : '#d8c49a'); ui.fill(px + i * 10 + 4, yy + 2, 2, 2, on ? '#f0e0c0' : '#d8c49a'); }
      ui.text('danger', px + 54, yy, { font: 'small', color: '#7a5a3a', shadow: null }); yy += 14;
      yy += ui.textBox(known ? e.desc : 'Meet it out there and the page fills itself in.', px, yy, pw, { font: 'small', color: '#3a2810', shadow: null }) + 6;
      if (known && s) ui.text(`met ${s.n}  ·  beaten ${s.beaten}  ·  first at -${s.depth} m`, px, Math.min(yy, y + H - 16), { font: 'small', color: '#5a3a1c', shadow: null });
    }
    return true;
  }
}
