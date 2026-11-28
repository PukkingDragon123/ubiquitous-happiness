// The CODEX (v8b kit panel): a field journal of every fish and every giant human you have met. Entries unlock the first time
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
import { C, sectionHead } from './pixel/skins';

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
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = C.line2; x.fillRect(0, 0, c.width, c.height);
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
    const W = Math.min(ui.w - 24, 540), H = Math.min(ui.h - 30, 310);
    const x = Math.round((ui.w - W) / 2), y = Math.round((ui.h - H) / 2);
    ui.fill(0, 0, ui.w, ui.h, C.ink, 0.5 * Math.min(1, this.t * 6));
    // close: Esc, the button, a click outside the book
    if (ui.input?.keyHit('Escape') || (ui.pressed && !ui.hover(x - 8, y - 16, W + 20, H + 24))) { this.close(); return false; }
    ui.block(0, 0, ui.w, ui.h);
    // the kit's main panel, two panes: the grid of entries (left), the page you are reading (right)
    ui.panel('wood', x, y, W, H, 'CODEX', { id: 'codex' });
    if (ui.closeButton('codex:close', x + W - 24, y + 8, { size: 15, key: null })) { this.close(); return false; }
    const half = Math.floor(W * 0.5);
    const cnt = codexCount();
    const tabs: [CodexKind, string][] = [['fish', 'FISH'], ['giant', 'GIANTS']];
    let tx = x + 12;
    for (const [k, label] of tabs) {
      const c = codexCount(k);
      if (ui.button('codex:tab:' + k, `${label} ${c.known}/${c.total}`, tx, y + 14, 96, 18, { style: 'dark', font: 'small', on: this.tab === k })) { this.tab = k; this.scroll = 0; this.sel = ''; }
      tx += 100;
    }
    ui.text(`${cnt.known}/${cnt.total} MET`, x + half + 8, y + 19, { font: 'small', color: C.dim, shadow: null });
    // the entry grid (left pane)
    const list = codexEntries(this.tab);
    const cell = 46, cols = Math.max(1, Math.floor((half - 20) / cell));
    const gx = x + 12, gy = y + 40, rows = Math.ceil(list.length / cols), viewH = H - 52;
    ui.frame('inset', gx - 3, gy - 3, cols * cell + 4, viewH + 6);
    this.scroll = Math.max(0, Math.min(Math.max(0, rows * cell - viewH), this.scroll - (ui.hover(gx, gy, cols * cell, viewH) ? ui.wheel * 0.3 : 0)));
    ui.clip(gx - 2, gy - 2, cols * cell + 2, viewH + 4);
    list.forEach((e, i) => {
      const cx = gx + (i % cols) * cell, cy = gy + Math.floor(i / cols) * cell - this.scroll;
      if (cy < gy - cell || cy > gy + viewH) return;
      const known = !!seen[e.id];
      const hov = ui.hover(cx, cy, cell - 4, cell - 4) && ui.hover(gx, gy, cols * cell, viewH);
      const selNow = this.sel === e.id;
      // a slot per entry: gold-bordered when it is the page you are reading
      ui.fill(cx, cy, cell - 4, cell - 4, selNow || hov ? C.navy2 : C.navy);
      ui.rect(cx, cy, cell - 4, cell - 4, selNow ? C.gold : hov ? C.slate : C.line);
      const pic = known ? photoOf(e, 84) : silhouetteOf(e, 84);
      if (pic) ui.img(pic, cx + 2, cy + 7, { w: cell - 8, h: Math.round((cell - 8) * 0.66) });
      else ui.text('?', cx + (cell - 4) / 2, cy + 14, { font: 'title', color: C.faint, shadow: null, align: 'center' });
      if (hov) { ui.cursor = 'point'; if (ui.pressed) this.sel = e.id; }
    });
    ui.unclip();
    if (!this.sel && list.length) this.sel = (list.find((e) => seen[e.id]) ?? list[0]).id;
    // the selected page (right pane)
    const e = REG.get(this.sel);
    const px = x + half + 8, pw = W - half - 20;
    ui.fill(px - 8, y + 14, 1, H - 26, C.line);
    if (e) {
      const known = !!seen[e.id], s = seen[e.id];
      const pic = known ? photoOf(e, 180) : silhouetteOf(e, 180);
      const ph = Math.round(pw * 0.5), py = y + 34;
      ui.frame('inset', px, py, pw, ph);
      if (pic) { const iw = Math.round((ph - 6) / 0.66); ui.img(pic, px + Math.round((pw - Math.min(pw - 4, iw)) / 2), py + 3, { w: Math.min(pw - 4, iw), h: ph - 6 }); }
      let yy = py + 10 + ph;
      ui.text(known ? e.name : '???', px, yy, { font: 'title', color: C.bone2, shadow: C.ink }); yy += ui.lh('title');
      ui.text(known ? (e.habitat ?? (e.kind === 'fish' ? 'open water' : '')) : 'not yet met', px, yy, { font: 'small', color: C.dim, shadow: null });
      // danger: five small squares, red up to the rating
      const dg = e.danger ?? 1, dx0 = px + pw - 5 * 8 + 2;
      ui.text('DANGER', dx0 - 6, yy, { font: 'small', color: C.faint, shadow: null, align: 'right' });
      for (let i = 0; i < 5; i++) { ui.fill(dx0 + i * 8, yy + 1, 6, 6, i < dg ? C.red : C.well); if (i >= dg) ui.rect(dx0 + i * 8, yy + 1, 6, 6, C.line2); }
      yy += ui.lh('small') + 6;
      yy += ui.textBox(known ? e.desc : 'Meet it out there and the page fills itself in.', px, yy, pw, { font: 'body', color: known ? C.bone : C.dim, shadow: C.ink }) + 6;
      if (known && s) {
        const sy = Math.min(yy, y + H - 30);
        sectionHead(ui, 'FIELD NOTES', px, sy, pw);
        ui.text(`met ${s.n}  ·  beaten ${s.beaten}  ·  first at -${s.depth} m`, px, sy + 13, { font: 'small', color: C.dim, shadow: null });
      }
    }
    return true;
  }
}
