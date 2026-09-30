import { Color } from 'three';

// Approssimazione stilizzata dello spettro di corpo nero: interpola tra colori di riferimento noti
// per alcune temperature (rosso/arancio ai T bassi, bianco verso i 5800K solari, blu ai T alti).
// Non è un calcolo spettrale reale (richiederebbe integrare Planck su CIE), ma il comportamento
// qualitativo — e le conseguenze su cielo e illuminazione — sono quelli corretti.
const STOPS = [
  [1500, [1.00, 0.35, 0.05]], [2500, [1.00, 0.52, 0.18]], [3500, [1.00, 0.68, 0.40]],
  [4500, [1.00, 0.80, 0.60]], [5200, [1.00, 0.88, 0.78]], [5778, [1.00, 0.95, 0.90]],
  [6600, [0.97, 0.97, 1.00]], [8000, [0.85, 0.91, 1.00]], [12000, [0.72, 0.82, 1.00]],
  [20000, [0.62, 0.73, 1.00]]
];
export function blackbodyRGB(T) {
  T = Math.max(STOPS[0][0], Math.min(STOPS[STOPS.length - 1][0], T));
  let i = 0; while (i < STOPS.length - 2 && STOPS[i + 1][0] < T) i++;
  const [t0, c0] = STOPS[i], [t1, c1] = STOPS[i + 1], f = (T - t0) / (t1 - t0);
  return c0.map((v, k) => v + (c1[k] - v) * f);
}

// Stella "main sequence"-ish: temperatura casuale, raggio correlato alla temperatura (più calda -> più
// grande, relazione approssimata), luminosità = R² T⁴ (Stefan-Boltzmann in unità solari).
export function generateStar(rng) {
  const T = 3200 + Math.pow(rng(), 1.6) * 9000; // pesata verso stelle più fredde/comuni
  const Rsun = Math.pow(T / 5778, 1.1) * (0.75 + 0.5 * rng());
  const luminosity = Rsun ** 2 * (T / 5778) ** 4;
  const mass = Math.max(0.35, Math.min(2.8, Rsun * Math.sqrt(T / 5778)));
  return {
    id: 'star', name: 'Helia', temperature: T, luminosity, massRatio: mass,
    radius: 340 + 130 * Math.min(1.6, Rsun), mu: 4e7 * mass,
    color: new Color(...blackbodyRGB(T)).getHex()
  };
}