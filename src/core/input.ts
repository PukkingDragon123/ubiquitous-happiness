// Keyboard + mouse input. Actions are queried by name so rebinding stays in one place. Dash is SHIFT (either side):
// tap to dart, hold to charge a dash, let go to launch it (src/combat/moveset.ts). Space no longer dashes; it only
// advances dialogue / skips cards where a screen asks for it.
// Mouse position is kept in normalised device coords (ndc) and pixels; systems that need a world point
// call game.mouseWorld() (ray onto the z = 0 gameplay plane).
// v8 touch: a touch layer (src/ui/touch.ts) hooks in as `touch`. Touches it claims (the move stick, the on-screen
// buttons) never become the mouse; it drives the analog `stick` (axis() prefers it) and presses virtual keys with
// press() / release(). Any other touch is the mouse (one finger at a time): a tap is a click (its release lands one
// frame after the press, so hover-driven widgets see it), and once the finger lifts the pointer leaves the screen
// so nothing stays hovered.
export type Action = 'left' | 'right' | 'up' | 'down' | 'dash' | 'attack' | 'ability' | 'ability2' | 'interact' | 'bag' | 'pause' | 'rotate' | 'map';

const BIND: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  dash: ['ShiftLeft', 'ShiftRight'], attack: ['KeyJ', 'Mouse0'], ability: ['KeyK', 'Mouse2'], ability2: ['KeyL', 'KeyQ'],
  interact: ['KeyE', 'KeyF'], bag: ['Tab', 'KeyI', 'KeyB'], pause: ['Escape', 'KeyP'], rotate: ['KeyR'], map: ['KeyM'],
};

/** the touch layer's hook into the pointer stream: true = this touch is the layer's (not the mouse) */
export interface TouchHook { down(e: PointerEvent): boolean; move(e: PointerEvent): boolean; up(e: PointerEvent): boolean; reset(): void }

export class Input {
  down = new Set<string>();
  pressed = new Set<string>();
  released = new Set<string>();
  mouse = { x: 0, y: 0, nx: 0, ny: 0, wheel: 0, moved: false, inside: true };
  lastKeyboard = 0;
  lastMouse = 0;
  /** the touch layer (src/ui/touch.ts) */
  touch: TouchHook | null = null;
  /** a touch device: a coarse pointer, or a touch has been seen (?touch=1 forces it, ?touch=0 turns it off) */
  touchMode = false;
  /** the virtual move stick, -1..1 (y up), while a thumb is on it */
  stick: { x: number; y: number } | null = null;
  /** the touch acting as the mouse (-1: none) */
  private mouseId = -1;
  private deferRelease = false;
  private liftPending = false;
  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this.lastKeyboard = performance.now();
    });
    addEventListener('keyup', (e) => { this.down.delete(e.code); this.released.add(e.code); });
    addEventListener('blur', () => { this.down.clear(); this.touch?.reset(); this.stick = null; this.mouseId = -1; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    const q = new URLSearchParams(location.search).get('touch');
    const coarse = q === '1' || (q !== '0' && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    this.touchMode = coarse;
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') { if (this.touch?.move(e)) return; if (e.pointerId !== this.mouseId) return; }
      // a real mouse on a touch laptop: back to the mouse (the buttons hide)
      else if (e.pointerType === 'mouse' && this.touchMode && !coarse && (e.movementX || e.movementY)) { this.touchMode = false; this.touch?.reset(); }
      this.setMouse(e);
    });
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        if (q !== '0') this.touchMode = true;
        if (this.touch?.down(e)) return;
        // one finger is the mouse at a time (a second free finger is ignored)
        if (this.mouseId !== -1 && this.mouseId !== e.pointerId) return;
        this.mouseId = e.pointerId; this.liftPending = false;
      }
      this.setMouse(e);
      const c = 'Mouse' + e.button;
      if (!this.down.has(c)) this.pressed.add(c);
      this.down.add(c);
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        if (this.touch?.up(e)) return;
        if (e.pointerId !== this.mouseId) return;
        this.mouseId = -1;
        // a tap that pressed and lifted inside one frame: let it be held for that frame, release on the next
        if (this.pressed.has('Mouse0')) { this.deferRelease = true; return; }
        this.liftPending = true;
      }
      const c = 'Mouse' + e.button; this.down.delete(c); this.released.add(c);
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('mouseleave', () => (this.mouse.inside = false));
    document.addEventListener('mouseenter', () => (this.mouse.inside = true));
  }

  private setMouse(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top;
    this.mouse.nx = (this.mouse.x / r.width) * 2 - 1; this.mouse.ny = -(this.mouse.y / r.height) * 2 + 1;
    this.mouse.moved = true; this.lastMouse = performance.now();
  }

  /** press a virtual key (the touch layer's buttons): it reads exactly like a real key going down */
  press(code: string) { if (!this.down.has(code)) this.pressed.add(code); this.down.add(code); this.lastKeyboard = performance.now(); }
  /** let a virtual key go */
  release(code: string) { if (this.down.delete(code)) this.released.add(code); }

  held(a: Action) { return BIND[a].some((c) => this.down.has(c)); }
  hit(a: Action) { return BIND[a].some((c) => this.pressed.has(c)); }
  up(a: Action) { return BIND[a].some((c) => this.released.has(c)); }
  key(code: string) { return this.down.has(code); }
  keyHit(code: string) { return this.pressed.has(code); }
  anyHit() { return this.pressed.size > 0; }
  /** movement axis from keys (or the touch stick, analog), -1..1 each */
  axis(): { x: number; y: number } {
    const st = this.stick;
    if (st && Math.hypot(st.x, st.y) > 0.01) return { x: st.x, y: st.y };
    const x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    const y = (this.held('up') ? 1 : 0) - (this.held('down') ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  }
  /** call at the end of every frame */
  endFrame() {
    this.pressed.clear(); this.released.clear(); this.mouse.wheel = 0; this.mouse.moved = false;
    // a lifted finger leaves the screen (no stuck hover), one frame after its release was seen
    if (this.liftPending && this.mouseId === -1 && !this.down.has('Mouse0')) {
      this.liftPending = false;
      this.mouse.x = this.mouse.y = -9999; this.mouse.nx = this.mouse.ny = -9;
    }
    if (this.deferRelease) { this.deferRelease = false; this.down.delete('Mouse0'); this.released.add('Mouse0'); this.liftPending = true; }
  }
}
