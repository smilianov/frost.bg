// Един Worker: /api/v1/* тук, всичко друго — статичните файлове от site/.
import grid from "../grid/grid.json" with { type: "json" };
import { parseCoords, frostResponse } from "./frost.js";
import { TEXTS } from "./texts.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const DAY = "public, max-age=86400";
const WEEK = "public, max-age=604800";

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

export function error(code, status) {
  const t = TEXTS.errors[code];
  return json({ error: { code, bg: t.bg, en: t.en } }, status, { "cache-control": "no-store" });
}

function handleFrost(url) {
  const q = parseCoords(url.searchParams.get("lat"), url.searchParams.get("lon"));
  if (!q) return error("bad_request", 400);
  const body = frostResponse(grid, q.lat, q.lon);
  if (!body) return error("outside_bulgaria", 400);
  return json(body, 200, { "cache-control": DAY });
}

function handleConfig(env) {
  const googleMap = env.MAP === "google" && !!env.GOOGLE_MAPS_KEY;
  return json({
    map: googleMap ? "google" : "osm",
    google_maps_key: googleMap ? env.GOOGLE_MAPS_KEY : null,
    languages: ["bg", "en"],
    grid: { computed: grid.computed, period: grid.period, synthetic: grid.synthetic === true },
    version: "1",
  }, 200, { "cache-control": DAY });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return error("not_found", 405);
    switch (url.pathname) {
      case "/api/v1/frost": return handleFrost(url);
      case "/api/v1/config": return handleConfig(env);
      case "/api/v1/geocode": return error("not_found", 404);   // Task 5
      default: return error("not_found", 404);
    }
  },
};

// Забележка (workerd): `export { WEEK }` от входния модул чупи `wrangler dev` —
// всеки именуван export на входния модул се третира като отделен entrypoint и
// трябва да е функция/ExportedHandler, не стойност. Task 5 да си дефинира WEEK
// локално (или да го внесе от отделен, невходен модул), не от тук.
