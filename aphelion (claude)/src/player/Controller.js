import { Vector3 } from 'three';

export class Controller {
  constructor(time) {
    this.keys = new Set(); this.pressed = new Set(); this.mx = 0; this.my = 0; this.wantsLock = () => false;
    addEventListener('keydown', e => {
      this.keys.add(e.code); if (!e.repeat) this.pressed.add(e.code);
      // Ctrl è 'giù': evita che le combinazioni col resto dei comandi (Ctrl+S, Ctrl+D, Ctrl+F...) attivino
      // le scorciatoie del browser. Ctrl+W (chiudi scheda) invece NON è bloccabile da una pagina web.
      if (e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight') e.preventDefault();
      if (e.code === 'BracketRight') time.scale = Math.min(time.scale * 2, 32);
      if (e.code === 'BracketLeft') time.scale = Math.max(time.scale / 2, 1 / 16);
      if (e.code === 'Digit0') time.paused = !time.paused;
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('mousemove', e => { if (document.pointerLockElement) { this.mx += e.movementX; this.my += e.movementY; } });
    addEventListener('click', () => { if (this.wantsLock()) document.body.requestPointerLock(); });
    this.out = { move: new Vector3(), rot: new Vector3(), look: new Vector3(), match: false, jump: false };
  }
  took(code) { return this.pressed.delete(code); }
  read() {
    const k = c => this.keys.has(c) ? 1 : 0, o = this.out;
    const up = Math.max(k('ShiftLeft'), k('ShiftRight'), k('KeyF')), down = Math.max(k('ControlLeft'), k('ControlRight'));
    o.move.set(k('KeyD') - k('KeyA'), up - down, k('KeyS') - k('KeyW')); // Shift/F su, Ctrl giù
    o.rot.set(k('ArrowUp') - k('ArrowDown'), k('ArrowLeft') - k('ArrowRight'), k('KeyQ') - k('KeyE'));
    o.look.set(this.mx, this.my, 0); this.mx = this.my = 0;
    o.match = !!k('Space'); // nave: azzera la velocità relativa
    o.jump = !!k('Space'); // a piedi: salto
    return o;
  }
}
