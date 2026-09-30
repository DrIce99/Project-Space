import { Vector3, Quaternion, Euler } from 'three';
import { gravityAt, dominantBody } from '../physics/Gravity.js';
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), _q = new Quaternion(), _e = new Euler(), _r = new Vector3(), _s = new Vector3(), _v = new Vector3(), _t = new Vector3();

export class Spaceship {
  constructor() {
    this.position = new Vector3(); this.velocity = new Vector3(); this.quaternion = new Quaternion();
    this.angVel = new Vector3(); this.grav = new Vector3(); this.acc = new Vector3();
    this.throttle = new Vector3(); // comando di spinta corrente (spazio locale), letto dal rendering per le fiamme
    this.fuel = 100; this.thrust = 25; this.landed = false; this.dominant = null;
  }
  spawnInOrbit(body, alt) {
    const r = body.radius + alt;
    this.position.copy(body.position).add(new Vector3(0, 0, r));
    this.velocity.copy(body.velocity).add(new Vector3(body.circularVelocity(r), 0, 0));
    this.quaternion.setFromEuler(_e.set(0, Math.PI, 0)); // prua verso il pianeta
  }
  // Mouse: stessa sensibilità della camera a piedi. Imbardata e beccheggio diretti nel frame della nave.
  turn(dx, dy) {
    this.quaternion.multiply(_q.setFromAxisAngle(Y, -dx * 0.0025)).multiply(_q.setFromAxisAngle(X, -dy * 0.0025)).normalize();
  }
  step(dt, inp, sys) {
    this.angVel.lerp(_t.copy(inp.rot).multiplyScalar(1.2), 1 - Math.exp(-6 * dt));
    this.quaternion.multiply(_q.setFromEuler(_e.set(this.angVel.x * dt, this.angVel.y * dt, this.angVel.z * dt))).normalize();
    this.dominant = dominantBody(this.position, sys.bodies);
    gravityAt(this.position, sys.bodies, this.acc);
    this.grav.copy(this.acc);
    this.throttle.copy(this.fuel > 0 ? inp.move : _t.set(0, 0, 0));
    if (this.fuel > 0 && inp.move.lengthSq()) {
      this.acc.addScaledVector(_v.copy(inp.move).normalize().applyQuaternion(this.quaternion), this.thrust);
      this.fuel -= dt * 0.15;
    }
    if (this.fuel > 0 && inp.match) { // autopilota: azzera la velocità relativa al corpo dominante
      this.dominant.velocityAt(this.position, _s);
      this.acc.add(_v.subVectors(_s, this.velocity).clampLength(0, this.thrust));
      this.fuel -= dt * 0.15;
    }
    this.velocity.addScaledVector(this.acc, dt);
    this.position.addScaledVector(this.velocity, dt);
    this.landed = false;
    for (const b of sys.bodies) { // contatto: rimbalzo se impatto forte, poi attrito → co-rotazione
      const rel = _r.subVectors(this.position, b.position), dist = rel.length();
      if (dist > b.radius * 1.2) continue;
      const min = b.groundRadiusAt(this.position) + 1.5;
      if (dist >= min) continue;
      const n = rel.divideScalar(dist);
      this.position.copy(b.position).addScaledVector(n, min);
      const sv = b.velocityAt(this.position, _s), vr = _v.subVectors(this.velocity, sv), vn = vr.dot(n);
      if (vn < 0) vr.addScaledVector(n, -vn * (-vn > 8 ? 1.3 : 1));
      vr.multiplyScalar(Math.exp(-3 * dt));
      this.velocity.copy(sv).add(vr);
      this.landed = vr.length() < 1;
    }
  }
}
