import * as THREE from 'three';

// Scia minimale dietro un punto della nave (uscita di un motore): nastro additivo sempre rivolto verso la
// camera, che si assottiglia e sfuma con l'età. I campioni sono memorizzati RELATIVI al corpo dominante:
// la scia mostra quindi la direzione del moto rispetto al pianeta vicino (quella che interessa pilotando),
// non la gigantesca velocità orbitale attorno alla stella. L'intensità segue la velocità relativa: da fermi
// (o atterrati) la scia sparisce.
const LIFE = 1.1, MAX = 90, WIDTH = 0.12, MIN_SPEED = 1.5, FULL_SPEED = 25, INTENSITY = 0.45;
const COLOR = new THREE.Color(0x7fd4ff);
const _w = new THREE.Vector3(), _sv = new THREE.Vector3(), _p = new THREE.Vector3(), _tan = new THREE.Vector3(),
  _view = new THREE.Vector3(), _side = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class ShipTrail {
  constructor(localOffset) {
    this.local = localOffset; this.samples = []; this.dom = null;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 2 * 3); this.col = new Float32Array(MAX * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < MAX - 1; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    }));
    this.mesh.frustumCulled = false;
  }
  update(ship, t, camPos) {
    const dom = ship.dominant, S = this.samples;
    if (!dom) { this.mesh.visible = false; return; }
    if (dom !== this.dom || (S.length && t < S[S.length - 1].t)) { S.length = 0; this.dom = dom; }
    const last = S[S.length - 1];
    if (!last || t - last.t >= 1 / 60) {
      _w.copy(this.local).applyQuaternion(ship.quaternion).add(ship.position);
      const speed = _sv.subVectors(ship.velocity, dom.velocityAt(ship.position, _sv)).length();
      S.push({ off: _w.sub(dom.position).clone(), t, s: THREE.MathUtils.smoothstep(speed, MIN_SPEED, FULL_SPEED) });
    }
    while (S.length && (t - S[0].t > LIFE || S.length > MAX)) S.shift();
    const n = S.length;
    this.mesh.visible = n > 1;
    if (n < 2) return;
    for (let i = 0; i < n; i++) {
      const s = S[i], life = 1 - (t - s.t) / LIFE, fade = INTENSITY * life * life * s.s;
      _p.copy(dom.position).add(s.off);
      _a.copy(dom.position).add(S[Math.max(i - 1, 0)].off); _b.copy(dom.position).add(S[Math.min(i + 1, n - 1)].off);
      _tan.subVectors(_b, _a);
      _side.crossVectors(_tan, _view.subVectors(camPos, _p));
      if (_side.lengthSq() < 1e-12) _side.set(0, 0, 0); else _side.normalize().multiplyScalar(WIDTH * (0.25 + 0.75 * life) / 2);
      _a.copy(_p).sub(_side).toArray(this.pos, i * 6); _b.copy(_p).add(_side).toArray(this.pos, i * 6 + 3);
      for (let k = 0; k < 2; k++) { const o = i * 6 + k * 3; this.col[o] = COLOR.r * fade; this.col[o + 1] = COLOR.g * fade; this.col[o + 2] = COLOR.b * fade; }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, (n - 1) * 6);
  }
}
