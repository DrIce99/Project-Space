// RNG deterministico (mulberry32) + helper. Stesso seed → stessa sequenza.
export class RNG {
  constructor(seed){ this.state = seed >>> 0; this.seed = seed >>> 0; }
  next(){
    this.state = (this.state + 0x6D2B79F5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b){ return a + (b - a) * this.next(); }
  int(a, b){ return Math.floor(this.range(a, b + 1)); }
  pick(arr){ return arr[Math.floor(this.next() * arr.length)]; }
  chance(p){ return this.next() < p; }
  gauss(mean, sd){ return mean + sd * ((this.next() + this.next() + this.next()) - 1.5); }
  static fromString(str){ let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
}

const SYL = ['ka','ze','vy','or','an','th','ir','el','os','um','ar','ny','qu','si','dr','al','ur','em','ix','ob'];
export function genName(rng, maxSyl = 3){
  const n = rng.int(2, maxSyl);
  let s = ''; for (let i = 0; i < n; i++) s += rng.pick(SYL);
  return s[0].toUpperCase() + s.slice(1);
}
export const ROMAN = ['I','II','III','IV','V','VI','VII','VIII'];