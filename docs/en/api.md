# frost.bg — API v1

*[На български](../bg/api.md)*

One Worker serves both the static files and the API, on one domain. CORS is
open (`Access-Control-Allow-Origin: *`) — the API is public, free to use
from another site or app.

> **The examples below are from the synthetic grid**
> (`grid/grid.json`, `synthetic: true`) — the numbers for Manole are not
> real frost data, just a plausible stand-in for development (see
> [`operations.md`](operations.md)). Real numbers arrive after the first
> Copernicus CDS run; the response shape does not change.

## `GET /api/v1/frost?lat=&lon=`

`lat`, `lon` — decimal degrees. Rounded to **3 decimal places** before
anything else (so the URL-keyed cache hits for near-identical coordinates
— see "Caching" below).

- not numbers, or outside ±90° / ±180° → **400** `bad_request`;
- the request maps to a grid cell by rounding `lat`/`lon` to the nearest
  **0.1°** (the grid is regular, so "nearest" is a plain round, no search);
  if the rounded point is missing from the grid (outside Bulgaria's
  bounding box, or more than half a step outside it) → **400**
  `outside_bulgaria`;
- the distance from the requested point to the cell's center
  (`distance_m`) is haversine, in meters.

Example — `GET /api/v1/frost?lat=42.18425&lon=24.92936` (Manole):

```json
{
  "query": {"lat": 42.184, "lon": 24.929},
  "cell": {"lat": 42.2, "lon": 24.9, "elev_m": 200, "distance_m": 2979},
  "typical": {"last_spring": "04-12", "first_autumn": "10-17"},
  "safe": {"last_spring": "04-16", "first_autumn": "10-12"},
  "years_used": 30,
  "years": [[1996, "04-08", "10-19"], [1997, "04-16", "10-13"], [1998, "04-12", "10-17"], "… (30 entries total)"],
  "period": {"start": 1996, "end": 2025},
  "threshold_c": 0,
  "note": {
    "bg": "ERA5 е мрежа от 9–25 км; в котловини нощният минимум е надценен и сланата е подценена — истинските дати може да са по-късни напролет и по-ранни наесен. Сравни височината на клетката с тази на мястото си.",
    "en": "ERA5 is a 9–25 km grid; in valley bottoms the night minimum is overestimated and frost is underestimated — real dates may be later in spring and earlier in autumn. Compare the cell elevation with your location's elevation."
  },
  "source": {
    "bg": "ERA5-Land през Copernicus CDS, 1996–2025",
    "en": "ERA5-Land via Copernicus CDS, 1996–2025",
    "url": "https://cds.climate.copernicus.eu/datasets/derived-era5-land-daily-statistics",
    "attribution": "Contains modified Copernicus Climate Change Service information 2026"
  },
  "synthetic": true,
  "version": "1"
}
```

Fields: `query` — the requested coordinates, rounded to 3 decimals; `cell`
— the cell's center, its elevation (from the CDS geopotential) and the
distance to it; `typical`/`safe` — dates as `MM-DD` (no year — the client
carries them into whichever year it needs); `null` instead of a date means
fewer than 10 years had a valid frost date in that direction; `years` — the
raw per-year dates (used by the future windowed history chart, phase 2, see
the spec); `period` — the first and last of the 30 years; `source` — the
attribution required by the CDS license, with the computation year;
`synthetic` — `true` while the grid is from `--synthetic`, not real data;
`version` — the API format version (`"1"`, from the `/api/v1/` path),
distinct from `app_version` in `/api/v1/config` below (the
application's own version).

Caching: `Cache-Control: public, max-age=86400` (a day) — via Cloudflare's
Cache API, explicitly, not just the header (see
[`operations.md`](operations.md) for why that's needed).

## `GET /api/v1/geocode?q=&lang=bg|en&limit=`

Place name → a list of candidates with coordinates, for search suggestions.

- `q` — fewer than 2 characters (after trimming whitespace) → **400**
  `bad_query`;
- `lang` — `bg` (default) or `en`; any other value falls back to `bg`;
- `limit` — an integer, truncated (not rounded) and clamped to **1–10**;
  invalid or missing → **5**;
- provider chosen by `env.GEOCODER`: `openmeteo` (default, free, no key)
  or `google` (only when `env.GEOCODER == "google"` **and** the secret
  `GOOGLE_KEY` is set; otherwise falls back to Open-Meteo); both go through
  the same normalization, so the response shape is identical regardless of
  provider; 8-second timeout;
- the provider doesn't respond, responds with an error, or its body is
  malformed → **502** `geocoder_failed` (the secret `GOOGLE_KEY` is never
  carried into the error message, even when it was part of the requested
  URL).

Example — `GET /api/v1/geocode?q=Маноле&lang=bg`:

```json
{
  "results": [{"name": "Маноле", "admin": "Пловдив", "lat": 42.183, "lon": 24.933}],
  "provider": "openmeteo"
}
```

`lat`/`lon` in the results are rounded to 3 decimals. An empty
`"results": []` (not an error) just means the provider found nothing.

Caching: `Cache-Control: public, max-age=604800` (a week) — place names
don't move.

## `GET /api/v1/config`

The current deploy's settings, so the site knows which map and which
geocoder to use, without carrying any secret.

```json
{
  "map": "osm",
  "google_maps_key": null,
  "languages": ["bg", "en"],
  "grid": {"computed": "2026-09-14", "period": {"start": 1996, "end": 2025}, "synthetic": true},
  "version": "1",
  "app_version": "0.1.0"
}
```

- `map` — `"google"` only when `env.MAP == "google"` **and**
  `env.GOOGLE_MAPS_KEY` is set; otherwise `"osm"` (Leaflet + OpenStreetMap
  tiles), no exceptions;
- `google_maps_key` — the actual Google Maps JS key (distinct from the
  geocoder's secret `GOOGLE_KEY` — this one lives in the browser, restricted
  by domain in Google Cloud) — `null` whenever `map` is `"osm"`;
- `grid.computed` — the date the current grid was computed on;
  `grid.period` — the first and last of the 30 years; `grid.synthetic` —
  true while the grid hasn't been computed from real data yet;
  `version` — the API format version (same value as in `/frost` and
  `/geocode` responses); `app_version` — the application's own version
  (`package.json`, tracked from the changelog — see
  [`../../CHANGELOG.md`](../../CHANGELOG.md)).

Caching: `Cache-Control: public, max-age=86400`.

## Errors

One body shape for every error, in both languages:

```json
{"error": {"code": "outside_bulgaria", "bg": "Засега само за България.", "en": "Bulgaria only for now."}}
```

| `code` | HTTP | When |
|---|---|---|
| `bad_request` | 400 | `/frost`: `lat`/`lon` missing, not numbers, or outside ±90°/±180° |
| `outside_bulgaria` | 400 | `/frost`: the rounded point isn't on the grid |
| `bad_query` | 400 | `/geocode`: `q` under 2 characters |
| `geocoder_failed` | 502 | `/geocode`: the provider didn't respond or its response was malformed |
| `not_found` | 404 | unknown `/api/*` path |
| `not_found` | 405 | a method other than `GET`/`OPTIONS` on a known `/api/*` path — the response also carries `Allow: GET, OPTIONS` |

Error responses always carry `Cache-Control: no-store` — they never enter
the cache.

## CORS and methods

Every JSON response (success or error) carries:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: content-type
```

`OPTIONS` on any `/api/*` path → **204** with those headers, no body
(preflight). Anything other than `GET`/`OPTIONS` → **405** with `Allow: GET,
OPTIONS` (see the table above).

## Outside `/api/*`

Paths outside `/api/*` aren't the API — they serve the static files from
`site/` (the page, `/` in Bulgarian and `/en/` in English).
