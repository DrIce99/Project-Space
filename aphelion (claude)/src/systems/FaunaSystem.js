import * as THREE from 'three';
import { faunaTemplate, toGeometry } from '../rendering/LifeModels.js';
import { applyEclipse } from '../rendering/EclipseShader.js';

// Fauna terrestre e volante di un corpo. La superficie è divisa in "siti" fissi (spirale di Fibonacci, uno
// ogni ~110 unità²): ogni sito ospita al più un gruppo, di una specie scelta in base all'idoneità del luogo
// (deterministico: lo stesso sito ha sempre lo stesso gruppo). Solo i siti vicini alla camera vengono
// popolati di individui; lontano non si simula nulla (il gruppo riappare uguale tornando). Gli individui
// vivono nel frame del corpo: ruotano e orbitano con lui senza calcoli aggiuntivi.
// Comportamento: vagano attorno al sito, non entrano in mare (i terrestri), sono attivi solo nella loro
// fascia del giorno (diurni, notturni, crepuscolari — dalla posizione della stella nel cielo locale) e i
// terrestri fuggono dal giocatore quando si avvicina.
const SITE_AREA = 110, SPAWN = 38, DESPAWN = 48, CAP = 48, FLEE = 7, LEASH = 9;
const _d = new THREE.Vector3(), _h = new THREE.Vector3(), _o = new THREE.Vector3(), _x = new THREE.Vector3(), _z = new THREE.Vector3(),
  _p = new THREE.Vector3(), _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _r = new THREE.Matrix4(), _env = {};

const rand = s => { s = Math.imul(s ^ (s >>> 15), 2246822519); s = Math.imul(s ^ (s >>> 13), 3266489917); return ((s ^ (s >>> 16)) >>> 0) / 4294967296; };

export function activeAt(activity, sinElev) {
  if (activity === 'notturna') return sinElev < 0.05;
  if (activity === 'crepuscolare') return Math.abs(sinElev) < 0.3;
  return sinElev > -0.05;
}

export class PlanetFauna {
  constructor(body, eclipseIndex) {
    this.body = body; this.habitat = body.habitat; this.group = new THREE.Group();
    this.species = this.habitat.species.filter(s => s.category === 'terrestrial' || s.category === 'flying');
    const R = body.radius, n = Math.max(40, Math.min(1500, Math.round(4 * Math.PI * R * R / SITE_AREA)));
    this.sites = Array.from({ length: n }, (_, i) => {
      const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963229728653;
      return { dir: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), resolved: false, sp: null, size: 0, agents: null, seed: i * 7919 + 13 };
    });
    const mat = applyEclipse(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), eclipseIndex);
    const wingMat = applyEclipse(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), eclipseIndex);
    this.pools = new Map(this.species.map(sp => {
      const tpl = faunaTemplate(sp), mk = (set, m) => { const im = new THREE.InstancedMesh(toGeometry(set.lit), m, CAP); im.count = 0; im.frustumCulled = false; this.group.add(im); return im; };
      return [sp.id, { sp, body: mk(tpl.body, mat), wingL: tpl.wing ? mk(tpl.wing, wingMat) : null, wingR: tpl.wing ? mk(tpl.wing, wingMat) : null, agents: [] }];
    }));
    this.checkTimer = 0;
  }
  get empty() { return this.species.length === 0; }

  // Specie e dimensione del gruppo del sito (calcolati una volta sola, alla prima visita)
  resolve(site) {
    site.resolved = true;
    const env = this.habitat.sample(site.dir, _env);
    if (env.ocean) return;
    let total = 0; const w = this.species.map(sp => { const v = this.habitat.suitability(sp, env) * sp.abundance; total += v; return v; });
    if (rand(site.seed) >= Math.min(0.85, total * 1.2)) return;
    let r = rand(site.seed + 1) * total, k = 0;
    while (k < w.length - 1 && (r -= w[k]) > 0) k++;
    site.sp = this.species[k];
    site.size = site.sp.diet === 'predatore' ? 1 : 1 + Math.floor(rand(site.seed + 2) * (site.sp.category === 'flying' ? 5 : 4));
  }
  spawn(site) {
    const pool = this.pools.get(site.sp.id), R = this.body.radius;
    site.agents = [];
    for (let i = 0; i < site.size && pool.agents.length < CAP; i++) {
      const s = site.seed * 31 + i;
      _o.set(rand(s) - .5, rand(s + 1) - .5, rand(s + 2) - .5).projectOnPlane(site.dir).normalize();
      const dir = site.dir.clone().addScaledVector(_o, (rand(s + 3) * 3) / R).normalize();
      const head = new THREE.Vector3(rand(s + 4) - .5, rand(s + 5) - .5, rand(s + 6) - .5).projectOnPlane(dir).normalize();
      const a = { site, dir, head, phase: rand(s + 7) * 100, alt: site.sp.category === 'flying' ? 2.5 + 3 * rand(s + 8) : 0, lift: 0, scale: site.sp.size * (0.8 + 0.4 * rand(s + 9)) };
      pool.agents.push(a); site.agents.push(a);
    }
  }
  despawn(site) {
    const pool = this.pools.get(site.sp.id);
    pool.agents = pool.agents.filter(a => a.site !== site); site.agents = null;
  }
  // camLocal: posizione della camera nel frame del corpo; sunLocal: direzione della stella nel frame del corpo
  update(dt, t, camLocal, sunLocal) {
    if (this.empty) return;
    if ((this.checkTimer -= dt) <= 0 || dt === 0) {
      this.checkTimer = 0.5;
      const R = this.body.radius;
      for (const s of this.sites) {
        const dist = _p.copy(s.dir).multiplyScalar(R).distanceTo(camLocal);
        if (dist < SPAWN) { if (!s.resolved) this.resolve(s); if (s.sp && !s.agents) this.spawn(s); }
        else if (dist > DESPAWN && s.agents) this.despawn(s);
      }
    }
    for (const pool of this.pools.values()) this.updatePool(pool, dt, t, camLocal, sunLocal);
  }
  updatePool(pool, dt, t, camLocal, sunLocal) {
    const sp = pool.sp, R = this.body.radius, ter = this.habitat.terrain, flying = sp.category === 'flying';
    let i = 0;
    for (const a of pool.agents) {
      const active = activeAt(sp.activity, a.dir.dot(sunLocal));
      let speed = 0;
      if (active) {
        speed = sp.speed;
        // vagare: la direzione ruota attorno alla verticale con una legge morbida e diversa per ogni individuo
        const turn = Math.sin(t * 0.9 + a.phase) * 0.8 + Math.sin(t * 0.37 + a.phase * 2) * 0.6 + (flying ? 0.5 : 0);
        a.head.applyAxisAngle(a.dir, turn * dt);
        _p.copy(a.dir).multiplyScalar(R + ter.heightAt(a.dir.x, a.dir.y, a.dir.z));
        const away = _o.subVectors(_p, camLocal);
        if (!flying && away.length() < FLEE) { a.head.lerp(away.projectOnPlane(a.dir).normalize(), 1 - Math.exp(-6 * dt)); speed *= 2.5; }
        else if (a.dir.angleTo(a.site.dir) * R > LEASH) a.head.lerp(_h.copy(a.site.dir).projectOnPlane(a.dir).normalize(), 1 - Math.exp(-2 * dt));
        a.head.projectOnPlane(a.dir).normalize();
        _d.copy(a.dir).addScaledVector(a.head, speed * dt / R).normalize();
        if (!flying && ter.sample(_d.x, _d.y, _d.z) < ter.sea) a.head.negate(); // i terrestri non entrano in mare
        else { a.dir.copy(_d); a.head.projectOnPlane(a.dir).normalize(); }
      }
      // i volatili a riposo scendono a terra, attivi risalgono in quota
      a.lift += ((active ? a.alt : 0) - a.lift) * (1 - Math.exp(-1.5 * dt));
      const bob = !flying && speed > 0 ? Math.abs(Math.sin(t * 9 + a.phase)) * 0.05 * a.scale : 0;
      const ground = R + ter.heightAt(a.dir.x, a.dir.y, a.dir.z);
      _p.copy(a.dir).multiplyScalar(ground + a.lift + bob + (flying ? 0.12 * a.scale : 0));
      _z.copy(a.head).negate(); _x.crossVectors(a.dir, _z);
      _m.makeBasis(_x, a.dir, _z).scale(_o.set(a.scale, a.scale * (active || flying ? 1 : 0.85), a.scale)).setPosition(_p);
      pool.body.setMatrixAt(i, _m);
      if (pool.wingL) {
        const flap = active ? Math.sin(t * (a.lift > 1 ? 8 : 3) + a.phase) * 0.6 : 0.1;
        pool.wingR.setMatrixAt(i, _w.copy(_m).multiply(_r.makeTranslation(0.08, 0, 0)).multiply(_r.makeRotationZ(flap)));
        pool.wingL.setMatrixAt(i, _w.copy(_m).multiply(_r.makeTranslation(-0.08, 0, 0)).multiply(_r.makeRotationZ(-flap)).multiply(_r.makeScale(-1, 1, 1)));
      }
      i++;
    }
    for (const im of [pool.body, pool.wingL, pool.wingR]) if (im) { im.count = i; im.instanceMatrix.needsUpdate = true; }
  }
}
