// Dev preview for the hideout (?preview=hideout). Seeds a test save (materials, stash gear, a couple of
// nemeses, some progress) so build mode, the workshop and the run config have something to show.
//
// Flags: &view=tv | config | settings | build | stash | workshop | cinematic    jump straight to a view
//        &fresh=1   start from an empty save (default layout, no materials)
//        &rich=1    lots of materials (afford everything)
//        &yaw=..&pitch=..&dist=..   camera
import type { Game, Screen } from '../game/game';
import { HideoutScreen } from '../hideout';
import { META, saveMeta, resetMeta, stashItem } from '../meta/meta';
import { ITEMS } from '../game/items';

function seed(rich: boolean) {
  resetMeta();
  const mats = ['driftwood', 'kelp', 'rustyNail', 'ironOre', 'copperOre', 'lineScrap', 'cork', 'seaGlass', 'coralShard', 'riverStone', 'glassLens', 'pearl', 'amethyst', 'aquamarine', 'rustyHook', 'sharkTooth', 'urchinSpine', 'doubloon', 'goldNugget', 'leadShot'];
  mats.forEach((m, i) => { if (ITEMS[m]) META.materials[m] = rich ? 60 : Math.max(1, 14 - i); });
  for (const id of ['scissors', 'corkBobber', 'luckyLure', 'bubbleWand', 'rubberDuck', 'compass', 'inkSac', 'tackleBox', 'sharkNecklace', 'reelGear', 'starfish', 'eelBattery']) if (ITEMS[id]) stashItem(id, id === 'scissors' ? 2 : 1);
  META.runs = 3; META.wins = 1; META.deaths = 2; META.extractions = 4; META.masteryUnlocked = 2;
  META.nemeses = [
    { id: 'n1', name: "Gary 'Two-Lines' Petersen", title: 'the Line-Snapped', arch: 'diver', level: 2, scars: ['eyepatch'], memories: ['killed you in the reef', 'you cut his line twice'], kills: 1, defeats: 1, seed: 3, alive: true },
    { id: 'n2', name: 'Big Marge Okonkwo', title: 'Harpoon Queen', arch: 'spearfisher', level: 1, scars: ['bandage'], memories: ['got away with your pearls'], kills: 1, defeats: 0, seed: 8, alive: true },
  ];
  META.lastConfig = { mastery: 1, startArea: 'kelp', loadout: META.stash.slice(0, 4).map((s) => s.uid) };
  saveMeta();
}

export default function make(game: Game): Screen {
  const q = new URLSearchParams(location.search);
  if (q.get('fresh') === '1') resetMeta();
  else if (q.get('keep') !== '1') seed(q.get('rich') === '1');
  const h = new HideoutScreen(game, {
    onEnterRun: (cfg) => { console.log('[hideout] onEnterRun', JSON.stringify(cfg)); setTimeout(() => game.go('hideout'), 1500); },
    onResume: () => console.log('[hideout] onResume'),
  });
  if (q.get('yaw')) h.rig.user.yaw = Number(q.get('yaw'));
  if (q.get('pitch')) h.rig.user.pitch = Number(q.get('pitch'));
  if (q.get('dist')) h.rig.user.dist = Number(q.get('dist'));
  h.rig.snap();
  if (q.get('dbg') === 'notails') for (const e of h.hero.extras ?? []) e.visible = false;
  if (q.get('dbg') === 'nohero') h.hero.root.visible = false;
  return h;
}
