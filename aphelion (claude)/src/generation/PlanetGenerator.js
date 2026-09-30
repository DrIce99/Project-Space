import { Color } from 'three';
import { generateAtmosphere, finalizeAtmosphereOptics } from './AtmosphereGenerator.js';
const BASE = { terran: 0x5a7a4a, ocean: 0x2a5a9a, desert: 0xb88a55, rocky: 0x7d766f, icy: 0xcfe0e8, volcanic: 0x4a3028, gas: 0xc8a878 };
const RELIEF = { terran: .05, ocean: .04, desert: .045, rocky: .05, icy: .035, volcanic: .08 };
const EARTH_R = 50, EARTH_G = 8; // unità di gioco di un pianeta con raggio/gravità terrestri
const gauss = (x, m, s) => Math.exp(-(((x - m) / s) ** 2) / 2);

// Habitability continua 0-100 (media geometrica pesata). Per ora scalare sull'intero pianeta.
function habitability(T, A, cover, g) {
  const water = T > 273 && T < 373 ? Math.min(1, 0.1 + cover * 1.5) : 0.03;
  let h = 100 * gauss(T, 288, 28) ** .35 * gauss(Math.log10(Math.max(A.pressure, 1e-4)), 0, .5) ** .2 * water ** .2
    * gauss(g, 1, .6) ** .1 * (0.2 + 0.8 * Math.min(1, A.oxygenLevel / 0.15)) ** .15;
  return h * (1 - 0.7 * A.toxicity);
}

// au: distanza dalla stella in UA; L: luminosità; kind: 'planet' | 'moon'
export function generatePlanet(rng, { id, name, au, L, kind }) {
  const Teq = 278 * L ** 0.25 / Math.sqrt(au);
  let type, mass, Rr, gr;
  if (kind === 'planet' && rng() < (au > 1.3 ? 0.55 : 0.1)) { type = 'gas'; Rr = 2 + rng() * 1.6; gr = 1 + rng() * 1.5; }
  else {
    mass = 10 ** (kind === 'moon' ? -3.2 + 1.7 * rng() : -1.2 + 2 * rng()); Rr = mass ** 0.27; gr = mass / Rr ** 2;
    const r = rng();
    type = Teq < 200 ? 'icy' : Teq > 430 ? (r < .5 ? 'volcanic' : 'rocky')
      : (kind === 'moon' || mass < 0.25) ? (Teq < 250 ? 'icy' : 'rocky')
      : Teq > 315 ? (r < .6 ? 'desert' : 'rocky') : r < .35 ? 'terran' : r < .6 ? 'ocean' : r < .8 ? 'desert' : 'rocky';
  }
  const radius = Math.max(8, Rr * EARTH_R); mass = gr * (radius / EARTH_R) ** 2;
  const A = generateAtmosphere(rng, type, gr, Teq), T = Teq + 500 * A.greenhouse;
  finalizeAtmosphereOptics(A, T, gr * EARTH_G, radius); // richiede la T reale (post-serra) e la gravità di gioco
  let cover = { terran: .3 + .4 * rng(), ocean: .85 + .13 * rng(), icy: rng() < .5 ? .25 : 0 }[type] ?? 0;
  if (T >= 373) cover = 0;
  const tilt = rng() < .15 ? .8 + rng() * .7 : rng() * .5, e = kind === 'moon' ? rng() * .05 : rng() ** 2 * .25, swing = T * .5 * e + 15 * Math.sin(tilt);
  return {
    id, name, type, mass, radius, gravity: gr * EARTH_G,
    color: new Color(BASE[type]).offsetHSL((rng() - .5) * .06, 0, (rng() - .5) * .1).getHex(),
    orbit: { e, inc: (rng() - .5) * (kind === 'moon' ? .3 : .12), phase: rng() * Math.PI * 2 },
    rotation: { period: (au < .6 || kind === 'moon') && rng() < .7 ? null : 40 + rng() * 160, tilt },
    atmosphere: A, waterCoverage: cover, relief: RELIEF[type] ?? 0,
    climate: { equilibriumTemp: Teq, meanTemp: T, minTemp: T - swing, maxTemp: T + swing },
    habitability: type === 'gas' ? 0 : habitability(T, A, cover, gr), moons: []
  };
}