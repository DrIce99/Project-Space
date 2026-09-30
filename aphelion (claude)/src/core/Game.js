import { Vector3, Quaternion } from 'three';
import { Time } from './Time.js';
import { generateSystem } from '../generation/SystemGenerator.js';
import { SolarSystem } from '../astronomy/SolarSystem.js';
import { Spaceship } from '../player/Spaceship.js';
import { Astronaut } from '../player/Astronaut.js';
import { Controller } from '../player/Controller.js';
import { SpaceScene } from '../rendering/SpaceScene.js';
import { HUD } from '../ui/HUD.js';
import { ShipMarker } from '../ui/ShipMarker.js';

const IDLE = { move: new Vector3(), rot: new Vector3(), match: false, jump: false, brake: false };

// Simulazione (SolarSystem, Spaceship, Astronaut) separata da rendering, input e UI.
export class Game {
  constructor() {
    this.time = new Time(); this.mode = 'ship';
    this.seed = Number(new URLSearchParams(location.search).get('seed')) || 1; // ?seed=123
    this.system = new SolarSystem(generateSystem(this.seed));
    this.ship = new Spaceship(); this.astro = new Astronaut();
    this.input = new Controller(this.time); this.input.wantsLock = () => true; // mouse catturato in entrambe le modalità (nave e a piedi)
    this.view = new SpaceScene(this.system);
    this.hud = new HUD(document.getElementById('hud'));
    this.marker = new ShipMarker();
    this.camPos = new Vector3(); this.camQuat = new Quaternion();
    this.system.update(0);
    const worlds = this.system.bodies.filter(b => b.parent === this.system.star && b.data.type !== 'gas');
    const home = worlds.sort((a, b) => b.data.habitability - a.data.habitability)[0] ?? this.system.bodies[1];
    this.ship.spawnInOrbit(home, 100); // parte in orbita attorno al mondo più abitabile
    this.last = performance.now();
    this.loop = this.loop.bind(this); requestAnimationFrame(this.loop);
  }
  toggleMode() {
    if (this.mode === 'ship') {
      if (!this.ship.landed) return;
      this.astro.placeNear(this.ship); this.mode = 'foot';
    } else if (this.astro.position.distanceTo(this.ship.position) < 10) {
      this.mode = 'ship';
    }
  }
  loop(now) {
    requestAnimationFrame(this.loop);
    const inp = this.input.read(), foot = this.mode === 'foot';
    if (this.input.took('KeyZ')) this.toggleMode(); // Z: scendi / risali (E è il rollio della nave)
    if (this.input.took('KeyP')) this.view.toggleOrbits();
    if (this.input.took('KeyI')) this.hud.details = !this.hud.details;
    if (foot) this.astro.turn(inp.look.x, inp.look.y); else this.ship.turn(inp.look.x, inp.look.y);
    const dt = this.time.paused ? 0 : Math.min((now - this.last) / 1000, 0.05) * this.time.scale;
    this.last = now;
    const n = Math.max(1, Math.ceil(dt / 0.02)), h = dt / n;
    if (dt > 0) for (let i = 0; i < n; i++) {
      this.time.t += h; this.system.update(this.time.t);
      this.ship.step(h, this.mode === 'ship' ? inp : IDLE, this.system);
      if (this.mode === 'foot') {
        this.astro.step(h, inp, this.system);
        if (this.astro.position.distanceTo(this.ship.position) < 10) this.astro.refuel(h); // ricarica dalla nave
      }
    }
    if (this.mode === 'ship') {
      this.camQuat.copy(this.ship.quaternion);
      this.camPos.set(0, 3, 10).applyQuaternion(this.ship.quaternion).add(this.ship.position);
    } else this.astro.pose(this.camPos, this.camQuat);
    this.view.render(this.ship, this.camPos, this.camQuat, this.time.t);
    this.marker.update(this.view.camera, this.ship.position, this.mode === 'foot');
    this.hud.update(this);
  }
}