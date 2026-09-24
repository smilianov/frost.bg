// chart.js — графиката, таблицата и CSV-то. Моделът е чист (тества се);
// рисуването е тънък слой над него (проверява се в браузър).
import { dayOfYear, toMMDD } from "./stats.js";
import { formatMMDD } from "./format.js";

const MONTH_STARTS = Array.from({ length: 12 }, (_, i) => dayOfYear(`${String(i + 1).padStart(2, "0")}-01`));

export function chartModel(rows, { from, to }) {
  const points = [];
  const yearsWithRows = new Set(); // преглед: за selectYear — "няма ред" != "ред без тази сезонна дата"
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(r) || !Number.isInteger(r[0])) continue;
    yearsWithRows.add(r[0]);
    for (const [i, season] of [[1, "spring"], [2, "autumn"]]) {
      const day = dayOfYear(r[i]);
      if (day !== null) points.push({ year: r[0], day, season, mmdd: toMMDD(day) });
    }
  }
  return {
    points,
    months: MONTH_STARTS.map((day, i) => ({ day, label: i + 1 })),
    years: { from, to },
    empty: points.length === 0,
    yearsWithRows,
  };
}

// CSV за хора с Excel: коментар с клетката, периода и източника, после
// година,последна_пролетна,първа_есенна (празно за липсваща дата).
export function toCsv(rows, meta) {
  const clean = (s) => String(s ?? "").replace(/[\r\n]+/g, " ").trim();
  const head = `# frost.bg · ${meta.lat}, ${meta.lon} · ${meta.period?.start}–${meta.period?.end} · ${clean(meta.source)}`;
  const body = (Array.isArray(rows) ? rows : [])
    .filter((r) => Array.isArray(r) && Number.isInteger(r[0]))
    .map((r) => `${r[0]},${r[1] ?? ""},${r[2] ?? ""}`);
  return [head, "year,last_spring,first_autumn", ...body].join("\n") + "\n";
}

const SVG = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const W = 720, H = 260, PAD_L = 44, PAD_R = 12, PAD_T = 12, PAD_B = 28;

// Един локализиран текст за точка — година, сезон, дата — ползва се и за
// aria-label, и за <title>, за да не се разминават (Ф5: „Tooltip казва
// година, сезон и дата“).
function pointLabel(p, lang, t) {
  const seasonWord = p.season === "spring" ? t.spring_word : t.autumn_word;
  return `${p.year} · ${seasonWord} · ${formatMMDD(p.mmdd, lang)}`;
}

// Преглед: изборът на година — чист израз на (model, year), без DOM. Връща
// точките на тази година (или null за сезон без записана слана), плюс
// hasRow — "годината няма ред изобщо" вече е различно от "има ред, но
// сезонът е null" (преглед, последна вълна): readout-ът вече разграничава
// двете, както и таблицата под него. Ползва се и от renderChart
// (клавиатура/клик), и от извикващия (app.js) за видимия readout — едно и
// също изчисление.
export function selectYear(model, year) {
  const spring = model.points.find((p) => p.year === year && p.season === "spring") ?? null;
  const autumn = model.points.find((p) => p.year === year && p.season === "autumn") ?? null;
  const hasRow = model.yearsWithRows?.has(year) ?? false;
  return { year, spring, autumn, hasRow };
}

// Текстът на readout-а — видимо (app.js го пише в #chart-readout) и обявено
// (app.js го праща и на #status, едно и също изречение, никаква втора live
// област). t.no_data_year/t.no_frost_recorded са същите ключове, с които
// таблицата (renderTable) прави точно тази разлика — readout-ът я пази.
export function yearReadoutText(readout, lang, t) {
  if (!readout.hasRow) return `${readout.year} · ${t.no_data_year}`;
  const springText = readout.spring ? formatMMDD(readout.spring.mmdd, lang) : t.no_frost_recorded;
  const autumnText = readout.autumn ? formatMMDD(readout.autumn.mmdd, lang) : t.no_frost_recorded;
  return `${readout.year} · ${t.spring_word}: ${springText} · ${t.autumn_word}: ${autumnText}`;
}

export function renderChart(model, { lang, title, t, onSelectYear, readoutId }) {
  // Преглед (последна вълна): role="application" потискаше обикновеното
  // разглеждане на четеца на екрана и не даваше нищо насреща (точките вече
  // не са фокусируеми поотделно, нямаше нито избраният елемент, нито
  // връзка към readout-а в дървото за достъпност). role="img" — статична
  // именувана графика с обяснение как се навигира в самото ѝ име — плюс
  // aria-describedby към видимия readout (app.js подава readoutId="chart-
  // readout"): текущият избор се разкрива там, а не с aria-activedescendant
  // (по-крехко за role="img", изисква стабилни id-та за всяка точка/лента).
  // #status (app.js) продължава да го обявява политично при всяка смяна.
  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`, class: "chart",
    role: "img", tabindex: "0",
    "aria-label": `${title} — ${t.chart_nav_hint}`,
    preserveAspectRatio: "xMidYMid meet",
  });
  if (readoutId) svg.setAttribute("aria-describedby", readoutId);
  const svgTitle = svgEl("title");
  svgTitle.textContent = title;
  svg.append(svgTitle);
  const yearsSpan = Math.max(1, model.years.to - model.years.from);
  const x = (year) => PAD_L + ((year - model.years.from) / yearsSpan) * (W - PAD_L - PAD_R);
  const y = (day) => PAD_T + ((day - 1) / 364) * (H - PAD_T - PAD_B);

  for (const m of model.months) {
    const yy = y(m.day);
    svg.append(svgEl("line", { x1: PAD_L, x2: W - PAD_R, y1: yy, y2: yy, class: "grid" }));
    const label = svgEl("text", { x: 4, y: yy + 4, class: "tick" });
    label.textContent = String(m.label);
    svg.append(label);
  }
  for (const year of [model.years.from, model.years.to]) {
    const edgeLabel = svgEl("text", { x: x(year), y: H - 8, class: "tick", "text-anchor": year === model.years.from ? "start" : "end" });
    edgeLabel.textContent = String(year);
    svg.append(edgeLabel);
  }

  // Преглед (Ф5): "не 60 невидими мишени в тесен екран" — вместо да разчита
  // само на 4px точки, цялата колона на всяка година е кликваема/допираема,
  // дори когато годината няма нито една точка (година без данни може пак да
  // се избере — readout-ът ще каже, че няма записана слана). Рисуват се
  // ПРЕДИ точките, за да останат точките отгоре (и си остават кликваеми
  // поотделно).
  let selected = null;
  const pointEntries = [];
  const bandWidth = (W - PAD_L - PAD_R) / yearsSpan;
  const cursor = svgEl("line", { x1: -1000, x2: -1000, y1: PAD_T, y2: H - PAD_B, class: "year-cursor", visibility: "hidden" });

  // classList.toggle, не презаписване на целия "class" низ — app.js слага
  // отделно "out-of-window" на същите възли (markSelection); презаписването
  // би го изтрило мълчаливо при всяка смяна на избраната година.
  function paintSelection() {
    for (const entry of pointEntries) {
      entry.node.classList.toggle("year-selected", entry.year === selected);
    }
    if (selected === null) {
      cursor.setAttribute("visibility", "hidden");
    } else {
      const cx = x(selected);
      cursor.setAttribute("x1", cx); cursor.setAttribute("x2", cx);
      cursor.setAttribute("visibility", "visible");
    }
  }
  function selectYearAndNotify(year) {
    selected = year === null ? null : Math.max(model.years.from, Math.min(model.years.to, year));
    paintSelection();
    if (onSelectYear) onSelectYear(selected);
  }
  // Допир/клик няма Escape — преглед (последна вълна): допир върху вече
  // избраната година я изчиства (toggle), вместо да я потвърждава пак без
  // изход. Само за показалец/допир — клавиатурата (Home/End и т.н. по-долу)
  // остава директна, инак повторно Home/End би изчиствало по невнимание.
  function selectViaPointer(year) {
    selectYearAndNotify(year === selected ? null : year);
  }

  for (let year = model.years.from; year <= model.years.to; year++) {
    const band = svgEl("rect", {
      x: x(year) - bandWidth / 2, y: PAD_T, width: bandWidth, height: H - PAD_T - PAD_B,
      class: "year-band", fill: "transparent",
    });
    band.addEventListener("click", () => selectViaPointer(year));
    svg.append(band);
  }

  for (const p of model.points) {
    const cx = x(p.year), cy = y(p.day);
    const baseClass = p.season === "spring" ? "pt spring" : "pt autumn";
    const node = p.season === "spring"
      ? svgEl("circle", { cx, cy, r: 4, class: baseClass })
      : svgEl("rect", { x: cx - 3.5, y: cy - 3.5, width: 7, height: 7, class: baseClass, transform: `rotate(45 ${cx} ${cy})` });
    const label = pointLabel(p, lang, t);
    // Ф5: „запазват имената си“ — aria-label/<title> остават на точката;
    // само индивидуалният tabindex пада (не е повече отделна tab спирка —
    // цялата графика е една, виж svg по-горе).
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", label);
    const pointTitle = svgEl("title");
    pointTitle.textContent = label;
    node.append(pointTitle);
    node.addEventListener("click", () => selectViaPointer(p.year));
    svg.append(node);
    pointEntries.push({ node, year: p.year });
  }

  svg.append(cursor);

  // Клавиатура: ← / → крачка с една година, Home/End до края на обхвата,
  // Escape изчиства. Графиката е една tab спирка (tabindex по-горе) —
  // никаква анимация; #status (app.js) обявява резултата, не втора live
  // област тук.
  svg.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { selectYearAndNotify(null); return; }
    let year;
    if (e.key === "ArrowRight") year = (selected ?? model.years.from - 1) + 1;
    else if (e.key === "ArrowLeft") year = (selected ?? model.years.to + 1) - 1;
    else if (e.key === "Home") year = model.years.from;
    else if (e.key === "End") year = model.years.to;
    else return;
    e.preventDefault?.();
    selectYearAndNotify(year);
  });

  return svg;
}

// Видимата таблица — не „алтернатива за четци“, а самите данни: и с пръст,
// и с клавиатура, и при печат. Всяка година от прозореца има ред, дори тази,
// за която мрежата няма запис (Ф5: липсваща година е различна от липсваща
// сезонна дата — "няма достатъчно данни" срещу "няма записана слана").
export function renderTable(rows, { lang, t, from, to }) {
  const table = document.createElement("table");
  table.className = "years";
  const caption = document.createElement("caption");
  caption.textContent = t.table_caption;
  table.append(caption);
  const head = document.createElement("tr");
  for (const label of [t.year, t.last_spring, t.first_autumn]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    head.append(th);
  }
  const thead = document.createElement("thead");
  thead.append(head);
  const byYear = new Map((Array.isArray(rows) ? rows : []).map((r) => [r[0], r]));
  const tbody = document.createElement("tbody");
  for (let year = from; year <= to; year++) {
    const r = byYear.get(year);
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = String(year);
    tr.append(th);
    for (const i of [1, 2]) {
      const td = document.createElement("td");
      td.textContent = r ? (r[i] ? formatMMDD(r[i], lang) : t.no_frost_recorded) : t.no_data_year;
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  return table;
}
