// Minimal synchronous publish/subscribe bus used to decouple systems
// (physics -> impact sounds, kills -> scoring, explosions -> camera/lighting...).
export default class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  // returns an unsubscribe function
  on(type, fn) {
    let list = this.handlers.get(type);
    if (!list) { list = []; this.handlers.set(type, list); }
    list.push(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (e) => { off(); fn(e); });
    return off;
  }

  off(type, fn) {
    const list = this.handlers.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(type, payload) {
    const list = this.handlers.get(type);
    if (!list) return;
    for (const fn of [...list]) fn(payload);
  }

  clear() { this.handlers.clear(); }
}
