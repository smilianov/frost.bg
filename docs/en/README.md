# frost.bg — documentation

*[На български](../bg/README.md)*

frost.bg gives, for any point on the map inside Bulgaria, the **last spring
frost** and **first autumn frost** — a typical date and a safe date — from
30 years of archival data, with no guessing and no climate zone lookup. It
also works as a free **API** for other applications (including Garden
Planner).

- [`api.md`](api.md) — the three API endpoints, parameters, example
  responses, error codes, caching and CORS.
- [`operations.md`](operations.md) — how the grid is computed and
  refreshed, how to run and test the project locally, the cache, what is
  still missing for the public deploy.
- [The spec](../superpowers/specs/2026-09-14-frost-bg-design.md) — the full
  design of the project (the decisions behind it, the grid file format,
  what phase 2 has planned).

## Where the data comes from

The daily minimum at 2 m from the
[ERA5-Land](https://www.ecmwf.int/en/forecasts/dataset/ecmwf-reanalysis-v5)
reanalysis (ECMWF), fetched via the
[Copernicus Climate Data Store](https://cds.climate.copernicus.eu/) — a
**0.1°** grid (≈ 9 km), the last **30 full years** counting back from the
previous calendar year (currently 1996–2025; the window shifts by one year
every January). Frost is a day with a minimum ≤ **0 °C**. `grid.json`
(2,080 points over Bulgaria's grid) is computed **in advance**, offline —
see [`operations.md`](operations.md) for how and when. The grid records
its origin (`source_id`) and the page and the API say it as it is: while
the grid in the repo is synthetic, the source reads "sample data", not
ERA5-Land.

Open-Meteo still has two jobs in the project: as the **geocoder** (place
name → coordinates, [`api.md`](api.md)) and as a **cross-check** for the
CDS grid — see [`operations.md`](operations.md).

## "Typical" and "safe" dates

For each of the 30 years, the last frost day before July 1 (spring) and the
first on or after July 1 (autumn) are found. From those 30 dates:

- **typical** — the median;
- **safe** — the 90th percentile in spring / 10th percentile in autumn,
  i.e. the date after which (spring) or before which (autumn) there was
  **no frost in 9 of 10 years**. Deliberately more cautious than typical —
  it means sowing later and harvesting earlier.

Two conventions of the calculation (`grid/frost_estimate.py`), so it can be
reproduced independently:

- **a year with fewer than 300 valid days doesn't count** — missing or
  unreliable days in the archive must not "clear" a year of frost;
- **the median of an even number of dates** is not the mean of the two
  middle ones but **the later one in spring and the earlier one in
  autumn**: here too, rounding goes toward the cautious side.

Fewer than 10 years with a valid frost date in a given direction → `null`
for it. That is not rare in the grid: about **178 of 2,080 cells (8.6%)**
lie over the Black Sea, where ERA5-Land has no temperatures — they are
`null` in both directions; separately, land cells may have fewer than 10
years of frost in one direction.

## The known limitation — valley bottoms

ERA5(-Land) is a **9–25 km** grid. In valley bottoms (flat ground between
hills), the real night-time minimum drops further than the grid can see —
it averages over the whole cell, slopes included. So in valley bottoms
**frost comes out milder than it really is**: real dates may be later in
spring and earlier in autumn. Both the site and the API (`note`,
`cell.elev_m`) say so explicitly — compare the cell's elevation with your
location's. There is no elevation correction (out of scope for phase 1).

## Scope

Bulgaria only, and only the **precomputed** grid. "Outside Bulgaria" means:
the requested point, **rounded to 0.1°**, is not on the grid — i.e. the
rectangle 41.2–44.3° N × 22.3–28.7° E plus a half-step (0.05°) margin
around it (41.16/22.26 rounds to 41.2/22.3 and gets an answer). Beyond
that — a polite refusal, not an approximation from a neighboring cell.
Details on the boundaries and error codes are in [`api.md`](api.md).
