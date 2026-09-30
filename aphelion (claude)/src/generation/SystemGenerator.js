import { makeRng } from './Random.js';
import { generatePlanet } from './PlanetGenerator.js';
import { generateStar } from './StarGenerator.js';
import { hashSeed } from './TerrainGenerator.js';
export const AU = 6000; // unità di gioco per 1 UA (temperatura di equilibrio, irraggiamento stellare)
const NAMES = ['Cinder', 'Aster', 'Brume', 'Corva', 'Dune', 'Elyra', 'Fenn', 'Galt', 'Hollow', 'Ilex', 'Juno', 'Kessel'];
const period = (a, mu) => 2 * Math.PI * Math.sqrt(a ** 3 / mu);

// Sistema completo serializzabile (JSON) a partire dal solo seed. Il seed di sistema decide stella, numero e
// spaziatura delle orbite; ogni corpo è poi generato dal proprio seed derivato (seed di sistema + id).
export function generateSystem(seed) {
  const rng = makeRng(seed), pool = [...NAMES], planets = [];
  const star = generateStar(rng), L = star.luminosity, base = { L, starMass: star.massRatio };
  let a = 2500 + rng() * 750;
  for (let i = 0, n = 4 + Math.floor(rng() * 3); i < n; i++, a *= 1.55 + rng() * .25) {
    const id = `p${i + 1}`, name = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const p = generatePlanet(hashSeed(seed, id), { ...base, id, name, kind: 'planet', au: a / AU, orbitalPeriod: period(a, star.mu) });
    p.orbit.a = a;
    const mu = p.gravity * p.radius ** 2, soi = a * (mu / star.mu) ** 0.4, lo = p.radius * (p.type === 'gas' ? 4.5 : 3) + 40, hi = soi * 0.6; // lune non troppo strette: orbite più lente
    const count = hi - lo < 15 ? 0 : p.type === 'gas' ? 1 + Math.floor(rng() * 3) : Math.floor(rng() * 2.2);
    for (let k = 0; k < count; k++) {
      const mid = `${id}m${k + 1}`, am = lo + (hi - lo) * (k + 0.3 + rng() * 0.6) / count;
      const m = generatePlanet(hashSeed(seed, mid), { ...base, id: mid, name: `${name} ${'abc'[k]}`, kind: 'moon', au: a / AU,
        parent: p, q: am / p.radius, orbitalPeriod: period(am, mu) });
      m.orbit.a = am;
      p.moons.push(m);
    }
    planets.push(p);
  }
  return { seed, star, planets };
}
