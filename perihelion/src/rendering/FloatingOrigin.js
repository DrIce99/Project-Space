// Origine flottante: la camera resta vicina all'origine e il mondo viene
// traslato. Così la precisione float non degrada mai, a nessuna distanza,
// e il passaggio spazio→superficie è continuo (nessun caricamento).
export class FloatingOrigin {
  constructor(){ this.offset = null; }
  focus(pos){ this.offset = pos; }
  apply(obj, worldPos){ 
    const target = obj.isVector3 ? obj : obj.position;
    target.copy(worldPos).sub(this.offset); 
  }
}