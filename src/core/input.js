// 4D-MC :: input ----------------------------------------------------------
// Pointer-lock mouse look, key state, and a wheel channel that the 4D travel
// system consumes while the hyper-shift key is held.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();     // edge-triggered, cleared each frame
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, middle: false };
    this.clicked = { left: false, right: false, middle: false };
    this.wheel = 0;               // accumulated wheel delta (normalised)
    this.locked = false;
    this.enabled = true;
    this._onLockChange = null;

    this._kd = (e) => {
      if (!this.enabled) return;
      if (e.repeat) { e.preventDefault?.(); return; }
      this.keys.add(e.code);
      this.pressed.add(e.code);
      // Stop the browser from stealing our controls.
      if (['Space', 'Tab', 'F3', 'F5', 'F2', 'F1'].includes(e.code) ||
          (e.code.startsWith('Digit') && this.locked)) e.preventDefault();
    };
    this._ku = (e) => { this.keys.delete(e.code); this.released.add(e.code); };
    this._blur = () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; };

    this._mm = (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    };
    this._md = (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.mouse.left = true; this.clicked.left = true; }
      if (e.button === 1) { this.mouse.middle = true; this.clicked.middle = true; }
      if (e.button === 2) { this.mouse.right = true; this.clicked.right = true; }
    };
    this._mu = (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 1) this.mouse.middle = false;
      if (e.button === 2) this.mouse.right = false;
    };
    this._wh = (e) => {
      if (!this.enabled) return;
      if (this.locked) e.preventDefault();
      // normalise across deltaMode (pixels / lines / pages)
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      this.wheel += (e.deltaY * scale) / 100;
    };
    this._ctx = (e) => { if (this.locked) e.preventDefault(); };
    this._pl = () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.mouse.dx = this.mouse.dy = 0;
      if (!this.locked) { this.keys.clear(); this.mouse.left = this.mouse.right = false; }
      this._onLockChange?.(this.locked);
    };

    window.addEventListener('keydown', this._kd, { passive: false });
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
    window.addEventListener('mousemove', this._mm);
    canvas.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    window.addEventListener('wheel', this._wh, { passive: false });
    canvas.addEventListener('contextmenu', this._ctx);
    document.addEventListener('pointerlockchange', this._pl);
  }

  onLockChange(fn) { this._onLockChange = fn; }
  requestLock() { this.canvas.requestPointerLock?.(); }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  justPressed(code) { return this.pressed.has(code); }
  justReleased(code) { return this.released.has(code); }

  /** Consume and reset per-frame edge state. Call at the very end of a frame. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.wheel = 0;
    this.clicked.left = this.clicked.right = this.clicked.middle = false;
  }
}
