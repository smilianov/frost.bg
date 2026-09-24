// Графиката се дели на две: чист модел (тук) и рисуване в DOM. Рисуването
// реално се проверява в браузър (Р6), но една минимална фалшива `document`
// (без DOM библиотека) стига да хване хвърлящ бъг и грешна структура тук.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartModel, toCsv, renderChart, renderChartAxis, renderTable, selectYear, yearReadoutText, dayY, monthAxisTicks } from "./chart.js";

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

// Преглед (полиране): месечните етикети изчезваха при хоризонтален скрол,
// защото се чертаеха вътре в самия превъртащ се SVG (viewBox 720×260,
// текстът на x=4 напуска видимата рамка веднага щом .chart-wrap се
// превърти надясно). Поправката дели графиката на два SVG-та — плотът
// (превърта се) и неподвижна тясна колона до него (renderChartAxis) — с
// еднаква viewBox височина и еднакво изчисление на y. dayY() е единственото
// място, което смята тази y (renderChart за точките/решетката,
// renderChartAxis за месечните тикове) — тества се директно, без DOM, за да
// е сигурно, че двете SVG-та НЕ могат да се разминат мълчаливо.
// Преглед (полиране, кръг 1): предишният вариант на тези тестове беше
// самопозоваващ се — очакванията идваха от самата dayY() (или от
// monthAxisTicks(), която просто я вика), затова мутация ВЪТРЕ в dayY()
// (знаменателят 364 -> 730, PAD_T 12 -> 0) минаваше всичките 25 теста
// незабелязано. Тук очакванията са абсолютни числа, независими от чужди
// извиквания в chart.js: 12 = PAD_T (ден 1 е точно горе), 232 = H - PAD_B
// (ден 365 е точно долу — PAD_T се съкращава тук, затова трябват И двете
// проверки, не само едната: PAD_T 12->0 не пипва резултата за ден 365), и
// 1 март (ден 60), сметнато на ръка по същата формула, но с литерали,
// вписани направо в теста, не чрез повторно извикване на chart.js.
test("dayY: абсолютни стойности, независими от собствената формула (пипва denominator/padding мутации)", () => {
  assert.equal(dayY(1), 12, "ден 1 = PAD_T (12) точно");
  assert.equal(dayY(365), 232, "ден 365 = H - PAD_B (260-28) точно");
  const day60ByHand = 12 + (59 / 364) * 220; // PAD_T + ((60-1)/364)*(H-PAD_T-PAD_B), сметнато на ръка
  assert.ok(Math.abs(dayY(60) - day60ByHand) < 1e-9, `1 март (ден 60) ≈ ${day60ByHand}`);
});

test("dayY: расте монотонно с деня, чиста функция (еднакъв резултат при повторно извикване)", () => {
  assert.ok(dayY(335) > dayY(1), "по-късен ден -> по-надолу в SVG (по-голямо y)");
  assert.equal(dayY(60), dayY(60));
});

test("monthAxisTicks: 12 тика, същите дни/етикети като chartModel().months, y от dayY()", () => {
  const ticks = monthAxisTicks();
  assert.equal(ticks.length, 12);
  assert.deepEqual(ticks[0], { day: 1, label: 1, y: dayY(1) });
  assert.deepEqual(ticks[2], { day: 60, label: 3, y: dayY(60) }, "1 март е ден 60");
  assert.deepEqual(ticks[11], { day: 335, label: 12, y: dayY(335) });
  for (let i = 1; i < ticks.length; i++) {
    assert.ok(ticks[i].y > ticks[i - 1].y, "тиковете вървят надолу по реда на месеците");
  }
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

// Преглед (полиране): renderChart вече не чертае месечните етикети (те са в
// renderChartAxis, извън превъртащия се SVG) — само решетката (12 линии) и
// двата крайни етикета на годините (.tick, при x/y на годините) остават.
test("renderChart: НЕ чертае месечните тикове (12 текста) вътре в превъртащия се SVG — само решетката и годините", () => {
  withFakeDocument(() => {
    const model = chartModel(rows, { from: 2023, to: 2025 });
    const t = { spring_word: "пролетна", autumn_word: "есенна", chart_nav_hint: "стрелки" };
    const svg = renderChart(model, { lang: "bg", title: "т", t });

    const grid = svg.children.filter((c) => c.tag === "line" && c.attrs.class === "grid");
    assert.equal(grid.length, 12, "12-те месечни решетъчни линии си остават в плота");

    const ticks = svg.children.filter((c) => c.tag === "text" && c.attrs.class === "tick");
    assert.equal(ticks.length, 2, "само двата крайни годишни етикета — месечните текстове са преместени в renderChartAxis");
    assert.deepEqual(ticks.map((n) => n.textContent).sort(), ["2023", "2025"]);
  });
});

test("renderChartAxis: 12 неподвижни месечни тика (1..12), y-та като dayY(), aria-hidden, без tabindex", () => {
  withFakeDocument(() => {
    const svg = renderChartAxis();
    assert.equal(svg.attrs["aria-hidden"], "true", "декоративна — графиката вече има собствен role=\"img\"+описание");
    assert.equal(svg.attrs.tabindex, undefined, "не е втора tab спирка — графиката си остава ЕДНА");

    const ticks = svg.children.filter((c) => c.tag === "text" && c.attrs.class === "tick");
    assert.equal(ticks.length, 12);
    assert.deepEqual(ticks.map((n) => n.textContent), Array.from({ length: 12 }, (_, i) => String(i + 1)));

    // Същото y като dayY() за същия ден (1 март = ден 60) — гаранцията, че
    // плотът и неподвижната ос не могат да се разминат: и двата тика y=…+4
    // (базовата линия на текста, виж renderChart-а за месечните тикове по-рано).
    const marchTick = ticks[2];
    assert.equal(marchTick.attrs.y, String(dayY(60) + 4));
  });
});

// Преглед (полиране, кръг 1): reviewer-ът показа, че никой тест не сравнява
// ДВЕТЕ рендирани SVG-та едно с друго — мутация само в renderChart() (напр.
// решетката отмества с +20, без dayY() въобще да е пипната) минаваше
// незабелязано, защото всеки тест до момента проверяваше всяко SVG само
// спрямо dayY(), никога едното спрямо другото. Тук НЕ викаме dayY() в самото
// твърдение — намираме решетката и тика на плота/оста ПО РЕД (и двете се
// чертаят месец по месец, януари..декември), и сравняваме реално изрисуваните
// y едно спрямо друго. Ако renderChart() и renderChartAxis() тръгнат да
// смятат y по различен начин един спрямо друг — независимо дали dayY() е
// вярна — този тест пада.
test("renderChart + renderChartAxis: решетката на плота и тикът на оста за същия месец имат едно и също y (не само срещу dayY())", () => {
  withFakeDocument(() => {
    const model = chartModel(rows, { from: 2023, to: 2025 });
    const t = { spring_word: "пролетна", autumn_word: "есенна", chart_nav_hint: "стрелки" };
    const plot = renderChart(model, { lang: "bg", title: "т", t });
    const axis = renderChartAxis();

    const gridLines = plot.children.filter((c) => c.tag === "line" && c.attrs.class === "grid");
    const axisTicks = axis.children.filter((c) => c.tag === "text" && c.attrs.class === "tick");
    assert.equal(gridLines.length, 12);
    assert.equal(axisTicks.length, 12);

    for (let i = 0; i < 12; i++) {
      // +4 е базовата линия на текста в renderChartAxis (виж по-горе) — без
      // нея тикът пада точно върху решетъчната линия на плота.
      const gridY = Number(gridLines[i].attrs.y1);
      const tickY = Number(axisTicks[i].attrs.y) - 4;
      assert.equal(gridY, tickY, `месец ${i + 1}: решетката (${gridY}) и тикът (${tickY}) трябва да съвпадат`);
    }
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
