// Run state: everything that persists across the nodes of one run (Binding-of-Isaac style: die and it's gone).
// The backpack grid is the source of truth for owned gear: only items placed in the 5x5 grid count toward stats.
import { Rng } from '../core/rng';

export type AbilityId = 'rockBody' | 'laserEyes' | 'bubbleShield' | 'inkCloud' | 'zap' | 'puff' | 'magnet' | 'dash';

export interface Stats {
  maxHp: number;        // half-hearts (Isaac-style): 6 = three hearts
  speed: number;        // swim speed m/s
  accel: number;
  dashPower: number;
  swordDmg: number;
  swordReach: number;   // metres
  swordRate: number;    // swings per second
  lineCut: number;      // line damage per sword hit
  struggle: number;     // multiplier on struggle/QTE strength
  reelResist: number;   // 0..0.8: reduces reel pull
  pressureResist: number; // 0..1: reduces weakness when dragged shallow
  luck: number;
  magnet: number;       // pickup attraction radius
  armor: number;        // flat damage reduction chance 0..1
  biteHeal: number;     // half-hearts restored by eating bait
  abilities: AbilityId[];
  // ---- builds (src/skills, src/game/items.ts set bonuses)
  maxMana: number;      // mana pool: mage skills spend it
  manaRegen: number;    // mana per second
  spellPower: number;   // multiplier on spell damage (1 = base)
  summonPower: number;  // multiplier on summon damage / lifetime
  gadgetPower: number;  // multiplier on trap / turret damage
  crit: number;         // 0..1 chance of a critical hit (x2)
  cdr: number;          // 0..0.6 cooldown reduction on skills
  poison: number;       // poison damage per second applied by hits
  skills: string[];     // active skill ids granted by placed items (SKILLS registry in src/skills)
  /** active set-bonus tier per build/element tag (0, 2, 4 or 6), filled by the item system */
  sets: Record<string, number>;
  /** blobfish outfit from the placed gear items: { weapon?, armor?, hat?, back? } (src/player/gear.ts ids) */
  gear: Record<string, string>;
}

export const BASE_STATS: Stats = {
  maxHp: 6, speed: 5.2, accel: 22, dashPower: 9, swordDmg: 1, swordReach: 0.9, swordRate: 2.6,
  lineCut: 1, struggle: 1, reelResist: 0, pressureResist: 0, luck: 0, magnet: 1.2, armor: 0, biteHeal: 0, abilities: [],
  maxMana: 20, manaRegen: 2.5, spellPower: 1, summonPower: 1, gadgetPower: 1, crit: 0.05, cdr: 0, poison: 0, skills: [], sets: {}, gear: {},
};

/** an item instance placed (or loose) in the backpack */
export interface ItemInst {
  uid: number;
  id: string;           // ItemDef id (src/game/items.ts)
  gx: number; gy: number; // grid cell of the shape's origin (-1 = loose / not in grid)
  rot: number;          // 0..3 quarter turns
  level?: number;       // upgraded by merging
}

export interface MapNodeRef { act: number; id: number }

export class Run {
  seed: number;
  rng: Rng;
  hp: number;
  coins = 0;
  pearls = 0;            // rare currency
  items: ItemInst[] = [];
  nextUid = 1;
  act = 1;
  depth = 0;             // nodes cleared
  visited: MapNodeRef[] = [];
  current: MapNodeRef | null = null;
  map: unknown = null;   // owned by src/map (graph for the current act)
  linesSnapped = 0;
  baitStolen = 0;
  kills = 0;
  time = 0;
  /** stat modifiers computed from the backpack: set by the backpack module (src/backpack) */
  statFn: ((base: Stats, run: Run) => Stats) | null = null;
  /** hook functions registered by items: called by the dive on gameplay events */
  hooks: Map<string, ((data: Record<string, unknown>) => void)[]> = new Map();

  constructor(seed = (Math.random() * 2 ** 31) | 0) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.hp = BASE_STATS.maxHp;
  }

  stats(): Stats {
    const base: Stats = { ...BASE_STATS, abilities: [...BASE_STATS.abilities], skills: [...BASE_STATS.skills], sets: { ...BASE_STATS.sets }, gear: { ...BASE_STATS.gear } };
    return this.statFn ? this.statFn(base, this) : base;
  }

  addItem(id: string): ItemInst {
    const it: ItemInst = { uid: this.nextUid++, id, gx: -1, gy: -1, rot: 0, level: 1 };
    this.items.push(it);
    return it;
  }
  removeItem(uid: number) { this.items = this.items.filter((i) => i.uid !== uid); }

  on(ev: string, fn: (data: Record<string, unknown>) => void) {
    const l = this.hooks.get(ev) || [];
    l.push(fn); this.hooks.set(ev, l);
  }
  fire(ev: string, data: Record<string, unknown> = {}) { for (const fn of this.hooks.get(ev) || []) fn(data); }
}
