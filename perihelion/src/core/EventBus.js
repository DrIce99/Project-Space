export class EventBus {
  constructor(){ this.map = new Map(); }
  on(ev, fn){ (this.map.get(ev) ?? this.map.set(ev, new Set()).get(ev)).add(fn); return () => this.off(ev, fn); }
  off(ev, fn){ this.map.get(ev)?.delete(fn); }
  emit(ev, data){ this.map.get(ev)?.forEach(fn => fn(data)); }
}