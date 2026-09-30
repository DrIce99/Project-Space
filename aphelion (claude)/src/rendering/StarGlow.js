import * as THREE from 'three';

// Glow del disco stellare come sprite billboard additivo, non post-processing: niente EffectComposer,
// niente pass da importare da CDN, niente render target extra — un singolo Sprite con una texture
// radiale disegnata su canvas, sempre rivolto verso la camera per costruzione (THREE.Sprite). Più
// robusto del bloom via UnrealBloomPass (nessuna dipendenza da esempi/jsm, nessun rischio di
// disallineamento di versione) e sufficiente per l'effetto voluto: centro intenso e definito, luminosità
// che decresce progressivamente verso l'esterno, senza bordo netto.
function radialGlowTexture() {
  const size = 256, c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // Caduta non lineare: resta quasi opaca vicino al centro (il disco solido copre comunque quella zona)
  // e sfuma con una coda morbida, evitando sia un punto duro sia un alone troppo uniforme.
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.08)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _glowTexture = radialGlowTexture();

// radius: raggio del disco della stella. luminosity: luminosità generata (relativa al Sole), usata per
// scalare intensità ed estensione del glow — una stella più luminosa produce un alone più grande e più
// intenso, non solo più chiaro.
export function createStarGlow(color, radius, luminosity) {
  const intensity = THREE.MathUtils.clamp(0.6 + 0.35 * Math.log1p(luminosity), 0.4, 1.4);
  const mat = new THREE.SpriteMaterial({
    map: _glowTexture, color: new THREE.Color(color), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: intensity, sizeAttenuation: true
  });
  const sprite = new THREE.Sprite(mat);
  const scale = radius * (5 + 2.5 * THREE.MathUtils.clamp(luminosity, 0.1, 4) ** 0.5);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}