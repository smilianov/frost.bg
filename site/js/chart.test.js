// Графиката се дели на две: чист модел (тук) и рисуване в DOM. Рисуването
// реално се проверява в браузър (Р6), но една минимална фалшива `document`
// (без DOM библиотека) стига да хване хвърлящ бъг и грешна структура тук.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartModel, toCsv, renderChart, renderTable } from "./chart.js";

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

test("toCsv: нов ред в източника се сгъва до интервал в заглавния коментар", () => {
  const csv = toCsv([], { lat: 1, lon: 2, period: { start: 1, end: 2 }, source: "а\nб,в" });
  assert.equal(csv.split("\n")[0], "# frost.bg · 1, 2 · 1–2 · а б,в");
});

// --- минимална фалшива `document` за renderChart/renderTable -------------
//
// Не е DOM библиотека — само толкова, колкото svgEl/document.createElement
// реално викат: createElementNS/createElement, setAttribute, append,
// textContent. Достатъчно е да хване хвърлящ бъг и грешна структура, без
// да добавя зависимост.
function fakeNode(tag) {
  return {
    tag,
    attrs: {},
    children: [],
    textContent: "",
    setAttribute(k, v) { this.attrs[k] = v; },
    append(...nodes) { this.children.push(...nodes); },
  };
}
function fakeDocument() {
  return { createElementNS: (_ns, tag) => fakeNode(tag), createElement: (tag) => fakeNode(tag) };
}
function findNode(node, tag, cls) {
  if (node.tag === tag && (cls === undefined || node.attrs.class === cls)) return node;
  for (const child of node.children) {
    const hit = findNode(child, tag, cls);
    if (hit) return hit;
  }
  return null;
}
function withFakeDocument(fn) {
  const prev = globalThis.document;
  globalThis.document = fakeDocument();
  try {
    fn();
  } finally {
    globalThis.document = prev;
  }
}

test("renderChart: не хвърля, рисува и двете редици, етикетът носи година, сезон и дата", () => {
  withFakeDocument(() => {
    const model = chartModel(rows, { from: 2023, to: 2025 });
    const t = { spring_word: "пролетна", autumn_word: "есенна" };
    const svg = renderChart(model, { lang: "bg", title: "история на клетката", t });

    const spring = findNode(svg, "circle", "pt spring");
    const autumn = findNode(svg, "rect", "pt autumn");
    assert.ok(spring, "пролетната точка (кръг) е нарисувана");
    assert.ok(autumn, "есенната точка (ромб) е нарисувана");

    const label = spring.attrs["aria-label"];
    assert.ok(label.includes("2023"), "годината е в етикета");
    assert.ok(label.includes("пролетна"), "сезонната дума е в етикета");
    assert.ok(label.includes("1 април"), "датата е в етикета");

    const pointTitle = findNode(spring, "title");
    assert.equal(pointTitle.textContent, label, "title и aria-label носят един и същ текст");

    const svgTitle = svg.children.find((c) => c.tag === "title");
    assert.equal(svgTitle.textContent, "история на клетката", "заглавието на svg се пише, не хвърля");
  });
});

test("renderTable: годината без ред в прозореца получава свой ред с t.no_data_year", () => {
  withFakeDocument(() => {
    const t = {
      table_caption: "историята по години", year: "година",
      last_spring: "последна пролетна", first_autumn: "първа есенна",
      no_frost_recorded: "няма записана слана", no_data_year: "няма достатъчно данни",
    };
    const twoRows = [[2023, "04-01", "10-01"], [2025, "03-20", null]]; // 2024 липсва
    const table = renderTable(twoRows, { lang: "bg", t, from: 2023, to: 2025 });
    const tbody = table.children.find((c) => c.tag === "tbody");
    assert.equal(tbody.children.length, 3, "и трите години от прозореца имат ред, включително липсващата");

    const gapCells = tbody.children[1].children.filter((c) => c.tag === "td");
    assert.deepEqual(gapCells.map((c) => c.textContent), [t.no_data_year, t.no_data_year], "липсваща година -> no_data_year в двете клетки");

    const presentCells = tbody.children[2].children.filter((c) => c.tag === "td");
    assert.equal(presentCells[0].textContent, "20 март", "2025 има пролетна дата");
    assert.equal(presentCells[1].textContent, t.no_frost_recorded, "2025 без есенна дата -> no_frost_recorded, не no_data_year");
  });
});
