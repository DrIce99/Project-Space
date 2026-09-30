import { Color } from 'three';
import { makeRng } from './Random.js';
import { generateAtmosphere, finalizeAtmosphereOptics } from './AtmosphereGenerator.js';
const BASE = { terran: 0x5a7a4a, ocean: 0x2a5a9a, desert: 0xb88a55, rocky: 0x7d766f, icy: 0xcfe0e8, volcanic: 0x4a3028, metal: 0x69645e, gas: 0xc8a878 };
const ICE_GIANT = 0x86b4cc, HOT_JUPITER = 0x8a6448;
const RELIEF = { terran: .05, ocean: .04, desert: .045, rocky: .05, icy: .035, volcanic: .08, metal: .04 };
const ALBEDO = { terran: .3, ocean: .12, desert: .3, rocky: .14, icy: .6, volcanic: .12, metal: .1, gas: .34 };
export const EARTH_R = 60, EARTH_G = 8; // unità di gioco di un pianeta con raggio/gravità terrestri
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const logU = (rng, a, b) => a * (b / a) ** rng(); // distribuzione log-uniforme: masse e periodi coprono ordini di grandezza
const gauss = (x, m, s) => Math.exp(-(((x - m) / s) ** 2) / 2);

// Composizione di massa (frazioni) di fallback per dati vecchi senza composizione generata.
const COMPOSITION = {
  star: { hydrogen: .73, helium: .25, metals: .02 },
  gas: { gas: .88, water: .08, silicates: .03, iron: .01 },
  icy: { iron: .1, silicates: .4, water: .5 }, metal: { iron: .65, silicates: .35 }
};
export const compositionOf = type => ({ ...(COMPOSITION[type] ?? { iron: .3, silicates: .7 }) });

// Punto di ebollizione dell'acqua (K) alla pressione P (atm), da Clausius-Clapeyron (L/R ≈ 4880 K).
// Sotto il punto triplo (0.006 atm) l'acqua liquida non può esistere: ghiaccio o vapore.
export const TRIPLE_P = 0.006;
export const boilingPoint = P => 1 / (1 / 373 - Math.log(Math.max(P, TRIPLE_P)) / 4880);

// Raggio (raggi terrestri) dalla massa (masse terrestri) e dalla composizione. Solidi: relazione tipo
// Zeng et al. (più ferro → più compatto, più acqua/ghiaccio → più gonfio). Giganti: il raggio quasi non
// cresce con la massa (la pressione degenere comprime), i gioviani caldi sono gonfiati dal calore.
function radiusOf(M, f, Teq) {
  if (f.gas > .5) return 11.2 * (M < 318 ? (M / 318) ** .06 : (M / 318) ** -.04) * (Teq > 900 ? 1.25 : 1);
  if (f.gas > .05) return 3.9 * (M / 17) ** .2;
  return (1.07 - .21 * f.iron) * M ** (1 / 3.7) * (1 + .55 * f.water);
}

// Habitability continua 0-100 (media geometrica pesata). Per ora scalare sull'intero pianeta.
function habitability(T, A, cover, g) {
  const water = cover > 0 ? Math.min(1, 0.1 + cover * 1.5) : 0.03;
  let h = 100 * gauss(T, 288, 28) ** .35 * gauss(Math.log10(Math.max(A.pressure, 1e-4)), 0, .5) ** .2 * water ** .2
    * gauss(g, 1, .6) ** .1 * (0.2 + 0.8 * Math.min(1, A.oxygenLevel / 0.15)) ** .15;
  return h * (1 - 0.7 * A.toxicity);
}

const LABEL = {
  gasGiant: 'gigante gassoso', iceGiant: 'gigante ghiacciato', terran: 'pianeta terrestre', ocean: 'mondo oceanico',
  desert: 'mondo desertico', rocky: 'corpo roccioso', icy: 'corpo ghiacciato', volcanic: 'mondo vulcanico', metal: 'corpo ricco di metalli'
};

// Ogni corpo è generato dal PROPRIO seed (derivato da seed di sistema + id): stesso seed → stesso corpo,
// indipendentemente dall'ordine di generazione degli altri. Le proprietà sono una catena di cause:
// posizione (linea del ghiaccio) → classe e composizione → massa → raggio → densità, gravità, velocità di
// fuga → atmosfera trattenuta → effetto serra → temperatura → stato dell'acqua → superficie.
// ctx: { id, name, kind: 'planet'|'moon', au (distanza dalla stella, UA), L (luminosità), starMass (masse solari),
//        orbitalPeriod (s di gioco), parent (solo lune: dati del pianeta), q (solo lune: semiasse / raggio del pianeta) }
export function generatePlanet(seed, ctx) {
  const rng = makeRng(seed), { id, name, kind, au, L, parent } = ctx;
  const frost = 2.7 * Math.sqrt(L), cold = au > frost; // oltre la linea del ghiaccio l'acqua condensa: ghiacci e giganti

  // 1) classe, massa (M⊕) e composizione di massa
  let cls, M; const f = { iron: 0, silicates: 0, water: 0, gas: 0 };
  const r = rng();
  if (kind === 'moon') {
    const giant = parent.composition.gas > .05;
    cls = (cold || giant && au > frost * .6) && r < .75 ? 'icy' : 'rocky';
    M = logU(rng, .0003, clamp(parent.mass * .02, .0006, .05));
  } else if (cold) cls = r < .4 ? 'gasGiant' : r < .7 ? 'iceGiant' : r < .85 ? 'icy' : 'waterWorld';
  else cls = r < .04 ? 'gasGiant' : r < (au < .6 * Math.sqrt(L) ? .28 : .1) ? 'metal' : r < .2 ? 'waterWorld' : 'rocky';
  switch (cls) {
    case 'gasGiant': M = logU(rng, 25, 3000); f.gas = .8 + .15 * rng(); f.water = (1 - f.gas) * .6; break;
    case 'iceGiant': M = logU(rng, 6, 45); f.gas = .1 + .1 * rng(); f.water = .55 + .2 * rng(); break;
    case 'metal': M = logU(rng, .03, 3); f.iron = .55 + .2 * rng(); f.water = 10 ** (-4 - rng()); break;
    case 'waterWorld': M = logU(rng, .3, 10); f.iron = .2 + .1 * rng(); f.water = .1 + .3 * rng(); break;
    case 'icy': M ??= logU(rng, .005, .5); f.iron = .08 + .1 * rng(); f.water = .3 + .3 * rng(); break;
    default: M ??= logU(rng, .05, 12); f.iron = .2 + .2 * rng(); f.water = cold ? .03 + .1 * rng() : 10 ** (-4 + 2.4 * rng());
  }
  const rest = 1 - f.gas - f.water; if (!f.iron) f.iron = rest * .3; f.silicates = Math.max(0, rest - f.iron);

  // 2) grandezze fisiche reali (Terra = 1) e scala di gioco
  const giant = f.gas > .05, albedo0 = giant ? ALBEDO.gas : cls === 'icy' ? ALBEDO.icy : .2;
  const Teq0 = 278 * L ** .25 / Math.sqrt(au) * (1 - albedo0) ** .25;
  const R = radiusOf(M, f, Teq0), gG = M / R ** 2, density = 5.51 * M / R ** 3, vesc = 11.19 * Math.sqrt(M / R);
  // i giganti sono compressi in scala di gioco (R^0.7: Giove ≈ 5.4 raggi terrestri) per restare esplorabili; i solidi in scala reale
  const radius = Math.max(8, EARTH_R * (giant ? R ** 0.7 : R));

  // 3) orbita: i giganti hanno orbite quasi circolari, i corpi piccoli più eccentriche; lune quasi circolari
  const retro = kind === 'moon' && rng() < .12; // lune catturate: spesso retrograde e molto inclinate
  const orbit = {
    e: kind === 'moon' ? logU(rng, .0005, .06) : rng() ** 2 * (giant ? .1 : .25),
    inc: (rng() - .5) * (retro ? 1 : kind === 'moon' ? .2 : .12), phase: rng() * TAU,
    w: rng() * TAU, node: rng() * TAU, dir: retro ? -1 : 1
  };

  // 4) riscaldamento mareale (lune vicine a pianeti massicci, orbita forzata eccentrica): vulcani, oceani sotterranei
  const tidal = kind === 'moon' ? Math.sqrt(parent.mass / 100) * (4 / ctx.q) ** 3 * orbit.e / .02 : 0;
  const Ttidal = 20 * Math.min(tidal, 4);

  // 5) tipo di superficie (per i solidi) dalla composizione e dalla temperatura di equilibrio
  let type;
  const Tg = Teq0 + Ttidal, cover0 = clamp((Math.log10(Math.max(f.water, 1e-6)) + 3.7) / 2, 0, 1);
  if (giant) type = 'gas';
  else if (f.iron > .5) type = 'metal';
  else if (tidal > 1.5 && f.water < .25) type = 'volcanic';
  else if (f.water > .25 || (Tg < 200 && f.water > .02)) type = Tg < 255 ? 'icy' : 'ocean';
  else if (Tg > 480 || (M > 2 && rng() < .2)) type = rng() < .55 ? 'volcanic' : 'rocky';
  else if (M < .08) type = Tg < 230 && f.water > .005 ? 'icy' : 'rocky';
  else type = Tg < 215 ? 'icy' : cover0 > .8 ? 'ocean' : cover0 > .15 ? 'terran' : Tg > 240 && rng() < .6 ? 'desert' : 'rocky';

  // 6) atmosfera (trattenuta in base a velocità di fuga e temperatura) → effetto serra → temperatura superficiale
  const albedo = ALBEDO[type], Teq = 278 * L ** .25 / Math.sqrt(au) * (1 - albedo) ** .25 + Ttidal;
  // giganti: temperatura alla sommità delle nubi (equilibrio + calore interno residuo), non sotto migliaia di atm
  const A = generateAtmosphere(rng, type, gG, Teq, vesc), T = giant ? Teq * 1.12 : Teq + 500 * A.greenhouse;
  finalizeAtmosphereOptics(A, T, gG * EARTH_G, radius); // richiede la T reale (post-serra) e la gravità di gioco

  // 7) acqua superficiale: liquida solo fra 273 K e l'ebollizione alla pressione locale (atmosfera densa → più calda ma
  //    anche acqua liquida più a lungo); sotto il punto triplo sublima.
  const Tboil = boilingPoint(A.pressure), liquid = A.pressure > TRIPLE_P && T > 268 && T < Tboil;
  let cover = type === 'ocean' ? .85 + .13 * rng() : type === 'terran' ? .3 + .45 * cover0 : type === 'icy' ? (f.water > .2 ? .6 : .25) : 0;
  const traits = [];
  if (!giant && f.water > 1e-3 && T >= Tboil && A.pressure > 5) traits.push('effetto serra incontrollato');
  if ((type === 'ocean' || type === 'terran') && !liquid) {
    if (T < 268) type = 'icy'; else { type = A.pressure > 5 ? 'volcanic' : 'desert'; cover = 0; }
  }
  if (type === 'icy' && T > 273) cover = 0; // ghiaccio superficiale sublimato
  const relief = (RELIEF[type] ?? 0) / (1 + .12 * Math.sqrt(A.pressure) + (liquid ? .3 : 0)); // erosione da atmosfera e acqua

  // tratti combinati
  if (f.iron > .45) traits.push('ricco di metalli');
  if (cls === 'gasGiant' && T > 900) traits.push('gioviano caldo');
  if (!giant && M > 2) traits.push('super-Terra');
  if (cls === 'waterWorld') traits.push('acqua > 10% della massa');
  if (type === 'icy' && (tidal > .3 || f.water > .4 && M > .02)) traits.push('oceano sotterraneo');
  if (type === 'icy' && tidal > .8) traits.push('criovulcanismo');
  if (tidal > 1.5) traits.push('riscaldamento mareale');
  if (!giant && A.pressure < .001) traits.push('quasi senza atmosfera');
  if (!giant && A.pressure > 20) traits.push('atmosfera densissima');
  if (retro) traits.push('orbita retrograda');

  // 8) rotazione: i corpi vicini al corpo che orbitano vengono frenati dalle maree (rotazione sincrona o risonanza
  //    3:2 se l'orbita è eccentrica); i giganti ruotano in fretta; atmosfere densissime possono invertirla (tipo Venere).
  const P = ctx.orbitalPeriod, rot = { mode: 'free', tilt: 0, azimuth: rng() * TAU, phase: rng() * TAU, dir: 1 };
  const lockChance = kind === 'moon' ? .72 : clamp(1.5 - au / (.5 * ctx.starMass ** (1 / 3)), 0, .9);
  const t = rng();
  if (!giant && rng() < lockChance) { rot.mode = orbit.e > .1 && kind === 'planet' ? 'resonant' : 'locked'; rot.tilt = rng() * .04; }
  else if (kind === 'moon' && M < .004 && rng() < .45) { // piccole lune irregolari: rotazione caotica
    rot.mode = 'chaotic'; rot.period = logU(rng, 90, 400); rot.precPeriod = rot.period * (1.5 + 2 * rng());
    rot.precAxis = [rng() - .5, rng() - .5, rng() - .5]; rot.tilt = rng() * 1.2;
  } else {
    rot.tilt = t < .7 ? rng() * .45 : t < .9 ? .45 + rng() * .5 : .95 + rng() * .75;
    // periodi minimi alti: velocità al suolo di pochi u/s, così si può atterrare e il giorno si segue con calma
    rot.period = giant ? clamp(P / logU(rng, 20, 300), 150, 600) : clamp(P / logU(rng, 1.5, 60), 180, 2400);
    if (!giant && (A.pressure > 30 ? rng() < .5 : rng() < .07)) { rot.dir = -1; if (A.pressure > 30) rot.period *= 3; }
  }
  if (rot.mode === 'free' && rot.dir < 0) traits.push('rotazione retrograda');
  if (rot.mode === 'chaotic') traits.push('rotazione caotica');

  const swing = T * .5 * orbit.e + 15 * Math.sin(rot.tilt) + (A.pressure < .01 ? T * .35 : 0);
  const color = cls === 'iceGiant' ? ICE_GIANT : traits.includes('gioviano caldo') ? HOT_JUPITER : BASE[type];
  return {
    id, name, type, cls: giant ? cls : type, classLabel: giant ? LABEL[cls] : LABEL[type], traits,
    mass: M, realRadius: R, density, gravityG: gG, escapeVelocity: vesc, radius, gravity: gG * EARTH_G,
    composition: f, albedo, tidalHeating: tidal,
    color: new Color(color).offsetHSL((rng() - .5) * .06, 0, (rng() - .5) * .1).getHex(),
    orbit, rotation: rot, atmosphere: A, waterCoverage: cover, relief,
    climate: { equilibriumTemp: Teq, meanTemp: T, surfaceTemp: T, boilingPoint: Tboil, minTemp: T - swing, maxTemp: T + swing },
    habitability: giant ? 0 : habitability(T, A, liquid ? cover : 0, gG), moons: []
  };
}
