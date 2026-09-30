import * as THREE from 'three';
const _dir = new THREE.Vector3(), _rel = new THREE.Vector3(), _local = new THREE.Vector3(), _invQ = new THREE.Quaternion();

// Nessuna simulazione fisica propria: legge solo posizione, velocità e orientamento già calcolati dalla
// fisica esistente (nave o astronauta, e la CelestialBody linkata) e ne deriva distanza e velocità
// relative — puro calcolo, ripetuto ogni frame sui dati correnti della simulazione.
//
// player: { position, velocity, quaternion } — la nave o l'astronauta, qualunque sia attivo.
// target: { position, velocity } — il corpo linkato (il vero oggetto della simulazione, non una copia).
export function computeRelative(player, target) {
  const distance = player.position.distanceTo(target.position);
  _dir.subVectors(target.position, player.position).normalize();
  _rel.subVectors(target.velocity, player.velocity); // velocità del pianeta rispetto al player

  // Convenzione del pannello: positivo = ci si sta avvicinando (distanza in diminuzione).
  // dot(relVel, direzione player->target) è invece il tasso di ALLONTANAMENTO (positivo quando la
  // distanza cresce): va quindi invertito di segno per ottenere "avvicinamento = positivo".
  const closingSpeed = -_rel.dot(_dir);

  // Per le frecce, la stessa velocità relativa ma nello spazio locale del player (X=destra, Y=alto,
  // Z=avanti/indietro): la direzione in cui il pianeta si muove rispetto a dove il player sta guardando,
  // non la posizione del pianeta.
  _invQ.copy(player.quaternion).invert();
  _local.copy(_rel).applyQuaternion(_invQ);

  return { distance, closingSpeed, local: { x: _local.x, y: _local.y, z: _local.z } };
}

const AU = 4000; // stessa unità-per-AU usata dal generatore del sistema, per coerenza interna
export function formatDistance(u) {
  if (u < 1000) return `${u.toFixed(u < 100 ? 1 : 0)} m`;
  if (u < AU * 0.75) return `${(u / 1000).toFixed(2)} km`;
  return `${(u / AU).toFixed(3)} AU`;
}
