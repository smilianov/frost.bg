// chart.js — графиката, таблицата и CSV-то. Моделът е чист (тества се);
// рисуването е тънък слой над него (проверява се в браузър).
import { dayOfYear, toMMDD } from "./stats.js";
import { formatMMDD } from "./format.js";

const MONTH_STARTS = Array.from({ length: 12 }, (_, i) => dayOfYear(`${String(i + 1).padStart(2, "0")}-01`));

export function chartModel(rows, { from, to }) {
  const points = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(r) || !Number.isInteger(r[0])) continue;
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

export function renderChart(model, { lang, title, t }) {
  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img",
    "aria-label": title, preserveAspectRatio: "xMidYMid meet",
  });
  const svgTitle = svgEl("title");
  svgTitle.textContent = title;
  svg.append(svgTitle);
  const years = Math.max(1, model.years.to - model.years.from);
  const x = (year) => PAD_L + ((year - model.years.from) / years) * (W - PAD_L - PAD_R);
  const y = (day) => PAD_T + ((day - 1) / 364) * (H - PAD_T - PAD_B);

  for (const m of model.months) {
    const yy = y(m.day);
    svg.append(svgEl("line", { x1: PAD_L, x2: W - PAD_R, y1: yy, y2: yy, class: "grid" }));
    const label = svgEl("text", { x: 4, y: yy + 4, class: "tick" });
    label.textContent = String(m.label);
    svg.append(label);
  }
  for (const year of [model.years.from, model.years.to]) {
    const t = svgEl("text", { x: x(year), y: H - 8, class: "tick", "text-anchor": year === model.years.from ? "start" : "end" });
    t.textContent = String(year);
    svg.append(t);
  }
  for (const p of model.points) {
    const cx = x(p.year), cy = y(p.day);
    const node = p.season === "spring"
      ? svgEl("circle", { cx, cy, r: 4, class: "pt spring" })
      : svgEl("rect", { x: cx - 3.5, y: cy - 3.5, width: 7, height: 7, class: "pt autumn", transform: `rotate(45 ${cx} ${cy})` });
    const label = pointLabel(p, lang, t);
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", label);
    const pointTitle = svgEl("title");
    pointTitle.textContent = label;
    node.append(pointTitle);
    svg.append(node);
  }
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
