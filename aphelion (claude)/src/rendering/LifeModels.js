import * as THREE from 'three';

// Modelli low-poly delle specie, costruiti con primitive a partire dalla forma e dai colori generati.
// Ogni modello è alto ~1 (o lungo ~1 per gli animali), base al suolo in y = 0, fronte verso -Z: la scala
// della specie e dell'individuo si applica dopo. Parti "glow" (bioluminescenza) separate: vanno disegnate
// con un materiale non illuminato, così brillano anche di notte.

// Unisce parti { geo, color, glow } in due insiemi di array non indicizzati (lit, glow).
function merge(parts) {
  const out = { lit: { pos: [], nor: [], col: [] }, glow: { pos: [], nor: [], col: [] } };
  for (const { geo, color, glow } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array, o = glow ? out.glow : out.lit;
    for (let i = 0; i < p.length; i += 3) { o.pos.push(p[i], p[i + 1], p[i + 2]); o.nor.push(n[i], n[i + 1], n[i + 2]); o.col.push(...color); }
    geo.dispose(); if (g !== geo) g.dispose();
  }
  const pack = s => s.pos.length ? { pos: new Float32Array(s.pos), nor: new Float32Array(s.nor), col: new Float32Array(s.col) } : null;
  return { lit: pack(out.lit), glow: pack(out.glow) };
}

const at = (geo, x, y, z) => geo.translate(x, y, z);
const darker = (c, k) => c.map(v => v * k);

// Piante, funghi ed estremofili: forme statiche
export function floraTemplate(sp) {
  const c = sp.color, c2 = sp.color2, P = [];
  const add = (geo, color, glow = false) => P.push({ geo, color, glow });
  switch (sp.form) {
    case 'tree-cone':
      add(at(new THREE.CylinderGeometry(.04, .06, .35, 5), 0, .12, 0), c2);
      add(at(new THREE.ConeGeometry(.3, .55, 7), 0, .5, 0), c);
      add(at(new THREE.ConeGeometry(.22, .45, 7), 0, .78, 0), darker(c, .85));
      break;
    case 'tree-umbrella':
      add(at(new THREE.CylinderGeometry(.035, .055, .8, 5), 0, .35, 0), c2);
      add(at(new THREE.SphereGeometry(.45, 8, 4).scale(1, .22, 1), 0, .82, 0), c);
      break;
    case 'tree-round':
      add(at(new THREE.CylinderGeometry(.04, .07, .55, 5), 0, .22, 0), c2);
      add(at(new THREE.IcosahedronGeometry(.32, 0).scale(1, .85, 1), 0, .7, 0), c);
      add(at(new THREE.IcosahedronGeometry(.2, 0), .18, .58, .08), darker(c, .85));
      break;
    case 'shrub':
      add(at(new THREE.IcosahedronGeometry(.5, 0).scale(1, .7, 1), 0, .3, 0), c);
      break;
    case 'succulent':
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7, h = .5 + .25 * (i % 2);
        add(at(new THREE.CylinderGeometry(.09, .11, h, 6), Math.cos(a) * .14, h / 2, Math.sin(a) * .14), c);
        add(at(new THREE.SphereGeometry(.09, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), Math.cos(a) * .14, h, Math.sin(a) * .14), darker(c, 1.2));
      }
      break;
    case 'tuft':
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26, blade = new THREE.ConeGeometry(.05, 1, 3, 1, true).translate(0, .5, 0).rotateZ(.35 * Math.cos(a)).rotateX(.35 * Math.sin(a));
        add(at(blade, Math.cos(a) * .08, 0, Math.sin(a) * .08), darker(c, .8 + .1 * (i % 3)));
      }
      break;
    case 'mat': case 'crust': // cupole basse in parte interrate: seguono anche i pendii senza sporgere come lastre
      add(at(new THREE.SphereGeometry(.5, 7, 2, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .18, 1), 0, -.02, 0), c);
      add(at(new THREE.SphereGeometry(.28, 5, 2, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .3, 1), .22, -.02, -.12), darker(c, .85));
      break;
    case 'crystal':
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25, h = .5 + .5 * ((i * 7) % 5) / 5;
        add(at(new THREE.ConeGeometry(.08, h, 4).translate(0, h / 2, 0).rotateZ(.3 * Math.cos(a)).rotateX(.3 * Math.sin(a)), Math.cos(a) * .1, 0, Math.sin(a) * .1), c);
      }
      break;
    case 'cap': case 'cluster': {
      const n = sp.form === 'cap' ? 1 : 3;
      for (let i = 0; i < n; i++) {
        const s = n === 1 ? 1 : .6 - .1 * i, x = n === 1 ? 0 : Math.cos(i * 2.1) * .2, z = n === 1 ? 0 : Math.sin(i * 2.1) * .2;
        add(at(new THREE.CylinderGeometry(.06 * s, .08 * s, .6 * s, 6), x, .3 * s, z), sp.color2);
        add(at(new THREE.SphereGeometry(.3 * s, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .6, 1), x, .58 * s, z), sp.glow ?? c, !!sp.glow);
      }
      break;
    }
    default: return null;
  }
  return merge(P);
}

// Animali: corpo (con zampe o testa) in un'unica geometria; per i volatili le ali sono a parte (battito).
export function faunaTemplate(sp) {
  const c = sp.color, c2 = sp.color2, P = [], add = (geo, color) => P.push({ geo, color });
  if (sp.form === 'flyer') {
    add(new THREE.SphereGeometry(.12, 8, 6).scale(1, .9, 2.2), c);
    add(at(new THREE.SphereGeometry(.08, 6, 4), 0, .04, -.27), c2);
    add(at(new THREE.ConeGeometry(.08, .25, 4).rotateX(Math.PI / 2), 0, 0, .35), darker(c, .8));
    const wing = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -.12, .55, 0, .05, 0, 0, .14, 0, 0, -.12, 0, 0, .14, .55, 0, .05], 3));
    const w = merge([{ geo: wing, color: darker(c, .9) }]);
    return { body: merge(P), wing: w };
  }
  const legs = sp.legs, legLen = legs === 2 ? .55 : legs === 6 ? .18 : .32, bodyY = legLen + .12;
  add(at(new THREE.SphereGeometry(.22, 9, 6).scale(1, .85, 2.1), 0, bodyY, 0), c);
  add(at(new THREE.SphereGeometry(.13, 8, 5), 0, bodyY + (legs === 2 ? .22 : .08), -.5), c2);
  add(at(new THREE.ConeGeometry(.06, .35, 5).rotateX(-Math.PI / 2 - .4), 0, bodyY + .05, .52), darker(c, .8));
  for (let i = 0; i < legs; i++) {
    const side = i % 2 ? 1 : -1, row = Math.floor(i / 2), rows = legs / 2;
    const z = rows === 1 ? 0 : -.3 + .6 * row / (rows - 1);
    add(at(new THREE.CylinderGeometry(.035, .03, legLen + .05, 4), side * .14, legLen / 2, z), darker(c, .6));
  }
  return { body: merge(P), wing: null };
}

// BufferGeometry da un insieme di array (per le InstancedMesh della fauna)
export function toGeometry(set) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(set.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(set.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(set.col, 3));
  return g;
}
