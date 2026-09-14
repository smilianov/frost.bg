import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCoords, nearestCell, haversineM, frostResponse } from "./frost.js";
import { TEXTS } from "./texts.js";

const grid = {
  version: 1, computed: "2026-09-14", synthetic: true,
  period: { start: 1996, end: 2025 }, threshold_c: 0, step_deg: 0.1,
  bbox: { lat: [41.2, 44.3], lon: [22.3, 28.7] }, source: "x",
  cells: [
    { lat: 42.2, lon: 24.9, elev: 152, typical: ["03-27", "11-23"], safe: ["04-10", "10-30"],
      years_used: 30, years_with_spring: 30, years_with_autumn: 30, years: [[1996, "04-10", "11-02"]] },
    { lat: 42.1, lon: 24.9, elev: 140, typical: ["03-20", "11-25"], safe: ["04-05", "11-01"],
      years_used: 30, years_with_spring: 30, years_with_autumn: 30, years: [] },
    { lat: 44.3, lon: 28.7, elev: 5, typical: [null, "12-01"], safe: [null, "11-20"],
      years_used: 30, years_with_spring: 4, years_with_autumn: 30, years: [] },
    { lat: 42.3, lon: 24.9, elev: 210, typical: ["03-25", "11-20"], safe: ["04-08", "10-28"],
      years_used: 30, years_with_spring: 30, years_with_autumn: 30, years: [] },
  ],
};

test("parseCoords закръгля до 3 знака", () => {
  assert.deepEqual(parseCoords("42.18425", "24.92936"), { lat: 42.184, lon: 24.929 });
});
test("parseCoords: невалидни -> null", () => {
  for (const [a, b] of [["abc", "24"], ["42", ""], [null, "24"], ["91", "24"], ["42", "181"], ["NaN", "24"]]) {
    assert.equal(parseCoords(a, b), null, `${a},${b}`);
  }
});
test("parseCoords: само интервали, шестнайсетично, експонента, недовършено десетично -> null", () => {
  for (const [a, b] of [[" ", "24"], ["\t\n", "24"], ["0x2a", "24"], ["1e2", "24"], ["42.", "24"], [".5", "24"]]) {
    assert.equal(parseCoords(a, b), null, `${JSON.stringify(a)},${b}`);
  }
});
test("parseCoords: околните интервали се подрязват", () => {
  assert.deepEqual(parseCoords(" 42.1 ", "24.9"), { lat: 42.1, lon: 24.9 });
});
test("parseCoords: -0 излиза като 0, не -0", () => {
  const r = parseCoords("-0", "24.9");
  assert.ok(Object.is(r.lat, 0), String(r.lat));
});
test("parseCoords: ширина под -90 -> null", () => {
  assert.equal(parseCoords("-91", "0"), null);
});
test("nearestCell: закръгляне до 0.1 намира клетката", () => {
  const r = nearestCell(grid, 42.184, 24.929);
  assert.equal(r.cell.lat, 42.2); assert.equal(r.cell.lon, 24.9);
  assert.ok(r.distance_m > 2000 && r.distance_m < 3500, String(r.distance_m));
});
test("nearestCell: точно на клетката -> 0 м", () => {
  assert.equal(nearestCell(grid, 42.2, 24.9).distance_m, 0);
});
test("nearestCell: половин стъпка извън ръба още е вътре, повече — не", () => {
  assert.ok(nearestCell(grid, 44.34, 28.74));                 // закръгля на 44.3, 28.7
  assert.equal(nearestCell(grid, 44.36, 28.7), null);          // 44.4 няма
  assert.equal(nearestCell(grid, 41.14, 24.9), null);          // 41.1 няма
  assert.equal(nearestCell(grid, 42.2, 22.24), null);          // 22.2 няма
});
test("nearestCell: клетка в правоъгълника, но липсваща в мрежата -> null", () => {
  assert.equal(nearestCell(grid, 43.0, 25.0), null);
});
test("nearestCell: distance_m е цяло число", () => {
  const r = nearestCell(grid, 42.184, 24.929);
  assert.ok(Number.isInteger(r.distance_m), String(r.distance_m));
});
test("nearestCell: разстоянието съвпада с независимо пресметнатата стойност", () => {
  const r = nearestCell(grid, 42.184, 24.929);
  assert.ok(Math.abs(r.distance_m - 2979) <= 5, String(r.distance_m));
});
test("nearestCell: равен остатък (.5) закръгля нагоре — Math.round семантика", () => {
  const r = nearestCell(grid, 42.25, 24.85);
  assert.equal(r.cell.lat, 42.3); assert.equal(r.cell.lon, 24.9);
});
test("haversine: 0.1° ширина ≈ 11.1 км", () => {
  const d = haversineM(42.0, 24.0, 42.1, 24.0);
  assert.ok(d > 11000 && d < 11200, String(d));
});
test("frostResponse: тялото по спецификацията", () => {
  const r = frostResponse(grid, 42.184, 24.929);
  assert.deepEqual(r.query, { lat: 42.184, lon: 24.929 });
  assert.deepEqual(Object.keys(r.cell).sort(), ["distance_m", "elev_m", "lat", "lon"]);
  assert.deepEqual({ lat: r.cell.lat, lon: r.cell.lon, elev_m: r.cell.elev_m }, { lat: 42.2, lon: 24.9, elev_m: 152 });
  assert.ok(Number.isInteger(r.cell.distance_m), String(r.cell.distance_m));
  assert.ok(Math.abs(r.cell.distance_m - 2979) <= 5, String(r.cell.distance_m));
  assert.deepEqual(r.typical, { last_spring: "03-27", first_autumn: "11-23" });
  assert.deepEqual(r.safe, { last_spring: "04-10", first_autumn: "10-30" });
  assert.equal(r.years_used, 30);
  assert.deepEqual(r.years, [[1996, "04-10", "11-02"]]);
  assert.deepEqual(r.period, { start: 1996, end: 2025 });
  assert.equal(r.threshold_c, 0);
  assert.equal(r.note.bg, TEXTS.note.bg); assert.equal(r.note.en, TEXTS.note.en);
  assert.equal(r.source.bg, "ERA5-Land през Copernicus CDS, 1996–2025");
  assert.equal(r.source.en, "ERA5-Land via Copernicus CDS, 1996–2025");
  assert.equal(r.source.url, "https://cds.climate.copernicus.eu/datasets/derived-era5-land-daily-statistics");
  assert.equal(r.source.attribution, "Contains modified Copernicus Climate Change Service information 2026");
  assert.equal(r.version, "1");
  assert.equal(r.synthetic, true);
});
test("frostResponse: null дати минават като null", () => {
  const r = frostResponse(grid, 44.3, 28.7);
  assert.equal(r.typical.last_spring, null); assert.equal(r.safe.last_spring, null);
});
test("frostResponse: извън -> null", () => {
  assert.equal(frostResponse(grid, 45.0, 25.0), null);
});
test("frostResponse: точно тези ключове на първо ниво, нищо повече", () => {
  const r = frostResponse(grid, 42.184, 24.929);
  assert.deepEqual(
    Object.keys(r).sort(),
    ["cell", "note", "period", "query", "safe", "source", "synthetic", "threshold_c", "typical", "version", "years", "years_used"].sort()
  );
});
test("frostResponse: synthetic:false минава като false, не се пренаписва на true", () => {
  const gridReal = { ...grid, synthetic: false };
  const r = frostResponse(gridReal, 42.2, 24.9);
  assert.equal(r.synthetic, false);
});
test("frostResponse: годината в source.attribution идва от grid.computed, не от часовника", () => {
  const gridLater = {
    ...grid, computed: "2031-01-05",
    cells: [{ lat: 42.2, lon: 24.9, elev: 152, typical: ["03-27", "11-23"], safe: ["04-10", "10-30"],
              years_used: 30, years_with_spring: 30, years_with_autumn: 30, years: [] }],
  };
  const r = frostResponse(gridLater, 42.2, 24.9);
  assert.ok(r.source.attribution.endsWith("2031"), r.source.attribution);
});
test("frostResponse: source.bg/en и period идват от grid.period, не са захардкоднати", () => {
  const gridPeriod = {
    ...grid, period: { start: 2000, end: 2029 }, computed: "2030-01-05",
    cells: [{ lat: 42.2, lon: 24.9, elev: 152, typical: ["03-27", "11-23"], safe: ["04-10", "10-30"],
              years_used: 30, years_with_spring: 30, years_with_autumn: 30, years: [] }],
  };
  const r = frostResponse(gridPeriod, 42.2, 24.9);
  assert.equal(r.source.bg, "ERA5-Land през Copernicus CDS, 2000–2029");
  assert.equal(r.source.en, "ERA5-Land via Copernicus CDS, 2000–2029");
  assert.deepEqual(r.period, { start: 2000, end: 2029 });
  assert.ok(r.source.attribution.endsWith("2030"), r.source.attribution);
});
test("note: непразни, различни на двата езика, en съдържа „frost“", () => {
  assert.ok(TEXTS.note.bg.length > 0);
  assert.ok(TEXTS.note.en.length > 0);
  assert.notEqual(TEXTS.note.bg, TEXTS.note.en);
  assert.ok(TEXTS.note.en.includes("frost"));
});
test("TEXTS: всяка грешка и бележката са на двата езика и не съдържат „мраз“", () => {
  for (const k of ["bad_request", "outside_bulgaria", "geocoder_failed", "not_found"]) {
    assert.ok(TEXTS.errors[k].bg.length > 5 && TEXTS.errors[k].en.length > 5, k);
    assert.ok(!TEXTS.errors[k].bg.includes("мраз"), k);
  }
  assert.ok(TEXTS.note.bg.includes("слана") && !TEXTS.note.bg.includes("мраз"));
});
