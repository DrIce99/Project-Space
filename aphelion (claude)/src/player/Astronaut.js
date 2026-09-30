import { Vector3, Quaternion } from 'three';
import { gravityAt, dominantBody } from '../physics/Gravity.js';
const Y = new Vector3(0, 1, 0), X = new Vector3(1, 0, 0);
const _q = new Quaternion(), _up = new Vector3(), _cur = new Vector3(), _s = new Vector3(), _f = new Vector3(), _r = new Vector3(), _v = new Vector3(), _w = new Vector3();

// Il "su" locale segue sempre la direzione centro→giocatore: si cammina su una sfera.
export class Astronaut {
  constructor() {
    this.position = new Vector3(); this.velocity = new Vector3(); this.quaternion = new Quaternion(); this.grav = new Vector3();
    this.pitch = 0; this.grounded = false; this.dominant = null; this.speed = 6;
  }
  placeNear(ship) {
    _up.subVectors(ship.position, ship.dominant.position).normalize();
    this.quaternion.setFromUnitVectors(Y, _up); this.pitch = 0;
    _r.set(1, 0, 0).applyQuaternion(ship.quaternion).projectOnPlane(_up).normalize();
    this.position.copy(ship.position).addScaledVector(_r, 4).addScaledVector(_up, 1);
    this.velocity.copy(ship.velocity); this.grounded = false; this.dominant = ship.dominant;
  }
  turn(dx, dy) {
    this.quaternion.multiply(_q.setFromAxisAngle(Y, -dx * 0.0025)).normalize();
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * 0.0025));
  }
  step(dt, inp, sys) {
    const dom = this.dominant = dominantBody(this.position, sys.bodies);
    gravityAt(this.position, sys.bodies, this.grav);
    _up.subVectors(this.position, dom.position).normalize();
    _cur.copy(Y).applyQuaternion(this.quaternion);
    this.quaternion.premultiply(_q.setFromUnitVectors(_cur, _up)).normalize();
    if (this.grounded) { // controllo del movimento relativo alla superficie (che ruota e orbita)
      const sv = dom.velocityAt(this.position, _s);
      _f.set(0, 0, -1).applyQuaternion(this.quaternion); _r.set(1, 0, 0).applyQuaternion(this.quaternion);
      _w.copy(_f).multiplyScalar(-inp.move.z).addScaledVector(_r, inp.move.x);
      if (_w.lengthSq() > 1) _w.normalize();
      _w.multiplyScalar(this.speed);
      _v.subVectors(this.velocity, sv); const vn = _v.dot(_up);
      _v.addScaledVector(_up, -vn).lerp(_w, 1 - Math.exp(-10 * dt)).addScaledVector(_up, vn);
      this.velocity.copy(sv).add(_v);
      if (inp.jump) this.velocity.addScaledVector(_up, Math.sqrt(2 * dom.surfaceGravity * 1.5));
    }
    this.velocity.addScaledVector(this.grav, dt);
    this.position.addScaledVector(this.velocity, dt);
    _up.subVectors(this.position, dom.position); const d = _up.length(); _up.divideScalar(d);
    const ground = dom.groundRadiusAt(this.position);
    if (d <= ground) {
      this.position.copy(dom.position).addScaledVector(_up, ground);
      dom.velocityAt(this.position, _s); _v.subVectors(this.velocity, _s);
      const vn = _v.dot(_up); if (vn < 0) _v.addScaledVector(_up, -vn);
      this.velocity.copy(_s).add(_v); this.grounded = true;
    } else this.grounded = d < ground + 0.1;
  }
  pose(pos, quat) {
    _up.copy(Y).applyQuaternion(this.quaternion);
    pos.copy(this.position).addScaledVector(_up, 1.7);
    quat.copy(this.quaternion).multiply(_q.setFromAxisAngle(X, this.pitch));
  }
}
