import { computeRelative, formatDistance } from '../systems/RelativeVelocitySystem.js';

// Pannello del corpo celeste linkato: nome/distanza/velocità di chiusura, più due indicatori
// tratteggiati (orizzontale e verticale) che mostrano la velocità RELATIVA del corpo rispetto al
// player, non la sua posizione — costruisce il proprio DOM/SVG, così index.html resta invariato.
// Ispirato per leggibilità ai reticoli di Outer Wilds, ma con grafica e codice originali.
export class LinkedPlanetHUD {
  constructor({ sensitivity = 2.2, maxLen = 42 } = {}) {
    this.sensitivity = sensitivity; // configurabile: quanto una data velocità relativa allunga la freccia
    this.maxLen = maxLen; // configurabile: lunghezza massima della freccia, in unità SVG (il riquadro è ±50)

    const el = document.createElement('div');
    el.style.cssText = `position:fixed;top:12px;right:12px;width:190px;padding:10px 12px;
      background:rgba(4,10,14,.72);border:1px solid #2a4a52;border-radius:6px;
      color:#9fd;font:12px/1.5 monospace;text-align:center;display:none;`;
    el.innerHTML = `
      <div id="lp-name" style="font-weight:bold;letter-spacing:.05em;margin-bottom:6px"></div>
      <div>Distanza: <span id="lp-dist"></span></div>
      <div style="margin-top:4px">Velocità relativa:</div>
      <div id="lp-vel" style="font-size:14px;margin-bottom:4px"></div>
      <svg viewBox="-55 -55 110 110" width="100" height="100" style="margin-top:2px">
        <rect x="-50" y="-50" width="100" height="100" rx="6" fill="none" stroke="#2a4a52"/>
        <line id="lp-hl" x1="0" y1="0" x2="0" y2="0" stroke="#9fd" stroke-width="2" stroke-dasharray="5 4"/>
        <polygon id="lp-ha" points="-6,-5 6,0 -6,5" fill="#9fd"/>
        <line id="lp-vl" x1="0" y1="0" x2="0" y2="0" stroke="#9fd" stroke-width="2" stroke-dasharray="5 4"/>
        <polygon id="lp-va" points="-5,6 0,-6 5,6" fill="#9fd"/>
        <circle r="3" fill="#fff"/>
      </svg>`;
    document.body.appendChild(el);
    this.el = el;
    for (const id of ['lp-name', 'lp-dist', 'lp-vel', 'lp-hl', 'lp-ha', 'lp-vl', 'lp-va']) this[id] = el.querySelector('#' + id);
  }
  // link: PlanetLinkSystem. player: nave o astronauta attivi (position/velocity/quaternion).
  update(link, player) {
    const target = link.linked;
    if (!target) { this.el.style.display = 'none'; return; }
    this.el.style.display = '';
    const { distance, closingSpeed, local } = computeRelative(player, target);
    this['lp-name'].textContent = target.name;
    this['lp-dist'].textContent = formatDistance(distance);
    this['lp-vel'].textContent = `${closingSpeed.toFixed(0)} m/s`;

    // Frecce = velocità relativa nello spazio locale del player (X destra/sinistra, Y alto/basso),
    // MAI la posizione del pianeta: il pianeta può stare a sinistra pur muovendosi verso destra.
    const hx = clamp(local.x * this.sensitivity, -this.maxLen, this.maxLen);
    const vy = clamp(local.y * this.sensitivity, -this.maxLen, this.maxLen); // >0 = il pianeta sale rispetto al player
    this['lp-hl'].setAttribute('x2', hx);
    this['lp-ha'].setAttribute('transform', `translate(${hx},0)${hx < 0 ? ' scale(-1,1)' : ''}`);
    const svgY = -vy; // asse Y dell'SVG è invertito rispetto a "su" nel mondo di gioco
    this['lp-vl'].setAttribute('y2', svgY);
    this['lp-va'].setAttribute('transform', `translate(0,${svgY})${vy < 0 ? ' scale(1,-1)' : ''}`);
  }
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
