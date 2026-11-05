// localStorage that keeps working when the browser blocks it.
const PREFIX = "game:";
const memory = new Map();

export function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return memory.has(key) ? memory.get(key) : fallback;
  }
}

export function set(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Blocked or full: the value lives in memory for this session
  }
  return value;
}

export function remove(key) {
  memory.delete(key);
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing to clean up
  }
}

// Stores value when it beats the saved record, and returns the record.
// Pass lowerIsBetter for lap times and the like.
export function best(key, value, { lowerIsBetter = false } = {}) {
  const current = get(key, null);
  if (value === undefined) return current ?? 0;
  const beaten = current === null || (lowerIsBetter ? value < current : value > current);
  return beaten ? set(key, value) : current;
}
