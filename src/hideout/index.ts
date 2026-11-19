// The home (v4): a ruined house rebuilt with Mr. Crab, the hub you start in. See screen.ts (HideoutScreen), rebuild.ts
// (PIECES, the goal, homeStations), house.ts / pieces.ts (the house), packing.ts (the porch packing scene),
// buildscene.ts, mastery.ts (MASTERY, AREAS, masteryScalars), recipes.ts (the workbench) and hero.ts.
export { HideoutScreen, type HideoutOpts } from './screen';
export { PIECES, PIECE, isBuilt, nextGoal, homeStations, type Piece, type PieceId } from './rebuild';
export { BLUEPRINTS, BLUEPRINT_LIST, stationsBuilt, stationPerks, isUnlocked, type Blueprint } from './blueprints';
export { MASTERY, MAX_MASTERY, masteryMods, masteryScalars, AREAS } from './mastery';
export { CRAFTS, upgradeCost } from './recipes';
export { defaultHero, type HideoutHero, type HeroFactory, type HeroAnim, type HeroSlot } from './hero';
