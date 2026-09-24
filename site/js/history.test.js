import { test } from "node:test";
import assert from "node:assert/strict";
import { riskFor, inWindow, classifyRisk, langSwitchQuery, historyView } from "./history.js";
import { T } from "./texts.js";

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

// --- classifyRisk ---------------------------------------------------------

test("classifyRisk: нито ден, нито месец въведени -> \"empty\", без съобщение (не подканва с грешка отрано)", () => {
  const rows = [[2020, "04-01", "10-01"]];
  assert.deepEqual(classifyRisk(rows, 1, { day: "", month: "" }, T.bg, "bg"), { state: "empty", message: "" });
  assert.deepEqual(classifyRisk(rows, 1, null, T.bg, "bg"), { state: "empty", message: "" });
});

test("classifyRisk: 29 февруари дава видимо изречение за сгъването към 1 март, независимо от изхода", () => {
  const rows = [[2020, "04-01", "10-01"]];
  const r = classifyRisk(rows, 1, { day: "29", month: "2" }, T.bg, "bg");
  assert.equal(r.state, "result");
  assert.ok(r.message.includes(T.bg.risk_feb29_note), r.message);
});

test("classifyRisk: невъзможна дата -> \"bad_date\"; нула използваеми години с годна дата -> \"unavailable\"", () => {
  assert.equal(classifyRisk([[2020, "04-01", "10-01"]], 1, { day: "31", month: "04" }, T.bg, "bg").state, "bad_date");
  assert.equal(classifyRisk([], 0, { day: "20", month: "04" }, T.bg, "bg").state, "unavailable");
});

// --- langSwitchQuery -------------------------------------------------------

test("langSwitchQuery: с координати носи shareUrl(\"\", …); без координати — само ?window= (нищо при подразбиращия се)", () => {
  assert.equal(langSwitchQuery(42.184, 24.929, 30), "?lat=42.184&lon=24.929");
  assert.equal(langSwitchQuery(42.184, 24.929, 10), "?lat=42.184&lon=24.929&window=10");
  assert.equal(langSwitchQuery(null, null, 10), "?window=10");
  assert.equal(langSwitchQuery(null, null, 30), "");
});

// --- historyView: изгледът на историята, изцяло чиста функция -------------

function makeYears(fromYear, toYear, springMMDD, autumnMMDD) {
  const rows = [];
  for (let y = fromYear; y <= toYear; y++) rows.push([y, springMMDD, autumnMMDD]);
  return rows;
}

test("historyView: липсващ period.end -> visible:false (единствената причина да се скрие цялата секция)", () => {
  const view = historyView({ data: { years: [[2020, "04-01", "10-01"]], period: {} }, window: 30, lang: "bg", t: T.bg, riskInput: null });
  assert.equal(view.visible, false);
});

test("historyView: клетка без нито един ред (years: []) -> видима секция, обяснена с t.no_history, не скрита", () => {
  const view = historyView({
    data: { years: [], period: { start: 1996, end: 2025 }, cell: { lat: 42, lon: 25 } },
    window: 30, lang: "bg", t: T.bg, riskInput: null,
  });
  assert.equal(view.visible, true);
  assert.equal(view.empty, true);
  assert.equal(view.message, T.bg.no_history);
});

test("historyView: редовете ги има, но никъде не е записана слана -> различно съобщение от \"няма данни\"", () => {
  const rows = makeYears(1996, 2025, null, null);
  const view = historyView({
    data: { years: rows, period: { start: 1996, end: 2025 }, cell: { lat: 42, lon: 25 } },
    window: 30, lang: "bg", t: T.bg, riskInput: null,
  });
  assert.equal(view.empty, false); // years.length > 0 — секцията не е "напълно празна"
  assert.equal(view.chart.empty, false); // редовете в 30-годишния обхват съществуват
  assert.equal(view.chart.allNull, true);
  assert.equal(view.chart.message, T.bg.no_frost_any);
});

test("historyView: под 10 години със записана слана -> pairs.tooFewYears, не \"няма данни\"", () => {
  const rows = makeYears(2021, 2025, "04-01", "10-01"); // 5 реда, всички с истинска пролетна дата
  const view = historyView({
    data: { years: rows, period: { start: 2021, end: 2025 }, cell: { lat: 42, lon: 25 } },
    window: 30, lang: "bg", t: T.bg, riskInput: null,
  });
  assert.equal(view.empty, false);
  assert.equal(view.pairs.tooFewYears, true);
  assert.equal(view.pairs.tooFewYearsMessage, T.bg.too_few_years);
  assert.equal(view.pairs.typicalSpring, "—");
});

test("historyView: графиката пази пълния 30-годишен обхват независимо от прозореца; selectedFrom/To следва прозореца", () => {
  const rows = makeYears(1996, 2025, "04-01", "10-01");
  const data = { years: rows, period: { start: 1996, end: 2025 }, cell: { lat: 42, lon: 25 } };
  const v10 = historyView({ data, window: 10, lang: "bg", t: T.bg, riskInput: null });
  const v30 = historyView({ data, window: 30, lang: "bg", t: T.bg, riskInput: null });
  assert.deepEqual([v10.chart.from, v10.chart.to], [1996, 2025]);
  assert.deepEqual([v30.chart.from, v30.chart.to], [1996, 2025]); // фиксиран обхват — не се мести с прозореца
  assert.deepEqual([v10.chart.selectedFrom, v10.chart.selectedTo], [2016, 2025]); // само откроеното следва прозореца
  assert.deepEqual([v30.chart.selectedFrom, v30.chart.selectedTo], [1996, 2025]);
});

test("historyView: рискът се смята наново за текущия прозорец — никакво остаряло състояние за пазене", () => {
  const rows = [
    ...makeYears(1996, 2015, "03-01", "10-01"), // 20 г.: пролетта е преди 20 април -> не се брои
    ...makeYears(2016, 2025, "05-01", "10-01"), // 10 г.: пролетта е след 20 април -> се брои
  ];
  const data = { years: rows, period: { start: 1996, end: 2025 }, cell: { lat: 42, lon: 25 } };
  const riskInput = { day: "20", month: "04" };
  const v30 = historyView({ data, window: 30, lang: "bg", t: T.bg, riskInput });
  const v10 = historyView({ data, window: 10, lang: "bg", t: T.bg, riskInput });
  assert.ok(v30.risk.message.includes("10 от 30"), v30.risk.message);
  assert.ok(v10.risk.message.includes("10 от 10"), v10.risk.message);
  assert.notEqual(v30.risk.message, v10.risk.message); // смяната на прозореца дава различен, не остарял отговор
});

test("historyView: без въведена дата в риска -> risk.state \"empty\", не подканва отрано", () => {
  const rows = makeYears(1996, 2025, "04-01", "10-01");
  const view = historyView({
    data: { years: rows, period: { start: 1996, end: 2025 }, cell: { lat: 42, lon: 25 } },
    window: 30, lang: "bg", t: T.bg, riskInput: null,
  });
  assert.equal(view.risk.state, "empty");
});

test("historyView: CSV носи пълния 30-годишен обхват (същите редове като таблицата), не избрания прозорец", () => {
  const rows = makeYears(1996, 2025, "04-01", "10-01");
  const data = {
    years: rows, period: { start: 1996, end: 2025 }, cell: { lat: 42.2, lon: 24.9 },
    source: { bg: "ERA5-Land през Copernicus CDS" },
  };
  const view = historyView({ data, window: 10, lang: "bg", t: T.bg, riskInput: null });
  const lines = view.csv.trim().split("\n");
  assert.equal(lines.length, 2 + 30); // заглавие + заглавен ред + 30 години
  assert.equal(view.csvFilename, "frost-bg-42.2-24.9.csv");
});
