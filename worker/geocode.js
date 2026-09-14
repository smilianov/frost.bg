// Име на място → координати. Два доставчика, една форма на отговора.
export class GeocodeError extends Error {}

const OPEN_METEO = "https://geocoding-api.open-meteo.com/v1/search";
const GOOGLE = "https://maps.googleapis.com/maps/api/geocode/json";
const round3 = (x) => Math.round(x * 1000) / 1000;

async function fetchJson(fetchImpl, url, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { signal: ctl.signal });
    if (!r.ok) throw new GeocodeError(`HTTP ${r.status}`);
    try { return await r.json(); } catch (e) { throw new GeocodeError(`bad JSON: ${e.message}`); }
  } catch (e) {
    if (e instanceof GeocodeError) throw e;
    throw new GeocodeError(e.message || String(e));
  } finally {
    clearTimeout(timer);
  }
}

async function openMeteo({ q, lang, limit, fetchImpl, timeoutMs }) {
  const url = new URL(OPEN_METEO);
  url.searchParams.set("name", q); url.searchParams.set("count", String(limit));
  url.searchParams.set("language", lang); url.searchParams.set("countryCode", "BG");
  url.searchParams.set("format", "json");
  const body = await fetchJson(fetchImpl, url.toString(), timeoutMs);
  const results = (body.results || []).map((r) => ({
    name: r.name, admin: r.admin1 || "", lat: round3(r.latitude), lon: round3(r.longitude),
  }));
  return { results, provider: "openmeteo" };
}

async function google({ q, lang, limit, googleKey, fetchImpl, timeoutMs }) {
  const url = new URL(GOOGLE);
  url.searchParams.set("address", q); url.searchParams.set("components", "country:BG");
  url.searchParams.set("language", lang); url.searchParams.set("key", googleKey);
  const body = await fetchJson(fetchImpl, url.toString(), timeoutMs);
  if (body.status !== "OK" && body.status !== "ZERO_RESULTS") throw new GeocodeError(`Google: ${body.status}`);
  const comp = (r, type) => (r.address_components || []).find((c) => (c.types || []).includes(type))?.long_name;
  const results = (body.results || []).slice(0, limit).map((r) => ({
    name: comp(r, "locality") || String(r.formatted_address || "").split(",")[0].trim(),
    admin: comp(r, "administrative_area_level_1") || "",
    lat: round3(r.geometry.location.lat), lon: round3(r.geometry.location.lng),
  }));
  return { results, provider: "google" };
}

export async function geocode({ q, lang = "bg", limit = 5, provider = "openmeteo", googleKey = "",
                                fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
  // `|| 5` тук би претворило limit: 0 в 5 (0 е лъжливо в JS) вместо да го
  // остави да се скове до 1 долу — затова изрична проверка за NaN, не `||`.
  const num = Number(limit);
  const n = Math.min(10, Math.max(1, Number.isFinite(num) ? num : 5));
  const useGoogle = provider === "google" && !!googleKey;
  const args = { q, lang: lang === "en" ? "en" : "bg", limit: n, googleKey, fetchImpl, timeoutMs };
  return useGoogle ? google(args) : openMeteo(args);
}
