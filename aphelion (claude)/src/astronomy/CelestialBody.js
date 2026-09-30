import { Vector3, Quaternion, Matrix4 } from 'three';
import { TerrainGenerator, hashSeed } from '../generation/TerrainGenerator.js';
import { G } from '../physics/Gravity.js';
import { compositionOf } from '../generation/PlanetGenerator.js';
const _o = new Vector3(), _o2 = new Vector3(), _l = new Vector3(), _qi = new Quaternion(), _qa = new Quaternion(), _qb = new Quaternion();
const _Y = new Vector3(0, 1, 0), _Z = new Vector3(0, 0, 1), _P = new Vector3(), _Q = new Vector3(), _N = new Vector3(), _m = new Matrix4();
const TAU = 2 * Math.PI;

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
    if (this.orbit) {
      this.period = TAU * Math.sqrt(this.orbit.a ** 3 / parent.mu); // Kepler
      this.soi = Math.max(this.orbit.a * (this.mu / parent.mu) ** 0.4, this.radius * 3);
    } else this.soi = Infinity;
    this.setupRotation(d.rotation ?? { period: 0, tilt: 0 });
  }
  // Modi di rotazione (asse Y locale = asse di rotazione):
  //  free      periodo proprio, asse inclinato di tilt verso l'azimut dato, verso dir (±1: retrograda)
  //  locked    sincrona: un emisfero rivolto sempre al corpo attorno a cui orbita; ruota uniformemente
  //            (anomalia media) quindi su orbite eccentriche compare la librazione in longitudine
  //  resonant  risonanza spin-orbita (default 3:2, tipo Mercurio): 3 rotazioni ogni 2 orbite
  //  chaotic   asse che precede attorno a un secondo asse (tumbling, tipo Iperione)
  setupRotation(rot) {
    this.rotMode = rot.mode ?? (rot.period === null ? 'locked' : 'free');
    if (!this.orbit && this.rotMode !== 'free' && this.rotMode !== 'chaotic') this.rotMode = 'free';
    this.axis = new Vector3(); this.omega = new Vector3(); this.frame = new Quaternion(); this.rot = rot;
    this.rotPhase = rot.phase ?? 0;
    if (this.rotMode === 'locked' || this.rotMode === 'resonant') {
      this.ratio = this.rotMode === 'locked' ? 1 : rot.ratio ?? 1.5;
      // base orbitale: X = periastro (verso opposto al genitore), Y = normale (momento angolare), -Z = direzione del moto
      const dir = this.orbit.dir ?? 1;
      this.toSpace(1, 0, _P).normalize(); this.toSpace(0, dir, _Q).normalize(); _N.crossVectors(_P, _Q);
      this.frame.setFromRotationMatrix(_m.makeBasis(_P, _N, _Q.negate()));
      this.spin = this.ratio * TAU / this.period;
    } else {
      this.frame.setFromAxisAngle(_Y, rot.azimuth ?? 0).multiply(_qa.setFromAxisAngle(_Z, -(rot.tilt ?? 0)));
      this.spin = rot.period ? (rot.dir ?? 1) * TAU / rot.period : 0;
      if (this.rotMode === 'chaotic') {
        this.precAxis = new Vector3(...(rot.precAxis ?? [1, 0, 0])).normalize();
        this.precRate = TAU / (rot.precPeriod ?? 60);
      }
    }
    this.axis.copy(_Y).applyQuaternion(this.frame);
    this.tilt = Math.acos(Math.min(1, Math.abs(this.axis.y))); // obliquità rispetto al piano di riferimento
  }
  get rotationSpeed() { return this.spin; }
  get rotationPeriod() { return this.spin ? TAU / Math.abs(this.spin) : Infinity; } // siderale
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
    return this.toSpace(a * (Math.cos(E) - e), dir * a * Math.sqrt(1 - e * e) * Math.sin(E), out);
  }
  // Da coordinate nel piano orbitale (perifocali) allo spazio
  toSpace(px, py, out) {
    const { inc, w = 0, node = 0 } = this.orbit;
    const x = px * Math.cos(w) - py * Math.sin(w), y = px * Math.sin(w) + py * Math.cos(w);
    const X = x, Y = y * Math.sin(inc), Z = y * Math.cos(inc), cn = Math.cos(node), sn = Math.sin(node);
    return out.set(X * cn + Z * sn, Y, Z * cn - X * sn);
  }
  get periapsis() { return this.orbit ? this.orbit.a * (1 - this.orbit.e) : 0; }
  get apoapsis() { return this.orbit ? this.orbit.a * (1 + this.orbit.e) : 0; }
  update(t) {
    if (this.orbit) {
      const M = this.meanAnomaly = this.orbit.phase + TAU * t / this.period, dM = TAU * 0.01 / this.period;
      this.offsetAt(M, _o); this.offsetAt(M + dM, _o2);
      this.position.copy(this.parent.position).add(_o);
      this.velocity.copy(this.parent.velocity).addScaledVector(_o2.sub(_o), 1 / 0.01);
    }
    if (this.parent) { // clima: la temperatura di equilibrio scala con distanza^-1/2 (flusso ∝ 1/r²)
      const p = this.parent === this.star ? this : this.parent, ref = p.orbit.a, r = this.starDistance = p.position.distanceTo(this.star.position);
      const c = this.data.climate; if (c) this.temperature = c.meanTemp + c.equilibriumTemp * (Math.sqrt(ref / r) - 1);
    }
    if (this.rotMode === 'locked' || this.rotMode === 'resonant') this.rotation = this.ratio * this.meanAnomaly + (this.ratio === 1 ? 0 : this.rotPhase);
    else this.rotation = this.spin * t + this.rotPhase;
    this.quaternion.copy(this.frame).multiply(_qb.setFromAxisAngle(_Y, this.rotation));
    if (this.rotMode === 'chaotic') { // precessione dell'asse: ω = ωp·asse_precessione + ω·asse_istantaneo
      this.quaternion.premultiply(_qa.setFromAxisAngle(this.precAxis, this.precRate * t));
      this.axis.copy(_Y).applyQuaternion(_qa.multiply(this.frame));
      this.omega.copy(this.axis).multiplyScalar(this.spin).addScaledVector(this.precAxis, this.precRate);
    } else this.omega.copy(this.axis).multiplyScalar(this.spin);
  }
  // Raggio del suolo sotto un punto del mondo (terreno deterministico nel frame del corpo)
  groundRadiusAt(p) {
    if (!this.terrain) return this.radius;
    _l.subVectors(p, this.position).applyQuaternion(_qi.copy(this.quaternion).invert()).normalize();
    return this.radius + this.terrain.heightAt(_l.x, _l.y, _l.z);
  }
  // Velocità di un punto solidale alla superficie (rotazione + moto orbitale)
  velocityAt(p, out) {
    _l.subVectors(p, this.position);
    return out.crossVectors(this.omega, _l).add(this.velocity);
  }
}