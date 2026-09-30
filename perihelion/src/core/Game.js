import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { Time } from './Time.js';
import { Input } from '../player/Input.js';
import { Ship } from '../player/Ship.js';
import { EVA } from '../player/EVA.js';
import { SolarSystem } from '../astronomy/SolarSystem.js';
import { generateSystem } from '../generation/SystemGenerator.js';
import { buildStarVisual, buildBodyVisual } from '../rendering/Visuals.js';
import { buildStarfield } from '../rendering/Starfield.js';
import { AsteroidBelt } from '../rendering/AsteroidBelt.js';
import { FloatingOrigin } from '../rendering/FloatingOrigin.js';
import { LODManager } from '../world/LODManager.js';
import { gravityAccel, dominantBody } from '../physics/Gravity.js';
import { DiscoverySystem } from '../systems/DiscoverySystem.js';
import { VegetationSystem } from '../systems/VegetationSystem.js';
import { AudioSys } from '../systems/AudioSys.js';
import { HUD } from '../ui/HUD.js';
import { MapUI } from '../ui/MapUI.js';
import { Encyclopedia } from '../ui/Encyclopedia.js';
import { DebugUI } from '../ui/DebugUI.js';
import { el, show, clamp, damp, fmt } from './Util.js';
import { SHIP } from '../config/Scale.js';

const _look = new THREE.Vector3(), _v = new THREE.Vector3();

export class Game {
  constructor(container){
    this.container = container;
    this.bus = new EventBus();
    this.bus.meta = {};
    this.time = new Time();
    this.input = new Input();
    this.mode = 'INTRO';
    this.fps = 60;
    this.navId = null;
    this.introAngle = 0;
  }

  boot(){
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020409);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 40000);
    this.camera.up.set(0, 1, 0);

    this.sunLight = new THREE.PointLight(0xfff2dd, 2.6, 0, 0);
    this.scene.add(this.sunLight);
    this.scene.add(new THREE.AmbientLight(0x223044, 0.5));
    this.starfield = buildStarfield(this.scene);
    this.origin = new FloatingOrigin();

    this.audio = new AudioSys();
    this.hud = new HUD(this.bus);
    this.eva = new EVA(this.input);
    this.scene.add(this.eva.mesh);
    this.lod = new LODManager();

    // 1. Instantiate UI elements BEFORE loading system
    this.mapUI = new MapUI(this);
    this.encyclopedia = new Encyclopedia(this);
    this.debug = new DebugUI(this);

    // 2. Now call loadSystem safely
    const seed = localStorage.getItem('ph_seed') || String((Math.random() * 2 ** 31) | 0);
    el('seedInput').value = seed;
    this.loadSystem(seed, true);

    this.bindUI();
    this.input.onLockChange = locked => this.onLockChange(locked);
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    this.renderer.setAnimationLoop(t => this.frame(t));
  }

  // ── costruzione / ricostruzione del sistema da seed (serializzabile) ──
  loadSystem(seed, first = false){
    localStorage.setItem('ph_seed', seed);
    if (this.system){
      this.scene.remove(this.system.scene);
      if (this.belt) this.scene.remove(this.belt.inst);
      this.system.scene.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      this.vegetation?.clear();
    }
    const data = generateSystem(seed);
    this.system = new SolarSystem(data);
    this.scene.add(this.system.scene);
    buildStarVisual(this.system.star);
    for (const b of this.system.bodies) if (b !== this.system.star) buildBodyVisual(b, this.system.star);
    if (data.belt){ this.belt = new AsteroidBelt(data.belt, this.system.star); this.scene.add(this.belt.inst); }

    this.ship = new Ship(this.system, this.input, this.bus);
    this.scene.add(this.ship.mesh);
    this.ship.spawnOrbit(this.system.home);
    this.discovery = new DiscoverySystem(this.system, this.bus);
    this.discovery.discover(this.system.home.id, true);
    this.vegetation = new VegetationSystem(this.scene);

    this.bus.on('ship:landed', b => {
      this.hud.notify(`Atterraggio su <b>${b.name}</b>. Rifornimento in corso. [E] per uscire.`);
      this.hud.milestone('land', '◆ PRIMO ATTERRAGGIO — la superficie è reale: camminaci sopra.');
    });
    this.bus.on('discovery', ({ id }) => {
      const b = this.system.get(id);
      this.audio.chime();
      if (this.encyclopedia?.visible) this.encyclopedia.renderDetail();
    });
    this.bus.on('ship:destroyed', () => this.respawn('Scafo compromesso. Navicella ricostruita in orbita.'));
    if (!first) this.hud.notify(`Nuovo sistema generato — seed <b>${seed}</b>`);
    if (this.debug?.visible) this.debug.build();
  }

  respawn(msg){
    this.ship.hull = SHIP.hullMax; this.ship.fuel = SHIP.fuelMax;
    this.ship.spawnOrbit(this.system.home);
    if (this.mode === 'EVA'){ this.eva.deactivate(); this.mode = 'FLIGHT'; }
    this.hud.notify(msg, 'bad');
  }

  bindUI(){
    el('btnStart').onclick = () => this.startGame(el('seedInput').value.trim() || el('seedInput').value);
    el('btnNewSeed').onclick = () => el('seedInput').value = String((Math.random() * 2 ** 31) | 0);

    window.addEventListener('keydown', e => {
      const code = e.code;
      if (this.mode === 'INTRO') return;
      if (code === 'KeyM') this.closeOverlays(this.mapUI);
      else if (code === 'KeyJ') this.closeOverlays(this.encyclopedia);
      else if (code === 'KeyH') { show(el('helpOverlay'), el('helpOverlay').hidden); this.fillHelp(); }
      else if (code === 'F3') { e.preventDefault(); this.debug.toggle(); }
      else if (code === 'KeyP') this.time.togglePause();
      else if (code === 'Comma') this.time.slower();
      else if (code === 'Period') this.time.faster();
      else if (code === 'KeyU') { const m = this.audio.toggle(); this.notifyHUD(m ? 'Audio disattivato' : 'Audio attivo'); }
      else if (code === 'KeyN') this.setNav(null);
      else if (code === 'KeyE') this.toggleEVA();
    });
    el('helpBox')?.closest('section')?.addEventListener('click', () => show(el('helpOverlay'), false));
    el('pauseOverlay').addEventListener('click', () => { show(el('pauseOverlay'), false); this.input.lock(this.renderer.domElement); });
  }

  closeOverlays(target){
    for (const ov of [this.mapUI, this.encyclopedia]){
      if (ov === target){ ov.toggle(); }
      else if (ov.visible) ov.close();
    }
    const anyOpen = this.mapUI.visible || this.encyclopedia.visible;
    if (anyOpen) this.input.unlock();
    else if (this.mode !== 'INTRO') this.input.lock(this.renderer.domElement);
  }

  fillHelp(){
    el('helpBox').innerHTML = `
      <h2 class="disp" style="margin-bottom:12px">COMANDI</h2>
      <div><b>Mouse</b> assetto nave / sguardo EVA</div>
      <div><b>W · S</b> propulsione principale (S = decollo da terra)</div>
      <div><b>A · D · R · F</b> propulsori di manovra</div>
      <div><b>Q / Shift</b> rollio / potenziamento</div>
      <div><b>X</b> frenata retrograda (sincronizza la velocità)</div>
      <div><b>SPAZIO</b> atterraggio assistito / salto EVA</div>
      <div><b>E</b> esci o rientra nella nave (da fermo)</div>
      <div><b>F</b> tieni premuto per scansionare ciò che miri</div>
      <div><b>M · J · F3</b> mappa · archivio · diagnostica</div>
      <div><b>P · , · .</b> pausa · rallenta · accelera il tempo</div>
      <div><b>N · U · H</b> annulla rotta · audio · questo aiuto</div>`;
  }

  startGame(seedInput){
    if (String(this.system.seed) !== String(seedInput) && seedInput) this.loadSystem(seedInput);
    el('intro').style.display = 'none';
    document.body.dataset.mode = 'FLIGHT';
    this.mode = 'FLIGHT';
    this.hud.setVisible(true);
    this.audio.ensure();
    this.input.lock(this.renderer.domElement);
    this.hud.notify('Sei in orbita attorno a <b>' + this.system.home.name + '</b>. Ruota di 180°, frena con <b>X</b> e scendi con <b>SPAZIO</b>.');
    this.hud.notify('Tieni premuto <b>F</b> mirando un corpo per scansionarlo.');
  }

  onLockChange(locked){
    const overlays = this.mapUI.visible || this.encyclopedia.visible || this.debug.visible;
    show(el('pauseOverlay'), !locked && this.mode !== 'INTRO' && !overlays && !el('helpOverlay').hidden === false && !overlays);
    if (!locked && this.mode !== 'INTRO' && !overlays && !el('helpOverlay').hidden === false) show(el('pauseOverlay'), !overlays);
  }

  toggleEVA(){
    if (this.mode === 'FLIGHT' && this.ship.state === 'LANDED'){
      this.eva.activate(this.ship.landedBody, this.ship.pos.clone().addScaledVector(_v.set(0, 1, 0).applyQuaternion(this.ship.quat), 2.5));
      this.mode = 'EVA';
      this.vegetation.rebuild(this.ship.landedBody, this.ship.pos);
      this.hud.milestone('eva', '◆ PRIMA USCITA — la gravità punta verso il centro del mondo, non verso il basso.');
    } else if (this.mode === 'EVA' && this.eva.pos.distanceTo(this.ship.pos) < 8){
      this.eva.deactivate(); this.vegetation.clear(); this.mode = 'FLIGHT';
    }
  }

  setNav(id){ this.navId = id; }
  notifyHUD(msg){ this.hud.notify(msg); }
  teleport(bodyId){
    const b = this.system.get(bodyId);
    if (!b) return;
    this.ship.spawnOrbit(b, b.type === 'star' ? 6 : 3);
    if (this.mode === 'EVA'){ this.eva.deactivate(); this.mode = 'FLIGHT'; }
    this.hud.notify(`Teletrasporto: <b>${b.name}</b>`);
  }

  // ── loop ──
  frame(now){
    const dt = Math.min(0.05, (now - (this._last ?? now)) / 1000);
    this._last = now;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    const sdt = dt * this.time.effective;
    this.time.update(dt);
    const t = this.time.simTime;

    this.system.update(t);
    this.domBody = dominantBody(this.mode === 'EVA' ? this.eva.pos : this.ship.pos, this.system.bodies);

    let focus;
    if (this.mode === 'INTRO'){
      this.introAngle += dt * 0.05;
      focus = this.system.home.pos;
      const r = this.system.home.radius * 6.5;
      this.camera.position.set(Math.cos(this.introAngle) * r, r * 0.25, Math.sin(this.introAngle) * r);
      this.origin.focus(focus);
      this.camera.lookAt(_v.set(0, 0, 0));
    } else {
      if (this.mode === 'EVA'){
        this.eva.update(sdt, this.ship);
        if (this.eva.o2 <= 0) this.respawn('Ossigeno esaurito. Sei stato riportato a bordo.');
        focus = this.eva.pos;
      } else {
        this.ship.update(sdt);
        focus = this.ship.pos;
      }
      this.origin.focus(focus);
      this.updateCamera(dt);
    }

    // posiziona il mondo rispetto all'origine flottante
    for (const b of this.system.bodies) this.origin.apply(b.group, b.pos);
    this.origin.apply(this.ship.mesh, this.ship.pos);
    this.sunLight.position.copy(this.system.star.pos).sub(this.origin.offset);
    for (const b of this.system.bodies){
      if (b.atmoMesh) b.atmoMesh.material.uniforms.uSun.value.copy(this.system.star.pos).sub(b.pos).normalize();
      if (b.cloudMesh) b.cloudMesh.rotation.y = t * (Math.PI * 2 / b.def.rotation.period) * 0.35;
      for (const pm of b.poiMeshes) if (pm.mesh.userData.pulse) pm.mesh.userData.pulse.material.emissiveIntensity = 1.6 + Math.sin(t * 3 + b.pos.x) * 1.2;
      for (const ex of b.visualExtras) ex.mat.uniforms.uTime.value = t;
    }
    this.starfield.position.copy(this.origin.offset).multiplyScalar(0); // le stelle restano all'infinito
    if (this.belt) this.belt.update(t, this.origin.offset, focus);

    this.lod.update(focus, this.system.bodies, now);
    this.updateFog(focus);
    this.updateScan(dt);
    this.updatePOIs(focus);
    this.updateHUD();
    this.audio.setThrust(this.mode !== 'EVA' && this.input.down('KeyW') ? this.ship.throttle : 0);

    this.debug.update();
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(dt){
    if (this.mode === 'EVA'){
      const up = _v.copy(this.eva.pos).sub(this.eva.body.pos).normalize();
      const fwd = new THREE.Vector3(-Math.sin(this.eva.yaw), 0, -Math.cos(this.eva.yaw));
      const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
      fwd.crossVectors(up, right).normalize();
      const dist = 5.5, h = 2.2 + Math.sin(this.eva.pitch) * 3;
      const camPos = this.eva.pos.clone().addScaledVector(fwd, -dist * Math.cos(this.eva.pitch)).addScaledVector(up, h);
      this.origin.apply(this.camera, camPos);
      this.camera.up.copy(up);
      const tgt = this.eva.pos.clone().addScaledVector(up, 1.4);
      this.camera.lookAt(_v.copy(tgt).sub(this.origin.offset));
      return;
    }
    const back = new THREE.Vector3(0, 2.2, 9).applyQuaternion(this.ship.quat);
    const desired = this.ship.pos.clone().add(back);
    if (!this._camPos) this._camPos = desired.clone();
    this._camPos.lerp(desired, damp(dt, this.ship.state === 'LANDED' ? 3 : 7));
    this.origin.apply(this.camera, this._camPos);
    this.camera.up.lerp(_v.set(0, 1, 0).applyQuaternion(this.ship.quat), 0.06).normalize();
    const ahead = this.ship.pos.clone().addScaledVector(new THREE.Vector3(0, 0, -8).applyQuaternion(this.ship.quat), 1);
    this.camera.lookAt(_v.copy(ahead).sub(this.origin.offset));
    this.camera.fov = 62 + this.ship.throttle * 8;
    this.camera.updateProjectionMatrix();
  }

  updateFog(focus){
    let fog = null;
    for (const b of this.system.bodies){
      const dens = b.atmosphereDensityAt(focus);
      if (dens > 0.15){ fog = { color: b.def.atmosphere.color, d: Math.min(0.02, dens * 0.004) }; break; }
    }
    if (fog){
      if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(fog.color, fog.d);
      else { this.scene.fog.color.setHex(fog.color); this.scene.fog.density = fog.d; }
    } else this.scene.fog = null;
  }

  updateScan(dt){
    if (this.mode === 'INTRO') return;
    this.camera.getWorldDirection(_look);
    const focus = this.mode === 'EVA' ? this.eva.pos : this.ship.pos;
    const scanning = this.input.down('KeyF') && this.input.locked;
    this.bus.meta.scanning = scanning;
    this.discovery.update(dt, focus, _look, scanning);
  }

  updatePOIs(focus){
    for (const b of this.system.bodies){
      for (const pm of b.poiMeshes){
        const key = 'poi:' + b.id + ':' + pm.poi.name;
        if (this.discovery.has(key)) continue;
        const wp = pm.mesh.getWorldPosition(_v);
        if (focus.distanceTo(wp) < 30){
          this.discovery.discover(key);
          this.hud.notify(`◆ Punto di interesse: <b>${pm.poi.name}</b> — ${pm.poi.text || 'registrazione recuperata nell\u2019archivio.'}`, 'gold');
          this.audio.chime();
          this.hud.milestone('poi', '◆ I pianeti non sono vuoti: cerca segnali, relitti, rovine.');
        }
      }
    }
  }

  updateHUD(){
    if (this.mode === 'INTRO') return;
    const home = this.system.home;
    const year = Math.floor(this.time.simTime / home.def.orbit.period) + 1;
    const day = Math.floor((this.time.simTime % home.def.orbit.period) / Math.max(1, home.def.rotation.period)) + 1;

    let prompt = '';
    if (this.mode === 'FLIGHT'){
      if (this.ship.state === 'LANDED') prompt = '[E] esci dalla nave · [W] decolla';
      else if (this.ship.groundAlt != null && this.ship.groundAlt < 12 && this.ship.relSpeed < 8) prompt = 'tieni [SPAZIO] per atterrare';
      else if (this.ship.groundAlt != null && this.ship.groundAlt < 30 && this.ship.relSpeed > 20) prompt = 'rallenta con [X] per l\u2019atterraggio';
    } else if (this.mode === 'EVA'){
      prompt = this.eva.pos.distanceTo(this.ship.pos) < 8 ? '[E] risali sulla nave' : '[SPAZIO] salta · torna alla nave per l\u2019O₂';
    }

    const alt = this.mode === 'EVA'
      ? this.eva.pos.distanceTo(this.eva.body.pos) - this.eva.body.surfaceRadiusAt(_v.copy(this.eva.pos).sub(this.eva.body.pos).normalize().applyQuaternion(this.eva.body.spinGroup.quaternion.clone().invert()))
      : this.ship.groundAlt;

    const crush = this.domBody?.type === 'gas' && this.ship.pos.distanceTo(this.domBody.pos) < this.domBody.radius * 1.4;

    this.hud.update({
      ship: this.ship, eva: this.eva, mode: this.mode, time: this.time,
      dom: this.domBody, alt, prompt,
      scan: this.discovery.scanTarget ? { target: this.discovery.scanTarget, progress: this.discovery.progress } : null,
      nav: this.navId ? this.system.get(this.navId) : null,
      date: `ANNO ${year} · GIORNO ${day}`,
      crush,
    });
    this.updateNavMarker();
    if (this.mapUI.visible) this.mapUI.render();
  }

  updateNavMarker(){
    const m = this.hud.e.navMarker;
    if (!this.navId){ m.hidden = true; return; }
    const b = this.system.get(this.navId);
    _v.copy(b.pos).sub(this.origin.offset).project(this.camera);
    if (_v.z > 1){ m.hidden = true; return; }
    m.hidden = false;
    m.style.left = ((_v.x * 0.5 + 0.5) * innerWidth) + 'px';
    m.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight) + 'px';
    const focus = this.mode === 'EVA' ? this.eva.pos : this.ship.pos;
    this.hud.e.navDist.textContent = fmt(focus.distanceTo(b.pos) * 50) + ' km';
  }
}