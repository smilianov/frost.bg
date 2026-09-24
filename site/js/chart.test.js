// Графиката се дели на две: чист модел (тук) и рисуване в DOM. Рисуването
// реално се проверява в браузър (Р6), но една минимална фалшива `document`
// (без DOM библиотека) стига да хване хвърлящ бъг и грешна структура тук.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartModel, toCsv, renderChart, renderTable, selectYear, yearReadoutText } from "./chart.js";

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

// Преглед: selectYear() е решението зад readout-а на графиката (Ф5:
// "избор на година... Tooltip казва година, сезон и дата") — чист израз на
// (model, year), тества се директно, без DOM.
test("selectYear: връща точките на годината и hasRow:true, или null за сезон без точка", () => {
  const m = chartModel(rows, { from: 2023, to: 2025 });
  assert.deepEqual(selectYear(m, 2023), {
    year: 2023,
    spring: { year: 2023, day: 91, season: "spring", mmdd: "04-01" },
    autumn: { year: 2023, day: 274, season: "autumn", mmdd: "10-01" },
    hasRow: true,
  });
  assert.equal(selectYear(m, 2024).spring, null, "2024 няма пролетна дата, но си има ред");
  assert.equal(selectYear(m, 2024).hasRow, true);
  assert.equal(selectYear(m, 2024).autumn.mmdd, "10-05");
  assert.equal(selectYear(m, 2025).autumn, null, "2025 няма есенна дата");
});

// Преглед (последна вълна): "годината няма ред изобщо" != "има ред, но
// сезонът е null" — hasRow ги разграничава (таблицата вече го правеше).
test("selectYear: година без нито един ред -> hasRow:false, и двата сезона null (не хвърля)", () => {
  const m = chartModel(rows, { from: 2023, to: 2025 });
  assert.deepEqual(selectYear(m, 2026), { year: 2026, spring: null, autumn: null, hasRow: false });
});

test("yearReadoutText: годината и двата сезона, с t.no_frost_recorded за липсваща сезонна точка", () => {
  const t = { spring_word: "пролетна", autumn_word: "есенна", no_frost_recorded: "няма записана слана", no_data_year: "няма достатъчно данни" };
  const m = chartModel(rows, { from: 2023, to: 2025 });
  assert.equal(yearReadoutText(selectYear(m, 2023), "bg", t), "2023 · пролетна: 1 април · есенна: 1 октомври");
  assert.equal(yearReadoutText(selectYear(m, 2024), "bg", t), "2024 · пролетна: няма записана слана · есенна: 5 октомври");
});

// Преглед (последна вълна): година без ред изобщо (различно от ред със
// сезон null) чете no_data_year в readout-а, точно както в таблицата.
test("yearReadoutText: година без нито един ред -> t.no_data_year, не t.no_frost_recorded", () => {
  const t = { spring_word: "пролетна", autumn_word: "есенна", no_frost_recorded: "няма записана слана", no_data_year: "няма достатъчно данни" };
  const m = chartModel(rows, { from: 2023, to: 2025 });
  assert.equal(yearReadoutText(selectYear(m, 2026), "bg", t), "2026 · няма достатъчно данни");
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
// textContent, addEventListener. Достатъчно е да хване хвърлящ бъг и грешна
// структура, без да добавя зависимост. fire() симулира събитие (клик,
// keydown) — реалната клавиатура/мишка се проверява в браузър (Р6).
function fakeNode(tag) {
  const classSet = new Set();
  const node = {
    tag,
    attrs: {},
    children: [],
    textContent: "",
    _listeners: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
      if (k === "class") { classSet.clear(); for (const c of String(v).split(/\s+/).filter(Boolean)) classSet.add(c); }
    },
    append(...nodes) { this.children.push(...nodes); },
    addEventListener(type, handler) { (this._listeners[type] ??= []).push(handler); },
    fire(type, event = {}) { for (const h of this._listeners[type] || []) h(event); },
    // classList.toggle/add — app.js (markSelection) и renderChart (избраната
    // година) слагат/махат класове независимо на СЪЩИТЕ възли; трябва да се
    // допълват, не да се изтриват при пълен презапис на "class".
    classList: {
      add: (c) => { classSet.add(c); node.attrs.class = [...classSet].join(" "); },
      remove: (c) => { classSet.delete(c); node.attrs.class = [...classSet].join(" "); },
      contains: (c) => classSet.has(c),
      toggle: (c, force) => {
        const on = force !== undefined ? force : !classSet.has(c);
        if (on) classSet.add(c); else classSet.delete(c);
        node.attrs.class = [...classSet].join(" ");
        return on;
      },
    },
  };
  return node;
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
    const t = { spring_word: "пролетна", autumn_word: "есенна", chart_nav_hint: "стрелки за година" };
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

// Преглед (Ф5): "всяка стойност е достижима с пръст и клавиатура... избор
// на година (не 60 невидими мишени)". Точките остават именувани, но вече
// не са отделни tab спирки — графиката е една.
test("renderChart: цялата графика е ЕДНА tab спирка — точките вече не са отделни", () => {
  withFakeDocument(() => {
    const model = chartModel(rows, { from: 2023, to: 2025 });
    const t = { spring_word: "пролетна", autumn_word: "есенна", chart_nav_hint: "стрелки" };
    const svg = renderChart(model, { lang: "bg", title: "т", t });
    assert.equal(svg.attrs.tabindex, "0", "графиката е фокусируема");
    const spring = findNode(svg, "circle", "pt spring");
    assert.equal(spring.attrs.tabindex, undefined, "точката вече не е отделна tab спирка");
    assert.ok(spring.attrs["aria-label"].includes("2023"), "но името ѝ си остава (Ф5: точките пазят имената си)");
  });
});

// Преглед (последна вълна): role="application" потискаше обикновеното
// разглеждане на четеца на екрана, без да дава нищо насреща — role="img" +
// aria-describedby към видимия readout е връзката, не aria-activedescendant.
test("renderChart: role=\"img\" (не \"application\"), aria-describedby сочи към readoutId, ако е подаден", () => {
  withFakeDocument(() => {
    const model = chartModel(rows, { from: 2023, to: 2025 });
    const t = { spring_word: "пролетна", autumn_word: "есенна", chart_nav_hint: "стрелки" };
    const withReadout = renderChart(model, { lang: "bg", title: "т", t, readoutId: "chart-readout" });
    assert.equal(withReadout.attrs.role, "img");
    assert.equal(withReadout.attrs["aria-describedby"], "chart-readout");

    const withoutReadout = renderChart(model, { lang: "bg", title: "т", t });
    assert.equal(withoutReadout.attrs["aria-describedby"], undefined, "без readoutId не се слага празна връзка");
  });
});

test("renderChart: стрелките местят избраната година; Home/End до краищата; Escape изчиства", () => {
  withFakeDocument(() => {
    const model = chartModel(rows, { from: 2023, to: 2025 });
    const t = { spring_word: "пролетна", autumn_word: "есенна", chart_nav_hint: "стрелки" };
    const selections = [];
    const svg = renderChart(model, { lang: "bg", title: "т", t, onSelectYear: (y) => selections.push(y) });

    svg.fire("keydown", { key: "ArrowRight" });
    assert.equal(selections.at(-1), 2023, "първо дясно от нищо избрано -> първата година");
    svg.fire("keydown", { key: "ArrowRight" });
    assert.equal(selections.at(-1), 2024);
    svg.fire("keydown", { key: "End" });
    assert.equal(selections.at(-1), 2025);
    svg.fire("keydown", { key: "ArrowRight" });
    assert.equal(selections.at(-1), 2025, "не пада извън обхвата");
    svg.fire("keydown", { key: "Home" });
    assert.equal(selections.at(-1), 2023);
    svg.fire("keydown", { key: "Escape" });
    assert.equal(selections.at(-1), null, "Escape изчиства избора");
  });
});

test("renderChart: клик върху точка избира годината ѝ", () => {
  withFakeDocument(() => {
    const model = chartModel(rows, { from: 2023, to: 2025 });
    const t = { spring_word: "пролетна", autumn_word: "есенна", chart_nav_hint: "стрелки" };
    const selections = [];
    const svg = renderChart(model, { lang: "bg", title: "т", t, onSelectYear: (y) => selections.push(y) });
    findNode(svg, "rect", "pt autumn").fire("click"); // 2023 или 2024 — първата есенна точка (2023)
    assert.equal(selections.at(-1), 2023);
  });
});

// Преглед (последна вълна): допирът/кликът няма Escape — повторен допир
// върху вече избраната година е единственият изход за пипващи устройства.
test("renderChart: повторен клик върху вече избраната година я изчиства (допир няма Escape)", () => {
  withFakeDocument(() => {
    const model = chartModel(rows, { from: 2023, to: 2025 });
    const t = { spring_word: "пролетна", autumn_word: "есенна", chart_nav_hint: "стрелки" };
    const selections = [];
    const svg = renderChart(model, { lang: "bg", title: "т", t, onSelectYear: (y) => selections.push(y) });
    const spring = findNode(svg, "circle", "pt spring"); // 2023

    spring.fire("click");
    assert.equal(selections.at(-1), 2023, "първи клик избира");
    spring.fire("click");
    assert.equal(selections.at(-1), null, "втори клик на СЪЩАТА точка изчиства");
    spring.fire("click");
    assert.equal(selections.at(-1), 2023, "трети клик избира отново — не е заключено на null");
  });
});

// Клавиатурата не бива да наследи това поведение: Home/End на вече
// избраната граница трябва да си остане потвърждение, не изчистване.
test("renderChart: Home/End на вече избраната граница НЕ изчиства (само допирът превключва)", () => {
  withFakeDocument(() => {
    const model = chartModel(rows, { from: 2023, to: 2025 });
    const t = { spring_word: "пролетна", autumn_word: "есенна", chart_nav_hint: "стрелки" };
    const selections = [];
    const svg = renderChart(model, { lang: "bg", title: "т", t, onSelectYear: (y) => selections.push(y) });
    svg.fire("keydown", { key: "Home" });
    assert.equal(selections.at(-1), 2023);
    svg.fire("keydown", { key: "Home" });
    assert.equal(selections.at(-1), 2023, "повторно Home си остава 2023, не null");
  });
});

// app.js слага "out-of-window" на същите точки отделно (markSelection); ако
// избирането на година презапише целия клас на възела, "out-of-window"
// изчезва мълчаливо. classList.toggle("year-selected", …) вместо
// setAttribute("class", …) пази двата класа независими.
test("renderChart: избирането на година добавя \"year-selected\", без да маха вече сложен \"out-of-window\"", () => {
  withFakeDocument(() => {
    const model = chartModel(rows, { from: 2023, to: 2025 });
    const t = { spring_word: "пролетна", autumn_word: "есенна", chart_nav_hint: "стрелки" };
    const svg = renderChart(model, { lang: "bg", title: "т", t });
    const spring = findNode(svg, "circle", "pt spring"); // 2023
    spring.classList.add("out-of-window"); // както app.js's markSelection() би направил

    spring.fire("click"); // избира 2023 — самата точка
    assert.ok(spring.classList.contains("year-selected"), "точката получава year-selected");
    assert.ok(spring.classList.contains("out-of-window"), "и пази out-of-window — не се презаписва");
  });
});

// Преглед (Ф5): по-широки цели за пипване вместо 60 мънички точки — цялата
// колона на всяка година е кликваема/допираема, дори когато годината няма
// нито една точка (различно от клика върху самата точка, тестван по-горе).
test("renderChart: клик върху \"лентата\" на годината избира годината, дори без нито една точка в нея", () => {
  withFakeDocument(() => {
    const model = chartModel(rows, { from: 2023, to: 2026 }); // 2026 няма точки изобщо
    const t = { spring_word: "пролетна", autumn_word: "есенна", chart_nav_hint: "стрелки" };
    const selections = [];
    const svg = renderChart(model, { lang: "bg", title: "т", t, onSelectYear: (y) => selections.push(y) });

    const bands = svg.children.filter((c) => c.tag === "rect" && c.attrs.class === "year-band");
    assert.equal(bands.length, 4, "по една лента на година в обхвата, включително 2026 без точки");
    bands[3].fire("click"); // последната лента = 2026
    assert.equal(selections.at(-1), 2026, "годината без точки пак се избира");
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
