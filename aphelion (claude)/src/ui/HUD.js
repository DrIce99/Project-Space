import { Vector3 } from 'three';
import { localClimate } from '../astronomy/Climate.js';
import { sunVisibility } from '../astronomy/Eclipse.js';
import { AU } from '../generation/SystemGenerator.js';
const _a = new Vector3(), _b = new Vector3(), DEG = 57.2958;

// Stagione nell'emisfero di lat: dalla declinazione della stella rispetto all'inclinazione dell'asse, e dal
// suo andamento (declinazione che cresce verso l'emisfero → primavera, che cala → autunno).
function season(body, decl, lat) {
  const tilt = Math.abs(body.tilt);
  if (tilt < 0.05) return 'nessuna (asse quasi dritto)';
  const s = _a.subVectors(body.star.position, body.position).normalize();
  const v = _b.subVectors(body.velocity, body.star.velocity), vt = v.addScaledVector(s, -v.dot(s)); // moto trasversale
  const h = lat >= 0 ? 1 : -1, x = h * decl / tilt, trend = -h * body.axis.dot(vt);
  return x > 0.5 ? 'estate' : x < -0.5 ? 'inverno' : trend >= 0 ? 'primavera' : 'autunno';
}

export class HUD {
  constructor(el) { this.el = el; }
  update(g) {
    const { time, ship, astro, mode, system } = g, o = mode === 'ship' ? ship : astro, d = o.dominant;
    if (!d) return;
    const f = (n, p = 1) => n.toFixed(p), relSpeed = f(_a.copy(o.velocity).sub(d.velocityAt(o.position, _b)).length());
    const r = o.position.distanceTo(d.position), alt = r - d.groundRadiusAt(o.position);
    const D = d.data, info = D?.atmosphere ? `\nTipo: ${D.type}  massa: ${f(d.mass, 0)}  T media annua: ${f(D.climate.meanTemp, 0)} K  P: ${f(D.atmosphere.pressure, 2)} atm  O2: ${f(D.atmosphere.oxygenLevel, 2)}  tossicità: ${f(D.atmosphere.toxicity, 2)}\nHabitability: ${f(D.habitability, 0)}   seed: ${g.seed}` : '';
    let sun = '';
    if (d.parent) {
      const el = Math.asin(_a.subVectors(system.star.position, o.position).normalize().dot(_b.subVectors(o.position, d.position).normalize())) * DEG;
      const vis = sunVisibility(o.position, system.star, system.bodies, d);
      const p = d.parent === system.star ? d : d.parent, span = p.apoapsis - p.periapsis;
      const orb = span > 1 ? `  (${f(100 * (d.starDistance - p.periapsis) / span, 0)}% periastro→afastro)` : '';
      sun = `\nSole: ${f(el, 0)}° (${el > 8 ? 'giorno' : el > -8 ? 'alba/tramonto' : 'notte'})${vis < 0.995 && el > -1 ? `   ECLISSI: ${f(100 * (1 - vis), 0)}% del disco coperto` : ''}`
        + `\nDistanza stella: ${f(d.starDistance / AU, 3)} UA${orb}   T media attuale: ${f(d.temperature, 0)} K`;
      if (D.type !== 'gas') {
        const c = localClimate(d, o.position);
        sun += `\nLat ${f(c.lat * DEG, 0)}°  declinazione stella ${f(c.decl * DEG, 1)}°  stagione: ${season(d, c.decl, c.lat)}  T locale ~${f(c.T, 0)} K`;
      }
    }
    this.el.textContent =
`t=${f(time.t, 0)}s  x${time.paused ? 0 : time.scale}   [${mode === 'ship' ? 'NAVE' : 'A PIEDI'}]
Riferimento: ${d.name}   quota: ${f(alt)}   ${(mode === 'ship' ? ship.landed : astro.grounded) ? '[A TERRA]' : ''}
Vel. relativa: ${relSpeed}   v circolare: ${f(d.circularVelocity(r))}   v fuga (sup.): ${f(d.escapeVelocity)}
g locale: ${f(o.grav.length(), 2)}${mode === 'ship' ? `   carburante: ${f(ship.fuel, 0)}%` : `   jetpack: ${f(astro.jetFuel, 0)}%${astro.jetting ? ' [SPINTA]' : ''}`}${sun}${info}
Stella ${system.star.name}: ${f(system.star.data.temperature, 0)} K   ${f(system.star.data.luminosity, 2)} L☉

${mode === 'ship' ? 'WASD spinta · Shift/F su · Ctrl giù · Frecce+Q/E rotazione · Spazio azzera vel. · E scendi (atterrato)'
  : 'WASD muovi (in volo: jetpack) · Spazio salta · Shift/F jetpack su · Ctrl giù · X stabilizza · clic+mouse guarda · E risali (vicino alla nave)'}
[ ] tempo ×½/×2 · 0 pausa · P orbite`;
  }
}
