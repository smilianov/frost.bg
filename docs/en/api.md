# frost.bg — API v1

*[На български](../bg/api.md)*

One Worker serves both the static files and the API, on one domain. CORS is
open (`Access-Control-Allow-Origin: *`) — the API is public, free to use
from another site or app.

## `GET /api/v1/frost?lat=&lon=`

`lat`, `lon` — decimal degrees. The processing order:

1. **syntax and bounds**: not decimal numbers, or outside ±90° / ±180° →
   **400** `bad_request` (so `lat=90.0001` is an error, it is not rounded
   down to 90);
2. **rounding to 3 decimal places** — that is the `query` in the response
   and the cache key (near-identical coordinates hit the same entry — see
   "Caching" below);
3. **rounding to 0.1°** — that picks the cell: the grid is regular, so
   "nearest" is a plain round, no search.

- **"outside Bulgaria"** = the point rounded to 0.1° **is not on the grid**.
  The grid covers the rectangle 41.2–44.3° N × 22.3–28.7° E, which because
  of the rounding also means a **half-step (0.05°) margin** around it:
  `lat=41.16&lon=22.26` rounds to 41.2/22.3 and gets **200**, while
  `lat=41.14` → 41.1 has no cell → **400** `outside_bulgaria`;
- the distance from the requested point to the cell's center
  (`distance_m`) is haversine, in meters.

Example — `GET /api/v1/frost?lat=42.18425&lon=24.92936` (Manole):

```json
{
  "query": {"lat": 42.184, "lon": 24.929},
  "cell": {"lat": 42.2, "lon": 24.9, "elev_m": 99, "distance_m": 2979},
  "typical": {"last_spring": "03-29", "first_autumn": "11-25"},
  "safe": {"last_spring": "04-11", "first_autumn": "10-30"},
  "years_used": 30,
  "years": [[1996, "04-18", "11-26"], [1997, "04-18", "10-30"], [1998, "03-30", "11-18"], "… (30 entries total)"],
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
  "synthetic": false,
  "version": "1"
}
```

The example is from production (`GET
/api/v1/frost?lat=42.18425&lon=24.92936`, fetched from
<https://frost.bg>).

Fields: `query` — the requested coordinates, rounded to 3 decimals; `cell`
— the cell's center, its elevation and the distance to it (the elevation
comes from the CDS geopotential for a CDS grid; from Open-Meteo for a grid
from an Open-Meteo run; made up for a synthetic one); `typical`/`safe` —
dates as `MM-DD` (no year — the client carries them into whichever year it
needs); `null` instead of a date means fewer than 10 years had a valid
frost date in that direction; `years` — the raw per-year dates; from these
the page computes the history for a chosen period (10/20/30 years) entirely
in the browser — the API remains without a period parameter or any other
response variant (see the
[phase 2 spec](../superpowers/specs/2026-09-23-frost-bg-phase2-design.md));
`period` — the first
and last of the 30 years; `synthetic` — `true` while the grid is from
`--synthetic`, not real data; `version` — the API format version (`"1"`,
from the `/api/v1/` path), distinct from `app_version` in `/api/v1/config`
below (the application's own version).

`years_used` is the number of accepted years — those with at least 300 valid
days — and equals the number of rows in `years`. Each row is `[year,
last_spring_frost, first_autumn_frost]` with `MM-DD` dates; a seasonal `null`
means no frost was recorded in the available data for that half of the year.
Such a year counts toward `years_used` but not toward the percentile for the
missing seasonal date; a rejected year has no row.

`source` follows **the grid's origin** (`source_id` in `grid.json`, see
`/config`), not an assumption — always the four keys `bg`, `en`, `url`,
`attribution`:

| `source_id` | `bg` / `en` | `url` | `attribution` |
|---|---|---|---|
| `cds` (production) | `ERA5-Land през Copernicus CDS, 1996–2025` / `ERA5-Land via Copernicus CDS, 1996–2025` | the dataset's page on CDS | `Contains modified Copernicus Climate Change Service information 2026` (the computation year; required by the CDS licence) |
| `openmeteo` | `ERA5 през Open-Meteo, 1996–2025` / `ERA5 via Open-Meteo, 1996–2025` | `https://open-meteo.com/` | `Weather data by Open-Meteo.com` |
| `synthetic` | `Пробни данни (синтетична мрежа)` / `Sample data (synthetic grid)` | `null` | `null` |

The synthetic grid is only for local development without network access to
CDS/Open-Meteo (`grid/compute_grid.py --synthetic`, see
[`operations.md`](operations.md)); in production `source_id` is always
`cds`, as in the example above.

Caching: `Cache-Control: public, max-age=300, s-maxage=86400` — the browser
keeps the response for 5 minutes, Cloudflare's edge (the Cache API,
explicitly, not just the header) for a day; the edge key also carries a
revision (version, grid date, map, geocoder). Why, and what that means on
deploy — "The API cache" in [`operations.md`](operations.md).

## `GET /api/v1/elevation?lat=&lon=`

The elevation of **the point itself** — not the cell from `/frost`. A
garden in a valley bottom can sit hundreds of metres below its cell's
average elevation, which is exactly why the `/frost` dates can mislead:
compare the two.

Input and normalization — **the same rules as `/frost`**: syntax and bounds
→ 400 `bad_request`; the point rounded to 0.1° must be on the grid,
otherwise 400 `outside_bulgaria` (there is no way through this endpoint to
ask the provider about a point outside Bulgaria); rounding to 3 decimals —
that is the `query` in the response and the cache key, and it's what the
provider is asked about too.

Provider: [Open-Meteo Elevation](https://open-meteo.com/en/docs/elevation-api)
(Copernicus DEM GLO-90, ~90 m resolution) — a different terrain model from
ERA5-Land (the grid behind `/frost`), so this elevation and `cell.elev_m`
can differ noticeably. The combined timeout for the request **and** reading
its body is eight seconds; the response shape is validated, **with no
automatic retries**.

Example — `GET /api/v1/elevation?lat=42.18425&lon=24.92936`:

```json
{
  "query": {"lat": 42.184, "lon": 24.929},
  "elevation_m": 152,
  "source": {
    "bg": "Copernicus DEM GLO-90 през Open-Meteo",
    "en": "Copernicus DEM GLO-90 via Open-Meteo",
    "url": "https://open-meteo.com/en/docs/elevation-api",
    "attribution": "Elevation data: Copernicus DEM GLO-90 · Weather data by Open-Meteo.com"
  },
  "version": "1"
}
```

`elevation_m` is rounded to a whole metre: `null` means a missing value, `0`
means sea level, and a negative number means an elevation below it. A missing
value is explicitly `null`, never `0`. `source` carries attribution to both
Copernicus and Open-Meteo — the same fixed four keys `bg`, `en`, `url`,
`attribution`, independent of the grid's `source_id` (unlike `sourceLabel`
in `/frost` above).

Errors: `bad_request`/`outside_bulgaria` (400, same rules as `/frost`);
`elevation_failed` (502) — the provider didn't respond, responded with an
error, or is in a short refusal after an earlier 429/5xx (see "The point's
elevation" in [`operations.md`](operations.md)); `not_found` (404) — for
an unknown path **and** when the `ELEVATION` switch is off
(`wrangler.toml`).

Caching: `Cache-Control: public, max-age=300, s-maxage=604800` — like
`/geocode`, a week at the edge (a place's elevation doesn't change over
time). The edge key carries its **own** revision — only the application
version and the elevation provider (`APP_VERSION|openmeteo-elevation`) —
not the map/geocoder from the shared `cacheRev()`, which this endpoint
doesn't use.

The frost result **never waits** for this endpoint: the page shows the
frost result immediately, the point's elevation is appended after a
separate, independent request — on error or a missing value the line is
simply absent (never `0`, never the cell's elevation instead).

## `GET /api/v1/geocode?q=&lang=bg|en&limit=`

Place name → a list of candidates with coordinates, for search suggestions.

- `q` — fewer than 2 characters (after trimming whitespace) → **400**
  `bad_query`;
- `lang` — `bg` (default) or `en`; any other value falls back to `bg`;
- `limit` — an integer from **1 to 10**: fractions are truncated (not
  rounded), out-of-range values are clamped (`0` → 1, `50` → 10); missing,
  empty/whitespace-only or non-numeric → **5**. The response has at most
  `limit` results, regardless of provider;
- provider chosen by `env.GEOCODER`: `openmeteo` (default, free, no key)
  or `google` (only when `env.GEOCODER == "google"` **and** the secret
  `GOOGLE_KEY` is set; otherwise falls back to Open-Meteo); both go through
  the same normalization, so the response shape is identical regardless of
  provider; records without a name, with coordinates outside ±90°/±180° or
  malformed (e.g. `address_components` not a list) are dropped individually
  without failing the search; 8-second timeout;
- the provider doesn't respond, responds with an error, or its body is
  malformed → **502** `geocoder_failed` (the secret `GOOGLE_KEY` is never
  carried into the error message, even when it was part of the requested
  URL).

Example — `GET /api/v1/geocode?q=Маноле&lang=bg`:

```json
{
  "results": [{"name": "Маноле", "admin": "Пловдив", "admin2": "Марица", "lat": 42.183, "lon": 24.933}],
  "provider": "openmeteo"
}
```

Only these two keys: `results` and `provider` (`"openmeteo"` or `"google"`
— whichever actually answered); there is no `version` — this response
carries no format version. Each result has `name`, `admin` (the province),
`admin2` (the municipality; since 0.2.1) and `lat`/`lon` rounded to 3
decimals; `admin` and `admin2` are always strings — `""` when the provider
does not know them. Duplicate names are common (there are at least ten
"Ново Село"), so the page asks for `limit=10` and shows the province and
the municipality. An empty `"results": []` (not an error) just means the
provider found nothing.

Caching: `Cache-Control: public, max-age=300, s-maxage=604800` — the
browser 5 minutes, the edge a week: place names don't move, but a geocoder
change must reach the browser in minutes, not in a week.

## `GET /api/v1/config`

The current deploy's settings, so the site knows which map and which
geocoder to use and where the grid comes from, without carrying any
secret. Exactly these keys:

```json
{
  "map": "osm",
  "google_maps_key": null,
  "geocoder": "openmeteo",
  "languages": ["bg", "en"],
  "grid": {"computed": "2026-09-20", "period": {"start": 1996, "end": 2025}, "synthetic": false, "source_id": "cds"},
  "version": "1",
  "app_version": "0.3.3",
  "elevation": true
}
```

- `map` — `"google"` only when `env.MAP == "google"` **and**
  `env.GOOGLE_MAPS_KEY` is set; otherwise `"osm"` (Leaflet + OpenStreetMap
  tiles), no exceptions;
- `google_maps_key` — the actual Google Maps JS key (distinct from the
  geocoder's secret `GOOGLE_KEY` — this one lives in the browser, restricted
  by HTTP referrer in Google Cloud) — `null` whenever `map` is `"osm"`;
- `geocoder` — `"google"` only when `env.GEOCODER == "google"` **and** the
  secret `GOOGLE_KEY` is set; otherwise `"openmeteo"`. The provider's name
  only — the key never leaves. The page credits the place-name provider
  from this;
- `languages` — the page's languages;
- `grid.computed` — the date the current grid was computed on;
  `grid.period` — the first and last of the 30 years; `grid.synthetic` —
  true while the grid hasn't been computed from real data yet;
  `grid.source_id` — the grid's origin: `"cds"`, `"openmeteo"` or
  `"synthetic"` (the page and `/frost` label the source from it);
- `version` — the API format version (same value as in `/frost` responses;
  `/geocode` carries no version); `app_version` — the application's own
  version (`package.json`, tracked from the changelog — see
  [`../../CHANGELOG.md`](../../CHANGELOG.md));
- `elevation` — whether `/api/v1/elevation` is enabled (the `ELEVATION`
  switch in `wrangler.toml`, `[vars]`, `"on"` by default); `false` means
  the endpoint returns `404` and the page doesn't append the point's
  elevation. Just like the map/geocoder, this value **is** part of
  `/config`'s cache revision below (its own `configRev()`, separate from
  `/frost`/`/geocode`) — flipping the switch reaches the edge immediately
  on a new deploy. The browser receives the change on its next request after
  the cached copy expires (5 minutes); an open page does not recheck
  `/config` automatically (see [`operations.md`](operations.md)).

Caching: `Cache-Control: public, max-age=300, s-maxage=86400`; the edge key
carries a revision, so a change of map/geocoder or a new grid reaches the
edge immediately on a new rev. The browser receives the change on its next
request after the cached copy expires (5 minutes); an open page does not
recheck `/config` automatically (see [`operations.md`](operations.md)).

## Errors

One body shape for every error, in both languages:

```json
{"error": {"code": "outside_bulgaria", "bg": "Засега само за България.", "en": "Bulgaria only for now."}}
```

| `code` | HTTP | When |
|---|---|---|
| `bad_request` | 400 | `/frost`, `/elevation`: `lat`/`lon` missing, not numbers, or outside ±90°/±180° |
| `outside_bulgaria` | 400 | `/frost`, `/elevation`: the point rounded to 0.1° isn't on the grid |
| `bad_query` | 400 | `/geocode`: `q` under 2 characters |
| `geocoder_failed` | 502 | `/geocode`: the provider didn't respond or its response was malformed |
| `elevation_failed` | 502 | `/elevation`: the provider didn't respond, its response was malformed, or it's in a short refusal after an earlier 429/5xx |
| `not_found` | 404 | `GET` to an unknown `/api/*` path, or to `/elevation` when `ELEVATION = "off"` |
| `not_found` | 405 | a method other than `GET`/`OPTIONS` on any `/api/*` path (the method check precedes routing) — the response also carries `Allow: GET, OPTIONS` |

Error responses always carry `Cache-Control: no-store` — they never enter
the cache.

## CORS, methods and headers

Every JSON response (success or error) carries:

```
Content-Type: application/json; charset=utf-8
X-Content-Type-Options: nosniff
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: content-type
```

`OPTIONS` on any `/api/*` path → **204** with the CORS headers, no body
(preflight). Anything other than `GET`/`OPTIONS` → **405** with `Allow: GET,
OPTIONS` (see the table above).

## Outside `/api/*`

Paths outside `/api/*` aren't the API — they serve the static files from
`site/` (the page, `/` in Bulgarian and `/en/` in English).
