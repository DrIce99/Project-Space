import { Vector3 } from 'three';
const _s = new Vector3(), _c = new Vector3(), _x = new Vector3();

// Frazione visibile di un disco di raggio angolare a coperto da un disco di raggio b a separazione c.
// Approssimazione morbida dell'area di sovrapposizione: 1 senza contatto, (1 - b²/a²) al massimo
// (anulare, o 0 se totale), transizione smoothstep durante le fasi parziali (penombra).
export function discVisible(a, b, c) {
  if (c >= a + b) return 1;
  const full = 1 - Math.min(1, (b / a) ** 2), lo = Math.abs(a - b);
  if (c <= lo) return full;
  const t = (c - lo) / (a + b - lo);
  return full + (1 - full) * t * t * (3 - 2 * t);
}

// Quanto del disco stellare è visibile dal punto p, tenendo conto di tutti i corpi interposti
// (eclissi di luna, di sole, transiti). exclude: il corpo su cui ci si trova (la sua ombra è il lato notte).
export function sunVisibility(p, star, bodies, exclude = null) {
  _s.subVectors(star.position, p); const Ls = _s.length(); _s.divideScalar(Ls);
  const a = Math.asin(Math.min(1, star.radius / Ls));
  let vis = 1;
  for (const b of bodies) {
    if (b === star || b === exclude) continue;
    _c.subVectors(b.position, p); const Lc = _c.length();
    if (Lc >= Ls || Lc <= b.radius) continue;
    _c.divideScalar(Lc);
    const c = Math.atan2(_x.crossVectors(_s, _c).length(), _s.dot(_c));
    if (c > Math.PI / 2) continue;
    vis *= discVisible(a, Math.asin(b.radius / Lc), c);
  }
  return vis;
}
