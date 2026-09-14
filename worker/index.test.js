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
// Пази {body, init} по нормализирания URL и връща НОВ Response на всеки
// match — както истинският Cache API, не същия консумиран обект. `put` чете
// тялото директно от подадения Response, без вътрешно clone — точно както
// реалният Cache API, който консумира каквото му подадеш; затова хендлърът
// трябва сам да подаде `res.clone()`, не оригинала.
function stubCache() {
  const raw = new Map();
  let puts = 0, matches = 0;
  const store = {
    has: (url) => raw.has(url),
    set: (url, entry) => raw.set(url, entry),
    get size() { return raw.size; },
    get puts() { return puts; },
    get matches() { return matches; },
  };
  globalThis.caches = {
    default: {
      match: async (req) => {
        matches++;
        const entry = raw.get(req.url);
        return entry ? new Response(entry.body, entry.init) : undefined;
      },
      put: async (req, res) => {
        puts++;
        const body = await res.text();
        raw.set(req.url, { body, init: { status: res.status, headers: res.headers } });
      },
    },
  };
  return store;
}
function clearCacheStub() {
  delete globalThis.caches;
}
const ctxWaitUntil = { waitUntil: (p) => p };

// ctx.waitUntil удължава живота на заявката за фонова работа в истинския
// Workers runtime, но НЕ забавя връщането на отговора — put() продължава,
// след като клиентът вече е получил res. Тестове, които веднага след това
// проверяват какво е записано в кеша, трябва изрично да изчакат тази фонова
// работа — иначе проверяват състояние отпреди то да се е случило.
function makeCtx() {
  const pending = [];
  return { waitUntil: (p) => { pending.push(p); }, settle: () => Promise.all(pending) };
}
async function getSettled(path, e, ctx) {
  const r = await get(path, e, ctx);
  await ctx.settle();
  return r;
}

// Ръчно скалъпен запис за директно поставяне в кеша — тяло, което реално
// изчисление никога не би върнало, за да докаже, че отговорът идва от кеша.
function cachedEntry(body, cacheControl = "public, max-age=86400") {
  return {
    body: JSON.stringify(body),
    init: {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
        "cache-control": cacheControl,
      },
    },
  };
}

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
test("OPTIONS на /api/* -> 204 с точния CORS набор", async () => {
  const r = await worker.fetch(new Request("https://frost.bg/api/v1/frost", { method: "OPTIONS" }), env());
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.equal(r.headers.get("access-control-allow-methods"), "GET, OPTIONS");
  assert.equal(r.headers.get("access-control-allow-headers"), "content-type");
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
  const trailing = await get("/api/v1/frost/");
  assert.equal(trailing.status, 404); assertNoStore(trailing);
  const v2 = await get("/api/v2/frost");
  assert.equal(v2.status, 404); assertNoStore(v2);
  // Главни букви правят различен, нерегистриран път — пътищата са
  // чувствителни към регистър нарочно, затова маршрутът отива към статичните файлове.
  assert.equal(await (await get("/API/v1/frost")).text(), "asset:/API/v1/frost");
  assert.equal(await (await get("/api")).text(), "asset:/api");
});

test("/api/v1/frost: кешът се пълни под нормализиран ключ (закръглените 3 знака)", async () => {
  const store = stubCache();
  try {
    const r1 = await getSettled("/api/v1/frost?lat=42.18425&lon=24.92936", env(), makeCtx());
    assert.equal(r1.status, 200);
    assert.equal(store.puts, 1);
    assert.ok(store.has("https://frost.bg/api/v1/frost?lat=42.184&lon=24.929"));
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/frost: попадение връща каквото е в кеша (не прекомпилира), без нов put", async () => {
  const store = stubCache();
  try {
    const r1 = await getSettled("/api/v1/frost?lat=42.18425&lon=24.92936", env(), makeCtx());
    assert.equal(r1.status, 200);
    assert.equal(store.puts, 1);
    // Подменяме записа с очевиден сентинел — истинско изчисление за тези
    // координати никога няма да върне точно това тяло, затова връщането му
    // непроменено доказва, че отговорът идва от кеша, не от ново пресмятане.
    store.set("https://frost.bg/api/v1/frost?lat=42.184&lon=24.929", cachedEntry({ sentinel: true }));
    // Различно записани, но закръглено същите координати -> същият нормализиран ключ.
    const r2 = await get("/api/v1/frost?lat=42.1841&lon=24.929", env(), makeCtx());
    assert.equal(r2.status, 200);
    assertSharedHeaders(r2);
    assert.deepEqual(await r2.json(), { sentinel: true });
    assert.equal(store.puts, 1, "попадение не бива да вика put повторно");
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/frost: консумиран miss, после два консумирани удара — кешът връща свеж Response всеки път", async () => {
  const store = stubCache();
  try {
    const r1 = await getSettled("/api/v1/frost?lat=42.18425&lon=24.92936", env(), makeCtx());
    assert.equal(r1.status, 200);
    // res.clone() преди put трябва да е запазил това тяло четимо за клиента.
    assert.deepEqual((await r1.json()).query, { lat: 42.184, lon: 24.929 });

    const r2 = await get("/api/v1/frost?lat=42.18425&lon=24.92936", env(), ctxWaitUntil);
    assert.equal(r2.status, 200);
    assertSharedHeaders(r2);
    assert.deepEqual((await r2.json()).query, { lat: 42.184, lon: 24.929 });

    const r3 = await get("/api/v1/frost?lat=42.18425&lon=24.92936", env(), ctxWaitUntil);
    assert.equal(r3.status, 200);
    assertSharedHeaders(r3);
    assert.deepEqual((await r3.json()).query, { lat: 42.184, lon: 24.929 });

    assert.equal(store.puts, 1, "трите заявки след първата удрят кеша, не пишат отново");
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/frost: грешките никога не влизат в кеша", async () => {
  const store = stubCache();
  try {
    // store.size сам по себе си рискува състезание с фоновия put (raw.set
    // пише след await в стъба) — броим извикванията на put (синхронен брояч)
    // и изчакваме ctx.waitUntil да се уталожи, преди да проверим кеша.
    const r1 = await getSettled("/api/v1/frost?lat=abc&lon=24", env(), makeCtx());
    assert.equal(r1.status, 400);
    assert.equal(store.puts, 0);
    assert.equal(store.size, 0);
    const r2 = await getSettled("/api/v1/frost?lat=48.85&lon=2.35", env(), makeCtx());
    assert.equal(r2.status, 400);
    assert.equal(store.puts, 0);
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

test("/api/v1/config: кешът се пълни под голия път", async () => {
  const store = stubCache();
  try {
    const r1 = await getSettled("/api/v1/config", env(), makeCtx());
    assert.equal(r1.status, 200);
    assert.equal(store.puts, 1);
    assert.ok(store.has("https://frost.bg/api/v1/config"));
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/config: попадение връща каквото е в кеша (не прекомпилира), без нов put", async () => {
  const store = stubCache();
  try {
    const r1 = await getSettled("/api/v1/config", env(), makeCtx());
    assert.equal(r1.status, 200);
    assert.equal(store.puts, 1);
    store.set("https://frost.bg/api/v1/config", cachedEntry({ sentinel: true }));
    const r2 = await get("/api/v1/config", env(), makeCtx());
    assert.equal(r2.status, 200);
    assertSharedHeaders(r2);
    assert.deepEqual(await r2.json(), { sentinel: true });
    assert.equal(store.puts, 1, "попадение не бива да вика put повторно");
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/config: консумиран miss, после два консумирани удара — кешът връща свеж Response всеки път", async () => {
  const store = stubCache();
  try {
    const r1 = await getSettled("/api/v1/config", env(), makeCtx());
    assert.equal(r1.status, 200);
    assert.equal((await r1.json()).map, "osm");

    const r2 = await get("/api/v1/config", env(), ctxWaitUntil);
    assert.equal(r2.status, 200);
    assertSharedHeaders(r2);
    assert.equal((await r2.json()).map, "osm");

    const r3 = await get("/api/v1/config", env(), ctxWaitUntil);
    assert.equal(r3.status, 200);
    assertSharedHeaders(r3);
    assert.equal((await r3.json()).map, "osm");

    assert.equal(store.puts, 1);
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/config: без globalThis.caches всичко пак работи", async () => {
  delete globalThis.caches;
  const b = await (await get("/api/v1/config")).json();
  assert.equal(b.map, "osm");
});

test("/api/v1/geocode: q под 2 знака -> 400 bad_query", async () => {
  const r1 = await get("/api/v1/geocode?q=М");
  assert.equal(r1.status, 400);
  assert.equal((await r1.json()).error.code, "bad_query");
  const r2 = await get("/api/v1/geocode");
  assert.equal(r2.status, 400);
  assert.equal((await r2.json()).error.code, "bad_query");
  // подрязана до единична буква -> пак под 2 знака
  const r3 = await get(`/api/v1/geocode?q=${encodeURIComponent(" М ")}`);
  assert.equal(r3.status, 400);
  assert.equal((await r3.json()).error.code, "bad_query");
});
test("/api/v1/geocode: минава през доставчика с подменен fetch; кеш седмица", async () => {
  const e = env({ FETCH: async () => new Response(JSON.stringify({ results: [
    { name: "Маноле", latitude: 42.18333, longitude: 24.93333, admin1: "Пловдив" }] }), { status: 200 }) });
  const r = await get("/api/v1/geocode?q=Маноле&lang=bg", e);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "public, max-age=604800");
  const b = await r.json();
  assert.deepEqual(b.results, [{ name: "Маноле", admin: "Пловдив", lat: 42.183, lon: 24.933 }]);
  assert.equal(b.provider, "openmeteo");
});
test("/api/v1/geocode: доставчикът пада -> 502 geocoder_failed, no-store", async () => {
  const e = env({ FETCH: async () => new Response("x", { status: 503 }) });
  const r = await get("/api/v1/geocode?q=Маноле", e);
  assert.equal(r.status, 502); assert.equal((await r.json()).error.code, "geocoder_failed");
  assert.equal(r.headers.get("cache-control"), "no-store");
});
test("/api/v1/geocode: грешка от доставчика не пренася Google ключа в 502 тялото", async () => {
  const e = env({ GEOCODER: "google", GOOGLE_KEY: "SECRET123",
    FETCH: async (url) => { throw new Error("boom " + url); } });
  const r = await get("/api/v1/geocode?q=Manole", e);
  assert.equal(r.status, 502);
  const text = await r.text();
  assert.ok(!text.includes("SECRET123"), text);
});
test("/api/v1/geocode: кешът се пълни под нормализиран ключ (q кодиран, lang, limit)", async () => {
  const store = stubCache();
  try {
    const e = env({ FETCH: async () => new Response(JSON.stringify({ results: [
      { name: "Маноле", latitude: 42.18333, longitude: 24.93333, admin1: "Пловдив" }] }), { status: 200 }) });
    const r1 = await getSettled("/api/v1/geocode?q=Маноле&lang=bg", e, makeCtx());
    assert.equal(r1.status, 200);
    assert.equal(store.puts, 1);
    assert.ok(store.has("https://frost.bg/api/v1/geocode?q=%D0%9C%D0%B0%D0%BD%D0%BE%D0%BB%D0%B5&lang=bg&limit=5"));
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/geocode: попадение връща каквото е в кеша, без нова заявка към доставчика", async () => {
  const store = stubCache();
  try {
    let calls = 0;
    const e = env({ FETCH: async () => { calls++; return new Response(JSON.stringify({ results: [
      { name: "Маноле", latitude: 42.18333, longitude: 24.93333, admin1: "Пловдив" }] }), { status: 200 }); } });
    const r1 = await getSettled("/api/v1/geocode?q=Маноле&lang=bg", e, makeCtx());
    assert.equal(r1.status, 200);
    assert.equal(calls, 1);
    store.set("https://frost.bg/api/v1/geocode?q=%D0%9C%D0%B0%D0%BD%D0%BE%D0%BB%D0%B5&lang=bg&limit=5",
      cachedEntry({ sentinel: true }, "public, max-age=604800"));
    const r2 = await get("/api/v1/geocode?q=Маноле&lang=bg", e, makeCtx());
    assert.equal(r2.status, 200);
    assertSharedHeaders(r2);
    assert.deepEqual(await r2.json(), { sentinel: true });
    assert.equal(calls, 1, "попадение не бива да вика доставчика повторно");
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/geocode: различно записани, но нормализирано еднакви заявки удрят същия ключ", async () => {
  const store = stubCache();
  try {
    let calls = 0;
    const e = env({ FETCH: async () => { calls++; return new Response(JSON.stringify({ results: [
      { name: "Маноле", latitude: 42.18333, longitude: 24.93333, admin1: "Пловдив" }] }), { status: 200 }); } });
    const r1 = await getSettled(`/api/v1/geocode?q=${encodeURIComponent(" Маноле ")}&lang=bg&limit=5`, e, makeCtx());
    assert.equal(r1.status, 200);
    assert.equal(calls, 1);
    const r2 = await getSettled("/api/v1/geocode?q=Маноле&lang=bg", e, makeCtx());
    assert.equal(r2.status, 200);
    assert.equal(calls, 1, "нормализираният ключ трябва да съвпадне — без нов провайдър извикване");
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/geocode: 502 никога не влиза в кеша", async () => {
  const store = stubCache();
  try {
    const e = env({ FETCH: async () => new Response("x", { status: 503 }) });
    const r1 = await getSettled("/api/v1/geocode?q=Маноле", e, makeCtx());
    assert.equal(r1.status, 502);
    assert.equal(store.puts, 0);
    assert.equal(store.size, 0);
  } finally {
    clearCacheStub();
  }
});
