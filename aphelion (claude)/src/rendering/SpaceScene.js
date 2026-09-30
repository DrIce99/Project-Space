import * as THREE from 'three';
import { PlanetTerrain, surfaceTexture } from '../world/PlanetTerrain.js';
import { AtmospherePass } from './Atmosphere.js';
import { SunLight } from './Lighting.js';
import { createStarGlow } from './StarGlow.js';
import { ShipModel, ENGINE_EXHAUSTS } from './ShipModel.js';
import { ShipTrail } from './ShipTrail.js';
import { applyEclipse, updateEclipseUniforms } from './EclipseShader.js';
import { sunVisibility } from '../astronomy/Eclipse.js';
// Radianza del disco rispetto al bianco a schermo. La scena è in HDR: il passaggio atmosferico la moltiplica
// per la trasmittanza per canale, quindi il disco resta saturo (bianco) finché T > 1/40 e al tramonto
// passa a giallo → arancio → rosso man mano che blu e verde vengono estinti.
const SUN_DISK_RANGE = 40;

function texture(color) { // texture procedurale semplice per i giganti gassosi (nessun terreno): rende visibile la rotazione
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + new THREE.Color(color).getHexString(); g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * .18})`;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 128, 4 + Math.random() * 18, 0, 7); g.fill();
  }
  return new THREE.CanvasTexture(c);
}

export class SpaceScene {
  constructor(system) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setSize(innerWidth, innerHeight); document.body.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 2e5);
    this.sunLight = new SunLight(system.star.color);
    this.scene.add(this.sunLight.ambient, this.sunLight.light);
    const sp = new Float32Array(6000);
    for (let i = 0; i < 6000; i += 3) new THREE.Vector3().randomDirection().multiplyScalar(1e5).toArray(sp, i);
    this.stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sp, 3)),
      new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false }));
    this.scene.add(this.stars);
    this.orbitLines = []; this.atmoBodies = []; this.system = system;
    this.occluders = system.bodies.filter(b => b.parent); // ordine = indice usato dallo shader delle eclissi
    this.meshes = system.bodies.map(b => {
      const map = b.terrain ? surfaceTexture(b) : texture(b.color);
      // la stella è in HDR: il colore oltre 1 viene poi attenuato per canale dall'atmosfera
      const mat = b.parent ? applyEclipse(new THREE.MeshStandardMaterial({ map, roughness: 1 }), this.occluders.indexOf(b))
        : new THREE.MeshBasicMaterial({ color: new THREE.Color(b.color).multiplyScalar(SUN_DISK_RANGE) });
      const m = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 48, 32), mat);
      this.scene.add(m);
      if (b.orbit) {
        const pts = Array.from({ length: 129 }, (_, i) => b.offsetAt(2 * Math.PI * i / 128, new THREE.Vector3()));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x335566 }));
        line.userData.parent = b.parent; line.visible = false; this.scene.add(line); this.orbitLines.push(line);
      }
      if (b.atmosphere && b.atmoRadius > b.radius) this.atmoBodies.push(b);
      // Glow come sprite figlio della stella: segue posizione e scala del disco senza post-processing.
      if (!b.parent) m.add(this.glow = createStarGlow(b.color, b.radius, b.data.luminosity));
      return { b, m };
    });
    this.atmosphere = new AtmospherePass(this.renderer, this.atmoBodies);
    this.ship = new ShipModel(); this.scene.add(this.ship.group);
    this.trails = ENGINE_EXHAUSTS.map(p => new ShipTrail(p));
    for (const t of this.trails) this.scene.add(t.mesh);
    this.terrains = new Map(); this._v = new THREE.Vector3();
    this.starColor = new THREE.Color(system.star.color);
    this.lastFrame = performance.now();
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      const s = this.renderer.getDrawingBufferSize(this._v2 ??= new THREE.Vector2());
      this.atmosphere.setSize(s.x, s.y);
    });
  }
  toggleOrbits() { for (const l of this.orbitLines) l.visible = !l.visible; }
  // t: tempo di simulazione (le scie invecchiano col tempo di gioco, quindi si fermano in pausa)
  render(ship, camPos, camQuat, t) {
    const now = performance.now(), dt = Math.min((now - this.lastFrame) / 1000, 0.1); this.lastFrame = now;
    for (const { b, m } of this.meshes) {
      m.position.copy(b.position); m.quaternion.copy(b.quaternion); m.updateMatrixWorld();
      if (!b.terrain) continue;
      const local = m.worldToLocal(this._v.copy(camPos)), near = local.length() < b.radius * 3;
      let tr = this.terrains.get(b.id);
      if (near) { if (!tr) { tr = new PlanetTerrain(b, this.occluders.indexOf(b)); m.add(tr.group); this.terrains.set(b.id, tr); } tr.update(local); }
      if (tr) tr.group.visible = near;
      m.material.visible = !near; // da vicino: terreno a chunk al posto della sfera
    }
    const star = this.meshes[0].b, starPos = star.position;
    this.sunLight.setPosition(starPos);
    updateEclipseUniforms(star, this.occluders);
    // durante un'eclissi dal punto di vista della camera resta visibile solo la corona (alone attenuato)
    this.glow.material.opacity = this.glow.userData.opacity * (0.3 + 0.7 * sunVisibility(camPos, star, this.system.bodies));
    for (const l of this.orbitLines) l.position.copy(l.userData.parent.position);
    this.ship.group.position.copy(ship.position); this.ship.group.quaternion.copy(ship.quaternion);
    this.ship.update(ship.throttle, dt);
    for (const tr of this.trails) tr.update(ship, t, camPos);
    this.camera.position.copy(camPos); this.camera.quaternion.copy(camQuat);
    this.camera.updateMatrixWorld();
    this.stars.position.copy(camPos);
    // cielo durante un'eclissi: dall'interno dell'atmosfera conta la luce che arriva alla camera; da lontano
    // l'ombra (piccola rispetto al pianeta) è già visibile sulla superficie, quindi l'atmosfera resta illuminata
    this.atmosphere.render(this.scene, this.camera, starPos, this.starColor, b => {
      const k = THREE.MathUtils.smoothstep(camPos.distanceTo(b.position), b.atmoRadius * 1.2, b.atmoRadius * 2.5);
      return k >= 1 ? 1 : THREE.MathUtils.lerp(sunVisibility(camPos, star, this.system.bodies, b), 1, k);
    });
  }
}
