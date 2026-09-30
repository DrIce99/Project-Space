import * as THREE from 'three';

// Alone atmosferico: sfera BackSide leggermente più grande, bagliore
// dipendente dall'angolo di vista e dal lato illuminato dalla stella.
const VERT = `
varying vec3 vW; varying vec3 vN;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = `
uniform vec3 uColor; uniform vec3 uSun; uniform float uIntensity;
varying vec3 vW; varying vec3 vN;
void main(){
  vec3 V = normalize(vW - cameraPosition);
  float d = dot(V, normalize(vN));
  float glow = pow(clamp(d, 0.0, 1.0), 5.0) * 1.6;
  float day = clamp(dot(normalize(vN), uSun) * 1.6 + 0.55, 0.06, 1.25);
  gl_FragColor = vec4(uColor * day, glow * uIntensity * day);
}`;

export function makeAtmosphere(radius, color, opacity){
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uIntensity: { value: opacity },
    },
    vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.12, 40, 24), mat);
  mesh.renderOrder = 2;
  return mesh;
}