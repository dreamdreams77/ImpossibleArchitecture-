// Rebindable keys. The game's key handlers read the default keys; a binding maps
// the key the player chose back onto the default for its action, so every handler
// keeps working unchanged. Bindings are plain data in storage.

export const ACTIONS = Object.freeze([
  { id: 'turnLeft', label: 'Turn left', key: 'q' },
  { id: 'turnRight', label: 'Turn right', key: 'e' },
  { id: 'forward', label: 'Walk forward', key: 'w' },
  { id: 'test', label: 'Test construction', key: 't' },
  { id: 'hint', label: 'Hint', key: 'h' },
  { id: 'playRoute', label: 'Play route', key: 'p' },
]);

// Keys that keep their meaning whatever is bound.
const RESERVED = new Set(['escape', 'tab', 'f3', '?', 'enter', ' ', 'control', 'meta', 'alt', 'shift', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'delete', 'backspace']);
const STORE_KEY = 'ia-keys';

export function defaultBindings() {
  return Object.fromEntries(ACTIONS.map((a) => [a.id, a.key]));
}

export function loadBindings(storage) {
  const out = defaultBindings();
  try {
    const raw = JSON.parse(storage?.getItem(STORE_KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      for (const a of ACTIONS) if (typeof raw[a.id] === 'string' && raw[a.id].length === 1) out[a.id] = raw[a.id].toLowerCase();
    }
  } catch { /* defaults */ }
  return out;
}

export function saveBindings(storage, bindings) {
  try { storage?.setItem(STORE_KEY, JSON.stringify(bindings)); } catch { /* not remembered */ }
}

// Binds `key` to `action`. Returns { bindings } or { error }. A key already used by
// another action is refused rather than silently stolen.
export function rebind(bindings, action, key) {
  const k = String(key ?? '').toLowerCase();
  if (!ACTIONS.some((a) => a.id === action)) return { error: `Unknown action ${action}.` };
  if (k.length !== 1 || RESERVED.has(k)) return { error: `“${key}” cannot be bound: it keeps its own meaning.` };
  const taken = ACTIONS.find((a) => a.id !== action && bindings[a.id] === k);
  if (taken) return { error: `“${k.toUpperCase()}” is already ${taken.label.toLowerCase()}.` };
  // Another action's default must not be shadowed by a key now bound elsewhere.
  const shadow = ACTIONS.find((a) => a.id !== action && a.key === k && bindings[a.id] !== k);
  if (shadow) return { error: `“${k.toUpperCase()}” is the default for ${shadow.label.toLowerCase()}, which has been moved. Bind another key.` };
  return { bindings: { ...bindings, [action]: k } };
}

// The key a handler should see for a pressed key. A key bound to an action becomes
// that action's default key; a default key whose action was moved is silenced.
export function translate(bindings, pressed) {
  const k = String(pressed).toLowerCase();
  if (k.length !== 1) return pressed;
  for (const a of ACTIONS) if (bindings[a.id] === k) return a.key;
  for (const a of ACTIONS) if (a.key === k && bindings[a.id] !== k) return null;
  return pressed;
}
