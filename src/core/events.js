const UNIFIED_EVENTS = new Set([
  "attention_required",
  "task_completed",
  "task_failed"
]);

function isUnifiedEvent(eventName) {
  return UNIFIED_EVENTS.has(eventName);
}

module.exports = {
  UNIFIED_EVENTS,
  isUnifiedEvent
};
