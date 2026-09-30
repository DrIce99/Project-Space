import { Vector3 } from 'three';
const d = new Vector3();
// Costante gravitazionale in unità di gioco: massa = mu / G. Accelerazione = G·M / r², diretta al centro di massa.
export const G = 1;

export function gravityAt(pos, bodies, out) {
  out.set(0, 0, 0);
  for (const b of bodies) {
    d.subVectors(b.position, pos);
    const r2 = Math.max(d.lengthSq(), b.radius * b.radius);
    out.addScaledVector(d.normalize(), b.mu / r2);
  }
  return out;
}
// Corpo dominante = il più interno tra le sfere d'influenza che contengono pos.
export function dominantBody(pos, bodies) {
  let dom = bodies[0];
  for (const b of bodies) if (b.position.distanceTo(pos) < b.soi) dom = b;
  return dom;
}
