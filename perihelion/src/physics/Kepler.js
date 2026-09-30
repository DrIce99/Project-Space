import * as THREE from 'three';

// Risolve M = E - e·sinE (Newton, 6 iterazioni).
export function solveKepler(M, e){
  M = M % (Math.PI * 2);
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

// Stato orbitale (posizione + velocità) nel riferimento del genitore.
// Il piano orbitale è ruotato da (Ω, inc, ω); l'eclittica coincide con XZ.
export function orbitalState(el, t, outPos, outVel){
  const n = (Math.PI * 2) / el.period;
  const M = el.M0 + n * t;
  const E = solveKepler(M, el.e);
  const ce = Math.cos(E), se = Math.sin(E);
  const b = el.a * Math.sqrt(1 - el.e * el.e);
  const X = el.a * (ce - el.e), Y = b * se;
  const dE = n / (1 - el.e * ce);
  const vX = -el.a * se * dE, vY = b * ce * dE;

  const cO = Math.cos(el.Omega), sO = Math.sin(el.Omega);
  const ci = Math.cos(el.inc), si = Math.sin(el.inc);
  const cw = Math.cos(el.omega), sw = Math.sin(el.omega);
  const x1 = cO * cw - sO * sw * ci, x2 = -cO * sw - sO * cw * ci;
  const y1 = sO * cw + cO * sw * ci, y2 = -sO * sw + cO * cw * ci;
  const z1 = sw * si, z2 = cw * si;

  outPos.set(x1 * X + x2 * Y, z1 * X + z2 * Y, y1 * X + y2 * Y);
  outVel.set(x1 * vX + x2 * vY, z1 * vX + z2 * vY, y1 * vX + y2 * vY);
  return outPos;
}

// Periodo kepleriano coerente con G di gioco.
export function periodFrom(a, parentMass){
  return Math.PI * 2 * Math.sqrt((a * a * a) / (1 * parentMass));
}

export function sampleOrbitPath(el, samples = 96){
  const pts = [];
  for (let i = 0; i <= samples; i++){
    const E = (i / samples) * Math.PI * 2;
    const X = el.a * (Math.cos(E) - el.e), Y = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    const cO = Math.cos(el.Omega), sO = Math.sin(el.Omega);
    const ci = Math.cos(el.inc), si = Math.sin(el.inc);
    const cw = Math.cos(el.omega), sw = Math.sin(el.omega);
    pts.push(new THREE.Vector3(
      (cO * cw - sO * sw * ci) * X + (-cO * sw - sO * cw * ci) * Y,
      (sw * si) * X + (cw * si) * Y,
      (sO * cw + cO * sw * ci) * X + (-sO * sw + cO * cw * ci) * Y,
    ));
  }
  return pts;
}