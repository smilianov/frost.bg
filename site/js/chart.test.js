// Графиката се дели на две: чист модел (тук) и рисуване в DOM (проверява се
// в браузър, Р6). CSV-то също е чиста функция.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartModel, toCsv } from "./chart.js";

const rows = [[2023, "04-01", "10-01"], [2024, null, "10-05"], [2025, "03-20", null]];

test("chartModel: по една точка на всяка непразна дата, null няма точка", () => {
  const m = chartModel(rows, { from: 2023, to: 2025 });
  assert.equal(m.points.length, 4, "3+2 дати минус двата null-а");
  assert.deepEqual(m.points.filter((p) => p.season === "spring").map((p) => p.year), [2023, 2025]);
  assert.deepEqual(m.points.filter((p) => p.season === "autumn").map((p) => p.year), [2023, 2024]);
  const first = m.points[0];
  assert.deepEqual([first.year, first.mmdd, first.day], [2023, "04-01", 91]);
});

test("chartModel: обхватът на годините е на прозореца, не на данните", () => {
  const m = chartModel(rows, { from: 1996, to: 2025 });
  assert.deepEqual(m.years, { from: 1996, to: 2025 });
  assert.equal(m.empty, false);
});

test("chartModel: празни данни -> empty, без точки", () => {
  const m = chartModel([], { from: 1996, to: 2025 });
  assert.deepEqual(m.points, []);
  assert.equal(m.empty, true);
});

test("chartModel: етикетите на месеците са на истинските граници", () => {
  const m = chartModel(rows, { from: 2023, to: 2025 });
  assert.equal(m.months.length, 12);
  assert.deepEqual(m.months[0], { day: 1, label: 1 });
  assert.deepEqual(m.months[2], { day: 60, label: 3 }, "1 март е ден 60");
  assert.deepEqual(m.months[11], { day: 335, label: 12 });
});

test("toCsv: заглавен коментар, колони, празно за липсваща дата", () => {
  const csv = toCsv(rows, { lat: 42.2, lon: 24.9, period: { start: 1996, end: 2025 }, source: "ERA5-Land през Copernicus CDS" });
  const lines = csv.trimEnd().split("\n");
  assert.match(lines[0], /^# frost\.bg · 42\.2, 24\.9 · 1996–2025 · ERA5-Land през Copernicus CDS$/);
  assert.equal(lines[1], "year,last_spring,first_autumn");
  assert.deepEqual(lines.slice(2), ["2023,04-01,10-01", "2024,,10-05", "2025,03-20,"]);
  assert.ok(csv.endsWith("\n"), "файлът свършва с нов ред");
});

test("toCsv: източникът не може да вкара нов ред или запетая в коментара", () => {
  const csv = toCsv([], { lat: 1, lon: 2, period: { start: 1, end: 2 }, source: "а\nб,в" });
  assert.equal(csv.split("\n")[0], "# frost.bg · 1, 2 · 1–2 · а б,в");
});
