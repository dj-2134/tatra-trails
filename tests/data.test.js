// tests/data.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchHikes, fetchRegions, fetchAllowedSelf } from "../js/data.js";

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

test("fetchHikes requests the stat columns", async () => {
  let captured;
  const stub = async (url) => { captured = url; return { ok: true, status: 200, json: async () => [] }; };
  await fetchHikes({ url: "https://p.supabase.co", key: "K" }, stub);
  assert.match(decodeURIComponent(captured), /distance_m,ascent_m,duration_min/);
  assert.match(decodeURIComponent(captured), /is_public/);
});

test("fetchRegions: hits /regions with the apikey header", async () => {
  let seen = null;
  const fakeFetch = async (url, opts) => {
    seen = { url, opts };
    return { ok: true, status: 200, json: async () => [{ id: 1, slug: "vysoke-tatry" }] };
  };
  const out = await fetchRegions({ url: "https://x.supabase.co/", key: "K" }, fakeFetch);
  assert.ok(seen.url.includes("/rest/v1/regions?select="));
  assert.equal(seen.opts.headers.apikey, "K");
  assert.deepEqual(out, [{ id: 1, slug: "vysoke-tatry" }]);
});

test("fetchHikes: adds an Authorization Bearer header when a token is given", async () => {
  let seen = null;
  const stub = async (url, opts) => { seen = opts; return { ok: true, status: 200, json: async () => [] }; };
  await fetchHikes({ url: "https://p.supabase.co", key: "K" }, stub, "TOKEN123");
  assert.equal(seen.headers.apikey, "K");
  assert.equal(seen.headers.Authorization, "Bearer TOKEN123");
});

test("fetchHikes: no Authorization header when no token", async () => {
  let seen = null;
  const stub = async (url, opts) => { seen = opts; return { ok: true, status: 200, json: async () => [] }; };
  await fetchHikes({ url: "https://p.supabase.co", key: "K" }, stub);
  assert.equal(seen.headers.Authorization, undefined);
});

test("fetchAllowedSelf: hits /allowed_viewers with apikey + Bearer", async () => {
  let seen = null;
  const stub = async (url, opts) => { seen = { url, opts }; return { ok: true, status: 200, json: async () => [{ email: "me@x.io" }] }; };
  const rows = await fetchAllowedSelf({ url: "https://p.supabase.co/", key: "K" }, stub, "TOK");
  assert.match(seen.url, /\/rest\/v1\/allowed_viewers\?select=/);
  assert.equal(seen.opts.headers.Authorization, "Bearer TOK");
  assert.deepEqual(rows, [{ email: "me@x.io" }]);
});
