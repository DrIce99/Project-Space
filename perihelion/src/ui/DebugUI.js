import { el, show, fmt } from '../core/Util.js';
import { WARP_LEVELS } from '../core/Time.js';

export class DebugUI {
  constructor(game){
    this.game = game; this.visible = false; this.sel = null;
  }
  toggle(){
    this.visible = !this.visible; show(el('debugPanel'), this.visible);
    if (this.visible) this.build();
  }
  build(){
    const g = this.game, p = el('debugPanel');
    const opts = g.system.bodies.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    p.innerHTML = `
      <h4>SOLAR SYSTEM DEBUGGER</h4>
      <div id="dbgStats"></div>
      <h4>TEMPO</h4>
      <div class="btns">${WARP_LEVELS.map(w => `<button class="btn ghost" data-w="${w}">×${w}</button>`).join('')}</div>
      <h4>CORPO</h4>
      <select id="dbgBody">${opts}</select>
      <div class="btns" style="margin-top:8px">
        <button class="btn ghost" id="dbgTp">TELETRASPORTO</button>
        <button class="btn ghost" id="dbgM+">MASSA +20%</button>
        <button class="btn ghost" id="dbgM-">MASSA −20%</button>
        <button class="btn ghost" id="dbgA+">ORBITA +10%</button>
        <button class="btn ghost" id="dbgR+">ROTAZIONE +20%</button>
      </div>
      <h4>SISTEMA</h4>
      <div class="btns">
        <button class="btn ghost" id="dbgJson">ESPORTA JSON</button>
        <button class="btn ghost" id="dbgNew">NUOVO SEED</button>
      </div>`;
    p.querySelectorAll('[data-w]').forEach(b => b.onclick = () => g.time.setScale(+b.dataset.w));
    p.querySelector('#dbgTp').onclick = () => g.teleport(p.querySelector('#dbgBody').value);
    const mut = fn => () => { const b = g.system.get(p.querySelector('#dbgBody').value); if (b) fn(b); };
    p.querySelector('#dbgM+').onclick = mut(b => b.mass *= 1.2);
    p.querySelector('#dbgM-').onclick = mut(b => b.mass *= 0.8);
    p.querySelector('#dbgA+').onclick = mut(b => {
      if (!b.def.orbit || !b.parent) return;
      b.def.orbit.a *= 1.1;
      b.def.orbit.period = Math.PI * 2 * Math.sqrt(b.def.orbit.a ** 3 / b.parent.mass);
    });
    p.querySelector('#dbgR+').onclick = mut(b => b.def.rotation.period *= 0.8);
    p.querySelector('#dbgJson').onclick = () => {
      const json = JSON.stringify(g.system.toJSON());
      navigator.clipboard?.writeText(json);
      console.log(json);
      g.notifyHUD('JSON del sistema in console/clipboard');
    };
    p.querySelector('#dbgNew').onclick = () => g.loadSystem((Math.random() * 2 ** 31) | 0);
  }
  update(){
    if (!this.visible) return;
    const g = this.game, s = el('dbgStats');
    if (!s) return;
    const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
    const focus = g.mode === 'EVA' ? g.eva.pos : g.ship.pos;
    s.innerHTML =
      kv('FPS', g.fps.toFixed(0)) +
      kv('TRIANGOLI', fmt(g.renderer.info.render.triangles)) +
      kv('DRAW CALLS', g.renderer.info.render.calls) +
      kv('POS', `${focus.x.toFixed(0)}, ${focus.y.toFixed(0)}, ${focus.z.toFixed(0)}`) +
      kv('VEL', fmt(g.ship.vel.length(), 1) + ' u/s') +
      kv('DOMINANTE', g.domBody?.name ?? '—') +
      kv('ALTITUDINE', g.ship.groundAlt != null ? fmt(g.ship.groundAlt * 50) + ' m' : '—') +
      kv('SEED', g.system.seed) +
      kv('CORPI', g.system.bodies.length) +
      kv('CHUNK LOD', g.system.bodies.filter(b => b.surface?.tier === 2).length + ' dettagliati');
  }
}