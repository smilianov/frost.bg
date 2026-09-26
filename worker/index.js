// Един Worker: /api/v1/* тук, всичко друго — статичните файлове от site/.
import grid from "../grid/grid.json" with { type: "json" };
import { parseCoords, frostResponse } from "./frost.js";
import { geocode, GeocodeError, clampLimit } from "./geocode.js";
import { elevation, ElevationError } from "./elevation.js";
import { TEXTS } from "./texts.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};
// max-age е за браузъра, s-maxage — за ръба (Cache API чете s-maxage): след
// нов deploy/конфигурация ръбът е свеж веднага (нов rev в ключа), а браузърът
// проверява отново до 5 минути, вместо да пази стар /config ден или
// /geocode седмица.
const DAY = "public, max-age=300, s-maxage=86400";
const WEEK = "public, max-age=300, s-maxage=604800";
// Локален const, НЕ export: workerd разгръща export-ите на входния модул
// като handler обекти или функции/класове конструктори — низ не отговаря на
// нито едното и чупи `wrangler dev` (виж бележката накрая на файла).
const APP_VERSION = "0.3.4";

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", ...CORS, ...extra },
  });
}

export function error(code, status, extra = {}) {
  const t = TEXTS.errors[code];
  return json({ error: { code, bg: t.bg, en: t.en } }, status, { "cache-control": "no-store", ...extra });
}

// Cloudflare не кешира по Cache-Control сам по себе си — трябва изрично Cache
// API (Р2 в спецификацията). Ключът е нормализиран URL; грешките никога не се
// пишат в кеша (и без друго са no-store). Без `env.ctx`/`globalThis.caches`
// (локални тестове) — просто пресмята директно, без грешка.
function cacheOf() {
  return globalThis.caches?.default ?? null;
}

// Ефективните карта и геокодер — същите, които /config докладва: `google`
// само с наличния ключ, иначе подразбиращите се.
const effectiveMap = (env) => (env.MAP === "google" && !!env.GOOGLE_MAPS_KEY ? "google" : "osm");
const effectiveGeocoder = (env) => (env.GEOCODER === "google" && !!env.GOOGLE_KEY ? "google" : "openmeteo");

// Превключвателят за /api/v1/elevation (Задача 7): "on" по подразбиране,
// "off" изключва изцяло адреса и реда на екрана. Влиза в configRev()
// по-долу (fix round 1) — смяната стига до ръба веднага, не чак при нов
// deploy; /frost и /geocode не го докладват и остават на общия cacheRev().
const elevationOn = (env) => env.ELEVATION !== "off";

// Ревизията в ключа на кеша (`rev=`, първи параметър): версията на
// приложението, датата на мрежата и ефективните карта/геокодер. Кешът се
// пази между deploy-ите, така че без това нов deploy или сменена
// конфигурация би сервирал стария отговор до изтичане на TTL-а. Нова версия,
// нова мрежа или друга карта/геокодер = други ключове; старите записи
// просто изтичат по TTL (нищо не се трие). Deploy, който не сменя нито едно
// от четирите, продължава да улучва старите записи — затова версията се
// вдига при всяко издание (operations.md).
function revParts(env) {
  return [APP_VERSION, grid.computed, effectiveMap(env), effectiveGeocoder(env)];
}
function cacheRev(env) {
  return encodeURIComponent(revParts(env).join("|"));
}

// /config-специфична ревизия (fix round 1, finding 1): същата четворка,
// плюс превключвателя ELEVATION — само тук. /frost и /geocode не докладват
// elevation и съдържанието им не зависи от него, затова cacheRev() по-горе
// остава непроменена за тях; иначе ELEVATION on->off/off->on би оставял
// стария кеширан /config (с грешна стойност на elevation) до денонощие.
function configRev(env) {
  return encodeURIComponent([...revParts(env), elevationOn(env)].join("|"));
}

async function handleFrost(url, env, ctx) {
  const q = parseCoords(url.searchParams.get("lat"), url.searchParams.get("lon"));
  if (!q) return error("bad_request", 400);
  const cache = cacheOf();
  const key = cache ? new Request(`${url.origin}/api/v1/frost?rev=${cacheRev(env)}&lat=${q.lat}&lon=${q.lon}`) : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const body = frostResponse(grid, q.lat, q.lon);
  if (!body) return error("outside_bulgaria", 400);
  const res = json(body, 200, { "cache-control": DAY });
  if (cache) ctx?.waitUntil?.(cache.put(key, res.clone()));
  return res;
}

async function handleConfig(env, url, ctx) {
  const cache = cacheOf();
  const key = cache ? new Request(`${url.origin}/api/v1/config?rev=${configRev(env)}`) : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const map = effectiveMap(env);
  const res = json({
    map,
    google_maps_key: map === "google" ? env.GOOGLE_MAPS_KEY : null,
    geocoder: effectiveGeocoder(env),                       // кой доставчик, без самия ключ
    languages: ["bg", "en"],
    grid: { computed: grid.computed, period: grid.period, synthetic: grid.synthetic === true,
            source_id: grid.source_id ?? "cds" },           // за footer-а на страницата (както frost.js)
    version: "1",
    app_version: APP_VERSION,
    elevation: elevationOn(env),
  }, 200, { "cache-control": DAY });
  if (cache) ctx?.waitUntil?.(cache.put(key, res.clone()));
  return res;
}

// Собствен rev: effectiveGeocoder описва ПРАВО геокодиране и не важи тук.
function elevationRev(env) {
  return encodeURIComponent([APP_VERSION, "openmeteo-elevation"].join("|"));
}

async function handleElevation(url, env, ctx) {
  if (!elevationOn(env)) return error("not_found", 404);
  const q = parseCoords(url.searchParams.get("lat"), url.searchParams.get("lon"));
  if (!q) return error("bad_request", 400);
  if (!frostResponse(grid, q.lat, q.lon)) return error("outside_bulgaria", 400);
  const cache = cacheOf();
  const rev = elevationRev(env);
  const key = cache ? new Request(`${url.origin}/api/v1/elevation?rev=${rev}&lat=${q.lat}&lon=${q.lon}`) : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  // Координираният кратък отказ (Задача 7, отвъд брифа): elevation.js пази
  // собствен `cooldownUntil`, но само в модулна променлива — бърз локален
  // предпазител за текущия isolate, честно казано и в самия коментар там.
  // Cloudflare разпределя заявките по много isolate-и и ги подменя свободно,
  // затова маршрутът пази и втори маркер в споделения Cache API — за
  // "свеж" isolate, който локално не помни нищо. Маркерът е споделен само
  // между isolate-ите на ЕДИН център на Cloudflare (Cache API не е
  // глобален), не между всички центрове по света (operations.md).
  const cooldownKey = cache ? new Request(`${url.origin}/api/v1/elevation?cooldown=1&rev=${rev}`) : null;
  if (cache) {
    const cooling = await cache.match(cooldownKey);
    if (cooling) return error("elevation_failed", 502);
  }
  try {
    const { elevation_m } = await elevation({ lat: q.lat, lon: q.lon, fetchImpl: env.FETCH ?? fetch });
    const res = json({ query: q, elevation_m, source: TEXTS.elevationSource, version: "1" }, 200, { "cache-control": WEEK });
    if (cache) ctx?.waitUntil?.(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    if (e instanceof ElevationError) {
      // Само истинско throttling пали маркера — не всяка ElevationError:
      // таймаут или негодни данни от доставчика не значат "спри да питаш",
      // elevation.js самото не пали и локалния си cooldown за тях. Четем
      // стабилното свойство `e.throttled` (fix round 1, finding 3), не
      // текста на съобщението — думите могат да се сменят, свойството не.
      if (cache && e.throttled) {
        const marker = new Response(null, { status: 200, headers: { "cache-control": "max-age=600" } });
        ctx?.waitUntil?.(cache.put(cooldownKey, marker));
      }
      return error("elevation_failed", 502);
    }
    throw e;
  }
}

async function handleGeocode(url, env, ctx) {
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) return error("bad_query", 400);
  const lang = url.searchParams.get("lang") || "bg";
  const langKey = lang === "en" ? "en" : "bg";
  const limit = url.searchParams.get("limit") || 5;
  const cache = cacheOf();
  const key = cache
    ? new Request(`${url.origin}/api/v1/geocode?rev=${cacheRev(env)}&q=${encodeURIComponent(q)}&lang=${langKey}&limit=${clampLimit(limit)}`)
    : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  try {
    const body = await geocode({
      q, lang, limit,
      provider: env.GEOCODER || "openmeteo", googleKey: env.GOOGLE_KEY || "",
      fetchImpl: env.FETCH ?? fetch,
    });
    const res = json(body, 200, { "cache-control": WEEK });
    if (cache) ctx?.waitUntil?.(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    if (e instanceof GeocodeError) return error("geocoder_failed", 502);
    throw e;
  }
}

const ALLOW = "GET, OPTIONS";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return error("not_found", 405, { allow: ALLOW });
    switch (url.pathname) {
      case "/api/v1/frost": return handleFrost(url, env, ctx);
      case "/api/v1/config": return handleConfig(env, url, ctx);
      case "/api/v1/geocode": return handleGeocode(url, env, ctx);
      case "/api/v1/elevation": return handleElevation(url, env, ctx);
      default: return error("not_found", 404);
    }
  },
};

// Забележка (workerd): `export { WEEK }` от входния модул чупи `wrangler dev` —
// workerd разгръща export-ите на входния модул като handler обекти или
// функции/класове конструктори; низ не отговаря на нито едното. Task 5 живее в
// същия файл (handleGeocode) и просто ползва локалния WEEK по-горе.
