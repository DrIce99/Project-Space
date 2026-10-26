import * as THREE from 'three';
import { floraTemplate } from '../rendering/LifeModels.js';
import { applyEclipse } from '../rendering/EclipseShader.js';

// Vegetazione dei chunk di terreno vicini alla camera. I punti candidati stanno su una griglia GLOBALE di
// ogni faccia del cubo-sfera (GRID celle per lato) con uno scarto deterministico: un chunk prende le celle
// che ricadono nel suo rettangolo, quindi le piante restano identiche quando il chunk si suddivide o si
// riunisce (nessun "salto" al cambio di LOD). In ogni cella l'ambiente locale decide se cresce qualcosa e
// quale specie: la probabilità è l'idoneità della specie × abbondanza, riscalata dall'ingombro della pianta.
// Tutte le piante di un chunk sono fuse in una sola geometria statica (1 draw call per chunk, + 1 per la
// bioluminescenza): sono immobili, quindi niente aggiornamenti per frame.
export const VEG_MIN_LEVEL = 3;
const GRID = 64, SMALL = new Set(['tuft', 'mat', 'crust', 'crystal', 'cap', 'cluster']);
const CATS = new Set(['flora', 'fungi', 'extremophile']);
const _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(),
  _s = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _env = {};

function hash(a, b, c, d) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 1274126177) ^ Math.imul(d, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return h;
}
const smooth = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rand = s => { s = Math.imul(s ^ (s >>> 15), 2246822519); s = Math.imul(s ^ (s >>> 13), 3266489917); return ((s ^ (s >>> 16)) >>> 0) / 4294967296; };

export class Vegetation {
  constructor(body, eclipseIndex) {
    this.body = body; this.habitat = body.habitat;
    this.species = this.habitat.species.filter(s => CATS.has(s.category));
    this.templates = new Map(this.species.map(s => [s.id, floraTemplate(s)]));
    // ingombro al suolo (unità²): piante grandi = meno individui per cella
    this.footprint = new Map(this.species.map(s => [s.id, Math.max(0.3, (s.size * (s.form.startsWith('tree') ? 1 : 0.8)) ** 2)]));
    this.seed = body.id.split('').reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261);
    this.mat = applyEclipse(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), eclipseIndex);
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  }
  get empty() { return this.species.length === 0; }

  // dir(f, u, v, out): direzione sulla faccia f (dal terreno). Restituisce un Group o null.
  build(f, l, x0, y0, dir) {
    if (this.empty || l < VEG_MIN_LEVEL) return null;
    const s = 1 / 2 ** l, t = this.habitat.terrain, R = this.body.radius;
    const i0 = Math.round(x0 * GRID), j0 = Math.round(y0 * GRID), n = Math.max(1, Math.round(s * GRID));
    const cellEdge = (Math.PI / 2) * R / GRID, cellArea = cellEdge * cellEdge;
    const lit = { pos: [], nor: [], col: [] }, glow = { pos: [], nor: [], col: [] };
    const weights = new Float32Array(this.species.length);
    for (let j = j0; j < j0 + n; j++) for (let i = i0; i < i0 + n; i++) {
      const h = hash(i, j, f, this.seed);
      dir(f, (i + rand(h)) / GRID, (j + rand(h + 1)) / GRID, _d);
      const env = this.habitat.sample(_d, _env);
      if (env.ocean) continue;
      let total = 0;
      for (let k = 0; k < this.species.length; k++) {
        const sp = this.species[k];
        weights[k] = this.habitat.suitability(sp, env) * sp.abundance * Math.min(1.5, cellArea / this.footprint.get(sp.id));
        total += weights[k];
      }
      // densità crescente con la habitability: dove la vita è appena possibile restano solo chiazze rade
      if (rand(h + 2) >= Math.min(0.95, total) * smooth(env.habitability, 0, 50)) continue;
      let r = rand(h + 3) * total, k = 0;
      while (k < weights.length - 1 && (r -= weights[k]) > 0) k++;
      const sp = this.species[k], tpl = this.templates.get(sp.id);
      if (!tpl) continue;
      // piccole piante: un ciuffo di più individui nella cella
      const count = SMALL.has(sp.form) ? 2 : 1;
      for (let c = 0; c < count; c++) {
        const hc = h + 17 * c;
        if (c > 0) dir(f, (i + rand(hc + 4)) / GRID, (j + rand(hc + 5)) / GRID, _d);
        const raw = c > 0 ? t.sample(_d.x, _d.y, _d.z) : env.raw;
        if (raw < t.sea) continue;
        const size = sp.size * (0.7 + 0.6 * rand(hc + 6));
        _n.copy(_d);
        _p.copy(_d).multiplyScalar(R + raw - 0.05 * size); // base leggermente interrata: il terreno è a facce piane
        _q.setFromUnitVectors(_up, _n).multiply(_qy.setFromAxisAngle(_up, rand(hc + 7) * 6.283));
        _m.compose(_p, _q, _s.setScalar(size));
        const tint = 0.85 + 0.3 * rand(hc + 8);
        append(lit, tpl.lit, _m, _q, tint);
        if (tpl.glow) append(glow, tpl.glow, _m, _q, 1);
      }
    }
    if (!lit.pos.length && !glow.pos.length) return null;
    const group = new THREE.Group();
    if (lit.pos.length) group.add(new THREE.Mesh(geometry(lit), this.mat));
    if (glow.pos.length) group.add(new THREE.Mesh(geometry(glow), this.glowMat));
    return group;
  }
}

const _v = new THREE.Vector3();
function append(dst, src, m, q, tint) {
  if (!src) return;
  for (let i = 0; i < src.pos.length; i += 3) {
    _v.set(src.pos[i], src.pos[i + 1], src.pos[i + 2]).applyMatrix4(m); dst.pos.push(_v.x, _v.y, _v.z);
    _v.set(src.nor[i], src.nor[i + 1], src.nor[i + 2]).applyQuaternion(q); dst.nor.push(_v.x, _v.y, _v.z);
    dst.col.push(src.col[i] * tint, src.col[i + 1] * tint, src.col[i + 2] * tint);
  }
}
function geometry(set) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(set.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(set.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(set.col, 3));
  g.computeBoundingSphere();
  return g;
}
