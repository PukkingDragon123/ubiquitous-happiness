// Gameplay terrain for one dungeon room: the area's deformable sand floor (AreaTerrain) inside a rock box with
// door gaps. Walls stand at x = ±HALF_W, the ceiling at floor + ROOM_H; side doors are gaps in the walls just
// above the sand that lead into a short tunnel, top / bottom doors are shafts at x = 0. A shut gate (or an
// unbombed cracked wall) fills its gap; each gap reads how shut it is (0 open .. 1 shut) through `shut()`.
//
// The open water is a union of boxes (the room, the side passages, the top shaft); the signed distance to rock
// is the largest box-interior distance (positive inside the water), combined with the sand heightfield.
import { AreaTerrain } from '../world/areaTerrain';
import type { SandField } from '../world/sand';
import type { Dir } from './floor';

export const ROOM_W = 24;
export const ROOM_H = 12;
export const HALF_W = ROOM_W / 2;
/** side doors: the gap spans floor + DOOR_Y0 .. floor + DOOR_Y1 */
export const DOOR_Y0 = 0.35, DOOR_Y1 = 4.0;
/** shafts: |x| < SHAFT_HW */
export const SHAFT_HW = 1.75;
/** how far the passages run beyond the walls before they stop */
export const TUNNEL = 6;

export interface DoorGap { dir: Dir; exists: boolean; shut: () => number }

const inner = (x: number, y: number, x0: number, x1: number, y0: number, y1: number) => Math.min(x - x0, x1 - x, y - y0, y1 - y);

export class RoomTerrain extends AreaTerrain {
  doors: Record<Dir, DoorGap>;
  constructor(sand: SandField, public F: number, x0: number, x1: number) {
    super(sand, x0, x1);
    const none = (dir: Dir): DoorGap => ({ dir, exists: false, shut: () => 1 });
    this.doors = { L: none('L'), R: none('R'), U: none('U'), D: none('D') };
  }
  get top() { return this.F + 12; }
  private open(g: DoorGap) { return g.exists ? 1 - g.shut() : 0; }

  /** signed distance to the rock box (walls, ceiling, passages, gates); > 0 inside the open water */
  box(x: number, y: number): number {
    const F = this.F, top = F + ROOM_H;
    let d = inner(x, y, -HALF_W, HALF_W, -1e6, top);
    const gy0 = F + DOOR_Y0, gy1 = F + DOOR_Y1;
    const L = this.open(this.doors.L), R = this.open(this.doors.R), U = this.open(this.doors.U);
    // a side gate drops from the lintel: the open part of the gap shrinks from the top down
    if (L > 0.02) d = Math.max(d, inner(x, y, -HALF_W - TUNNEL, -HALF_W + 0.6, -1e6, gy0 + (gy1 - gy0) * L));
    if (R > 0.02) d = Math.max(d, inner(x, y, HALF_W - 0.6, HALF_W + TUNNEL, -1e6, gy0 + (gy1 - gy0) * R));
    if (U > 0.02) d = Math.max(d, inner(x, y, -SHAFT_HW * U, SHAFT_HW * U, top - 1, top + TUNNEL));
    // the passages have a floor of their own only where the sand is lower (the sand field covers them)
    return d;
  }

  sdf(x: number, y: number): number {
    let d = super.sdf(x, y);
    // the bottom shaft is a hole in the sand: while its hatch is shut, a grate floor covers it
    const D = this.doors.D;
    if (D.exists && Math.abs(x) < SHAFT_HW + 0.3 && D.shut() > 0.5) d = Math.min(d, y - (this.F - 0.05));
    return Math.min(d, this.box(x, y));
  }

  floorAt(x: number): number {
    const D = this.doors.D;
    if (D.exists && Math.abs(x) < SHAFT_HW + 0.3 && D.shut() > 0.5) return Math.max(this.sand.heightAt(x), this.F - 0.05);
    return this.sand.heightAt(x);
  }
}
