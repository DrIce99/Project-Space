import { el, show, fmtDuration, fmt } from '../core/Util.js';

const TYPE_COL = { terran: '#7fe3a1', ocean: '#5ab8e8', desert: '#e0b06a', volcanic: '#ff7a4d', rocky: '#a8a294', metallic: '#b8c4d0', ice: '#cfe8f4', gas: '#e0c898', dwarf: '#8a8f98', star: '#ffd98a' };

export class MapUI {
  constructor(game){
    this.game = game;
    this.canvas = el('mapCanvas');
    this.ctx2d = this.canvas.getContext('2d');
    this.info = el('mapInfo');
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.selected = null;
    this.visible = false;

    this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom *= e.deltaY < 0 ? 1.12 : 0.9; this.zoom = Math.min(20, Math.max(0.2, this.zoom)); }, { passive: false });
    let drag = null;
    this.canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointermove', e => { if (drag){ this.panX += e.clientX - drag.x; this.panY += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; } });
    window.addEventListener('pointerup', () => drag = null);
    this.canvas.addEventListener('click', e => this.click(e));
  }

  toggle(){ this.visible = !this.visible; show(el('mapOverlay'), this.visible); if (this.visible) this.render(); }
  close(){ this.visible = false; show(el('mapOverlay'), false); }

  project(p){
    const r = this.canvas.getBoundingClientRect();
    const maxA = Math.max(...this.game.system.planets.map(b => b.def.orbit.a * (1 + b.def.orbit.e)));
    const s = Math.min(r.width, r.height) * 0.44 / maxA * this.zoom;
    return [r.width / 2 + p.x * s + this.panX, r.height / 2 + p.z * s + this.panY, s];
  }

  click(e){
    const r = this.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 20;
    for (const b of this.game.system.bodies){
      const [sx, sy] = this.project(b.pos);
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bd){ bd = d; best = b; }
    }
    this.selected = best;
    this.renderInfo();
  }

  renderInfo(){
    const g = this.game, b = this.selected;
    if (!b){ this.info.innerHTML = '<p class="dim">Seleziona un corpo sulla mappa.</p>'; return; }
    const known = g.discovery.has(b.id);
    const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
    this.info.innerHTML = `
      <h3>${known ? b.name : '???'}</h3>
      ${kv('Tipo', known ? b.type.toUpperCase() : '???')}
      ${kv('Raggio', known ? fmt(b.radius * 50) + ' km' : '???')}
      ${kv('Gravità sup.', known ? b.def.gravity.toFixed(1) + ' m/s²' : '???')}
      ${kv('Periodo orbitale', known ? fmtDuration(b.def.orbit.period) : '???')}
      ${kv('Eccentricità', known ? b.def.orbit.e.toFixed(3) : '???')}
      ${kv('Vivibilità', known ? b.def.habitability + '/100' : '???')}
      <div class="btns" style="margin-top:12px;display:flex;gap:8px">
        <button class="btn ghost" id="btnNav">IMPOSTA ROTTA</button>
        ${known ? '' : '<span class="dim" style="font-size:10px">Scansiona da vicino [F] per i dati</span>'}
      </div>`;
    el('btnNav').onclick = () => { g.setNav(b.id); g.notifyHUD(`Rotta impostata: ${known ? b.name : '???'}`); };
  }

  render(){
    if (!this.visible) return;
    const g = this.game, c = this.canvas, ctx = this.ctx2d;
    const r = c.getBoundingClientRect();
    if (c.width !== r.width * devicePixelRatio){ c.width = r.width * devicePixelRatio; c.height = r.height * devicePixelRatio; }
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);

    for (const b of g.system.bodies){
      if (!b.parent || b.def.orbit.e === undefined) continue;
      if (b.parent !== g.system.star && this.selected !== b.parent) continue;
      const parent = b.parent.pos;
      ctx.beginPath();
      for (let i = 0; i <= 96; i++){
        const E = i / 96 * Math.PI * 2, el2 = b.def.orbit;
        const X = el2.a * (Math.cos(E) - el2.e), Y = el2.a * Math.sqrt(1 - el2.e * el2.e) * Math.sin(E);
        const cO = Math.cos(el2.Omega), sO = Math.sin(el2.Omega), ci = Math.cos(el2.inc), si = Math.sin(el2.inc), cw = Math.cos(el2.omega), sw = Math.sin(el2.omega);
        const px = (cO * cw - sO * sw * ci) * X + (-cO * sw - sO * cw * ci) * Y;
        const pz = (sO * cw + cO * sw * ci) * X + (-sO * sw + cO * cw * ci) * Y;
        const [sx, sy] = this.project({ x: parent.x + px, z: parent.z + pz });
        i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      }
      ctx.strokeStyle = 'rgba(99,211,255,0.28)'; ctx.stroke();
    }

    for (const b of g.system.bodies){
      const [sx, sy, s] = this.project(b.pos);
      const known = g.discovery.has(b.id);
      ctx.fillStyle = TYPE_COL[b.type] ?? '#888';
      const rad = b.type === 'star' ? 7 : Math.max(2.5, Math.log2(b.radius + 1) * 1.7);
      ctx.beginPath(); ctx.arc(sx, sy, rad, 0, 7); ctx.fill();
      if (b === this.selected){ ctx.strokeStyle = '#ffb24d'; ctx.beginPath(); ctx.arc(sx, sy, rad + 5, 0, 7); ctx.stroke(); }
      ctx.fillStyle = known ? '#d6e6f2' : '#5d7286';
      ctx.font = '11px "IBM Plex Mono"';
      ctx.fillText(known ? b.name : '???', sx + rad + 4, sy + 3);
    }

    const pPos = g.mode === 'EVA' ? g.eva.pos : g.ship.pos;
    const [px, py] = this.project(pPos);
    ctx.fillStyle = '#ffb24d';
    ctx.beginPath(); ctx.moveTo(px, py - 6); ctx.lineTo(px + 5, py + 5); ctx.lineTo(px - 5, py + 5); ctx.closePath(); ctx.fill();
    ctx.font = '10px "IBM Plex Mono"'; ctx.fillText('TU', px + 8, py);

    if (g.navId){
      const nb = g.system.get(g.navId);
      const [nx, ny] = this.project(nb.pos);
      ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(255,178,77,.6)';
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke(); ctx.setLineDash([]);
    }
  }
}