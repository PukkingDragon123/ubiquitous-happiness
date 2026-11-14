// Combat contracts (souls-like layer). Shared by the player moveset (moveset.ts), the enemy kit (core.ts), the
// enemy roster (src/combat/sealife.ts, src/waves/human.ts duel brain), the bosses (src/bosses) and the dungeon
// levels (agent J: continuous side-scrolling floors with arena-lock encounters and roaming groups).
import type { Entity, World, DamageKind } from '../game/types';

/** an arena-lock box (side view): walls at x0 / x1, the seabed at `floor`, the ceiling (or water top) at `top` */
export interface Arena { x0: number; x1: number; floor: number; top: number }

export type FloorId = 'reef' | 'kelp' | 'graveyard' | 'arctic' | 'abyss';

/** every regular enemy kind spawnEnemy() knows */
export type EnemyKind =
  | 'harpoon' | 'knife' | 'net' | 'heavy' | 'medic'                     // divers (src/waves/human.ts brains)
  | 'moray' | 'crab' | 'puffer' | 'jelly' | 'angler' | 'barracuda'       // hostile sea life
  | 'dummy';                                                             // training dummy (preview / hideout)

export const ENEMY_KINDS: EnemyKind[] = ['harpoon', 'knife', 'net', 'heavy', 'medic', 'moray', 'crab', 'puffer', 'jelly', 'angler', 'barracuda', 'dummy'];

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
  /** flask charges left / max ("kelp tea") */
  flasks: number; flasksMax: number;
  /** 0..1 progress of the current drink (0 = not drinking) */
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
