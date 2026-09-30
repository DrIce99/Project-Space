import * as THREE from 'three';
import { CelestialBody } from './CelestialBody.js';

export class SolarSystem {
  constructor(data){
    this.data = data;
    this.seed = data.seed;
    this.star = new CelestialBody({ ...data.star, orbit: null, rotation: { period: 240, tilt: 0, retro: false } }, null);
    this.star.pos.set(0, 0, 0);
    this.bodies = [this.star];
    this.byId = new Map([[this.star.id, this.star]]);
    for (const p of data.planets){
      const planet = new CelestialBody(p, this.star);
      this.bodies.push(planet); this.byId.set(p.id, planet);
      for (const m of p.moons){
        const moon = new CelestialBody(m, planet);
        this.bodies.push(moon); this.byId.set(m.id, moon);
      }
    }
    this.scene = new THREE.Group();
    for (const b of this.bodies) this.scene.add(b.group);
    this.home = this.pickHome();
  }

  pickHome(){
    const p = this.bodies.find(b => b.parent === this.star && b.def.habitability >= 40)
      ?? this.bodies.find(b => b.parent === this.star && b.def?.surface?.hasSurface)
      ?? this.bodies[1];
    return p;
  }

  update(t){
    for (const b of this.bodies) b.update(t);
  }

  get(id){ return this.byId.get(id); }
  get planets(){ return this.bodies.filter(b => b.parent === this.star && b !== this.star); }
  flatSolid(){ return this.bodies.filter(b => b.def?.surface?.hasSurface); }

  toJSON(){ return this.data; }
}