# frost.bg — architecture

*[На български](../bg/architecture.md)*

How the project is built: the grid is computed offline; one deploy carries
both the Worker (the API) and the static files (the site); the cache is
explicit, at the edge; the page is pure modules with a thin DOM layer on
top.

## The grid

`grid/grid.json` — **2,080 cells** at a **0.1°** step over Bulgaria, ~**1.6
MB** of unformatted JSON, computed from the daily minimum at 2 m of
**ERA5-Land** (Copernicus). It is computed **offline**, usually once a year
in January, never per request:

- `grid/fetch_cds.py` downloads from Copernicus CDS **one NetCDF file per
  year** (30 years, plus one geopotential file) — each year is a separate
  request on the CDS queue; the wait varies — the real download in
  September 2026 (`CHANGELOG.md`) took **six days** for the thirty
  requests, so plan the January refresh early;
- `grid/compute_grid.py --from-cds grid/cds` reads the downloaded files and
  computes all 2,080 cells in seconds, through the calculation in
  `grid/frost_estimate.py` (below).

Both scripts are grid-maintenance only: neither runs from the Worker, nor
ships in the production bundle. At runtime the grid is plain JSON — the
Worker imports it directly as a JSON module (`import grid from
"../grid/grid.json" with { type: "json" }`), it is bundled in at
`deploy`/`dev`, and it lives in the isolate's memory for as long as the
isolate is alive; no per-request I/O reads it from disk or network.

## The Worker

One router file, `worker/index.js`: it routes `/api/v1/*` to the four
endpoints and hands everything else to `env.ASSETS.fetch()`. The logic is
split across files:

- `frost.js` — a pure function, coordinates → nearest cell → the response
  body; no I/O;
- `geocode.js` — the two place-search providers: Open-Meteo by default,
  Google only when **both** conditions hold — `GEOCODER = "google"` **and**
  `GOOGLE_KEY` is set; one common response shape either way;
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
(grid.computed) | the effective map | the effective geocoder`. Only a
change to one of those four produces a new key — a deploy that changes
none of them (just code with no version bump, or a grid recomputed for the
**same** date) keeps hitting the old entries until they expire by TTL,
which is why every release bumps `APP_VERSION` (see
[`operations.md`](operations.md)). The `ELEVATION` toggle affects two
different things: `/api/v1/config` reports its value and so carries its own
revision on top — the same four values plus `ELEVATION` (`/frost` and
`/geocode` don't report it and stay on the shared revision); while
`/api/v1/elevation` never even reaches the cache when the toggle is "off"
— the route returns `404` outright, before it checks `caches.default` at
all. For its successful responses, `/api/v1/elevation` has a wholly
separate revision of its own (`APP_VERSION | "openmeteo-elevation"`) — it
depends on neither the map, the geocoder, nor the grid. Errors are never
written to the cache (`Cache-Control: no-store`).

## The page

`site/js/` is split into pure, DOM-free modules and a thin DOM layer on top.
`format.js` formats numbers, dates and URLs; `history.js` decides **what**
is shown; `stats.js` computes the dates behind the cards and the chart. The
actual drawing lives in `chart.js` (`renderChart`/`renderTable` — the chart
and the table, over a pure model `chartModel`/`toCsv` in the same file,
explicitly separated) and in `paint.js` (the two typical/safe date cards at
the top — it writes whatever it is handed, it decides nothing; the
decisions live in `history.js`). `app.js` wires all of this to the real
`document` — it reads the URL, calls the four API endpoints, sets up the
map (`map.js`) — it computes nothing on its own, it only draws the result
of the pure modules.

Only the core of `stats.js` — the median and percentile behind the
typical/safe date — is copied word for word from `grid/frost_estimate.py`;
the window (10/20/30 years), the season length, the risk-after-a-date
figure and the window comparison exist only in `stats.js`, with no Python
counterpart. `site/js/stats.parity.test.js` checks only the typical/safe
dates and the yearly counts, for all 2,080 cells — not the rest of the
file's logic.

## The environments

- **local**: `npm run dev` = `npx wrangler dev` — the real Workers runtime
  on `localhost:8787`, nothing is uploaded to Cloudflare;
- **production**: `npx wrangler deploy`, live at <https://frost.bg>;
- **configuration**: `ELEVATION`, `GEOCODER`, `MAP` are public variables
  under `[vars]` in `wrangler.toml`; `GOOGLE_KEY` (the server-side
  geocoding key) is a **secret** — locally in `.dev.vars`, in production
  via `wrangler secret put`, never in `wrangler.toml`. `GOOGLE_MAPS_KEY`
  (for Google Maps JS in the browser) is a public variable on purpose — it
  is visible to the client by nature and is protected by an HTTP referrer
  restriction in Google Cloud, not by secrecy.

## The tests

`npm test` runs, in order: the Worker's tests (`node --test
"worker/*.test.js"`), the page's tests (`node --test "site/js/*.test.js"`)
and the Python tests for the grid and the CDS tooling. `grid/grid.json` is
checked on every run of the Worker tests: 2,080 cells, all inside the
bounding box, dates as `MM-DD` or `null`. The bridge between the page and
the grid is `site/js/stats.parity.test.js` — see "The page" above for
exactly what it checks.

## The path of a request (`GET /api/v1/frost`)

Static files under `site/` are served directly by Cloudflare on a path
match — `worker/index.js` never runs for them (`wrangler.toml` does not set
`run_worker_first`, and a matching static file wins by default). The Worker
is invoked only for a path with no match — in practice `/api/v1/*`; an
unrecognized path under it (e.g. `/api/v1/foo`) gets a JSON `404` straight
from the router's `default` branch, it does not fall through to the static
files.

```
browser (site/js/app.js: fetch GET /api/v1/frost?lat=&lon=)
  → path has no match among the static files → Cloudflare runs the Worker
    → Worker (worker/index.js: fetch()) → handleFrost()
          → key with rev → caches.default.match()
                ├─ hit  → returns the cached response — done
                └─ miss → frost.js finds the cell, builds the body
                          → 200 JSON + Cache-Control (max-age/s-maxage)
                          → ctx.waitUntil(caches.default.put(…))
  → the response travels back the same path to the browser
→ site/js/app.js: paintPairs() draws the two date cards;
  renderChart()/renderTable() — the chart and table from the years in the response
```

`/config`, `/geocode` and `/elevation` go through the same Worker and the
same cache principle, but feed other parts of the page (the footer, the
search box, the point-elevation line) — not the chart and table.
