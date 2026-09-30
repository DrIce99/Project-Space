import * as THREE from 'three';
import { orbitalState } from '../physics/Kepler.js';
import { fbm3, ridge3 } from '../generation/Noise3D.js';

const _rel = new THREE.Vector3();
const _relV = new THREE.Vector3();

export class CelestialBody {
  constructor(def, parent = null){
    this.def = def;
    this.id = def.id; this.name = def.name; this.type = def.type;
    this.parent = parent;
    this.radius = def.radius; this.mass = def.mass;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.spinAngle = 0;
    this.group = new THREE.Group();         // traslazione (posizione mondo)
    this.tiltGroup = new THREE.Group();     // inclinazione assiale
    this.spinGroup = new THREE.Group();     // rotazione propria
    this.group.add(this.tiltGroup); this.tiltGroup.add(this.spinGroup);
    if (def.rotation){
      this.tiltGroup.quaternion.setFromEuler(new THREE.Euler(0, 0, def.rotation.tilt));
      this._spinDir = def.rotation.retro ? -1 : 1;
    }
    this.surface = null;      // assegnato da PlanetSurface
    this.atmoMesh = null; this.cloudMesh = null; this.poiMeshes = [];
    this.visualExtras = [];
  }

  update(t){
    if (this.parent){
      orbitalState(this.def.orbit, t, _rel, _relV);
      this.pos.copy(this.parent.pos).add(_rel);
      this.vel.copy(this.parent.vel).add(_relV);
    }
    if (this.def.rotation){
      const r = this.def.rotation;
      this.spinAngle = r.locked && this.parent
        ? -(Math.PI * 2 * this.def.orbit.M0 / (Math.PI * 2)) // fase bloccata gestita sotto
        : (t / r.period) * Math.PI * 2 * this._spinDir;
      if (r.locked) this.spinAngle = ((this.def.orbit.M0 + (Math.PI * 2 * t) / r.period) % (Math.PI * 2)) + Math.PI;
      this.spinGroup.rotation.y = this.spinAngle;
    }
  }

  // Altezza del terreno lungo una direzione LOCALE (frame di spin).
  terrainHeight(dirLocal){
    const s = this.def.surface;
    if (!s?.hasSurface) return 0;
    const x = dirLocal.x, y = dirLocal.y, z = dirLocal.z;
    const cont = fbm3(s.noiseSeed, x * 1.6, y * 1.6, z * 1.6, 5);
    const mnt = ridge3(s.noiseSeed + 7, x * 4.1, y * 4.1, z * 4.1, 4);
    const det = fbm3(s.noiseSeed + 3, x * 11, y * 11, z * 11, 3);
    return s.amp * (0.62 * cont + 0.55 * Math.max(0, cont) * (mnt - 0.5)) + s.rough * det;
  }

  surfaceRadiusAt(dirLocal){ return this.radius + this.terrainHeight(dirLocal); }

  // Densità atmosferica esponenziale in un punto mondo.
  atmosphereDensityAt(worldPos){
    const at = this.def.atmosphere;
    if (!at || at.pressure <= 0.01) return 0;
    const alt = worldPos.distanceTo(this.pos) - this.radius;
    const H = this.radius * at.scaleH;
    if (alt > H * 8 || alt < 0) return alt < 0 ? at.pressure * 3 : 0;
    return at.pressure * Math.exp(-alt / H);
  }

  toJSON(){ return this.def; }
}