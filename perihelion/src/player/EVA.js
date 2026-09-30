import * as THREE from 'three';
import { EVA as EVA_CONFIG } from '../config/Scale.js';

const _up = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _a = new THREE.Vector3();

export class EVA {
  constructor(input){
    this.input = input;
    this.active = false;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0.25;
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

  activate(body, fromPos){
    this.active = true; this.body = body;
    this.pos.copy(fromPos);
    this.vel.set(0, 0, 0);
    this.yaw = 0; this.mesh.visible = true;
  }
  deactivate(){ this.active = false; this.mesh.visible = false; }

  update(dt, ship){
    if (!this.active || dt <= 0) return;
    const b = this.body;
    _up.copy(this.pos).sub(b.pos).normalize();
    const [mx, my] = this.input.consumeMouse();
    this.yaw -= mx * 0.0026;
    this.pitch = Math.min(1.2, Math.max(-0.5, this.pitch + my * 0.002));

    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.crossVectors(_fwd, _up).normalize();
    _fwd.crossVectors(_up, _right).normalize();

    _a.set(0, 0, 0);
    const sp = this.input.down('ShiftLeft') ? EVA_CONFIG.sprint : EVA_CONFIG.walk;
    if (this.input.down('KeyW')) _a.addScaledVector(_fwd, sp);
    if (this.input.down('KeyS')) _a.addScaledVector(_fwd, -sp);
    if (this.input.down('KeyA')) _a.addScaledVector(_right, -sp);
    if (this.input.down('KeyD')) _a.addScaledVector(_right, sp);
    if (this.grounded){ this.vel.add(_a.multiplyScalar(dt * 6)).multiplyScalar(1 - Math.min(1, dt * 5)); }
    else this.vel.addScaledVector(_a.normalize(), dt * 3);

    const g = b.mass / (this.pos.length() > 0 ? Math.max(this.pos.distanceToSquared(b.pos), 1) : 1);
    this.vel.addScaledVector(_up, -g * dt);
    this.pos.addScaledVector(this.vel, dt);

    const local = _up.clone();
    const groundR = b.surfaceRadiusAt(local.applyQuaternion(b.spinGroup.quaternion.clone().invert()));
    const dist = this.pos.distanceTo(b.pos);
    this.grounded = false;
    if (dist <= groundR + EVA.height * 0.5 && this.vel.dot(_up) <= 0){
      this.pos.copy(b.pos).addScaledVector(_up, groundR + EVA_CONFIG.height * 0.5);
      this.vel.addScaledVector(_up, -this.vel.dot(_up));
      this.grounded = true;
      if (this.input.down('Space')) this.vel.addScaledVector(_up, Math.min(12, EVA_CONFIG.jumpBase * Math.sqrt(9.8 / Math.max(g, 0.3))));
    }

    const breathable = b.def.habitability > 55 && b.def.atmosphere.pressure > 0.3;
    const nearShip = this.pos.distanceTo(ship.pos) < 7;
    if (breathable || nearShip) this.o2 = Math.min(100, this.o2 + dt * 22);
    else this.o2 = Math.max(0, this.o2 - dt * (100 / 110));

    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _up)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw));
  }
}