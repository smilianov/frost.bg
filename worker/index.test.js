import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";
import grid from "../grid/grid.json" with { type: "json" };
import { resetCooldown } from "./elevation.js";

const env = (over = {}) => ({
  GEOCODER: "openmeteo", MAP: "osm", GOOGLE_MAPS_KEY: "",
  ASSETS: { fetch: async (req) => new Response(`asset:${new URL(req.url).pathname}`, { status: 200 }) },
  ...over,
});
const get = (path, e = env(), ctx) => worker.fetch(new Request(`https://frost.bg${path}`), e, ctx);

// Ревизията в ключа на кеша: версията на приложението, датата на мрежата и
// ЕФЕКТИВНИТЕ карта/геокодер (същите, които /config докладва). Нов deploy с
// нова версия, нова мрежа или друга карта/геокодер = други ключове; старите
// записи просто изтичат по TTL.
const REV = (map = "osm", geocoder = "openmeteo") => encodeURIComponent(`0.3.3|${grid.computed}|${map}|${geocoder}`);
// /config носи и превключвателя ELEVATION в собствената си ревизия (fix
// round 1, findings 1) — /frost и /geocode не го ползват и не се пипат.
const CONFIG_REV = (map = "osm", geocoder = "openmeteo", elevationFlag = true) =>
  encodeURIComponent(`0.3.3|${grid.computed}|${map}|${geocoder}|${elevationFlag}`);

// Заглавките, общи за всеки JSON отговор (успех или грешка) — CORS и content-type
// не бива да изчезват тихо при бъдещи промени.
function assertSharedHeaders(r) {
  assert.equal(r.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.equal(r.headers.get("access-control-allow-methods"), "GET, OPTIONS");
  assert.equal(r.headers.get("access-control-allow-headers"), "content-type");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
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
    keys: () => raw.keys(),
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
function cachedEntry(body, cacheControl = "public, max-age=300, s-maxage=86400") {
  return {
    body: JSON.stringify(body),
    init: {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
        "x-content-type-options": "nosniff",
        "cache-control": cacheControl,
      },
    },
  };
}

test("grid.json: 2080 клетки, всички в правоъгълника, дати MM-DD или null", () => {
  assert.equal(grid.cells.length, 2080);
  // Произходът е машинно четим — Worker-ът етикетира източника по него.
  assert.ok(["cds", "openmeteo", "synthetic"].includes(grid.source_id), String(grid.source_id));
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
  assert.equal(r.headers.get("cache-control"), "public, max-age=300, s-maxage=86400");
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
  assert.equal(r.headers.get("cache-control"), "public, max-age=300, s-maxage=86400");
  const b = await r.json();
  assert.deepEqual(b, { map: "osm", google_maps_key: null, geocoder: "openmeteo", languages: ["bg", "en"],
    grid: { computed: grid.computed, period: grid.period, synthetic: grid.synthetic === true, source_id: grid.source_id },
    version: "1", app_version: "0.3.3", elevation: true });
});
test("/api/v1/config: GEOCODER=google с GOOGLE_KEY -> geocoder google, без да разкрива ключа", async () => {
  const r = await get("/api/v1/config", env({ GEOCODER: "google", GOOGLE_KEY: "SECRET123" }));
  const text = await r.text();
  assert.ok(!text.includes("SECRET123"), text);
  assert.equal(JSON.parse(text).geocoder, "google");
});
test("/api/v1/config: GEOCODER=google без GOOGLE_KEY пада обратно на openmeteo", async () => {
  const b = await (await get("/api/v1/config", env({ GEOCODER: "google", GOOGLE_KEY: "" }))).json();
  assert.equal(b.geocoder, "openmeteo");
});
test("/api/v1/config носи app_version", async () => {
  const b = await (await get("/api/v1/config")).json();
  assert.match(b.app_version, /^\d+\.\d+\.\d+$/);
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

// --- Задача 7: /api/v1/elevation — височината на точката ---------------

test("/api/v1/elevation: нормализира, кешира и връща метри", async () => {
  resetCooldown();
  const e = env({ FETCH: () => new Response(JSON.stringify({ elevation: [350.4] }), { status: 200 }) });
  const r = await get("/api/v1/elevation?lat=42.18425&lon=24.92936", e);
  assert.equal(r.status, 200);
  assertSharedHeaders(r);
  const b = await r.json();
  assert.deepEqual(b.query, { lat: 42.184, lon: 24.929 });
  assert.equal(b.elevation_m, 350);
  assert.equal(b.version, "1");
  assert.match(r.headers.get("cache-control"), /s-maxage=604800/);
  assert.ok(b.source.attribution.includes("Copernicus"));
});
test("/api/v1/elevation: извън България -> 400, негодни координати -> 400", async () => {
  const e = env({ FETCH: () => { throw new Error("не бива да се пита нагоре"); } });
  assert.equal((await get("/api/v1/elevation?lat=48.85&lon=2.35", e)).status, 400);
  assert.equal((await get("/api/v1/elevation?lat=abc&lon=2", e)).status, 400);
});
test("/api/v1/elevation: грешка на доставчика -> 502 no-store, не кеширан празен отговор", async () => {
  resetCooldown();
  const e = env({ FETCH: () => new Response("{}", { status: 500 }) });
  const r = await get("/api/v1/elevation?lat=42.2&lon=24.9", e);
  assert.equal(r.status, 502);
  assertSharedHeaders(r); assertNoStore(r);
});
test("/api/v1/elevation: ELEVATION=off -> 404 и нищо нагоре", async () => {
  const e = env({ ELEVATION: "off", FETCH: () => { throw new Error("не бива"); } });
  const r = await get("/api/v1/elevation?lat=42.2&lon=24.9", e);
  assert.equal(r.status, 404);
  assertNoStore(r);
});
test("/api/v1/config казва дали височината е включена", async () => {
  const on = await (await get("/api/v1/config")).json();
  assert.equal(on.elevation, true);
  const off = await (await get("/api/v1/config", env({ ELEVATION: "off" }))).json();
  assert.equal(off.elevation, false);
});

// Правило на контролера отвъд брифа: локалният `cooldownUntil` в
// elevation.js (Задача 6) пази само текущия isolate по коментара там —
// Cloudflare разпределя заявките по много isolate-и и ги подменя свободно.
// Маршрутът пази собствен маркер в споделения Cache API; `resetCooldown()`
// тук симулира точно случая от прегледа: „свеж“ isolate, който локално не
// помни нищо, докато маркерът в (стъбнатия) споделен кеш си стои от преди.
test("/api/v1/elevation: маркерът в кеша координира отказа между isolate-и — свеж локален isolate пак не пита нагоре", async () => {
  const store = stubCache();
  try {
    resetCooldown();
    let calls = 0;
    const e = env({ FETCH: () => { calls++; return new Response("{}", { status: 500 }); } });
    const r1 = await getSettled("/api/v1/elevation?lat=42.2&lon=24.9", e, makeCtx());
    assert.equal(r1.status, 502);
    assert.equal(calls, 1);
    resetCooldown(); // "нов" isolate — локалната памет е чиста
    const r2 = await getSettled("/api/v1/elevation?lat=42.2&lon=24.9", e, makeCtx());
    assert.equal(r2.status, 502);
    assert.equal(calls, 1, "маркерът в кеша спира заявката, преди да се стигне до доставчика");
  } finally {
    clearCacheStub();
    resetCooldown();
  }
});
test("/api/v1/elevation: успешен отговор се кешира под нормализиран ключ, отделен от кратния отказ", async () => {
  const store = stubCache();
  try {
    resetCooldown();
    const e = env({ FETCH: () => new Response(JSON.stringify({ elevation: [99.4] }), { status: 200 }) });
    const r1 = await getSettled("/api/v1/elevation?lat=42.18425&lon=24.92936", e, makeCtx());
    assert.equal(r1.status, 200);
    assert.equal(store.puts, 1);
    assert.ok(store.has(`https://frost.bg/api/v1/elevation?rev=${encodeURIComponent("0.3.3|openmeteo-elevation")}&lat=42.184&lon=24.929`),
      [...store.keys()].join(" "));
  } finally {
    clearCacheStub();
    resetCooldown();
  }
});

// Fix round 1, finding 2: Ф6 обещава изрично null при липсваща стойност —
// доставчикът връщащ null не е грешка на доставчика, а легитимен, кешируем отговор.
test("/api/v1/elevation: доставчикът връща null -> 200 с elevation_m: null, кешира се (не 502)", async () => {
  resetCooldown();
  const e = env({ FETCH: () => new Response(JSON.stringify({ elevation: [null] }), { status: 200 }) });
  const r = await get("/api/v1/elevation?lat=42.2&lon=24.9", e);
  assert.equal(r.status, 200);
  assertSharedHeaders(r);
  const b = await r.json();
  assert.equal(b.elevation_m, null);
  assert.match(r.headers.get("cache-control"), /s-maxage=604800/);
});

// Fix round 1, finding 3: грешка, различна от throttling (тук — негодни
// данни от доставчика), не пали кеш-маркера — само `e.throttled` решава.
test("/api/v1/elevation: негодни данни от доставчика (не throttling) -> 502, но НЕ пали маркера в кеша", async () => {
  const store = stubCache();
  try {
    resetCooldown();
    const e = env({ FETCH: () => new Response(JSON.stringify({}), { status: 200 }) }); // 200, но без "elevation" -> malformed
    const r1 = await getSettled("/api/v1/elevation?lat=42.2&lon=24.9", e, makeCtx());
    assert.equal(r1.status, 502);
    assert.equal(store.puts, 0, "негодни данни не са throttling — маркерът не се пали");
    // и следваща заявка пак стига до доставчика — не е спряна от несъществуващ маркер
    let calls = 0;
    const e2 = env({ FETCH: () => { calls++; return new Response(JSON.stringify({ elevation: [10] }), { status: 200 }); } });
    const r2 = await getSettled("/api/v1/elevation?lat=42.2&lon=24.9", e2, makeCtx());
    assert.equal(r2.status, 200);
    assert.equal(calls, 1);
  } finally {
    clearCacheStub();
    resetCooldown();
  }
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
    assert.ok(store.has(`https://frost.bg/api/v1/frost?rev=${REV()}&lat=42.184&lon=24.929`), [...store.keys()].join(" "));
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
    store.set(`https://frost.bg/api/v1/frost?rev=${REV()}&lat=42.184&lon=24.929`, cachedEntry({ sentinel: true }));
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
    assert.ok(store.has(`https://frost.bg/api/v1/config?rev=${CONFIG_REV()}`), [...store.keys()].join(" "));
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
    store.set(`https://frost.bg/api/v1/config?rev=${CONFIG_REV()}`, cachedEntry({ sentinel: true }));
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

// Ревизията в ключа: запазен кеш + друга конфигурация/мрежа = miss, не
// стария отговор. Сентинелът под стария ключ доказва, че miss-ът е заради
// ключа, не заради изтекъл или липсващ запис.
test("/api/v1/config: друг MAP в env при запазен кеш -> друг ключ, втори put, свеж отговор", async () => {
  const store = stubCache();
  try {
    const r1 = await getSettled("/api/v1/config", env(), makeCtx());
    assert.equal((await r1.json()).map, "osm");
    assert.equal(store.puts, 1);
    store.set(`https://frost.bg/api/v1/config?rev=${CONFIG_REV()}`, cachedEntry({ sentinel: true }));
    const r2 = await getSettled("/api/v1/config", env({ MAP: "google", GOOGLE_MAPS_KEY: "AIzaTEST" }), makeCtx());
    const b2 = await r2.json();
    assert.notDeepEqual(b2, { sentinel: true }, "смяната на картата не бива да връща стария запис");
    assert.equal(b2.map, "google");
    assert.equal(store.puts, 2, "нов ключ -> нов put");
    assert.ok(store.has(`https://frost.bg/api/v1/config?rev=${CONFIG_REV("google", "openmeteo")}`), [...store.keys()].join(" "));
    // а старият ключ си стои непокътнат (изтича по TTL, не се трие)
    const r3 = await get("/api/v1/config", env(), makeCtx());
    assert.deepEqual(await r3.json(), { sentinel: true });
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/config: MAP=google БЕЗ ключ е ефективно osm -> същият ключ като osm (попадение)", async () => {
  const store = stubCache();
  try {
    await getSettled("/api/v1/config", env(), makeCtx());
    store.set(`https://frost.bg/api/v1/config?rev=${CONFIG_REV()}`, cachedEntry({ sentinel: true }));
    const r = await get("/api/v1/config", env({ MAP: "google", GOOGLE_MAPS_KEY: "" }), makeCtx());
    assert.deepEqual(await r.json(), { sentinel: true });
    assert.equal(store.puts, 1);
  } finally {
    clearCacheStub();
  }
});

// Fix round 1, finding 1: /config трябва да кешира под ключ, който включва
// превключвателя ELEVATION — иначе смяната му не стига до ръба (същата
// проверка като за MAP по-горе, но за двете посоки).
test("/api/v1/config: смяна на ELEVATION (on -> off) при запазен кеш -> друг ключ, свеж отговор", async () => {
  const store = stubCache();
  try {
    const r1 = await getSettled("/api/v1/config", env(), makeCtx());
    assert.equal((await r1.json()).elevation, true);
    assert.equal(store.puts, 1);
    store.set(`https://frost.bg/api/v1/config?rev=${CONFIG_REV()}`, cachedEntry({ sentinel: true }));
    const r2 = await getSettled("/api/v1/config", env({ ELEVATION: "off" }), makeCtx());
    const b2 = await r2.json();
    assert.notDeepEqual(b2, { sentinel: true }, "смяната на ELEVATION не бива да връща стария запис");
    assert.equal(b2.elevation, false);
    assert.equal(store.puts, 2, "нов ключ -> нов put");
    assert.ok(store.has(`https://frost.bg/api/v1/config?rev=${CONFIG_REV("osm", "openmeteo", false)}`), [...store.keys()].join(" "));
    // старият ключ (elevation: true) си стои непокътнат
    const r3 = await get("/api/v1/config", env(), makeCtx());
    assert.deepEqual(await r3.json(), { sentinel: true });
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/config: смяна на ELEVATION (off -> on) при запазен кеш -> друг ключ, свеж отговор", async () => {
  const store = stubCache();
  try {
    const r1 = await getSettled("/api/v1/config", env({ ELEVATION: "off" }), makeCtx());
    assert.equal((await r1.json()).elevation, false);
    assert.equal(store.puts, 1);
    store.set(`https://frost.bg/api/v1/config?rev=${CONFIG_REV("osm", "openmeteo", false)}`, cachedEntry({ sentinel: true }));
    const r2 = await getSettled("/api/v1/config", env(), makeCtx());
    const b2 = await r2.json();
    assert.notDeepEqual(b2, { sentinel: true }, "смяната на ELEVATION не бива да връща стария запис");
    assert.equal(b2.elevation, true);
    assert.equal(store.puts, 2, "нов ключ -> нов put");
    assert.ok(store.has(`https://frost.bg/api/v1/config?rev=${CONFIG_REV()}`), [...store.keys()].join(" "));
  } finally {
    clearCacheStub();
  }
});

test("/api/v1/geocode: смяна на GEOCODER (с ключ) при запазен кеш -> доставчикът се вика пак, provider google", async () => {
  const store = stubCache();
  try {
    let calls = 0;
    const meteoBody = { results: [{ name: "Маноле", latitude: 42.18333, longitude: 24.93333, admin1: "Пловдив" }] };
    const googleBody = { status: "OK", results: [{ formatted_address: "Manole, Bulgaria",
      geometry: { location: { lat: 42.18425, lng: 24.92936 } }, address_components: [] }] };
    const fetchBoth = async (url) => { calls++; return new Response(JSON.stringify(
      new URL(url).hostname === "maps.googleapis.com" ? googleBody : meteoBody), { status: 200 }); };
    const r1 = await getSettled("/api/v1/geocode?q=Manole&lang=en", env({ FETCH: fetchBoth }), makeCtx());
    assert.equal((await r1.json()).provider, "openmeteo");
    assert.equal(calls, 1);
    store.set(`https://frost.bg/api/v1/geocode?rev=${REV()}&q=Manole&lang=en&limit=5`,
      cachedEntry({ sentinel: true }, "public, max-age=300, s-maxage=604800"));
    const r2 = await getSettled("/api/v1/geocode?q=Manole&lang=en",
      env({ FETCH: fetchBoth, GEOCODER: "google", GOOGLE_KEY: "k" }), makeCtx());
    const b2 = await r2.json();
    assert.notDeepEqual(b2, { sentinel: true }, "смяната на геокодера не бива да връща стария Open-Meteo запис");
    assert.equal(b2.provider, "google");
    assert.equal(calls, 2, "нов ключ -> нова заявка към доставчика");
    assert.ok(store.has(`https://frost.bg/api/v1/geocode?rev=${REV("osm", "google")}&q=Manole&lang=en&limit=5`), [...store.keys()].join(" "));
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/frost: нова мрежа (друг grid.computed) при запазен кеш -> miss, не старият отговор", async () => {
  const store = stubCache();
  const computed0 = grid.computed;
  try {
    const r1 = await getSettled("/api/v1/frost?lat=42.18425&lon=24.92936", env(), makeCtx());
    assert.equal(r1.status, 200);
    assert.equal(store.puts, 1);
    store.set(`https://frost.bg/api/v1/frost?rev=${REV()}&lat=42.184&lon=24.929`, cachedEntry({ sentinel: true }));
    // Импортираният grid е един и същ обект в теста и в Worker-а — „нова мрежа“
    // е просто друга дата на смятане; frost.js индексира клетките, не датата.
    grid.computed = "2031-01-05";
    const r2 = await getSettled("/api/v1/frost?lat=42.18425&lon=24.92936", env(), makeCtx());
    const b2 = await r2.json();
    assert.notDeepEqual(b2, { sentinel: true }, "новата мрежа не бива да връща стария запис");
    assert.deepEqual(b2.query, { lat: 42.184, lon: 24.929 });
    assert.equal(store.puts, 2);
    assert.ok(store.has(`https://frost.bg/api/v1/frost?rev=${encodeURIComponent("0.3.3|2031-01-05|osm|openmeteo")}&lat=42.184&lon=24.929`),
      [...store.keys()].join(" "));
  } finally {
    grid.computed = computed0;
    clearCacheStub();
  }
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
  assert.equal(r.headers.get("cache-control"), "public, max-age=300, s-maxage=604800");
  const b = await r.json();
  assert.deepEqual(b.results, [{ name: "Маноле", admin: "Пловдив", admin2: "", lat: 42.183, lon: 24.933 }]);
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
    assert.ok(store.has(`https://frost.bg/api/v1/geocode?rev=${REV()}&q=%D0%9C%D0%B0%D0%BD%D0%BE%D0%BB%D0%B5&lang=bg&limit=5`), [...store.keys()].join(" "));
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
    store.set(`https://frost.bg/api/v1/geocode?rev=${REV()}&q=%D0%9C%D0%B0%D0%BD%D0%BE%D0%BB%D0%B5&lang=bg&limit=5`,
      cachedEntry({ sentinel: true }, "public, max-age=300, s-maxage=604800"));
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
test("/api/v1/geocode: limit само от интервали -> подразбиращите се 5 (в заявката и в ключа)", async () => {
  const store = stubCache();
  try {
    let seen;
    const e = env({ FETCH: async (url) => { seen = new URL(url); return new Response(JSON.stringify({ results: [] }), { status: 200 }); } });
    const r = await getSettled("/api/v1/geocode?q=Manole&lang=en&limit=%20%20", e, makeCtx());
    assert.equal(r.status, 200);
    assert.equal(seen.searchParams.get("count"), "5");
    assert.ok(store.has(`https://frost.bg/api/v1/geocode?rev=${REV()}&q=Manole&lang=en&limit=5`), [...store.keys()].join(" "));
  } finally {
    clearCacheStub();
  }
});
test("/api/v1/geocode: негоден Google запис след валиден -> 200 с валидния, не 502 (limit=1)", async () => {
  const e = env({ GEOCODER: "google", GOOGLE_KEY: "k", FETCH: async () => new Response(JSON.stringify({ status: "OK", results: [
    { formatted_address: "Manole, Bulgaria", geometry: { location: { lat: 42.18425, lng: 24.92936 } }, address_components: [] },
    { formatted_address: "Broken, Bulgaria", geometry: { location: { lat: 42.1, lng: 24.1 } }, address_components: {} },
  ] }), { status: 200 }) });
  const r = await get("/api/v1/geocode?q=Manole&lang=en&limit=1", e);
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.deepEqual(b.results, [{ name: "Manole", admin: "", admin2: "", lat: 42.184, lon: 24.929 }]);
  assert.equal(b.provider, "google");
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
test("/api/v1/geocode: тяло масив на върха от Open-Meteo -> 502, не влиза в кеша", async () => {
  const store = stubCache();
  try {
    const e1 = env({ FETCH: async () => new Response(JSON.stringify([]), { status: 200 }) });
    const r1 = await getSettled("/api/v1/geocode?q=Маноле", e1, makeCtx());
    assert.equal(r1.status, 502);
    const e2 = env({ FETCH: async () => new Response(JSON.stringify([1]), { status: 200 }) });
    const r2 = await getSettled("/api/v1/geocode?q=Маноле", e2, makeCtx());
    assert.equal(r2.status, 502);
    assert.equal(store.puts, 0);
    assert.equal(store.size, 0);
  } finally {
    clearCacheStub();
  }
});
