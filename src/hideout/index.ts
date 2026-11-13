// The hideout: the hub (the main menu is the title screen, src/title). See screen.ts (HideoutScreen), blueprints.ts (BLUEPRINTS, stationsBuilt,
// stationPerks), mastery.ts (MASTERY, AREAS, masteryScalars), recipes.ts (workshop) and hero.ts (the hero
// interface the cinematic drives).
export { HideoutScreen, type HideoutOpts } from './screen';
export { BLUEPRINTS, BLUEPRINT_LIST, stationsBuilt, stationPerks, isUnlocked, defaultLayout, type Blueprint } from './blueprints';
export { MASTERY, MAX_MASTERY, masteryMods, masteryScalars, AREAS } from './mastery';
export { CRAFTS, upgradeCost } from './recipes';
export { defaultHero, type HideoutHero, type HeroFactory, type HeroAnim, type HeroSlot } from './hero';
