// Pure theme resolution — no browser deps, so it is unit-testable.
export const THEMES = ["light", "dark"];

// Resolve the active theme from a stored choice + the OS preference.
// A valid stored choice wins; otherwise use prefers-color-scheme; default light.
export function resolveTheme({ stored, prefersDark } = {}) {
  if (THEMES.includes(stored)) return stored;
  return prefersDark ? "dark" : "light";
}

export function nextTheme(current) {
  return current === "dark" ? "light" : "dark";
}
