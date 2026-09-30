export const WARP_LEVELS = [0, 1, 5, 20, 60, 300];

export class Time {
  constructor(){ this.simTime = 0; this.scale = 1; this.paused = false; this.frameDt = 0; }
  get effective(){ return this.paused ? 0 : this.scale; }
  update(dt){ this.frameDt = dt; this.simTime += dt * this.effective; }
  setScale(s){ this.scale = s; this.paused = false; }
  faster(){ const i = WARP_LEVELS.findIndex(v => v >= this.scale); this.setScale(WARP_LEVELS[Math.min(i + 1, WARP_LEVELS.length - 1)]); }
  slower(){ const i = WARP_LEVELS.findIndex(v => v >= this.scale); this.setScale(WARP_LEVELS[Math.max(i - 1, 0)]); }
  togglePause(){ this.paused = !this.paused; }
}