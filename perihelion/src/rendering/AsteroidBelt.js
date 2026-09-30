import * as THREE from 'three';
import { RNG } from '../core/RNG.js';
import { SCALE } from '../config/Scale.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

// Cintura: ogni roccia segue la propria orbita circolare kepleriana (n = √(GM/a³)).
export class AsteroidBelt {
  constructor(data, star){
    this.star = star; this.data = data;
    const rng = new RNG(data.seed);
    this.inst = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0x7a7166, flatShading: true }),
      data.count
    );
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rocks = [];
    for (let i = 0; i < data.count; i++){
      const a = data.a + (rng.next() - 0.5) * data.width * 2;
      this.rocks.push({
        a, phase: rng.range(0, Math.PI * 2), inc: rng.range(-0.06, 0.06),
        n: Math.sqrt(SCALE.G * star.mass / (a * a * a)),
        size: 0.3 + rng.next() ** 2 * 1.6, spin: rng.range(0, 6),
      });
    }
    this.inst.frustumCulled = false;
  }
  update(t, offset, focusPos){
    const near = Math.abs(focusPos.length()) < this.data.a + 2600; // distanza dalla stella
    this.inst.visible = near;
    if (!near) return;
    for (let i = 0; i < this.rocks.length; i++){
      const r = this.rocks[i];
      const th = r.phase + r.n * t;
      _p.set(Math.cos(th) * r.a, Math.sin(th * 1.3) * r.a * r.inc, Math.sin(th) * r.a)
        .add(this.star.pos).sub(offset);
      _e.set(r.spin * t * 0.1, th, 0); _q.setFromEuler(_e);
      _s.setScalar(r.size);
      _m.compose(_p, _q, _s);
      this.inst.setMatrixAt(i, _m);
    }
    this.inst.instanceMatrix.needsUpdate = true;
  }
}