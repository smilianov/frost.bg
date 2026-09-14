import { T } from "./texts.js";
import { formatMMDD, readQuery, shareUrl } from "./format.js";
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

function render(d) {
  const km = (d.cell.distance_m / 1000).toFixed(1);
  $("result").innerHTML = `
    <div class="pairs">
      <div class="pair"><h2>${t.typical}</h2><p class="hint">${t.typical_hint}</p>
        <dl><dt>${t.last_spring}</dt><dd>${formatMMDD(d.typical.last_spring, lang)}</dd>
            <dt>${t.first_autumn}</dt><dd>${formatMMDD(d.typical.first_autumn, lang)}</dd></dl></div>
      <div class="pair safe"><h2>${t.safe}</h2><p class="hint">${t.safe_hint}</p>
        <dl><dt>${t.last_spring}</dt><dd>${formatMMDD(d.safe.last_spring, lang)}</dd>
            <dt>${t.first_autumn}</dt><dd>${formatMMDD(d.safe.first_autumn, lang)}</dd></dl></div>
    </div>
    <p class="cell">${t.cell}: ${d.cell.lat}, ${d.cell.lon} · ${t.elev} ${d.cell.elev_m ?? "—"} m · ${t.distance} ${km} ${t.km}</p>
    <p class="note"><strong>${t.note_title}:</strong> ${d.note[lang]}</p>
    <p class="src">${t.source}: ${d.source[lang]} (${t.period} ${d.period.start}–${d.period.end})
      · <a href="/api/v1/frost?lat=${d.query.lat}&lon=${d.query.lon}">${t.api}</a></p>`;
  $("result").hidden = false;
  $("synthetic").hidden = !d.synthetic;
  $("lat").value = d.query.lat; $("lon").value = d.query.lon;
  history.replaceState(null, "", shareUrl(location.origin + location.pathname, d.query.lat, d.query.lon));
}

async function lookup(lat, lon) {
  say("");
  if (map) map.setMarker(lat, lon);
  let r;
  try { r = await fetch(`/api/v1/frost?lat=${lat}&lon=${lon}`); }
  catch (_) { return say(t.network_error); }
  if (r.status === 400) {
    const e = await r.json().catch(() => ({}));
    return say(e.error?.code === "outside_bulgaria" ? t.outside : (e.error?.[lang] || t.network_error));
  }
  if (!r.ok) return say(t.network_error);
  render(await r.json());
}

// 1. търсене по име
let timer = null;
$("q").addEventListener("input", () => {
  clearTimeout(timer);
  const q = $("q").value.trim();
  const ul = $("suggestions");
  if (q.length < 2) { ul.hidden = true; return; }
  timer = setTimeout(async () => {
    ul.innerHTML = `<li class="muted">${t.searching}</li>`; ul.hidden = false;
    let data;
    try { data = await (await fetch(`/api/v1/geocode?q=${encodeURIComponent(q)}&lang=${lang}`)).json(); }
    catch (_) { ul.innerHTML = `<li class="muted">${t.network_error}</li>`; return; }
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
  const lat = Number($("lat").value), lon = Number($("lon").value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !$("lat").value || !$("lon").value) return say(t.coords_missing);
  lookup(lat, lon);
};
$("locate").onclick = () => {
  if (!navigator.geolocation) return say(t.geo_denied);
  navigator.geolocation.getCurrentPosition(
    (p) => lookup(p.coords.latitude, p.coords.longitude),
    () => say(t.geo_denied), { timeout: 10000 });
};

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// 2. картата — след config, за да знаем доставчика; после адресът със ?lat&lon
(async () => {
  let cfg = { map: "osm", google_maps_key: null, grid: {} };
  try { cfg = await (await fetch("/api/v1/config")).json(); } catch (_) { /* картата пак ще е OSM */ }
  $("synthetic").hidden = !cfg.grid?.synthetic;
  if (cfg.grid?.period) $("source").textContent = `${t.source}: ERA5-Land ${cfg.grid.period.start}–${cfg.grid.period.end} · Contains modified Copernicus Climate Change Service information`;
  map = await createMap({ container: $("map"), provider: cfg.map, googleKey: cfg.google_maps_key, onPick: lookup });
  const q = readQuery(location.search);
  if (q) lookup(q.lat, q.lon);
})();
