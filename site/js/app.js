import { T } from "./texts.js";
import { formatMMDD, readQuery, shareUrl, parseDecimal } from "./format.js";
import { createMap } from "./map.js";

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

let map = null;

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

function pairCard(title, hint, pair, safeClass) {
  const card = el("div", { class: safeClass ? "pair safe" : "pair" });
  card.append(el("h2", { text: title }), el("p", { class: "hint", text: hint }));
  const dl = el("dl");
  dl.append(
    el("dt", { text: t.last_spring }), el("dd", { text: formatMMDD(pair?.last_spring, lang) }),
    el("dt", { text: t.first_autumn }), el("dd", { text: formatMMDD(pair?.first_autumn, lang) }),
  );
  card.append(dl);
  return card;
}

function render(d) {
  const cellLat = num(d?.cell?.lat), cellLon = num(d?.cell?.lon);
  const elevM = num(d?.cell?.elev_m);
  const distanceM = num(d?.cell?.distance_m);
  const periodStart = num(d?.period?.start), periodEnd = num(d?.period?.end);
  const qLat = num(d?.query?.lat), qLon = num(d?.query?.lon);
  const km = distanceM !== null ? (distanceM / 1000).toFixed(1) : "—";

  const pairs = el("div", { class: "pairs" });
  pairs.append(
    pairCard(t.typical, t.typical_hint, d?.typical, false),
    pairCard(t.safe, t.safe_hint, d?.safe, true),
  );

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

  $("result").replaceChildren(pairs, cellP, noteP, srcP);
  $("result").hidden = false;
  $("synthetic").hidden = !d?.synthetic;
  if (qLat !== null) $("lat").value = qLat;
  if (qLon !== null) $("lon").value = qLon;
  if (qLat !== null && qLon !== null) {
    history.replaceState(null, "", shareUrl(location.origin + location.pathname, qLat, qLon));
    $("lang-switch").href = `${t.lang_switch_href}?lat=${qLat}&lon=${qLon}`;
  }
}

// Всяко ново търсене/lookup обезсилва предишните недовършени — забавен
// отговор от по-стара заявка не бива да презаписва по-новия избор.
let lookupSeq = 0;
async function lookup(lat, lon) {
  const mySeq = ++lookupSeq;
  say("");
  $("result").hidden = true; // старата карта не остава видима, докато чакаме/при грешка
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
    try { res = await fetch(`/api/v1/geocode?q=${encodeURIComponent(q)}&lang=${lang}`); }
    catch (_) {
      if (mySeq !== searchSeq) return;
      ul.innerHTML = `<li class="muted">${t.network_error}</li>`;
      return;
    }
    if (mySeq !== searchSeq) return;
    // bad_query (заявката се е оказала твърде къса по правилата на API-то) —
    // третираме я като късата заявка: скриваме списъка, не показваме грешка.
    if (res.status === 400) { ul.hidden = true; return; }
    if (!res.ok) { ul.innerHTML = `<li class="muted">${t.network_error}</li>`; return; }
    let data;
    try { data = await res.json(); }
    catch (_) { if (mySeq !== searchSeq) return; ul.innerHTML = `<li class="muted">${t.network_error}</li>`; return; }
    if (mySeq !== searchSeq) return;
    const rs = data.results || [];
    if (!rs.length) { ul.innerHTML = `<li class="muted">${t.no_results}</li>`; return; }
    ul.innerHTML = rs.map((x, i) => `<li><button type="button" data-i="${i}">${esc(x.name)}${x.admin ? `, ${esc(x.admin)}` : ""}</button></li>`).join("");
    ul.querySelectorAll("button").forEach((b) => b.onclick = () => {
      const x = rs[Number(b.dataset.i)];
      $("q").value = x.admin ? `${x.name}, ${x.admin}` : x.name; ul.hidden = true;
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

function footerSource(cfg) {
  const period = cfg?.grid?.period;
  const periodText = Number.isFinite(period?.start) && Number.isFinite(period?.end) ? ` ${period.start}–${period.end}` : "";
  const computed = typeof cfg?.grid?.computed === "string" ? cfg.grid.computed : "";
  const year = /^\d{4}/.test(computed) ? computed.slice(0, 4) : "";
  const attribution = `Contains modified Copernicus Climate Change Service information${year ? ` ${year}` : ""}`;
  $("source").textContent = `${t.source}: ERA5-Land${periodText} · ${attribution}`;
}

// 2. картата — след config, за да знаем доставчика; после адресът със ?lat&lon
(async () => {
  let cfg = { map: "osm", google_maps_key: null, grid: {} };
  try {
    const parsed = await (await fetch("/api/v1/config")).json();
    if (parsed && typeof parsed === "object") cfg = parsed; // не-обект (напр. null) -> подразбиращите се
  } catch (_) { /* картата пак ще е OSM */ }
  $("synthetic").hidden = !cfg?.grid?.synthetic;
  footerSource(cfg);
  map = await createMap({ container: $("map"), provider: cfg?.map, googleKey: cfg?.google_maps_key, onPick: lookup });
  const q = readQuery(location.search);
  if (q) lookup(q.lat, q.lon);
})();
