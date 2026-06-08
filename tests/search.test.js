// tests/search.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText, searchHikes } from "../js/search.js";

test("normalizeText strips diacritics, lowercases, trims", () => {
  assert.equal(normalizeText("  Štrbské Pleso "), "strbske pleso");
  assert.equal(normalizeText(null), "");
});

const HIKES = [
  { slug: "a", name: { en: "Štrbské pleso loop", sk: "Štrbské pleso okruh" } },
  { slug: "b", name: { en: "Rysy summit", sk: "Výstup na Rysy" } },
];

test("searchHikes: diacritic- and case-insensitive substring on EN or SK", () => {
  assert.deepEqual(searchHikes(HIKES, "strbske").map((h) => h.slug), ["a"]);
  assert.deepEqual(searchHikes(HIKES, "RYSY").map((h) => h.slug), ["b"]);
  assert.deepEqual(searchHikes(HIKES, "výstup").map((h) => h.slug), ["b"]); // SK-only match
  assert.deepEqual(searchHikes(HIKES, "pleso").map((h) => h.slug), ["a"]);
});

test("searchHikes: empty/whitespace query → []", () => {
  assert.deepEqual(searchHikes(HIKES, ""), []);
  assert.deepEqual(searchHikes(HIKES, "   "), []);
});
