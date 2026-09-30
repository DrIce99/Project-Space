// Scansione e catalogo: i dati esistono ma sono "???" finché non vengono scoperti.
export class DiscoverySystem {
  constructor(system, bus){
    this.system = system; this.bus = bus;
    this.discovered = new Set([system.star.id]);
    this.scanTarget = null; this.progress = 0;
    this.load();
  }
  key(){ return 'ph_save_' + this.system.seed; }
  load(){
    try {
      const raw = localStorage.getItem(this.key());
      if (raw) JSON.parse(raw).forEach(id => this.discovered.add(id));
    } catch (e) {}
  }
  save(){ try { localStorage.setItem(this.key(), JSON.stringify([...this.discovered])); } catch (e) {} }
  has(id){ return this.discovered.has(id); }

  discover(id, silent = false){
    if (this.discovered.has(id)) return false;
    this.discovered.add(id); this.save();
    if (!silent) this.bus.emit('discovery', { id });
    return true;
  }

  // Tiene premuto F mirando un corpo: la portata cresce col raggio del corpo.
  update(dt, focusPos, lookDir, scanning){
    let best = null, bestScore = 0;
    for (const b of this.system.bodies){
      if (this.has(b.id)) continue;
      const to = b.pos.clone().sub(focusPos);
      const dist = to.length();
      if (dist > b.radius * 35 + 60) continue;
      const ang = to.normalize().dot(lookDir);
      const need = Math.cos(Math.asin(Math.min(1, (b.radius * 1.6) / dist)));
      if (ang > need && ang > bestScore){ bestScore = ang; best = b; }
    }
    if (!scanning || !best){ this.scanTarget = best && scanning ? best : null; this.progress = best ? this.progress : 0; if (!best) this.progress = 0; return; }
    if (this.scanTarget !== best){ this.scanTarget = best; this.progress = 0; }
    this.progress += dt / Math.min(3, Math.max(0.8, dist / (best.radius * 12)));
    if (this.progress >= 1){ this.discover(best.id); this.progress = 0; this.scanTarget = null; }
  }
}