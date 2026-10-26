// Bioma di un punto della superficie, dall'ambiente locale (Habitat.sample) e dalle specie che ci vivono.
// Il colore non è scelto per bioma: è il suolo del pianeta (o acqua, ghiaccio, neve, lava) coperto in parte
// dalla vegetazione, del colore dei pigmenti delle specie che prosperano lì. Quindi lo stesso bioma "foresta"
// è verde sotto una stella tipo Sole e rosso scuro o quasi nero sotto una nana rossa.
const C = { deep: [.03, .09, .22], shallow: [.07, .22, .36], ice: [.85, .9, .95], snow: [.9, .92, .95], lava: [.35, .1, .05] };
const smooth = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const PHOTO = new Set(['flora', 'fungi', 'extremophile']);

// Copertura vegetale (0-1), colore medio e specie dominante nel punto; scritti in env.
export function vegetationAt(hab, env) {
  let w = 0, r = 0, g = 0, b = 0, best = 0, dom = null, plankton = 0, pr = 0, pg = 0, pb = 0;
  for (const sp of hab.species) {
    if (sp.category === 'aquatic') {
      if (sp.form !== 'plankton') continue;
      const s = hab.suitability(sp, env) * sp.abundance;
      plankton += s; pr += s * sp.color[0]; pg += s * sp.color[1]; pb += s * sp.color[2];
      continue;
    }
    if (!PHOTO.has(sp.category)) continue;
    // i tappeti di estremofili e i funghi coprono poco il suolo rispetto alle piante
    const s = hab.suitability(sp, env) * sp.abundance * (sp.category === 'flora' ? 1 : 0.35);
    if (s <= 0) continue;
    w += s; r += s * sp.color[0]; g += s * sp.color[1]; b += s * sp.color[2];
    if (s > best) { best = s; dom = sp; }
  }
  env.cover = Math.min(1, w * 1.6) * smooth(env.habitability, 8, 45);
  env.dominant = dom;
  env.vegColor = w > 0 ? [r / w, g / w, b / w] : null;
  env.plankton = Math.min(1, plankton * 1.5);
  env.planktonColor = plankton > 0 ? [pr / plankton, pg / plankton, pb / plankton] : null;
  return env;
}

// Colore lineare del punto, in out[0..2].
export function biomeColor(hab, env, out) {
  vegetationAt(hab, env);
  const amp = hab.terrain.amp;
  let c;
  if (env.ocean) {
    if (env.frozen) c = C.ice;
    else {
      const k = smooth(env.depth, 0, 0.5 * amp);
      c = C.shallow.map((v, i) => v + (C.deep[i] - v) * k);
      if (env.planktonColor) { const t = 0.4 * env.plankton; c = c.map((v, i) => v + (env.planktonColor[i] - v) * t); } // fioriture visibili dallo spazio
    }
  } else {
    const sh = 0.85 + 0.3 * Math.max(-1, Math.min(1, env.raw / amp));
    c = hab.ground.map(v => v * sh);
    if (hab.type === 'volcanic' && env.elev < 0.15) c = c.map((v, i) => v + (C.lava[i] - v) * 0.6);
    if (env.vegColor) { const t = 0.85 * env.cover; c = c.map((v, i) => v + (env.vegColor[i] - v) * t); }
    // neve e ghiaccio: serve acqua (anche poca) e una temperatura media sotto lo zero
    const snow = smooth(268 - env.T, 0, 10) * Math.min(1, hab.hydro * 4);
    if (snow > 0) c = c.map((v, i) => v + (C.snow[i] - v) * snow);
  }
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  return out;
}

const ALIEN = { fungi: 'distese fungine', extremophile: 'tappeti di estremofili' };
// Nome del bioma per l'HUD (richiede env già passato da biomeColor o vegetationAt)
export function biomeName(hab, env) {
  if (env.ocean) return env.frozen ? 'mare ghiacciato' : env.depth > 0.5 * hab.terrain.amp ? 'oceano profondo' : 'mare costiero';
  const cov = env.cover, cold = env.T < 268, sea = hab.terrain.sea;
  const coast = sea > -1e8 && env.raw - sea < 0.12 * hab.terrain.amp;
  let name;
  if (env.elev > 0.75) name = cold ? 'vetta innevata' : 'montagna';
  else if (hab.type === 'volcanic' && env.elev < 0.15) name = 'campi di lava';
  else if (cold && cov < 0.15) name = hab.hydro > 0.1 ? 'ghiacciaio' : 'deserto gelato';
  else if (cov > 0.15 && env.dominant && ALIEN[env.dominant.category]) name = ALIEN[env.dominant.category];
  else if (coast && env.water > 0.7 && cov > 0.3) name = 'palude';
  else if (cov > 0.55) name = env.dominant?.form.startsWith('tree') ? 'foresta' : 'prateria';
  else if (cov > 0.15) name = env.T < 283 ? 'tundra' : env.water < 0.35 ? 'savana' : 'pianura';
  else if (coast) name = 'costa';
  else name = env.water < 0.2 ? (hab.type === 'volcanic' ? 'terreno vulcanico' : 'deserto') : 'pianura sterile';
  return name;
}
