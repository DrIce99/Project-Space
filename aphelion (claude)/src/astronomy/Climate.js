import { Vector3 } from 'three';
const _s = new Vector3(), _u = new Vector3();

// Insolazione media giornaliera a latitudine lat con declinazione solare decl, normalizzata alla media
// globale (= 1): 4/π·(h0·sinφ·sinδ + cosφ·cosδ·sin h0), h0 = semiarco diurno (0 = notte polare, π = sole di mezzanotte).
export function dailyInsolation(lat, decl) {
  const x = -Math.tan(lat) * Math.tan(decl), h0 = x >= 1 ? 0 : x <= -1 ? Math.PI : Math.acos(x);
  return 4 / Math.PI * (h0 * Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.sin(h0));
}

// Clima locale nel punto p sopra body: declinazione della stella (stagioni, dall'inclinazione dell'asse),
// latitudine, temperatura. La temperatura globale del corpo varia già con la distanza dalla stella
// (orbite ellittiche); qui si aggiunge la distribuzione per latitudine e stagione, smorzata da
// un'atmosfera densa che ridistribuisce il calore.
export function localClimate(body, p) {
  const star = body.star;
  _s.subVectors(star.position, body.position).normalize();
  _u.subVectors(p, body.position).normalize();
  const decl = Math.asin(body.axis.dot(_s)), lat = Math.asin(body.axis.dot(_u));
  const locked = body.parent === star && body.data.rotation?.period === null; // giorno/notte permanenti
  const q = locked ? 4 * Math.max(0, _u.dot(_s)) : dailyInsolation(lat, decl);
  const P = body.atmosphere?.pressure ?? 0, damp = body.data.type === 'gas' ? 0 : 0.15 + 0.45 / (1 + P);
  const T = body.temperature * (1 + damp * (Math.max(q, 0.02) ** 0.25 - 1));
  return { decl, lat, insolation: q, T };
}
