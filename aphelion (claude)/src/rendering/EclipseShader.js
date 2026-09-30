import * as THREE from 'three';
// Ombre fra corpi celesti (eclissi) per i MeshStandardMaterial: la luce della stella viene moltiplicata,
// per frammento, per la frazione di disco stellare non coperta dagli altri corpi. Stessa formula di
// astronomy/Eclipse.js, calcolata analiticamente sulle sfere: niente shadow map (scale troppo diverse).
export const MAX_OCC = 32;
const U = {
  eclStar: { value: new THREE.Vector4() }, // centro, raggio della stella
  eclOcc: { value: Array.from({ length: MAX_OCC }, () => new THREE.Vector4()) }, // centro, raggio dei corpi
  eclCount: { value: 0 }
};

const GLSL = `
#define MAX_OCC ${MAX_OCC}
uniform vec4 eclStar, eclOcc[MAX_OCC];
uniform int eclCount, eclSelf;
varying vec3 vEclPos;
float eclDisc(float a, float b, float c) {
  if (c >= a + b) return 1.0;
  float full = 1.0 - min(1.0, (b * b) / (a * a)), lo = abs(a - b);
  if (c <= lo) return full;
  float t = (c - lo) / (a + b - lo);
  return full + (1.0 - full) * t * t * (3.0 - 2.0 * t);
}
float eclipseLight(vec3 p) {
  vec3 s = eclStar.xyz - p; float Ls = length(s); s /= Ls;
  float a = asin(min(1.0, eclStar.w / Ls)), vis = 1.0;
  for (int i = 0; i < MAX_OCC; i++) {
    if (i >= eclCount) break;
    if (i == eclSelf) continue;
    vec3 c = eclOcc[i].xyz - p; float Lc = length(c);
    if (Lc >= Ls || Lc <= eclOcc[i].w) continue;
    c /= Lc;
    float cs = dot(s, c); if (cs <= 0.0) continue;
    vis *= eclDisc(a, asin(eclOcc[i].w / Lc), atan(length(cross(s, c)), cs));
  }
  return vis;
}
`;

// selfIndex: indice del corpo che porta il materiale (escluso: il suo lato notte lo gestisce già N·L); -1 per la nave.
export function applyEclipse(material, selfIndex = -1) {
  material.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { eclSelf: { value: selfIndex } });
    sh.vertexShader = 'varying vec3 vEclPos;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vEclPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = GLSL + sh.fragmentShader.replace('#include <lights_fragment_begin>',
      THREE.ShaderChunk.lights_fragment_begin.replace('getPointLightInfo( pointLight, geometryPosition, directLight );',
        'getPointLightInfo( pointLight, geometryPosition, directLight );\n\t\tdirectLight.color *= eclipseLight(vEclPos);'));
  };
  material.customProgramCacheKey = () => 'eclipse';
  return material;
}

// occluders: i corpi nello stesso ordine usato per selfIndex
export function updateEclipseUniforms(star, occluders) {
  U.eclStar.value.set(star.position.x, star.position.y, star.position.z, star.radius);
  const n = Math.min(occluders.length, MAX_OCC);
  for (let i = 0; i < n; i++) { const b = occluders[i]; U.eclOcc.value[i].set(b.position.x, b.position.y, b.position.z, b.radius); }
  U.eclCount.value = n;
}
