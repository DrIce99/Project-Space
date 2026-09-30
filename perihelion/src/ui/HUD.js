import { el, show, fmt, clamp } from '../core/Util.js';

export class HUD {
  constructor(bus){
    this.bus = bus;
    this.e = {
      hud: el('hud'), mode: el('modeChip'), spd: el('spdVal'), alt: el('altVal'),
      thr: el('thrFill'), fuel: el('fuelFill'), hull: el('hullFill'), o2Row: el('o2Row'), o2: el('o2Fill'),
      warp: el('warpVal'), date: el('dateVal'), dom: el('domVal'), nav: el('navVal'),
      warn: el('warnings'), prompt: el('prompt'), notes: el('notifications'),
      reticle: el('reticle'), scanRing: el('scanRing'), heat: el('heatfx'),
      navMarker: el('navMarker'), navDist: el('navDist'),
    };
    this.notes = [];
    this.milestones = new Set();
    bus.on('discovery', d => this.notify(`◆ Scoperta registrata: <b>${d.name ?? d.id}</b>`, 'gold'));
  }

  setVisible(on){ show(this.e.hud, on); show(this.e.reticle, on); }

  notify(html, cls = ''){
    const div = document.createElement('div');
    div.className = 'note ' + cls; div.innerHTML = html;
    this.e.notes.appendChild(div);
    while (this.e.notes.children.length > 5) this.e.notes.firstChild.remove();
    setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity 1s'; setTimeout(() => div.remove(), 1000); }, 7000);
  }

  milestone(key, msg){
    if (this.milestones.has(key)) return;
    this.milestones.add(key);
    this.notify(msg, 'gold');
  }

  warn(list){
    if (this._warnKey === list.join()) return;
    this._warnKey = list.join();
    this.e.warn.innerHTML = list.map(t => `<div class="warn">${t}</div>`).join('');
  }

  update(ctx){
    const { ship, eva, mode, time, dom, alt, scan, nav } = ctx;
    this.e.mode.textContent = mode === 'EVA' ? 'SUPERFICIE — EVA' : ship.state === 'LANDED' ? 'SUPERFICIE' : 'VOLO';
    const speed = mode === 'EVA' ? eva.vel.length() : ship.relSpeed;
    this.e.spd.textContent = fmt(speed, speed < 10 ? 1 : 0);
    this.e.alt.textContent = alt == null || !isFinite(alt) ? '—' : fmt(alt * 50, 0);
    this.e.thr.style.width = (ship.throttle * 100) + '%';
    this.e.fuel.style.width = ship.fuel + '%';
    this.e.hull.style.width = clamp(ship.hull, 0, 100) + '%';
    show(this.e.o2Row, mode === 'EVA');
    if (mode === 'EVA') this.e.o2.style.width = eva.o2 + '%';
    this.e.warp.textContent = time.paused ? '❚❚ PAUSA' : '×' + time.scale;
    this.e.dom.textContent = dom ? dom.name : '—';
    this.e.nav.textContent = nav ? nav.name : '—';

    if (ctx.date) this.e.date.textContent = ctx.date;

    this.e.scanRing.style.setProperty('--scan', scan?.progress ?? 0);
    this.e.reticle.style.setProperty('--scan', scan?.progress ?? 0);
    this.e.heat.style.opacity = clamp((ship.heat ?? 0) * 1.4, 0, 0.85);

    const warns = [];
    if (ship.fuel < 15) warns.push('CARBURANTE RISERVATO — atterra per rifornire');
    if ((ship.heat ?? 0) > 0.5) warns.push('RISCALDAMENTO ATMOSFERICO');
    if (mode === 'EVA' && eva.o2 < 25) warns.push('OSSIGENO IN ESAURIMENTO — torna alla nave');
    if (ctx.crush) warns.push('PRESSIONE CRITICA — allontanati dal gigante');
    this.warn(warns);

    let prompt = '';
    if (scan?.target) prompt = `SCAN ${scan.progress >= 0 ? Math.round(scan.progress * 100) : 0}% — ${scan.target.name}`;
    else if (ctx.prompt) prompt = ctx.prompt;
    this.e.prompt.textContent = prompt;
  }
}