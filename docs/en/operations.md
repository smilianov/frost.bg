# frost.bg — operations: the grid, running locally, the cache, deploy

*[На български](../bg/operations.md)*

Every command in this document runs from the **repository root**; grid paths
are `grid/…`.

## Running locally

```bash
npm install
npm run dev
```

Opens at [http://localhost:8787](http://localhost:8787) — `npm run dev` is
`npx wrangler dev`: the real Workers runtime locally (nothing is uploaded to
Cloudflare). `wrangler` comes with `npm install` as a local dependency, not
a global command — hence every `wrangler` command below uses `npx`.

Google has **two different keys**, if it is used at all:

- `GOOGLE_KEY` — a **secret**, server-side only: the Google Geocoding API
  key the Worker uses when `GEOCODER = "google"`. Locally it goes in
  `.dev.vars` as `GOOGLE_KEY=…` (in `.gitignore`, never committed); in
  production, `npx wrangler secret put GOOGLE_KEY`. Never in
  `wrangler.toml`;
- `GOOGLE_MAPS_KEY` — a **public variable** (`[vars]` in `wrangler.toml`):
  the Google Maps JS key that `/api/v1/config` hands to the browser when
  `MAP = "google"`. It is visible by nature — its protection is the HTTP
  referrer restriction to `frost.bg` in Google Cloud, not secrecy.

## Testing

```bash
npm test
```

Runs, in order: the Worker's tests (`node --test worker/`), the site's
(`node --test site/js/`), the grid's Python tests
(`cd grid && python3 tests_frost.py && python3 tests_grid.py`), and the CDS
tools' tests (`tests_cds.py` — through the `grid/.venv-cds` venv if it
exists, otherwise the system `python3`). `grid/grid.json` is checked on
every run of the Worker tests: 2,080 cells, all inside the bounding box,
each with `typical`/`safe`, dates as `MM-DD` or `null`, `source_id` one of
`cds`, `openmeteo`, `synthetic`. The same runs in CI
(`.github/workflows/ci.yml`) on every push and pull request.

## How the grid is computed

`grid/grid.json` (the grid shown on the site, 2,080 points at 0.1°) is
computed **offline**, not per request — see its format and rules in
[the spec](../superpowers/specs/2026-09-14-frost-bg-design.md) (Р1). Two
tools fill it; neither runs from the Worker or ships in the production
bundle. The grid records its origin in `source_id` (`cds`, `openmeteo` or
`synthetic`) — the API and the page label the source, the link and the
attribution from it (see [`api.md`](api.md)).

### The primary path: Copernicus CDS (ERA5-Land)

The grid's source of truth. One download per year for the whole area — no
per-point quota, unlike Open-Meteo (see below for why that matters).

**One-time setup on the owner's machine:**

1. A free [Copernicus CDS](https://cds.climate.copernicus.eu/) account.
2. Accepting the licences of **both** datasets, from each dataset's own
   page — otherwise the download fails with an unaccepted-licence error:
   - [`derived-era5-land-daily-statistics`](https://cds.climate.copernicus.eu/datasets/derived-era5-land-daily-statistics)
     (the daily minimum);
   - [`reanalysis-era5-land`](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land)
     (the geopotential, for cell elevation).
3. The CDS API key in `~/.cdsapirc`, per the instructions on the CDS
   profile page.
4. `cdsapi` and `netCDF4` aren't dependencies of the project itself — they
   live in a separate venv, so they don't weigh down the Worker and the
   site:
   ```bash
   python3 -m venv grid/.venv-cds
   grid/.venv-cds/bin/pip install -r grid/requirements-cds.txt
   ```

**Download:**

```bash
grid/.venv-cds/bin/python grid/fetch_cds.py --out grid/cds
```

30 years of daily minimum plus one request for the geopotential. Each year
is a separate request to CDS, and it queues — per the script's own note:
minutes to hours, depending on CDS load at the time; `--parallel N`
(default 3) downloads up to N years at once, each in its own thread with
its own `cdsapi.Client()` (`--parallel 1` for sequential downloads, if you
prefer). **Resumes after interruption:** already-downloaded files are
skipped, unfinished `.part` files are overwritten — just run the same
command again. The result lands in `grid/cds/` (in `.gitignore` — not
committed; a few MB per file).

**Compute, cross-checked against the Open-Meteo probe:**

```bash
grid/.venv-cds/bin/python grid/compute_grid.py --from-cds grid/cds --cross-check grid/cells.jsonl
```

Reads the NetCDF files and computes all 2,080 points in seconds (unlike the
~16 days the whole grid would take via Open-Meteo, since there's no
per-point request). Writes `grid/grid.json` with `source_id: "cds"`.
`--cross-check` expects `grid/cells.jsonl` from an earlier Open-Meteo run
(see below) and, for every cell present in both, prints the day-difference
between the two sources for `typical`/`safe` (spring and autumn); at the
end, a summary (cells compared, largest difference).

**Exit code 1 from the cross-check** means "stop and review before
`git add`/`commit`" (it isn't an automatic CI failure — the cross-check
isn't part of `npm test`). There are two families of causes, and the log
says which:

- *compared, but with a difference*: over **10 days** for any cell, or
  `null` against a value — "ПРЕДУПРЕЖДЕНИЕ: (lat, lon) над 10 дни" /
  "n/a — липсва стойност";
- *there was nothing to compare* — the check **doesn't count** and must not
  be taken as success: the file's header isn't `{"period": [Y0, Y1]}`
  (empty file, old format) → "няма header … — не се брои"; the header is
  for a **different period** than the grid (e.g. last year's
  `cells.jsonl`) → "кръстосаната проверка е за друг период: … — не се
  брои"; zero cells in common (a header-only file, or cells the grid
  doesn't have) → "кръстосана проверка: 0 клетки — няма какво да се
  сравни".

`grid.json` is written even on exit code 1 — whether it goes into the repo
is your call, after reviewing the log.

**Cadence:** once a year, in January — once the previous calendar year is
fully available in ERA5-Land.

**Sea cells:** ERA5-Land only covers land — cells over the Black Sea (about
178 of 2,080, along the eastern edge of the bounding box) come out with
`null` dates instead of temperatures; their elevation (the geopotential) is
still present, defined everywhere. Expected, not a bug.

### The helper path: Open-Meteo (probes and cross-check)

```bash
python3 grid/compute_grid.py                  # point by point, resumes after interruption
python3 grid/compute_grid.py --synthetic       # a plausible grid without network access, for development
python3 grid/compute_grid.py --finish          # assembles grid.json from the grid/cells.jsonl already on disk
```

Needs no venv, no registration — for probing individual points, or for
filling `grid/cells.jsonl`, which `--cross-check` then compares against the
CDS result. Each point is a separate request to the Open-Meteo archive; a
pause between requests (`--pause`, default 1 s); a 429 or network error →
up to 3 attempts per point with increasing backoff. **The quota is tight:**
measured — about **64 points per hour** and about **128 per day** from one
IP (out of 2,080 total), i.e. the whole grid would take **about 16 days** —
which is why this path is only for probes and the cross-check, not for the
real grid. A third consecutive 429 stops the whole run immediately (the
quota is clearly exhausted) instead of continuing to hit it; every computed
point is already saved to `grid/cells.jsonl` (in `.gitignore`), so running
the command again later resumes from there instead of recomputing.
`--finish` just assembles `grid.json` from whatever is in `cells.jsonl`,
with no new requests; such a grid has `source_id: "openmeteo"`, and
`--synthetic` gives `"synthetic"`.

## The API cache

**Why the Cache API and not just `Cache-Control`.** Cloudflare caches
static files by header, but **not** the responses a Worker generates
itself — `Cache-Control: public, max-age=…` on those only reaches the
browser. So `worker/index.js` caches explicitly through the Cache API
(`caches.default`): on a request, first `match` by a normalized key; on a
miss, compute and `put` a copy of the response. Errors (`no-store`) are
never written.

**Two lifetimes in one header.** `Cache-Control: public, max-age=300,
s-maxage=86400` (`/frost`, `/config`) and `…, s-maxage=604800`
(`/geocode`): `s-maxage` is for the edge (the Cache API honours it) — a
day, respectively a week; `max-age` is for the browser — **5 minutes**.
The browser knows nothing about the revision in the key below, so its
lifetime is deliberately short: after a configuration or grid change the
edge is fresh immediately, and browsers revalidate within 5 minutes.

**The key carries a revision.** The cache survives deploys, so the key
includes, as its first parameter `rev=`, four things:
`application version | grid date (grid.computed) | effective map |
effective geocoder` (URL-encoded; effective = what `/api/v1/config`
reports: `google` only with its key present, otherwise `osm` /
`openmeteo`). Consequences — everywhere below, "a fresh cache" means:
**edge — immediately on a new rev; browsers — within 5 minutes**:

- a deploy with a **new version** (`APP_VERSION` in `worker/index.js`,
  `package.json`, the changelog) = a fresh cache;
- a **new grid** (`grid.computed` is a different date) = a fresh cache;
  `computed` is date-only — **a new grid on the same day → bump
  `APP_VERSION`**, otherwise the edge keeps the old one until it expires;
- **changing `MAP` or `GEOCODER`** (or adding a key that was missing, which
  changes the effective provider) = a fresh cache;
- **old entries are not deleted** — they expire on their own by TTL (a week
  at most, for `/geocode`); nothing needs manual purging;
- a deploy that changes none of the four (e.g. code only, no new version)
  keeps hitting the old entries until TTL — which is why every release bumps
  the version;
- rotating `GOOGLE_MAPS_KEY` itself with `MAP = "google"` unchanged does
  not change the key: the edge keeps the old `/config` for up to a day
  (bump the version to replace it), browsers for up to 5 minutes.

## Map tiles

With `MAP = "osm"` the page loads tiles from OpenStreetMap's public server
(`tile.openstreetmap.org`). It is for **moderate use** under the
[OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
— enough for the launch, but not a guaranteed service. If traffic grows: a
tile provider of your own (e.g. a paid OSM-based one) in `site/js/map.js`,
or `MAP = "google"` with a key. The OpenStreetMap attribution (© linking to
`openstreetmap.org/copyright`, already in `map.js`) stays mandatory with any
OSM-based provider.

## What's still missing for the public deploy

Local work isn't blocked on any of this:

- **the real grid from CDS** in place of the synthetic one in the repo: the
  download and compute above, **the cross-check with exit code 0** (cells
  actually compared, same period, no difference over 10 days — or one that
  was reviewed and explained), `synthetic: false` and `source_id: "cds"` in
  `grid/grid.json`, `npm test` green; then **a new deploy** — the grid
  date is in the edge key, so the edge is fresh immediately on the new rev
  and browsers within 5 minutes (see "The API cache"); nothing is purged by
  hand. **A new grid on the same day → bump `APP_VERSION`**, otherwise the
  edge keeps the old one until it expires;
- registering the `frost.bg` domain and its DNS in Cloudflare — an owner
  step;
- `npx wrangler login` (linking the Cloudflare account) and
  `npx wrangler deploy` (uploads the Worker and static files; so far it's
  only run locally with `npm run dev`); a custom domain for `frost.bg` in
  the Worker's settings;
- optional, only if Google geocoding is enabled (`GEOCODER = "google"`):
  the `GOOGLE_KEY` secret in production —
  `npx wrangler secret put GOOGLE_KEY` (never in `wrangler.toml`); without
  it the geocoder stays Open-Meteo;
- the `GEOCODER`, `MAP`, `GOOGLE_MAPS_KEY` variables for the production
  environment (currently only set for local dev, under `[vars]` in
  `wrangler.toml`; without its own `[env.production]`, production would
  use the same ones — review them before the first deploy;
  `GOOGLE_MAPS_KEY`, if any, with an HTTP referrer restriction to
  `frost.bg` in Google Cloud);
- a request-rate limit on the API — a Cloudflare rule (WAF / rate
  limiting), not code in the Worker;
- deploy from GitHub Actions on merge to `main` — noted for later (phase 2
  in the spec); CI only runs tests so far.
