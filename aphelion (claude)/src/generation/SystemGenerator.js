import { makeRng } from './Random.js';
import { generatePlanet } from './PlanetGenerator.js';
import { generateStar } from './StarGenerator.js';
export const AU = 4000; // unità di gioco per 1 UA (temperatura di equilibrio, irraggiamento stellare)
const NAMES = ['Cinder', 'Aster', 'Brume', 'Corva', 'Dune', 'Elyra', 'Fenn', 'Galt', 'Hollow', 'Ilex', 'Juno', 'Kessel'];

// Sistema completo serializzabile (JSON) a partire dal solo seed.
export function generateSystem(seed) {
  const rng = makeRng(seed), pool = [...NAMES], planets = [];
  const star = generateStar(rng), L = star.luminosity;
  let a = 1700 + rng() * 500;
  for (let i = 0, n = 4 + Math.floor(rng() * 3); i < n; i++, a *= 1.55 + rng() * .25) {
    const p = generatePlanet(rng, { id: `p${i + 1}`, name: pool.splice(Math.floor(rng() * pool.length), 1)[0], au: a / AU, L, kind: 'planet' });
    p.orbit.a = a;
    const mu = p.gravity * p.radius ** 2, soi = a * (mu / star.mu) ** 0.4, lo = p.radius * 2.5 + 20, hi = soi * 0.6;
    const count = hi - lo < 15 ? 0 : p.type === 'gas' ? 1 + Math.floor(rng() * 3) : Math.floor(rng() * 2.2);
    for (let k = 0; k < count; k++) {
      const m = generatePlanet(rng, { id: `${p.id}m${k + 1}`, name: `${p.name} ${'abc'[k]}`, au: a / AU, L, kind: 'moon' });
      m.orbit.a = lo + (hi - lo) * (k + 0.3 + rng() * 0.6) / count;
      p.moons.push(m);
    }
    planets.push(p);
  }
  return { seed, star, planets };
}