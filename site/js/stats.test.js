// Сметките зад историята по години. Договорът е преписан дума по дума от
// grid/frost_estimate.py — ако тези тестове минат, а мрежата казва друго,
// значи договорът е нарушен (виж stats.parity.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayOfYear, toMMDD, selectWindow, pair } from "./stats.js";

test("dayOfYear: календарът е невисокосен, 29 февруари е 1 март", () => {
  assert.equal(dayOfYear("01-01"), 1);
  assert.equal(dayOfYear("03-01"), 60);
  assert.equal(dayOfYear("02-29"), 60);   // сгънато, както в мрежата
  assert.equal(dayOfYear("12-31"), 365);
  for (const bad of ["13-01", "00-10", "04-31", "4-1", "", null, undefined, "2026-04-01", "0a-01"]) {
    assert.equal(dayOfYear(bad), null, String(bad));
  }
});

test("toMMDD е обратното на dayOfYear", () => {
  assert.equal(toMMDD(1), "01-01");
  assert.equal(toMMDD(60), "03-01");
  assert.equal(toMMDD(365), "12-31");
  for (const bad of [0, 366, -1, 1.5, NaN, null]) assert.equal(toMMDD(bad), null, String(bad));
  for (let d = 1; d <= 365; d++) assert.equal(dayOfYear(toMMDD(d)), d);
});

const rows = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => [from + i, "04-01", "10-01"]);

test("selectWindow избира календарни години, не последните N реда", () => {
  const years = [...rows(1996, 2019), ...rows(2022, 2025)];       // 2020 и 2021 липсват
  const w = selectWindow(years, 2025, 10);
  assert.deepEqual([w.from, w.to], [2016, 2025]);
  assert.equal(w.withData, 8, "2016–2019 и 2022–2025");
  assert.deepEqual(w.rows.map((r) => r[0]), [2016, 2017, 2018, 2019, 2022, 2023, 2024, 2025]);
});

test("selectWindow: празни данни и негодни редове", () => {
  assert.deepEqual(selectWindow([], 2025, 30), { rows: [], from: 1996, to: 2025, withData: 0 });
  const w = selectWindow([[2025, "04-01", "10-01"], "боклук", [null, "04-01", null], [2024]], 2025, 30);
  assert.deepEqual(w.rows.map((r) => r[0]), [2025], "негодните редове се пропускат");
});

test("pair: типичната при четен брой е по-късната напролет и по-ранната наесен", () => {
  // 10 години: пролет 03-25…04-03, есен 10-20…10-29
  const springs = ["03-25", "03-26", "03-27", "03-28", "03-29", "03-30", "03-31", "04-01", "04-02", "04-03"];
  const autumns = ["10-20", "10-21", "10-22", "10-23", "10-24", "10-25", "10-26", "10-27", "10-28", "10-29"];
  const p = pair(springs.map((s, i) => [1996 + i, s, autumns[i]]));
  assert.equal(p.typical.last_spring, "03-30", "s[floor(10/2)] = s[5]");
  assert.equal(p.typical.first_autumn, "10-24", "s[floor(9/2)] = s[4]");
  assert.equal(p.safe.last_spring, "04-02", "ceil(0.9*10)=9 -> s[8]");
  assert.equal(p.safe.first_autumn, "10-20", "max(1, ceil(0.1*10))=1 -> s[0]");
  assert.deepEqual([p.springCount, p.autumnCount], [10, 10]);
});

test("pair: под 10 дати за сезона -> null, без приблизителни стойности", () => {
  const nine = Array.from({ length: 9 }, (_, i) => [1996 + i, "04-01", "10-01"]);
  const p = pair(nine);
  assert.deepEqual(p.typical, { last_spring: null, first_autumn: null });
  assert.deepEqual(p.safe, { last_spring: null, first_autumn: null });
  assert.deepEqual([p.springCount, p.autumnCount], [9, 9]);
});

test("pair: сезоните се броят поотделно — може пролетта да има дата, а есента не", () => {
  const rs = Array.from({ length: 12 }, (_, i) => [1996 + i, "04-01", i < 9 ? "10-01" : null]);
  const p = pair(rs);
  assert.equal(p.typical.last_spring, "04-01");
  assert.equal(p.typical.first_autumn, null);
  assert.deepEqual([p.springCount, p.autumnCount], [12, 9]);
});

test("pair: негодна дата в реда не се брои за сезона", () => {
  const rs = Array.from({ length: 11 }, (_, i) => [1996 + i, i === 0 ? "31-31" : "04-01", "10-01"]);
  assert.equal(pair(rs).springCount, 10);
});

import { seasonSummary, riskAfter, compareWindows } from "./stats.js";

test("seasonSummary: дължината се смята по години, не от типичните дати", () => {
  // 03-31 (ден 90) и 10-01 (ден 274) -> 274-90-1 = 183
  const rs = [[2020, "03-31", "10-01"], [2021, "03-31", "10-02"], [2022, "04-01", "10-01"]];
  const s = seasonSummary(rs);
  assert.equal(s.count, 3);
  assert.equal(s.typical, 183, "медианата на 183, 184, 182");
  assert.deepEqual([s.shortest.days, s.shortest.years], [182, [2022]]);
  assert.deepEqual([s.longest.days, s.longest.years], [184, [2021]]);
});

test("seasonSummary: липсваща сезонна дата отрязва на границата на годината", () => {
  const s = seasonSummary([[2020, null, "10-01"], [2021, "03-31", null], [2022, null, null]]);
  assert.deepEqual(s.byYear.map((y) => y.days), [273, 275, 365], "S=0 / A=366");
  assert.equal(s.clipped, 3, "и трите са отрязани");
});

test("seasonSummary: медиана при четен брой позволява половинка; съседни дати дават 0", () => {
  assert.equal(seasonSummary([[2020, "04-01", "10-01"], [2021, "04-01", "10-02"]]).typical, 182.5);
  assert.equal(seasonSummary([[2020, "04-01", "04-02"]]).typical, 0, "съседни дати = 0 дни");
  assert.equal(seasonSummary([]), null);
  assert.equal(seasonSummary([[2020, "31-31", null]]).count, 1, "негодна дата се брои като липсваща");
});

test("riskAfter: строго по-късно от датата, знаменател = всички редове", () => {
  const rs = [
    [2020, "04-25", "10-01"],   // след 20 април
    [2021, "04-20", "10-01"],   // точно на датата — не се брои
    [2022, "04-10", "10-01"],
    [2023, null, "10-01"],      // без записана слана — влиза в знаменателя
  ];
  assert.deepEqual(riskAfter(rs, "04-20"), { count: 1, total: 4, percent: 25 });
  assert.deepEqual(riskAfter(rs, "01-01"), { count: 3, total: 4, percent: 75 });
  assert.deepEqual(riskAfter([], "04-20"), null);
});

test("riskAfter: само пролет — датите от юли нататък и негодните се отказват", () => {
  const rs = [[2020, "04-25", "10-01"]];
  for (const bad of ["07-01", "12-31", "13-01", "04-31", "", null, "4-1"]) {
    assert.equal(riskAfter(rs, bad), null, String(bad));
  }
  assert.ok(riskAfter(rs, "06-30"), "30 юни още е пролет");
  assert.deepEqual(riskAfter(rs, "02-29"), riskAfter(rs, "03-01"), "29 февруари = 1 март");
});

test("compareWindows: разликата в дни между последните 10 и всичките 30", () => {
  const years = Array.from({ length: 30 }, (_, i) => {
    const y = 1996 + i;
    return [y, y >= 2016 ? "03-20" : "04-01", "10-01"];
  });
  const c = compareWindows(years, 2025);
  assert.equal(c.recent.typical.last_spring, "03-20");
  assert.equal(c.full.typical.last_spring, "04-01");
  assert.deepEqual(c.spring, { days: 12, direction: "earlier" });
  assert.deepEqual(c.autumn, { days: 0, direction: "same" });
});

test("compareWindows: без дата в единия прозорец -> null за този сезон", () => {
  const years = Array.from({ length: 30 }, (_, i) => [1996 + i, i < 20 ? "04-01" : null, "10-01"]);
  const c = compareWindows(years, 2025);
  assert.equal(c.recent.typical.last_spring, null, "последните 10 години нямат пролетни дати");
  assert.equal(c.spring, null);
  assert.ok(c.autumn);
});
