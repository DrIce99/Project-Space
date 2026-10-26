import { makeRng } from './Random.js';
import { Habitat } from '../systems/HabitabilitySystem.js';

// Biosfera di un corpo solido: statistiche della habitability sulla superficie e specie che la abitano.
// Non si simula l'evoluzione: ogni specie nasce in un punto reale della superficie (scelto con probabilità
// crescente con la habitability) e ne eredita nicchia e adattamenti. La complessità possibile dipende dalla
// habitability del luogo: dove arriva appena a 10 compaiono solo estremofili, foreste e animali solo oltre 50.
const SAMPLES = 600, LAND_DIVERSITY = 4;
const SYL = ['ka', 'lo', 've', 'ri', 'sa', 'tor', 'mi', 'qua', 'zel', 'ny', 'ar', 'o', 'eth', 'ul', 'pra', 'sin', 'dra', 'mo', 'cel', 'vy', 'thu', 'ne', 'io', 'gra'];
const SUFFIX = { flora: ['phylla', 'dendron', 'thamnus', 'carpa'], fungi: ['myces', 'cybe', 'phora'], aquatic: ['thys', 'nema', 'cystis'],
  terrestrial: ['pod', 'therium', 'saura', 'opus'], flying: ['ptera', 'ornis', 'pteryx'], extremophile: ['bacter', 'archaea', 'lithus'] };
const CATEGORY_LABEL = { flora: 'flora', fungi: 'funghi', aquatic: 'organismo acquatico', terrestrial: 'organismo terrestre',
  flying: 'organismo volante', extremophile: 'estremofilo' };
export { CATEGORY_LABEL };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Pigmento fotosintetico atteso sotto una stella di temperatura T: le piante assorbono la parte più
// abbondante dello spettro che arriva al suolo e riflettono il resto (ipotesi di Kiang et al., 2007).
// Nane rosse → pigmenti quasi neri; stelle K → rossi/arancio; tipo Sole → verdi; stelle F → verde-azzurri.
const PIGMENT = [[3200, [.05, .025, .06]], [3900, [.2, .05, .05]], [4700, [.4, .14, .04]], [5300, [.32, .3, .05]], [5800, [.1, .3, .06]], [6600, [.06, .24, .2]], [9000, [.05, .16, .26]]];
function pigmentFor(T) {
  if (T <= PIGMENT[0][0]) return PIGMENT[0][1];
  for (let i = 1; i < PIGMENT.length; i++) if (T <= PIGMENT[i][0]) {
    const [t0, c0] = PIGMENT[i - 1], [t1, c1] = PIGMENT[i];
    return mix(c0, c1, (T - t0) / (t1 - t0));
  }
  return PIGMENT[PIGMENT.length - 1][1];
}

function name(rng, category) {
  const syl = n => Array.from({ length: n }, () => SYL[Math.floor(rng() * SYL.length)]).join('');
  const genus = syl(2 + (rng() < .4 ? 1 : 0)), suf = SUFFIX[category];
  return genus[0].toUpperCase() + genus.slice(1) + ' ' + syl(1) + suf[Math.floor(rng() * suf.length)];
}

// Punti distribuiti uniformemente sulla sfera (spirale di Fibonacci)
function fibonacci(i, n, out) {
  const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963229728653;
  out.x = Math.cos(a) * r; out.y = y; out.z = Math.sin(a) * r;
  return out;
}

export function generateBiosphere(seed, D, terrain) {
  const hab = new Habitat(D, terrain), rng = makeRng(seed ^ 0x6c1fe);
  const pts = [], d = { x: 0, y: 0, z: 0 };
  let sum = 0, max = 0, above40 = 0, liquid = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const e = hab.sample(fibonacci(i, SAMPLES, d), {});
    pts.push({ T: e.T, water: e.water, H: e.habitability, liquid: e.liquid, elev: e.elev, light: e.light, radiation: e.radiation, swing: e.Tmax - e.Tmin });
    sum += e.habitability; max = Math.max(max, e.habitability); if (e.habitability >= 40) above40++; if (e.liquid) liquid++;
  }
  const stats = { mean: sum / SAMPLES, max, habitableFraction: above40 / SAMPLES, oceanFraction: liquid / SAMPLES };
  const bio = { stats, species: [] };
  if (max < 8) return bio;

  // numero di specie: cresce con la habitability massima e con l'estensione delle zone abitabili
  const n = clamp(Math.round(2 + 22 * (max / 100) ** 1.5 * (0.4 + 0.6 * Math.sqrt(stats.habitableFraction)) * (0.8 + 0.4 * rng())), 1, 26);
  // le terre emerse, più varie (quota, umidità, suolo), offrono più nicchie del mare: più specie a parità di habitability
  const weights = pts.map(p => p.H ** 3 * (p.liquid ? 1 : LAND_DIVERSITY)), total = weights.reduce((a, b) => a + b, 0);
  const pick = () => { let r = rng() * total; for (let i = 0; i < pts.length; i++) if ((r -= weights[i]) <= 0) return pts[i]; return pts[pts.length - 1]; };
  const P = D.atmosphere.pressure, g = D.gravityG ?? 1, pigment = pigmentFor(D.starTemp ?? 5778);

  for (let i = 0; i < n; i++) {
    const home = pick(), H = home.H;
    // categorie possibili in quel luogo, con il peso relativo
    const opts = home.liquid
      ? [['aquatic', H >= 20 ? 3 : 0], ['extremophile', H < 30 ? 1.5 : .3]]
      : [['extremophile', H >= 6 ? (H < 25 ? 3 : .5) : 0], ['fungi', H >= 22 ? 1 : 0], ['flora', H >= 22 ? 3.5 : 0],
        ['terrestrial', H >= 50 ? 1.6 : 0], ['flying', H >= 62 && P > .25 && g < 2.5 ? .9 : 0]];
    const tot = opts.reduce((a, [, w]) => a + w, 0);
    if (!tot) continue;
    let r = rng() * tot, category = opts[0][0];
    for (const [c, w] of opts) if ((r -= w) <= 0) { category = c; break; }
    bio.species.push(makeSpecies(rng, D, `${D.id}-s${i + 1}`, category, home, { P, g, pigment }));
  }
  // relazioni ecologiche: gli erbivori esistono solo se c'è flora, i predatori solo se ci sono prede
  const has = c => bio.species.some(s => s.category === c);
  for (const s of bio.species) if (s.category === 'terrestrial' || s.category === 'flying') {
    const prey = bio.species.some(o => o !== s && (o.category === 'terrestrial' || o.category === 'flying') && o.diet === 'erbivoro');
    s.diet = prey && rng() < .35 ? 'predatore' : has('flora') ? 'erbivoro' : has('fungi') ? 'fungivoro' : 'onnivoro';
    if (s.diet === 'predatore') s.abundance *= 0.4;
  }
  return bio;
}

function makeSpecies(rng, D, id, category, home, { P, g, pigment }) {
  const traits = [], cold = home.T < 265, hot = home.T > 312, dry = home.water < 0.3;
  const uv = home.radiation > 0.6, dark = home.light < 0.15, seasonal = home.swing > 40;
  if (cold) traits.push('resistente al gelo', 'metabolismo lento');
  if (hot) traits.push('dissipazione del calore');
  if (uv) traits.push('pigmenti schermanti contro le radiazioni');
  if (dry && !home.liquid) traits.push('conservazione dell\'acqua');
  if (g > 1.6) traits.push('struttura bassa e robusta'); else if (g < 0.5) traits.push('forme alte e slanciate');
  if (seasonal) traits.push('dormienza stagionale');
  const tall = 1 / Math.sqrt(Math.max(g, 0.2)); // la gravità limita l'altezza
  const sp = {
    id, name: name(rng, category), category, traits, form: '', size: 1, color: [.5, .5, .5], color2: [.3, .25, .2], glow: null,
    abundance: 0.4 + 0.6 * rng(), diet: '', activity: '',
    niche: { T: home.T, tolT: 12 + 10 * rng(), water: home.water, tolW: 0.25 + 0.2 * rng(), minH: Math.max(0, home.H * (0.5 + 0.2 * rng())),
      elev: home.liquid ? null : home.elev, aquatic: home.liquid }
  };
  const vary = c => c.map(v => clamp(v * (0.75 + 0.5 * rng()), 0, 1));
  const shade = (uv ? 0.65 : 1) * (dark ? 0.6 : 1);
  const phototroph = () => vary(pigment).map(v => v * shade);
  if (cold) sp.niche.tolT *= 1.3;

  switch (category) {
    case 'flora': {
      sp.diet = 'fotosintetico'; sp.color = phototroph(); sp.color2 = vary([.22, .15, .09]);
      if (home.H >= 52 && home.water > .3) {
        sp.form = cold ? 'tree-cone' : hot || dark ? 'tree-umbrella' : 'tree-round';
        sp.size = clamp((1.6 + 1.6 * rng()) * tall * (cold ? .8 : 1), 0.8, 4.5);
        if (dark) traits.push('chioma ampia per catturare la poca luce');
      } else if (home.H >= 38) {
        sp.form = dry ? 'succulent' : rng() < .5 ? 'shrub' : 'tuft';
        sp.size = (sp.form === 'tuft' ? 0.25 + 0.2 * rng() : 0.4 + 0.5 * rng()) * tall;
      } else { sp.form = rng() < .6 ? 'mat' : 'tuft'; sp.size = sp.form === 'mat' ? 0.3 + 0.3 * rng() : 0.15 + 0.15 * rng(); traits.push('crescita a cuscinetto'); }
      break;
    }
    case 'fungi': {
      sp.diet = 'decompositore'; sp.form = rng() < .5 ? 'cap' : 'cluster'; sp.size = (0.15 + 0.4 * rng()) * tall;
      sp.color = vary(rng() < .5 ? [.7, .62, .5] : [.45, .3, .45]); sp.color2 = vary([.8, .78, .7]);
      if (dark || rng() < .15) { sp.glow = vary([.15, .9, .75]); traits.push('bioluminescenza'); }
      break;
    }
    case 'extremophile': {
      sp.diet = home.light > 0.1 ? 'fotosintetico' : 'chemiosintetico';
      sp.form = cold && rng() < .5 ? 'crystal' : 'crust'; sp.size = sp.form === 'crust' ? 0.3 + 0.4 * rng() : 0.15 + 0.25 * rng();
      sp.color = vary(cold ? [.55, .2, .25] : hot ? [.65, .45, .08] : uv ? [.06, .05, .05] : pigment.map(v => v * 1.5));
      sp.niche.tolT *= 1.8; sp.niche.tolW += 0.2; sp.niche.minH = Math.max(0, home.H * 0.3);
      traits.push(cold ? 'antigelo cellulare' : hot ? 'proteine termostabili' : 'colonie in biofilm');
      break;
    }
    case 'aquatic': {
      const animal = home.H >= 40 && rng() < .5;
      sp.diet = animal ? (rng() < .5 ? 'filtratore' : 'predatore') : 'fotosintetico';
      sp.form = animal ? 'swimmer' : 'plankton'; sp.size = animal ? 0.3 + 1.5 * rng() : 0.01;
      sp.color = animal ? vary([.35, .45, .5]) : phototroph();
      if (dark) { sp.glow = vary([.1, .5, .9]); traits.push('bioluminescenza'); }
      if (animal && cold) traits.push('strato isolante di grasso');
      break;
    }
    case 'terrestrial': case 'flying': {
      const flying = category === 'flying';
      sp.form = flying ? 'flyer' : g > 1.6 ? 'hexapod' : g < 0.5 ? 'biped' : 'quadruped';
      sp.legs = { hexapod: 6, quadruped: 4, biped: 2, flyer: 0 }[sp.form];
      sp.size = flying ? (0.5 + 0.9 * rng()) * (P > 1.5 ? 1.25 : 1) : (0.4 + 1.1 * rng()) * Math.min(1.3, tall);
      const ground = D.color, base = [(ground >> 16 & 255) / 255, (ground >> 8 & 255) / 255, (ground & 255) / 255].map(v => v * v);
      sp.color = vary(mix(base, pigment.map(v => v * 1.6), 0.4)); sp.color2 = vary(rng() < .5 ? [.75, .7, .6] : [.2, .15, .12]);
      sp.speed = (flying ? 4 + 3 * rng() : 1 + 2.5 * rng()) / Math.sqrt(Math.max(g, 0.3));
      const Tday = home.T + home.swing * 0.3;
      sp.activity = hot || Tday > 315 ? 'notturna' : cold ? 'diurna' : ['diurna', 'notturna', 'crepuscolare'][Math.floor(rng() * 3)];
      if (cold) traits.push('pelliccia o piumaggio isolante');
      if (hot) traits.push('appendici per disperdere calore');
      if (flying && P > 1.5) traits.push('volo planato nell\'aria densa');
      if (sp.activity === 'notturna') traits.push('occhi adattati al buio');
      break;
    }
  }
  return sp;
}
