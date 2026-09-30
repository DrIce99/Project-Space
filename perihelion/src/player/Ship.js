import * as THREE from 'three';
import { SHIP } from '../config/Scale.js';
import { gravityAccel, dominantBody } from '../physics/Gravity.js';

const _g = new THREE.Vector3(), _v = new THREE.Vector3(), _dir = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class Ship {
  constructor(system, input, bus){
    this.system = system; this.input = input; this.bus = bus;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.fuel = SHIP.fuelMax; this.hull = SHIP.hullMax;
    this.throttle = 0; this.sas = true;
    this.state = 'FLIGHT';
    this.landedBody = null; this.landDirLocal = new THREE.Vector3();
    this._gq = new THREE.Quaternion();
    this.mesh = this.buildMesh();
    this.engineGlow = this.mesh.userData.engineGlow;
  }

  buildMesh(){
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0xb9c6d2, roughness: 0.45, metalness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c3644, roughness: 0.6, metalness: 0.4 });
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 3.2, 10), body);
    hull.rotation.x = Math.PI / 2; g.add(hull);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.4, 10), body);
    nose.rotation.x = -Math.PI / 2; nose.position.z = -2.3; g.add(nose);
    const wingGeo = new THREE.BoxGeometry(2.6, 0.08, 1.1);
    const wing = new THREE.Mesh(wingGeo, dark); wing.position.set(0, -0.1, 0.7); g.add(wing);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.9), dark); fin.position.set(0, 0.5, 1); g.add(fin);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshStandardMaterial({ color: 0x63d3ff, emissive: 0x1a4b5e, roughness: 0.2 }));
    canopy.position.set(0, 0.38, -0.7); canopy.scale.set(1, 0.7, 1.4); g.add(canopy);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x6fd7ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.position.z = 1.9; glow.scale.setScalar(0.6); g.add(glow);
    g.userData.engineGlow = glow;
    return g;
  }

  spawnOrbit(body, distMul = 3){
    // Distanza entro la sfera di Hill: solo qui la gravità del corpo domina
    // su quella stellare e l'orbita è realmente legata al pianeta.
    let d = body.radius * distMul;
    if (body.parent && body.parent.mass > 0){
      const hill = body.def.orbit.a * Math.cbrt(body.mass / (3 * body.parent.mass));
      d = Math.min(d, hill * 0.42);        // orbite progadi stabili solo < ~0.49 Hill
      d = Math.max(d, body.radius * 2);    // mai troppo vicino alla superficie
    }
    _dir.set(0.3, 0.12, 1).normalize();
    this.pos.copy(body.pos).addScaledVector(_dir, d);
    const v = Math.sqrt(body.mass / d);    // velocità circolare locale (G = 1)
    _v.set(-_dir.z, 0, _dir.x).normalize();
    this.vel.copy(body.vel).addScaledVector(_v, v);
    const m = new THREE.Matrix4().lookAt(this.pos, body.pos, new THREE.Vector3(0, 1, 0));
    this.quat.setFromRotationMatrix(m);
    this.state = 'FLIGHT'; this.landedBody = null;
  }

  get relSpeed(){ const b = dominantBody(this.pos, this.system.bodies); return b ? this.vel.distanceTo(b.vel) : this.vel.length(); }

  update(dt){
    if (dt <= 0){ this.input.consumeMouse(); return; }
    this.throttle = Math.max(0, this.throttle - dt * 1.2);
    if (this.state === 'LANDED') return this.updateLanded(dt);
    this.rotate(dt);
    this.thrust(dt);

    gravityAccel(this.pos, this.system.bodies, _g);
    this.vel.addScaledVector(_g, dt);

    // atmosfera: resistenza aerodinamica + riscaldamento
    this.heat = 0;
    for (const b of this.system.bodies){
      const dens = b.atmosphereDensityAt(this.pos);
      if (dens > 0.001){
        _v.copy(this.vel).sub(b.vel);
        const sp = _v.length();
        this.vel.addScaledVector(_v.normalize(), -Math.min(dens * SHIP.dragK * sp * sp * dt, sp * 0.5));
        this.heat = Math.max(this.heat, dens * sp * sp * 0.0004);
      }
    }
    if (this.heat > 0.4) this.hull -= this.heat * dt * 6;

    // frenata retrograda: sincronizza la velocità col corpo dominante
    if (this.input.down('KeyX') && this.fuel > 0){
      const b = dominantBody(this.pos, this.system.bodies);
      this.vel.lerp(b.vel, 1 - Math.exp(-dt * SHIP.brakeK));
      this.fuel -= dt * SHIP.burn * 0.4;
      this.throttle = Math.max(this.throttle, 0.25);
    }

    this.pos.addScaledVector(this.vel, dt);
    this.checkLanding();
    if (this.hull <= 0) this.bus.emit('ship:destroyed');
  }

  rotate(dt){
    const [mx, my] = this.input.consumeMouse();
    let p = -my * SHIP.mouseSens, y = -mx * SHIP.mouseSens, r = 0;
    if (!this.input.locked){ // fallback tastiera se il pointer lock non è disponibile
      if (this.input.down('ArrowUp')) p = -1.4 * dt; if (this.input.down('ArrowDown')) p = 1.4 * dt;
      if (this.input.down('ArrowLeft')) y = 1.4 * dt; if (this.input.down('ArrowRight')) y = -1.4 * dt;
    }
    if (this.input.down('KeyQ')) r = 1.6 * dt;
    if (this.input.down('KeyE') && this.state === 'FLIGHT') r = -1.6 * dt;
    if (p || y || r){ _e.set(p, y, r); _q.setFromEuler(_e); this.quat.multiply(_q).normalize(); }
  }

  thrust(dt){
    _v.set(0, 0, 0);
    const boost = this.input.down('ShiftLeft') || this.input.down('ShiftRight') ? SHIP.boost : 1;
    let burning = false;
    const add = (x, y, z, k) => { _v.set(x, y, z).applyQuaternion(this.quat).multiplyScalar(k); burning = true; };
    if (this.input.down('KeyW')) add(0, 0, -1, SHIP.thrust * boost);
    if (this.input.down('KeyS')) add(0, 0, 1, SHIP.thrust * 0.7 * boost);
    if (this.input.down('KeyA')) add(-1, 0, 0, SHIP.strafe);
    if (this.input.down('KeyD')) add(1, 0, 0, SHIP.strafe);
    if (this.input.down('KeyR')) add(0, 1, 0, SHIP.strafe);
    if (this.input.down('KeyF') && !this.bus.meta?.scanning) add(0, -1, 0, SHIP.strafe);
    if (burning && this.fuel > 0){
      this.vel.addScaledVector(_v, dt);
      this.fuel = Math.max(0, this.fuel - dt * SHIP.burn * boost * (_v.length() / SHIP.thrust));
      this.throttle = Math.min(1, _v.length() / (SHIP.thrust * boost));
    }
    this.engineGlow.material.opacity = burning ? 0.9 : 0.08;
    this.engineGlow.scale.setScalar(burning ? 0.6 + this.throttle * 1.4 : 0.3);
  }

  nearestGround(){
    let best = null, bestAlt = Infinity, bestDir = _dir;
    for (const b of this.system.flatSolid()){
      const d = this.pos.distanceTo(b.pos);
      if (d > b.radius * 1.5 + 60) continue;
      _dir.copy(this.pos).sub(b.pos).normalize();
      const local = _dir.clone().applyQuaternion(this.spinInv(b));
      const alt = d - b.surfaceRadiusAt(local);
      if (alt < bestAlt){ bestAlt = alt; best = b; }
    }
    return { body: best, alt: bestAlt, dir: _dir.clone() };
  }
  spinInv(b){ return _q.copy(b.spinGroup.quaternion).invert(); }

  checkLanding(){
    const { body, alt, dir } = this.nearestGround();
    this.groundAlt = alt; this.groundBody = body;
    if (!body) return;
    if (alt < 0.4 && this.relSpeed > 13){ this.hull -= (this.relSpeed - 12) * 5; this.bus.emit('ship:impact'); }
    if (alt < SHIP.landAlt && this.relSpeed < SHIP.landMaxSpeed && this.input.down('Space')){
      this.land(body, dir);
    }
  }

  land(body, dirWorld){
    this.state = 'LANDED'; this.landedBody = body;
    this.landDirLocal.copy(dirWorld).applyQuaternion(this.spinInv(body));
    this.vel.set(0, 0, 0);
    this.bus.emit('ship:landed', body);
  }

  updateLanded(dt){
    const b = this.landedBody;
    const r = b.surfaceRadiusAt(this.landDirLocal) + SHIP.legHeight;
    _dir.copy(this.landDirLocal).applyQuaternion(b.spinGroup.quaternion);
    this.pos.copy(b.pos).addScaledVector(_dir, r);
    this.vel.copy(b.vel);
    const m = new THREE.Matrix4().lookAt(_v.set(0, 0, 0), _dir.clone().negate(), new THREE.Vector3(0, 1, 0).applyQuaternion(this._gq.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _dir)));
    this.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), _dir).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
    this.throttle = 0;
    if (this.input.down('KeyW') && this.fuel > 0) this.takeoff(_dir);
    this.input.consumeMouse();
  }

  takeoff(up){
    this.state = 'FLIGHT';
    // il lancio eredita la velocità tangenziale della superficie rotante
    const b = this.landedBody;
    const w = (Math.PI * 2 / b.def.rotation.period) * (b.def.rotation.retro ? -1 : 1);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(b.tiltGroup.quaternion);
    _v.copy(this.pos).sub(b.pos);
    const surfV = new THREE.Vector3().crossVectors(axis, _v).multiplyScalar(w);
    this.vel.copy(b.vel).add(surfV).addScaledVector(up, 5);
    this.landedBody = null;
    this.fuel = Math.min(SHIP.fuelMax, this.fuel + 25); // estrazione in superficie
    this.bus.emit('ship:takeoff', b);
  }

  altitudeOf(pos){
    const { alt } = this.nearestGround();
    return alt;
  }
}