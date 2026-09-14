import { test } from "node:test";
import assert from "node:assert/strict";
import { geocode, GeocodeError } from "./geocode.js";

const fakeFetch = (handler) => async (url, init) => handler(new URL(url), init);
const okJson = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("openmeteo: заявката носи name, count, language, countryCode=BG", async () => {
  let seen;
  const f = fakeFetch((u) => { seen = u; return okJson({ results: [] }); });
  await geocode({ q: "Маноле", lang: "bg", limit: 5, provider: "openmeteo", fetchImpl: f });
  assert.equal(seen.hostname, "geocoding-api.open-meteo.com");
  assert.equal(seen.searchParams.get("name"), "Маноле");
  assert.equal(seen.searchParams.get("count"), "5");
  assert.equal(seen.searchParams.get("language"), "bg");
  assert.equal(seen.searchParams.get("countryCode"), "BG");
});
test("openmeteo: нормализация — name, admin1, lat, lon", async () => {
  const f = fakeFetch(() => okJson({ results: [
    { name: "Маноле", latitude: 42.18333, longitude: 24.93333, elevation: 151, admin1: "Пловдив", admin2: "Марица", country_code: "BG" },
  ] }));
  const r = await geocode({ q: "Маноле", lang: "bg", limit: 5, provider: "openmeteo", fetchImpl: f });
  assert.deepEqual(r, { results: [{ name: "Маноле", admin: "Пловдив", lat: 42.183, lon: 24.933 }], provider: "openmeteo" });
});
test("openmeteo: без results -> празен списък", async () => {
  const r = await geocode({ q: "xyzzyqq", lang: "bg", limit: 5, provider: "openmeteo", fetchImpl: fakeFetch(() => okJson({ generationtime_ms: 0.1 })) });
  assert.deepEqual(r.results, []);
});
test("openmeteo: 500 -> GeocodeError", async () => {
  const f = fakeFetch(() => new Response("boom", { status: 500 }));
  await assert.rejects(() => geocode({ q: "Ма", lang: "bg", limit: 5, provider: "openmeteo", fetchImpl: f }), GeocodeError);
});
test("openmeteo: негоден JSON -> GeocodeError", async () => {
  const f = fakeFetch(() => new Response("<html>", { status: 200 }));
  await assert.rejects(() => geocode({ q: "Ма", lang: "bg", limit: 5, provider: "openmeteo", fetchImpl: f }), GeocodeError);
});
test("google: заявката носи address, components=country:BG, language, key", async () => {
  let seen;
  const f = fakeFetch((u) => { seen = u; return okJson({ status: "ZERO_RESULTS", results: [] }); });
  await geocode({ q: "Manole", lang: "en", limit: 5, provider: "google", googleKey: "SECRET", fetchImpl: f });
  assert.equal(seen.hostname, "maps.googleapis.com");
  assert.equal(seen.searchParams.get("address"), "Manole");
  assert.equal(seen.searchParams.get("components"), "country:BG");
  assert.equal(seen.searchParams.get("language"), "en");
  assert.equal(seen.searchParams.get("key"), "SECRET");
});
test("google: нормализация — locality и administrative_area_level_1", async () => {
  const f = fakeFetch(() => okJson({ status: "OK", results: [{
    formatted_address: "Manole, Bulgaria",
    geometry: { location: { lat: 42.18425, lng: 24.92936 } },
    address_components: [
      { long_name: "Manole", types: ["locality", "political"] },
      { long_name: "Plovdiv Province", types: ["administrative_area_level_1", "political"] },
      { long_name: "Bulgaria", types: ["country", "political"] },
    ] }] }));
  const r = await geocode({ q: "Manole", lang: "en", limit: 5, provider: "google", googleKey: "k", fetchImpl: f });
  assert.deepEqual(r, { results: [{ name: "Manole", admin: "Plovdiv Province", lat: 42.184, lon: 24.929 }], provider: "google" });
});
test("google: без locality взима formatted_address до първата запетая", async () => {
  const f = fakeFetch(() => okJson({ status: "OK", results: [{ formatted_address: "Rhodope Mountains, Bulgaria",
    geometry: { location: { lat: 41.7, lng: 24.7 } }, address_components: [] }] }));
  const r = await geocode({ q: "Rhodope", lang: "en", limit: 5, provider: "google", googleKey: "k", fetchImpl: f });
  assert.equal(r.results[0].name, "Rhodope Mountains"); assert.equal(r.results[0].admin, "");
});
test("google: status различен от OK/ZERO_RESULTS -> GeocodeError", async () => {
  const f = fakeFetch(() => okJson({ status: "REQUEST_DENIED", results: [] }));
  await assert.rejects(() => geocode({ q: "x", lang: "en", limit: 5, provider: "google", googleKey: "k", fetchImpl: f }), GeocodeError);
});
test("google без ключ -> пада обратно на openmeteo", async () => {
  let host;
  const f = fakeFetch((u) => { host = u.hostname; return okJson({ results: [] }); });
  const r = await geocode({ q: "Ма", lang: "bg", limit: 5, provider: "google", googleKey: "", fetchImpl: f });
  assert.equal(host, "geocoding-api.open-meteo.com"); assert.equal(r.provider, "openmeteo");
});
test("limit се ограничава до 1..10", async () => {
  let seen;
  const f = fakeFetch((u) => { seen = u; return okJson({ results: [] }); });
  await geocode({ q: "Ма", lang: "bg", limit: 50, provider: "openmeteo", fetchImpl: f });
  assert.equal(seen.searchParams.get("count"), "10");
  await geocode({ q: "Ма", lang: "bg", limit: 0, provider: "openmeteo", fetchImpl: f });
  assert.equal(seen.searchParams.get("count"), "1");
});
test("таймаут -> GeocodeError", async () => {
  const f = async (url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted"))));
  await assert.rejects(() => geocode({ q: "Ма", lang: "bg", limit: 5, provider: "openmeteo", fetchImpl: f, timeoutMs: 20 }), GeocodeError);
});
