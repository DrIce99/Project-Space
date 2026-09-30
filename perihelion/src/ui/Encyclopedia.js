import { el, show, fmt, fmtDuration } from '../core/Util.js';
import { TYPE_LABEL } from '../config/Scale.js';
import { habTier } from '../generation/Habitability.js';
import { POI_TYPES } from '../generation/LoreGen.js';

export class Encyclopedia {
    constructor(game) {
        this.game = game;
        this.visible = false;
        this.selected = null;
        game.bus.on('discovery', () => { if (this.visible) this.renderList(); });
    }
    toggle() { this.visible = !this.visible; show(el('encyclopedia'), this.visible); if (this.visible) { this.renderList(); this.renderDetail(); } }
    close() { this.visible = false; show(el('encyclopedia'), false); }

    renderList() {
        const g = this.game;
        const item = b => {
            const k = g.discovery.has(b.id);
            return `<div class="encItem ${this.selected === b.id ? 'sel' : ''}" data-id="${b.id}">
        <span>${k ? b.name : '???'}</span><span class="t">${k ? TYPE_LABEL[b.type] : 'IGNOTO'}</span></div>`;
        };
        el('encList').innerHTML =
            item(g.system.star) +
            g.system.planets.map(p => item(p) + p.moons?.map(m => { const mb = g.system.get(m.id); return mb ? item(mb) : ''; }).join('')).join('');
        el('encList').querySelectorAll('.encItem').forEach(n => n.onclick = () => { this.selected = n.dataset.id; this.renderList(); this.renderDetail(); });
    }

    renderDetail() {
        const g = this.game, box = el('encDetail');
        const b = this.selected ? g.system.get(this.selected) : g.system.star;
        if (!b) { box.innerHTML = '<p class="dim">Seleziona una voce.</p>'; return; }
        const known = g.discovery.has(b.id);
        const U = v => known ? v : '<span class="unknown">???</span>';
        const d = b.def;
        const cell = (l, v) => `<div class="cell"><label>${l}</label><span>${v}</span></div>`;

        const gases = (known && d.atmosphere?.composition)
            ? Object.entries(d.atmosphere.composition)
                .sort((a, c) => c[1] - a[1])
                .slice(0, 4)
                .map(([k2, v]) => `<div class="gasbar"><span style="width:38px">${k2}</span><div class="g"><i style="width:${Math.min(100, v * 100)}%"></i></div><span>${Math.round(v * 100)}%</span></div>`)
                .join('')
            : (known ? 'Assente / N/D' : '<span class="unknown">???</span>');

        const pois = known ? (d.pois || []).filter(p => g.discovery.has('poi:' + b.id + ':' + p.name)).map(p => `<div class="lore"><b style="color:var(--acc2)">${p.name} — ${POI_TYPES[p.type]?.label || ''}</b><br>${p.text}</div>`).join('') : '';

        box.innerHTML = `
      <h2>${known ? b.name : '???'}</h2>
      <div class="type">${TYPE_LABEL[b.type] || 'CORPO CELESTE'}${known && d.rotation?.locked ? ' · ROTAZIONE SINCRONA' : ''}</div>
      <div class="grid">
        ${cell('RAGGIO', U(fmt(b.radius * 50) + ' km'))}
        ${cell('GRAVITÀ SUPERFICIALE', U(d.gravity != null ? d.gravity.toFixed(1) + ' m/s²' : 'N/D'))}
        ${cell('TEMP. SUPERFICIE', U(d.temperature?.surface != null ? d.temperature.surface + ' K' : 'N/D'))}
        ${cell('PRESSIONE', U(d.atmosphere?.pressure != null ? d.atmosphere.pressure.toFixed(2) + ' bar' : '0 bar'))}
        ${cell('PERIODO ORBITALE', U(d.orbit ? fmtDuration(d.orbit.period) : 'N/D'))}
        ${cell('PERIODO ROTAZIONE', U(d.rotation ? fmtDuration(d.rotation.period) : 'N/D'))}
        ${cell('ECCENTRICITÀ', U(d.orbit ? d.orbit.e.toFixed(3) : 'N/D'))}
        ${cell('INCLINAZIONE ASSIALE', U(d.rotation ? (d.rotation.tilt * 57.3).toFixed(1) + '°' : 'N/D'))}
      </div>
      ${cell('COMPOSIZIONE ATMOSFERICA', gases)}
      <div class="cell" style="margin-top:10px"><label>VIVIBILITÀ — ${known ? habTier(d.habitability || 0) : '???'}</label>
        <span>${known ? (d.habitability || 0) + ' / 100' : '???'}</span>
        <div class="hbar"><i style="width:${known ? (d.habitability || 0) : 0}%"></i></div></div>
      ${known && d.biosphere?.categories?.length ? `<div class="cell" style="margin-top:10px"><label>BIOSFERA</label><span>${d.biosphere.categories.join(' · ')}</span></div>` : ''}
      ${known && d.climate ? `<div class="cell" style="margin-top:10px"><label>CLIMA</label><span>vento ${d.climate.wind} · tempeste ${d.climate.storms}% · nebbia ${d.climate.fog}\% · precipitazioni: ${d.climate.precipitation}</span></div>` : ''}
      ${pois}
      ${known ? '' : '<p class="dim" style="margin-top:14px">Avvicinati al corpo e tieni premuto <b style="color:var(--acc)">F</b> per completare la scansione.</p>'}
      <div style="margin-top:16px"><button class="btn ghost" id="encNav">IMPOSTA ROTTA</button></div>`;

        el('encNav').onclick = () => g.setNav(b.id);
    }
}