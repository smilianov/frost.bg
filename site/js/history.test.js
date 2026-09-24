import { test } from "node:test";
import assert from "node:assert/strict";
import { riskFor, inWindow } from "./history.js";

test("riskFor: невъзможна или извън обхвата (след 30 юни) дата -> \"bad_date\"", () => {
  const rows = [[2020, "04-01", "10-01"]];
  assert.equal(riskFor(rows, "04-31"), "bad_date"); // 31 април не съществува
  assert.equal(riskFor(rows, "07-01"), "bad_date"); // след 30 юни
  assert.equal(riskFor(rows, ""), "bad_date");
  assert.equal(riskFor(rows, "NaN-NaN"), "bad_date");
});

test("riskFor: годна дата, но нула използваеми години в прозореца -> \"unavailable\", не \"bad_date\"", () => {
  assert.equal(riskFor([], "04-20"), "unavailable");
  assert.equal(riskFor(null, "04-20"), "unavailable");
});

test("riskFor: годна дата с данни -> резултатът на riskAfter (същата формула, не втора)", () => {
  const rows = [[2020, "04-01", "10-01"], [2021, "03-01", "10-05"]];
  assert.deepEqual(riskFor(rows, "03-15"), { count: 1, total: 2, percent: 50 });
});

test("riskFor: 29 февруари се приема (сгъва се към 1 март), не е \"bad_date\"", () => {
  const rows = [[2020, "04-01", "10-01"]];
  assert.notEqual(riskFor(rows, "02-29"), "bad_date");
});

test("inWindow: годината е в прозореца, границите включително", () => {
  const w = { from: 2016, to: 2025 };
  assert.equal(inWindow(2016, w), true);
  assert.equal(inWindow(2025, w), true);
  assert.equal(inWindow(2020, w), true);
  assert.equal(inWindow(2015, w), false);
  assert.equal(inWindow(2026, w), false);
});
