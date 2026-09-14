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
  от 30 години, плюс суровите дати по година. Закръглената до 0,1° точка
  извън решетката (правоъгълникът на страната с половин стъпка марж) →
  учтив отказ (`outside_bulgaria`), не приближение от съседна клетка.
- Източникът в отговора (`source`: етикет на два езика, връзка,
  посочване) идва от `source_id` на мрежата — CDS, Open-Meteo или „пробни
  данни“ за синтетичната — не от предположение.
- **`GET /api/v1/geocode?q=&lang=&limit=`** — име на място → координати, с
  Open-Meteo/GeoNames по подразбиране или Google Geocoding с ключ; един и
  същ вид отговор от двата доставчика.
- **`GET /api/v1/config`** — точно тези ключове: `map` и `google_maps_key`
  (картата), `geocoder` (кой доставчик на имена, без ключа), `languages`,
  `grid` (`computed`, `period`, `synthetic`, `source_id`), `version` (на
  API формата) и `app_version` (на приложението) — без нито една тайна да
  излиза от Worker-а.
- Общо за трите: CORS отворен, `X-Content-Type-Options: nosniff`, кеш през
  Cache API на Cloudflare (`s-maxage`: денонощие за `/frost` и `/config`,
  седмица за `/geocode`; браузърът — `max-age` 5 минути) с ревизия в
  ключа на ръба — нова версия, нова мрежа или друга карта/геокодер = нов
  кеш на ръба веднага, в браузърите до 5 минути; старите записи изтичат
  по TTL; грешки на двата езика с единна форма, версия в пътя (`/api/v1/`).
- `/geocode`: най-много `limit` резултата от всеки доставчик; записи без
  име, с координати извън ±90°/±180° или негодни (напр. `address_components`
  не е списък) се пропускат поотделно, без да провалят търсенето; `limit`
  от празни интервали е „липсващо“ (5).

#### Ново: мрежата

- **2 080 точки на 0,1°** над България, сметнати офлайн от `grid/`:
  `compute_grid.py` (през Open-Meteo, с пауза, повторни опити и
  продължаване след прекъсване) и, за истинския пробег без квотите на
  Open-Meteo, `fetch_cds.py` + `compute_grid.py --from-cds` — директно от
  Copernicus CDS (ERA5-Land), с кръстосана проверка срещу Open-Meteo.
  Сметката е копие на `frost_estimate.py` от Garden Planner. Мрежата
  записва произхода си (`source_id`: `cds`, `openmeteo`, `synthetic`).
- Кръстосаната проверка отказва (изходен код 1) файл без header, за друг
  период или без нито една обща клетка — вместо тих „успех“.
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
  the raw per-year dates. The point rounded to 0.1° outside the grid (the
  country's bounding box with a half-step margin) → a polite refusal
  (`outside_bulgaria`), not an approximation from a neighboring cell.
- The source in the response (`source`: a bilingual label, link,
  attribution) comes from the grid's `source_id` — CDS, Open-Meteo or
  "sample data" for the synthetic one — not from an assumption.
- **`GET /api/v1/geocode?q=&lang=&limit=`** — place name → coordinates,
  via Open-Meteo/GeoNames by default or Google Geocoding with a key; one
  response shape from either provider.
- **`GET /api/v1/config`** — exactly these keys: `map` and
  `google_maps_key` (the map), `geocoder` (which place-name provider, no
  key), `languages`, `grid` (`computed`, `period`, `synthetic`,
  `source_id`), `version` (of the API format) and `app_version` (of the
  application) — with no secret ever leaving the Worker.
- Shared across all three: open CORS, `X-Content-Type-Options: nosniff`,
  caching via Cloudflare's Cache API (`s-maxage`: a day for `/frost` and
  `/config`, a week for `/geocode`; the browser — `max-age` 5 minutes)
  with a revision in the edge key — a new version, a new grid or a
  different map/geocoder = a fresh edge cache immediately, browsers within
  5 minutes; old entries expire by TTL; bilingual errors in one shape, a
  version in the path (`/api/v1/`).
- `/geocode`: at most `limit` results from either provider; records without
  a name, with coordinates outside ±90°/±180° or malformed (e.g.
  `address_components` not a list) are dropped individually without failing
  the search; a whitespace-only `limit` counts as missing (5).

#### New: the grid

- **2,080 points at 0.1°** over Bulgaria, computed offline in `grid/`:
  `compute_grid.py` (via Open-Meteo, with pausing, retries, and resume
  after interruption) and, for the real run without Open-Meteo's quotas,
  `fetch_cds.py` + `compute_grid.py --from-cds` — straight from Copernicus
  CDS (ERA5-Land), cross-checked against Open-Meteo. The math is a copy of
  Garden Planner's `frost_estimate.py`. The grid records its origin
  (`source_id`: `cds`, `openmeteo`, `synthetic`).
- The cross-check refuses (exit code 1) a file without a header, for a
  different period, or with no cell in common — instead of a silent
  "success".
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
