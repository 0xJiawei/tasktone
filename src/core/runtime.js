const { EventBus } = require("./event-bus");
const { loadConfig } = require("./config");
const { Notifier } = require("./notifier");
const { UNIFIED_EVENTS } = require("./events");

function createRuntime(options = {}) {
  const { config, configPath } = loadConfig(options.homeDir);
  const bus = new EventBus();
  const notifier = new Notifier({ config, configPath });

  for (const eventName of UNIFIED_EVENTS) {
    bus.on(eventName, (payload) => notifier.notify(eventName, payload));
  }

  return {
    config,
    configPath,
    emit(eventName, payload = {}) {
      const results = bus.emit(eventName, payload);
      return results[0] || null;
    }
  };
}

module.exports = {
  createRuntime
};
