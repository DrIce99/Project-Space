import { Vector3, Quaternion } from 'three';
import { TerrainGenerator, hashSeed } from '../generation/TerrainGenerator.js';
import { G } from '../physics/Gravity.js';
import { compositionOf } from '../generation/PlanetGenerator.js';
const _o = new Vector3(), _o2 = new Vector3(), _l = new Vector3(), _qi = new Quaternion(), _qa = new Quaternion(), _qb = new Quaternion();
const _Y = new Vector3(0, 1, 0), _Z = new Vector3(0, 0, 1);

export class CelestialBody {
  constructor(d, parent = null, seed = 0) {
    Object.assign(this, { id: d.id, name: d.name, radius: d.radius, color: d.color, parent, orbit: d.orbit ?? null });
    this.mu = d.mu ?? d.gravity * d.radius ** 2; this.mass = this.mu / G;
    this.star = parent ? parent.star : this; // radice del sistema (per distanza e irraggiamento)
    this.composition = d.composition ?? compositionOf(d.type ?? 'star');
    this.temperature = d.temperature ?? d.climate?.meanTemp ?? 0; // aggiornata in update() con la distanza dalla stella
    this.starDistance = 0;
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
    // rotazione sincrona (period null): stesso verso del moto orbitale, anche se retrogrado
    this.spin = rot.period === null ? (this.orbit.dir ?? 1) * 2 * Math.PI / this.period : rot.period ? 2 * Math.PI / rot.period : 0;
    this.axis = new Vector3(Math.sin(this.tilt), Math.cos(this.tilt), 0);
  }
  get rotationSpeed() { return this.spin; }
  get surfaceGravity() { return this.mu / this.radius ** 2; }
  get escapeVelocity() { return Math.sqrt(2 * this.mu / this.radius); }
  circularVelocity(r) { return Math.sqrt(this.mu / r); }

  // Offset dal fuoco (parent) data l'anomalia media M; risolve Kepler con Newton.
  // Frame perifocale (x verso il periastro) → argomento del periastro w → inclinazione inc attorno alla
  // linea dei nodi (asse X) → longitudine del nodo ascendente node attorno a Y (normale al piano di riferimento).
  // dir = -1: orbita retrograda (percorsa in senso opposto).
  offsetAt(M, out) {
    const { a, e, inc, w = 0, node = 0, dir = 1 } = this.orbit;
    let E = M; for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const px = a * (Math.cos(E) - e), py = dir * a * Math.sqrt(1 - e * e) * Math.sin(E);
    const x = px * Math.cos(w) - py * Math.sin(w), y = px * Math.sin(w) + py * Math.cos(w);
    const X = x, Y = y * Math.sin(inc), Z = y * Math.cos(inc), cn = Math.cos(node), sn = Math.sin(node);
    return out.set(X * cn + Z * sn, Y, Z * cn - X * sn);
  }
  get periapsis() { return this.orbit ? this.orbit.a * (1 - this.orbit.e) : 0; }
  get apoapsis() { return this.orbit ? this.orbit.a * (1 + this.orbit.e) : 0; }
  update(t) {
    if (this.orbit) {
      const M = this.orbit.phase + 2 * Math.PI * t / this.period, dM = 2 * Math.PI * 0.01 / this.period;
      this.offsetAt(M, _o); this.offsetAt(M + dM, _o2);
      this.position.copy(this.parent.position).add(_o);
      this.velocity.copy(this.parent.velocity).addScaledVector(_o2.sub(_o), 1 / 0.01);
    }
    this.rotation = this.spin * t;
    if (this.parent) { // clima: la temperatura di equilibrio scala con distanza^-1/2 (flusso ∝ 1/r²)
      const p = this.parent === this.star ? this : this.parent, ref = p.orbit.a, r = this.starDistance = p.position.distanceTo(this.star.position);
      const c = this.data.climate; if (c) this.temperature = c.meanTemp + c.equilibriumTemp * (Math.sqrt(ref / r) - 1);
    }
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