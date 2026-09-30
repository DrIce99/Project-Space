import { CelestialBody } from './CelestialBody.js';

export class SolarSystem {
  constructor(data) {
    this.data = data;
    this.star = new CelestialBody(data.star);
    this.bodies = [this.star]; // ordine: genitori prima dei figli
    for (const p of data.planets) {
      const b = new CelestialBody(p, this.star, data.seed); this.bodies.push(b);
      for (const m of p.moons ?? []) { const mb = new CelestialBody(m, b, data.seed); b.moons.push(mb); this.bodies.push(mb); }
    }
  }
  update(t) { for (const b of this.bodies) b.update(t); }
  toJSON() { return this.data; }
}