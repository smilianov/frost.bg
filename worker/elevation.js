// Височината на самата точка: Open-Meteo Elevation (Copernicus DEM GLO-90,
// ~90 м). Свободният план е 600/мин, 5 000/час, 10 000/ден и е за
// нетърговска употреба — правилото за лимит на зоната не пази този бюджет,
// затова след 429 или 5xx Worker-ът спира да пита нагоре за 10 минути.
const URL_BASE = "https://api.open-meteo.com/v1/elevation";
const TIMEOUT_MS = 8000;
const COOLDOWN_MS = 10 * 60 * 1000;

export class ElevationError extends Error {}

let cooldownUntil = 0;
export function resetCooldown() { cooldownUntil = 0; }

// Твърд краен срок с един-единствен таймер (както в geocode.js): изтичането
// му едновременно праща abort() и отхвърля надпреварата, така че няма втори
// таймер да чистим отделно. `work` винаги хваща собствените си грешки, така
// че отхвърлянето му (включително от abort) минава през Promise.race, което
// вече слуша и двете обещания — никога не изтича необработено.
async function fetchOrTimeout(fetchImpl, url, timeoutMs) {
  const ctl = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(new ElevationError("elevation provider timed out"));
    }, timeoutMs);
  });
  const work = (async () => {
    try {
      return await fetchImpl(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    } catch {
      throw new ElevationError("elevation provider did not answer");
    }
  })();
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function elevation({ lat, lon, fetchImpl = fetch, timeoutMs = TIMEOUT_MS, now = Date.now() }) {
  if (now < cooldownUntil) throw new ElevationError("elevation provider in cooldown");
  const url = new URL(URL_BASE);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  const res = await fetchOrTimeout(fetchImpl, url.toString(), timeoutMs);
  if (res.status === 429 || res.status >= 500) {
    cooldownUntil = now + COOLDOWN_MS;
    throw new ElevationError("elevation provider is throttling");
  }
  if (!res.ok) throw new ElevationError("elevation provider returned an error status");
  let body;
  try { body = await res.json(); } catch { throw new ElevationError("elevation provider returned malformed data"); }
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new ElevationError("elevation provider returned malformed data");
  const list = body.elevation;
  if (!Array.isArray(list) || list.length < 1) throw new ElevationError("elevation provider returned malformed data");
  const v = list[0];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ElevationError("elevation provider returned malformed data");
  return { elevation_m: Math.round(v) };
}
