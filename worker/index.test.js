import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";
import grid from "../grid/grid.json" with { type: "json" };

const env = (over = {}) => ({
  GEOCODER: "openmeteo", MAP: "osm", GOOGLE_MAPS_KEY: "",
  ASSETS: { fetch: async (req) => new Response(`asset:${new URL(req.url).pathname}`, { status: 200 }) },
  ...over,
});
const get = (path, e = env(), ctx) => worker.fetch(new Request(`https://frost.bg${path}`), e, ctx);

// Заглавките, общи за всеки JSON отговор (успех или грешка) — CORS и content-type
// не бива да изчезват тихо при бъдещи промени.
function assertSharedHeaders(r) {
  assert.equal(r.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.equal(r.headers.get("access-control-allow-methods"), "GET, OPTIONS");
  assert.equal(r.headers.get("access-control-allow-headers"), "content-type");
}
function assertNoStore(r) {
  assert.equal(r.headers.get("cache-control"), "no-store");
}

// Стъб на Cache API (`caches.default`) — Cloudflare-специфично, липсва в Node.
// Пази записите в обикновена Map по нормализирания URL на ключа.
function stubCache() {
  const store = new Map();
  globalThis.caches = {
    default: {
      match: async (req) => store.get(req.url) ?? undefined,
      put: async (req, res) => { store.set(req.url, res); },
    },
  };
  return store;
}
function clearCacheStub() {
  delete globalThis.caches;
}
const ctxWaitUntil = { waitUntil: (p) => p };

test("grid.json: 2080 клетки, всички в правоъгълника, дати MM-DD или null", () => {
  assert.equal(grid.cells.length, 2080);
  const re = /^\d{2}-\d{2}$/;
  for (const c of grid.cells) {
    assert.ok(c.lat >= 41.2 && c.lat <= 44.3 && c.lon >= 22.3 && c.lon <= 28.7, `${c.lat},${c.lon}`);
    for (const d of [...c.typical, ...c.safe]) assert.ok(d === null || re.test(d), String(d));
    assert.equal(c.typical.length, 2); assert.equal(c.safe.length, 2);
  }
});

test("/api/v1/frost: 200, JSON, CORS, кеш", async () => {
  const r = await get("/api/v1/frost?lat=42.18425&lon=24.92936");
  assert.equal(r.status, 200);
  assertSharedHeaders(r);
  assert.equal(r.headers.get("cache-control"), "public, max-age=86400");
  const b = await r.json();
  assert.deepEqual(b.query, { lat: 42.184, lon: 24.929 });
  assert.deepEqual(b.cell.lat, 42.2); assert.deepEqual(b.cell.lon, 24.9);
  assert.ok("last_spring" in b.typical && "first_autumn" in b.safe);
  assert.equal(b.version, "1");
});
test("/api/v1/frost: невалидни -> 400 bad_request на два езика", async () => {
  const r = await get("/api/v1/frost?lat=abc&lon=24");
  assert.equal(r.status, 400);
  assertSharedHeaders(r); assertNoStore(r);
  const b = await r.json();
  assert.equal(b.error.code, "bad_request"); assert.ok(b.error.bg && b.error.en);
});
test("/api/v1/frost: липсващ lon -> 400", async () => {
  const r = await get("/api/v1/frost?lat=42");
  assert.equal(r.status, 400);
  assertSharedHeaders(r); assertNoStore(r);
});
test("/api/v1/frost: извън България -> 400 outside_bulgaria", async () => {
  const r = await get("/api/v1/frost?lat=48.85&lon=2.35");
  assert.equal(r.status, 400);
  assertSharedHeaders(r); assertNoStore(r);
  assert.equal((await r.json()).error.code, "outside_bulgaria");
});
test("/api/v1/config: osm без ключ", async () => {
  const r = await get("/api/v1/config");
  assert.equal(r.status, 200);
  assertSharedHeaders(r);
  assert.equal(r.headers.get("cache-control"), "public, max-age=86400");
  const b = await r.json();
  assert.deepEqual(b, { map: "osm", google_maps_key: null, languages: ["bg", "en"],
    grid: { computed: grid.computed, period: grid.period, synthetic: grid.synthetic === true }, version: "1" });
});
test("/api/v1/config: google с ключ", async () => {
  const r = await get("/api/v1/config", env({ MAP: "google", GOOGLE_MAPS_KEY: "AIzaTEST" }));
  assertSharedHeaders(r);
  const b = await r.json();
  assert.equal(b.map, "google"); assert.equal(b.google_maps_key, "AIzaTEST");
});
test("/api/v1/config: MAP=google без ключ пада обратно на osm", async () => {
  const b = await (await get("/api/v1/config", env({ MAP: "google", GOOGLE_MAPS_KEY: "" }))).json();
  assert.equal(b.map, "osm"); assert.equal(b.google_maps_key, null);
});
test("непознат /api/* -> 404 JSON not_found", async () => {
  const r = await get("/api/v1/nope");
  assert.equal(r.status, 404);
  assertSharedHeaders(r); assertNoStore(r);
  assert.equal((await r.json()).error.code, "not_found");
  assert.equal((await get("/api/")).status, 404);
});
test("OPTIONS на /api/* -> 204 с CORS", async () => {
  const r = await worker.fetch(new Request("https://frost.bg/api/v1/frost", { method: "OPTIONS" }), env());
  assert.equal(r.status, 204); assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.ok(r.headers.get("access-control-allow-methods").includes("GET"));
});
test("POST на /api/* -> 405 с Allow", async () => {
  const r = await worker.fetch(new Request("https://frost.bg/api/v1/frost", { method: "POST" }), env());
  assert.equal(r.status, 405);
  assertSharedHeaders(r); assertNoStore(r);
  assert.equal(r.headers.get("allow"), "GET, OPTIONS");
});
test("HEAD на /api/* -> 405 с Allow", async () => {
  const r = await worker.fetch(new Request("https://frost.bg/api/v1/frost", { method: "HEAD" }), env());
  assert.equal(r.status, 405);
  assertSharedHeaders(r); assertNoStore(r);
  assert.equal(r.headers.get("allow"), "GET, OPTIONS");
});
test("всичко извън /api отива към статичните файлове", async () => {
  const r = await get("/en/");
  assert.equal(await r.text(), "asset:/en/");
});

test("границите на маршрута: наклонена черта накрая, v2, главни букви, без наклонена черта", async () => {
  assert.equal((await get("/api/v1/frost/")).status, 404);
  assert.equal((await get("/api/v2/frost")).status, 404);
  // Главни букви правят различен, нерегистриран път — пътищата са
  // чувствителни към регистър нарочно, затова маршрутът отива към статичните файлове.
  assert.equal(await (await get("/API/v1/frost")).text(), "asset:/API/v1/frost");
  assert.equal(await (await get("/api")).text(), "asset:/api");
});

test("/api/v1/frost: кешът се пълни под нормализиран ключ (закръглените 3 знака)", async () => {
  const store = stubCache();
  try {
    const r1 = await get("/api/v1/frost?lat=42.18425&lon=24.92936", env(), ctxWaitUntil);
    assert.equal(r1.status, 200);
    assert.equal(store.size, 1);
    assert.ok(store.has("https://frost.bg/api/v1/frost?lat=42.184&lon=24.929"));
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/frost: различно записани, но закръглено равни координати удрят кеша", async () => {
  const store = stubCache();
  try {
    await get("/api/v1/frost?lat=42.18425&lon=24.92936", env(), ctxWaitUntil);
    assert.equal(store.size, 1);
    const r2 = await get("/api/v1/frost?lat=42.1841&lon=24.929", env(), ctxWaitUntil);
    assert.equal(r2.status, 200);
    assert.equal(store.size, 1, "втора заявка удря кеша, не добавя нов запис");
    assert.deepEqual((await r2.json()).query, { lat: 42.184, lon: 24.929 });
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/frost: грешките никога не влизат в кеша", async () => {
  const store = stubCache();
  try {
    assert.equal((await get("/api/v1/frost?lat=abc&lon=24", env(), ctxWaitUntil)).status, 400);
    assert.equal(store.size, 0);
    assert.equal((await get("/api/v1/frost?lat=48.85&lon=2.35", env(), ctxWaitUntil)).status, 400);
    assert.equal(store.size, 0);
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/frost: без globalThis.caches всичко пак работи", async () => {
  delete globalThis.caches;
  const r = await get("/api/v1/frost?lat=42.18425&lon=24.92936");
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).query, { lat: 42.184, lon: 24.929 });
});
test("/api/v1/config: кешът се пълни под голия път и втора заявка го удря", async () => {
  const store = stubCache();
  try {
    const r1 = await get("/api/v1/config", env(), ctxWaitUntil);
    assert.equal(r1.status, 200);
    assert.equal(store.size, 1);
    assert.ok(store.has("https://frost.bg/api/v1/config"));
    const r2 = await get("/api/v1/config", env(), ctxWaitUntil);
    assert.equal(r2.status, 200);
    assert.equal(store.size, 1, "втора заявка удря кеша, не добавя нов запис");
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/config: без globalThis.caches всичко пак работи", async () => {
  delete globalThis.caches;
  const b = await (await get("/api/v1/config")).json();
  assert.equal(b.map, "osm");
});
