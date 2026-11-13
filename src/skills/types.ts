// Skill contracts. A skill is an active power granted by an item (ItemDef.skill) and cast from a slot
// (keys 1-4, right mouse / K casts the selected slot, Q cycles). Mage skills spend mana.
import type * as THREE from 'three';
import type { World, PlayerLike, Entity } from '../game/types';
import type { Stats } from '../game/run';

export type BuildTag = 'mage' | 'warrior' | 'summoner' | 'tinkerer' | 'rogue';
export type ElementTag = 'fire' | 'frost' | 'shock' | 'poison' | 'water';
export type SkillTag = BuildTag | ElementTag | 'legacy';
export const BUILD_TAGS: BuildTag[] = ['mage', 'warrior', 'summoner', 'tinkerer', 'rogue'];
export const ELEMENT_TAGS: ElementTag[] = ['fire', 'frost', 'shock', 'poison', 'water'];

/** what a skill needs from the caster (the Blobfish implements it; previews can fake it) */
export interface SkillCaster extends PlayerLike {
  aim: THREE.Vector2;
  stats: Stats;
  mana: number; maxMana: number;
  setExpr(name: string, hold?: number): void;
  /** world position of the weapon tip (casting point) */
  tip(out?: THREE.Vector3): THREE.Vector3;
  /** knock the body along a direction (dashes, lunges) */
  lunge(dx: number, dy: number, power: number): void;
  /** temporary multipliers: 'dmg' (all damage), 'speed' */
  buff(kind: 'dmg' | 'speed', mul: number, dur: number): void;
  /** play a body animation ('cheer', 'hurt'...) */
  playAnim?(a: string): void;
  /** legacy ability cores (rock body, laser eyes ...) are implemented by the controller */
  legacy?(id: string, w: World): void;
  /** the caster's own summons / gadgets (for caps like "3 mines at a time") */
  owned: Entity[];
}

export interface SkillDef {
  id: string;
  name: string;
  tags: SkillTag[];
  /** seconds */
  cooldown: number;
  /** mana cost (mage skills) */
  mana?: number;
  desc: string;
  /** UI tint */
  color: string;
  /** channelled while the key is held (the controller handles it) */
  hold?: boolean;
  /** cast toward the world point (aimX, aimY); lv = level of the granting item (1..3). Return false to refund. */
  cast(w: World, p: SkillCaster, aimX: number, aimY: number, lv: number): boolean | void;
}
