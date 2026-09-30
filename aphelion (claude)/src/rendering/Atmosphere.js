import * as THREE from 'three';

// Atmosfere come passaggio a schermo intero, non come gusci-mesh. La scena viene prima disegnata in un
// render target (colore HDR + depth), poi per ogni pixel si integra lo scattering lungo il raggio di
// vista fino alla superficie realmente visibile (letta dal depth buffer). Vantaggi rispetto al guscio:
//  - un solo calcolo identico dentro e fuori dall'atmosfera: nessun cambio FrontSide/BackSide, nessuna
//    sfumatura del bordo diversa dentro/fuori → transizione continua entrando e uscendo;
//  - prospettiva aerea: il terreno lontano sfuma nel colore del cielo anche dall'interno;
//  - la trasmittanza si applica per canale al colore della scena (sole rosso al tramonto, stelle e
//    pianeti attenuati) senza trucchi di blending.

const MAX_ATMO = 32;

const SCATTERING_CORE = `
vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float cc = dot(oc, oc) - r * r;
  float disc = b * b - cc;
  if (disc < 0.0) return vec2(-1e9);
  float s = sqrt(disc);
  return vec2(-b - s, -b + s);
}

bool inPlanetShadow(vec3 pos, vec3 sunDir, vec3 center, float pRadius) {
  vec3 d = pos - center;
  float lSun = dot(d, sunDir);
  if (lSun > 0.0) return false;
  return (dot(d, d) - lSun * lSun) < pRadius * pRadius;
}

// Densità relativa a quota h: esponenziale, meno il suo valore alla sommità del guscio, così va a zero
// esattamente sul bordo (niente bordo netto visibile, nessuna sfumatura artificiale da applicare).
float density(float h, float H, float top) { return max(exp(-h / H) - exp(-top / H), 0.0); }

const int PRIMARY_STEPS = 12;
const int LIGHT_STEPS = 4;

vec3 scatterRay(vec3 origin, vec3 dir, float maxDist, vec3 center, float pRadius, float aRadius,
                vec3 betaR, float betaM, vec3 mieColor, float hR, float hM, float g,
                vec3 sunDir, vec3 sunColor, out vec3 trans) {
  trans = vec3(1.0);
  vec2 atmoHit = raySphere(origin, dir, center, aRadius);
  if (atmoHit.x < -1e8 || atmoHit.y < 0.0) return vec3(0.0);
  float start = max(atmoHit.x, 0.0);
  float end = min(atmoHit.y, maxDist); // la superficie visibile (terreno, pianeta, nave) chiude il raggio
  if (start >= end) return vec3(0.0);
  float top = aRadius - pRadius;

  float segLen = (end - start) / float(PRIMARY_STEPS);
  float t = start + segLen * 0.5;
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float odR = 0.0, odM = 0.0;
  float mu = dot(dir, sunDir);
  float g2 = g * g;
  float phaseR = 0.0596831 * (1.0 + mu * mu);
  float phaseM = 0.1193662 * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));

  for (int i = 0; i < PRIMARY_STEPS; i++) {
    vec3 pos = origin + dir * t;
    float h = max(length(pos - center) - pRadius, 0.0);
    float dR = density(h, hR, top) * segLen;
    float dM = density(h, hM, top) * segLen;
    odR += dR; odM += dM;
    if (!inPlanetShadow(pos, sunDir, center, pRadius)) {
      vec2 sunAtmo = raySphere(pos, sunDir, center, aRadius);
      float sLen = max(sunAtmo.y, 0.0) / float(LIGHT_STEPS);
      float st = sLen * 0.5, sOdR = 0.0, sOdM = 0.0;
      for (int j = 0; j < LIGHT_STEPS; j++) {
        float sh = max(length(pos + sunDir * st - center) - pRadius, 0.0);
        sOdR += density(sh, hR, top) * sLen;
        sOdM += density(sh, hM, top) * sLen;
        st += sLen;
      }
      vec3 atten = exp(-(betaR * (odR + sOdR) + vec3(betaM * 1.11 * (odM + sOdM))));
      sumR += atten * dR;
      sumM += atten * dM;
    }
    t += segLen;
  }
  trans = exp(-(betaR * odR + vec3(betaM * 1.11 * odM))); // trasmittanza per canale lungo il raggio di vista
  return sunColor * (sumR * betaR * phaseR + sumM * betaM * mieColor * phaseM); // singolo scattering
}
`;

const VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = `
#define MAX_ATMO ${MAX_ATMO}
uniform sampler2D tColor, tDepth;
uniform mat4 invProj, camWorld;
uniform vec3 camPos, camFwd, starPos, sunColor;
uniform float logFar;
uniform int count;
// per corpo: A = (centro, raggio pianeta), B = (βR, raggio atmosfera), C = (colore Mie, βM), D = (HR, HM, g, esposizione)
uniform vec4 atA[MAX_ATMO], atB[MAX_ATMO], atC[MAX_ATMO], atD[MAX_ATMO];
varying vec2 vUv;
${SCATTERING_CORE}
void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  float d = texture2D(tDepth, vUv).x;
  vec4 v = invProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize((camWorld * vec4(v.xyz / v.w, 0.0)).xyz);
  // depth logaritmico (logarithmicDepthBuffer): d = log2(1 + w) / log2(far + 1), w = profondità di vista
  float maxDist = d >= 1.0 ? 1e20 : (exp2(d * logFar) - 1.0) / max(dot(rd, camFwd), 1e-4);
  // corpi ordinati dal più lontano al più vicino: ogni atmosfera attenua e poi aggiunge luce sopra le precedenti
  for (int i = 0; i < MAX_ATMO; i++) {
    if (i >= count) break;
    vec3 c = atA[i].xyz;
    vec3 trans;
    vec3 L = scatterRay(camPos, rd, maxDist, c, atA[i].w, atB[i].w, atB[i].xyz, atC[i].w, atC[i].xyz,
                        atD[i].x, atD[i].y, atD[i].z, normalize(starPos - c), sunColor, trans);
    col = col * trans + (1.0 - exp(-L * atD[i].w));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// Esposizione "dell'occhio" per la luce diffusa, adattata alla quota. L'occhio è adattato alla luce
// stellare che arriva al pianeta (come l'illuminazione del terreno, che non cala con la distanza dalla
// stella). Dal suolo il cielo è l'unica cosa luminosa sopra di noi e l'occhio si adatta a lui; dallo
// spazio si confronta con la superficie illuminata dal sole diretto, quindi il velo atmosferico pesa
// meno: copre il colore del pianeta solo in parte. Il passaggio fra le due è continuo con la quota.
const EXPOSURE_GROUND = 20, EXPOSURE_SPACE = 6;

export class AtmospherePass {
  constructor(renderer, bodies) {
    this.renderer = renderer; this.bodies = bodies;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(size.x, size.y, THREE.FloatType)
    });
    const vec4s = () => Array.from({ length: MAX_ATMO }, () => new THREE.Vector4());
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture }, tDepth: { value: this.target.depthTexture },
        invProj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() },
        camPos: { value: new THREE.Vector3() }, camFwd: { value: new THREE.Vector3() },
        starPos: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() },
        logFar: { value: 1 }, count: { value: 0 },
        atA: { value: vec4s() }, atB: { value: vec4s() }, atC: { value: vec4s() }, atD: { value: vec4s() }
      },
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material); this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.quadCam = new THREE.Camera();
    this._order = []; this._fwd = new THREE.Vector3();
  }
  setSize(w, h) { this.target.setSize(w, h); }
  render(scene, camera, starPos, starColor) {
    const r = this.renderer, u = this.material.uniforms;
    r.setRenderTarget(this.target); r.render(scene, camera); r.setRenderTarget(null);
    u.invProj.value.copy(camera.projectionMatrixInverse); u.camWorld.value.copy(camera.matrixWorld);
    u.camPos.value.copy(camera.position); u.camFwd.value.copy(camera.getWorldDirection(this._fwd));
    u.logFar.value = Math.log2(camera.far + 1);
    u.starPos.value.copy(starPos); u.sunColor.value.copy(starColor);
    const cam = camera.position, order = this._order;
    order.length = 0; order.push(...this.bodies);
    order.sort((a, b) => b.position.distanceToSquared(cam) - a.position.distanceToSquared(cam));
    const n = Math.min(order.length, MAX_ATMO);
    for (let i = 0; i < n; i++) {
      const b = order[i], A = b.atmosphere, top = b.atmoRadius - b.radius;
      const alt = cam.distanceTo(b.position) - b.radius;
      const k = THREE.MathUtils.smoothstep(alt, 0.15 * top, top); // 0 in basso nell'atmosfera, 1 dalla sommità in su
      u.atA.value[i].set(b.position.x, b.position.y, b.position.z, b.radius);
      u.atB.value[i].set(A.rayleighCoeff[0], A.rayleighCoeff[1], A.rayleighCoeff[2], b.atmoRadius);
      u.atC.value[i].set(A.mieColor[0], A.mieColor[1], A.mieColor[2], A.mieCoeff);
      u.atD.value[i].set(A.scaleHeightR, A.scaleHeightM, A.mieG, THREE.MathUtils.lerp(EXPOSURE_GROUND, EXPOSURE_SPACE, k));
    }
    u.count.value = n;
    r.render(this.quadScene, this.quadCam);
  }
}
