export class AudioSys {
  constructor(){ this.ctx = null; this.muted = false; this.thrustGain = null; }
  ensure(){
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    // pad ambientale
    const pad = this.ctx.createGain(); pad.gain.value = 0.05; pad.connect(this.master);
    for (const f of [54, 54.6, 108.4]){
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      o.connect(pad); o.start();
    }
    // rumore propulsione
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 0.7;
    this.thrustGain = this.ctx.createGain(); this.thrustGain.gain.value = 0;
    src.connect(bp).connect(this.thrustGain).connect(this.master); src.start();
  }
  setThrust(v){ if (this.thrustGain) this.thrustGain.gain.setTargetAtTime(this.muted ? 0 : v * 0.16, this.ctx.currentTime, 0.08); }
  blip(freq = 880, dur = 0.08, vol = 0.12){
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = freq; g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.master); o.start(); o.stop(this.ctx.currentTime + dur);
  }
  chime(){ this.blip(660, 0.12); setTimeout(() => this.blip(990, 0.22), 110); }
  toggle(){ this.muted = !this.muted; return this.muted; }
}