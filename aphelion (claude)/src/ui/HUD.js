import { Vector3 } from 'three';
import { localClimate } from '../astronomy/Climate.js';
import { sunVisibility } from '../astronomy/Eclipse.js';
import { AU } from '../generation/SystemGenerator.js';
const _a = new Vector3(), _b = new Vector3(), DEG = 57.2958;
const ROT = { free: 'libera', locked: 'sincrona (tidally locked)', resonant: 'risonanza 3:2', chaotic: 'caotica (tumbling)' };

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
const hhmm = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor(h % 1 * 60)).padStart(2, '0')}`;
const dur = s => s === Infinity ? '∞ (giorno/notte perpetui)' : `${s.toFixed(0)} s`;

// Scheda del corpo (tasto I): proprietà generate proceduralmente
function card(d, f) {
  const D = d.data, A = D.atmosphere, rot = d.rotMode === 'free' ? `${d.spin < 0 ? 'retrograda' : 'prograda'}, periodo ${f(d.rotationPeriod, 0)} s`
    : d.rotMode === 'chaotic' ? `caotica, periodo ${f(d.rotationPeriod, 0)} s` : ROT[d.rotMode];
  const comp = Object.entries(D.composition ?? {}).filter(([, v]) => v > .005).map(([k, v]) => `${k} ${f(100 * v, 0)}%`).join(' ');
  return `\n── ${d.name}: ${D.classLabel ?? D.type}${D.traits?.length ? ` (${D.traits.join(', ')})` : ''}
Massa ${f(D.mass, D.mass < 1 ? 3 : 1)} M⊕  raggio ${f(D.realRadius ?? 0, 2)} R⊕  densità ${f(D.density ?? 0, 2)} g/cm³  gravità ${f(D.gravityG ?? 0, 2)} g  v fuga ${f(D.escapeVelocity ?? 0, 1)} km/s
Composizione: ${comp}
T equilibrio ${f(D.climate.equilibriumTemp, 0)} K  superficie ${f(D.climate.surfaceTemp ?? D.climate.meanTemp, 0)} K  pressione ${f(A.pressure, A.pressure < .01 ? 4 : 2)} atm  albedo ${f(D.albedo ?? 0, 2)}
Orbita: a ${f(d.orbit.a / (d.parent === d.star ? AU : 1), d.parent === d.star ? 3 : 0)}${d.parent === d.star ? ' UA' : ''}  e ${f(d.orbit.e, 3)}  inc ${f(d.orbit.inc * DEG, 1)}°  periodo ${f(d.period, 0)} s${d.orbit.dir < 0 ? '  retrograda' : ''}
Rotazione: ${rot}  inclinazione asse ${f(d.tilt * DEG, 1)}°`;
}

export class HUD {
  constructor(el) { this.el = el; this.details = true; }
  update(g) {
    const { time, ship, astro, mode, system } = g, o = mode === 'ship' ? ship : astro, d = o.dominant;
    if (!d) return;
    const f = (n, p = 1) => n.toFixed(p), relSpeed = f(_a.copy(o.velocity).sub(d.velocityAt(o.position, _b)).length());
    const r = o.position.distanceTo(d.position), alt = r - d.groundRadiusAt(o.position);
    const D = d.data;
    let sun = '';
    if (d.parent) {
      const vis = sunVisibility(o.position, system.star, system.bodies, d), c = localClimate(d, o.position, time.t, vis);
      const p = d.parent === system.star ? d : d.parent, span = p.apoapsis - p.periapsis, el = c.elevation * DEG;
      const orb = span > 1 ? `  (${f(100 * (d.starDistance - p.periapsis) / span, 0)}% periastro→afastro)` : '';
      sun = `\nOra locale ${hhmm(c.localTime)}  giorno solare ${dur(c.dayLength)}  Sole ${f(el, 0)}° (${el > 8 ? 'giorno' : el > -8 ? 'alba/tramonto' : 'notte'})${vis < 0.995 && el > -1 ? `   ECLISSI: ${f(100 * (1 - vis), 0)}% del disco coperto` : ''}`
        + `\nDistanza stella: ${f(d.starDistance / AU, 3)} UA${orb}   T media attuale: ${f(d.temperature, 0)} K`;
      if (D.type !== 'gas') {
        sun += `\nLat ${f(c.lat * DEG, 0)}°  declinazione stella ${f(c.decl * DEG, 1)}°  stagione: ${season(d, c.decl, c.lat)}`
          + `\nT locale ~${f(c.T, 0)} K (giorno ${f(c.Tday, 0)} / notte ${f(c.Tnight, 0)})  luce ${f(100 * c.light, 0)}%  meteo: ${c.weather}${c.wind ? `  vento ${f(c.wind, 0)} m/s` : ''}`
          + ((D.habitability ?? 0) > 5 ? `\nFlora: crescita ${f(100 * c.plants, 0)}%   fauna: ${c.fauna}` : '');
      }
    }
    const info = D?.atmosphere ? (this.details ? card(d, f) : '')
      + `\nO2: ${f(D.atmosphere.oxygenLevel, 2)} atm  tossicità: ${f(D.atmosphere.toxicity, 2)}  habitability: ${f(D.habitability, 0)}   seed: ${g.seed}` : '';
    this.el.textContent =
`t=${f(time.t, 0)}s  x${time.paused ? 0 : time.scale}   [${mode === 'ship' ? 'NAVE' : 'A PIEDI'}]
Riferimento: ${d.name}   quota: ${f(alt)}   ${(mode === 'ship' ? ship.landed : astro.grounded) ? '[A TERRA]' : ''}
Vel. relativa: ${relSpeed}   v circolare: ${f(d.circularVelocity(r))}   v fuga (sup.): ${f(d.escapeVelocity)}
g locale: ${f(o.grav.length(), 2)}${mode === 'ship' ? `   carburante: ${f(ship.fuel, 0)}%` : `   jetpack: ${f(astro.jetFuel, 0)}%${astro.jetting ? ' [SPINTA]' : ''}`}${sun}${info}
Stella ${system.star.name}: ${f(system.star.data.temperature, 0)} K   ${f(system.star.data.luminosity, 2)} L☉

${mode === 'ship' ? 'clic+mouse orienta · Q/E rollio · WASD spinta · Shift/F su · Ctrl giù · Spazio azzera vel. · Z scendi (atterrato)'
  : 'clic+mouse guarda · WASD muovi (in volo: jetpack) · Spazio salta · Shift/F jetpack su · Ctrl giù · X stabilizza · Z risali (vicino alla nave)'}
[ ] tempo ×½/×2 · 0 pausa · P orbite · I scheda corpo`;
  }
}
