// Due fasi, separate perché la seconda ha bisogno della temperatura reale (che dipende dall'effetto
// serra calcolato nella prima):
//  1) generateAtmosphere: composizione chimica, pressione, tossicità, effetto serra.
//  2) finalizeAtmosphereOptics: da quella composizione + temperatura reale + gravità, derivare i
//     parametri ottici (Rayleigh/Mie) usati dallo shader di scattering — niente colori scelti a mano.
const MIX = { terran: { N2: .78, O2: .21, Ar: .01 }, ocean: { N2: .75, O2: .15, H2O: .08, CO2: .02 }, desert: { CO2: .7, N2: .27, Ar: .03 },
  rocky: { CO2: .5, N2: .45, Ar: .05 }, icy: { N2: .9, CH4: .1 }, volcanic: { CO2: .8, SO2: .15, N2: .05 }, gas: { H2: .85, He: .14, CH4: .01 } };
const BASE_P = { terran: 1, ocean: 1.3, desert: .15, rocky: .02, icy: .1, volcanic: 40, gas: 1000 }; // atm, prima di gravità/temperatura
// Massa molare (g/mol) e polarizzabilità relativa all'N2 (lo scattering di Rayleigh è ∝ polarizzabilità²
// e quasi indipendente dalla lunghezza d'onda del gas in sé: il cielo è blu per il fattore 1/λ⁴, non
// per la composizione — è la composizione a decidere QUANTA luce si diffonde e quanto pulviscolo/foschia
// (Mie) si accumula, non il colore di base del cielo).
const MOLAR = { N2: 28, O2: 32, Ar: 40, CO2: 44, CH4: 16, H2: 2, He: 4, H2O: 18, SO2: 64 };
const POLAR = { N2: 1, O2: .91, Ar: .94, CO2: 1.67, CH4: 1.49, H2: .46, He: .12, H2O: .83, SO2: 2.14 };
const HAZE_BY_TYPE = { volcanic: .32, desert: .22, gas: .55, terran: .06, ocean: .09, icy: -.08, rocky: 0 };
// Spessore ottico Rayleigh verticale dell'aria terrestre al livello del mare a λ = 680/550/440 nm
// (∝ 1/λ⁴: il blu si diffonde ~6 volte più del rosso). Riferimento fisico da cui si scala ogni pianeta.
const TAU_R_EARTH = [0.046, 0.108, 0.265];
const AIR_CROSS = .78 * POLAR.N2 ** 2 + .21 * POLAR.O2 ** 2 + .01 * POLAR.Ar ** 2, AIR_MOLAR = 28.97, EARTH_G = 8;
// Densità atmosferica globale: moltiplica la colonna di gas di OGNI pianeta (i rapporti fisici tra un
// pianeta e l'altro restano invariati). Nella scala del gioco, con la colonna reale, il cielo lontano dal
// sole sfuma subito verso il nero; una colonna più densa lo riempie del colore dell'atmosfera.
const ATMO_DENSITY = 1.9;

export function generateAtmosphere(rng, type, gRatio, Teq) {
  let p = BASE_P[type] * (0.4 + 1.6 * rng()) * gRatio ** 1.5; // più gravità -> trattiene meglio l'atmosfera
  if (type !== 'gas' && type !== 'volcanic' && (gRatio < 0.12 || Teq > 380)) p *= 0.05; // fuga termica/gravitazionale
  const mix = {}; let sum = 0;
  for (const [g, f] of Object.entries(MIX[type])) { mix[g] = f * (0.6 + 0.8 * rng()); sum += mix[g]; }
  let meanMolar = 0, crossSection = 0;
  for (const g in mix) { mix[g] /= sum; meanMolar += mix[g] * MOLAR[g]; crossSection += mix[g] * POLAR[g] ** 2; }
  const { CO2 = 0, CH4 = 0, H2O = 0, O2 = 0, SO2 = 0 } = mix;
  return {
    pressure: p, composition: mix, meanMolar, crossSection, hazeBase: HAZE_BY_TYPE[type] ?? 0,
    // Pressione della colonna di gas sopra la superficie VISIBILE: per i giganti gassosi è quella sopra
    // lo strato di nubi (~1 atm, come Giove), non le migliaia di atm "al raggio nominale".
    columnPressure: type === 'gas' ? Math.min(p, 1) : p,
    oxygenLevel: O2 * p, // pressione parziale (atm)
    toxicity: Math.min(1, 10 * SO2 + 2 * CH4 + 0.5 * Math.max(0, CO2 * p - 0.05) + 0.05 * Math.max(0, p - 4)),
    greenhouse: Math.min(0.9, p ** 0.8 * (0.06 + 0.6 * CO2 + 3 * CH4 + H2O))
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Chiamata dopo che la temperatura reale è nota. gravity in unità di gioco (non g reali), coerente col
// resto della fisica del gioco. Muta e restituisce A con i parametri ottici aggiunti.
//
// L'altezza dell'atmosfera è sempre espressa come FRAZIONE del raggio di QUESTO pianeta — mai come un
// valore assoluto scollegato dalla sua scala — così resta coerente qualunque sia la dimensione del
// corpo celeste, invece di poter risultare, per certe combinazioni di temperatura/gravità, un guscio
// sottilissimo rispetto al raggio (il bordo netto vicino al suolo che si vuole evitare). Il rapporto
// T/(massa molare · gravità), normalizzato su un riferimento terrestre, modula solo QUANTO più alta o
// più compressa è, in proporzione, l'atmosfera di questo pianeta rispetto a un mondo simile alla Terra
// (mondi caldi/leggeri/a bassa gravità → guscio proporzionalmente più esteso; freddi/pesanti/ad alta
// gravità → più compresso) — un effetto emergente, non imposto a mano — mentre la pressione allarga
// ulteriormente il guscio (più gas trattenuto, atmosfera che si estende più lontano prima di svanire).
// La forma del profilo verticale (il decadimento esponenziale nello shader, density = exp(-h/H)) non
// cambia: qui si fissa solo la sua scala H, in modo che non finisca troppo vicina al terreno né sparisca
// in quota — la densità resta comunque massima al suolo e diminuisce gradualmente verso lo spazio.
export function finalizeAtmosphereOptics(A, T, gravity, radius) {
  const EARTH_RATIO = 288 / (28.9 * 8);
  const relRatio = A.pressure > 1e-5 ? (T / (Math.max(A.meanMolar, 2) * Math.max(gravity, 0.5))) / EARTH_RATIO : 0.4;
  const heightFraction = 0.11 * clamp(relRatio, 0.35, 2.2) * (0.55 + 0.35 * Math.log1p(A.pressure));
  const scaleHeightR = clamp(radius * heightFraction, radius * 0.02, radius * 0.32);
  const scaleHeightM = scaleHeightR / 3; // il pulviscolo resta più basso del gas, ma non sparisce già sulle prime colline
  const atmoTop = clamp(scaleHeightR * 6, radius * 0.15, radius * 0.7); // raggio del guscio renderizzato, sempre ∝ raggio del pianeta
  // Spessore ottico verticale = sezione d'urto × numero di molecole nella colonna. La colonna vale
  // N ∝ P / (massa molare · g): stessa pressione su un pianeta a bassa gravità o con gas leggeri =
  // più molecole sopra la testa = cielo più denso. Il coefficiente per unità di lunghezza è τ/H, così
  // l'integrale di β·exp(-h/H) lungo la verticale restituisce esattamente τ, qualunque sia la scala del
  // guscio scelta sopra per ragioni visive.
  const P = A.columnPressure, column = P * (AIR_MOLAR / Math.max(A.meanMolar, 2)) * (EARTH_G / Math.max(gravity, 0.5));
  const tauR = TAU_R_EARTH.map(t => t * ATMO_DENSITY * column * A.crossSection / AIR_CROSS);
  const rayleighCoeff = tauR.map(t => t / scaleHeightR);
  const haze = Math.max(0, Math.min(1, A.hazeBase + 0.45 * A.toxicity + 0.15 * Math.max(0, A.pressure - 1)));
  const tauM = 1.5 * haze * P ** 0.25; // aerosol: ~0.1 per un mondo terrestre, >1 per atmosfere tipo Venere
  const mieCoeff = tauM / scaleHeightM;
  const warm = Math.max(0, Math.min(1, 2 * ((A.composition.CO2 || 0) + (A.composition.SO2 || 0) - 0.3)));
  Object.assign(A, {
    scaleHeightR, scaleHeightM, atmoTop, rayleighCoeff, mieCoeff, haze, tauR, tauM,
    mieColor: [1, 1 - 0.22 * warm, 1 - 0.45 * warm], // pulviscolo quasi bianco, tende al caldo con CO2/SO2 (Marte/Venere)
    mieG: 0.7 + 0.15 * haze
  });
  return A;
}