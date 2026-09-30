import * as THREE from 'three';
import { RNG } from '../core/RNG.js';

const _d = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// La vegetazione deriva in modo continuo dall'habitability: densità, tipi e
// colori cambiano. Sotto 25 non c'è nulla — nessun if booleano sulla vita.
export class VegetationSystem {
  constructor(scene){ this.scene = scene; this.group = null; this.anchorId = null; this.anchorPos = new THREE.Vector3(); this.plankton = null; }

  rebuild(body, worldPos){
    this.clear();
    if (!body?.surface || body.def.habitability < 25) return;
    this.anchorId = body.id; this.anchorPos.copy(worldPos);

    const rng = new RNG(body.def.seed ^ 0xBEEF);
    const N = Math.floor(20 + (body.def.habitability - 25) * 3.2);
    const group = new THREE.Group();
    const local = body.spinGroup.worldToLocal ? null : null;
    const toLocal = w => w.clone().sub(body.pos).applyQuaternion(body.spinGroup.quaternion.clone().invert());

    const cold = body.def.temperature.surface < 250;
    const types = cold
      ? [{ geo: new THREE.SphereGeometry(0.5, 6, 5), col: 0x9fd8cc, h: [0.2, 0.8] }, { geo: new THREE.ConeGeometry(0.3, 1.6, 5), col: 0x6a9a8a, h: [0.6, 1.6] }]
      : [{ geo: new THREE.ConeGeometry(0.55, 3.2, 6), col: 0x2f7a4a, h: [1, 3.4] }, { geo: new THREE.SphereGeometry(0.7, 6, 5), col: 0x5a9a3f, h: [0.5, 1.4] }, { geo: new THREE.ConeGeometry(0.2, 5, 5), col: 0x7a5a9a, h: [1.5, 5] }];
    const meshes = types.map(t => new THREE.InstancedMesh(t.geo, new THREE.MeshLambertMaterial({ color: t.col, flatShading: true }), N));
    const counts = types.map(() => 0);

    _t1.set(worldPos.x, worldPos.y, worldPos.z).normalize(); // centro su sfera
    for (let i = 0; i < N; i++){
      _t2.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
      _d.copy(worldPos).sub(body.pos).normalize().addScaledVector(_t2, rng.range(0.05, 0.6)).normalize();
      const h = body.surfaceRadiusAt(_d.clone().applyQuaternion(body.spinGroup.quaternion.clone().invert()));
      if (body.def.surface.ocean && h < body.radius + body.def.surface.sea) continue;
      const ti = rng.int(0, types.length - 1);
      if (counts[ti] >= N) continue;
      const scale = rng.range(types[ti].h[0], types[ti].h[1]);
      _p.copy(_d).multiplyScalar(h);
      _q.setFromUnitVectors(UP, _d);
      _s.setScalar(scale);
      _m.compose(_p, _q, _s);
      meshes[ti].setMatrixAt(counts[ti]++, _m);
    }
    meshes.forEach((mm, i) => { mm.count = counts[i]; group.add(mm); });
    body.spinGroup.add(group);
    this.group = { node: group, parent: body.spinGroup, meshes };

    if (body.def.habitability > 65) this.spawnPlankton(body, worldPos);
  }

  spawnPlankton(body, worldPos){
    const n = 140, pos = new Float32Array(n * 3);
    const rng = new RNG(body.def.seed ^ 0xA11);
    const c = worldPos.clone().sub(body.pos).normalize();
    for (let i = 0; i < n; i++){
      _d.copy(c).addScaledVector(_t1.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize(), rng.range(0.05, 0.5)).normalize();
      _p.copy(_d).multiplyScalar(body.surfaceRadiusAt(_d.clone().applyQuaternion(body.spinGroup.quaternion.clone().invert())) + rng.range(1, 14));
      pos.set([_p.x, _p.y, _p.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.plankton = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfffe8, size: 0.35, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    body.spinGroup.add(this.plankton);
  }

  clear(){
    if (this.group){ this.group.meshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); }); this.group.parent.remove(this.group.node); this.group = null; }
    if (this.plankton){ this.plankton.parent?.remove(this.plankton); this.plankton.geometry.dispose(); this.plankton = null; }
    this.anchorId = null;
  }
}