// Keyboard and on-screen touch controls, combined into two axes.

export interface Axes {
  throttle: number; // -1 reverse .. 1 forward
  steer: number; // -1 right .. 1 left (positive turns the bow to port)
}

type Dir = 'fwd' | 'back' | 'left' | 'right';

const KEYMAP: Record<string, Dir> = {
  KeyW: 'fwd',
  ArrowUp: 'fwd',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

export class Input {
  private keys = new Set<Dir>();
  private touch = new Set<Dir>();
  enabled = false;
  /** Called for single-press shortcuts (camera, hide UI, etc.). */
  onShortcut: (code: string) => void = () => {};

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const dir = KEYMAP[e.code];
    if (dir && this.enabled) {
      this.keys.add(dir);
      e.preventDefault();
      return;
    }
    if (!e.repeat) this.onShortcut(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const dir = KEYMAP[e.code];
    if (dir) this.keys.delete(dir);
  };

  clear = () => {
    this.keys.clear();
    this.touch.clear();
  };

  /** Wires a hold-to-move button. Uses pointer capture so multi-touch works. */
  bindButton(el: HTMLElement, dir: Dir): void {
    const release = (e: PointerEvent) => {
      this.touch.delete(dir);
      el.classList.remove('is-active');
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touch.add(dir);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already released; the press still counts */
      }
      el.classList.add('is-active');
    });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', () => {
      this.touch.delete(dir);
      el.classList.remove('is-active');
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get anyActive(): boolean {
    return this.keys.size > 0 || this.touch.size > 0;
  }

  read(): Axes {
    if (!this.enabled) return { throttle: 0, steer: 0 };
    const has = (d: Dir) => this.keys.has(d) || this.touch.has(d);
    return {
      throttle: (has('fwd') ? 1 : 0) - (has('back') ? 1 : 0),
      steer: (has('left') ? 1 : 0) - (has('right') ? 1 : 0),
    };
  }
}
