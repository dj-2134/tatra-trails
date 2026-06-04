import { test } from "node:test";
import assert from "node:assert/strict";
import { t, nextLang, DICT, DEFAULT_LANG, LANGS } from "../js/i18n.js";

const sample = {
  greeting: { en: "Hello", sk: "Ahoj" },
  onlyEn: { en: "Only English" },
};

test("languages are en and sk, default en", () => {
  assert.deepEqual(LANGS, ["en", "sk"]);
  assert.equal(DEFAULT_LANG, "en");
});

test("returns the requested language", () => {
  assert.equal(t(sample, "greeting", "sk"), "Ahoj");
  assert.equal(t(sample, "greeting", "en"), "Hello");
});

test("falls back to English when the language is missing", () => {
  assert.equal(t(sample, "onlyEn", "sk"), "Only English");
});

test("falls back to the key itself when missing entirely", () => {
  assert.equal(t(sample, "nope", "en"), "nope");
});

test("defaults to English when no language is given", () => {
  assert.equal(t(sample, "greeting"), "Hello");
});

test("nextLang toggles", () => {
  assert.equal(nextLang("en"), "sk");
  assert.equal(nextLang("sk"), "en");
});

test("the real dictionary has both languages for every key", () => {
  for (const [key, entry] of Object.entries(DICT)) {
    assert.ok(entry.en, `${key} missing en`);
    assert.ok(entry.sk, `${key} missing sk`);
  }
});
