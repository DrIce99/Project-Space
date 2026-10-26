import { dailyInsolation } from '../astronomy/Climate.js';
import { TRIPLE_P } from '../generation/PlanetGenerator.js';

// Habitability locale (0-100) di un punto della superficie: media geometrica pesata di fattori continui
// in [0, 1]. Un fattore vicino a 0 (niente acqua, temperatura estrema) azzera il risultato anche se gli
// altri sono ottimi: è il fattore limitante a decidere, come per la vita reale. Tutto configurabile qui.
export const HABITABILITY = {
  // esponente di ciascun fattore: più alto = più limitante
  weights: { temperature: .7, water: .6, pressure: .25, atmosphere: .35, radiation: .4, light: .35, nutrients: .3, stability: .25, gravity: .15 },
  tiers: [[0, 'completamente sterile'], [10, 'vita estremamente improbabile'], [25, 'vita semplice possibile'],
    [40, 'ecosistema primitivo'], [60, 'ecosistema complesso'], [80, 'condizioni altamente favorevoli']],
  optimalTemp: 292, // K
  lapse: 30 // K di raffreddamento sulla quota massima del rilievo, a gravità e pressione terrestri
};
export const FACTOR_LABELS = { temperature: 'temperatura', water: 'acqua', pressure: 'pressione', atmosphere: 'atmosfera',
  radiation: 'radiazione', light: 'luce', nutrients: 'nutrienti', stability: 'stabilità', gravity: 'gravità' };

export function tierOf(h) {
  let label = HABITABILITY.tiers[0][1];
  for (const [min, name] of HABITABILITY.tiers) if (h >= min) label = name;
  return label;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ROWS = 65, SEASONS = 12;

// Modello ambientale di un corpo solido, costruito dai suoi dati generati e dal suo terreno deterministico.
// sample(dir) restituisce l'ambiente medio annuo nel punto (dir: versore nel frame del corpo, asse Y = asse
// di rotazione): stessi risultati per la generazione della vita, il colore della superficie, la vegetazione,
// la fauna e l'HUD, perché tutti derivano da qui.
export class Habitat {
  constructor(D, terrain) {
    const A = D.atmosphere, P = A.pressure, comp = A.composition ?? {};
    this.data = D; this.terrain = terrain; this.type = D.type;
    this.species = D.biosphere?.species ?? [];
    this.P = P; this.Tboil = D.climate.boilingPoint;
    this.ground = colorArray(D.color);
    // lato giorno fisso: pianeti sincroni con la stella (le lune sincrone col pianeta hanno comunque giorno e notte)
    this.lockedToStar = D.kind === 'planet' && D.rotation?.mode === 'locked';
    const damp = 0.1 + 0.8 / (1 + P), T0 = D.climate.meanTemp, tilt = D.rotation?.tilt ?? 0;
    const Tq = q => T0 * (1 + damp * (Math.max(q, 0.02) ** 0.25 - 1));
    // tabelle per coordinata c in [-1, 1] (seno della latitudine, o coseno dal punto substellare se sincrono)
    this.tMean = new Float32Array(ROWS); this.tMin = new Float32Array(ROWS); this.tMax = new Float32Array(ROWS); this.qMean = new Float32Array(ROWS);
    for (let i = 0; i < ROWS; i++) {
      const c = -1 + 2 * i / (ROWS - 1);
      let qm = 0, qlo = Infinity, qhi = -Infinity;
      if (this.lockedToStar) qm = qlo = qhi = 4 * Math.max(0, c);
      else for (let k = 0; k < SEASONS; k++) {
        const q = dailyInsolation(Math.asin(c), tilt * Math.sin(2 * Math.PI * k / SEASONS));
        qm += q / SEASONS; qlo = Math.min(qlo, q); qhi = Math.max(qhi, q);
      }
      this.qMean[i] = qm; this.tMean[i] = Tq(qm); this.tMin[i] = Tq(qlo); this.tMax[i] = Tq(qhi);
    }
    this.lapse = HABITABILITY.lapse * (P > 0.01 ? 1 : 0.3) * (D.gravityG ?? 1) / Math.max(terrain.amp, 1e-3);
    this.seaRef = terrain.sea > -1e8 ? terrain.sea : -0.6 * terrain.amp;
    // acqua disponibile sulle terre emerse: dagli oceani (evaporazione), altrimenti ghiaccio o tracce
    this.hydro = P < TRIPLE_P ? 0 : D.waterCoverage > 0 ? Math.min(1, 0.35 + D.waterCoverage) : D.type === 'icy' ? 0.15 : D.type === 'desert' ? 0.08 : 0.04;
    // luce al suolo: flusso stellare (L/d²) attenuato dallo spessore ottico dell'atmosfera
    const tau = A.tauR ? (A.tauR[0] + A.tauR[1] + A.tauR[2]) / 3 + (A.tauM ?? 0) : 0;
    this.flux = D.flux ?? 1; this.surfLight = this.flux * Math.exp(-0.3 * tau);
    // UV: cresce ripidamente con la temperatura della stella; schermato dalla colonna di gas (l'O2 forma ozono)
    this.uvTop = this.flux * ((D.starTemp ?? 5778) / 5778) ** 4.5;
    this.uvShield = Math.exp(-0.37 * P * (1 + 20 * (comp.O2 ?? 0)));
    // fattori costanti sull'intero corpo
    this.fPressure = P < 1e-6 ? 0 : Math.exp(-(Math.log10(P) ** 2) / (2 * 0.8 ** 2));
    this.fAtmosphere = (0.4 + 0.6 * smooth(A.oxygenLevel ?? 0, 0.01, 0.15)) * (1 - 0.85 * (A.toxicity ?? 0));
    this.fGravity = Math.exp(-(Math.log2(Math.max(D.gravityG ?? 1, 0.01)) ** 2) / (2 * 1.5 ** 2));
    const e = D.orbit?.e ?? 0, fluxSwing = ((1 + e) / (1 - e)) ** 2; // afastro/periastro
    this.fOrbit = 1 / (1 + ((fluxSwing - 1) / 1.5) ** 2);
    this.factors = { temperature: 0, water: 0, pressure: 0, atmosphere: 0, radiation: 0, light: 0, nutrients: 0, stability: 0, gravity: 0 };
  }
  // c in [-1, 1] → interpolazione lineare sulla tabella
  row(table, c) {
    const x = (clamp(c, -1, 1) + 1) / 2 * (ROWS - 1), i = Math.min(ROWS - 2, Math.floor(x)), f = x - i;
    return table[i] + (table[i + 1] - table[i]) * f;
  }
  sample(d, out = {}) {
    const t = this.terrain, raw = t.sample(d.x, d.y, d.z), amp = t.amp, sea = t.sea;
    const c = this.lockedToStar ? -d.x : d.y, alt = raw - this.seaRef;
    const cool = this.lapse * Math.max(0, alt);
    const T = this.row(this.tMean, c) - cool, Tmin = this.row(this.tMin, c) - cool, Tmax = this.row(this.tMax, c) - cool;
    const q = this.row(this.qMean, c);
    const ocean = raw < sea, frozen = ocean && T < 271, liquid = ocean && !frozen;
    const depth = ocean ? sea - raw : 0;

    let water;
    if (liquid) water = 1;
    else {
      const coast = sea > -1e8 ? 1 - smooth(raw - sea, 0, 0.25 * amp) : 0;
      water = clamp((0.75 * t.moisture(d.x, d.y, d.z) + 0.35 * coast) * this.hydro, 0, 1);
      if (T < 273) water *= 0.3; // gelato: poco disponibile
      if (T > this.Tboil) water = 0;
    }
    let light = this.surfLight * q;
    if (liquid) light *= 0.2 + 0.8 * Math.exp(-depth / (0.3 * amp)); // zona fotica
    const radiation = this.uvTop * Math.sqrt(Math.max(q, 0)) * this.uvShield * (liquid ? 0.3 : 1);
    let nutrients;
    if (liquid) nutrients = 0.2 + 0.8 * (1 - smooth(depth, 0, 0.6 * amp)); // coste e bassifondi ricchi, abissi poveri
    else {
      const lowland = 1 - smooth(alt / amp, 0, 0.8), mineral = 0.5 + 0.5 * t.mo(d.x * 6 + 3, d.y * 6, d.z * 6 - 5);
      nutrients = clamp(0.2 + 0.45 * lowland + 0.35 * mineral + (this.type === 'volcanic' ? 0.2 : 0), 0, 1);
    }
    const swing = (Tmax - Tmin) * (liquid ? 0.4 : 1); // gli oceani smorzano le stagioni

    const F = this.factors, Teff = liquid ? Math.max(T, 272) : T;
    F.temperature = 1 / (1 + ((Teff - HABITABILITY.optimalTemp) / 28) ** 6);
    F.water = 0.06 + 0.94 * water;
    F.pressure = this.fPressure;
    F.atmosphere = liquid ? Math.sqrt(this.fAtmosphere) : this.fAtmosphere;
    F.radiation = 1 / (1 + (radiation / 0.6) ** 2);
    F.light = smooth(light, 0.01, 0.25) / (1 + (light / 6) ** 2);
    F.nutrients = 0.15 + 0.85 * nutrients;
    F.stability = this.fOrbit / (1 + (swing / 70) ** 2);
    F.gravity = this.fGravity;
    let s = 0;
    for (const k in HABITABILITY.weights) s += HABITABILITY.weights[k] * Math.log(Math.max(F[k], 1e-6));

    Object.assign(out, { raw, alt, elev: alt / amp, ocean, frozen, liquid, depth, lat: Math.asin(clamp(d.y, -1, 1)),
      T, Tmin, Tmax, water, light, radiation, nutrients, habitability: 100 * Math.exp(s), cover: 0, dominant: null });
    return out;
  }
  // Quanto il punto è adatto a una specie (0-1): nicchia termica e idrica, habitability minima, ambiente acquatico o terrestre.
  suitability(sp, env) {
    const n = sp.niche;
    if (n.aquatic !== env.liquid) return 0;
    let s = Math.exp(-(((env.T - n.T) / n.tolT) ** 2)) * Math.exp(-(((env.water - n.water) / n.tolW) ** 2));
    s *= smooth(env.habitability, n.minH - 8, n.minH + 4);
    if (n.elev != null && !n.aquatic) s *= Math.exp(-(((env.elev - n.elev) / 0.6) ** 2));
    return s;
  }
}

function colorArray(hex) { // sRGB esadecimale → lineare
  const lin = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return [lin((hex >> 16 & 255) / 255), lin((hex >> 8 & 255) / 255), lin((hex & 255) / 255)];
}
