# frost.bg

*[На български](README.md)*

Frost dates for Bulgarian coordinates: for a given point on the map — the
typical (median) and safe (90th/10th percentile of 30 years) date of the
last spring and first autumn frost.

The calculation is a copy from Garden Planner (`backend/app/frost_estimate.py`)
— see [`grid/frost_estimate.py`](grid/frost_estimate.py).

## Running locally

```bash
npm install
npm run dev
```

Opens at [http://localhost:8787](http://localhost:8787).

The Google Geocoding key (if ever used) is a secret, not a variable: set it
locally as `GOOGLE_KEY=…` in `.dev.vars`, and in production with
`wrangler secret put GOOGLE_KEY`. Everything works without it, via
Open-Meteo.

## Testing

```bash
npm test
```

## Spec

`docs/superpowers/specs/2026-09-14-frost-bg-design.md`

## Data source

[Open-Meteo](https://open-meteo.com/) Historical Weather API, which serves
daily minimum temperatures from the [ERA5](https://www.ecmwf.int/en/forecasts/dataset/ecmwf-reanalysis-v5)
reanalysis (ECMWF) — a 9–25 km grid.

## The grid

The grid shown on the site (`grid/grid.json`, 2,080 points at 0.1°) is
computed offline, not per request. There are two ways to fill it:

- `grid/compute_grid.py` — via Open-Meteo, point by point (see below);
- `grid/fetch_cds.py` + `grid/compute_grid.py --from-cds` — directly from the
  [Copernicus Climate Data Store](https://cds.climate.copernicus.eu/), using
  ERA5-Land (a finer grid, ~9 km, and its own geopotential for cell elevation
  instead of Open-Meteo's).

Both tools are grid-maintenance only — neither runs from the Worker or ships
in the production bundle.

### Via Copernicus CDS

`cdsapi` and `netCDF4` are not project dependencies — they live in a
separate venv:

```bash
cd grid
python3 -m venv .venv-cds
.venv-cds/bin/pip install -r requirements-cds.txt
```

Requires a free CDS account and accepting the licences of the
[`derived-era5-land-daily-statistics`](https://cds.climate.copernicus.eu/datasets/derived-era5-land-daily-statistics)
and [`reanalysis-era5-land`](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land)
datasets on each dataset's page; the API key goes in `~/.cdsapirc` (per
CDS's own instructions).

```bash
# download: 30 years of daily minimum + geopotential (hours; resumes on interruption)
.venv-cds/bin/python fetch_cds.py --out cds

# compute grid.json from the download, cross-checked against the old Open-Meteo grid
.venv-cds/bin/python compute_grid.py --from-cds grid/cds --cross-check grid/cells.jsonl
```

Recommended cadence: once a year, in January (once the previous calendar
year is complete in ERA5-Land).

### Via Open-Meteo (no venv, no registration)

```bash
python3 grid/compute_grid.py                  # the real run (hours; resumes after interruption)
python3 grid/compute_grid.py --synthetic       # a plausible grid without network access, for development
```
