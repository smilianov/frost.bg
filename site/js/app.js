import { T } from "./texts.js";
import { readQuery, shareUrl, parseDecimal, placeLabel, geocodeUrl, readWindow, WINDOWS, DEFAULT_WINDOW } from "./format.js";
import { createMap } from "./map.js";
import { renderChart, renderTable } from "./chart.js";
import { historyView, inWindow, langSwitchQuery } from "./history.js";

const lang = document.body.dataset.lang === "en" ? "en" : "bg";
const t = T[lang];
const $ = (id) => document.getElementById(id);

// Текстовете по местата им.
document.title = `frost.bg — ${t.title}`;
$("title").textContent = t.title; $("lead").textContent = t.lead;
$("search-label").textContent = t.search_label; $("q").placeholder = t.search_placeholder;
$("map-label").textContent = t.map_label; $("coords-label").textContent = t.coords_label;
$("lat-label").textContent = t.lat; $("lon-label").textContent = t.lon;
$("locate").textContent = t.locate; $("go").textContent = t.go;
$("lang-switch").textContent = t.lang_switch; $("lang-switch").href = t.lang_switch_href;
$("synthetic").textContent = t.synthetic_banner;

// фаза 2 — историята: статичните етикети (изчисленото се пълни в redraw())
$("history-title").textContent = t.history;
$("season-title").textContent = t.season;
$("risk-title").textContent = t.risk_label;
$("risk-day-label").textContent = t.risk_day;
$("risk-month-label").textContent = t.risk_month;
$("risk-go").textContent = t.risk_go;
$("csv").textContent = t.csv_download;
$("table-summary").textContent = t.table_caption;

let map = null;
// Началният прозорец идва от адреса, преди първата заявка (Стъпка 7, правило 4).
let currentWindow = readWindow(location.search);
let lastData = null;   // последният отговор на /frost, за прерисуване без заявка
let lastView = null;   // последният изглед от historyView() — CSV чете от него, не смята наново
let lastLat = null, lastLon = null; // за updateUrl() при смяна на прозореца, без нова заявка
updateLangSwitch(); // Ф7: window се пази в #lang-switch дори преди първата успешна заявка

function say(msg) { const m = $("message"); m.textContent = msg; m.hidden = !msg; }

// Малки DOM помощници — резултатът се строи с елементи/textContent, не с
// innerHTML, защото note/source/cell/period/query идват от API-то (низове по
// договор, не по гаранция) и не бива да могат да вкарат маркъп.
function el(tag, attrs = {}) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  return node;
}
function text(s) { return document.createTextNode(String(s)); }
function num(x) {
  if (x === null || x === undefined || x === "") return null; // Number(null)===0, Number("")===0 — не бива да минават за истински 0
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function safeHttpUrl(u) {
  if (typeof u !== "string" || !u) return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch (_) { return null; }
}

// dd-тата на last_spring/first_autumn носят id-та, за да могат paintPairs()
// да ги пренапише при смяна на прозореца, без да строи картите наново.
// Текстовете идват вече форматирани (от historyView(), през paintPairs) —
// pairCard() само строи структурата, нищо не решава.
function pairCard(title, hint, springText, autumnText, safeClass, ids) {
  const card = el("div", { class: safeClass ? "pair safe" : "pair" });
  card.append(el("h2", { text: title }), el("p", { class: "hint", text: hint }));
  const dl = el("dl");
  dl.append(
    el("dt", { text: t.last_spring }), el("dd", { id: ids.spring, text: springText }),
    el("dt", { text: t.first_autumn }), el("dd", { id: ids.autumn, text: autumnText }),
  );
  card.append(dl);
  return card;
}

function render(d) {
  lastData = d;
  const cellLat = num(d?.cell?.lat), cellLon = num(d?.cell?.lon);
  const elevM = num(d?.cell?.elev_m);
  const distanceM = num(d?.cell?.distance_m);
  const periodStart = num(d?.period?.start), periodEnd = num(d?.period?.end);
  const qLat = num(d?.query?.lat), qLon = num(d?.query?.lon);
  const km = distanceM !== null ? (distanceM / 1000).toFixed(1) : "—";

  const safeCard = pairCard(t.safe, t.safe_hint, "", "", true, { spring: "safe-spring", autumn: "safe-autumn" });
  // Ф4: изречението до сигурната дата живее трайно до нея, не като
  // подразбиращо се съдържание на калкулатора за риск (виж paintPairs).
  safeCard.append(el("p", { id: "safe-means", class: "hint" }));

  const pairs = el("div", { id: "pairs", class: "pairs" });
  pairs.append(
    pairCard(t.typical, t.typical_hint, "", "", false, { spring: "typical-spring", autumn: "typical-autumn" }),
    safeCard,
  );
  const pairsNote = el("p", { id: "pairs-note", class: "hint" });
  pairsNote.hidden = true;

  const cellP = el("p", {
    class: "cell",
    text: `${t.cell}: ${cellLat ?? "—"}, ${cellLon ?? "—"} · ${t.elev} ${elevM ?? "—"} m · ${t.distance} ${km} ${t.km}`,
  });

  const noteP = el("p", { class: "note" });
  noteP.append(el("strong", { text: `${t.note_title}:` }), text(` ${d?.note?.[lang] ?? ""}`));

  const srcP = el("p", { class: "src" });
  srcP.append(text(`${t.source}: `));
  const sourceUrl = safeHttpUrl(d?.source?.url);
  const sourceLabel = d?.source?.[lang] ?? "";
  srcP.append(sourceUrl ? el("a", { href: sourceUrl, rel: "noopener", text: sourceLabel }) : text(sourceLabel));
  if (periodStart !== null && periodEnd !== null) srcP.append(text(` (${t.period} ${periodStart}–${periodEnd})`));
  if (d?.source?.attribution) srcP.append(text(` · ${d.source.attribution}`));
  srcP.append(text(" · "));
  srcP.append(
    qLat !== null && qLon !== null
      ? el("a", { href: `/api/v1/frost?lat=${qLat}&lon=${qLon}`, text: t.api })
      : text(t.api),
  );

  $("result").replaceChildren(pairs, pairsNote, cellP, noteP, srcP);
  $("result").hidden = false;
  $("synthetic").hidden = !d?.synthetic;
  if (qLat !== null) $("lat").value = qLat;
  if (qLon !== null) $("lon").value = qLon;
  if (qLat !== null && qLon !== null) {
    lastLat = qLat; lastLon = qLon;
    updateUrl();
    // Ф5/преглед: единствената обява за ново търсене — #status, не #result.
    $("status").textContent = t.status_result_ready(qLat, qLon);
  } else {
    lastLat = null; lastLon = null;
  }
  redraw(); // Стъпка 7, правило 1: render(d) рисува историята накрая
}

// updateUrl()/updateLangSwitch(): адресът и #lang-switch носят и текущия
// прозорец (Стъпка 7, правило 3; Ф7: "чете се независимо от това дали има
// годни координати"). langSwitchQuery() (site/js/history.js) решава дали
// има смисъл от shareUrl("", …) или само "?window=" — тествано там, не тук.
function updateLangSwitch() {
  $("lang-switch").href = `${t.lang_switch_href}${langSwitchQuery(lastLat, lastLon, currentWindow)}`;
}

function updateUrl() {
  if (lastLat !== null && lastLon !== null) {
    history.replaceState(null, "", shareUrl(location.origin + location.pathname, lastLat, lastLon, currentWindow));
  }
  updateLangSwitch();
}

// --- фаза 2: рисуване на историята от historyView() — никакво решение тук ---

function readRiskInput() {
  return { day: $("risk-day").value, month: $("risk-month").value };
}

// Ф5: мащабът и пълният обхват години на графиката/таблицата НЕ се
// променят при смяна на прозореца — само се откроява коя част е избрана.
function markSelection(nodes, yearOf, chart) {
  const w = { from: chart.selectedFrom, to: chart.selectedTo };
  nodes.forEach((node, i) => { if (!inWindow(yearOf(i), w)) node.classList.add("out-of-window"); });
}

// Ф2/преглед кръг 4: клетка без нито един ред няма view.pairs изобщо — за
// нея картите за типична/сигурна дата не се строят, обяснението стои само.
function paintPairs(view) {
  const shown = view.pairs; // undefined и когато !visible, и когато empty
  $("pairs").hidden = !shown;
  $("pairs-note").hidden = !shown?.tooFewYears;
  if (!shown) return;
  $("typical-spring").textContent = shown.typicalSpring;
  $("typical-autumn").textContent = shown.typicalAutumn;
  $("safe-spring").textContent = shown.safeSpring;
  $("safe-autumn").textContent = shown.safeAutumn;
  $("pairs-note").textContent = shown.tooFewYearsMessage || "";
  $("safe-means").textContent = view.safeMeans;
}

// Ф2: "клетка без нито един ред" показва секцията с обяснение (не я крие);
// само липсващ period.end (нямаме календар изобщо) крие цялата секция.
function paintHistory(view) {
  const section = $("history");
  if (!view.visible) { section.hidden = true; return; }
  section.hidden = false;

  $("history-empty").hidden = !view.empty;
  $("history-empty").textContent = view.empty ? view.message : "";
  $("history-body").hidden = view.empty;
  if (view.empty) return;

  $("window-note").textContent = view.windowNote;
  $("compare").textContent = view.compare;
  $("season").textContent = view.season;

  if (view.chart.message) {
    $("chart").replaceChildren(el("p", { class: "hint", text: view.chart.message }));
  } else {
    const svg = renderChart(view.chart.model, { lang, title: view.chart.title, t });
    markSelection(svg.querySelectorAll(".pt"), (i) => view.chart.model.points[i].year, view.chart);
    $("chart").replaceChildren(svg);
  }
  const table = renderTable(view.chart.rows, { lang, t, from: view.chart.from, to: view.chart.to });
  markSelection(table.querySelectorAll("tbody tr"), (i) => view.chart.from + i, view.chart);
  $("table-slot").replaceChildren(table);

  $("risk-result").textContent = view.risk.message;
}

// Единственото място, което вика historyView() — новите данни, смяната на
// прозореца и калкулаторът за риска минават през него, затова рискът никога
// не остава остарял: няма "последен показан отговор" за пазене никъде.
// explicitRisk е true само при изрично "Сметни" (не при ново търсене или
// смяна на прозореца) — тогава, и само тогава, фокусът отива върху
// #risk-result (tabindex="-1" в HTML): #status е единствената aria-live
// област, а рискът се обявява чрез преместен фокус, не чрез собствен
// aria-live (преглед, кръг 3).
function redraw({ explicitRisk = false } = {}) {
  if (!lastData) { lastView = null; $("history").hidden = true; return; }
  lastView = historyView({ data: lastData, window: currentWindow, lang, t, riskInput: readRiskInput(), explicitRisk });
  paintPairs(lastView);
  paintHistory(lastView);
  if (explicitRisk && lastView.visible && !lastView.empty && lastView.risk.focus) $("risk-result").focus();
}

let windowButtons = [];
function buildWindowButtons() {
  const group = $("windows");
  group.setAttribute("aria-label", t.window_label);
  windowButtons = WINDOWS.map((n) => {
    const b = el("button", { type: "button", text: t.window_years(n) });
    b.dataset.window = String(n);
    b.setAttribute("aria-pressed", String(n === currentWindow));
    b.onclick = () => setWindow(n);
    return b;
  });
  group.replaceChildren(...windowButtons);
}

function setWindow(n) {
  currentWindow = WINDOWS.includes(n) ? n : DEFAULT_WINDOW;
  for (const b of windowButtons) b.setAttribute("aria-pressed", String(Number(b.dataset.window) === currentWindow));
  redraw();
  updateUrl();
  // Ф5/преглед: смяната на прозореца обявява точно едно кратко изречение —
  // #status, визуално скрит — нищо друго в #result/#history не е aria-live.
  if (lastData) $("status").textContent = t.status_window_changed(currentWindow);
}
buildWindowButtons();

$("csv").onclick = () => {
  if (!lastView || !lastView.visible || lastView.empty) return;
  const blob = new Blob([lastView.csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: lastView.csvFilename });
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

// Прочита текущите ден/месец и прерисува всичко — рискът се смята наново
// от historyView() всеки път, затова "Сметни" не пази собствено състояние.
$("risk-go").onclick = () => { redraw({ explicitRisk: true }); };

// Ф5/печат: <details>, затворен на екран, не показва съдържанието си при
// печат само чрез CSS (моделът на рендиране не е обикновен display) —
// отваря се програмно преди печат и състоянието му се връща след това.
let tableWasOpen = false;
window.addEventListener("beforeprint", () => {
  tableWasOpen = $("table-wrap").open;
  $("table-wrap").open = true;
});
window.addEventListener("afterprint", () => { $("table-wrap").open = tableWasOpen; });

// Всяко ново търсене/lookup обезсилва предишните недовършени — забавен
// отговор от по-стара заявка не бива да презаписва по-новия избор.
let lookupSeq = 0;
async function lookup(lat, lon) {
  const mySeq = ++lookupSeq;
  say("");
  $("result").hidden = true; // старата карта не остава видима, докато чакаме/при грешка
  $("history").hidden = true; lastData = null; lastView = null; // ново търсене обезсилва старата история веднага (Стъпка 7, правило 1)
  if (map) map.setMarker(lat, lon);
  let r;
  try { r = await fetch(`/api/v1/frost?lat=${lat}&lon=${lon}`); }
  catch (_) { if (mySeq !== lookupSeq) return; return say(t.network_error); }
  if (mySeq !== lookupSeq) return;
  if (r.status === 400) {
    const e = await r.json().catch(() => ({}));
    if (mySeq !== lookupSeq) return;
    return say(e.error?.code === "outside_bulgaria" ? t.outside : (e.error?.[lang] || t.network_error));
  }
  if (!r.ok) return say(t.network_error);
  let body;
  try { body = await r.json(); }
  catch (_) { if (mySeq !== lookupSeq) return; return say(t.network_error); }
  if (mySeq !== lookupSeq) return;
  render(body);
}

// 1. търсене по име
let timer = null;
let searchSeq = 0;
$("q").addEventListener("input", () => {
  clearTimeout(timer);
  searchSeq++; // обезсилва предишен недовършен fetch, дори debounce-ът вече да е минал
  const q = $("q").value.trim();
  const ul = $("suggestions");
  if (q.length < 2) { ul.hidden = true; return; }
  const mySeq = searchSeq;
  timer = setTimeout(async () => {
    ul.innerHTML = `<li class="muted">${t.searching}</li>`; ul.hidden = false;
    let res;
    try { res = await fetch(geocodeUrl(q, lang)); }
    catch (_) {
      if (mySeq !== searchSeq) return;
      ul.innerHTML = `<li class="muted">${t.network_error}</li>`;
      return;
    }
    if (mySeq !== searchSeq) return;
    if (res.status === 400) {
      // Само bad_query (заявката се е оказала твърде къса по правилата на
      // API-то) се третира като късата заявка: скриваме списъка, без грешка.
      // Всеки друг 400 (друг код, HTML тяло, празно тяло) е истинска грешка.
      const body = await res.json().catch(() => null);
      if (mySeq !== searchSeq) return;
      if (body?.error?.code === "bad_query") { ul.hidden = true; return; }
      ul.innerHTML = `<li class="muted">${t.network_error}</li>`;
      return;
    }
    if (!res.ok) { ul.innerHTML = `<li class="muted">${t.network_error}</li>`; return; }
    let data;
    try { data = await res.json(); }
    catch (_) { if (mySeq !== searchSeq) return; ul.innerHTML = `<li class="muted">${t.network_error}</li>`; return; }
    if (mySeq !== searchSeq) return;
    const rs = data.results || [];
    if (!rs.length) { ul.innerHTML = `<li class="muted">${t.no_results}</li>`; return; }
    ul.innerHTML = rs.map((x, i) => `<li><button type="button" data-i="${i}">${esc(placeLabel(x))}</button></li>`).join("");
    ul.querySelectorAll("button").forEach((b) => b.onclick = () => {
      const x = rs[Number(b.dataset.i)];
      $("q").value = placeLabel(x); ul.hidden = true;
      lookup(x.lat, x.lon);
    });
  }, 250);
});

// 3. координати и телефонът
$("go").onclick = () => {
  const lat = parseDecimal($("lat").value, 90);
  const lon = parseDecimal($("lon").value, 180);
  if (lat === null || lon === null) return say(t.coords_missing);
  lookup(lat, lon);
};
$("locate").onclick = () => {
  if (!navigator.geolocation) return say(t.geo_denied);
  navigator.geolocation.getCurrentPosition(
    (p) => lookup(p.coords.latitude, p.coords.longitude),
    () => say(t.geo_denied), { timeout: 10000 });
};

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// Footer-ът следва /config: източникът на мрежата (grid.source_id) и
// доставчикът на имената (geocoder). Връзка и посочване — само където
// лицензът ги иска (CDS, Open-Meteo); синтетичната мрежа няма нито едното.
// Същите три етикета дава и API-то в `source` (worker/texts.js).
const SOURCES = {
  cds: { label: "src_cds", url: "https://cds.climate.copernicus.eu/",
         attribution: (year) => `Contains modified Copernicus Climate Change Service information${year ? ` ${year}` : ""}` },
  openmeteo: { label: "src_openmeteo", url: "https://open-meteo.com/", attribution: () => "Weather data by Open-Meteo.com" },
  synthetic: { label: "src_synthetic", url: null, attribution: () => null },
};
function footerSource(cfg) {
  const period = cfg?.grid?.period;
  const periodText = Number.isFinite(period?.start) && Number.isFinite(period?.end) ? ` ${period.start}–${period.end}` : "";
  const computed = typeof cfg?.grid?.computed === "string" ? cfg.grid.computed : "";
  const year = /^\d{4}/.test(computed) ? computed.slice(0, 4) : "";
  const src = SOURCES[cfg?.grid?.source_id] ?? SOURCES.cds; // стара мрежа без етикет = CDS, както в Worker-а
  const label = `${t[src.label]}${periodText}`;
  const node = $("source");
  node.replaceChildren(text(`${t.source}: `), src.url ? el("a", { href: src.url, rel: "noopener", text: label }) : text(label));
  const attribution = src.attribution(year);
  if (attribution) node.append(text(` · ${attribution}`));
}
function footerGeocoder(cfg) {
  const google = cfg?.geocoder === "google";
  $("geocoder-credit").replaceChildren(el("a", {
    href: google ? "https://developers.google.com/maps" : "https://open-meteo.com/", rel: "noopener",
    text: google ? t.credit_google : t.credit_openmeteo,
  }));
}

// 2. картата — след config, за да знаем доставчика; после адресът със ?lat&lon
(async () => {
  let cfg = { map: "osm", google_maps_key: null, geocoder: "openmeteo", grid: {} };
  try {
    const parsed = await (await fetch("/api/v1/config")).json();
    if (parsed && typeof parsed === "object") cfg = parsed; // не-обект (напр. null) -> подразбиращите се
  } catch (_) { /* картата пак ще е OSM */ }
  $("synthetic").hidden = !cfg?.grid?.synthetic;
  footerSource(cfg);
  footerGeocoder(cfg);
  map = await createMap({ container: $("map"), provider: cfg?.map, googleKey: cfg?.google_maps_key, onPick: lookup });
  const q = readQuery(location.search);
  if (q) lookup(q.lat, q.lon);
})();
