import * as THREE from 'three';

const TIER_DETAIL = [2, 4, 6];
const _dir = new THREE.Vector3();
const _c = new THREE.Color();

function paletteFor(def){
  const t = def.temperature.surface;
  const P = { sand: 0xc9a86a, rock: 0x8a7f72, grass: 0x4f8f4a, deep: 0x1d4d63, snow: 0xe8f2f8, ice: 0xcfe4f2, basalt: 0x3a3236, rust: 0xa65b3a, metal: 0x7d8a99 };
  if (def.type === 'volcanic') return { low: P.basalt, mid: P.basalt, high: P.rock, special: 0xff5a26 };
  if (def.type === 'desert') return { low: P.sand, mid: 0xb08a52, high: P.rock };
  if (def.type === 'ice') return { low: P.ice, mid: P.snow, high: 0xffffff };
  if (def.type === 'metallic') return { low: P.metal, mid: 0x5d6a78, high: 0xaab8c6 };
  if (t < 235) return { low: P.ice, mid: P.snow, high: 0xffffff };
  if (def.habitability >= 40) return { low: P.grass, mid: 0x3e7a46, high: P.rock, snow: P.snow };
  if (def.habitability >= 25) return { low: 0x7a8a5a, mid: P.rock, high: P.rock };
  return { low: P.rock, mid: P.rust, high: 0x6d6258 };
}

export class PlanetSurface {
  constructor(body){
    this.body = body;
    this.def = body.def;
    this.tier = -1;
    this.mesh = null;
    this.palette = paletteFor(this.def);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  }

  setTier(t){
    if (t === this.tier) return;
    this.tier = t;
    const old = this.mesh;
    this.mesh = this.build(TIER_DETAIL[t]);
    if (old){ this.body.spinGroup.remove(old); old.geometry.dispose(); }
    this.body.spinGroup.add(this.mesh);
  }

  build(detail){
    const r = this.body.radius;
    const geo = new THREE.IcosahedronGeometry(1, detail);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const s = this.def.surface;
    for (let i = 0; i < pos.count; i++){
      _dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const h = this.body.terrainHeight(_dir);
      pos.setXYZ(i, _dir.x * (r + h), _dir.y * (r + h), _dir.z * (r + h));
      this.colorFor(_dir, h, colors, i);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, this.material);
  }

  colorFor(dir, h, colors, i){
    const s = this.def.surface, P = this.palette;
    const lat = Math.abs(dir.y);
    let c = _c;
    if (s.ocean && h < s.sea + s.amp * 0.03) c.setHex(P.deep).lerp(new THREE.Color(P.sand ?? 0xc9a86a), Math.max(0, (h - s.sea + s.amp * 0.06) / (s.amp * 0.09)));
    else if (h < s.amp * 0.18) c.setHex(P.low);
    else if (h < s.amp * 0.42) c.setHex(P.mid ?? P.low);
    else c.setHex(P.high ?? P.mid ?? P.low);
    if (P.snow && (lat > 0.82 || h > s.amp * 0.55) && this.def.temperature.surface < 300) c.lerp(new THREE.Color(P.snow), 0.85);
    if (this.def.type === 'volcanic' && h < -s.amp * 0.2) c.setHex(P.special);
    const v = 0.9 + 0.2 * ((Math.sin(dir.x * 40) + Math.sin(dir.z * 37)) % 1) * 0.5; // variazione deterministica
    colors[i * 3] = c.r * v; colors[i * 3 + 1] = c.g * v; colors[i * 3 + 2] = c.b * v;
  }

  dispose(){ this.mesh?.geometry.dispose(); this.material.dispose(); }
}