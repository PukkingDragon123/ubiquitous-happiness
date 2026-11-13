// Keyboard + mouse input. Actions are queried by name so rebinding stays in one place.
// Mouse position is kept in normalised device coords (ndc) and pixels; systems that need a world point
// call game.mouseWorld() (ray onto the z = 0 gameplay plane).
export type Action = 'left' | 'right' | 'up' | 'down' | 'dash' | 'attack' | 'ability' | 'ability2' | 'interact' | 'bag' | 'pause' | 'rotate' | 'map';

const BIND: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  dash: ['Space', 'ShiftLeft'], attack: ['KeyJ', 'Mouse0'], ability: ['KeyK', 'Mouse2'], ability2: ['KeyL', 'KeyQ'],
  interact: ['KeyE', 'KeyF'], bag: ['Tab', 'KeyI', 'KeyB'], pause: ['Escape', 'KeyP'], rotate: ['KeyR'], map: ['KeyM'],
};

export class Input {
  down = new Set<string>();
  pressed = new Set<string>();
  released = new Set<string>();
  mouse = { x: 0, y: 0, nx: 0, ny: 0, wheel: 0, moved: false, inside: true };
  lastKeyboard = 0;
  lastMouse = 0;
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
    addEventListener('blur', () => { this.down.clear(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('pointermove', (e) => this.setMouse(e));
    addEventListener('pointerdown', (e) => {
      this.setMouse(e);
      const c = 'Mouse' + e.button;
      if (!this.down.has(c)) this.pressed.add(c);
      this.down.add(c);
    });
    addEventListener('pointerup', (e) => { const c = 'Mouse' + e.button; this.down.delete(c); this.released.add(c); });
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

  held(a: Action) { return BIND[a].some((c) => this.down.has(c)); }
  hit(a: Action) { return BIND[a].some((c) => this.pressed.has(c)); }
  up(a: Action) { return BIND[a].some((c) => this.released.has(c)); }
  key(code: string) { return this.down.has(code); }
  keyHit(code: string) { return this.pressed.has(code); }
  anyHit() { return this.pressed.size > 0; }
  /** movement axis from keys, -1..1 each */
  axis(): { x: number; y: number } {
    const x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    const y = (this.held('up') ? 1 : 0) - (this.held('down') ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  }
  /** call at the end of every frame */
  endFrame() { this.pressed.clear(); this.released.clear(); this.mouse.wheel = 0; this.mouse.moved = false; }
}
