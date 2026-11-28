// ABILITY MEDALLIONS (v6): the skills as round brass portholes instead of cards. Chunky 1x pixel art (one texel per
// UI px, nearest-filtered) with hand-placed detail, every part on a 4-6 tone hue-shifted ramp:
//   the RING     a ship's-porthole bezel: an ink rim, a lit brass lip, a knurled band lit by angle, an engraved groove
//                with verdigris sitting in it, six domed bolts, a shaded inner bevel and the recess's shadow on the art;
//                worn by the sea: barnacle clusters and a coralline crust on the lower rim, an algae film, a limpet
//   the ART      per skill: a backdrop of deep water in the skill's hue with a painted MOTIF of what it does (rays and a
//                rune ring, a snowflake burst, forked lightning, flame tongues, a bubble cloud, a vortex, a scallop fan,
//                sound rings, a ring of teeth, a piranha school, a crab's claws, curling tentacles, a cog, a net, a
//                spiked mine, a target, slashes, a venom cloud, an ink splat) and, in front, the granting item rendered
//                from its 3D model with a pixel finish (src/ui/obj/studio.ts modelIcon)
//   COOLDOWN     a clockwise wipe of dark water across the art: ripple bands in it, a bright water line on its edge
//                with a few bubbles riding it (the HUD prints the seconds over it)
//   READY        a glint orbits the ring; coming off cooldown: a ring pulse, a white flash and a burst of bubbles
//   PRESSED      it sinks and squashes (a spring), the art flashes; pressed while not ready: a refusing wobble
//   SELECTED     a warm brass halo behind the ring, lifted a little
//
//   const m = new AbilityMedallion('frostNova', { d: 40, color: '#8ae0ff' });   d: diameter in UI px
//   stage.put(m.root, x, y, z)                                                 (centre)
//   m.update(dt, { cd, ready, selected, pressed, hover, noMana })              cd: 0..1 of the cooldown left
// Drop-in for SkillCard3D where a skill is shown as an object (w / h / root / update), minus the card's ledger.
import * as THREE from 'three';
import { Px, R, hx, stamp, SPR, coralline, algae, type C } from '../pixel/decor';
import { ramp } from './pixtex';
import { skillItem } from '../../game/items';
import { modelIcon } from './studio';
import { canvasPlane } from './stage';

/** the skills' colours (src/skills/registry.ts), for callers that don't pass one */
const SKILL_COLOR: Record<string, string> = {
  manaBolt: '#9a7aff', frostNova: '#8ae0ff', chainZap: '#bff4ff', magmaOrb: '#ff8a30', bubbleBarrage: '#8ff1da', whirlwind: '#ffd080',
  shieldBash: '#e8c890', warCry: '#ff8a5a', megalodon: '#9ab8d8', piranhas: '#ff6a4a', petCrab: '#ff8a4a', inkPal: '#d06ab0',
  junkTurret: '#d0a060', netTrap: '#e0c890', seaMine: '#ff5040', ballista: '#c89060', backstab: '#a060ff', poisonCloud: '#8aff5a', inkBomb: '#6a5aa0',
};
const rc = (hex: string): C[] => ramp(hex).map(hx);
const hash = (a: number, b = 0) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
const strHash = (s: string) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };

// ------------------------------------------------------------------ the ring (static per size + seed)
const ringCache = new Map<string, HTMLCanvasElement>();
/** inner radius of the art window for a diameter */
const innerR = (d: number) => Math.round(d / 2) - 7;
function paintRing(d: number, seed: number): HTMLCanvasElement {
  const key = `${d}|${seed % 4}`;
  const hit = ringCache.get(key);
  if (hit) return hit;
  const px = new Px(d, d), c = d / 2, ro = d / 2 - 0.5, ri = innerR(d);
  const B = R.brass; // 8 tones dark -> light
  const ink = hx('#120a06');
  const inRing = (x: number, y: number) => { const r = Math.hypot(x + 0.5 - c, y + 0.5 - c); return r <= ro && r >= ri; };
  for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy);
    if (r > ro) continue;
    const lit = -(dx + dy) / (Math.SQRT2 * (r || 1)); // 1 facing the top-left light
    const ang = Math.atan2(dy, dx);
    if (r >= ri) {
      const u = (r - ri) / (ro - ri); // 0 inner .. 1 outer
      let t: C;
      if (r > ro - 1) t = ink;                                                                   // outline
      else if (r > ro - 2) t = lit > 0.3 ? B[7] : lit > -0.3 ? B[5] : B[3];                       // the lit lip
      else if (u > 0.5) {                                                                        // the knurled band
        const tick = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * Math.round(d * 1.3)) % 2 === 0;
        t = tick ? (lit > 0.2 ? B[6] : lit > -0.4 ? B[4] : B[2]) : (lit > 0.2 ? B[5] : lit > -0.4 ? B[3] : B[1]);
      } else if (u > 0.36) t = B[1];                                                             // the engraved groove
      else if (u > 0.2) t = lit > 0 ? B[6] : B[4];                                               // its lit lower lip
      else if (r < ri + 1) t = ink;                                                              // the inner ink
      else t = lit > 0.4 ? B[3] : lit > -0.4 ? B[4] : B[5];                                      // the inner bevel (lit bottom-right)
      px.set(x, y, t);
    } else {
      // the recess's shadow falling on the art from the top-left wall, and a faint glass sheen
      const sh = lit > 0.15 && r > ri - 3 ? (r > ri - 1.5 ? 150 : 90) : 0;
      if (sh) px.set(x, y, hx('#050a10'), sh);
      else if (lit > 0.55 && r > ri - 5 && r < ri - 3.6) px.set(x, y, hx('#ffffff'), 70);   // a crescent of glass light
    }
  }
  // verdigris sitting in the groove in two places
  const gr = ri + (ro - ri) * 0.43;
  for (const [a0, a1] of [[2.1, 2.7], [5.0, 5.4]] as [number, number][]) for (let a = a0; a < a1; a += 0.6 / gr) {
    px.set(c + Math.cos(a) * gr - 0.5, c + Math.sin(a) * gr - 0.5, R.verd[2]);
    if (a < (a0 + a1) / 2) px.set(c + Math.cos(a) * (gr + 1) - 0.5, c + Math.sin(a) * (gr + 1) - 0.5, R.verd[1]);
  }
  // six domed bolts on the knurl, with a slot
  const br = ri + (ro - ri) * 0.72;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6, bx = Math.round(c + Math.cos(a) * br - 0.5), by = Math.round(c + Math.sin(a) * br - 0.5);
    const dome = ['.k.', 'kak', '.k.'];
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
      const ch = dome[yy + 1][xx + 1];
      if (ch === '.') px.set(bx + xx, by + yy, xx + yy < 0 ? B[7] : xx + yy > 0 ? B[2] : B[5]);
      else if (ch === 'k') px.set(bx + xx, by + yy, xx + yy < 0 ? B[6] : B[1]);
      else px.set(bx + xx, by + yy, B[4]);
    }
    px.set(bx - 1, by - 1, B[7]); px.set(bx + 1, by + 1, ink);
  }
  // the sea's growth on the lower rim (placed by the seed: medallions side by side are not identical)
  const on = (x: number, y: number) => inRing(x, y);
  const s = seed % 4;
  const pa = Math.PI * (0.25 + s * 0.08); // bottom-right-ish
  const at = (a: number, k = 0.62) => [c + Math.cos(a) * (ri + (ro - ri) * k), c + Math.sin(a) * (ri + (ro - ri) * k)] as [number, number];
  coralline(px, ...at(Math.PI * 0.72 + s * 0.05), 4.2, 2.6, seed % 7, { inside: on });
  algae(px, ...at(Math.PI * 0.5 + s * 0.06, 0.4), 5.5, 2.4, seed % 5, { inside: on });
  const [b1x, b1y] = at(pa, 0.55);
  stamp(px, SPR.barnacleL, b1x - 2, b1y - 2, { onlyOn: true });
  stamp(px, SPR.barnacleM, b1x + 2, b1y - 5, { onlyOn: true });
  stamp(px, SPR.barnacleS, b1x - 4, b1y + 2, { onlyOn: true });
  const [lx, ly] = at(Math.PI * 1.72 + s * 0.1, 0.5);
  stamp(px, SPR.limpet, lx - 4, ly - 2, { onlyOn: true });
  const cv = px.done();
  ringCache.set(key, cv);
  return cv;
}

// ------------------------------------------------------------------ the art (static per skill + size)
type Motif = (p: Px, cx: number, cy: number, r: number, K: C[], inside: (x: number, y: number) => boolean) => void;
const plot = (p: Px, x: number, y: number, c: C, inside: (x: number, y: number) => boolean) => { x = Math.round(x); y = Math.round(y); if (inside(x, y)) p.set(x, y, c); };
const line = (p: Px, x0: number, y0: number, x1: number, y1: number, c: C, inside: (x: number, y: number) => boolean, w = 1) => {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * (i / n), y = y0 + (y1 - y0) * (i / n); for (let k = 0; k < w; k++) plot(p, x + (k % 2), y + Math.floor(k / 2), c, inside); }
};
const disc = (p: Px, cx: number, cy: number, r: number, K: C[], inside: (x: number, y: number) => boolean, rim = true) => {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > r) continue;
    const t = rim && d > r - 1 ? K[0] : dx + dy < -r * 0.5 ? K[5] : dx + dy < 0 ? K[4] : dx + dy > r * 0.7 ? K[2] : K[3];
    plot(p, x, y, t, inside);
  }
};
const W = hx('#ffffff');
const MOTIF: Record<string, Motif> = {
  // a burst of eight rays (long / short) round a bright core, a dotted rune ring
  manaBolt: (p, cx, cy, r, K, ins) => {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, L = i % 2 ? r * 0.55 : r * 0.95; line(p, cx, cy, cx + Math.cos(a) * L, cy + Math.sin(a) * L, i % 2 ? K[3] : K[4], ins, 2); }
    for (let a = 0; a < Math.PI * 2; a += 0.35) plot(p, cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72, K[5], ins);
    disc(p, cx, cy, 3, K, ins); plot(p, cx - 1, cy - 1, W, ins);
  },
  // a six-armed snowflake with side branches, ice shards round the edge
  frostNova: (p, cx, cy, r, K, ins) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6, ex = cx + Math.cos(a) * r * 0.85, ey = cy + Math.sin(a) * r * 0.85;
      line(p, cx, cy, ex, ey, K[5], ins);
      for (const f of [0.45, 0.68]) { const bx = cx + Math.cos(a) * r * f, by = cy + Math.sin(a) * r * f; for (const s of [-1, 1]) line(p, bx, by, bx + Math.cos(a + s * 0.9) * r * 0.22, by + Math.sin(a + s * 0.9) * r * 0.22, K[4], ins); }
      const sx = cx + Math.cos(a + 0.52) * r * 0.92, sy = cy + Math.sin(a + 0.52) * r * 0.92; plot(p, sx, sy, K[5], ins); plot(p, sx + 1, sy, K[3], ins); plot(p, sx, sy + 1, K[2], ins);
    }
    disc(p, cx, cy, 2.2, K, ins); plot(p, cx, cy, W, ins);
  },
  // two forked bolts crossing the window, sparks
  chainZap: (p, cx, cy, r, K, ins) => {
    const bolt = (pts: [number, number][]) => { for (let i = 0; i < pts.length - 1; i++) { line(p, cx + pts[i][0] * r, cy + pts[i][1] * r, cx + pts[i + 1][0] * r, cy + pts[i + 1][1] * r, K[2], ins, 3); } for (let i = 0; i < pts.length - 1; i++) line(p, cx + pts[i][0] * r, cy + pts[i][1] * r, cx + pts[i + 1][0] * r, cy + pts[i + 1][1] * r, K[5], ins); };
    bolt([[-0.2, -1], [0.15, -0.4], [-0.25, -0.1], [0.3, 0.4], [-0.05, 1]]);
    bolt([[-0.9, -0.4], [-0.45, -0.1], [-0.6, 0.25], [-0.2, 0.55]]);
    for (const [x, y] of [[0.55, -0.5], [0.7, 0.2], [-0.7, 0.6], [0.45, 0.7]]) { plot(p, cx + x * r, cy + y * r, W, ins); plot(p, cx + x * r + 1, cy + y * r, K[4], ins); plot(p, cx + x * r, cy + y * r + 1, K[4], ins); }
  },
  // flame tongues licking up from the bottom, embers above
  magmaOrb: (p, cx, cy, r, K, ins) => {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const u = (x - cx) / r, h = r * (0.9 + 0.45 * Math.cos(u * 7) * Math.cos(u * 2)) * (1 - Math.abs(u) * 0.5);
      for (let y = Math.round(cy + r); y > cy + r - h; y--) { const k = (cy + r - y) / Math.max(1, h); plot(p, x, y, k > 0.85 ? K[5] : k > 0.6 ? K[4] : k > 0.3 ? K[3] : K[2], ins); }
    }
    for (const [x, y] of [[-0.4, -0.6], [0.3, -0.8], [0.6, -0.3], [-0.7, -0.2]]) { plot(p, cx + x * r, cy + y * r, K[5], ins); plot(p, cx + x * r, cy + y * r + 1, K[3], ins); }
  },
  // a cloud of bubbles, big to small, each lit with a glint
  bubbleBarrage: (p, cx, cy, r, K, ins) => {
    for (const [x, y, s] of [[-0.35, 0.3, 0.42], [0.35, -0.2, 0.32], [-0.1, -0.55, 0.22], [0.5, 0.5, 0.2], [-0.6, -0.3, 0.16], [0.15, 0.15, 0.14]] as [number, number, number][]) {
      const bx = cx + x * r, by = cy + y * r, br = s * r;
      for (let a = 0; a < Math.PI * 2; a += 0.6 / br) plot(p, bx + Math.cos(a) * br, by + Math.sin(a) * br, Math.cos(a) + Math.sin(a) < 0 ? K[5] : K[2], ins);
      plot(p, bx - br * 0.45, by - br * 0.45, W, ins);
    }
  },
  // a three-armed vortex
  whirlwind: (p, cx, cy, r, K, ins) => {
    for (let arm = 0; arm < 3; arm++) for (let t = 0; t < 1; t += 0.02) { const a = arm * 2.094 + t * 4.2, rr = t * r * 0.95; plot(p, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, t > 0.7 ? K[5] : t > 0.35 ? K[4] : K[3], ins); plot(p, cx + Math.cos(a) * rr + 1, cy + Math.sin(a) * rr, K[2], ins); }
  },
  // a scallop fan of ribs from the bottom
  shieldBash: (p, cx, cy, r, K, ins) => {
    for (let i = -4; i <= 4; i++) { const a = -Math.PI / 2 + i * 0.3; line(p, cx, cy + r * 0.8, cx + Math.cos(a) * r * 1.1, cy + r * 0.8 + Math.sin(a) * r * 1.4, i % 2 ? K[3] : K[5], ins, 2); }
    for (let a = -Math.PI; a < 0; a += 0.05) plot(p, cx + Math.cos(a) * r * 0.95, cy + r * 0.8 + Math.sin(a) * r * 1.15, K[1], ins);
  },
  // sound rings spreading from a conch at the left
  warCry: (p, cx, cy, r, K, ins) => {
    for (const k of [0.35, 0.6, 0.85, 1.1]) for (let a = -0.9; a < 0.9; a += 0.06) plot(p, cx - r * 0.7 + Math.cos(a) * r * k, cy + Math.sin(a) * r * k, k < 0.7 ? K[5] : K[4], ins);
    disc(p, cx - r * 0.7, cy, 3, K, ins);
  },
  // a ring of jagged teeth round the edge, the dark of a mouth
  megalodon: (p, cx, cy, r, K, ins) => {
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, tx = cx + Math.cos(a) * r, ty = cy + Math.sin(a) * r; for (let k = 0; k < 5; k++) { const f = 1 - k / 5, w = Math.round(2 * f); for (let j = -w; j <= w; j++) plot(p, tx - Math.cos(a) * k - Math.sin(a) * j, ty - Math.sin(a) * k + Math.cos(a) * j, j < 0 ? W : hx('#d8d0c0'), ins); } }
  },
  // a little school of piranhas circling
  piranhas: (p, cx, cy, r, K, ins) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, fx = cx + Math.cos(a) * r * 0.6, fy = cy + Math.sin(a) * r * 0.6;
      for (let k = -3; k <= 2; k++) for (let j = -1; j <= 1; j++) plot(p, fx + k, fy + j, j < 0 ? K[4] : j > 0 ? K[2] : K[3], ins);
      plot(p, fx - 4, fy - 1, K[2], ins); plot(p, fx - 4, fy + 1, K[2], ins); plot(p, fx + 1, fy - 1, W, ins);
    }
  },
  // sand underfoot and two raised claws
  petCrab: (p, cx, cy, r, K, ins) => {
    const S = R.sand;
    for (let y = Math.round(cy + r * 0.45); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) plot(p, x, y, y === Math.round(cy + r * 0.45) ? S[5] : (x + y) % 5 === 0 ? S[2] : S[3], ins);
    for (const s of [-1, 1]) { const x0 = cx + s * r * 0.45, y0 = cy - r * 0.15; disc(p, x0, y0, 3.2, K, ins); for (let k = 0; k < 3; k++) plot(p, x0 + s * (1 + k), y0 - 3 - k * 0.5, K[0], ins); line(p, x0, y0 + 3, x0 - s * 2, cy + r * 0.45, K[2], ins, 2); }
  },
  // three curling tentacles with suckers
  inkPal: (p, cx, cy, r, K, ins) => {
    for (let t = 0; t < 3; t++) for (let k = 0; k < 1; k += 0.03) {
      const a = -Math.PI / 2 + (t - 1) * 0.9 + Math.sin(k * 5 + t) * 0.4, rr = (1 - k) * r;
      const x = cx + Math.cos(a) * rr * 0.9 + (t - 1) * k * 4, y = cy + r * 0.9 - k * r * 1.6, w = Math.max(1, Math.round((1 - k) * 3));
      for (let j = 0; j < w; j++) plot(p, x + j, y, j === 0 ? K[4] : K[3], ins);
      if (Math.round(k * 33) % 4 === 0) plot(p, x + w, y, K[5], ins);
    }
  },
  // a cog wheel
  junkTurret: (p, cx, cy, r, K, ins) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const rr = r * 0.62 + (Math.cos(a * 8) > 0.3 ? r * 0.22 : 0);
      if (d > rr || d < r * 0.24) continue;
      plot(p, x, y, d > rr - 1 ? K[1] : dx + dy < 0 ? K[4] : K[3], ins);
    }
  },
  // a diamond net mesh with knots
  netTrap: (p, cx, cy, r, K, ins) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const u = x - cx + 40, v = y - cy + 40; if ((u + v) % 6 === 0 || (u - v + 60) % 6 === 0) plot(p, x, y, (u % 6 === 0 && (u + v) % 6 === 0) ? K[5] : K[3], ins); }
  },
  // a spiked mine
  seaMine: (p, cx, cy, r, K, ins) => {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; line(p, cx, cy, cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85, K[2], ins, 2); plot(p, cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85, K[5], ins); }
    disc(p, cx, cy, r * 0.48, rc('#5a6070'), ins); plot(p, cx - 2, cy - 2, W, ins);
    plot(p, cx + 1, cy - 1, hx('#ff4030'), ins);
  },
  // a target: rings and cross hairs
  ballista: (p, cx, cy, r, K, ins) => {
    for (const k of [0.85, 0.55, 0.25]) for (let a = 0; a < Math.PI * 2; a += 0.5 / (r * k)) plot(p, cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k, k === 0.55 ? K[5] : K[3], ins);
    line(p, cx - r, cy, cx + r, cy, K[2], ins); line(p, cx, cy - r, cx, cy + r, K[2], ins);
  },
  // three slashes across
  backstab: (p, cx, cy, r, K, ins) => {
    for (const o of [-0.45, 0, 0.45]) line(p, cx - r * 0.8 + o * r, cy + r * 0.8, cx + r * 0.6 + o * r, cy - r * 0.8, o === 0 ? K[5] : K[4], ins, 2);
  },
  // a lumpy venom cloud with a dark outline
  poisonCloud: (p, cx, cy, r, K, ins) => {
    for (const [x, y, s] of [[-0.4, 0.2, 0.45], [0.3, 0.15, 0.5], [0, -0.3, 0.45], [-0.2, 0.55, 0.3], [0.5, 0.55, 0.28]] as [number, number, number][]) disc(p, cx + x * r, cy + y * r, s * r, K, ins);
  },
  // an ink splat with flung drops
  inkBomb: (p, cx, cy, r, K, ins) => {
    const D2 = rc('#2a2040');
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const dx = x - cx, dy = y - cy, a = Math.atan2(dy, dx), rr = r * (0.5 + 0.2 * Math.sin(a * 5) + 0.1 * Math.sin(a * 11)); if (Math.hypot(dx, dy) < rr) plot(p, x, y, dx + dy < -rr * 0.4 ? D2[3] : D2[1], ins); }
    for (const [x, y] of [[0.8, -0.5], [-0.75, 0.6], [0.6, 0.75]]) disc(p, cx + x * r, cy + y * r, 1.5, D2, ins);
  },
};

const artCache = new Map<string, HTMLCanvasElement>();
function paintArt(skill: string, d: number, color: string): HTMLCanvasElement {
  const key = `${skill}|${d}|${color}`;
  const hit = artCache.get(key);
  if (hit) return hit;
  const ri = innerR(d), S = ri * 2;
  const px = new Px(S, S), c = ri;
  const inside = (x: number, y: number) => Math.hypot(x + 0.5 - c, y + 0.5 - c) <= ri;
  // deep water in the skill's hue: four bands lit from above, a slanted light shaft
  const Wt = rc(mix(color, '#12333a', 0.68));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inside(x, y)) continue;
    const f = (y + Math.round(Math.sin(x * 0.5) * 0.8)) / S;
    let t = f < 0.22 ? Wt[4] : f < 0.5 ? Wt[3] : f < 0.78 ? Wt[2] : Wt[1];
    if (Math.abs((x - y * 0.4) - S * 0.3) < 2.2 && f < 0.7) t = Wt[f < 0.35 ? 5 : 4];
    px.set(x, y, t);
  }
  const K = rc(color);
  (MOTIF[skill] ?? MOTIF.manaBolt)(px, c, c, ri - 1, K, inside);
  const cv = px.done();
  // the granting item, rendered from its model with a pixel finish, standing in front with a little cast shadow
  const it = skillItem(skill);
  if (it) {
    const cw = Math.max(...it.shape.map((q) => q[0])) + 1, ch = Math.max(...it.shape.map((q) => q[1])) + 1;
    const cell = Math.max(6, Math.round((S * 0.8) / Math.max(cw, ch)));
    const ic = modelIcon(it.id, cell);
    if (ic) {
      const x = cv.getContext('2d')!;
      x.imageSmoothingEnabled = false;
      const ix = Math.round(c - ic.width / 2), iy = Math.round(c - ic.height / 2 + 1);
      const sh = document.createElement('canvas'); sh.width = ic.width; sh.height = ic.height;
      const sx = sh.getContext('2d')!; sx.drawImage(ic, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#04080c'; sx.fillRect(0, 0, sh.width, sh.height);
      x.globalAlpha = 0.55; x.drawImage(sh, ix + 1, iy + 1); x.globalAlpha = 1;
      x.drawImage(ic, ix, iy);
      // keep it inside the window
      x.globalCompositeOperation = 'destination-in';
      x.beginPath(); x.arc(c, c, ri, 0, Math.PI * 2); x.fill();
      x.globalCompositeOperation = 'source-over';
    }
  }
  artCache.set(key, cv);
  return cv;
}
function mix(a: string, b: string, t: number) { const A = new THREE.Color(a), B = new THREE.Color(b); return '#' + A.lerp(B, t).getHexString(); }

// ------------------------------------------------------------------ the cooldown water (cached per size + step)
const STEPS = 48;
const cdCache = new Map<string, THREE.CanvasTexture>();
function cdTex(d: number, step: number): THREE.CanvasTexture {
  const key = `${d}|${step}`;
  let t = cdCache.get(key);
  if (t) return t;
  const ri = innerR(d), S = ri * 2, c = ri, px = new Px(S, S);
  const k = step / STEPS; // fraction still covered
  const edge = (1 - k) * Math.PI * 2; // the uncovered part grows clockwise from 12 o'clock
  const Wd = R.water;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy);
    if (r > ri) continue;
    let a = Math.atan2(dx, -dy); if (a < 0) a += Math.PI * 2;
    if (a < edge) continue;
    // dark water: ripple bands; the water line (its leading edge) bright
    const de = (a - edge) * r;
    if (de < 1.1 && k < 1) { px.set(x, y, Wd[8], 235); continue; }
    if (de < 2.2 && k < 1) { px.set(x, y, Wd[6], 215); continue; }
    const band = (y + Math.round(Math.sin(x * 0.6) * 0.8)) % 5 === 0;
    px.set(x, y, band ? Wd[4] : Wd[1], 200);
  }
  // a few bubbles riding the water line
  if (k > 0.04 && k < 0.98) for (const f of [0.35, 0.62, 0.86]) {
    const bx = c + Math.sin(edge) * ri * f, by = c - Math.cos(edge) * ri * f;
    px.set(bx + 1, by, Wd[9], 255); px.set(bx, by - 1, Wd[8], 220);
  }
  t = new THREE.CanvasTexture(px.done());
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  cdCache.set(key, t);
  return t;
}
/** the not-enough-mana veil: a cold blue wash with diagonal hatching */
const veilCache = new Map<number, HTMLCanvasElement>();
function veil(d: number) {
  let v = veilCache.get(d);
  if (v) return v;
  const ri = innerR(d), S = ri * 2, px = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (Math.hypot(x + 0.5 - ri, y + 0.5 - ri) <= ri) px.set(x, y, (x + y) % 4 === 0 ? hx('#3a4a9a') : hx('#0a1030'), (x + y) % 4 === 0 ? 170 : 140);
  v = px.done(); veilCache.set(d, v);
  return v;
}
/** a 3x3 sparkle and a bubble, the little sprites the medallion throws */
let sparkCv: HTMLCanvasElement | null = null, bubbleCv: HTMLCanvasElement | null = null;
function sparkle() { if (!sparkCv) { const p = new Px(5, 5); for (const [x, y, c] of [[2, 0, '#fff4c8'], [2, 1, '#ffffff'], [0, 2, '#fff4c8'], [1, 2, '#ffffff'], [2, 2, '#ffffff'], [3, 2, '#ffffff'], [4, 2, '#fff4c8'], [2, 3, '#ffffff'], [2, 4, '#fff4c8']] as [number, number, string][]) p.set(x, y, hx(c)); sparkCv = p.done(); } return sparkCv; }
function bubble() { if (!bubbleCv) { const p = new Px(5, 5); const rows = ['.kkk.', 'kw.lk', 'k...d', 'l..rd', '.ddd.']; const pal: Record<string, string> = { k: '#e6faff', l: '#b8e4ec', d: '#6ab0bc', w: '#ffffff', r: '#9ad4dc' }; rows.forEach((r, y) => { for (let x = 0; x < 5; x++) { const c = pal[r[x]]; if (c) p.set(x, y, hx(c)); } }); bubbleCv = p.done(); } return bubbleCv; }

/**
 * the selected halo (warm brass light: three stepped bands fading out, little sparks on it) and the ready pulse (a
 * crisp pale ring with a bright inner edge), painted pixel rings 5 px wider than the medallion all round
 */
const glowCache = new Map<string, HTMLCanvasElement>();
function glowRing(d: number, kind: 'halo' | 'pulse') {
  const key = `${d}|${kind}`;
  let cv = glowCache.get(key);
  if (cv) return cv;
  const S = d + 10, c = S / 2, ro = d / 2, px = new Px(S, S);
  const G = kind === 'halo' ? ramp('#f2c66d').map(hx) : R.glass;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.hypot(x + 0.5 - c, y + 0.5 - c), e = r - ro;
    if (kind === 'halo') {
      if (e < -1 || e > 4.5) continue;
      const a = Math.atan2(y - c, x - c);
      const spark = e > 1.5 && e < 2.5 && Math.round(((a + Math.PI) / (Math.PI * 2)) * 24) % 6 === 0;
      px.set(x, y, spark ? hx('#fff4c8') : e < 0.5 ? G[5] : e < 2 ? G[4] : G[3], spark ? 255 : e < 0.5 ? 230 : e < 2 ? 150 : e < 3.3 ? 90 : 40);
    } else {
      if (e < -1.5 || e > 1.5) continue;
      px.set(x, y, e < -0.5 ? G[4] : e < 0.5 ? hx('#ffffff') : G[3], e < 0.5 ? 255 : 170);
    }
  }
  cv = px.done(); glowCache.set(key, cv);
  return cv;
}
let bubbleTex: THREE.CanvasTexture | null = null;
const BUBBLE_GEO = new THREE.PlaneGeometry(5, 5);

export interface MedallionState {
  /** 0..1 of the cooldown still to run */
  cd?: number;
  /** usable now (off cooldown and enough mana) */
  ready?: boolean;
  /** the selected slot */
  selected?: boolean;
  /** its key is held down */
  pressed?: boolean;
  /** 0..1 mouse hover */
  hover?: number;
  /** off cooldown but short of mana */
  noMana?: boolean;
  // (SkillCard3D compatibility: ignored)
  mx?: number; my?: number; ledger?: boolean;
}

export class AbilityMedallion {
  root = new THREE.Group();
  private body = new THREE.Group();
  private cdPlane: THREE.Mesh;
  private veilPlane: THREE.Mesh;
  private flash: THREE.Mesh;
  private halo: THREE.Mesh;
  private pulse: THREE.Mesh;
  private glint: THREE.Mesh;
  private bubbles: { m: THREE.Mesh; t: number; vx: number; vy: number }[] = [];
  private t = Math.random() * 10;
  private prevCd = 0; private sq = 0; private sqV = 0; private flashT = 0; private pulseT = 9; private wob = 0; private lift = 0;
  private wasPressed = false;
  readonly d: number;
  readonly skill: string;
  /** SkillCard3D-compatible size */
  get w() { return this.d; }
  get h() { return this.d; }

  constructor(skill: string, o: { d?: number; w?: number; color?: string } = {}) {
    this.skill = skill;
    const d = (this.d = Math.round(o.d ?? o.w ?? 40));
    const color = o.color ?? SKILL_COLOR[skill] ?? '#8ac8ff';
    const ri = innerR(d);
    const seed = strHash(skill);
    const basic = (m: THREE.Mesh, z: number) => { (m.material as THREE.MeshBasicMaterial).depthWrite = false; m.position.z = z; return m; };
    // the art, the cooldown water over it, the mana veil, a white flash, then the ring on top
    const art = basic(canvasPlane(paintArt(skill, d, color), ri * 2, ri * 2), 0);
    this.cdPlane = basic(new THREE.Mesh(new THREE.PlaneGeometry(ri * 2, ri * 2), new THREE.MeshBasicMaterial({ map: cdTex(d, STEPS), transparent: true, toneMapped: false })), 0.4);
    this.veilPlane = basic(canvasPlane(veil(d), ri * 2, ri * 2), 0.5);
    const fl = document.createElement('canvas'); fl.width = fl.height = ri * 2; const fx = fl.getContext('2d')!; fx.fillStyle = '#ffffff'; fx.beginPath(); fx.arc(ri, ri, ri, 0, Math.PI * 2); fx.fill();
    this.flash = basic(canvasPlane(fl, ri * 2, ri * 2), 0.6);
    (this.flash.material as THREE.MeshBasicMaterial).opacity = 0;
    const ring = basic(canvasPlane(paintRing(d, seed), d, d), 1);
    // the selected halo behind, the ready pulse ring, the orbiting glint
    this.halo = basic(canvasPlane(glowRing(d, 'halo'), d + 10, d + 10), -0.5);
    this.pulse = basic(canvasPlane(glowRing(d, 'pulse'), d + 10, d + 10), 1.4);
    this.glint = basic(canvasPlane(sparkle(), 5, 5), 1.6);
    this.body.add(this.halo, art, this.cdPlane, this.veilPlane, this.flash, ring, this.glint, this.pulse);
    this.root.add(this.body);
  }

  /** a cast / an outside nudge: the press squash and a flash */
  bump() { this.sqV -= 7; this.flashT = Math.max(this.flashT, 0.6); }

  update(dt: number, s: MedallionState = {}) {
    this.t += dt;
    const cd = Math.max(0, Math.min(1, s.cd ?? 0));
    const ready = s.ready ?? cd <= 0;
    // came off cooldown: a ring pulse, a flash, a burst of bubbles
    if (this.prevCd > 0.001 && cd <= 0.001) { this.pulseT = 0; this.flashT = 1; this.burst(); this.sqV += 5; }
    // just cast (the cooldown jumped up)
    if (cd > this.prevCd + 0.2) this.bump();
    this.prevCd = cd;
    // pressed: sink + squash; pressed while not ready: a refusing wobble
    const pressed = !!s.pressed;
    if (pressed && !this.wasPressed) { if (ready) this.bump(); else this.wob = 1; }
    this.wasPressed = pressed;
    this.sqV += (-this.sq * 260 - this.sqV * 14) * dt;
    this.sq += this.sqV * dt;
    this.wob = Math.max(0, this.wob - dt * 3);
    const sink = pressed ? 0.9 : 1;
    const hov = s.hover ?? 0;
    this.lift += ((s.selected ? 4 : 0) + hov * 2 - this.lift) * Math.min(1, dt * 12);
    const sc = Math.max(0.6, 1 + this.sq * 0.12) * sink * (1 + hov * 0.04);
    this.body.scale.set(sc * (1 - this.sq * 0.05), sc, 1);
    this.body.position.set(Math.sin(this.t * 40) * this.wob * 2, this.lift - (pressed ? 1 : 0), hov * 6);
    this.body.rotation.z = Math.sin(this.t * 30) * this.wob * 0.08;
    // cooldown water
    const step = Math.round(cd * STEPS);
    this.cdPlane.visible = step > 0;
    if (step > 0) { const m = this.cdPlane.material as THREE.MeshBasicMaterial, tx = cdTex(this.d, step); if (m.map !== tx) { m.map = tx; m.needsUpdate = true; } }
    this.veilPlane.visible = !!s.noMana && cd <= 0.001;
    this.flashT = Math.max(0, this.flashT - dt * 3);
    (this.flash.material as THREE.MeshBasicMaterial).opacity = this.flashT * 0.7;
    // the selected halo breathes; the ready pulse spreads out and fades
    (this.halo.material as THREE.MeshBasicMaterial).opacity = s.selected ? 0.55 + Math.sin(this.t * 4) * 0.2 : hov * 0.35;
    this.pulseT += dt;
    const pk = Math.min(1, this.pulseT / 0.55);
    this.pulse.visible = pk < 1;
    this.pulse.scale.setScalar(1 + pk * 0.55);
    (this.pulse.material as THREE.MeshBasicMaterial).opacity = (1 - pk) * 0.9;
    // the glint: orbits the ring while ready, resting (hidden) while charging
    const ga = -Math.PI / 2 + this.t * 1.6, gr = this.d / 2 - 3;
    this.glint.visible = ready && Math.sin(this.t * 1.6 * 0.5) > -0.2;
    this.glint.position.set(Math.cos(ga) * gr, Math.sin(ga) * gr, 1.6);
    this.glint.scale.setScalar(0.8 + 0.4 * Math.abs(Math.sin(this.t * 6)));
    // bubbles from the burst
    for (const b of this.bubbles) { b.t += dt; b.vy += dt * 30; b.m.position.x += b.vx * dt; b.m.position.y += b.vy * dt; b.vx *= 1 - dt * 2; (b.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - b.t / 0.9); }
    for (const b of this.bubbles.filter((q) => q.t > 0.9)) { b.m.removeFromParent(); (b.m.material as THREE.Material).dispose(); }
    this.bubbles = this.bubbles.filter((q) => q.t <= 0.9);
  }

  private burst() {
    bubbleTex ??= canvasPlane(bubble(), 5, 5).tex;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, m = new THREE.Mesh(BUBBLE_GEO, new THREE.MeshBasicMaterial({ map: bubbleTex, transparent: true, toneMapped: false, depthWrite: false }));
      m.scale.setScalar(i % 3 === 0 ? 1 : 0.6);
      m.position.set(Math.cos(a) * this.d * 0.42, Math.sin(a) * this.d * 0.42, 2);
      this.body.add(m);
      this.bubbles.push({ m, t: 0, vx: Math.cos(a) * 22, vy: Math.sin(a) * 22 + 10 });
    }
  }
}
