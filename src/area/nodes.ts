// Harvestable resource nodes: ore veins, crystal clusters, mana crystals, kelp bundles, shell piles, giant clams
// (pearls), scrap piles and sunken crates. The sword (or any hit()) chips them: sparks, debris, a squash and a
// white flash; the last hit breaks them into item drops (world.drop) and emits 'resource' {id, n, x, y}.
// Contents are rolled when the node (re)spawns, so a node advertises what is inside with a glint coloured by
// its best item's rarity and, for rare and better, a pulsing light beam. Nodes resting on the sand fall into
// craters and get buried by drifting sand (and a blast can uncover a buried crate). Most regrow after a while.
import * as THREE from 'three';
import type { Entity, World, Team, DamageKind } from '../game/types';
import type { AreaDef, NodeKind } from './defs';
import type { Scenery } from './scenery';
import { Soup, V3, UVR, mat4, addIndexed } from '../world/lp';
import { boulder } from '../world/rockgen';
import { materialId, rarityOf } from './materials';
import { RARITY_COLOR, RARITY_ORDER, rollItem, type Rarity } from '../game/items';
import { Rng } from '../core/rng';
import { damp } from '../core/math';
import type { Buried } from '../world/sand';
import type { PropRegion } from './props';

const TAU = Math.PI * 2;

interface KindDef { hp: number; respawn: number; r: number; onSand: boolean; buriedChance: number; n: [number, number]; hitSfx: string[]; breakSfx: string[]; debris: string }
const KIND: Record<NodeKind, KindDef> = {
  ore: { hp: 4, respawn: 110, r: 0.7, onSand: false, buriedChance: 0, n: [2, 3], hitSfx: ['clank1', 'clank2', 'hit2'], breakSfx: ['crunch1', 'gravel1'], debris: '#7a7066' },
  crystal: { hp: 3, respawn: 140, r: 0.6, onSand: false, buriedChance: 0, n: [1, 3], hitSfx: ['k_glass1', 'k_glass2', 'ice1'], breakSfx: ['k_glass3', 'ice_big'], debris: '#c0b0ff' },
  mana: { hp: 4, respawn: 180, r: 0.7, onSand: false, buriedChance: 0, n: [1, 2], hitSfx: ['k_glass2', 'magic1'], breakSfx: ['magic2', 'k_glass4'], debris: '#8ab0ff' },
  kelp: { hp: 1, respawn: 35, r: 0.55, onSand: true, buriedChance: 0, n: [1, 2], hitSfx: ['sw_swish1', 'cloth1'], breakSfx: ['cloth1'], debris: '#7a6224' },
  shells: { hp: 1, respawn: 70, r: 0.5, onSand: true, buriedChance: 0.35, n: [1, 3], hitSfx: ['crunch1'], breakSfx: ['crunch1', 'gravel1'], debris: '#e0d4c0' },
  clam: { hp: 2, respawn: 50, r: 0.6, onSand: true, buriedChance: 0, n: [1, 1], hitSfx: ['clank1', 'hit1'], breakSfx: ['jin_rare1', 'chime1'], debris: '#d8d0c0' },
  scrap: { hp: 3, respawn: 100, r: 0.65, onSand: true, buriedChance: 0.3, n: [2, 3], hitSfx: ['clank1', 'clank2'], breakSfx: ['clank2', 'crunch1'], debris: '#7a4a2a' },
  crate: { hp: 2, respawn: 0, r: 0.55, onSand: true, buriedChance: 0.5, n: [2, 3], hitSfx: ['box_thud', 'creak1'], breakSfx: ['box_open', 'crunch1'], debris: '#7a5a34' },
};

/** default loot tables per area (weights) */
function lootTable(a: AreaDef, k: NodeKind): [string, number][] {
  if (a.loot?.[k]) return a.loot[k]!;
  switch (k) {
    case 'ore': return a.id === 'reef' ? [['copperOre', 5], ['ironOre', 4], ['goldNugget', 1]] : a.id === 'kelp' ? [['ironOre', 5], ['copperOre', 3], ['goldNugget', 1]] :
      a.id === 'graveyard' ? [['ironOre', 5], ['leadShot', 2], ['goldNugget', 1.2]] : a.id === 'arctic' ? [['ironOre', 4], ['copperOre', 2], ['riverStone', 2], ['goldNugget', 1.2]] :
        [['ironOre', 3], ['goldNugget', 2], ['copperOre', 2]];
    case 'crystal': return a.id === 'arctic' ? [['aquamarine', 6], ['amethyst', 2], ['emerald', 1]] : a.id === 'abyss' ? [['amethyst', 3], ['abyssCrystal', 1], ['ruby', 1]] :
      a.id === 'graveyard' ? [['amethyst', 3], ['ruby', 1], ['seaGlass', 3]] : a.id === 'kelp' ? [['emerald', 2], ['amethyst', 3], ['aquamarine', 2]] : [['amethyst', 4], ['aquamarine', 3], ['emerald', 1], ['ruby', 0.5]];
    case 'mana': return a.id === 'abyss' ? [['manaCrystal', 6], ['abyssCrystal', 1]] : [['manaCrystal', 1]];
    case 'kelp': return [['kelp', 1]];
    case 'shells': return a.id === 'reef' ? [['seashell', 5], ['coralShard', 3], ['seaGlass', 1], ['pearl', 0.4]] : a.id === 'kelp' ? [['seashell', 5], ['urchinSpine', 2], ['pearl', 0.3]] : [['seashell', 5], ['seaGlass', 1.5], ['pearl', 0.3]];
    case 'clam': return [['pearl', 1]];
    case 'scrap': return [['scrapMetal', 5], ['rustyNail', 3], ['rustyHook', 2], ['leadShot', 1.5], ['lineScrap', 2], ['glassLens', 0.4]];
    case 'crate': return [['driftwood', 4], ['doubloon', 2], ['cork', 2], ['lineScrap', 1], ['seaGlass', 1]];
  }
}

// ------------------------------------------------------------------ meshes
function gemPrism(s: Soup, base: V3, dir: V3, len: number, rad: number, r: UVR) {
  const from = s.count;
  s.lathe([[rad, 0], [rad * 1.05, len * 0.72], [0, len]], 6, r, { a0: Math.random() * 1 });
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(...dir).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(up, d);
  s.transformSince(from, new THREE.Matrix4().compose(new THREE.Vector3(...base), q, new THREE.Vector3(1, 1, 1)));
}

function buildNodeSoup(kind: NodeKind, scen: Scenery, rng: Rng, contents: string[]): { soup: Soup; extra?: { top: Soup; bottom: Soup; mantle: Soup; pearl: Soup } } {
  const P = scen.props, s = new Soup();
  switch (kind) {
    case 'ore': {
      const b = boulder(rng.int(1, 1e6), { level: 1, rough: 0.35, cuts: 4 });
      s.append(b, mat4(0, -0.15, 0, 0.75, 0.75, 0.6, rng.range(0, 6)), { uv: P.get('rock') });
      const best = contents.includes('goldNugget') ? 'gold' : contents.includes('copperOre') ? 'copper' : 'ironOre';
      for (let i = 0; i < 9; i++) {
        const a = rng.range(0, TAU), el = rng.range(0.1, 1.2);
        const d: V3 = [Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el) * 0.8];
        const reg: PropRegion = i < 3 ? best as PropRegion : rng.pick(['copper', 'ironOre', best]) as PropRegion;
        s.glow(reg === 'gold' ? 0.25 : 0.08);
        gemPrism(s, [d[0] * 0.55, 0.3 + d[1] * 0.35, d[2] * 0.45], d, rng.range(0.14, 0.26), rng.range(0.06, 0.1), P.get(reg));
      }
      s.glow(0);
      break;
    }
    case 'crystal': case 'mana': {
      const b = boulder(rng.int(1, 1e6), { level: 1, rough: 0.3, cuts: 3 });
      s.append(b, mat4(0, -0.1, 0, 0.45, 0.35, 0.4, rng.range(0, 6)), { uv: P.get('rock') });
      const gem = contents[0] ?? 'amethyst';
      const reg: PropRegion = kind === 'mana' ? 'mana' : gem === 'aquamarine' ? 'gemCyan' : gem === 'emerald' ? 'gemGreen' : gem === 'ruby' ? 'gemRed' : 'gemViolet';
      const big = kind === 'mana' ? 1.5 : 1;
      s.glow(kind === 'mana' ? 1.8 : 0.35);
      const n = kind === 'mana' ? 7 : rng.int(5, 8);
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, TAU), sp = i === 0 ? 0 : rng.range(0.25, 0.8);
        const d: V3 = [Math.cos(a) * sp, 1, Math.sin(a) * sp * 0.7];
        const len = (i === 0 ? 0.9 : rng.range(0.35, 0.7)) * big;
        gemPrism(s, [Math.cos(a) * sp * 0.15, 0.1, Math.sin(a) * sp * 0.1], d, len, len * 0.16, P.get(reg));
      }
      s.glow(0);
      break;
    }
    case 'kelp': {
      const r = P.get('kelpBundle');
      for (let i = 0; i < 7; i++) {
        const a = rng.range(0, TAU), H = rng.range(0.6, 1.1), path: V3[] = [];
        for (let j = 0; j <= 4; j++) { const t = j / 4; path.push([Math.cos(a) * t * 0.25 + Math.sin(t * 3 + i) * 0.06, t * H, Math.sin(a) * t * 0.15]); }
        s.ribbon(path, (t) => 0.14 * Math.sin(Math.min(1, t * 1.1 + 0.12) * Math.PI) + 0.03, r, { side: [-Math.sin(a), 0, Math.cos(a)], twist: rng.range(-1, 1), flex: (t) => t * t * 0.18, ruffle: 0.25 });
      }
      // holdfast
      s.color(0.6, 0.5, 0.35).lathe([[0.12, 0], [0.08, 0.08], [0, 0.12]], 5, r);
      s.color(1, 1, 1);
      break;
    }
    case 'shells': {
      for (let i = 0; i < rng.int(4, 6); i++) {
        const from = s.count, pink = rng.chance(0.4), reg = P.get(pink ? 'shellPink' : 'shell');
        if (rng.chance(0.55)) {
          // scallop: a ribbed fan
          const n = 7, c: V3 = [0, 0.02, -0.1];
          const pts: V3[] = [];
          for (let k = 0; k <= n; k++) { const a = Math.PI * (0.1 + 0.8 * k / n); pts.push([Math.cos(a) * 0.2, 0.04 + (k % 2) * 0.02, -0.1 + Math.sin(a) * 0.22]); }
          for (let k = 0; k < n; k++) s.tri(c, pts[k + 1], pts[k], [reg.u0, reg.v0], [reg.u1, reg.v1], [reg.u0, reg.v1]);
        } else {
          // conch: a twisted cone
          s.lathe([[0.09, 0], [0.11, 0.08], [0.06, 0.2], [0, 0.3]], 5, reg, { jit: (j, k) => 1 + ((j + k) % 2) * 0.15 });
          s.transformSince(from, mat4(0, 0.08, 0, 1, 1, 1, 0, 0, Math.PI / 2 - 0.2));
        }
        s.transformSince(from, mat4(rng.range(-0.35, 0.35), 0, rng.range(-0.3, 0.3), rng.range(0.8, 1.4), 1, rng.range(0.8, 1.4), rng.range(0, 6)));
      }
      break;
    }
    case 'scrap': {
      for (let i = 0; i < rng.int(4, 7); i++) {
        const from = s.count, reg = P.get(rng.pick(['steel', 'iron', 'steel'] as PropRegion[]));
        if (rng.chance(0.6)) s.box([-0.3, 0, -0.2], [rng.range(0.3, 0.7), rng.range(0.03, 0.06), rng.range(0.2, 0.45)], reg);
        else s.lathe([[0.06, 0], [0.06, rng.range(0.4, 0.8)]], 6, reg);
        s.transformSince(from, mat4(rng.range(-0.3, 0.3), rng.range(0, 0.25), rng.range(-0.25, 0.25), 1, 1, 1, rng.range(0, 6), rng.range(-0.6, 0.6), rng.range(-1.2, 1.2)));
      }
      // a gear and a porthole ring for flavour
      const from = s.count, br = P.get('brass');
      s.lathe([[0.18, 0], [0.18, 0.04]], 10, br, { jit: (_j, k) => (k % 2 ? 1.2 : 0.9) });
      s.transformSince(from, mat4(0.15, 0.2, 0.05, 1, 1, 1, 0.3, 1.2, 0));
      break;
    }
    case 'crate': {
      const reg = P.get('crate'), ir = P.get('iron');
      const w = rng.range(0.55, 0.75), h = w * rng.range(0.7, 0.9), d = w * 0.8;
      s.box([-w / 2, 0, -d / 2], [w, h, d], reg);
      for (const yy of [0.15, 0.85]) s.box([-w / 2 - 0.01, h * yy - 0.025, -d / 2 - 0.01], [w + 0.02, 0.05, d + 0.02], ir);
      if (rng.chance(0.5)) s.box([-0.05, h * 0.45, d / 2], [0.1, 0.12, 0.04], P.get('brass'));
      break;
    }
    case 'clam': {
      const sh = P.get('shell'), ma = P.get('black');
      const half = (sign: number) => {
        const h = new Soup(), NS = 10;
        const rings: V3[][] = [];
        for (let j = 0; j <= 4; j++) {
          const t = j / 4, ring: V3[] = [];
          for (let i = 0; i <= NS; i++) {
            const u = i / NS, fl = (i % 2) * 0.05 * t;
            ring.push([(u - 0.5) * 1.1 * Math.sin(Math.PI * (0.18 + t * 0.82)), Math.sin(t * Math.PI * 0.5) * 0.36 + fl * 0.3, sign * (0.02 + Math.sin(t * Math.PI) * 0.24 * Math.sin(Math.PI * u) + fl)]);
          }
          rings.push(ring);
        }
        for (let j = 0; j < 4; j++) for (let i = 0; i < NS; i++) {
          const a = rings[j][i], b = rings[j][i + 1], c = rings[j + 1][i + 1], dd = rings[j + 1][i];
          const uv = (ii: number, jj: number): [number, number] => [sh.u0 + (sh.u1 - sh.u0) * ii / NS, sh.v0 + (sh.v1 - sh.v0) * jj / 4];
          if (sign > 0) { h.tri(a, b, c, uv(i, j), uv(i + 1, j), uv(i + 1, j + 1)); h.tri(a, c, dd, uv(i, j), uv(i + 1, j + 1), uv(i, j + 1)); }
          else { h.tri(a, c, b, uv(i, j), uv(i + 1, j + 1), uv(i + 1, j)); h.tri(a, dd, c, uv(i, j), uv(i, j + 1), uv(i + 1, j + 1)); }
        }
        return h;
      };
      const mantle = new Soup();
      const mr = scen.props.A.paint('clamMantleP', 16, 8, (p) => p.fill((x, y) => { const n = Math.sin(x * 1.3 + y) * 0.5 + 0.5; const c: [number, number, number] = [20 + n * 40, 60 + n * 140, 140 + n * 80]; return (x * 7 + y * 3) % 5 === 0 ? [140, 255, 240] : c; }));
      mantle.glow(0.35);
      for (let i = 0; i < 8; i++) {
        const x0 = (i / 8 - 0.5) * 0.9, x1 = ((i + 1) / 8 - 0.5) * 0.9;
        mantle.quad([x0, 0.3, -0.06], [x1, 0.3, -0.06], [x1, 0.33 + (i % 2) * 0.02, 0.06], [x0, 0.33 + ((i + 1) % 2) * 0.02, 0.06], mr);
        mantle.quad([x0, 0.05, -0.06], [x1, 0.05, -0.06], [x1, 0.3, -0.06], [x0, 0.3, -0.06], mr, [0.6, 0.6, 0.8, 0.8]);
      }
      const pearl = new Soup();
      pearl.glow(0.6).lathe([[0.001, -0.07], [0.06, -0.05], [0.075, 0], [0.06, 0.05], [0, 0.07]], 6, P.get('pearl'));
      void ma;
      return { soup: s, extra: { top: half(1), bottom: half(-1), mantle, pearl } };
    }
  }
  return { soup: s };
}

// ------------------------------------------------------------------ beam / glint art (shared)
let BEAM_GEO: THREE.BufferGeometry | null = null;
const BEAM_MATS = new Map<string, THREE.MeshBasicMaterial>();
function beam(color: string): THREE.Mesh {
  if (!BEAM_GEO) {
    BEAM_GEO = new THREE.PlaneGeometry(0.5, 7, 1, 8);
    BEAM_GEO.translate(0, 3.5, 0);
    const c = new Float32Array(BEAM_GEO.attributes.position.count * 3);
    for (let i = 0; i < BEAM_GEO.attributes.position.count; i++) { const y = BEAM_GEO.attributes.position.getY(i) / 7, x = Math.abs(BEAM_GEO.attributes.position.getX(i)) / 0.25; const k = (1 - y) * (1 - y) * (x > 0.5 ? 0.0 : 1); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; }
    BEAM_GEO.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  let m = BEAM_MATS.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }); BEAM_MATS.set(color, m); }
  const mesh = new THREE.Mesh(BEAM_GEO, m);
  mesh.renderOrder = 20;
  mesh.frustumCulled = false;
  return mesh;
}
const FLASH = new THREE.MeshBasicMaterial({ color: '#ffffff' });

// ------------------------------------------------------------------ the node entity
export class ResourceNode implements Entity {
  kind = 'resource'; team: Team = 'neutral';
  x: number; y: number; z: number; vx = 0; vy = 0; r: number; alive = true;
  hp: number; maxHp: number;
  obj = new THREE.Group();
  node: NodeKind;
  contents: string[] = [];
  best: Rarity = 'common';
  /** hidden + waiting to regrow */
  gone = false;
  buried = false;
  private t = Math.random() * 10;
  private regrow = 0;
  private squash = 0; private squashV = 0;
  private flashT = 0;
  private mesh: THREE.Mesh | null = null;
  private meshes: THREE.Mesh[] = [];
  private beam: THREE.Mesh | null = null;
  private clam: { top: THREE.Object3D; bottom: THREE.Object3D; mantle: THREE.Object3D; pearl: THREE.Object3D; open: number; target: number; timer: number } | null = null;
  private bur: Buried | null = null;
  private rng: Rng;
  private K: KindDef;
  private glintT = Math.random() * 3;
  private base0: number;

  constructor(public a: AreaDef, public scen: Scenery, node: NodeKind, x: number, y: number, seed: number) {
    this.node = node; this.K = KIND[node];
    this.x = x; this.y = y; this.z = 0; this.base0 = y;
    this.r = this.K.r;
    this.hp = this.maxHp = this.K.hp;
    this.rng = new Rng(seed);
    this.obj.position.set(x, y, this.z);
    this.spawn(true);
  }

  private roll() {
    const tbl = lootTable(this.a, this.node);
    const n = this.rng.int(this.K.n[0], this.K.n[1]);
    this.contents = [];
    for (let i = 0; i < n; i++) this.contents.push(this.rng.weighted(tbl, (e) => e[1])[0]);
    // crates sometimes hold real loot
    if (this.node === 'crate' && this.rng.chance(0.35)) this.contents.push(rollItem(this.rng, 'loot'));
    let best = 0;
    for (const id of this.contents) best = Math.max(best, RARITY_ORDER.indexOf(rarityOf(id)));
    this.best = RARITY_ORDER[best];
  }

  private spawn(first: boolean) {
    this.roll();
    for (const m of this.meshes) { m.geometry.dispose(); m.removeFromParent(); }
    this.meshes = [];
    this.beam?.removeFromParent(); this.beam = null;
    const { soup, extra } = buildNodeSoup(this.node, this.scen, this.rng, this.contents);
    const mat = this.node === 'kelp' ? this.scen.mats.propSway : this.scen.mats.prop;
    if (extra) {
      const mk = (s: Soup) => { const g = s.geometry(); const m = new THREE.Mesh(g, mat); m.castShadow = true; this.meshes.push(m); return m; };
      const top = mk(extra.top), bottom = mk(extra.bottom), mantle = mk(extra.mantle), pearl = mk(extra.pearl);
      const hinge = new THREE.Group(); hinge.add(top);
      const hb = new THREE.Group(); hb.add(bottom);
      pearl.position.set(0, 0.2, 0);
      this.obj.add(hinge, hb, mantle, pearl);
      this.obj.rotation.y = this.rng.range(-0.4, 0.4);
      this.clam = { top: hinge, bottom: hb, mantle, pearl, open: 0, target: 0.5, timer: this.rng.range(2, 6) };
    } else {
      // kelp bundles sway: the sway base must be the node's world position
      if (this.node === 'kelp') for (let i = 0; i < soup.count; i++) { soup.S[i * 4] = this.x; soup.S[i * 4 + 1] = this.y; soup.S[i * 4 + 2] = this.z + 0.001; }
      const g = soup.geometry();
      this.mesh = new THREE.Mesh(g, mat);
      this.mesh.castShadow = true; this.mesh.receiveShadow = true;
      this.mesh.rotation.y = this.rng.range(0, TAU);
      this.meshes.push(this.mesh);
      this.obj.add(this.mesh);
    }
    if (RARITY_ORDER.indexOf(this.best) >= 2 || this.node === 'mana') {
      this.beam = beam(this.node === 'mana' ? '#7aa8ff' : RARITY_COLOR[this.best]);
      this.obj.add(this.beam);
    }
    this.gone = false;
    this.hp = this.maxHp;
    this.r = this.K.r;
    this.obj.visible = true;
    if (!first) { this.squash = -0.6; this.squashV = 4; }
    // things lying on the sand can be (or get) buried
    if (this.K.onSand) {
      if (first && this.rng.chance(this.K.buriedChance)) {
        this.y = this.scen.sand.heightAt(this.x) - 0.45;
        this.scen.sand.deposit(this.x, 0.35, 0.9);
      }
      if (!this.bur) this.bur = this.scen.sand.bury({ x: this.x, y: this.y, h: 0.5, covered: false, onChange: (c) => this.onCover(c) });
      this.buried = this.bur.covered;
    }
  }

  private onCover(covered: boolean) {
    if (this.gone) return;
    if (this.buried && !covered) {
      // uncovered by a blast or a current: a glint and a chime
      this.glintT = 0;
      this.scen.sand.onPuff?.(this.x, this.y + 0.3, 0.6);
      this.uncoveredFx = 1.2;
    }
    this.buried = covered;
  }
  private uncoveredFx = 0;

  shake(k = 1) { this.squashV += 6 * k; }

  hit(dmg: number, dirX: number, _dirY: number, w: World, src: Entity | null, kind?: DamageKind): boolean {
    if (this.gone || this.buried) return false;
    if (this.clam && this.clam.open < 0.25) {
      // a closed clam just clanks
      w.sfx('clank1', this.x, 0.6, 1.4); w.fx.burst('spark', this.x, this.y + 0.3, 4, 2);
      this.squashV += 4;
      return true;
    }
    this.hp -= Math.max(1, dmg) * (kind === 'explosion' ? 2 : 1);
    this.squashV += 8; this.flashT = 0.07;
    this.vx = dirX * 0.5;
    const top = this.y + 0.35;
    w.fx.burst('spark', this.x - dirX * 0.2, top, 6, 3, { color: '#fff4d0' });
    w.fx.debrisBurst(this.x, top, 4, this.K.debris, 2.5, 0.06);
    w.sfx(this.rng.pick(this.K.hitSfx), this.x, 0.7, 0.9 + this.rng.next() * 0.3);
    void src;
    if (this.hp <= 0) this.crack(w);
    return true;
  }

  /** break open: drop the contents, emit resource events, start regrowing */
  private crack(w: World) {
    const cy = this.y + 0.35;
    const counts: Record<string, number> = {};
    if (this.clam) { this.contents = ['pearl']; }
    for (const id of this.contents) {
      const real = materialId(id);
      w.drop(this.x, cy, { item: real });
      counts[id] = (counts[id] ?? 0) + 1;
    }
    for (const [id, n] of Object.entries(counts)) w.emit('resource', { id, n, x: this.x, y: cy, node: this.node, rarity: rarityOf(id) });
    w.fx.debrisBurst(this.x, cy, 12, this.K.debris, 3.5, 0.08);
    w.fx.burst('star', this.x, cy, 6, 3, { color: RARITY_COLOR[this.best] });
    w.fx.burst('bubble', this.x, cy, 8, 1.6);
    w.sfx(this.rng.pick(this.K.breakSfx), this.x, 0.9);
    if (RARITY_ORDER.indexOf(this.best) >= 2) w.sfx('jin_rare1', this.x, 0.6);
    this.scen.sand.impact(this.x, this.y + 0.1, 0.6, 0.3);
    if (this.clam) {
      // the clam survives; the pearl regrows
      this.clam.pearl.visible = false;
      this.clam.target = 0; this.clam.timer = 6;
      this.hp = this.maxHp;
      this.regrow = this.K.respawn;
      this.gone = true; this.r = 0;
      return;
    }
    this.gone = true; this.r = 0;
    this.obj.visible = false;
    this.regrow = this.K.respawn > 0 ? this.K.respawn * this.rng.range(0.8, 1.25) : -1;
  }

  update(dt: number, w: World) {
    this.t += dt;
    if (this.gone) {
      if (this.regrow > 0) {
        this.regrow -= dt;
        if (this.regrow <= 0) {
          if (this.clam) { this.gone = false; this.r = this.K.r; this.clam.pearl.visible = true; this.clam.pearl.scale.setScalar(0.01); this.roll(); }
          else { this.y = this.base0; this.spawn(false); w.fx.burst('bubble', this.x, this.y + 0.3, 6, 1); }
        }
      }
      if (!this.clam) return;
    }
    // resting on sand: fall into craters, rise with the drift a little
    if (this.K.onSand && !this.buried) {
      const fl = this.scen.sand.heightAt(this.x) - 0.08;
      if (this.y > fl + 0.03) this.vy -= 4 * dt;
      else this.vy = 0;
      this.y = Math.max(this.y + this.vy * dt, Math.min(this.y, fl));
      if (this.bur) this.bur.y = this.y;
    }
    this.vx = damp(this.vx, 0, 6, dt);
    // squash spring
    this.squashV += (-this.squash * 170 - this.squashV * 11) * dt;
    this.squash += this.squashV * dt;
    const sq = Math.max(-0.5, Math.min(0.5, this.squash * 0.25));
    this.obj.position.set(this.x + this.vx * 0.05, this.y, this.z);
    this.obj.scale.set(1 + sq, 1 - sq, 1 + sq);
    if (this.flashT > 0) {
      this.flashT -= dt;
      for (const m of this.meshes) m.material = this.flashT > 0 ? FLASH : (this.node === 'kelp' ? this.scen.mats.propSway : this.scen.mats.prop);
    }
    if (this.clam) {
      const c = this.clam;
      c.timer -= dt;
      if (c.timer <= 0) { c.target = c.target > 0.2 ? 0 : 0.55; c.timer = c.target > 0 ? this.rng.range(5, 9) : this.rng.range(2.5, 4); }
      // snap shut when the blobfish gets too close too fast
      const p = w.player;
      if (Math.hypot(p.x - this.x, p.y - this.y) < 1.4 && Math.hypot(p.vx, p.vy) > 4 && c.open > 0.2) { c.target = 0; c.timer = 2.5; w.sfx('clank2', this.x, 0.5, 1.2); w.fx.burst('bubble', this.x, this.y + 0.4, 6, 1.2); }
      c.open = damp(c.open, c.target, c.target > c.open ? 1.5 : 9, dt);
      c.top.rotation.x = c.open * 0.9; c.bottom.rotation.x = -c.open * 0.9;
      c.mantle.scale.set(1, 0.3 + c.open, 0.4 + c.open * 1.4);
      if (c.pearl.visible) { c.pearl.scale.setScalar(damp(c.pearl.scale.x, 1, 0.6, dt)); c.pearl.position.y = 0.2 + c.open * 0.05; }
    }
    // glint + beam
    if (!this.buried && !this.gone) {
      this.glintT -= dt;
      const rar = RARITY_ORDER.indexOf(this.best);
      if (this.glintT <= 0) {
        this.glintT = 2.2 - rar * 0.3 + this.rng.next();
        const col = this.node === 'mana' ? '#a0c8ff' : RARITY_COLOR[this.best];
        w.fx.emit('star', this.x + this.rng.range(-0.3, 0.3), this.y + this.rng.range(0.2, 0.7), { n: 1, size: 0.16 + rar * 0.05, life: 0.6, color: col, vy: 0.1, grav: 0 });
      }
      if (this.node === 'mana' && this.rng.chance(dt * 3)) w.fx.emit('glow', this.x + this.rng.range(-0.4, 0.4), this.y + this.rng.range(0.2, 1.0), { n: 1, size: 0.12, life: 1.6, color: '#7ab0ff', vy: 0.35, grav: 0 });
    }
    if (this.uncoveredFx > 0) { this.uncoveredFx -= dt; if (this.rng.chance(dt * 12)) w.fx.emit('spark', this.x + this.rng.range(-0.3, 0.3), this.y + 0.5, { n: 1, color: RARITY_COLOR[this.best], vy: 1, life: 0.5 }); }
    if (this.beam) {
      this.beam.visible = !this.buried && !this.gone;
      // face the camera around y, pulse
      this.beam.rotation.y = -this.obj.rotation.y;
      const k = 0.75 + 0.25 * Math.sin(this.t * 2.4);
      this.beam.scale.set(k, 1, 1);
    }
  }

  dispose() { for (const m of this.meshes) m.geometry.dispose(); if (this.bur) this.scen.sand.unbury(this.bur); }
}

// ------------------------------------------------------------------ placement
export function placeNodes(a: AreaDef, scen: Scenery, w: World, seed: number): ResourceNode[] {
  const rng = new Rng(seed ^ 0xbeef);
  const out: ResourceNode[] = [];
  const sh = scen.shape;
  const taken: number[] = [];
  const free = (x: number, gap: number) => taken.every((t) => Math.abs(t - x) > gap) && !scen.isReserved(x, 0, 0.5);
  const kinds = Object.entries(a.nodes) as [NodeKind, number][];
  for (const [kind, n] of kinds) {
    for (let i = 0; i < n; i++) {
      let x = 0, ok = false;
      for (let tries = 0; tries < 40 && !ok; tries++) { x = rng.range(sh.X0 + 10, sh.X1 - 10); ok = free(x, 3.2); }
      if (!ok) continue;
      taken.push(x);
      // rocky kinds prefer sitting on a gameplay rock when one is close
      let y = scen.sand.heightAt(x) - 0.06;
      if (!KIND[kind].onSand) {
        const rock = w.terrain.snags(x - 1.2, x + 1.2)[0];
        if (rock && rng.chance(0.6)) { x = rock.x; y = rock.y + rock.r * 0.75; } else y = Math.max(y, scen.sand.bedAt(x) + 0.05);
      }
      out.push(new ResourceNode(a, scen, kind, x, y, rng.int(1, 1e9)));
    }
  }
  return out;
}

export { addIndexed };
