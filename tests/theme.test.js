import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTheme, nextTheme, THEMES } from "../js/theme.js";

test("themes are light and dark", () => {
  assert.deepEqual(THEMES, ["light", "dark"]);
});

test("a valid stored choice wins over the OS preference", () => {
  assert.equal(resolveTheme({ stored: "dark", prefersDark: false }), "dark");
  assert.equal(resolveTheme({ stored: "light", prefersDark: true }), "light");
});

test("falls back to the OS preference when nothing is stored", () => {
  assert.equal(resolveTheme({ prefersDark: true }), "dark");
  assert.equal(resolveTheme({ prefersDark: false }), "light");
});

test("an invalid stored value is ignored", () => {
  assert.equal(resolveTheme({ stored: "banana", prefersDark: true }), "dark");
});

test("defaults to light with no information", () => {
  assert.equal(resolveTheme(), "light");
});

test("nextTheme toggles", () => {
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "light");
});
