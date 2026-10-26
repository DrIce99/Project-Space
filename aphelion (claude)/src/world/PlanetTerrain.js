import * as THREE from 'three';
import { biomeColor } from '../generation/BiomeGenerator.js';
import { Vegetation } from '../systems/VegetationSystem.js';
import { applyEclipse } from '../rendering/EclipseShader.js';
// Cube-sphere con quadtree: ogni faccia si suddivide in base alla distanza della camera.
const F = [[[1,0,0],[0,0,-1],[0,1,0]], [[-1,0,0],[0,0,1],[0,1,0]], [[0,1,0],[1,0,0],[0,0,-1]],
           [[0,-1,0],[1,0,0],[0,0,1]], [[0,0,1],[1,0,0],[0,1,0]], [[0,0,-1],[-1,0,0],[0,1,0]]];
const N = 12, MAX_LEVEL = 5, _d = new THREE.Vector3(), _c = new THREE.Vector3(), _col = [0, 0, 0], _env = {};
const dir = (f, u, v, o) => {
  const [n, a, b] = F[f], p = 2 * u - 1, q = 2 * v - 1;
  return o.set(n[0] + p * a[0] + q * b[0], n[1] + p * a[1] + q * b[1], n[2] + p * a[2] + q * b[2]).normalize();
};

// Colore (lineare) di un punto della superficie dall'ambiente locale e dalla vegetazione (BiomeGenerator):
// stessa formula per i chunk e per la texture della sfera vista da lontano, così il passaggio non cambia i colori.
function surfaceColor(body, d, out) {
  const env = body.habitat.sample(d, _env);
  biomeColor(body.habitat, env, out);
  return env.raw;
}

// Texture equirettangolare della superficie per la sfera lontana, campionata dal terreno deterministico.
// Mappatura di THREE.SphereGeometry: colonna → longitudine φ, riga → colatitudine θ (riga 0 = polo nord).
export function surfaceTexture(body, w = 256, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h), col = [0, 0, 0];
  const srgb = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  for (let j = 0; j < h; j++) {
    const th = Math.PI * (j + 0.5) / h;
    for (let i = 0; i < w; i++) {
      const ph = 2 * Math.PI * (i + 0.5) / w;
      _d.set(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
      surfaceColor(body, _d, col);
      const k = (j * w + i) * 4;
      img.data[k] = srgb(Math.min(1, col[0])); img.data[k + 1] = srgb(Math.min(1, col[1])); img.data[k + 2] = srgb(Math.min(1, col[2])); img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class PlanetTerrain {
  constructor(body, eclipseIndex = -1) {
    this.body = body; this.group = new THREE.Group(); this.chunks = new Map();
    this.base = new THREE.Color(body.color);
    this.vegetation = new Vegetation(body, eclipseIndex);
    this.mat = applyEclipse(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), eclipseIndex);
    // sfera interna: riempie le crepe tra chunk di LOD diverso (niente stitching/skirt per ora)
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(body.radius - body.terrain.amp * 1.1, 24, 16),
      applyEclipse(new THREE.MeshStandardMaterial({ color: this.base.clone().multiplyScalar(0.4), roughness: 1 }), eclipseIndex)));
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
    for (const [k, m] of this.chunks) if (!want.has(k)) { this.group.remove(m); m.traverse(o => o.geometry?.dispose()); this.chunks.delete(k); }
    for (const [k, a] of want) if (!this.chunks.has(k)) { const m = this.build(...a); this.chunks.set(k, m); this.group.add(m); }
  }
  build(f, l, x0, y0) {
    const s = 1 / 2 ** l, t = this.body.terrain, R = this.body.radius, n1 = N + 1;
    const pos = new Float32Array(n1 * n1 * 3), col = new Float32Array(n1 * n1 * 3), idx = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * n1 + i;
      dir(f, x0 + s * i / N, y0 + s * j / N, _d);
      const raw = surfaceColor(this.body, _d, _col);
      _d.multiplyScalar(R + Math.max(raw, t.sea)).toArray(pos, k * 3);
      col[k * 3] = _col[0]; col[k * 3 + 1] = _col[1]; col[k * 3 + 2] = _col[2];
      if (i < N && j < N) idx.push(k, k + 1, k + n1, k + 1, k + n1 + 1, k + n1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.mat);
    const veg = this.vegetation.build(f, l, x0, y0, dir);
    if (veg) mesh.add(veg);
    return mesh;
  }
}