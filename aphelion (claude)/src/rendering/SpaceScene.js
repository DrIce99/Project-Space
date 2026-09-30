import * as THREE from 'three';
import { PlanetTerrain } from '../world/PlanetTerrain.js';
import { createAtmosphereMesh, updateAtmosphere, transmittanceTo } from './Atmosphere.js';
import { SunLight } from './Lighting.js';
import { createStarGlow } from './StarGlow.js';
const SUN_DISK_RANGE = 40; // luminosità del disco rispetto al bianco a schermo: satura finché T > 1/40 per canale

function texture(color) { // texture procedurale semplice: rende visibile la rotazione
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
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    this.sunLight = new SunLight(system.star.color);
    this.scene.add(this.sunLight.ambient, this.sunLight.light);
    const sp = new Float32Array(6000);
    for (let i = 0; i < 6000; i += 3) new THREE.Vector3().randomDirection().multiplyScalar(1e5).toArray(sp, i);
    this.stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sp, 3)),
      new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false }));
    this.scene.add(this.stars);
    this.orbitLines = []; this.atmoBodies = [];
    this.meshes = system.bodies.map(b => {
      const mat = b.parent ? new THREE.MeshStandardMaterial({ map: texture(b.color), roughness: 1 }) : new THREE.MeshBasicMaterial({ color: b.color });
      const m = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 48, 32), mat);
      this.scene.add(m);
      if (b.orbit) {
        const pts = Array.from({ length: 129 }, (_, i) => b.offsetAt(2 * Math.PI * i / 128, new THREE.Vector3()));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x335566 }));
        line.userData.parent = b.parent; line.visible = false; this.scene.add(line); this.orbitLines.push(line);
      }
      let atmo = null;
      if (b.atmosphere && b.atmoRadius > b.radius) { atmo = createAtmosphereMesh(b); m.add(atmo); this.atmoBodies.push(b); }
      // La stella riceve il glow come sprite figlio: segue automaticamente posizione e scala del disco,
      // senza bisogno di alcun passaggio di post-processing.
      // Disco e glow vanno disegnati DOPO i gusci atmosferici (trasparenti anche loro, renderOrder più
      // alto): altrimenti il guscio, disegnato sopra, sostituisce il disco col colore del cielo. Il
      // depth test li fa comunque nascondere da terreno e pianeti; l'attenuazione dovuta all'atmosfera
      // si applica al loro colore (transmittanceTo), così il sole arrossa e si affievolisce al tramonto.
      if (!b.parent) {
        // Additivo: la luce del disco si SOMMA al cielo retrostante. Con blending normale un disco molto
        // attenuato (tramonto) sostituiva il cielo luminoso con un colore scuro, fino a diventare nero.
        mat.transparent = true; mat.blending = THREE.AdditiveBlending; m.renderOrder = 1;
        this.starMesh = m; this.starGlow = createStarGlow(b.color, b.radius, b.data.luminosity);
        this.starGlow.renderOrder = 2; m.add(this.starGlow);
      }
      return { b, m, atmo };
    });
    this.shipMesh = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    this.scene.add(this.shipMesh);
    this.terrains = new Map(); this._v = new THREE.Vector3();
    this.starColor = new THREE.Color(system.star.color);
    this.sunTrans = new THREE.Color(); this.sunTint = new THREE.Color();
  }
  // Disco stellare visto attraverso le atmosfere: colore della stella × trasmittanza per canale. Il disco
  // è migliaia di volte più luminoso del cielo, quindi (come un occhio o un sensore) satura per canale:
  // bianco a mezzogiorno, giallo → arancio → rosso man mano che il blu e poi il verde vengono estinti
  // lungo il cammino radente del tramonto. Il glow (diffusione nell'occhio) scala con la luce che arriva.
  updateStarDisk(camPos) {
    const T = transmittanceTo(camPos, this.starMesh.position, this.atmoBodies, this.sunTrans), s = this.starColor;
    const c = this.sunTint.copy(s).multiply(T), peak = Math.max(c.r, c.g, c.b);
    const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / (0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b);
    this.starGlow.visible = peak > 0;
    if (peak <= 0) { this.starMesh.material.color.setRGB(0, 0, 0); return; }
    this.starGlow.material.color.copy(c).multiplyScalar(1 / peak);
    this.starGlow.material.opacity = this.starGlow.userData.baseOpacity * Math.sqrt(lum);
    c.multiplyScalar(SUN_DISK_RANGE);
    this.starMesh.material.color.setRGB(Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b));
  }
  toggleOrbits() { for (const l of this.orbitLines) l.visible = !l.visible; }
  render(ship, camPos, camQuat) {
    for (const { b, m } of this.meshes) {
      m.position.copy(b.position); m.quaternion.copy(b.quaternion); m.updateMatrixWorld();
      if (!b.terrain) continue;
      const local = m.worldToLocal(this._v.copy(camPos)), near = local.length() < b.radius * 3;
      let t = this.terrains.get(b.id);
      if (near) { if (!t) { t = new PlanetTerrain(b); m.add(t.group); this.terrains.set(b.id, t); } t.update(local); }
      if (t) t.group.visible = near;
      m.material.visible = !near; // da vicino: terreno a chunk al posto della sfera
    }
    const starPos = this.meshes[0].b.position;
    this.sunLight.setPosition(starPos);
    for (const { b, atmo } of this.meshes) if (atmo) updateAtmosphere(atmo, b, starPos, this.starColor, camPos);
    this.updateStarDisk(camPos);
    for (const l of this.orbitLines) l.position.copy(l.userData.parent.position);
    this.shipMesh.position.copy(ship.position); this.shipMesh.quaternion.copy(ship.quaternion);
    this.camera.position.copy(camPos); this.camera.quaternion.copy(camQuat);
    this.stars.position.copy(camPos);
    this.renderer.render(this.scene, this.camera);
  }
}