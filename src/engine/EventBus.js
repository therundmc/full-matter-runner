// Minimal synchronous publish/subscribe bus used to decouple systems
// (physics -> impact sounds, kills -> scoring, explosions -> camera/lighting...).
// An emit calls the handlers there were when it began: one added or removed meanwhile changes a copy of the list
// (`busy`: the emits going through a list), so no emit has to copy it.
export default class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  // the list of a type's handlers to change: a copy of it if an emit is going through it
  writable(type) {
    let list = this.handlers.get(type);
    if (list?.busy) list = list.slice();
    if (list) this.handlers.set(type, list);
    return list;
  }

  // returns an unsubscribe function
  on(type, fn) {
    let list = this.writable(type);
    if (!list) { list = []; this.handlers.set(type, list); }
    list.push(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (e) => { off(); fn(e); });
    return off;
  }

  off(type, fn) {
    const list = this.writable(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(type, payload) {
    const list = this.handlers.get(type);
    if (!list) return;
    list.busy = (list.busy || 0) + 1;
    try {
      for (let i = 0; i < list.length; i++) list[i](payload);
    } finally {
      list.busy--;
    }
  }

  clear() { this.handlers.clear(); }
}
