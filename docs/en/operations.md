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

Runs, in order: the Worker's tests (`node --test "worker/*.test.js"`), the site's
(`node --test "site/js/*.test.js"`), the scripts' tests (`node --test
"scripts/*.test.js"`), the grid's Python tests
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

The commands below are ALTERNATIVES, not consecutive steps. Without `--out`
they work in the `grid/` directory: `--synthetic` replaces `grid/grid.json`
with a sample grid, while `--finish` replaces it with the cells available in
`cells.jsonl`, even when fewer than all 2,080 are there. For a separate
experiment, pass an existing directory with `--out`; the site keeps reading
`grid/grid.json`.

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
lifetime is deliberately short: with a new revision, the next request to the
edge already uses the new key. A browser may use its old copy until its own 5
minutes expire, but **expiry does not send a request by itself** — an open page
loads `/config` again when reloaded.

**The key carries a revision.** The cache survives deploys, so the key
includes, as its first parameter `rev=`, four things:
`application version | grid date (grid.computed) | effective map |
effective geocoder` (URL-encoded; effective = what `/api/v1/config`
reports: `google` only with its key present, otherwise `osm` /
`openmeteo`). Consequences — everywhere below, "a fresh cache" means:
**edge — immediately on a new rev; a browser — on its next request, after its
cached copy expires (up to 5 minutes)**:

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
  not change the key: the edge keeps the old `/config` for up to a day, and
  after its 5 minutes the browser gets that old copy from the edge again —
  the new value reaches people only when the edge expires or you bump the
  version;
- **toggling `ELEVATION` (`on`/`off`) DOES change `/config`'s key** —
  unlike `GOOGLE_MAPS_KEY` above: `/config` (and only `/config`) caches
  under its own revision, `configRev()` in `worker/index.js` — the same
  foursome plus the switch. The change reaches the edge immediately on a
  new deploy (a new rev), and a browser on its next request after its copy
  expires (up to 5 minutes), exactly like a `MAP`/`GEOCODER` change. `/frost` and `/geocode` don't report
  `elevation` and don't depend on it, so their `cacheRev()` stays
  unchanged — only `/config` carries the extra element. `/api/v1/elevation`
  itself carries its **own**, entirely separate `rev` (see the next
  section) — in neither `cacheRev()` nor `configRev()`.

## The point's elevation: budget, a short refusal and the `ELEVATION` switch

`GET /api/v1/elevation?lat=&lon=` asks [Open-Meteo
Elevation](https://open-meteo.com/en/docs/elevation-api) (Copernicus DEM
GLO-90) for the elevation of **the point itself** — separate from the
cell's elevation, which comes from `/frost` (ERA5-Land). Open-Meteo's free
tier is limited — 600 requests per minute, 5,000 per hour, 10,000 per day —
and is for non-commercial use; the zone's rate-limiting rule (above, "The
request-rate limit") protects `frost.bg` from a flood in general, but
doesn't specifically protect this budget upstream to Open-Meteo — so the
endpoint keeps its own, stricter safeguard:

- **A short refusal after a 429 or 5xx from the provider**: 10 minutes,
  during which the endpoint returns `502 elevation_failed` **on a cache miss**,
  without asking Open-Meteo at all. A successful cache entry is checked BEFORE
  the refusal marker, so an already cached point keeps returning 200 — when
  diagnosing, a mix of successful and failing responses is expected, not a sign
  of something else. Kept at **two levels**:
  - `worker/elevation.js` keeps a fast local safeguard — a plain module
    variable (`cooldownUntil`), checked before every request;
  - the route in `worker/index.js` also keeps **its own marker in the
    shared Cache API** (`caches.default`, key
    `…/api/v1/elevation?cooldown=1&rev=…`, `Cache-Control: max-age=600`),
    checked **before** the provider is even reached — before the local
    check above is even called.

  **Why both.** Cloudflare spreads requests across many isolates and swaps
  them freely — the local safeguard by itself only protects the isolate
  that actually received the 429/5xx; a "neighbouring" isolate that
  remembers nothing locally would still ask upstream. The Cache API marker
  fixes exactly that. **Important, so its scope isn't overstated: the
  marker is shared only between the isolates of ONE Cloudflare data
  centre (colo)** — the Cache API isn't global — it doesn't stop requests
  originating at a different data centre elsewhere in the world. This is
  not a global pause of the Worker, but a wider, still per-data-centre,
  safeguard. **And even for that centre — best effort, not a guarantee:**
  the marker is written asynchronously (`ctx.waitUntil`, it doesn't delay
  the response to the client) and the write to the Cache API itself carries
  no guarantee; concurrent requests that land in the exact window before
  the marker becomes visible can slip through and still ask the provider.
  This is coordination that reduces upstream load, not a guaranteed pause
  for the whole data centre.
- **The `ELEVATION` switch** under `[vars]` in `wrangler.toml`: `"on"` by
  default, `"off"` disables the endpoint entirely (returns `404`) and the
  page's row. It is part of `/config`'s `rev` (`configRev()`, see "The key
  carries a revision" above) — flipping it reaches the edge immediately.
  `/api/v1/elevation` itself carries its own, separate `rev` (below) — in
  neither `cacheRev()` nor `configRev()`. **Honest about the browser:** the
  edge stops new requests right away; requests made **after** the
  browser's cached copies of `/config` and `/api/v1/elevation` expire (up
  to 5 minutes, `max-age=300`) see the change. But an already **open**
  page doesn't check this on its own — `/config` is read once, at load,
  and nothing re-checks it afterward — so the page's row stays until the
  page is reloaded (regular or hard); it does not disappear on its own
  after those 5 minutes.
- The endpoint accepts only points in Bulgaria — the same rule as `/frost`
  (`outside_bulgaria` on 400) — there is no way through this API to ask
  the provider about an arbitrary point anywhere in the world.
- Cache on a successful response: `s-maxage=604800` (a week, like
  `/geocode`) — a place's elevation doesn't change; the key carries its own
  revision (`APP_VERSION|openmeteo-elevation`), not the map/geocoder.
- The frost result **never waits** for this endpoint: the page shows the
  frost result immediately, the point's elevation is appended after a
  separate request — on error or a missing value the line is simply
  absent (`site/js/app.js`).

## Map tiles

With `MAP = "osm"` the page loads tiles from OpenStreetMap's public server
(`tile.openstreetmap.org`). It is for **moderate use** under the
[OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
— enough for the launch, but not a guaranteed service. If traffic grows: a
tile provider of your own (e.g. a paid OSM-based one) in `site/js/map.js`,
or `MAP = "google"` with a key. The OpenStreetMap attribution (© linking to
`openstreetmap.org/copyright`, already in `map.js`) stays mandatory with any
OSM-based provider.

## Deploy

Production is a single Worker, `frost-bg`, in the owner's Cloudflare
account. The first deploy was on 20 September 2026 (version 0.2.0, the real
grid); since 21 September the address is <https://frost.bg> (a custom
domain in `wrangler.toml`: `routes = [{ pattern = "frost.bg", custom_domain
= true }]` — the DNS record and the certificate are created on deploy). The
old `frost-bg.frost-bg.workers.dev` is switched off (`workers_dev = false`,
21 September 2026, after Garden Planner 0.4.1 moved to `https://frost.bg`)
— one site, one address.

### Access

Not `wrangler login` but an **API token** — `wrangler` reads it from the
`CLOUDFLARE_API_TOKEN` variable. The token `frost.bg wrangler (laptop)` is
made from the "Edit Cloudflare Workers" template plus `Zone → DNS → Edit`
(the custom domain creates a DNS record), `Zone → Zone → Read` and `Zone →
Zone WAF → Edit` (the rate limiting rule), scoped to the account and the
`frost.bg` zone, no expiry. It lives in `~/.cloudflare/frost.bg.token`
(mode 600) — outside the repo, never in a chat, shell history or
`wrangler.toml`. Revoke it at dash.cloudflare.com → My Profile → API
Tokens.

### How to deploy

Before deploying: Node 24.21.0 and Python 3.12, with
`grid/requirements-cds.txt` installed in the venv, and run the checks as
non-root. Continue only after the CDS tests actually run with zero failures and
`check:links` passes — skipped CDS tests with exit code 0 are not sufficient
(see "A completed run is not the same as a passing run" in `CONTRIBUTING.md`).
The deploy chain starts with a check for `netCDF4`: without it in the venv the
chain stops right there.

```bash
export CLOUDFLARE_API_TOKEN="$(cat ~/.cloudflare/frost.bg.token)"
npx wrangler whoami     # shows the account → the token works
grid/.venv-cds/bin/python -c 'import netCDF4' && npm test && npm run check:links && npx wrangler deploy
```

- All of `site/` is uploaded as static assets except what
  `site/.assetsignore` lists (the `*.test.js` tests; the
  `worker/assets.test.js` test guards the list).
- The `GEOCODER`, `MAP`, `GOOGLE_MAPS_KEY` variables under `[vars]` in
  `wrangler.toml` are the production ones too — reviewed at the first
  deploy: Open-Meteo and OSM, no Google key.
- On the **first** deploy to a new `workers.dev` address the TLS
  certificate takes a minute or two — until then `curl` reports "SSL
  handshake failure"; it is not a Worker error.
- Check after every deploy: `/api/v1/config` (`app_version`,
  `grid.computed`, `source_id`) and
  `/api/v1/frost?lat=42.18425&lon=24.92936` — Manole: typical `03-29` /
  `11-25`, safe `04-11` / `10-30`, 30 years (with the grid of 20 September
  2026).
- If `wrangler` says "fetch failed" while `curl` to `api.cloudflare.com`
  works: something is blocking **`node`** (on the owner's laptop that is
  Little Snitch; `node` must be allowed to reach `api.cloudflare.com`). The
  symptom is a timeout, not a refusal.

### The request-rate limit

A zone-level rate limiting rule (Cloudflare → Security → WAF → Rate
limiting rules; created through the API on 21 September 2026 with the token
— `PUT /zones/{zone}/rulesets/phases/http_ratelimit/entrypoint`): paths
`/api/*`, **300 requests per 10 seconds per IP** (the counter is per IP
*and* per Cloudflare data centre — `ip.src` + `cf.colo.id`; the latter is
mandatory for a rule created through the API), above that **429** for 10
seconds; the page and static files are not counted. Why 300: the page makes
one geocode request per pause in typing (250 ms) plus one frost request —
ten people behind one NAT (an office, a mobile carrier) make 60–70 in 10 s,
so 60 would have blocked them; 300 gives fivefold headroom and still stops
a flood. Tune it on observed traffic and 429s. Verified with 400 parallel
requests: 320 × 200, 80 × 429, 200 again after 12 s. The Free plan allows
one such rule with a 10 s period. It is not code in the Worker — the Worker
never sees the blocked requests.

The rule protects traffic through **`frost.bg`** — the only address since
`workers.dev` was switched off.

The zone's Browser Integrity Check is **off** (21 September 2026): by
default Cloudflare returns 403 (error 1010) to clients with a "bot-like"
User-Agent such as `Python-urllib/3.12` or none at all, and frost.bg is a
public API where such clients are normal. Garden Planner sends
`GardenPlanner/{version}` and passed even before.

## What's still missing

- optional, only if Google geocoding is enabled (`GEOCODER = "google"`):
  the `GOOGLE_KEY` secret in production —
  `npx wrangler secret put GOOGLE_KEY` (never in `wrangler.toml`); without
  it the geocoder stays Open-Meteo;
- deploy from GitHub Actions on merge to `main` — still missing. It was on
  the phase 1 spec's "phase 2" list, but phase 2 itself turned out to be
  the page's year history
  (`docs/superpowers/specs/2026-09-23-frost-bg-phase2-design.md`) and
  explicitly excluded automatic deploy from its scope — it remains an open
  task with no phase attached. CI only runs tests so far.
