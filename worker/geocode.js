// Име на място → координати. Два доставчика, една форма на отговора.
export class GeocodeError extends Error {}

const OPEN_METEO = "https://geocoding-api.open-meteo.com/v1/search";
const GOOGLE = "https://maps.googleapis.com/maps/api/geocode/json";
const round3 = (x) => Math.round(x * 1000) / 1000;
const isFiniteNum = (x) => typeof x === "number" && Number.isFinite(x);
// Координати извън ±90/±180 (напр. 999/999 от развален upstream) не са място.
const validLatLon = (lat, lon) => isFiniteNum(lat) && isFiniteNum(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
const nonEmptyName = (x) => typeof x === "string" && x.trim() !== "";
// Само тези статуси на Google може да влязат в текста на GeocodeError —
// произволна стойност на `status` не е доверен вход (виж коментара при
// fetchJson) и никога не се прекопира сурова.
const GOOGLE_ERROR_STATUSES = new Set(["OVER_QUERY_LIMIT", "REQUEST_DENIED", "INVALID_REQUEST", "UNKNOWN_ERROR"]);

// `limit` минава и в ключа на кеша (index.js) — изнесена тук, за да няма две
// копия на политиката. Изрична Number.isFinite проверка, не `Number(limit) ||
// 5`: 0 е лъжливо в JS, `Number(0) || 5` би дало 5 вместо да се скове до 1.
// Math.trunc отрязва дробната част (1.9 -> 1), не я праща сурова на доставчика.
// Празен/само интервали низ е „липсващо“ (-> 5), не Number("  ") === 0 -> 1.
export function clampLimit(limit) {
  if (limit == null || String(limit).trim() === "") return 5;
  const n = Number(limit);
  return Number.isFinite(n) ? Math.min(10, Math.max(1, Math.trunc(n))) : 5;
}

// Твърд краен срок, не само сигнал за отказ: ако инжектираният fetch изобщо
// не гледа `signal` (или чете тялото безкрайно), самият `ctl.abort()` не би
// спрял нищо сам по себе си — затова цялата операция се надпреварва с
// отделно обещание, което отхвърля точно на `timeoutMs`, независимо дали
// долното обещание изобщо реагира. Съобщенията са фиксирани и безопасни:
// никога `e.message`, `e.stack` или URL-ът (той носи Google ключа) не се
// прекопират в новата грешка — иначе ключът може да изтече през текста или
// стека на изключението.
async function fetchJson(fetchImpl, url, timeoutMs) {
  const ctl = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(new GeocodeError("upstream timed out"));
    }, timeoutMs);
  });
  const work = (async () => {
    let r;
    try {
      r = await fetchImpl(url, { signal: ctl.signal });
    } catch {
      throw new GeocodeError("upstream request failed");
    }
    if (!r.ok) throw new GeocodeError(`upstream returned HTTP ${r.status}`);
    try {
      return await r.json();
    } catch {
      throw new GeocodeError("upstream returned invalid JSON");
    }
  })();
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

// Валидният отговор без "results" (Open-Meteo при нула съвпадения) остава
// празен списък — не грешка. Но невалидна форма (тяло не е обект, `results`
// не е масив) е GeocodeError; отделен невалиден елемент вътре в масива се
// пропуска мълчаливо, не чупи целия отговор. `count` е само молба към
// доставчика — таванът `limit` се налага и тук, след филтъра, за да не
// стигнат 1 000 записа до клиента (и негодните да не заемат места).
// `admin` е областта, `admin2` — общината (Open-Meteo: admin1/admin2; Google:
// administrative_area_level_1/_2). Липсваща или нестрингова -> "" — винаги
// низове, за да е еднаква формата.
const text = (x) => (typeof x === "string" ? x : "");

function normalizeMeteo(body, limit) {
  try {
    if (body === null || typeof body !== "object" || Array.isArray(body)) throw new GeocodeError("upstream returned malformed data");
    if (body.results !== undefined && !Array.isArray(body.results)) throw new GeocodeError("upstream returned malformed data");
    const list = Array.isArray(body.results) ? body.results : [];
    return list
      .filter((r) => r && typeof r === "object" && nonEmptyName(r.name) && validLatLon(r.latitude, r.longitude))
      .slice(0, limit)
      .map((r) => ({ name: r.name, admin: text(r.admin1), admin2: text(r.admin2), lat: round3(r.latitude), lon: round3(r.longitude) }));
  } catch (e) {
    if (e instanceof GeocodeError) throw e;
    throw new GeocodeError("upstream returned malformed data");
  }
}

function normalizeGoogle(body, limit) {
  try {
    if (body === null || typeof body !== "object" || Array.isArray(body)) throw new GeocodeError("upstream returned malformed data");
    if (body.status !== "OK" && body.status !== "ZERO_RESULTS") {
      // body.status идва от доставчика необработен — никога да не се
      // прекопира сурова стойност в грешката (виж коментара при fetchJson).
      const status = GOOGLE_ERROR_STATUSES.has(body.status) ? `: ${body.status}` : "";
      throw new GeocodeError(`upstream returned an error status${status}`);
    }
    if (!Array.isArray(body.results)) throw new GeocodeError("upstream returned malformed data");
    // Всеки запис се проверява сам за себе си и негодният отпада тихо (както
    // при Open-Meteo) — един счупен запис в списъка не бива да прави 502 от
    // цялото търсене; таванът е след филтъра, така че се гледат и записите
    // отвъд първите `limit`.
    const wellFormed = (r) => r && typeof r === "object" && r.geometry && r.geometry.location
      && validLatLon(r.geometry.location.lat, r.geometry.location.lng)
      && (r.address_components === undefined || Array.isArray(r.address_components));
    const comp = (r, type) => (r.address_components || [])
      .find((c) => c && typeof c === "object" && Array.isArray(c.types) && c.types.includes(type))?.long_name;
    const str = (x) => (typeof x === "string" ? x : "");
    // Името се извлича, после се филтрира (без locality и без адрес -> празно),
    // и чак тогава таванът — негодните не заемат места.
    return body.results
      .filter(wellFormed)
      .map((r) => ({
        name: str(comp(r, "locality")) || str(r.formatted_address).split(",")[0].trim(),
        admin: str(comp(r, "administrative_area_level_1")),
        admin2: str(comp(r, "administrative_area_level_2")),
        lat: round3(r.geometry.location.lat), lon: round3(r.geometry.location.lng),
      }))
      .filter((r) => nonEmptyName(r.name))
      .slice(0, limit);
  } catch (e) {
    if (e instanceof GeocodeError) throw e;
    throw new GeocodeError("upstream returned malformed data");
  }
}

async function openMeteo({ q, lang, limit, fetchImpl, timeoutMs }) {
  const url = new URL(OPEN_METEO);
  url.searchParams.set("name", q); url.searchParams.set("count", String(limit));
  url.searchParams.set("language", lang); url.searchParams.set("countryCode", "BG");
  url.searchParams.set("format", "json");
  const body = await fetchJson(fetchImpl, url.toString(), timeoutMs);
  return { results: normalizeMeteo(body, limit), provider: "openmeteo" };
}

async function google({ q, lang, limit, googleKey, fetchImpl, timeoutMs }) {
  const url = new URL(GOOGLE);
  url.searchParams.set("address", q); url.searchParams.set("components", "country:BG");
  url.searchParams.set("language", lang); url.searchParams.set("key", googleKey);
  const body = await fetchJson(fetchImpl, url.toString(), timeoutMs);
  return { results: normalizeGoogle(body, limit), provider: "google" };
}

export async function geocode({ q, lang = "bg", limit = 5, provider = "openmeteo", googleKey = "",
                                fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
  const trimmedQ = String(q ?? "").trim();
  const n = clampLimit(limit);
  const useGoogle = provider === "google" && !!googleKey;
  const args = { q: trimmedQ, lang: lang === "en" ? "en" : "bg", limit: n, googleKey, fetchImpl, timeoutMs };
  return useGoogle ? google(args) : openMeteo(args);
}
