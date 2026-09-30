import { RNG, genName, ROMAN } from '../core/RNG.js';
import { SCALE } from '../config/Scale.js';
import { periodFrom } from '../physics/Kepler.js';
import { computeHabitability } from './Habitability.js';
import { POI_TYPES, poiText, poiName, echoChapter } from './LoreGen.js';
import { fbm3 } from './Noise3D.js';

// Generazione vincolata: il tipo determina intervalli plausibili di raggio,
// gravità, atmosfera e temperatura. Niente pianeti "a caso".
const TYPE_CONF = {
  terran:   { r: [3.8, 6.8], g: [7, 11.5] },
  ocean:    { r: [4.0, 7.2], g: [7, 11] },
  desert:   { r: [3.2, 6.0], g: [4, 9] },
  volcanic: { r: [3.5, 6.5], g: [6, 12] },
  rocky:    { r: [2.8, 5.5], g: [3.5, 9] },
  metallic: { r: [2.6, 4.8], g: [8, 14] },
  ice:      { r: [2.6, 5.8], g: [2.5, 6] },
  dwarf:    { r: [1.4, 2.6], g: [0.8, 2.5] },
  gas:      { r: [13, 22],   g: [14, 26] },
};

function randDir(rng){
  const z = rng.range(-1, 1), t = rng.range(0, Math.PI * 2), s = Math.sqrt(1 - z * z);
  return [s * Math.cos(t), z, s * Math.sin(t)];
}

function genStar(rng){
  const cls = rng.pick(['M', 'K', 'G', 'G', 'F']);
  const conf = { M: [3200, 0.18, 0xff8a5c], K: [4400, 0.55, 0xffb36b], G: [5600, 1.0, 0xffe9b8], F: [6600, 2.4, 0xf4f6ff] }[cls];
  return {
    id: 'star', name: genName(rng) + ' ' + cls, type: 'star', class: cls,
    tempK: conf[0], lum: conf[1] * rng.range(0.85, 1.2), color: conf[2],
    radius: rng.range(46, 78) * (cls === 'M' ? 0.6 : cls === 'F' ? 1.15 : 1),
    mass: rng.range(SCALE.STAR_MASS_MIN, SCALE.STAR_STar_MASS_MAX ?? SCALE.STAR_MASS_MAX),
  };
}

function pickType(rng, a, frost, hz){
  if (a < hz[0] * 0.55) return rng.pick(['volcanic', 'rocky', 'metallic', 'desert']);
  if (a <= hz[1]){
    const r = rng.next();
    if (r < 0.30) return 'terran';
    if (r < 0.45) return 'ocean';
    if (r < 0.62) return 'desert';
    if (r < 0.80) return 'rocky';
    return rng.pick(['metallic', 'volcanic']);
  }
  if (a < frost * 1.25) return rng.pick(['ice', 'rocky', 'gas', 'dwarf', 'dwarf']);
  return rng.next() < 0.45 ? 'gas' : (rng.next() < 0.6 ? 'ice' : 'dwarf');
}

function genAtmosphere(rng, type, temp, habZone){
  const mix = {};
  let pressure = 0, clouds = 0, toxicity = 0, color = 0x88aacc, opacity = 0;
  const add = (g, v) => { mix[g] = Math.round(v * 100) / 100; };
  if (type === 'gas'){
    add('H2', rng.range(0.75, 0.9)); add('He', rng.range(0.08, 0.2)); if (temp < 180) add('CH4', rng.range(0.02, 0.08));
    pressure = rng.range(40, 90); clouds = 0.5; opacity = 1; color = 0xd8c9a8;
  } else if (type === 'terran' || type === 'ocean'){
    add('N2', rng.range(0.68, 0.8)); add('O2', rng.range(0.16, 0.26)); add('H2O', rng.range(0.01, 0.05)); add('CO2', rng.range(0.001, 0.02));
    pressure = rng.range(0.7, 1.5); clouds = rng.range(0.4, type === 'ocean' ? 0.85 : 0.7);
    opacity = 0.8; color = type === 'ocean' ? 0x7fc4e8 : 0x9fc8e0;
  } else if (type === 'volcanic'){
    add('CO2', rng.range(0.6, 0.85)); add('SO2', rng.range(0.1, 0.25)); add('N2', rng.range(0.05, 0.2));
    pressure = rng.range(1.5, 5); toxicity = rng.range(0.6, 0.95); clouds = 0.3; opacity = 0.85; color = 0xc98a5a;
  } else if (type === 'desert'){
    add('CO2', rng.range(0.4, 0.8)); add('N2', rng.range(0.2, 0.5));
    pressure = rng.range(0.15, 0.8); clouds = rng.range(0, 0.15); opacity = 0.4; color = 0xd8b48a;
  } else if (type === 'ice' && rng.chance(0.6)){
    add('N2', rng.range(0.6, 0.9)); add('CH4', rng.range(0.05, 0.3));
    pressure = rng.range(0.05, 0.5); clouds = 0.1; opacity = 0.35; color = 0xbcd8ee;
  } else if (rng.chance(0.35)){
    add('CO2', rng.range(0.5, 0.9)); pressure = rng.range(0.02, 0.2); opacity = 0.2; color = 0x99aabb;
  }
  const gh = 150 * Math.min(pressure, 4) * ((mix.CO2 ?? 0) * 0.8 + (mix.CH4 ?? 0) * 1.6 + (mix.H2O ?? 0) * 0.5);
  return { composition: mix, pressure, clouds, toxicity, color, opacity, greenhouse: Math.min(gh, 400), scaleH: 0.055 };
}

function genPOIs(rng, bodyDef, echoIdx){
  const pois = [];
  if (!bodyDef.surface.hasSurface || bodyDef.type === 'dwarf') return pois;
  const n = rng.chance(0.75) ? rng.int(1, 3) : 0;
  const pool = ['monolith', 'wreck', 'ruin', 'signal', 'geyser'];
  if (bodyDef.type === 'volcanic') pool.push('geyser', 'geyser');
  if (bodyDef.habitability > 40) pool.push('ruin', 'signal');
  for (let i = 0; i < n; i++){
    const type = rng.pick(pool);
    pois.push({ type, name: poiName(rng), dir: randDir(rng), text: poiText(rng, type), echo: false });
  }
  if (echoIdx >= 0) pois.push({ type: 'signal', name: 'ECO-' + (echoIdx + 1), dir: randDir(rng), text: '', echo: true, echoIdx });
  return pois;
}

function genBody(rng, star, parentDef, a, type, idx){
  const conf = TYPE_CONF[type];
  const radius = rng.range(conf.r[0], conf.r[1]);
  const gravity = rng.range(conf.g[0], conf.g[1]);
  const mass = gravity * radius * radius / SCALE.G;
  const e = type === 'dwarf' ? rng.range(0.05, 0.3) : rng.range(0, 0.12);
  const inc = (rng.chance(0.85) ? rng.range(-0.1, 0.1) : rng.range(-0.35, 0.35));
  const orbit = {
    a, e, inc, omega: rng.range(0, Math.PI * 2), Omega: rng.range(0, Math.PI * 2),
    M0: rng.range(0, Math.PI * 2), period: periodFrom(a, parentDef.mass),
  };
  const locked = parentDef.type !== 'star' && rng.chance(0.7);
  const rotation = locked
    ? { period: orbit.period, tilt: rng.range(0, 0.3), retro: false, locked: true }
    : { period: rng.range(14, 90) * (type === 'gas' ? 0.35 : 1), tilt: rng.range(0, 0.6), retro: rng.chance(0.1), locked: false };

  const Teq = 278 * Math.pow(star.lum, 0.25) * Math.sqrt(400 / a);
  const isGas = type === 'gas';
  let atmosphere = isGas ? genAtmosphere(rng, type, Teq) : genAtmosphere(rng, type, Teq);
  const surfaceTemp = Teq + atmosphere.greenhouse;

  const amp = radius * rng.range(0.02, 0.05) * (isGas ? 0 : 1);
  const ocean = type === 'ocean' || (type === 'terran' && rng.chance(0.6));
  const surface = {
    hasSurface: !isGas,
    ocean, sea: amp * 0.04, amp,
    noiseSeed: rng.int(1, 2 ** 31), rough: rng.range(0.03, 0.09) * radius,
  };

  const name = genName(rng);
  const def = {
    id: (parentDef.type === 'star' ? 'p' : 'm') + idx + '_' + name.toLowerCase(),
    name, type, seed: rng.int(1, 2 ** 31), radius, mass, gravity,
    orbit, rotation,
    temperature: { equilibrium: Math.round(Teq), surface: Math.round(surfaceTemp) },
    atmosphere, surface,
    climate: {
      wind: Math.round(20 * (atmosphere.pressure ** 0.5) * (90 / Math.max(rotation.period, 8))),
      storms: Math.round(100 * Math.min(1, atmosphere.pressure * 0.35 * (surfaceTemp > 260 ? 1 : 0.3) * (ocean ? 1.2 : 0.5))),
      fog: Math.round(100 * Math.min(1, (atmosphere.composition.H2O ?? 0) * 8 * (ocean ? 1 : 0.3))),
      precipitation: ocean && surfaceTemp > 245 && surfaceTemp < 330 ? 'pioggia' : surfaceTemp < 245 && atmosphere.pressure > 0.2 ? 'neve' : '—',
    },
    _lum: star.lum,
    biosphere: null, pois: [], moons: [],
  };
  def.habitability = computeHabitability(def);
  def.biosphere = buildBiosphere(rng, def);
  return def;
}

function buildBiosphere(rng, def){
  const h = def.habitability;
  if (h < 25) return { floraDensity: 0, categories: [] };
  const cats = ['flora microbica'];
  if (h >= 40) cats.push(def.temperature.surface < 250 ? 'licheni criofili' : 'tappeti fungini');
  if (h >= 55) cats.push('flora strutturale', def.surface.ocean ? 'organismi acquatici' : 'organismi del suolo');
  if (h >= 70) cats.push('organismi volanti', 'fauna complessa');
  if (def.type === 'volcanic') cats.push('estremofili termali');
  return { floraDensity: Math.min(1, (h - 25) / 60), categories: cats };
}

export function generateSystem(seed){
  const rng = new RNG(typeof seed === 'string' ? RNG.fromString(seed) : (seed >>> 0));
  const star = genStar(rng);
  const frost = 900 * Math.sqrt(star.lum);
  const hz = [420 * Math.sqrt(star.lum), 820 * Math.sqrt(star.lum)];

  const planets = [];
  let a = rng.range(230, 300);
  const n = rng.int(5, 8);
  for (let i = 0; i < n; i++){
    if (i > 0) a *= rng.range(1.35, 1.7);
    const def = genBody(rng, star, star, a, pickType(rng, a, frost, hz), i);
    const nMoons = def.type === 'gas' ? rng.int(2, 4) : def.type === 'dwarf' ? rng.int(0, 1) : rng.int(0, 2);
    for (let m = 0; m < nMoons; m++){
      const mType = def.temperature.surface < 200 ? 'ice' : 'rocky';
      const moon = genBody(rng, star, def, def.radius * rng.range(5, 22), mType, i * 8 + m);
      moon.radius = Math.min(moon.radius, def.radius * rng.range(0.14, 0.3));
      moon.mass = moon.gravity * moon.radius * moon.radius;
      moon.orbit.period = periodFrom(moon.orbit.a, def.mass);
      moon.name = def.name + ' ' + ROMAN[m];
      moon.id = def.id + '_m' + m;
      moon.habitability = computeHabitability(moon);
      moon.biosphere = buildBiosphere(rng, moon);
      moon.pois = genPOIs(rng, moon, -1);
      def.moons.push(moon);
    }
    def.pois = genPOIs(rng, def, -1);
    planets.push(def);
  }

  // Garanzia di qualità del seed: almeno un mondo interessante nella fascia abitabile.
  if (!planets.some(p => p.habitability >= 45)){
    const best = planets.reduce((c, p) => Math.abs(p.orbit.a - (hz[0] + hz[1]) / 2) < Math.abs(c.orbit.a - (hz[0] + hz[1]) / 2) ? p : c);
    best.type = 'terran'; best.atmosphere = genAtmosphere(rng, 'terran', best.temperature.equilibrium);
    best.temperature.surface = Math.round(best.temperature.equilibrium + best.atmosphere.greenhouse);
    best.surface.ocean = true;
    best.habitability = computeHabitability(best);
    best.biosphere = buildBiosphere(rng, best);
  }

  // Tre "echi" narrativi distribuiti su corpi solidi diversi.
  const solids = planets.filter(p => p.surface.hasSurface);
  for (let i = 0; i < 3 && solids.length; i++){
    const target = solids[(i * 2 + rng.int(0, solids.length - 1)) % solids.length];
    target.pois.push({ type: 'signal', name: 'ECO-' + (i + 1), dir: randDir(rng), text: echoChapter(i, { planet: target.name, star: star.name }), echo: true, echoIdx: i });
  }

  const belt = rng.chance(0.8) ? { a: planets.length > 3 ? (planets[2].orbit.a + planets[3].orbit.a) / 2 : a * 1.2, width: 90, count: 420, seed: rng.int(1, 2 ** 31) } : null;
  return { version: 1, seed, star, planets, belt, frostLine: frost, habitableZone: hz };
}

export { fbm3 };