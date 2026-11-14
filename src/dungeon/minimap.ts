// Minimap DATA for the HUD (agent L draws it; src/dungeon/hud.ts has a plain placeholder drawer).
//
//   const mm = minimapData(floor, currentRoomId);
//   mm.rooms: every room the player knows about, in grid cells relative to mm.x0 / mm.y0 (y grows down = deeper)
//   room.state: 'current' | 'cleared' | 'visited' | 'seen' (adjacent to a visited room, not entered yet)
//   room.icon:  the special-room glyph to show ('treasure', 'shop', 'post', 'challenge', 'boss', 'secret') or null
//   room.doors: the walls that have a known opening (for drawing the connectors)
//   room.locked: its door is locked (treasure: needs a key)
//
// Isaac rules: visited rooms and their neighbours are shown; special rooms show their icon as soon as they are
// seen; the secret room only appears once its wall is bombed open; the boss room's skull is always shown once seen.
import type { Floor, RoomType, Dir } from './floor';
import { DIRS, doorOpenable } from './floor';

export type MiniState = 'current' | 'cleared' | 'visited' | 'seen';
export interface MiniRoom {
  id: number;
  /** grid cell relative to the map's top-left (x0, y0) */
  x: number; y: number;
  type: RoomType;
  state: MiniState;
  icon: RoomType | null;
  doors: Dir[];
  locked: boolean;
}
export interface MinimapData {
  /** grid size of the known map (cells) */
  w: number; h: number;
  /** absolute grid origin (the floor's grid) */
  x0: number; y0: number;
  rooms: MiniRoom[];
  current: number;
  floor: number;
  area: string;
}

const ICON_TYPES: RoomType[] = ['treasure', 'shop', 'post', 'challenge', 'boss', 'secret'];

export function minimapData(f: Floor, current: number, revealAll = false): MinimapData {
  const known = f.rooms.filter((r) => revealAll || r.visited || (r.seen && (r.type !== 'secret' || f.rooms.some((o) => o.visited && Object.values(o.doors).includes(r.id) && o.opened[dirOf(o, r.id)]))));
  let x0 = 99, y0 = 99, x1 = -99, y1 = -99;
  for (const r of known) { x0 = Math.min(x0, r.gx); y0 = Math.min(y0, r.gy); x1 = Math.max(x1, r.gx); y1 = Math.max(y1, r.gy); }
  if (!known.length) { x0 = y0 = 0; x1 = y1 = 0; }
  const rooms: MiniRoom[] = known.map((r) => {
    const state: MiniState = r.id === current ? 'current' : r.cleared && r.visited ? 'cleared' : r.visited ? 'visited' : 'seen';
    const doors = DIRS.filter((d) => doorOpenable(r, d) && (r.visited || revealAll || known.some((k) => k.id === r.doors[d])));
    const locked = r.type === 'treasure' && !f.rooms.some((o) => Object.entries(o.doors).some(([d, id]) => id === r.id && o.opened[d as Dir]));
    return { id: r.id, x: r.gx - x0, y: r.gy - y0, type: r.type, state, icon: ICON_TYPES.includes(r.type) ? r.type : null, doors, locked };
  });
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, x0, y0, rooms, current, floor: f.n, area: f.area };
}

function dirOf(r: { doors: Partial<Record<Dir, number>> }, to: number): Dir {
  return (Object.keys(r.doors) as Dir[]).find((d) => r.doors[d] === to) ?? 'L';
}
