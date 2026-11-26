// voxelText (v7): no more extruded 3D letters. Same call, but the word is 2D pixel-font text drawn on the screen's
// UI canvas over the returned marker's projected position (src/ui/text3d.ts anchoredWord): crisp, with a soft dark
// outline, gently floating. Place / parent / animate the returned Mesh as before; its world position is the word's
// centre and `height` its overall height (metres). Screens with no UI canvas see a flat pixel-text card instead.
import type * as THREE from 'three';
import type { TextStyle } from './text';
import { anchoredWord } from './text3d';

export function voxelText(text: string, st: TextStyle, height = 1, _depth = 3, _glow = 0.15): THREE.Mesh {
  const fill = Array.isArray(st.fill) ? st.fill : [st.fill];
  const top = fill[0] ?? '#ffffff', bottom = fill[Math.max(0, fill.length - 2)] ?? top;
  const edge = st.outline2 ?? st.outline ?? '#0b1626';
  return anchoredWord(text, { top, bottom, edge }, height * 0.62, { fit: 'cap', min: 'title', max: 'giant' });
}
