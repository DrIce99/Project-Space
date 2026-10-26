import * as THREE from 'three';
import { EVA as EVA_CONFIG } from '../config/Scale.js';

const _a = new THREE.Vector3(), _dq = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _nf = new THREE.Vector3();
const FEET_EPS = 0.04;

// L'astronauta vive nel frame del pianeta: la sua posizione e la sua velocità
// vengono trascinate dal pianeta (orbita + rotazione), così il suolo non
// "scappa" da sotto i piedi e la direzione di sguardo non ruota col giorno.
export class EVA {
  constructor(input){
    this.input = input;
    this.active = false;
    this.body = null;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();   // vel: relativa al suolo
    this.up = new THREE.Vector3(0, 1, 0);
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.lastRot = new THREE.Quaternion(); this.lastBodyPos = new THREE.Vector3();
    this.pitch = 0.25;
    this.grounded = false;
    this.o2 = 100;
    this.mesh = this.buildMesh();
    this.mesh.visible = false;
  }

  buildMesh(){
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: 0xdfe6ec, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.8, 4, 8), suit); body.position.y = 0.85; g.add(body);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), suit); helmet.position.y = 1.55; g.add(helmet);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0x111c26, emissive: 0x1d4b5e, roughness: 0.2 }));
    visor.position.set(0, 1.55, -0.14); visor.scale.set(1, 0.8, 0.7); g.add(visor);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.26), new THREE.MeshStandardMaterial({ color: 0x8b96a2, roughness: 0.7 }));
    pack.position.set(0, 1.05, 0.3); g.add(pack);
    return g;
  }

  activate(body, fromPos, headingHint){
    this.active = true; this.body = body;
    this.pos.copy(fromPos);
    this.vel.set(0, 0, 0);
    this.lastRot.copy(body.rot); this.lastBodyPos.copy(body.pos);
    this.up.copy(fromPos).sub(body.pos).normalize();
    this.fwd.copy(headingHint ?? _nf.set(0, 0, -1));
    this.orthonormalize();
    this.grounded = false;
    this.mesh.visible = true;
  }
  deactivate(){ this.active = false; this.mesh.visible = false; }

  orthonormalize(){
    this.fwd.addScaledVector(this.up, -this.fwd.dot(this.up));
    if (this.fwd.lengthSq() < 1e-6){
      this.fwd.set(1, 0, 0).addScaledVector(this.up, -this.up.x);
      if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, 1).addScaledVector(this.up, -this.up.z);
    }
    this.fwd.normalize();
    this.right.crossVectors(this.fwd, this.up).normalize();
  }

  // trascina posizione/velocità/sguardo col moto del pianeta dall'ultimo frame
  syncFrame(){
    const b = this.body;
    _dq.copy(b.rot).multiply(_qi.copy(this.lastRot).invert());
    this.pos.sub(this.lastBodyPos).applyQuaternion(_dq).add(b.pos);
    this.vel.applyQuaternion(_dq);
    this.fwd.applyQuaternion(_dq);
    this.lastRot.copy(b.rot); this.lastBodyPos.copy(b.pos);
  }

  update(dt, ship){
    if (!this.active) return;
    if (dt <= 0){ this.input.consumeMouse(); return; }
    const b = this.body;
    this.syncFrame();
    this.up.copy(this.pos).sub(b.pos).normalize();

    const [mx, my] = this.input.consumeMouse();
    this.fwd.applyAxisAngle(this.up, -mx * 0.0026);
    this.pitch = Math.min(1.2, Math.max(-0.5, this.pitch + my * 0.002));
    this.orthonormalize();

    _a.set(0, 0, 0);
    const sp = this.input.down('ShiftLeft') ? EVA_CONFIG.sprint : EVA_CONFIG.walk;
    if (this.input.down('KeyW')) _a.addScaledVector(this.fwd, sp);
    if (this.input.down('KeyS')) _a.addScaledVector(this.fwd, -sp);
    if (this.input.down('KeyA')) _a.addScaledVector(this.right, -sp);
    if (this.input.down('KeyD')) _a.addScaledVector(this.right, sp);

    if (this.grounded){
      this.vel.addScaledVector(this.up, -this.vel.dot(this.up));          // resta tangente alla sfera
      this.vel.add(_a.multiplyScalar(dt * 6)).multiplyScalar(1 - Math.min(1, dt * 5));
    } else this.vel.addScaledVector(_a.normalize(), dt * 3);

    const g = b.mass / Math.max(this.pos.distanceToSquared(b.pos), 1);
    this.vel.addScaledVector(this.up, -g * dt);
    this.pos.addScaledVector(this.vel, dt);

    // contatto col terreno (i piedi sono all'origine del modello)
    this.up.copy(this.pos).sub(b.pos);
    const dist = this.up.length();
    this.up.divideScalar(dist || 1);
    const groundR = b.surfaceRadiusAtWorldDir(this.up);
    // I pianeti sono minuscoli: camminando si va quasi alla velocità orbitale locale e un
    // moto balistico staccherebbe dal suolo. Se si era a terra si resta "incollati" alla
    // superficie (segue anche i dislivelli); solo il salto torna balistico.
    const wasGrounded = this.grounded;
    const stick = wasGrounded ? 0.35 : FEET_EPS;
    this.grounded = false;
    if (dist <= groundR + stick && (wasGrounded || this.vel.dot(this.up) <= 0)){
      this.pos.copy(b.pos).addScaledVector(this.up, groundR + FEET_EPS);
      this.vel.addScaledVector(this.up, -this.vel.dot(this.up));
      this.grounded = true;
      if (this.input.down('Space')){
        this.vel.addScaledVector(this.up, Math.min(12, EVA_CONFIG.jumpBase * Math.sqrt(9.8 / Math.max(g, 0.3))));
        this.grounded = false;
      }
    }
    this.orthonormalize();

    const breathable = b.def.habitability > 55 && b.def.atmosphere.pressure > 0.3;
    const nearShip = this.pos.distanceTo(ship.pos) < 7;
    if (breathable || nearShip) this.o2 = Math.min(100, this.o2 + dt * 22);
    else this.o2 = Math.max(0, this.o2 - dt * (100 / 110));

    // orientamento del modello: +Y = su, il visore guarda lungo fwd (−Z locale)
    _nf.copy(this.fwd).negate();
    _m4.makeBasis(this.right, this.up, _nf);
    this.mesh.quaternion.setFromRotationMatrix(_m4);
    // la posizione del mesh la imposta Game (origine flottante)
  }
}
