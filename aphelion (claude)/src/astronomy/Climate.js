import { Vector3, Quaternion } from 'three';
import { boilingPoint, TRIPLE_P } from '../generation/PlanetGenerator.js';
const _s = new Vector3(), _u = new Vector3(), _v = new Vector3(), _a = new Vector3(), _b = new Vector3(), _l = new Vector3(), _q = new Quaternion();
const TAU = 2 * Math.PI, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Insolazione media giornaliera a latitudine lat con declinazione solare decl, normalizzata alla media
// globale (= 1): 4/π·(h0·sinφ·sinδ + cosφ·cosδ·sin h0), h0 = semiarco diurno (0 = notte polare, π = sole di mezzanotte).
export function dailyInsolation(lat, decl) {
  const x = -Math.tan(lat) * Math.tan(decl), h0 = x >= 1 ? 0 : x <= -1 ? Math.PI : Math.acos(x);
  return 4 / Math.PI * (h0 * Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.sin(h0));
}

// Giorno solare: rotazione propria attorno all'asse meno il moto apparente della stella attorno allo stesso
// asse (dovuto al moto orbitale). Sincrona attorno alla stella → ~0 → giorno perpetuo.
export function solarRate(body) {
  const star = body.star;
  _s.subVectors(star.position, body.position); const r = _s.length(); _s.divideScalar(r);
  _v.subVectors(body.velocity, star.velocity); _v.addScaledVector(_s, -_v.dot(_s)).multiplyScalar(-1 / r); // ds/dt
  return body.omega.dot(body.axis) - _a.crossVectors(_s, _v).dot(body.axis);
}

// Ambiente locale nel punto p sopra body al tempo t. La rotazione del corpo decide:
//  - ora locale e durata del giorno, altezza della stella nel cielo (illuminazione);
//  - l'escursione di temperatura giorno/notte: il suolo insegue l'insolazione istantanea tanto più quanto il giorno
//    è lungo rispetto alla sua inerzia termica (atmosfera densa e oceani la aumentano e la smorzano);
//  - venti (contrasto termico + forza di Coriolis), meteo, crescita delle piante e attività della fauna.
// Le stagioni vengono dall'inclinazione dell'asse (declinazione della stella), la distanza orbitale dalla
// temperatura globale del corpo (body.temperature). light: frazione di disco stellare visibile (eclissi).
export function localClimate(body, p, t = 0, light = 1) {
  const star = body.star, D = body.data, axis = body.axis;
  _s.subVectors(star.position, body.position).normalize();
  _u.subVectors(p, body.position).normalize();
  const decl = Math.asin(clamp(axis.dot(_s), -1, 1)), lat = Math.asin(clamp(axis.dot(_u), -1, 1));
  const elevation = Math.asin(clamp(_u.dot(_s), -1, 1));
  const rate = solarRate(body), dayLength = Math.abs(rate) > 1e-6 ? TAU / Math.abs(rate) : Infinity;
  // angolo orario: dal meridiano locale alla stella, attorno all'asse; l'ora avanza nel verso della rotazione solare
  _a.copy(_u).addScaledVector(axis, -axis.dot(_u)); _b.copy(_s).addScaledVector(axis, -axis.dot(_s));
  const H = Math.atan2(_l.crossVectors(_a, _b).dot(axis), _a.dot(_b));
  const localTime = (((12 - Math.sign(rate || 1) * H * 24 / TAU) % 24) + 24) % 24;

  // temperatura: media giornaliera (latitudine + stagione) mescolata con l'insolazione istantanea
  const P = body.atmosphere?.pressure ?? 0, water = D.waterCoverage ?? 0, gas = D.type === 'gas';
  const inertia = 60 * (1 + 4 * P) * (1 + 3 * water); // s di gioco: tempo di risposta termica della superficie
  const k = dayLength === Infinity ? 1 : 1 - Math.exp(-dayLength / inertia);
  const qMean = dailyInsolation(lat, decl), qNow = 4 * Math.max(0, _u.dot(_s)) * light;
  const q = qMean + (qNow - qMean) * k, damp = gas ? 0 : 0.1 + 0.8 / (1 + P);
  const T = body.temperature * (1 + damp * (Math.max(q, 0.02) ** 0.25 - 1));
  const Tday = body.temperature * (1 + damp * (Math.max(qMean + (4 * Math.cos(lat - decl) - qMean) * k, 0.02) ** 0.25 - 1));
  const Tnight = body.temperature * (1 + damp * (Math.max(qMean * (1 - k), 0.02) ** 0.25 - 1));

  // luce ambientale: stella sopra l'orizzonte + crepuscolo diffuso dall'atmosfera
  const lightLevel = light * (smooth(Math.sin(elevation), -0.02, 0.25) + (P > 0.01 ? 0.25 * smooth(Math.sin(elevation), -0.2, 0) : 0));

  const env = { decl, lat, elevation, dayLength, localTime, insolation: q, T, Tday, Tnight, light: clamp(lightLevel, 0, 1),
    wind: 0, weather: P < 0.005 ? 'nessuna atmosfera' : '—', plants: 0, fauna: '—', liquidWater: false };
  if (gas || P < 0.005) return env;

  // meteo: campo di rumore deterministico nel frame del corpo che deriva nel tempo (fronti che si spostano con la rotazione)
  _l.copy(_u).applyQuaternion(_q.copy(body.quaternion).invert());
  const tr = body.terrain, n1 = tr ? tr.mo(_l.x * 1.7 + t * 0.004, _l.y * 1.7, _l.z * 1.7 - t * 0.003) * 2 - 1 : 0;
  const n2 = tr ? tr.mo(_l.x * 3.1 - t * 0.006, _l.y * 3.1 + 11, _l.z * 3.1) * 2 - 1 : 0;
  const coriolis = Math.abs(body.omega.dot(axis)) * body.radius; // velocità equatoriale di rotazione
  env.wind = (2 + 10 * Math.abs(n2) + 0.08 * Math.abs(Tday - Tnight) + 0.15 * coriolis * Math.abs(Math.sin(lat))) / Math.sqrt(0.3 + 0.7 * Math.min(P, 20));
  const Tb = boilingPoint(P);
  env.liquidWater = water > 0 && P > TRIPLE_P && T > 273 && T < Tb;
  const humidity = clamp((water + (D.type === 'terran' ? .2 : 0)) * smooth(T, 250, 300), 0, 1);
  const cloud = clamp(0.35 + 0.6 * n1 + 0.5 * (humidity - 0.3) + 0.15 * (1 - k), 0, 1);
  env.weather = P > 20 ? 'coltre di nubi perenne'
    : D.type === 'volcanic' && n1 > 0.2 ? 'cenere e gas vulcanici'
    : cloud > 0.8 ? (humidity > 0.15 ? (T < 273 ? 'neve' : env.wind > 18 ? 'tempesta' : 'pioggia') : env.wind > 12 ? 'tempesta di polvere' : 'foschia')
    : cloud > 0.6 ? 'nuvoloso' : cloud > 0.4 ? 'poco nuvoloso' : 'sereno';

  // biosfera (per la flora/fauna future): fotosintesi = luce × temperatura adatta × acqua liquida
  if ((D.habitability ?? 0) > 5) {
    const light2 = env.light * (cloud > 0.8 ? 0.5 : 1);
    env.plants = clamp(light2 * Math.exp(-(((T - 297) / 18) ** 2)) * (env.liquidWater ? 1 : 0.1) * Math.min(1, D.habitability / 40), 0, 1);
    const comfy = x => x > 255 && x < 318;
    env.fauna = !comfy(Tday) && comfy(Tnight) ? (env.light < 0.2 ? 'attiva (notturna)' : 'al riparo dal caldo')
      : !comfy(T) ? 'quiescente' : env.light > 0.3 ? 'attiva (diurna)' : env.light > 0.05 ? 'crepuscolare' : 'a riposo';
  }
  return env;
}
