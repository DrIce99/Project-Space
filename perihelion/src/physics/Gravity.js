import * as THREE from 'three';
import { SCALE } from '../config/Scale.js';

const _d = new THREE.Vector3();

// Somma dei contributi 1/r² di tutti i corpi: niente "gravità verticale fissa".
export function gravityAccel(pos, bodies, out){
  out.set(0, 0, 0);
  for (const b of bodies){
    if (b.mass <= 0) continue;
    _d.subVectors(b.pos, pos);
    const r2 = Math.max(_d.lengthSq(), b.radius * b.radius * 0.25);
    out.addScaledVector(_d.normalize(), SCALE.G * b.mass / r2);
  }
  return out;
}

export function dominantBody(pos, bodies){
  let best = null, bestF = -1;
  for (const b of bodies){
    if (b.mass <= 0) continue;
    const f = b.mass / Math.max(pos.distanceToSquared(b.pos), 1);
    if (f > bestF){ bestF = f; best = b; }
  }
  return best;
}

export function surfaceGravity(body){ return SCALE.G * body.mass / (body.radius * body.radius); }
export function escapeVelocity(body){ return Math.sqrt(2 * SCALE.G * body.mass / body.radius); }