// Shared gameplay contracts. Everything that lives in a dive (fish, fishermen, lines, pickups, bosses)
// implements Entity and talks to the world through World. Keep these small and stable.
import type * as THREE from 'three';
import type { Game } from './game';
import type { WaterFX } from '../gfx/water/water';
import type { Particles } from '../gfx/particles';
import type { FloatText } from '../ui/text';
import type { Rng } from '../core/rng';
import type { Run } from './run';

export type Team = 'player' | 'enemy' | 'friend' | 'neutral';

export interface Entity {
  kind: string;
  team: Team;
  x: number; y: number;      // gameplay plane position (metres)
  vx: number; vy: number;
  r: number;                 // collision radius
  alive: boolean;
  hp?: number; maxHp?: number;
  /** the root object this entity added to world.scene (removed automatically when it dies) */
  obj?: THREE.Object3D;
  update(dt: number, w: World): void;
  /** take a hit; return true if it landed. dir = unit push direction */
  hit?(dmg: number, dirX: number, dirY: number, w: World, src: Entity | null, kind?: DamageKind): boolean;
  /** called once when removed */
  dispose?(w: World): void;
  /** optional: things the blobfish can bite (bait, food) */
  biteable?: boolean;
  onBite?(w: World): void;
}

export type DamageKind = 'sword' | 'laser' | 'rock' | 'zap' | 'bite' | 'spike' | 'explosion' | 'hook' | 'crush';

export interface PlayerLike extends Entity {
  facing: number;           // -1 left, 1 right
  hooked: boolean;          // currently on a line
  invuln: number;           // seconds of i-frames left
  /** knock the player (soft body reacts) */
  push(ix: number, iy: number): void;
}

export interface Terrain {
  /** signed distance to solid ground/rock on the gameplay plane: < 0 inside solid */
  sdf(x: number, y: number): number;
  /** outward normal of the nearest solid surface */
  normal(x: number, y: number): { x: number; y: number };
  /** height of the seabed under x (top of the ground column) */
  floorAt(x: number): number;
  /** rocks the line can wrap around / snag on: circles on the plane */
  snags(x0: number, x1: number): { x: number; y: number; r: number; sharp?: boolean }[];
}

export interface World {
  game: Game;
  run: Run;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  time: number;
  water: WaterFX;
  fx: Particles;
  text: FloatText;
  rng: Rng;
  player: PlayerLike;
  terrain: Terrain;
  entities: Entity[];
  add<T extends Entity>(e: T): T;
  /** damage the player: handles i-frames, knockback, effects, death */
  hurtPlayer(dmg: number, fromX: number, fromY: number, kind?: DamageKind): void;
  /** play a sound at a world x (stereo pan + distance falloff) */
  sfx(id: string, x?: number, vol?: number, rate?: number): void;
  /** entities near a point (cheap broadphase) */
  near(x: number, y: number, r: number, team?: Team): Entity[];
  /** drop a pickup (coins, materials, items) at a point */
  drop(x: number, y: number, what: { coins?: number; item?: string; heal?: number }): void;
  /** global event bus for item hooks / quests: emit('lineSnap', {...}) */
  emit(ev: string, data?: Record<string, unknown>): void;
}
