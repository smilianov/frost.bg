// format.js — чисти функции, без DOM.

// num()/safeHttpUrl(): преместени от app.js (fix wave, Task 7 review) — за
// да могат да се тестват тук и да се преизползват от elevation.js (view
// модела за височината на точката), без DOM.
export function num(x) {
  if (x === null || x === undefined || x === "") return null; // Number(null)===0, Number("")===0 — не бива да минават за истински 0
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
export function safeHttpUrl(u) {
  if (typeof u !== "string" || !u) return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch (_) { return null; }
}

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

export const WINDOWS = [10, 20, 30];
export const DEFAULT_WINDOW = 30;

// Прозорецът (10/20/30 години) идва от адреса; всичко друго пада на 30.
export function readWindow(search) {
  const raw = new URLSearchParams(search || "").get("window");
  const n = Number(raw);
  return WINDOWS.includes(n) ? n : DEFAULT_WINDOW;
}

export function shareUrl(base, lat, lon, window = DEFAULT_WINDOW) {
  const r = (x) => String(Math.round(x * 1000) / 1000);
  const w = window !== DEFAULT_WINDOW ? `&window=${window}` : "";
  return `${base}?lat=${r(lat)}&lon=${r(lon)}${w}`;
}

// Етикет на място от геокодера: „име, област, община“ — каквото има.
// Общината се пропуска, когато е същата като областта без „Област“/„Община“
// отпред (български) или „Province“/„Municipality“ отзад (английските имена
// от Google): „Област Стара Загора, Стара Загора“ не казва нищо ново.
const clean = (s) => String(s || "").trim();
const bare = (s) => clean(s)
  .replace(/^(област|община|province|municipality)\s+/i, "")
  .replace(/\s+(province|municipality)$/i, "")
  .toLowerCase();

export function placeLabel(x) {
  const parts = [clean(x.name)];
  const admin = clean(x.admin), admin2 = clean(x.admin2);
  if (admin) parts.push(admin);
  if (admin2 && bare(admin2) !== bare(admin)) parts.push(admin2);
  return parts.join(", ");
}

// Заявка към геокодера: винаги максимума предложения (10 — таванът на
// API-то). С подразбирането 5 еднаквите имена не се побират — „Ново Село“
// има поне десет и пловдивското е шесто.
export const GEOCODE_LIMIT = 10;

export function geocodeUrl(q, lang) {
  return `/api/v1/geocode?q=${encodeURIComponent(q)}&lang=${encodeURIComponent(lang)}&limit=${GEOCODE_LIMIT}`;
}
