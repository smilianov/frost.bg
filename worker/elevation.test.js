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
  for (const body of [{}, { elevation: [] }, { elevation: "350" }, { elevation: [null] }, { elevation: [NaN] }, [1, 2]]) {
    await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: ok(body) }), (e) => {
      assert.ok(e instanceof ElevationError);
      assert.ok(!/350|NaN/.test(e.message), e.message);
      return true;
    });
  }
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

test("краен срок: бавен доставчик -> ElevationError", async () => {
  resetCooldown();
  const slow = () => new Promise(() => {});
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: slow, timeoutMs: 20 }), ElevationError);
});

test("мрежова грешка -> ElevationError, без автоматичен повторен опит", async () => {
  resetCooldown();
  let calls = 0;
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: () => { calls++; return Promise.reject(new Error("boom")); } }), ElevationError);
  assert.equal(calls, 1);
});
