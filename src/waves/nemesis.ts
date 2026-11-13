// Nemeses (Shadow of Mordor style): a human who kills the blobfish, or gets away, is promoted. He keeps a name,
// a title earned from what happened, the scars you gave him (eyepatch, hook hand, burns, bandages, bite marks,
// stitches — all visible on his model) and memories he taunts you with when he comes back: "You cut my line at
// the Sunlit Reef. Not this time." Every promotion makes him tougher and smarter. Beating one drops special
// loot and ends his story (or, rarely, he crawls away again).
//
// Persisted in META.nemeses (src/meta/meta.ts).
import type { Nemesis } from '../meta/meta';
import { META, saveMeta } from '../meta/meta';
import { Rng } from '../core/rng';
import type { BarkEvent } from './barks';
import { setNemesisLines } from './human';
import type { Human, Role } from './human';
import { ROLES } from './human';

const FIRST = ['Gary', 'Dale', 'Rusty', 'Hank', 'Lyle', 'Doug', 'Wade', 'Earl', 'Clint', 'Boyd', 'Merle', 'Ray', 'Duane', 'Vince', 'Sal', 'Knut', 'Olaf', 'Bjorn', 'Marta', 'Dolores', 'Bev', 'Gunnar', 'Tex', 'Mick', 'Sheila', 'Brenda'];
const LAST = ['Petersen', 'Hollis', 'Kraken', 'Moody', 'Barnes', 'Fenwick', 'Quint', 'Sorensen', 'Gaff', 'McCready', 'Dunn', 'Harrow', 'Pike', 'Salter', 'Rook', 'Varga', 'Bristow', 'Grimsby', 'Coldwater', 'Hake'];
const NICK: Record<string, string[]> = {
  harpoon: ['Two-Shafts', 'Deadeye', 'Pin', 'Speargun', 'Bolt'],
  spear: ['Lungs', 'Snorkel', 'Breath', 'Kelp-Ghost', 'Freefall'],
  knife: ['Shiv', 'Gills', 'Fillet', 'Quiet', 'The Blade'],
  net: ['Two-Lines', 'Bag Man', 'Trawl', 'Mesh', 'Hauler'],
  medic: ['Stitches', 'Doc', 'Patch', 'Saline', 'Iodine'],
  heavy: ['Brass', 'Anvil', 'Lead-Boots', 'Bell', 'Rivet'],
  titan: ['The Bell', 'Iron Lung', 'Colossus'],
};

/** what the blobfish did to him -> a title */
function titleFor(scars: string[], how: 'killed' | 'escaped', level: number, prev?: string): string {
  if (level >= 3) return pick(['the Undrowned', 'the Unkillable', 'Blobfish-Bane', 'the Returning'], scars.length + level);
  if (scars.includes('hookHand')) return 'Hook-Hand';
  if (scars.includes('burns')) return 'the Scorched';
  if (scars.includes('bite')) return 'the Bitten';
  if (scars.includes('eyepatch')) return 'One-Eye';
  if (scars.includes('bandage')) return 'the Patched-Up';
  if (scars.includes('stitches') || scars.includes('scar')) return 'Scar-Face';
  if (how === 'killed') return level > 1 ? 'Blobfish-Bane' : 'the Fish-Killer';
  return prev ?? 'Who Ran';
}
const pick = <T>(a: T[], i: number) => a[Math.abs(i) % a.length];

export interface PromoteCtx { area: string; wave: number; how: 'killed' | 'escaped'; save: boolean }

/** promote a human who beat the blobfish (or ran) into a nemesis; returns the record (created or updated) */
export function promote(h: Human, ctx: PromoteCtx, list: Nemesis[] = META.nemeses): Nemesis {
  const scars = [...h.scars];
  // what he remembers of this fight
  const mem: string[] = [];
  if (ctx.how === 'killed') mem.push(`killed you at the ${ctx.area}`);
  else mem.push(`got away from you at the ${ctx.area}`);
  for (const e of h.events) {
    if (e === 'lost his hand') mem.push(`you took his hand at the ${ctx.area}`);
    else if (e === 'lost an arm') mem.push(`you took his arm at the ${ctx.area}`);
    else if (e === 'lost a leg') mem.push(`you took his leg at the ${ctx.area}`);
    else if (e === 'bitten') mem.push(`you bit him at the ${ctx.area}`);
    else if (e === 'his air hose was cut') mem.push(`you cut his air hose at the ${ctx.area}`);
  }
  if (scars.includes('burns') && !mem.some((m) => m.includes('hose'))) mem.push(`you burned him at the ${ctx.area}`);
  if (h.role === 'net' && h.dealt > 0) mem.push(`he bagged you at the ${ctx.area}`);
  let n = h.nemesis ? list.find((x) => x.id === h.nemesis!.id) ?? null : null;
  if (n) {
    // a returning nemesis wins again: tougher, angrier, more scars
    n.level = Math.min(5, n.level + 1);
    n.scars = [...new Set([...n.scars, ...scars])];
    n.memories = [...mem, ...n.memories].slice(0, 8);
    if (ctx.how === 'killed') n.kills++;
    n.title = titleFor(n.scars, ctx.how, n.level, n.title);
  } else {
    const rng = new Rng((Date.now() ^ (h.x * 1000)) >>> 0);
    const nick = pick(NICK[h.role] ?? NICK.harpoon, rng.int(0, 9));
    const name = `${rng.pick(FIRST)} '${nick}' ${rng.pick(LAST)}`;
    n = {
      id: 'nem' + Date.now().toString(36) + rng.int(0, 999),
      name, title: titleFor(scars, ctx.how, 1), arch: ROLES[h.role].arch + ':' + h.role, level: 1,
      scars, memories: mem, kills: ctx.how === 'killed' ? 1 : 0, defeats: 0,
      seed: rng.int(1, 1e6), alive: true,
    };
    list.push(n);
  }
  if (ctx.save) saveMeta();
  return n;
}

/** the blobfish finally beat him */
export function defeat(n: Nemesis, ctx: { area: string; save: boolean }, list: Nemesis[] = META.nemeses): { survived: boolean } {
  const rec = list.find((x) => x.id === n.id) ?? n;
  rec.defeats++;
  // sometimes they crawl away from it (the third time is for good)
  const survived = rec.defeats < 3 && Math.random() < 0.18;
  rec.alive = survived;
  if (survived) { rec.memories.unshift(`you nearly killed him at the ${ctx.area}`); rec.scars = [...new Set([...rec.scars, 'stitches'])]; }
  if (ctx.save) saveMeta();
  return { survived };
}

/** role of a nemesis record ("scuba:harpoon" -> harpoon) */
export function roleOf(n: Nemesis): Role {
  const r = n.arch.split(':')[1] as Role | undefined;
  return r && r in ROLES ? r : 'harpoon';
}
/** humans-module archetype of a nemesis */
export function archOf(n: Nemesis) { return n.arch.split(':')[0]; }

/** special loot for beating a nemesis (scales with his level) */
export function nemesisLoot(n: Nemesis): string[] {
  const pool = ['harpoonTip', 'filletKnife', 'grappleHook', 'sharkNecklace', 'tackleBox', 'anglerLantern', 'luckyLure', 'reelGear', 'netShard', 'mermaidScale'];
  const out = [pool[(n.seed + n.level) % pool.length], 'doubloon'];
  if (n.level >= 2) out.push(['ruby', 'emerald', 'abyssCrystal'][n.seed % 3]);
  if (n.level >= 3) out.push(pool[(n.seed * 7 + 3) % pool.length]);
  return out;
}

/** pick the nemeses that come back this wave (none early on; rarer at low mastery) */
export function pickReturning(list: Nemesis[], wave: number, mastery: number, already: Set<string>, rng: Rng): Nemesis[] {
  const live = list.filter((n) => n.alive && !already.has(n.id));
  if (!live.length || wave < 2) return [];
  const chance = 0.3 + mastery * 0.08 + wave * 0.04;
  if (!rng.chance(Math.min(0.85, chance))) return [];
  // the angriest (most kills, highest level) first
  live.sort((a, b) => b.level * 2 + b.kills - (a.level * 2 + a.kills));
  return [live[Math.min(live.length - 1, rng.int(0, Math.min(2, live.length - 1)))]];
}

// ------------------------------------------------------------------ what they say
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** turn a memory into a first-person line: "killed you at the Sunlit Reef" -> "I killed you at the Sunlit Reef." */
function firstPerson(m: string): string {
  if (m.startsWith('killed you')) return `Remember me? I ${m}.`;
  if (m.startsWith('got away')) return `I ${m}. Not this time.`;
  if (m.startsWith('you took his hand')) return `You took my hand at the ${m.split(' at the ')[1]}. I'll take your fins.`;
  if (m.startsWith('you took his arm')) return `You took my arm at the ${m.split(' at the ')[1]}. One's enough for you.`;
  if (m.startsWith('you took his leg')) return `You took my leg at the ${m.split(' at the ')[1]}. I can still swim.`;
  if (m.startsWith('you bit him')) return `You bit me at the ${m.split(' at the ')[1]}. Bite this.`;
  if (m.startsWith('you cut his air hose')) return `You cut my air at the ${m.split(' at the ')[1]}. I brought a spare.`;
  if (m.startsWith('you burned him')) return `You burned me at the ${m.split(' at the ')[1]}. Look at my face!`;
  if (m.startsWith('he bagged you')) return `I bagged you at the ${m.split(' at the ')[1]}. I'll do it again.`;
  if (m.startsWith('you nearly killed him')) return `You nearly had me at the ${m.split(' at the ')[1]}. Nearly.`;
  return cap(m) + '.';
}
/** the intro line when he shows up */
export function introLine(n: Nemesis): string {
  if (!n.memories.length) return 'You again.';
  return firstPerson(n.memories[0]);
}
export function nemesisLines(n: Nemesis, ev: BarkEvent): string[] | null {
  const name = n.name.split(' ')[0];
  switch (ev) {
    case 'spot': return [introLine(n), `${name}'s back, little fish.`, n.memories[1] ? firstPerson(n.memories[1]) : 'Did you miss me?'];
    case 'hurt': return ['That one\'s going on the list!', 'Another scar for you to pay for.', 'You\'ll pay for that!'];
    case 'retreat': case 'escape': return ['This isn\'t over, fish!', 'I\'ll be back. I always come back.', 'Next time!'];
    case 'reload': return ['Hold still...', 'I\'ve waited for this.'];
    case 'killed': return ['Told you I\'d be back.', 'Another one for the wall.'];
    case 'manDown': return ['Useless. I\'ll do it myself.'];
    default: return null;
  }
}
setNemesisLines(nemesisLines);
