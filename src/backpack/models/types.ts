import type { ItemDef } from '../../game/items';
import type { B } from './kit';

/** an item model builder: add parts to b (1 unit ~ 1 grid cell, facing +Z, light from the top left) */
export type Build = (b: B, d: ItemDef) => void;
