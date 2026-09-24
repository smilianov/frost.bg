// Височината на самата точка (Open-Meteo Elevation). Мрежата е подменена.
import { test } from "node:test";
import assert from "node:assert/strict";
import { elevation, ElevationError, resetCooldown } from "./elevation.js";

const ok = (body) => () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const status = (code) => () => new Response("{}", { status: code });

test("нормален отговор -> метри", async () => {
  let seen;
  const r = await elevation({ lat: 42.184, lon: 24.929, fetchImpl: (u) => { seen = new URL(u); return ok({ elevation: [350.4] })(); } });
  assert.deepEqual(r, { elevation_m: 350 });
  assert.equal(seen.searchParams.get("latitude"), "42.184");
  assert.equal(seen.searchParams.get("longitude"), "24.929");
});

test("нула и отрицателна височина са валидни стойности", async () => {
  assert.deepEqual(await elevation({ lat: 42, lon: 24, fetchImpl: ok({ elevation: [0] }) }), { elevation_m: 0 });
  assert.deepEqual(await elevation({ lat: 42, lon: 24, fetchImpl: ok({ elevation: [-3.2] }) }), { elevation_m: -3 });
});

test("негоден отговор -> ElevationError, без стойности в съобщението", async () => {
  // JSON.stringify(NaN) дава null, т.е. { elevation: [NaN] } всъщност пращаше
  // { elevation: [null] } по мрежата — вече не е негодно (виж следващия
  // тест: null е легитимен отговор, fix round 1, finding 2), затова тук
  // остава само истински негодните форми. Суров текст с 1e999 се парсва до
  // Infinity: typeof "number", но не е крайно — реално покрива Number.isFinite.
  const raw = (text) => () => new Response(text, { status: 200, headers: { "content-type": "application/json" } });
  const cases = [ok({}), ok({ elevation: [] }), ok({ elevation: "350" }), raw('{"elevation":[1e999]}'), ok([1, 2])];
  for (const fetchImpl of cases) {
    await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl }), (e) => {
      assert.ok(e instanceof ElevationError);
      assert.ok(!/350|Infinity/.test(e.message), e.message);
      assert.equal(e.throttled, false, "негодни данни не са throttling");
      return true;
    });
  }
});

// Fix round 1, finding 2: Ф6 обещава изрично null при липсваща стойност —
// доставчикът може да връща null за точки без данни, и това не е грешка на
// доставчика, а легитимен отговор. Само истински негодни форми (масив с
// друг тип/дължина, обект без elevation, NaN/Infinity) остават ElevationError.
test("височина null от доставчика -> легитимен отговор { elevation_m: null }, не грешка", async () => {
  assert.deepEqual(await elevation({ lat: 42, lon: 24, fetchImpl: ok({ elevation: [null] }) }), { elevation_m: null });
});

test("429 и 5xx включват кратък отказ: следващата заявка не пита нагоре", async () => {
  resetCooldown();
  let calls = 0;
  const f = () => { calls++; return status(429)(); };
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: f, now: 1000 }));
  assert.equal(calls, 1);
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: f, now: 2000 }), /cooldown/i);
  assert.equal(calls, 1, "в отказа не се пита нагоре");
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: f, now: 1000 + 10 * 60 * 1000 + 1 }));
  assert.equal(calls, 2, "след 10 минути пак се пита");
});

// Fix round 1, finding 3: маршрутът (worker/index.js) вече не съпоставя
// текста на e.message, за да реши дали да пали споделения кеш-маркер —
// чете стабилно свойство `throttled`. И двата пътя, които слагат isolate-а
// в кулдаун (прясно 429/5xx И локалната „вече в кулдаун“ проверка), трябва
// да го носят — иначе смяна на текста на съобщението тихо би изключила
// координацията между isolate-и.
test("throttling/кулдаун грешките носят стабилен маркер throttled:true", async () => {
  resetCooldown();
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: status(429), now: 1000 }), (e) => {
    assert.ok(e instanceof ElevationError);
    assert.equal(e.throttled, true, "прясно 429 -> throttled");
    return true;
  });
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: () => { throw new Error("не бива да се пита нагоре"); }, now: 2000 }), (e) => {
    assert.equal(e.throttled, true, "локалната проверка „вече в кулдаун“ също носи маркера");
    return true;
  });
});

test("503 (5xx) също включва кратък отказ, не само 429", async () => {
  resetCooldown();
  let calls = 0;
  const f = () => { calls++; return status(503)(); };
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: f, now: 1000 }));
  assert.equal(calls, 1);
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: f, now: 2000 }), /cooldown/i);
  assert.equal(calls, 1, "в отказа не се пита нагоре");
});

test("краен срок: бавен доставчик -> ElevationError", async () => {
  resetCooldown();
  const slow = () => new Promise(() => {});
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: slow, timeoutMs: 20 }), ElevationError);
});

test("краен срок покрива и четенето на тялото: забавено тяло -> ElevationError, не късен успех", async () => {
  resetCooldown();
  const stalledBody = { ok: true, status: 200, json: () => new Promise(() => {}) };
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: () => Promise.resolve(stalledBody), timeoutMs: 20 }), ElevationError);
});

test("мрежова грешка -> ElevationError, без автоматичен повторен опит", async () => {
  resetCooldown();
  let calls = 0;
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: () => { calls++; return Promise.reject(new Error("boom")); } }), ElevationError);
  assert.equal(calls, 1);
});
