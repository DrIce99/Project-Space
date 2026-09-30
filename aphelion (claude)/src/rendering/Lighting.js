import * as THREE from 'three';

// Luce diretta della stella (colore dal suo spettro) + una piccola ambientale di riempimento.
export class SunLight {
  constructor(colorHex) {
    this.light = new THREE.PointLight(colorHex, 4, 0, 0);
    this.ambient = new THREE.AmbientLight(colorHex, 0.06);
  }
  setPosition(p) { this.light.position.copy(p); }
}
