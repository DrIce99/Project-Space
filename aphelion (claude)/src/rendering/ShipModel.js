import * as THREE from 'three';
import { applyEclipse } from './EclipseShader.js';

// Modello della nave costruito con primitive (nessun asset esterno). Assi locali: -Z = prua, +Y = alto.
// Il punto fisico della nave (usato per collisioni e atterraggio, 1.5 unità sopra il suolo) è l'origine
// del gruppo: lo scafo è abbassato di BODY_Y così che i pattini d'atterraggio tocchino terra.
const BODY_Y = -0.6;
// Uscite dei due motori (spazio locale): usate anche per far partire le scie.
export const ENGINE_EXHAUSTS = [new THREE.Vector3(-0.72, BODY_Y - 0.05, 1.75), new THREE.Vector3(0.72, BODY_Y - 0.05, 1.75)];

const hull = new THREE.MeshStandardMaterial({ color: 0xd9dee4, metalness: 0.35, roughness: 0.4 });
const dark = new THREE.MeshStandardMaterial({ color: 0x2b323c, metalness: 0.5, roughness: 0.5 });
const accent = new THREE.MeshStandardMaterial({ color: 0xe0782a, metalness: 0.2, roughness: 0.5 });
const glass = new THREE.MeshStandardMaterial({ color: 0x1d3550, metalness: 0.9, roughness: 0.12, emissive: 0x0a1a2a });
for (const m of [hull, dark, accent, glass]) applyEclipse(m); // la nave entra nell'ombra dei pianeti (lato notte, eclissi)

// Profilo (raggio, lunghezza) ruotato attorno all'asse: fusoliera affusolata, prua a -Z.
function fuselage() {
  const prof = [[0, -1.6], [0.38, -1.55], [0.5, -1.0], [0.55, -0.2], [0.52, 0.6], [0.38, 1.4], [0.18, 2.0], [0, 2.3]]; // coda → prua (y crescente: normali verso l'esterno)
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20).rotateX(-Math.PI / 2);
  g.scale(1, 0.72, 1); // sezione ellittica, più bassa che larga
  return new THREE.Mesh(g, hull);
}

// Piastra estrusa sottile da un contorno 2D nel piano XY; orient ruota la geometria nella posizione voluta.
function plate(points, thick, mat, orient) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))),
    { depth: thick, bevelEnabled: false }).translate(0, 0, -thick / 2);
  orient(g);
  return new THREE.Mesh(g, mat);
}

function wing(side) {
  // contorno in (x, z): radice larga, punta stretta e arretrata (freccia)
  const pts = [[0.35, -0.2], [2.1, 0.95], [2.1, 1.35], [0.35, 1.45]].map(([x, z]) => [x * side, z]);
  const w = plate(pts, 0.07, hull, g => g.rotateX(Math.PI / 2));
  w.rotation.z = side * 0.08; // leggero diedro
  const tip = plate([[2.0, 0.9], [2.15, 0.95], [2.15, 1.36], [2.0, 1.36]].map(([x, z]) => [x * side, z]), 0.09, accent, g => g.rotateX(Math.PI / 2));
  w.add(tip);
  w.position.y = BODY_Y - 0.08;
  return w;
}

function engine(x) {
  const g = new THREE.Group();
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.3, 16).rotateX(Math.PI / 2), hull);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.25, 16, 1, true).rotateX(Math.PI / 2), dark);
  nozzle.position.z = 0.75;
  const intake = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 16), dark); intake.position.z = -0.65;
  // Fiamma: cono additivo che si allunga con la spinta. Glow: disco sull'ugello sempre un po' acceso.
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.17, 1, 14, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2), flameMat);
  flame.position.z = 0.85;
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16), new THREE.MeshBasicMaterial({ color: 0x9fe6ff }));
  core.position.z = 0.8;
  g.add(pod, nozzle, intake, flame, core);
  g.position.set(x, BODY_Y - 0.05, 1.0);
  return { g, flame, flameMat };
}

function leg(x, z) {
  const g = new THREE.Group();
  const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.75, 6), dark);
  strut.position.y = -0.3; strut.rotation.z = -Math.sign(x) * 0.35;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.05, 10), dark);
  pad.position.set(Math.sign(x) * 0.13, -0.66, 0);
  g.add(strut, pad); g.position.set(x, BODY_Y - 0.2, z);
  return g;
}

export class ShipModel {
  constructor() {
    this.group = new THREE.Group();
    const body = fuselage(); body.position.y = BODY_Y;
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    canopy.scale.set(1, 0.9, 2.1); canopy.position.set(0, BODY_Y + 0.25, -0.35);
    const fin = plate([[1.5, 0], [0.55, 0], [1.25, 0.95], [1.6, 0.95]], 0.06, hull, g => g.rotateY(-Math.PI / 2));
    fin.position.y = BODY_Y + 0.28;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 1.6), accent); stripe.position.set(0, BODY_Y + 0.4, 0.55);
    this.engines = [engine(-0.72), engine(0.72)];
    this.group.add(body, canopy, fin, stripe, wing(1), wing(-1), ...this.engines.map(e => e.g),
      leg(-0.45, -0.9), leg(0.45, -0.9), leg(-0.6, 0.9), leg(0.6, 0.9));
    this.power = 0;
  }
  // thrust: comando di spinta in spazio locale (x destra, y alto, z indietro). La fiamma risponde con un
  // piccolo ritardo (accensione/spegnimento morbidi) e sfarfalla leggermente.
  update(thrust, dt) {
    const target = thrust.lengthSq() > 0 ? 0.35 + 0.65 * Math.max(0, -thrust.z) : 0;
    this.power += (target - this.power) * (1 - Math.exp(-10 * dt));
    const flicker = 0.9 + 0.1 * Math.sin(performance.now() * 0.05);
    for (const e of this.engines) {
      e.flame.visible = this.power > 0.01;
      e.flame.scale.set(1, 1, 0.25 + 1.3 * this.power * flicker);
      e.flameMat.opacity = Math.min(1, this.power * 1.3);
    }
  }
}
