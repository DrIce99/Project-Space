// Value noise 3D deterministica (hash intero) + fBm + creste.
// Usata per terreno, nuvole e biomi: stesso seed → stesso pianeta.
function hash(seed, x, y, z){
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(seed | 0, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const sm = t => t * t * (3 - 2 * t);

export function noise3(seed, x, y, z){
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(seed, xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0,0,0), c(1,0,0), fx), l(c(0,1,0), c(1,1,0), fx), fy),
    l(l(c(0,0,1), c(1,0,1), fx), l(c(0,1,1), c(1,1,1), fx), fy), fz) * 2 - 1;
}

export function fbm3(seed, x, y, z, oct = 5, lac = 2, gain = 0.5){
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++){ sum += a * noise3(seed + i * 131, x * f, y * f, z * f); norm += a; a *= gain; f *= lac; }
  return sum / norm;
}

export function ridge3(seed, x, y, z, oct = 4){
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++){ sum += a * (1 - Math.abs(2 * noise3(seed + i * 71, x * f, y * f, z * f))); norm += a; a *= 0.5; f *= 2.1; }
  return sum / norm; // ~[0,1]
}