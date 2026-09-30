// LOD a livelli: Near = terreno completo, Far = solo sfera a bassa densità.
// Max una ricostruzione di chunk-geometria per frame.
export class LODManager {
  constructor(){ this.queue = []; this.lastBuild = 0; }
  update(focusPos, bodies, now){
    for (const b of bodies){
      if (!b.surface) continue;
      const d = focusPos.distanceTo(b.pos);
      const r = b.radius;
      const tier = d < r * 6 ? 2 : d < r * 20 ? 1 : 0;
      if (tier !== b.surface.tier) this.queue.push({ b, tier, d });
      if (b.cloudMesh) b.cloudMesh.visible = d < r * 40;
    }
    this.queue.sort((a, c) => a.d - c.d);
    if (this.queue.length && now - this.lastBuild > 120){
      const { b, tier } = this.queue.shift();
      b.surface.setTier(tier);
      this.lastBuild = now;
    }
    if (this.queue.length > 6) this.queue.length = 6;
  }
}