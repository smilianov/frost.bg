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
