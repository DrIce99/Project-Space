const PREVENT = ['Space', 'ArrowUp', 'ArrowDown', 'F3'];

export class Input {
  constructor(){
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.locked = false;
    this.onLockChange = null;
    window.addEventListener('keydown', e => {
      if (PREVENT.includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement != null;
      if (!this.locked){ this.mouseDX = this.mouseDY = 0; }
      this.onLockChange?.(this.locked);
    });
  }
  down(code){ return this.keys.has(code); }
  consumeMouse(){ const d = [this.mouseDX, this.mouseDY]; this.mouseDX = this.mouseDY = 0; return d; }
  lock(el){ el.requestPointerLock?.(); }
  unlock(){ document.exitPointerLock?.(); }
}