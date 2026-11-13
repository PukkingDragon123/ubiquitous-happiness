// The act map module: generation (StS-style branching currents) + the interactive ocean-diorama screen.
export { generateActMap, ensureActMap, availableIds, visitedIds, visitNode, nodeById, ACTS, SPOT_NAME, ZONE_BIOME } from './gen';
export type { ActMap, MapNode, NodeType, SpotId, Biome, ZoneId, Zone } from './gen';
export { MapScreen } from './screen';
export type { MapScreenOpts } from './screen';
