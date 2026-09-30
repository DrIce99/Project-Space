import { Vector3, Quaternion } from 'three';
import { TerrainGenerator, hashSeed } from '../generation/TerrainGenerator.js';
const _o = new Vector3(), _o2 = new Vector3(), _l = new Vector3(), _qi = new Quaternion(), _qa = new Quaternion(), _qb = new Quaternion();
const _Y = new Vector3(0, 1, 0), _Z = new Vector3(0, 0, 1);

export class CelestialBody {
  constructor(d, parent = null, seed = 0) {
    Object.assign(this, { id: d.id, name: d.name, radius: d.radius, color: d.color, parent, orbit: d.orbit ?? null });
    this.mu = d.mu ?? d.gravity * d.radius ** 2;
    this.position = new Vector3(); this.velocity = new Vector3();
    this.moons = []; this.rotation = 0; this.quaternion = new Quaternion();
    this.data = d; this.atmosphere = d.atmosphere ?? null;
    this.atmoRadius = this.atmosphere ? d.radius + this.atmosphere.atmoTop : 0; // raggio esterno del guscio di scattering
    this.terrain = parent && d.type !== 'gas' ? new TerrainGenerator(hashSeed(seed, d.id), d.radius, { relief: d.relief, coverage: d.waterCoverage }) : null;
    const rot = d.rotation ?? { period: 0, tilt: 0 };
    this.tilt = rot.tilt;
    if (this.orbit) {
      this.period = 2 * Math.PI * Math.sqrt(this.orbit.a ** 3 / parent.mu); // Kepler
      this.soi = Math.max(this.orbit.a * (this.mu / parent.mu) ** 0.4, this.radius * 3);
    } else this.soi = Infinity;
    this.spin = rot.period === null ? 2 * Math.PI / this.period : rot.period ? 2 * Math.PI / rot.period : 0;
    this.axis = new Vector3(Math.sin(this.tilt), Math.cos(this.tilt), 0);
  }
  get surfaceGravity() { return this.mu / this.radius ** 2; }
  get escapeVelocity() { return Math.sqrt(2 * this.mu / this.radius); }
  circularVelocity(r) { return Math.sqrt(this.mu / r); }

  // Offset dal fuoco (parent) data l'anomalia media M; risolve Kepler con Newton.
  offsetAt(M, out) {
    const { a, e, inc } = this.orbit;
    let E = M; for (let i = 0; i < 5; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E);
    return out.set(x, y * Math.sin(inc), y * Math.cos(inc));
  }
  update(t) {
    if (this.orbit) {
      const M = this.orbit.phase + 2 * Math.PI * t / this.period, dM = 2 * Math.PI * 0.01 / this.period;
      this.offsetAt(M, _o); this.offsetAt(M + dM, _o2);
      this.position.copy(this.parent.position).add(_o);
      this.velocity.copy(this.parent.velocity).addScaledVector(_o2.sub(_o), 1 / 0.01);
    }
    this.rotation = this.spin * t;
    this.quaternion.copy(_qa.setFromAxisAngle(_Z, -this.tilt)).multiply(_qb.setFromAxisAngle(_Y, this.rotation));
  }
  // Raggio del suolo sotto un punto del mondo (terreno deterministico nel frame del corpo)
  groundRadiusAt(p) {
    if (!this.terrain) return this.radius;
    _l.subVectors(p, this.position).applyQuaternion(_qi.copy(this.quaternion).invert()).normalize();
    return this.radius + this.terrain.heightAt(_l.x, _l.y, _l.z);
  }
  // Velocità di un punto solidale alla superficie (rotazione + moto orbitale)
  velocityAt(p, out) {
    return out.subVectors(p, this.position).cross(this.axis).multiplyScalar(-this.spin).add(this.velocity);
  }
}