// Generico: può linkare qualunque oggetto con {name, position, velocity} — un pianeta oggi, in futuro
// una luna, una stella, un punto di interesse o delle coordinate. Non memorizza una copia statica:
// tiene solo un riferimento all'oggetto vivo della simulazione (una CelestialBody vera), quindi la sua
// posizione letta altrove resta sempre quella corrente, aggiornata dalla fisica orbitale esistente.
export class PlanetLinkSystem {
  constructor() { this.target = null; }
  get linked() { return this.target; }
  link(body) { this.target = body; }
  unlink() { this.target = null; }
  // Avanza al prossimo elemento della lista fornita, tornando a "nessun link" dopo l'ultimo.
  // Selezionare un altro corpo sostituisce sempre quello precedente (mai un secondo link parallelo).
  cycle(list) {
    if (!list.length) { this.target = null; return; }
    const i = this.target ? list.indexOf(this.target) : -1;
    this.target = i + 1 < list.length ? list[i + 1] : null;
  }
}
