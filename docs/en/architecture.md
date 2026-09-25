# frost.bg — architecture

*[На български](../bg/architecture.md)*

How the project is built: the grid is computed offline; one Worker serves
both the API and the static files; the cache is explicit, at the edge; the
page is pure modules with a thin DOM layer on top.

## The grid

`grid/grid.json` — **2,080 cells** at a **0.1°** step over Bulgaria, ~**1.6
MB** of unformatted JSON. It is computed **offline**, usually once a year in
January, never per request:

- `grid/fetch_cds.py` downloads from Copernicus CDS **one NetCDF file per
  year** (30 years of daily minimum at 2 m, plus one geopotential file) —
  each year is a separate request that sits in the CDS queue (minutes to
  hours, not days);
- `grid/compute_grid.py --from-cds` reads those files and computes all
  2,080 cells in seconds, through the calculation in
  `grid/frost_estimate.py` (below).

Both scripts are grid-maintenance only: neither runs from the Worker, nor
ships in the production bundle. At runtime the grid is plain JSON — the
Worker imports it directly as a JSON module (`import grid from
"../grid/grid.json" with { type: "json" }`), it is bundled in at
`deploy`/`dev`, and it lives in the isolate's memory for as long as the
isolate is alive; no per-request I/O reads it from disk or network.

## The Worker

One router file, `worker/index.js`: it routes `/api/v1/*` to the four
endpoints and hands everything else to `env.ASSETS.fetch()` — the static
files under `site/`. The logic is split across files:

- `frost.js` — a pure function, coordinates → nearest cell → the response
  body; no I/O;
- `geocode.js` — the two place-search providers (Open-Meteo by default,
  Google when a key is configured), with one common response shape;
- `elevation.js` — the provider for the point's own elevation (Open-Meteo
  Elevation), with a local guard against provider throttling;
- `texts.js` — the bilingual texts for errors and source attributions.

No runtime dependencies — `package.json` lists only `wrangler`, as a dev
dependency. Why that is deliberate: see "New dependencies" in
[`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## The cache

Cloudflare does not cache responses the Worker generates itself — that
needs an explicit Cache API (`caches.default`) at the edge: `match` on a
normalized key, and on a miss, compute and `put`. The key carries a
revision (`rev=`, URL-encoded): `app version | the grid's date
(grid.computed) | the effective map | the effective geocoder` — a new
deploy, a new grid, or a different map/geocoder each get new keys; old
entries just expire by TTL, nothing is deleted by hand. `/api/v1/config`
carries its own revision on top — the same four values plus the
`ELEVATION` toggle, since only that affects its content. `/api/v1/elevation`
has a wholly separate revision (`APP_VERSION | "openmeteo-elevation"`) —
it depends on neither the map, the geocoder, nor the grid. Errors are never
written to the cache (`Cache-Control: no-store`). Details, and why every
release bumps the version, are in [`operations.md`](operations.md).

## The page

`site/js/` is split into pure, DOM-free modules — `stats.js` (the
calculations, copied word for word from `grid/frost_estimate.py` so they
can't drift apart), `history.js` (decides **what** is shown) and
`format.js` (formatting numbers, dates, URLs). `chart.js` mixes a pure
model (`chartModel`, `toCsv`, tested directly) with a thin SVG-rendering
layer (`renderChart`, `renderTable`) — the two are explicitly separated
inside the file. `paint.js` is the DOM layer for the two date cards at the
top — its functions decide nothing, they only write whatever they are
handed; the decisions live in `history.js`. `app.js` wires all of this to
the real `document` — it reads the URL, calls the four
API endpoints, sets up the map (`map.js`) — it computes nothing on its own,
it only draws the result of the pure modules.

## The environments

- **local**: `npm run dev` = `npx wrangler dev` — the real Workers runtime
  on `localhost:8787`, nothing is uploaded to Cloudflare;
- **production**: `npx wrangler deploy`, live at <https://frost.bg>;
- **configuration**: `ELEVATION`, `GEOCODER`, `MAP` are public variables
  under `[vars]` in `wrangler.toml`; `GOOGLE_KEY` (the server-side
  geocoding key) is a **secret** — `wrangler secret put`, never in
  `wrangler.toml`. `GOOGLE_MAPS_KEY` (for Google Maps JS in the browser) is
  a public variable on purpose — it is visible to the client by nature and
  is protected by an HTTP referrer restriction in Google Cloud, not by
  secrecy.

## The tests

`npm test` runs, in order: the Worker's tests (`node --test
"worker/*.test.js"`), the page's tests (`node --test "site/js/*.test.js"`)
and the Python tests for the grid and the CDS tooling. `grid/grid.json` is
checked on every run of the Worker tests: 2,080 cells, all inside the
bounding box, dates as `MM-DD` or `null`. `site/js/stats.parity.test.js`
checks the browser's own calculation against what is recorded in
`grid.json` for **all 2,080 cells** (nulls included) — the one thing that
keeps the page and the grid from drifting apart.

## The path of one request

```
browser (site/js/app.js: fetch)
  → Cloudflare edge (frost.bg)
    → Worker (worker/index.js: fetch())
        │
        ├─ /api/* ?  no  → env.ASSETS.fetch() → a static file from site/
        │
        └─ /api/* ?  yes → route by URL (frost | config | geocode | elevation)
              → key with rev → caches.default.match()
                    ├─ hit  → returns the cached response — done
                    └─ miss → compute (frost.js / geocode.js / elevation.js)
                              → 200 JSON + Cache-Control (max-age/s-maxage)
                              → ctx.waitUntil(caches.default.put(…))
  → the response travels back the same path to the browser
→ site/js/app.js: paintPairs() / renderChart() / renderTable() draw the result
```
