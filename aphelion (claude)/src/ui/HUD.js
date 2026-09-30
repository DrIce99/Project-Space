import { Vector3 } from 'three';
const _a = new Vector3(), _b = new Vector3();

export class HUD {
  constructor(el) { this.el = el; }
  update(g) {
    const { time, ship, astro, mode, system } = g, o = mode === 'ship' ? ship : astro, d = o.dominant;
    if (!d) return;
    const f = (n, p = 1) => n.toFixed(p), relSpeed = f(_a.copy(o.velocity).sub(d.velocityAt(o.position, _b)).length());
    const r = o.position.distanceTo(d.position), alt = r - d.groundRadiusAt(o.position);
    const D = d.data, info = D?.atmosphere ? `\nTipo: ${D.type}  T: ${f(D.climate.meanTemp, 0)} K  P: ${f(D.atmosphere.pressure, 2)} atm  O2: ${f(D.atmosphere.oxygenLevel, 2)}  tossicità: ${f(D.atmosphere.toxicity, 2)}\nHabitability: ${f(D.habitability, 0)}   seed: ${g.seed}` : '';
    let sun = '';
    if (d.parent) {
      const el = Math.asin(_a.subVectors(system.star.position, o.position).normalize().dot(_b.subVectors(o.position, d.position).normalize())) * 57.2958;
      sun = `\nSole: ${f(el, 0)}° (${el > 8 ? 'giorno' : el > -8 ? 'alba/tramonto' : 'notte'})`;
    }
    this.el.textContent =
`t=${f(time.t, 0)}s  x${time.paused ? 0 : time.scale}   [${mode === 'ship' ? 'NAVE' : 'A PIEDI'}]
Riferimento: ${d.name}   quota: ${f(alt)}   ${(mode === 'ship' ? ship.landed : astro.grounded) ? '[A TERRA]' : ''}
Vel. relativa: ${relSpeed}   v circolare: ${f(d.circularVelocity(r))}   v fuga (sup.): ${f(d.escapeVelocity)}
g locale: ${f(o.grav.length(), 2)}${mode === 'ship' ? `   carburante: ${f(ship.fuel, 0)}%` : ''}${sun}${info}
Stella ${system.star.name}: ${f(system.star.data.temperature, 0)} K   ${f(system.star.data.luminosity, 2)} L☉

${mode === 'ship' ? 'WASD/Spazio/Shift spinta · Frecce+Q/E rotazione · F azzera vel. · E scendi (atterrato)'
  : 'WASD muovi · Spazio salta · clic+mouse guarda · E risali (vicino alla nave)'}
[ ] tempo ×½/×2 · 0 pausa · P orbite`;
  }
}