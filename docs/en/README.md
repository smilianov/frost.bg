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
  refreshed, how to run and test the project locally, the cache, how it is
  deployed to Cloudflare and what is still missing.
- [The phase 1 spec](../superpowers/specs/2026-09-14-frost-bg-design.md) —
  the design of the grid and of API v1 (the decisions behind it, the grid
  file format); its section on a future phase 2 has been superseded by the
  actual design — see [the phase 2
  spec](../superpowers/specs/2026-09-23-frost-bg-phase2-design.md) for the
  page's year history.

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
its origin (`source_id`) and the page and the API say it as it is: in
production the source is real — ERA5-Land via Copernicus CDS
(`source_id: "cds"`). A synthetic mode (`source_id: "synthetic"`, a
plausible stand-in without network access) exists only for local
development — see [`operations.md`](operations.md).

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

## The year history

Under the two dates, the page also shows up to the last 30 years: a chart
by year, a choice of period **10 / 20 / 30 years** (the typical and safe
dates are recomputed from the same response, with no new request), a
comparison of "the last 10 against all 30", the length of the
**frost-free season** (typical, shortest, longest) and the **risk of
spring frost after a chosen date** — everywhere with the caveat that this
is a historical frequency, not a forecast for that particular year. The
table of yearly numbers can also be downloaded as CSV. The date scale and
the full 30-year range don't change when the period changes — the chosen
period is only highlighted in the chart and the table. The period is kept
in the page's URL (`?window=10|20|30`, defaulting to 30) — **page-only**:
the API returns all the yearly rows it has within the 30-year period —
which can be fewer than 30, or none at all for a sea cell — and the page's
period buttons only choose which of them the numbers are computed from;
the response never depends on `window`.

Three separate states, easy to confuse: a **missing row** in `years`
means the grid didn't accept that year (fewer than 300 valid days) — it
doesn't enter the denominators, and the chart shows an empty spot; `null`
**for a seasonal date** in a row that is present means no frost was
recorded in that half of the year, in the available data — it doesn't
enter that season's quantiles, but it does count as "no event" for the
risk figure; `null` for the **typical/safe** date (at the top of the
page) means fewer than 10 years had frost for that season — "too few
years for a reliable date", not "no frost". February 29 counts as
March 1.

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

## Licence

The code is under the **MIT** licence — see [`LICENSE`](../../LICENSE) at
the repository root, © 2026 Georgi Smilianov.

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
  [BSD-2-Clause](../../site/vendor/leaflet/LICENSE).
