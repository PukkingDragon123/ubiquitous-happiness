// Combat contracts (souls-like layer). Shared by the player moveset (moveset.ts), the enemy kit (core.ts), the
// enemy roster (src/combat/sealife.ts, src/waves/human.ts duel brain), the bosses (src/bosses) and the dungeon
// levels (agent J: continuous side-scrolling floors with arena-lock encounters and roaming groups).
import type { Entity, World, DamageKind } from '../game/types';

// ------------------------------------------------------------------ health as HP (v6)
/**
 * Health is shown as HIT POINTS everywhere the player reads it (the HUD, heal pops, item stat text, the shop, the run
 * summary). Internally the player's hp / maxHp stay in their old small units (one unit = the old half heart; a new
 * blobfish has 6), so balance code is untouched: every displayed number is units x HP_PER.
 *   hpOf(6) -> 60      hpText(2) -> '20 HP'      hpDelta(-1) -> '-10 HP'
 */
export const HP_PER = 10;
/** internal health units -> displayed HP */
export function hpOf(units: number): number { return Math.round(units * HP_PER); }
/** '60 HP' */
export function hpText(units: number): string { return `${hpOf(units)} HP`; }
/** '+20 HP' / '-10 HP' */
export function hpDelta(units: number): string { const v = hpOf(units); return `${v > 0 ? '+' : ''}${v} HP`; }

/**
 * rewrite old heart wording in a stat / help line as HP: '+1 Heart' -> '+20 Max HP' (a heart was 2 units),
 * 'heal half a heart' -> 'heal 10 HP', '2 half-hearts' -> '20 HP'. For text built elsewhere that still says hearts.
 */
export function hpify(s: string): string {
  return s
    .replace(/\bhalf an? heart\b/gi, `${hpOf(1)} HP`)
    .replace(/([+-]?)(\d+(?:\.\d+)?) half[- ]hearts?\b/gi, (_m, sg: string, n: string) => `${sg}${hpOf(Number(n))} HP`)
    .replace(/([+-])(\d+(?:\.\d+)?) (?:max )?hearts?\b/gi, (_m, sg: string, n: string) => `${sg}${hpOf(Number(n) * 2)} Max HP`)
    .replace(/(\d+(?:\.\d+)?) hearts?\b/gi, (_m, n: string) => `${hpOf(Number(n) * 2)} HP`);
}

/**
 * The heal item (v6): HEALING CLAMS. A pink clam with a glowing heal-jelly inside: press the HEAL key to crack one
 * open and slurp it. Charges refill every floor. (Old names: "kelp tea" flasks / "elixir"; the fields on
 * PlayerCombatHud keep their `flasks` names for API compatibility.)
 */
export const HEAL_ITEM = { name: 'Healing Clam', plural: 'Healing Clams', short: 'CLAM', verb: 'HEAL', key: 'R', empty: 'NO CLAMS LEFT' } as const;

/** an arena-lock box (side view): walls at x0 / x1, the seabed at `floor`, the ceiling (or water top) at `top` */
export interface Arena { x0: number; x1: number; floor: number; top: number }

export type FloorId = 'reef' | 'kelp' | 'graveyard' | 'arctic' | 'abyss';

/** every regular enemy kind spawnEnemy() knows */
export type EnemyKind =
  | 'harpoon' | 'knife' | 'net' | 'heavy' | 'medic'                     // giant evil humans (src/waves/human.ts)
  | 'moray' | 'crab' | 'puffer' | 'jelly' | 'angler' | 'barracuda'       // hostile sea life
  | 'lionfish' | 'stonefish' | 'mantis'                                  // v4 sea life
  | 'dummy';                                                             // training dummy (preview / hideout)

export const ENEMY_KINDS: EnemyKind[] = ['harpoon', 'knife', 'net', 'heavy', 'medic', 'moray', 'crab', 'puffer', 'jelly', 'angler', 'barracuda', 'lionfish', 'stonefish', 'mantis', 'dummy'];

export type EnemySize = 'small' | 'medium' | 'large' | 'giant' | 'boss';
export type EnemyFamily = 'fish' | 'human' | 'prop';
/**
 * per kind: what it is (fish drop materials: scales, pearls, shells; humans drop gear and scrap), how big
 * (drop amount), its display name, and `cost`: how many regular spawns it is worth in a room budget (giants
 * count for several).
 */
export const ENEMY_INFO: Record<EnemyKind, { name: string; family: EnemyFamily; size: EnemySize; cost: number }> = {
  crab: { name: 'Shell Crab', family: 'fish', size: 'medium', cost: 1 },
  puffer: { name: 'Pufferfish', family: 'fish', size: 'small', cost: 1 },
  moray: { name: 'Moray', family: 'fish', size: 'medium', cost: 1 },
  jelly: { name: 'Jellyfish', family: 'fish', size: 'small', cost: 1 },
  barracuda: { name: 'Barracuda', family: 'fish', size: 'medium', cost: 1 },
  angler: { name: 'Anglerfish', family: 'fish', size: 'medium', cost: 1.5 },
  lionfish: { name: 'Lionfish', family: 'fish', size: 'small', cost: 1 },
  stonefish: { name: 'Stonefish', family: 'fish', size: 'medium', cost: 1 },
  mantis: { name: 'Mantis Shrimp', family: 'fish', size: 'small', cost: 1 },
  harpoon: { name: 'The Harpooner', family: 'human', size: 'giant', cost: 3 },
  knife: { name: 'The Gutter', family: 'human', size: 'giant', cost: 3 },
  net: { name: 'The Netter', family: 'human', size: 'giant', cost: 3 },
  heavy: { name: 'The Brass Hulk', family: 'human', size: 'giant', cost: 4 },
  medic: { name: 'The Lamplighter', family: 'human', size: 'giant', cost: 3 },
  dummy: { name: 'Training Dummy', family: 'prop', size: 'medium', cost: 1 },
};

export interface SpawnOpts {
  /** a stronger variant: more hp + poise, faster wind-ups, longer combos, a gold shimmer */
  elite?: boolean;
  /** a returning nemesis (META.nemeses id): divers only */
  nemesis?: string;
  /** an arena-lock box to fight in; omitted / null = a roamer (patrols round its spawn point, notices the
   *  player, chases within a leash, swims home). Lock / release later with bindArena(e, arena | null). */
  arena?: Arena | null;
  /** 0..1+: scales hp / damage / aggression (floor depth x mastery) */
  difficulty?: number;
  /** don't world.add() it (the caller adds it) */
  noAdd?: boolean;
}

/** what the HUD reads off a boss (agent L draws it) */
export interface BossBar { name: string; title: string; hp: number; max: number; phase: number; phases: number; poise: number; visible: boolean }

export type BossEntity = Entity & {
  isBoss: true;
  bossId: string;
  /** set by the dungeon: called once when the death sequence finishes */
  onDefeated?: () => void;
  bar(): BossBar;
};

/** an attack aimed at the player. Resolved by attackPlayer() (resolve.ts) against dodge / parry / block */
export interface AttackSpec {
  /** who swings (staggered on a perfect parry: see Parryable) */
  src: Entity | null;
  dmg: number;
  /** where the blow comes from (knockback direction, parry facing check) */
  x: number; y: number;
  kind?: DamageKind;
  /** red-glint attacks: can't be blocked or parried, only dodged */
  unblockable?: boolean;
  /** false: blockable but not parryable (default: parryable unless unblockable) */
  parryable?: boolean;
  /** stamina drained when blocked (default 18 + dmg * 10) */
  guardDmg?: number;
  /** knockback impulse on a hit (default 7) */
  knock?: number;
  /** a projectile: a parry deflects it (its owner isn't staggered unless `src` is set) */
  projectile?: Entity & { deflect?(w: World, dirX: number, dirY: number): void };
  /** label for logs / kill credit */
  name?: string;
}

export type DefenseResult = 'hit' | 'parried' | 'blocked' | 'guardBreak' | 'dodged' | 'immune';

/** implemented by enemies that react to being parried / staggered / riposted */
export interface Parryable {
  /** the player parried this enemy's attack (perfect): stagger, open for a riposte */
  onParried?(w: World): void;
  /** the player blocked it: a recoil */
  onBlocked?(w: World): void;
}

/** the HUD view of the player's combat state (agent L reads blob.combat.hud()) */
export interface PlayerCombatHud {
  stamina: number; staminaMax: number;
  /** seconds until stamina regenerates (0 = regenerating) */
  staminaDelay: number;
  /** HEALING CLAM charges left / max (HEAL_ITEM; the field keeps its old "flask" name) */
  flasks: number; flasksMax: number;
  /** 0..1 progress of eating the current clam (0 = not healing) */
  drinking: number;
  /** 'idle' | 'parry' (window open) | 'block' | 'riposte' (next attack crits) | 'guardBroken' */
  guard: 'idle' | 'parry' | 'block' | 'riposte' | 'guardBroken';
  /** seconds of the perfect-parry window left (for a HUD flash) */
  parryWindow: number;
  /** last parry result and how long ago (s), for a flash: 'perfect' | 'late' | null */
  lastParry: 'perfect' | 'late' | null; lastParryAge: number;
  /** 0..1 heavy charge */
  charge: number;
  /** current move name ('light1', 'heavy', 'dodge', 'drink'...) or null */
  move: string | null;
  /** i-frames active */
  iframes: boolean;
}
