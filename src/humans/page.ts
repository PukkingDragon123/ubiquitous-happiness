// The fisherman's texture page: one 512 x 768 painted pixel page per character (skin, face, hair, clothes,
// outer garment, hat, shoes, gear and the mouth expression atlas), laid out in fixed regions so geometry and
// painters share one coordinate system. Region coordinates are in page pixels; R(k) gives the 0..1 Reg the
// Loft builder uses (x, y from the top-left like the painter).
import type { Reg } from '../gfx/loft';

export const PAGE_W = 512, PAGE_H = 768;
export type RegKey = 'HEAD' | 'HAIR' | 'HAT' | 'TORSO' | 'ARM_L' | 'ARM_R' | 'LEG_L' | 'LEG_R' | 'NECK' | 'LIDS' | 'BROW' | 'PATCH'
  | 'OUTER' | 'TAILS' | 'BEARD' | 'HAND_L' | 'HAND_R' | 'FOOT_L' | 'FOOT_R' | 'ACC' | 'MOUTH' | 'COLLAR' | 'GEAR' | 'EXTRA' | 'HAT2';

export const LAYOUT: Record<RegKey, [number, number, number, number]> = {
  HEAD: [0, 0, 256, 128], HAIR: [256, 0, 128, 128], HAT: [384, 0, 128, 128],
  TORSO: [0, 128, 224, 192], ARM_L: [224, 128, 64, 192], ARM_R: [288, 128, 64, 192], LEG_L: [352, 128, 64, 192], LEG_R: [416, 128, 64, 192],
  NECK: [480, 128, 32, 64], LIDS: [480, 192, 32, 32], BROW: [480, 224, 32, 32], PATCH: [480, 256, 32, 64],
  OUTER: [0, 320, 224, 192], TAILS: [224, 320, 160, 128], BEARD: [384, 320, 128, 128],
  HAND_L: [224, 448, 48, 64], HAND_R: [272, 448, 48, 64], FOOT_L: [320, 448, 64, 64], FOOT_R: [384, 448, 64, 64], ACC: [448, 448, 64, 64],
  MOUTH: [0, 512, 224, 96], COLLAR: [224, 512, 128, 96], HAT2: [352, 512, 160, 96],
  EXTRA: [0, 608, 256, 160], GEAR: [256, 608, 256, 160],
};

const REGS = {} as Record<RegKey, Reg>;
for (const [k, [x, y, w, h]] of Object.entries(LAYOUT) as [RegKey, number[]][]) {
  // half a texel inside the region so sampling at an edge never reads the neighbour
  REGS[k] = { x: (x + 0.5) / PAGE_W, y: (y + 0.5) / PAGE_H, w: (w - 1) / PAGE_W, h: (h - 1) / PAGE_H };
}
export const R = (k: RegKey): Reg => REGS[k];
/** sub-rectangle of a region in region units (u0, v0, u1, v1; v = 0 is the BOTTOM row like the loft's v) */
export const subR = (r: Reg, u0: number, v0: number, u1: number, v1: number): Reg => ({ x: r.x + u0 * r.w, y: r.y + (1 - v1) * r.h, w: (u1 - u0) * r.w, h: (v1 - v0) * r.h });

/** height ranges (reference metres) mapped onto each region's v axis (v = 0 bottom row .. 1 top row) */
export const VMAP = {
  TORSO: [0.78, 1.5],       // reference body space y (hips at 0.94)
  ARM: [-0.56, 0.07],       // upper-arm-local y (reference, before arm length)
  LEG: [-0.9, 0.08],        // thigh-local y (reference, before leg length)
  HEAD: [-0.04, 0.22],      // head-local y (reference head units)
  NECK: [1.42, 1.64],
  TAILS: [0.3, 1.02],       // skirts / coat tails, reference body y
} as const;

/** mouth atlas: 4 x 4 frames of 56 x 24 px inside MOUTH */
export const MOUTH_FW = 56, MOUTH_FH = 24;
export const MOUTHS = ['neutral', 'smile', 'grin', 'open', 'O', 'frown', 'grit', 'yell', 'smirk', 'wavy', 'tongue', 'flat', 'pout', 'gasp', 'laugh', 'ooh'] as const;
export type MouthFrame = typeof MOUTHS[number];
export function mouthReg(f: MouthFrame): Reg {
  const i = Math.max(0, MOUTHS.indexOf(f)), cx = i % 4, cy = Math.floor(i / 4);
  const [x, y] = LAYOUT.MOUTH;
  return { x: (x + cx * MOUTH_FW + 0.5) / PAGE_W, y: (y + cy * MOUTH_FH + 0.5) / PAGE_H, w: (MOUTH_FW - 1) / PAGE_W, h: (MOUTH_FH - 1) / PAGE_H };
}
