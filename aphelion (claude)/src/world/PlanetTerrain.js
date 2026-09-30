import * as THREE from 'three';
import { biomeColor } from '../generation/BiomeGenerator.js';
// Cube-sphere con quadtree: ogni faccia si suddivide in base alla distanza della camera.
const F = [[[1,0,0],[0,0,-1],[0,1,0]], [[-1,0,0],[0,0,1],[0,1,0]], [[0,1,0],[1,0,0],[0,0,-1]],
           [[0,-1,0],[1,0,0],[0,0,1]], [[0,0,1],[1,0,0],[0,1,0]], [[0,0,-1],[-1,0,0],[0,1,0]]];
const N = 12, MAX_LEVEL = 5, _d = new THREE.Vector3(), _c = new THREE.Vector3();
const dir = (f, u, v, o) => {
  const [n, a, b] = F[f], p = 2 * u - 1, q = 2 * v - 1;
  return o.set(n[0] + p * a[0] + q * b[0], n[1] + p * a[1] + q * b[1], n[2] + p * a[2] + q * b[2]).normalize();
};

export class PlanetTerrain {
  constructor(body) {
    this.body = body; this.group = new THREE.Group(); this.chunks = new Map();
    this.base = new THREE.Color(body.color); this.baseArr = [this.base.r, this.base.g, this.base.b];
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    // sfera interna: riempie le crepe tra chunk di LOD diverso (niente stitching/skirt per ora)
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(body.radius - body.terrain.amp * 1.1, 24, 16),
      new THREE.MeshStandardMaterial({ color: this.base.clone().multiplyScalar(0.4), roughness: 1 })));
  }
  update(cam) { // cam: posizione camera nel frame del corpo
    const want = new Map(), R = this.body.radius;
    const visit = (f, l, x, y) => {
      const s = 1 / 2 ** l;
      if (l < MAX_LEVEL && dir(f, x + s / 2, y + s / 2, _c).multiplyScalar(R).distanceTo(cam) < R * 1.6 * s * 2.2) {
        const h = s / 2; visit(f, l + 1, x, y); visit(f, l + 1, x + h, y); visit(f, l + 1, x, y + h); visit(f, l + 1, x + h, y + h);
      } else want.set(`${f}:${l}:${x}:${y}`, [f, l, x, y]);
    };
    for (let f = 0; f < 6; f++) visit(f, 0, 0, 0);
    for (const [k, m] of this.chunks) if (!want.has(k)) { this.group.remove(m); m.geometry.dispose(); this.chunks.delete(k); }
    for (const [k, a] of want) if (!this.chunks.has(k)) { const m = this.build(...a); this.chunks.set(k, m); this.group.add(m); }
  }
  build(f, l, x0, y0) {
    const s = 1 / 2 ** l, t = this.body.terrain, R = this.body.radius, n1 = N + 1;
    const pos = new Float32Array(n1 * n1 * 3), col = new Float32Array(n1 * n1 * 3), idx = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * n1 + i;
      dir(f, x0 + s * i / N, y0 + s * j / N, _d);
      const raw = t.sample(_d.x, _d.y, _d.z), h = Math.max(raw, t.sea), wet = raw < t.sea + 0.15 * t.amp ? 0.3 : 0;
      const c = biomeColor(this.body.data, t, Math.abs(_d.y), raw, Math.min(1, t.moisture(_d.x, _d.y, _d.z) + wet)) ?? this.baseArr;
      const sh = raw < t.sea ? 1 : 0.85 + 0.3 * raw / t.amp;
      _d.multiplyScalar(R + h).toArray(pos, k * 3);
      col[k * 3] = c[0] * sh; col[k * 3 + 1] = c[1] * sh; col[k * 3 + 2] = c[2] * sh;
      if (i < N && j < N) idx.push(k, k + 1, k + n1, k + 1, k + n1 + 1, k + n1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, this.mat);
  }
}