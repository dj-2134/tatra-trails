// tests/data.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchHikes } from "../js/data.js";

test("fetchHikes hits PostgREST with the publishable key and returns parsed rows", async () => {
  let captured;
  const stub = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200, json: async () => [{ slug: "x" }] };
  };
  const rows = await fetchHikes({ url: "https://p.supabase.co", key: "KEY" }, stub);
  assert.deepEqual(rows, [{ slug: "x" }]);
  assert.match(captured.url, /^https:\/\/p\.supabase\.co\/rest\/v1\/hikes\?select=/);
  assert.match(decodeURIComponent(captured.url), /closures\(/);
  assert.equal(captured.opts.headers.apikey, "KEY");
  assert.equal(captured.opts.headers.Authorization, undefined); // publishable key: apikey header only
});

test("fetchHikes strips a trailing slash from the base url", async () => {
  let captured;
  const stub = async (url) => { captured = url; return { ok: true, status: 200, json: async () => [] }; };
  await fetchHikes({ url: "https://p.supabase.co/", key: "K" }, stub);
  assert.match(captured, /^https:\/\/p\.supabase\.co\/rest\/v1\/hikes\?/);
  assert.ok(!captured.includes(".co//rest"), "no double slash");
});

test("fetchHikes throws on a non-ok response", async () => {
  const stub = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(() => fetchHikes({ url: "u", key: "k" }, stub), /503/);
});
