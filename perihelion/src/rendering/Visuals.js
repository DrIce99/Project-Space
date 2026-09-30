import * as THREE from 'three';
import { PlanetSurface } from './PlanetSurface.js';
import { makeAtmosphere } from './AtmosphereMesh.js';
import { sampleOrbitPath } from '../physics/Kepler.js';
import { POI_TYPES } from '../generation/LoreGen.js';

function canvasTexture(size, draw){
  const c = document.createElement('canvas'); c.width = c.width = size; c.height = size / 2;
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function glowSprite(color, scale, opacity = 1){
  const tex = canvasTexture(128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    const col = '#' + new THREE.Color(color).getHexString();
    g.addColorStop(0, col); g.addColorStop(0.35, col + 'aa'); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.setScalar(scale);
  return s;
}

const STAR_VERT = `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const STAR_FRAG = `
uniform float uTime; uniform vec3 uCol; varying vec3 vP;
float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
void main(){
  float v = 0.0; float a = 0.55; vec3 p = vP * 5.0 + uTime * 0.04;
  for(int i=0;i<4;i++){ v += a * n(p); p *= 2.1; a *= 0.5; }
  vec3 c = mix(uCol * 0.7, vec3(1.0, 0.98, 0.9), smoothstep(0.35, 0.8, v));
  gl_FragColor = vec4(c * 1.6, 1.0);
}`;

export function buildStarVisual(star){
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color(star.def.color) } },
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(star.radius, 48, 32), mat);
  g.add(mesh);
  g.add(glowSprite(star.def.color, star.radius * 7, 0.9));
  g.add(glowSprite(0xffffff, star.radius * 3.2, 0.55));
  star.group.add(g);
  star.visualExtras.push({ mat });
  return g;
}

function buildGasTexture(def){
  const base = new THREE.Color().setHSL(0.06 + ((def.seed % 100) / 100) * 0.14, 0.4, 0.6);
  return canvasTexture(256, (ctx, w, h) => {
    for (let y = 0; y < h; y++){
      const t = y / h;
      const band = Math.sin(t * 26 + Math.sin(t * 9) * 2.2) * 0.5 + 0.5;
      const c = base.clone().offsetHSL(0, 0, (band - 0.5) * 0.22 + Math.sin(t * 61) * 0.03);
      ctx.fillStyle = '#' + c.getHexString();
      ctx.fillRect(0, y, w, 1);
    }
  });
}

function buildCloudTexture(def){
  const seed = def.surface.noiseSeed + 55;
  return canvasTexture(256, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      const u = x / w * 6, v = y / h * 3;
      let n = 0, a = 0.5, f = 1;
      for (let o = 0; o < 4; o++){ n += a * Math.sin(u * f * 2.1 + seed % 7 + Math.cos(v * f * 1.7)) * Math.cos(v * f + u); a *= 0.5; f *= 2; }
      const alpha = Math.max(0, Math.abs(n) - 0.42) * 3 * 255;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
  });
}

function buildPOIMesh(poi, def){
  const g = new THREE.Group();
  const M = (geo, col, em = 0) => new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, metalness: 0.2, emissive: em ? col : 0x000000, emissiveIntensity: em }));
  switch (poi.type){
    case 'monolith': 
      g.add(M(new THREE.BoxGeometry(0.7, 7, 1.6), 0x0a0d12)); 
      break;
    case 'wreck': { 
      const t = M(new THREE.TorusGeometry(2.4, 0.7, 6, 14, Math.PI * 1.3), 0x6b4a34); 
      t.rotation.set(1.2, 0.4, 0.6); 
      g.add(t); 
      g.add(M(new THREE.BoxGeometry(3, 0.8, 1.2), 0x55402f)); 
      break; 
    }
    case 'ruin': 
      for (let i = 0; i < 6; i++){ 
        const c = M(new THREE.CylinderGeometry(0.5, 0.6, 1.5 + (i * 37 % 3), 7), 0x8f8a7d); 
        const a = i / 6 * Math.PI * 2; 
        c.position.set(Math.cos(a) * 5, 1, Math.sin(a) * 5); 
        c.rotation.z = (i % 3) * 0.18; 
        g.add(c); 
      } 
      break;
    case 'signal': { 
      const pole = M(new THREE.CylinderGeometry(0.12, 0.2, 8, 6), 0x9aa4ad); 
      pole.position.y = 4; 
      g.add(pole); 
      const bulb = M(new THREE.SphereGeometry(0.5, 10, 8), 0xffb24d, 2.2); 
      bulb.position.y = 8.2; 
      g.add(bulb); 

      const glow = glowSprite(0xffb24d, 14, 0.8);
      glow.position.copy(bulb.position);
      g.add(glow); 

      g.userData.pulse = bulb; 
      break; 
    }
    case 'geyser': { 
      const vent = M(new THREE.ConeGeometry(1.6, 1.6, 8), 0x4a4038); 
      g.add(vent); 

      const glow = glowSprite(0x9fe8ff, 9, 0.55);
      glow.position.set(0, 3, 0);
      g.add(glow); 

      break; 
    }
  }
  g.userData.poi = poi;
  if (POI_TYPES[poi.type].visSpace) g.add(glowSprite(0x63d3ff, 10, 0.5));
  return g;
}

export function buildBodyVisual(body, star){
  const def = body.def;
  if (def.surface.hasSurface){
    body.surface = new PlanetSurface(body);
    body.surface.setTier(0);
    if (def.surface.ocean){
      const sea = new THREE.Mesh(
        new THREE.SphereGeometry(body.radius + def.surface.sea, 48, 32),
        new THREE.MeshPhongMaterial({ color: 0x14496b, transparent: true, opacity: 0.85, shininess: 90, specular: 0x88bbdd })
      );
      body.spinGroup.add(sea);
    }
    for (const poi of def.pois){
      const mesh = buildPOIMesh(poi, def);
      const dir = new THREE.Vector3(...poi.dir).normalize();
      mesh.position.copy(dir).multiplyScalar(body.surfaceRadiusAt(dir) + 0.3);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      body.spinGroup.add(mesh);
      body.poiMeshes.push({ poi, mesh, dir });
    }
  } else {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(body.radius, 48, 32), new THREE.MeshLambertMaterial({ map: buildGasTexture(def) }));
    body.spinGroup.add(mesh);
  }
  if (def.atmosphere.pressure > 0.05){
    body.atmoMesh = makeAtmosphere(body.radius, def.atmosphere.color, def.atmosphere.opacity);
    body.group.add(body.atmoMesh);
  }
  if (def.atmosphere.clouds > 0.15 && def.surface.hasSurface){
    const cm = new THREE.Mesh(
      new THREE.SphereGeometry(body.radius * 1.022, 40, 24),
      new THREE.MeshLambertMaterial({ map: buildCloudTexture(def), transparent: true, opacity: def.atmosphere.clouds, depthWrite: false })
    );
    body.tiltGroup.add(cm);
    body.cloudMesh = cm;
  }
  // linea d'orbita nel riferimento del genitore
  const pts = sampleOrbitPath(def.orbit);
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x63d3ff, transparent: true, opacity: 0.16, fog: false })
  );
  body.parent.group.add(line);
  body.orbitLine = line;
}