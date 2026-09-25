# frost.bg

*[На български](README.md)*

Frost dates for Bulgarian coordinates: for a given point on the map — the
typical (median) and safe (90th/10th percentile of 30 years) date of the
last spring and first autumn frost.

The calculation is a copy from Garden Planner (`backend/app/frost_estimate.py`)
— see [`grid/frost_estimate.py`](grid/frost_estimate.py).

Live: <https://frost.bg> (see [`docs/en/operations.md`](docs/en/operations.md),
"Deploy").

## Running locally

```bash
npm install
npm run dev
```

Opens at [http://localhost:8787](http://localhost:8787).

The Google Geocoding key (if ever used) is a secret, not a variable: set it
locally as `GOOGLE_KEY=…` in `.dev.vars`, and in production with
`npx wrangler secret put GOOGLE_KEY` (`wrangler` comes with `npm install` as
a local dependency, not a global command — hence `npx`). Everything works
without it, via Open-Meteo.

## Testing

```bash
npm test
```

## Documentation

| Page | Contents |
|---|---|
| [`docs/en/README.md`](docs/en/README.md) | what frost.bg is, where the data comes from, what "typical"/"safe" mean |
| [`docs/en/api.md`](docs/en/api.md) | API v1 — the four endpoints, parameters, example responses, errors, caching and CORS |
| [`docs/en/architecture.md`](docs/en/architecture.md) | how the project is built: the grid, the Worker, the cache, the page, the environments and the tests |
| [`docs/en/operations.md`](docs/en/operations.md) | how the grid is computed and refreshed, running locally, testing, the cache, what's missing for deploy |
| [The site guide](https://frost.bg/en/guide/) | how to read the dates, the chart and the risk figure — for people, not developers |

Their Bulgarian twins: [`docs/bg/`](docs/bg/README.md) and
[the Bulgarian guide](https://frost.bg/guide/).

Want to propose a change — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Spec

Phase 1 (the grid and API v1):
`docs/superpowers/specs/2026-09-14-frost-bg-design.md`

Phase 2 (the page's year history):
`docs/superpowers/specs/2026-09-23-frost-bg-phase2-design.md`

## Data source

The daily minimum at 2 m from the
[ERA5-Land](https://www.ecmwf.int/en/forecasts/dataset/ecmwf-reanalysis-v5)
reanalysis (ECMWF), downloaded from the
[Copernicus Climate Data Store](https://cds.climate.copernicus.eu/) (the
`derived-era5-land-daily-statistics` dataset, a 0.1° ≈ 9 km grid).
[Open-Meteo](https://open-meteo.com/) stays in the project for two things:
place names (the default geocoder) and the cross-check of the grid.

## The grid

The grid shown on the site (`grid/grid.json`, 2,080 points at 0.1°) is
computed offline, not per request. **Every command below runs from the
repository root.** There are two ways to fill it:

- `grid/fetch_cds.py` + `grid/compute_grid.py --from-cds` — the primary
  path: straight from Copernicus CDS with ERA5-Land (~9 km, and its own
  geopotential for cell elevation);
- `grid/compute_grid.py` — via Open-Meteo, point by point: for probing
  individual points and for the cross-check (see the quota below).

Both tools are grid-maintenance only — neither runs from the Worker or ships
in the production bundle. The grid records where it came from (`source_id`:
`cds`, `openmeteo` or `synthetic`) and the API and the page label the source
from that, not by assumption.

### Via Copernicus CDS

`cdsapi` and `netCDF4` are not project dependencies — they live in a
separate venv:

```bash
python3 -m venv grid/.venv-cds
grid/.venv-cds/bin/pip install -r grid/requirements-cds.txt
```

Requires a free CDS account and accepting the licences of the
[`derived-era5-land-daily-statistics`](https://cds.climate.copernicus.eu/datasets/derived-era5-land-daily-statistics)
and [`reanalysis-era5-land`](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land)
datasets on each dataset's page; the API key goes in `~/.cdsapirc` (per
CDS's own instructions).

```bash
# download: 30 years of daily minimum + geopotential (the CDS queue takes minutes to hours; resumes on interruption)
grid/.venv-cds/bin/python grid/fetch_cds.py --out grid/cds

# compute grid.json from the download, cross-checked against the Open-Meteo probe in grid/cells.jsonl
grid/.venv-cds/bin/python grid/compute_grid.py --from-cds grid/cds --cross-check grid/cells.jsonl
```

Exit code 1 from the cross-check means "stop and review" — which difference,
or why there was nothing to compare, is explained in
[`docs/en/operations.md`](docs/en/operations.md).

Recommended cadence: once a year, in January (once the previous calendar
year is complete in ERA5-Land).

Sea cells have no temperatures: ERA5-Land only covers land, so for cells over
the Black Sea `read_year` returns `None` for every day (about 178 of the
2,080 cells, all along the eastern edge of the bounding box) and the grid
stores them with `null` dates; `read_elevation` still returns a number for
them (the geopotential is defined everywhere). Expected, not a reading bug.

### Via Open-Meteo (no venv, no registration)

```bash
python3 grid/compute_grid.py                  # point by point: ~64 points per hour, ~128 per day from one IP; resumes after interruption
python3 grid/compute_grid.py --synthetic       # a plausible grid without network access, for development
```

The whole grid via Open-Meteo would take about 16 days from one IP — which
is why this path is only for probes and the cross-check, not for the real
grid.

## Licence

The code is under the **MIT** licence — see [`LICENSE`](LICENSE), © 2026
Georgi Smilianov.

The data is not ours to relicense:

- the grid (`grid/grid.json`) is derived from ERA5-Land via the
  [Copernicus Climate Data Store](https://cds.climate.copernicus.eu/) and
  carries the Copernicus attribution already shown in the API and on the
  page — under the [CC-BY licence on Copernicus
  CDS](https://cds.climate.copernicus.eu/licences/cc-by);
- place names come from [Open-Meteo](https://open-meteo.com/en/terms) (or
  Google, when configured — see the [Google Maps Platform
  terms](https://cloud.google.com/maps-platform/terms));
- the point's own elevation comes from Open-Meteo Elevation (Copernicus DEM
  GLO-90 via Open-Meteo, a separate attribution from the geocoder above) —
  see [Open-Meteo Elevation's own
  terms](https://open-meteo.com/en/docs/elevation-api);
- map tiles come from
  [OpenStreetMap](https://www.openstreetmap.org/copyright), under its own
  terms;
- Leaflet is vendored in the project (`site/vendor/leaflet/`) under
  [BSD-2-Clause](site/vendor/leaflet/LICENSE).
