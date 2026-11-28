// The MAILBOX panel (v8b kit): what Marge brought home, parcel by parcel. Each row is the parcel's photo in a slot (a
// count on material stacks, its rarity pip), its name, what it is and how it came home, what it is worth, and two buttons:
//   RECEIVE  into the sea chest (gear) / onto the materials shelf: the row slides off toward the chest
//   DISPOSE  Marge takes it back and pays in PEARLS: the row flashes, pearls fly in an arc into the purse (top right),
//            which counts up as each one lands (coin ticks, a bump, a sparkle)
// RECEIVE ALL / DISPOSE ALL along the bottom do every row in a quick ripple. The right pane shows the hovered (or
// selected) parcel up close (photo, stats, sets, fuses) and its worth. Empty: the mailbox with its flag down.
//
//   const mp = new MailPanel(); mp.open(); each frame: if (mp.draw(ui, dt)) close; on close: mp.flush()
//   mp.onMail = (kind, parcel, pearls) => ...      (the screen rings the mailbox bell, Mr. Crab reacts)
import type { PixelUI } from '../ui/pixel/ui';
import { META, type MailItem } from '../meta/meta';
import { ITEMS, getItem } from '../game/items';
import { C, RARITY_UI, sectionHead } from '../ui/pixel/skins';
import { audio } from '../audio/audio';
import { easeInOut } from '../core/math';
import { K, KIND_LABEL, itemPhoto } from './itemCard';
import { wellArt, rowArt, pearlArt, emptyMailArt } from './panelArt';
import { pop, panelRect, frame, detail } from './panels';
import { mailValue, receiveMail, disposeMail, pearls, isMaterial, mailTotal } from './mail';

export const MAIL_SIZE: [number, number] = [520, 300];
export const mailRect = (ui: PixelUI) => panelRect(ui, ...MAIL_SIZE);

type Kind = 'receive' | 'dispose';
interface Leaving { m: MailItem; t: number; kind: Kind; delay: number; done: boolean }
interface Flyer { x0: number; y0: number; t: number; delay: number; dur: number; v: number; arc: number }
interface Floater { text: string; x: number; y: number; t: number; col: string }

const ROW = 32;
/** seconds a row takes to leave before the parcel is actually received / disposed of */
const OUT = 0.28;

export class MailPanel {
  /** a parcel was received / disposed of (pearls gained); the screen rings the bell, Mr. Crab reacts */
  onMail?: (kind: Kind, m: MailItem, v: number) => void;
  private sel: number | null = null;
  private leaving = new Map<number, Leaving>();
  private flyers: Flyer[] = [];
  private floaters: Floater[] = [];
  /** the purse as shown: counts up as pearls land */
  private purse = 0;
  private bump = 0;
  private scroll = 0; private scrollT = 0;
  private purseAt: [number, number] = [0, 0];
  private t = 0;

  open() {
    this.purse = pearls(); this.sel = null; this.leaving.clear(); this.flyers = []; this.floaters = [];
    this.scroll = this.scrollT = 0; this.bump = 0;
  }
  /** finish every pending receive / dispose now (closing mid-animation never loses a parcel or a pearl) */
  flush() {
    for (const l of this.leaving.values()) this.commit(l);
    this.leaving.clear(); this.flyers = []; this.purse = pearls();
  }
  /** test hook: the parcels in the box (uids, in row order) */
  get uids() { return META.mail.map((m) => m.uid); }

  private commit(l: Leaving) {
    if (l.done) return;
    l.done = true;
    if (l.kind === 'receive') { const m = receiveMail(l.m.uid); if (m) this.onMail?.('receive', m, 0); }
    else { const v = disposeMail(l.m.uid); if (v) this.onMail?.('dispose', l.m, v); }
  }
  /** start a parcel leaving (the row animates out, then the meta changes); from (x, y): the button pressed */
  private act(m: MailItem, kind: Kind, x: number, y: number, delay = 0) {
    if (this.leaving.has(m.uid)) return;
    this.leaving.set(m.uid, { m, t: 0, kind, delay, done: false });
    if (this.sel === m.uid) this.sel = null;
    if (kind === 'dispose') {
      const v = mailValue(m), n = Math.min(10, Math.max(1, v));
      for (let i = 0; i < n; i++) this.flyers.push({ x0: x + ((i * 7) % 9) - 4, y0: y - ((i * 5) % 5), t: 0, delay: delay + 0.05 + i * 0.045, dur: 0.55 + ((i * 13) % 7) * 0.04, v: v / n, arc: 26 + ((i * 11) % 5) * 6 });
      this.floaters.push({ text: `+${v}`, x, y: y - 4, t: -delay, col: K.brass2 });
      if (!delay || delay < 0.02) { audio.play('coins_pile1', { vol: 0.35, dry: true }); audio.play('k_pluck2', { vol: 0.25, dry: true, rate: 0.8 }); }
    } else {
      const lab = isMaterial(m) ? `+${m.n} ${ITEMS[m.id] ? getItem(m.id).name : m.id}` : 'TO THE CHEST';
      this.floaters.push({ text: lab, x, y: y - 4, t: -delay, col: K.kelpL });
      if (!delay || delay < 0.02) audio.play(isMaterial(m) ? 'bag_zip1' : 'chest_creak', { vol: 0.35, dry: true });
    }
  }

  /** returns true when the panel wants to close */
  draw(ui: PixelUI, dt: number): boolean {
    this.t += dt;
    const r = pop(ui, 'mail', mailRect(ui));
    const { close, inner } = frame(ui, 'post', 'MAILBOX', r, 'mailX');
    // ---- the leaving rows: commit when their time is up
    for (const l of this.leaving.values()) { l.t += dt; if (l.t >= l.delay + OUT) this.commit(l); }
    for (const [uid, l] of this.leaving) if (l.done && l.t > l.delay + OUT + 0.02) this.leaving.delete(uid);
    const list = META.mail.filter((m) => !this.leaving.get(m.uid)?.done);
    const live = list.filter((m) => !this.leaving.has(m.uid));
    // ---- header: the count, the purse
    const hy = inner.y + 3;
    ui.icon('mail', inner.x + 4, hy + 3);
    const head = live.length ? `${live.length} PARCEL${live.length > 1 ? 'S' : ''} FROM THE SEA` : 'NOTHING WAITING';
    ui.text(head, inner.x + 18, hy + 1, { font: 'body', color: C.bone2, shadow: C.ink });
    ui.text(live.length ? 'mailed with Marge, or carried home' : 'Marge brings what you send from her post office', inner.x + 18 + ui.measure(head, 'body') + 8, hy + 3, { font: 'small', color: C.faint, shadow: null });
    this.drawPurse(ui, inner.x + inner.w - 128, inner.y - 1, 100, 20, dt);
    // ---- the list and the detail pane
    const ly = inner.y + 27, lh = inner.h - 27 - 27, lw = 312;
    const dx = inner.x + lw + 6, dw = inner.x + inner.w - dx;
    if (!list.length && !this.flyers.length) {
      this.empty(ui, inner.x, ly, inner.w, lh);
    } else {
      ui.img(wellArt(lw, lh), inner.x, ly);
      const hov = this.rows(ui, list, inner.x, ly, lw, lh);
      ui.img(wellArt(dw, lh), dx, ly);
      const show = hov ?? list.find((m) => m.uid === this.sel && !this.leaving.has(m.uid)) ?? live[0];
      if (show) this.info(ui, show, dx, ly, dw, lh);
      else ui.text('All sorted!', dx + dw / 2, ly + lh / 2 - 6, { font: 'title', color: C.bone2, shadow: C.ink, align: 'center' });
    }
    // ---- the bottom bar: hints, RECEIVE ALL, DISPOSE ALL
    const by = inner.y + inner.h - 22;
    const total = live.reduce((a, m) => a + mailValue(m), 0);
    const bw = 108;
    const rx = inner.x + inner.w - bw, dxb = rx - bw - 6;
    if (ui.button('mail:recvAll', 'RECEIVE ALL', rx, by, bw, 21, { style: 'green', disabled: !live.length, font: 'body', sfx: '' })) {
      live.forEach((m, i) => this.act(m, 'receive', rx + bw / 2, by, i * 0.06));
      audio.play('chest_creak', { vol: 0.4, dry: true }); audio.play('bag_zip1', { vol: 0.3, dry: true, delay: 0.1 });
    }
    if (ui.button('mail:dispAll', 'DISPOSE ALL', dxb, by, bw, 21, { style: 'red', disabled: !live.length, font: 'body', sfx: '' })) {
      live.forEach((m, i) => this.act(m, 'dispose', dxb + bw / 2, by, i * 0.06));
      audio.play('coins_many1', { vol: 0.45, dry: true });
    }
    if (live.length) this.price(ui, total, dxb - 4, by + 4, 'right');
    ui.text('RECEIVE: into your sea chest', inner.x + 4, by, { font: 'small', color: C.faint, shadow: null });
    ui.text('DISPOSE: Marge pays you in pearls', inner.x + 4, by + 11, { font: 'small', color: C.faint, shadow: null });
    // ---- on top: flying pearls, rising labels
    this.drawFlyers(ui, dt);
    for (const f of this.floaters) {
      f.t += dt;
      if (f.t < 0) continue;
      const k = f.t / 1.1, a = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
      ui.text(f.text, f.x, f.y - Math.round(easeInOut(Math.min(1, k)) * 18), { font: 'body', color: f.col, shadow: C.ink, align: 'center', alpha: a });
    }
    this.floaters = this.floaters.filter((f) => f.t < 1.1);
    void r;
    return close;
  }

  /** the purse: a well with a pearl and the count (counting up as pearls land, bumping on each) */
  private drawPurse(ui: PixelUI, x: number, y: number, w: number, h: number, dt: number) {
    this.bump = Math.max(0, this.bump - dt * 4);
    ui.img(wellArt(w, h), x, y);
    const pa = pearlArt(9), b = this.bump > 0 ? 1 : 0;
    const px = x + 6, py = y + Math.round((h - pa.height) / 2) - b;
    ui.img(pa, px, py);
    this.purseAt = [px + 4, py + 4];
    const shown = Math.round(Math.min(this.purse, pearls() + 999));
    ui.text(String(shown), px + 14, y + Math.round((h - ui.cap('title')) / 2) - b, { font: 'title', color: this.bump > 0.5 ? C.gold2 : C.gold, shadow: C.ink });
    ui.text('PEARLS', x + w - 5, y + Math.round((h - ui.cap('small')) / 2) + 1, { font: 'small', color: C.dim, shadow: null, align: 'right' });
  }
  /** "+N (pearl)" price tag; align right: ends at x */
  private price(ui: PixelUI, v: number, x: number, y: number, align: 'left' | 'right' = 'left', dim = false, font: 'body' | 'small' = 'body') {
    const t = `+${v}`, tw = ui.measure(t, font), pa = pearlArt(font === 'small' ? 6 : 7);
    const x0 = align === 'right' ? x - tw - pa.width - 2 : x;
    ui.text(t, x0, y, { font, color: dim ? C.dim : C.gold, shadow: C.ink });
    ui.img(pa, x0 + tw + 2, y + Math.round((ui.cap(font) - pa.height) / 2) + 1);
    return tw + pa.width + 2;
  }

  /** the rows (my own list: eased rows close the gap a parcel leaves); returns the hovered parcel */
  private rows(ui: PixelUI, list: MailItem[], x: number, y: number, w: number, h: number): MailItem | null {
    const n = list.length, content = n * ROW + 6, maxS = Math.max(0, content - h);
    const over = ui.hover(x, y, w, h);
    if (over) { ui.block(x, y, w, h); if (ui.wheel) this.scrollT += ui.wheel * ROW; }
    this.scrollT = Math.max(0, Math.min(maxS, this.scrollT));
    this.scroll += (this.scrollT - this.scroll) * Math.min(1, ui.dt * 14);
    const sbW = maxS > 0 ? 6 : 0;
    const rw = w - 8 - (sbW ? sbW + 2 : 0);
    let hov: MailItem | null = null;
    ui.clip(x + 3, y + 3, w - 6, h - 6);
    list.forEach((m, i) => {
      const ty = y + 4 + i * ROW - Math.round(this.scroll);
      const ry = Math.round(ui.ease('mrow:' + m.uid, ty, 16));
      if (ry > y + h || ry + ROW < y) return;
      const l = this.leaving.get(m.uid);
      const k = l ? Math.max(0, Math.min(1, (l.t - l.delay) / OUT)) : 0;
      const rx = x + 4 + (l?.kind === 'receive' ? Math.round(easeInOut(k) * 60) : 0);
      const alpha = 1 - k;
      const rowHover = !l && ui.hover(x + 4, Math.max(y, ry), rw, ROW - 2) && ry + ROW - 2 <= y + h + 8;
      if (rowHover) hov = m;
      this.row(ui, m, i, rx, ry, rw, rowHover, alpha, l);
      if (rowHover && ui.released && ui.active === null) { this.sel = m.uid; }
    });
    ui.unclip();
    if (sbW) {
      const tx = x + w - sbW - 3, th = Math.max(16, Math.round((h * h) / content)), tyy = y + 3 + Math.round(((h - 6 - th) * this.scroll) / maxS);
      ui.fill(tx + 1, y + 3, 3, h - 6, C.ink); ui.fill(tx + 1, tyy, 3, th, C.slate);
    }
    return hov;
  }

  private row(ui: PixelUI, m: MailItem, i: number, x: number, y: number, w: number, hov: boolean, alpha: number, l: Leaving | undefined) {
    const known = !!ITEMS[m.id];
    const d = known ? getItem(m.id) : null;
    const sel = this.sel === m.uid;
    const st = sel ? 'sel' : hov ? 'hover' : 'off';
    ui.img(rowArt(w, ROW - 2, st, i, 26), x, y, { alpha });
    if (l?.kind === 'dispose') ui.fill(x + 1, y + 1, w - 2, ROW - 4, C.red0, 0.6 * (1 - alpha));
    if (l?.kind === 'receive') ui.fill(x + 1, y + 1, w - 2, ROW - 4, C.sage0, 0.6 * (1 - alpha));
    // the photo in its slot, a rarity pip, the stack count
    const pic = known ? itemPhoto(m.id, m.level, 22 * ui.hd) : null;
    if (pic) ui.img(pic, x + 5, y + 3, { w: 22, h: 22, alpha }); else ui.item(m.id, x + 6, y + 5, 20, 20, m.level, alpha);
    if (d) { ui.fill(x + 24, y + 4, 4, 4, C.ink, alpha); ui.fill(x + 25, y + 5, 2, 2, RARITY_UI[d.rarity], alpha); }
    if (m.n > 1) ui.text(`x${m.n}`, x + 28, y + 19, { font: 'small', color: C.bone, shadow: C.ink, align: 'right', alpha });
    // name (its rarity colour), and under it what it is ... what Marge pays for it
    const BW = 52, rbx = x + w - BW - 6, dbx = rbx - BW - 4;
    const tx = x + 33, nameW = dbx - 6 - tx;
    let name = d ? d.name + (m.level > 1 ? ` +${m.level - 1}` : '') : m.id;
    while (name.length > 4 && ui.measure(name, 'body') > nameW) name = name.slice(0, -2) + '…';
    ui.text(name, tx, y + 5, { font: 'body', color: d ? C.bone : C.dim, shadow: C.ink, alpha });
    if (d) {
      const rw = ui.text(d.rarity.toUpperCase(), tx, y + 18, { font: 'small', color: RARITY_UI[d.rarity], shadow: null, alpha });
      ui.text(isMaterial(m) ? 'MATERIAL' : KIND_LABEL[d.kind] ?? d.kind.toUpperCase(), tx + rw + 4, y + 18, { font: 'small', color: C.faint, shadow: null, alpha });
    } else ui.text('UNKNOWN', tx, y + 18, { font: 'small', color: C.faint, shadow: null, alpha });
    if (l) return;
    this.price(ui, mailValue(m), dbx - 5, y + 16, 'right', !hov && !sel, 'small');
    // DISPOSE, RECEIVE
    const bh = 18, byy = y + Math.round((ROW - 2 - bh) / 2) - 1;
    if (ui.button(`mail:disp:${m.uid}`, 'DISPOSE', dbx, byy, BW, bh, { style: 'red', font: 'small', sfx: '' })) this.act(m, 'dispose', dbx + BW / 2, byy);
    if (ui.button(`mail:recv:${m.uid}`, 'RECEIVE', rbx, byy, BW, bh, { style: 'green', font: 'small', sfx: '' })) this.act(m, 'receive', rbx + BW / 2, byy);
  }

  /** the detail pane: the parcel up close, then its worth and how it came home */
  private info(ui: PixelUI, m: MailItem, x: number, y: number, w: number, h: number) {
    if (!ITEMS[m.id]) { ui.textBox('A soggy parcel nobody can read. Dispose of it?', x + 8, y + 8, w - 16, { font: 'body', color: C.bone, shadow: C.ink }); return; }
    const foot = 36;
    detail(ui, m.id, m.level, x + 8, y + 8, w - 16, h - 16 - foot, { n: m.n });
    const fy = y + h - foot;
    sectionHead(ui, 'WORTH', x + 8, fy, w - 16);
    this.price(ui, mailValue(m), x + 8, fy + 13);
    ui.text(m.from === 'home' ? 'carried home by you' : 'mailed home with Marge', x + w - 8, fy + 15, { font: 'small', color: C.faint, shadow: null, align: 'right' });
  }

  /** no mail: the mailbox with its flag down, and how mail gets here */
  private empty(ui: PixelUI, x: number, y: number, w: number, h: number) {
    ui.img(wellArt(w, h), x, y);
    const art = emptyMailArt();
    const ax = x + Math.round((w - art.width) / 2), ay = y + 26;
    ui.img(art, ax, ay);
    let yy = ay + art.height + 14;
    ui.text('NO MAIL TODAY', x + w / 2, yy, { font: 'title', color: C.bone2, shadow: C.ink, align: 'center' });
    yy += ui.lh('title') + 6;
    const lines = ['On a dive, Marge waits at her post office buoy: mail loot home and it lands here, safe even if you sink.', 'Beat the last boss and everything you carry comes home here too.'];
    for (const l of lines) yy += ui.textBox(l, x + w / 2 - 160, yy, 320, { font: 'small', color: C.dim, shadow: null, align: 'center' }) + 4;
    void mailTotal;
  }

  /** pearls flying from where they were paid into the purse; each one lands with a tick and bumps the count */
  private drawFlyers(ui: PixelUI, dt: number) {
    const [tx, ty] = this.purseAt, pa = pearlArt(7);
    for (const f of this.flyers) {
      f.t += dt;
      const k = (f.t - f.delay) / f.dur;
      if (k < 0) continue;
      if (k >= 1) {
        if (f.v > 0) {
          this.purse += f.v; f.v = 0; this.bump = 1;
          audio.play('coin', { vol: 0.16, dry: true, rate: 1.1 + (this.purse % 7) * 0.04 });
        }
        continue;
      }
      const e = easeInOut(k);
      const px = f.x0 + (tx - f.x0) * e, py = f.y0 + (ty - f.y0) * e - Math.sin(Math.PI * k) * f.arc;
      ui.img(pa, Math.round(px - 3), Math.round(py - 3));
    }
    this.flyers = this.flyers.filter((f) => f.t - f.delay < f.dur + 0.05);
    if (!this.flyers.length && Math.abs(this.purse - pearls()) > 0 && !this.leaving.size) this.purse = pearls();
  }
}
