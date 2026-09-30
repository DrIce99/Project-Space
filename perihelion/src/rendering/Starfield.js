import * as THREE from 'three';

export function buildStarfield(scene){
  const g = new THREE.Group();
  const N = 4200;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++){
    let x, y, z;
    if (i % 5 < 2){ const a = Math.random() * Math.PI * 2, r = 1; y = (Math.random() - 0.5) * 0.18; x = Math.cos(a); z = Math.sin(a); } // fascia galattica
    else { const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u); x = s * Math.cos(t); y = u; z = s * Math.sin(t); }
    const R = 8800;
    pos.set([x * R, y * R, z * R], i * 3);
    c.setHSL(Math.random() < 0.12 ? 0.08 : 0.58 + Math.random() * 0.1, 0.35, 0.55 + Math.random() * 0.4);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.1, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: 0.95, fog: false }));
  g.add(pts);
  for (let i = 0; i < 3; i++){
    const cnv = document.createElement('canvas'); cnv.width = cnv.height = 256;
    const ctx = cnv.getContext('2d');
    const grd = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    const hue = [265, 200, 20][i];
    grd.addColorStop(0, `hsla(${hue},60%,50%,0.16)`); grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 256, 256);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cnv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sp.position.set((i - 1) * 4200, (i % 2 ? 900 : -700), -3800 - i * 900);
    sp.scale.setScalar(5200);
    g.add(sp);
  }
  scene.add(g);
  return g;
}