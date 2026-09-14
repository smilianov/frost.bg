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

// Строго десетично, като при Worker-а: без интервали (веднъж подрязани), без
// 0x/1e2 форми, без ".5" или "42.". Извън диапазона (±max) -> null.
const DECIMAL = /^-?\d+(\.\d+)?$/;

export function parseDecimal(raw, max) {
  const s = String(raw ?? "").trim();
  if (!DECIMAL.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return n;
}

export function readQuery(search) {
  const p = new URLSearchParams(search || "");
  if (!p.has("lat") || !p.has("lon")) return null;
  const lat = parseDecimal(p.get("lat"), 90);
  const lon = parseDecimal(p.get("lon"), 180);
  if (lat === null || lon === null) return null;
  return { lat, lon };
}

export function shareUrl(base, lat, lon) {
  const r = (x) => String(Math.round(x * 1000) / 1000);
  return `${base}?lat=${r(lat)}&lon=${r(lon)}`;
}
