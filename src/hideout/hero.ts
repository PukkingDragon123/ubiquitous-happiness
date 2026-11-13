// The hideout's hero: a tiny interface so the room life and the cinematic can drive any character model. The
// default is the lead's BlobPuppet (src/player/puppet.ts), which owns the blobfish model and satisfies this
// interface structurally; pass another factory to HideoutScreen ({ hero: () => myHero }) to swap it.
//
// Conventions: the hideout places hero.root (position on the floor, rotation.y = facing). Local +x is the
// hero's forward, +y up, feet (lowest point) at y = 0.
import type * as THREE from 'three';
import { BlobPuppet } from '../player/puppet';

export type HeroAnim = 'idle' | 'walk' | 'sit' | 'hop' | 'gear' | 'cheer' | 'swim' | 'look';
export type HeroSlot = 'head' | 'back' | 'hand' | 'side' | 'belly';

export interface HideoutHero {
  /** placed by the hideout: position on the floor, rotation.y = facing (local +x forward) */
  root: THREE.Object3D;
  /** world-space parts to add to the scene alongside root (e.g. cloth tails) */
  extras?: THREE.Object3D[];
  /** rough height in metres (camera framing) */
  height: number;
  /** per frame; move = 0..1 walking speed, t = time */
  update(dt: number, s: { t: number; move: number }): void;
  play?(anim: HeroAnim): void;
  /** pin a gear object onto the hero (cinematic gear-up) */
  attach?(slot: HeroSlot, obj: THREE.Object3D): void;
  /** remove all pinned gear */
  clearGear?(): void;
  expression?(name: string): void;
  /** where the hero is looking: a world point (null = straight ahead) */
  lookAt?(p: THREE.Vector3 | null): void;
  /** swap the worn gear set (BlobPuppet: BlobGear / BUILD_GEAR presets) */
  setGear?(g: unknown): void;
}
export type HeroFactory = () => HideoutHero;

/** the default hero: the blobfish puppet */
export const defaultHero: HeroFactory = () => new BlobPuppet() as unknown as HideoutHero;
