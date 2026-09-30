export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (dt, k) => 1 - Math.exp(-k * dt);

export function fmt(n, d = 0){
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + 'G';
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (abs >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return n.toFixed(d);
}
export function fmtDuration(s){
  if (s < 120) return s.toFixed(0) + ' s';
  if (s < 7200) return (s / 60).toFixed(1) + ' min';
  return (s / 3600).toFixed(1) + ' h';
}
export function el(id){ return document.getElementById(id); }
export function show(elem, on){ elem.hidden = !on; }