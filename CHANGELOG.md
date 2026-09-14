# Changelog

Двуезичен · bilingual. Форматът следва [Keep a Changelog](https://keepachangelog.com/).

---

## [0.1.0] — 2026-09-14

### 🇧🇬 Български

#### Ново: API v1

- **`GET /api/v1/frost?lat=&lon=`** — за произволна точка в България: най-
  близката клетка от решетката (закръгляне до 0,1°, без търсене),
  височината и разстоянието до нея, типичната (медиана) и сигурната (90-и/
  10-и персентил) двойка дати — последна пролетна, първа есенна слана —
  от 30 години, плюс суровите дати по година. Извън правоъгълника на
  страната → учтив отказ (`outside_bulgaria`), не приближение от съседна
  клетка.
- **`GET /api/v1/geocode?q=&lang=&limit=`** — име на място → координати, с
  Open-Meteo/GeoNames по подразбиране или Google Geocoding с ключ; един и
  същ вид отговор от двата доставчика.
- **`GET /api/v1/config`** — коя карта и кой геокодер е включен, версията
  на API формата и версията на приложението (`app_version`), без нито една
  тайна да излиза от Worker-а.
- Общо за трите: CORS отворен, кеш през Cache API на Cloudflare (денонощие
  за `/frost` и `/config`, седмица за `/geocode`), грешки на двата езика
  с единна форма, версия в пътя (`/api/v1/`).

#### Ново: мрежата

- **2 080 точки на 0,1°** над България, сметнати офлайн от `grid/`:
  `compute_grid.py` (през Open-Meteo, с пауза, повторни опити и
  продължаване след прекъсване) и, за истинския пробег без квотите на
  Open-Meteo, `fetch_cds.py` + `compute_grid.py --from-cds` — директно от
  Copernicus CDS (ERA5-Land), с кръстосана проверка срещу Open-Meteo.
  Сметката е копие на `frost_estimate.py` от Garden Planner.
- Текущият `grid/grid.json` в репото е **синтетичен** (`synthetic: true`)
  — правдоподобни, не истински числа, за да върви разработката без
  дни чакане на мрежа. Истинският пробег от CDS е отделен, следващ commit.

#### Ново: страницата

- Една страница на `/` (български) и `/en/` (английски) — търсене по име,
  клик на карта (Leaflet + OpenStreetMap, или Google Maps с ключ),
  координати и „вземи от телефона“; резултатът се споделя през
  `?lat=&lon=` в адреса.

#### Инфраструктура

- Репо, `wrangler.toml`, GitHub Actions CI (Python и Worker тестове на
  всеки push/PR), GitLab огледало.
- `docs/bg/`, `docs/en/` — какво е frost.bg, API-то, поддръжката на
  мрежата.
- Версията на приложението (`app_version` в `/api/v1/config`) тръгва от
  `0.1.0`.

### 🇬🇧 English

#### New: API v1

- **`GET /api/v1/frost?lat=&lon=`** — for any point in Bulgaria: the
  nearest grid cell (rounded to 0.1°, no search), its elevation and the
  distance to it, the typical (median) and safe (90th/10th percentile)
  date pairs — last spring frost, first autumn frost — from 30 years, plus
  the raw per-year dates. Outside the country's bounding box → a polite
  refusal (`outside_bulgaria`), not an approximation from a neighboring
  cell.
- **`GET /api/v1/geocode?q=&lang=&limit=`** — place name → coordinates,
  via Open-Meteo/GeoNames by default or Google Geocoding with a key; one
  response shape from either provider.
- **`GET /api/v1/config`** — which map and which geocoder are enabled, the
  API format version and the application version (`app_version`), with no
  secret ever leaving the Worker.
- Shared across all three: open CORS, caching via Cloudflare's Cache API
  (a day for `/frost` and `/config`, a week for `/geocode`), bilingual
  errors in one shape, a version in the path (`/api/v1/`).

#### New: the grid

- **2,080 points at 0.1°** over Bulgaria, computed offline in `grid/`:
  `compute_grid.py` (via Open-Meteo, with pausing, retries, and resume
  after interruption) and, for the real run without Open-Meteo's quotas,
  `fetch_cds.py` + `compute_grid.py --from-cds` — straight from Copernicus
  CDS (ERA5-Land), cross-checked against Open-Meteo. The math is a copy of
  Garden Planner's `frost_estimate.py`.
- The `grid/grid.json` currently in the repo is **synthetic**
  (`synthetic: true`) — plausible, not real numbers, so development
  doesn't wait days on a network run. The real CDS run is a separate,
  later commit.

#### New: the page

- One page at `/` (Bulgarian) and `/en/` (English) — search by name, a map
  click (Leaflet + OpenStreetMap, or Google Maps with a key), coordinates,
  and "use my phone's location"; results are shareable via `?lat=&lon=` in
  the address.

#### Infrastructure

- Repo, `wrangler.toml`, GitHub Actions CI (Python and Worker tests on
  every push/PR), a GitLab mirror.
- `docs/bg/`, `docs/en/` — what frost.bg is, the API, maintaining the
  grid.
- The application's own version (`app_version` in `/api/v1/config`) starts
  at `0.1.0`.
