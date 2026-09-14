// Чиста логика: координати → най-близка клетка → тялото на отговора. Без I/O.
import { TEXTS } from "./texts.js";

const R_EARTH_M = 6371008.8;

// Строго десетично: без интервали (веднъж подрязани), без 0x/1e2 форми, без ".5" или "42.".
const DECIMAL = /^-?\d+(\.\d+)?$/;

// Закръгленото на нула излиза като +0, не -0 (-0 === 0, но JSON и downstream
// логика не бива да пазят знака на нулата).
const noNegZero = (x) => (x === 0 ? 0 : x);

export function parseCoords(latStr, lonStr) {
  if (latStr == null || lonStr == null) return null;
  const a = String(latStr).trim(), b = String(lonStr).trim();
  if (!DECIMAL.test(a) || !DECIMAL.test(b)) return null;
  const lat = Number(a), lon = Number(b);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    lat: noNegZero(Math.round(lat * 1000) / 1000),
    lon: noNegZero(Math.round(lon * 1000) / 1000),
  };
}

export function haversineM(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R_EARTH_M * Math.asin(Math.sqrt(a)));
}

const round1 = (x) => Math.round(x * 10) / 10;
const key = (lat, lon) => `${lat.toFixed(1)},${lon.toFixed(1)}`;

const indexCache = new WeakMap();
function index(grid) {
  let m = indexCache.get(grid);
  if (!m) {
    m = new Map(grid.cells.map((c) => [key(c.lat, c.lon), c]));
    indexCache.set(grid, m);
  }
  return m;
}

// Решетката е правилна: най-близката точка е закръглянето до 0,1. Липсва ли
// в мрежата (извън правоъгълника) — null.
export function nearestCell(grid, lat, lon) {
  const cell = index(grid).get(key(round1(lat), round1(lon)));
  if (!cell) return null;
  return { cell, distance_m: haversineM(lat, lon, cell.lat, cell.lon) };
}

export function frostResponse(grid, lat, lon) {
  const near = nearestCell(grid, lat, lon);
  if (!near) return null;
  const { cell, distance_m } = near;
  return {
    query: { lat, lon },
    cell: { lat: cell.lat, lon: cell.lon, elev_m: cell.elev, distance_m },
    typical: { last_spring: cell.typical[0], first_autumn: cell.typical[1] },
    safe: { last_spring: cell.safe[0], first_autumn: cell.safe[1] },
    years_used: cell.years_used,
    years: cell.years,
    period: grid.period,
    threshold_c: grid.threshold_c,
    note: TEXTS.note,
    source: TEXTS.sourceLabel(grid.period.start, grid.period.end, Number(grid.computed.slice(0, 4))),
    synthetic: grid.synthetic === true,
    version: "1",
  };
}
