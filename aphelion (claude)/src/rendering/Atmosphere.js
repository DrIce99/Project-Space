import * as THREE from 'three';

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

const int PRIMARY_STEPS = 12;
const int LIGHT_STEPS = 4;

vec3 scatterRay(vec3 origin, vec3 dir, vec3 center, float pRadius, float aRadius,
                 vec3 betaR, float betaM, vec3 mieColor, float hR, float hM, float g,
                 vec3 sunDir, vec3 sunColor, out vec3 trans) {
  trans = vec3(1.0);
  vec2 atmoHit = raySphere(origin, dir, center, aRadius);
  if (atmoHit.x < -1e8 || atmoHit.y < 0.0 || atmoHit.x > atmoHit.y) return vec3(0.0);
  
  float start = max(atmoHit.x, 0.0);
  float end = atmoHit.y;
  vec2 planetHit = raySphere(origin, dir, center, pRadius);
  if (planetHit.x > 0.0) end = min(end, planetHit.x);
  if (start >= end) return vec3(0.0);

  float segLen = (end - start) / float(PRIMARY_STEPS);
  float t = start + segLen * 0.5;
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  float odR = 0.0;
  float odM = 0.0;
  float mu = dot(dir, sunDir);
  float g2 = g * g;
  float phaseR = 0.0596831 * (1.0 + mu * mu);
  float phaseM = 0.1193662 * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));

  for (int i = 0; i < PRIMARY_STEPS; i++) {
    vec3 pos = origin + dir * t;
    float h = max(length(pos - center) - pRadius, 0.0);
    float dR = exp(-h / hR) * segLen;
    float dM = exp(-h / hM) * segLen;
    odR += dR; odM += dM;

    if (!inPlanetShadow(pos, sunDir, center, pRadius)) {
      vec2 sunAtmo = raySphere(pos, sunDir, center, aRadius);
      float sLen = max(sunAtmo.y, 0.0) / float(LIGHT_STEPS);
      float st = sLen * 0.5, sOdR = 0.0, sOdM = 0.0;
      for (int j = 0; j < LIGHT_STEPS; j++) {
        vec3 spos = pos + sunDir * st;
        float sh = max(length(spos - center) - pRadius, 0.0);
        sOdR += exp(-sh / hR) * sLen;
        sOdM += exp(-sh / hM) * sLen;
        st += sLen;
      }
      vec3 tau = betaR * (odR + sOdR) + vec3(betaM) * 1.11 * (odM + sOdM);
      vec3 atten = exp(-tau);
      sumR += atten * dR;
      sumM += atten * dM;
    }
    t += segLen;
  }
  trans = exp(-(betaR * odR + vec3(betaM * 1.11 * odM))); // trasmittanza per canale lungo il raggio di vista
  // Radianza diffusa verso la camera (singolo scattering): sunColor è già l'irraggiamento stellare che
  // arriva in cima all'atmosfera (colore della stella × L/d²), nessun fattore arbitrario.
  return sunColor * (sumR * betaR * phaseR + sumM * betaM * mieColor * phaseM);
}
`;

const VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

const FRAG = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 center, sunDir, sunColor, mieColor, betaR;
uniform float pRadius, aRadius, betaM, hR, hM, mieG, exposure;
varying vec3 vWorldPos;
${SCATTERING_CORE}
void main() {
  #include <logdepthbuf_fragment>
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - ro);

  vec3 oc = ro - center;
  // Sfumatura del bordo del guscio: serve solo vista da fuori (il limbo). Da dentro non c'è alcun bordo
  // da nascondere, e applicarla oscurerebbe il cielo verso l'orizzonte in quota.
  float b = length(oc - rd * dot(oc, rd));
  float edgeFade = dot(oc, oc) < aRadius * aRadius ? 1.0 : smoothstep(aRadius, aRadius - hR * 2.0, b);
  if (edgeFade <= 0.0) discard;

  vec3 trans;
  vec3 col = scatterRay(ro, rd, center, pRadius, aRadius, betaR, betaM, mieColor, hR, hM, mieG, sunDir, sunColor, trans);
  vec3 mapped = (1.0 - exp(-col * exposure)) * edgeFade;

  // Composizione fisica (alpha premoltiplicato, vedi blending): risultato = sfondo × trasmittanza +
  // luce diffusa. Lo sfondo (stelle, altri corpi) viene attenuato dall'atmosfera ma mai "verniciato" di
  // nero; la luminosità del cielo dipende solo da quanta luce stellare l'atmosfera riceve e diffonde.
  float T = dot(trans, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(mapped, (1.0 - T) * edgeFade);
  #include <colorspace_fragment>
}`;

export function createAtmosphereMesh(body) {
  const A = body.atmosphere;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      center: { value: new THREE.Vector3() },
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
      sunColor: { value: new THREE.Color(1, 1, 1) },
      pRadius: { value: body.radius }, aRadius: { value: body.atmoRadius },
      betaR: { value: new THREE.Vector3(A.rayleighCoeff[0], A.rayleighCoeff[1], A.rayleighCoeff[2]) },
      betaM: { value: A.mieCoeff }, mieColor: { value: new THREE.Color(A.mieColor[0], A.mieColor[1], A.mieColor[2]) },
      mieG: { value: A.mieG }, hR: { value: A.scaleHeightR }, hM: { value: A.scaleHeightM },
      exposure: { value: SKY_EXPOSURE }
    },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    // dst = src + dst × (1 - srcAlpha) = luce diffusa + sfondo × trasmittanza
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    side: THREE.FrontSide
  });
  return new THREE.Mesh(new THREE.SphereGeometry(body.atmoRadius, 48, 32), mat);
}

// Esposizione "dell'occhio", tarata su un cielo terrestre. L'occhio è adattato alla luce stellare che
// arriva al pianeta (come l'illuminazione del terreno, che non cala con la distanza dalla stella): la
// luminosità del cielo dipende quindi da quanta di quella luce l'atmosfera intercetta e diffonde —
// densità e composizione del gas, elevazione del sole, ombra del pianeta — non da quanto è lontana la stella.
const SKY_EXPOSURE = 40;

const _sunDir = new THREE.Vector3();
export function updateAtmosphere(mesh, body, starPos, starColor, camPos) {
  const u = mesh.material.uniforms;
  u.center.value.copy(body.position);
  u.sunDir.value.copy(_sunDir.subVectors(starPos, body.position).normalize());
  u.sunColor.value.copy(starColor);
  mesh.material.side = camPos.distanceTo(body.position) < body.atmoRadius ? THREE.BackSide : THREE.FrontSide;
}

// Trasmittanza (per canale) lungo il segmento camera → stella attraverso tutte le atmosfere: la stessa
// integrazione dello shader, fatta una volta per frame sulla CPU. Serve a disegnare il disco stellare
// attenuato e arrossato (tramonto) invece di coprirlo col guscio dell'atmosfera. Niente test "pianeta
// davanti = 0": un raggio che rade o attraversa il suolo accumula da sé uno spessore ottico enorme (la
// densità sotto il raggio nominale resta quella del suolo), quindi il sole si spegne con continuità; a
// nasconderlo davvero dietro il terreno ci pensa il depth test.
const _d = new THREE.Vector3(), _oc = new THREE.Vector3(), _p = new THREE.Vector3();
const STEPS = 32;
export function transmittanceTo(camPos, target, bodies, out) {
  out.setRGB(1, 1, 1);
  const dist = _d.subVectors(target, camPos).length(); _d.divideScalar(dist);
  for (const b of bodies) {
    const A = b.atmosphere;
    _oc.subVectors(camPos, b.position);
    const tca = -_oc.dot(_d), m2 = _oc.lengthSq() - tca * tca;
    const R2 = b.atmoRadius * b.atmoRadius;
    if (m2 >= R2) continue;
    const half = Math.sqrt(R2 - m2), t0 = Math.max(tca - half, 0), t1 = Math.min(tca + half, dist);
    if (t1 <= t0) continue;
    const ds = (t1 - t0) / STEPS;
    let odR = 0, odM = 0;
    for (let i = 0; i < STEPS; i++) {
      const h = Math.max(_p.copy(camPos).addScaledVector(_d, t0 + (i + 0.5) * ds).distanceTo(b.position) - b.radius, 0);
      odR += Math.exp(-h / A.scaleHeightR) * ds; odM += Math.exp(-h / A.scaleHeightM) * ds;
    }
    const k = A.rayleighCoeff, m = A.mieCoeff * 1.11 * odM;
    out.r *= Math.exp(-(k[0] * odR + m)); out.g *= Math.exp(-(k[1] * odR + m)); out.b *= Math.exp(-(k[2] * odR + m));
  }
  return out;
}