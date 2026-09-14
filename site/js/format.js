// format.js — чисти функции, без DOM.
const MONTHS = {
  bg: ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

export function formatMMDD(mmdd, lang) {
  const m = /^(\d{2})-(\d{2})$/.exec(mmdd || "");
  if (!m) return "—";
  const month = MONTHS[lang === "en" ? "en" : "bg"][Number(m[1]) - 1];
  const day = Number(m[2]);
  if (!month || !day) return "—";
  return lang === "en" ? `${month} ${day}` : `${day} ${month}`;
}

export function readQuery(search) {
  const p = new URLSearchParams(search || "");
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  if (!p.has("lat") || !p.has("lon") || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

export function shareUrl(base, lat, lon) {
  const r = (x) => String(Math.round(x * 1000) / 1000);
  return `${base}?lat=${r(lat)}&lon=${r(lon)}`;
}
