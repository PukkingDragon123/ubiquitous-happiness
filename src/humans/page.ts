// The fisherman's texture page: one 512 x 512 painted pixel page per character (skin, face, hair, clothes,
// hat, shoes, the mouth expression atlas), laid out in fixed regions so geometry and painters share one
// coordinate system. Region coordinates are in page pixels; `R(k)` gives the 0..1 Reg the Loft builder uses.
import type { Reg } from '../gfx/loft';

export const PAGE = 512;
export type RegKey = 'HEAD' | 'HAIR' | 'HAT' | 'TORSO' | 'ARM_L' | 'ARM_R' | 'LEG_L' | 'LEG_R' | 'NECK' | 'LIDS' | 'BROW' | 'PATCH'
  | 'EXTRA' | 'MOUTH' | 'HAND_L' | 'HAND_R' | 'FOOT_L' | 'FOOT_R' | 'BEARD' | 'ACC' | 'GEAR';

export const LAYOUT: Record<RegKey, [number, number, number, number]> = {
  HEAD: [0, 0, 256, 128], HAIR: [256, 0, 128, 128], HAT: [384, 0, 128, 128],
  TORSO: [0, 128, 224, 192], ARM_L: [224, 128, 64, 192], ARM_R: [288, 128, 64, 192], LEG_L: [352, 128, 64, 192], LEG_R: [416, 128, 64, 192],
  NECK: [480, 128, 32, 64], LIDS: [480, 192, 32, 32], BROW: [480, 224, 32, 32], PATCH: [480, 256, 32, 64],
  EXTRA: [0, 320, 224, 96], MOUTH: [0, 416, 224, 96],
  HAND_L: [224, 320, 48, 48], HAND_R: [272, 320, 48, 48], FOOT_L: [224, 368, 48, 48], FOOT_R: [272, 368, 48, 48],
  BEARD: [320, 320, 96, 96], ACC: [416, 320, 96, 96], GEAR: [224, 416, 288, 96],
};

const REGS = {} as Record<RegKey, Reg>;
for (const [k, [x, y, w, h]] of Object.entries(LAYOUT) as [RegKey, number[]][]) {
  // half a texel of padding so bilinear-mip sampling at a region edge never reads the neighbour
  REGS[k] = { x: (x + 0.5) / PAGE, y: (y + 0.5) / PAGE, w: (w - 1) / PAGE, h: (h - 1) / PAGE };
}
export const R = (k: RegKey): Reg => REGS[k];
/** sub-rectangle of a region in region units (u0, v0, u1, v1; v = 0 is the BOTTOM row like the loft's v) */
export const subR = (r: Reg, u0: number, v0: number, u1: number, v1: number): Reg => ({ x: r.x + u0 * r.w, y: r.y + (1 - v1) * r.h, w: (u1 - u0) * r.w, h: (v1 - v0) * r.h });

/** height ranges (reference metres) mapped onto each region's v axis (v = 0 bottom row .. 1 top row) */
export const VMAP = {
  TORSO: [0.78, 1.5],       // reference body space y (hips at 0.94)
  ARM: [-0.56, 0.07],       // upper-arm-local y (reference)
  LEG: [-0.9, 0.08],        // thigh-local y (reference)
  HEAD: [-0.04, 0.22],      // head-local y (reference head units)
  NECK: [1.42, 1.64],
} as const;

/** mouth atlas: 4 x 4 frames of 56 x 24 px inside MOUTH */
export const MOUTH_FW = 56, MOUTH_FH = 24;
export const MOUTHS = ['neutral', 'smile', 'grin', 'open', 'O', 'frown', 'grit', 'yell', 'smirk', 'wavy', 'tongue', 'flat', 'pout', 'gasp', 'laugh', 'ooh'] as const;
export type MouthFrame = typeof MOUTHS[number];
export function mouthReg(f: MouthFrame): Reg {
  const i = MOUTHS.indexOf(f), cx = i % 4, cy = Math.floor(i / 4);
  const [x, y] = LAYOUT.MOUTH;
  return { x: (x + cx * MOUTH_FW + 0.5) / PAGE, y: (y + cy * MOUTH_FH + 0.5) / PAGE, w: (MOUTH_FW - 1) / PAGE, h: (MOUTH_FH - 1) / PAGE };
}
