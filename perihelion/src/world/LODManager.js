// LOD a livelli: Near = terreno completo, Far = solo sfera a bassa densità.
// Max una ricostruzione di geometria per intervallo, sempre sul corpo più vicino.
export class LODManager {
  constructor(){ this.lastBuild = 0; }
  update(focusPos, bodies, now){
    let pick = null, pickD = Infinity, pickTier = 0;
    for (const b of bodies){
      if (!b.surface) continue;
      const d = focusPos.distanceTo(b.pos);
      const r = b.radius;
      const tier = d < r * 6 ? 2 : d < r * 20 ? 1 : 0;
      if (tier !== b.surface.tier && d < pickD){ pick = b; pickD = d; pickTier = tier; }
      if (b.cloudMesh) b.cloudMesh.visible = d < r * 40;
    }
    if (pick && now - this.lastBuild > 120){
      pick.surface.setTier(pickTier);
      this.lastBuild = now;
    }
  }
}
