class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  on(eventName, handler) {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    const list = this.handlers.get(eventName);
    list.push(handler);

    return () => {
      const next = list.filter((candidate) => candidate !== handler);
      this.handlers.set(eventName, next);
    };
  }

  emit(eventName, payload) {
    const list = this.handlers.get(eventName) || [];
    return list.map((handler) => handler(payload));
  }
}

module.exports = {
  EventBus
};
