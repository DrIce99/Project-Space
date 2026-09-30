export const hashSeed = (seed, id) => {
  let h = (2166136261 ^ seed) | 0;
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h | 0;
};

// Value noise 3D deterministico in [-1,1]
function makeNoise(seed) {
  const h = (x, y, z) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1103515245);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const s = t => t * t * (3 - 2 * t), l = (a, b, t) => a + (b - a) * t;
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = s(x - xi), fy = s(y - yi), fz = s(z - zi);
    const p = k => l(l(h(xi, yi, zi + k), h(xi + 1, yi, zi + k), fx), l(h(xi, yi + 1, zi + k), h(xi + 1, yi + 1, zi + k), fx), fy);
    return l(p(0), p(1), fz) * 2 - 1;
  };
}

// Altezza (in unità) sopra/sotto il raggio nominale, data una direzione unitaria nel frame del corpo.
export class TerrainGenerator {
  constructor(seed, radius, { relief = 0.05, coverage = 0 } = {}) {
    this.noise = makeNoise(seed); this.warp = makeNoise(seed ^ 0x9e3779b9); this.mo = makeNoise(seed ^ 0x51ed27);
    this.amp = radius * relief;
    this.sea = coverage > 0 ? this.amp * (coverage - 0.5) * 1.2 : -1e9; // livello del mare da copertura d'acqua
  }
  sample(x, y, z) { // altezza grezza
    const w = this.warp, k = 0.4;
    const wx = x + k * w(x * 2, y * 2, z * 2), wy = y + k * w(y * 2 + 5, z * 2, x * 2), wz = z + k * w(z * 2, x * 2 + 9, y * 2); // domain warping
    let a = 1, f = 3, s = 0, n = 0;
    for (let i = 0; i < 5; i++) { s += a * this.noise(wx * f, wy * f, wz * f); n += a; a *= 0.5; f *= 2.1; }
    return this.amp * s / n;
  }
  heightAt(x, y, z) { return Math.max(this.sample(x, y, z), this.sea); } // superficie solida (l'oceano è per ora un piano calpestabile)
  moisture(x, y, z) { return 0.5 + 0.5 * this.mo(x * 2.5 + 7, y * 2.5, z * 2.5); }
}
