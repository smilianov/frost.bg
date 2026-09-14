# frost.bg — operations: the grid, running locally, deploy

*[На български](../bg/operations.md)*

## Running locally

```bash
npm install
npm run dev
```

Opens at [http://localhost:8787](http://localhost:8787) — `wrangler dev`
runs the real Workers runtime locally (nothing is uploaded to Cloudflare).
The Google Geocoding/Maps key (if ever used) is a secret, not a variable:
set it locally as `GOOGLE_KEY=…` in `.dev.vars` (in `.gitignore`, never
committed).

## Testing

```bash
npm test
```

Runs, in order: the Worker's tests (`node --test worker/`), the site's
(`node --test site/js/`), the grid's Python tests
(`cd grid && python3 tests_frost.py && python3 tests_grid.py`), and the CDS
tools' tests (`tests_cds.py` — through the `.venv-cds` venv if it exists,
otherwise the system `python3`). `grid/grid.json` is checked on every run of
the Worker tests: 2,080 cells, all inside the bounding box, each with
`typical`/`safe`, dates as `MM-DD` or `null`. The same runs in CI
(`.github/workflows/ci.yml`) on every push and pull request.

## How the grid is computed

`grid/grid.json` (the grid shown on the site, 2,080 points at 0.1°) is
computed **offline**, not per request — see its format and rules in
[the spec](../superpowers/specs/2026-09-14-frost-bg-design.md) (Р1). Two
tools fill it; neither runs from the Worker or ships in the production
bundle.

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
   cd grid
   python3 -m venv .venv-cds
   .venv-cds/bin/pip install -r requirements-cds.txt
   ```

**Download:**

```bash
cd grid
.venv-cds/bin/python fetch_cds.py --out cds
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

**Compute, cross-checked against the earlier Open-Meteo probe:**

```bash
.venv-cds/bin/python compute_grid.py --from-cds cds --cross-check cells.jsonl
```

Reads the NetCDF files and computes all 2,080 points in seconds (unlike the
hours Open-Meteo needs, since there's no per-point request). `--cross-check`
expects `cells.jsonl` from an earlier Open-Meteo run (see below) and, for
every cell present in both, prints the day-difference between the two
sources for `typical`/`safe` (spring and autumn); at the end, a summary
(cells compared, largest difference). A difference over **10 days** for any
cell (or `null` against a value) is a **warning** — the command's exit code
is **1** instead of 0, meaning: stop and review before `git add`/`commit`;
it isn't an automatic CI failure (the cross-check isn't part of `npm test`).

**Cadence:** once a year, in January — once the previous calendar year is
fully available in ERA5-Land.

**Sea cells:** ERA5-Land only covers land — cells over the Black Sea (about
178 of 2,080, along the eastern edge of the bounding box) come out with
`null` dates instead of temperatures; their elevation (the geopotential) is
still present, defined everywhere. Expected, not a bug.

### The helper path: Open-Meteo (probes and cross-check)

```bash
python3 grid/compute_grid.py                  # the real run, point by point
python3 grid/compute_grid.py --synthetic       # a plausible grid without network access, for development
python3 grid/compute_grid.py --finish          # assembles grid.json from the cells.jsonl already on disk
```

Needs no venv, no registration — for probing individual points, or for
filling `cells.jsonl`, which `--cross-check` then compares against the CDS
result. Each point is a separate request to the Open-Meteo archive; a pause
between requests (`--pause`, default 1 s); a 429 or network error → up to 3
attempts per point with increasing backoff. **The quota is tight:**
measured — one hour is good for about 64 points, one day for about 128 (out
of 2,080 total), so a third consecutive 429 stops the whole run immediately
(the quota is clearly exhausted) instead of continuing to hit it; every
computed point is already saved to `grid/cells.jsonl` (in `.gitignore`), so
running the command again later resumes from there instead of
recomputing. `--finish` just assembles `grid.json` from whatever is in
`cells.jsonl`, with no new requests.

## What's still missing for the public deploy

Local work isn't blocked on any of this:

- registering the `frost.bg` domain and its DNS in Cloudflare — an owner
  step;
- `wrangler login` (linking the Cloudflare account) and `wrangler deploy`
  (uploads the Worker and static files; so far it's only run locally with
  `wrangler dev`); a custom domain for `frost.bg` in the Worker's settings;
- the `GOOGLE_KEY` secret in production: `wrangler secret put GOOGLE_KEY`
  (never in `wrangler.toml`);
- the `GEOCODER`, `MAP`, `GOOGLE_MAPS_KEY` variables for the production
  environment (currently only set for local dev, under `[vars]` in
  `wrangler.toml`; without its own `[env.production]`, production would
  use the same ones — review them before the first deploy);
- a request-rate limit on the API — a Cloudflare rule (WAF / rate
  limiting), not code in the Worker;
- deploy from GitHub Actions on merge to `main` — noted for later (phase 2
  in the spec); CI only runs tests so far.
