// Barks: what the humans shout (VO-less: floating pixel text over their heads, rate-limited so the chatter
// stays readable). Plain divers bark tactics like MGS guards; nemeses taunt with their own memories.
import type { World } from '../game/types';
import { board } from './board';

export type BarkEvent = 'spot' | 'lost' | 'reload' | 'flank' | 'cover' | 'manDown' | 'hurt' | 'retreat' | 'net' | 'netHit' | 'flare'
  | 'heal' | 'charge' | 'wreck' | 'killed' | 'escape' | 'hose' | 'air' | 'boat' | 'charge2';

const LINES: Record<BarkEvent, string[]> = {
  spot: ['Contact! Blobfish!', 'There it is!', 'Eyes on the target!', 'Pink thing, two o\'clock!', 'I see it!'],
  lost: ['Lost visual.', 'Where\'d it go?', 'It\'s hiding in the rocks.', 'Check your corners.'],
  reload: ['Reloading!', 'Cover me, reloading!', 'Shaft out!', 'Re-cocking!'],
  flank: ['Flanking left!', 'Go wide, go wide!', 'I\'ll take the high side.', 'Pinch it!', 'Circle round!'],
  cover: ['Taking cover!', 'Behind the rocks!', 'Get down!'],
  manDown: ['Man down!', 'We lost one!', 'Diver down!', 'It got Pete!', 'Oh god, his arm...'],
  hurt: ['I\'m hit!', 'Argh!', 'It BIT me!', 'My leg!'],
  retreat: ['I\'m out! I\'m out!', 'Falling back!', 'Not worth it!', 'Surface, surface!', 'Abort!'],
  net: ['Net out!', 'Bagging it!', 'Hold still...'],
  netHit: ['Got it! Got it!', 'Haul it in!', 'Bag secured!'],
  flare: ['Calling for backup!', 'Flare up!', 'Send everyone!'],
  heal: ['Hold on, patching you up.', 'Stay with me!', 'Pressure on the wound.'],
  charge: ['Get it!', 'Now! Now!', 'Rush it!'],
  wreck: ['Hit the wreck!', 'Sink that hull!', 'Plant the charges!', 'Scrap it all!'],
  killed: ['Got the blobfish!', 'That\'s a trophy.', 'Bag it and tag it.'],
  escape: ['I\'ll be back for you!', 'This isn\'t over!', 'Remember my face!'],
  hose: ['My air! It cut my air!', 'HOSE! HOSE!'],
  air: ['Need air!', 'Going up!'],
  boat: ['Drop the cans!', 'Charges away!', 'Lines in the water!'],
  charge2: ['Lay it on!', 'Keep firing!'],
};

/** shout a line over (x, y). Returns false if the channel is busy (unless forced). */
export function bark(w: World, ev: BarkEvent | string[], x: number, y: number, o: { force?: boolean; follow?: () => { x: number; y: number }; style?: 'body' | 'danger' | 'hint' | 'gold'; size?: number } = {}): boolean {
  const b = board(w);
  if (!o.force && b.time - b.lastBark < 1.6) return false;
  const pool = Array.isArray(ev) ? ev : LINES[ev];
  if (!pool?.length) return false;
  b.lastBark = b.time;
  const line = pool[Math.floor(Math.random() * pool.length)];
  // with follow, x / y are offsets from the speaker
  w.text.pop(line, o.follow ? 0 : x, (o.follow ? 0 : y) + 1.1, o.style ?? 'body', { size: o.size ?? 0.3, life: 2.4, vy: 0.08, follow: o.follow });
  return true;
}
