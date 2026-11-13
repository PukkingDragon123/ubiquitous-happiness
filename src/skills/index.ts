// Skills: active powers granted by items (see src/game/items.ts `skill`), cast from the blobfish's slots.
//   SKILLS / skillSlotsFor       registry.ts
//   SkillDef / SkillCaster       types.ts
//   applyStatus(w, e, 'freeze')  status.ts (enemies get e.status = { stun, freeze, snare, slow, blind, poison, burn })
//   SkillBar                     hud.ts (pixel skill bar + mana crystal for the run screen)
export { SKILLS, skillSlotsFor } from './registry';
export type { SkillDef, SkillCaster, BuildTag, ElementTag, SkillTag } from './types';
export { BUILD_TAGS, ELEMENT_TAGS } from './types';
export { applyStatus, hasStatus, type StatusKind } from './status';
export { MegalodonSummon, buildMegalodon } from './megalodon';
export { SkillBar } from './hud';
