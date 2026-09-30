import { clamp, smoothstep } from '../core/Util.js';

// Pesi configurabili: la vivibilità è una somma continua, mai un booleano.
export const HAB_WEIGHTS = { temp: 0.24, pressure: 0.16, water: 0.20, oxygen: 0.16, toxicity: 0.08, radiation: 0.08, light: 0.06, stability: 0.02 };

const gauss = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));

export function computeHabitability(def){
  const at = def.atmosphere;
  const t = gauss(def.temperature.surface, 288, 42);
  const p = clamp(Math.exp(-((Math.log10(Math.max(at.pressure, 1e-4)) - 0) ** 2) / 0.9), 0, 1);
  const water = def.surface.ocean ? 1 : (def.type === 'ice' ? 0.25 : 0);
  const o2 = smoothstep(0.05, 0.21, at.composition.O2 ?? 0) * (1 - smoothstep(0.3, 0.4, at.composition.O2 ?? 0));
  const tox = 1 - at.toxicity;
  const rad = clamp((def.orbit.a / (340 * Math.sqrt(def._lum))), 0, 1) * (def.orbit.a < 140 ? 0.2 : 1);
  const light = clamp(1.4 - def.orbit.a / 2400, 0.15, 1);
  const stab = clamp(1 - def.orbit.e * 4, 0, 1);
  const W = HAB_WEIGHTS;
  return Math.round(100 * (W.temp * t + W.pressure * p + W.water * water + W.oxygen * o2 + W.toxicity * tox + W.radiation * rad + W.light * light + W.stability * stab));
}

export function habTier(h){
  if (h < 10) return 'COMPLETAMENTE STERILE';
  if (h < 25) return 'VITA ESTREMAMENTE IMPROBABILE';
  if (h < 40) return 'VITA SEMPLICE POSSIBILE';
  if (h < 60) return 'ECOSISTEMA PRIMITIVO';
  if (h < 80) return 'ECOSISTEMA COMPLESSO';
  return 'CONDIZIONI ALTAMENTE FAVOREVOLI';
}