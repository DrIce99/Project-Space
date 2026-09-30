import { Vector3 } from 'three';
import { formatDistance } from '../systems/RelativeVelocitySystem.js';
const _p = new Vector3(), _rel = new Vector3(), _fwd = new Vector3();
const EDGE = 0.9; // margine dal bordo dello schermo in coordinate normalizzate (±1)

// Indicatore a schermo della nave (visibile a piedi): un rombo sopra la nave con la distanza. Se la nave
// è fuori inquadratura o alle spalle, l'indicatore si ferma sul bordo dello schermo nella direzione in cui
// girarsi e mostra una freccia orientata verso di lei.
export class ShipMarker {
  constructor() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;display:none;color:#9fd;font:12px/1.2 monospace;text-align:center;text-shadow:0 0 4px #000;transform:translate(-50%,-50%)';
    el.innerHTML = `<svg width="26" height="26" viewBox="-13 -13 26 26" style="display:block;margin:0 auto">
      <g id="sm-diamond"><rect x="-6" y="-6" width="12" height="12" transform="rotate(45)" fill="none" stroke="#9fd" stroke-width="2"/><circle r="2" fill="#9fd"/></g>
      <polygon id="sm-arrow" points="11,0 -5,-7 -1,0 -5,7" fill="#9fd" style="display:none"/></svg><div id="sm-label"></div>`;
    document.body.appendChild(el);
    this.el = el; this.diamond = el.querySelector('#sm-diamond'); this.arrow = el.querySelector('#sm-arrow'); this.label = el.querySelector('#sm-label');
  }
  update(camera, shipPos, visible) {
    if (!visible) { this.el.style.display = 'none'; return; }
    this.el.style.display = '';
    const dist = camera.position.distanceTo(shipPos);
    this.label.textContent = `NAVE ${formatDistance(dist)}`;
    const behind = _rel.subVectors(shipPos, camera.position).dot(camera.getWorldDirection(_fwd)) < 0;
    _p.copy(shipPos).project(camera);
    let x = _p.x, y = _p.y;
    if (behind) { x = -x; y = -y; } // dietro la camera la proiezione è speculare: la si ribalta
    const off = behind || Math.abs(x) > EDGE || Math.abs(y) > EDGE;
    if (off) { // porta il punto sul bordo mantenendo la direzione
      const s = EDGE / Math.max(Math.abs(x), Math.abs(y), 1e-6);
      x *= s; y *= s;
      this.arrow.setAttribute('transform', `rotate(${-Math.atan2(y, x) * 180 / Math.PI})`);
    }
    this.diamond.style.display = off ? 'none' : ''; this.arrow.style.display = off ? '' : 'none';
    this.el.style.left = `${(x + 1) / 2 * innerWidth}px`;
    this.el.style.top = `${(1 - y) / 2 * innerHeight}px`;
  }
}
