const C = { deep: [.05, .14, .32], shallow: [.1, .3, .5], ice: [.92, .95, .98], grass: [.28, .5, .2], forest: [.1, .34, .15],
  tundra: [.5, .55, .45], swamp: [.25, .36, .25], snowrock: [.8, .82, .85], lava: [.35, .1, .05] };

// Colore di bioma per un punto: temperatura locale (latitudine, quota, pressione) + umidità + habitability.
// Restituisce null per terreno sterile (si usa il colore base del pianeta).
export function biomeColor(P, tg, lat, h, moist) {
  const T = P.climate.meanTemp + 45 * (0.33 - lat * lat) * (0.4 + 0.6 / (1 + P.atmosphere.pressure)) - 25 * Math.max(0, h) / tg.amp;
  if (h < tg.sea) return T < 268 ? C.ice : h < tg.sea - 0.5 * tg.amp ? C.deep : C.shallow;
  if (T < 265 && (P.waterCoverage > 0.05 || P.type === 'icy')) return C.ice;
  if (h > 0.75 * tg.amp) return T < 270 ? C.snowrock : null;
  if (P.type === 'volcanic') return h < 0.1 * tg.amp ? C.lava : null;
  const veg = Math.min(1, P.habitability / 60) * Math.min(1, moist * 1.4) * Math.max(0, 1 - Math.abs(T - 290) / 45);
  if (veg < 0.12) return null;
  if (T < 280) return C.tundra;
  if (h < tg.sea + 0.12 * tg.amp && moist > 0.6) return C.swamp;
  return veg > 0.5 ? C.forest : C.grass;
}
