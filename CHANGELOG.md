# Changelog

Двуезичен · bilingual. Форматът следва [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

---

## [0.3.1] — 2026-09-24

### 🇧🇬 Български

- **<https://frost.bg> е адресът** (21 септември 2026): домейнът е активен в
  регистъра и закачен като custom domain на Worker-а; `workers.dev`
  адресът е спрян, след като Garden Planner 0.4.1 мина на `https://frost.bg`.
- **Browser Integrity Check е изключен** — публичното API вече не връща 403
  на клиенти с User-Agent като `Python-urllib` или без такъв.
- **Лимит на заявките към API-то**: 300 за 10 секунди от един IP по
  `/api/*`, над това 429 за 10 секунди — правило в Cloudflare, не код (виж
  `docs/bg/operations.md`).

#### Височината на точката

- **`GET /api/v1/elevation?lat=&lon=`** — височината на самата точка (Open-
  Meteo Elevation, Copernicus DEM GLO-90, ~90 м), отделно от височината на
  клетката, която вече идва от `/frost`: градина в котловина може да седи
  стотици метри под средното на клетката си, а точно затова датите на
  сланата може да подвеждат. Същите правила за вход като `/frost` — „само
  България“ (400 `outside_bulgaria`), закръгляне до 3 знака; кеш седмица.
- **Страницата** дописва реда на клетката с „приблизителна височина около
  точката: ≈ … м“ и кратка бележка, че двете височини идват от различни
  модели и не коригират датите — само след като резултатът за сланата вече
  е показан (никога не го чака) и само при успех (никога 0, никога
  височината на клетката вместо нея; при грешка редът просто липсва).
- **Бюджет и кратък отказ**: свободният план на Open-Meteo е ограничен и е
  за нетърговска употреба; при 429 или 5xx от доставчика адресът спира да
  пита нагоре за 10 минути — пазено на две нива, локално в isolate-а
  (`worker/elevation.js`) и споделено през Cache API за целия център на
  Cloudflare (`worker/index.js`), защото Cloudflare разпределя заявките по
  много isolate-и. Превключвател `ELEVATION` (`on`/`off`) в
  `wrangler.toml`. Подробности в `docs/bg/operations.md`.

### 🇬🇧 English

- **<https://frost.bg> is the address** (21 September 2026): the domain is
  active at the registry and attached to the Worker as a custom domain; the
  `workers.dev` address is switched off now that Garden Planner 0.4.1 uses
  `https://frost.bg`.
- **Browser Integrity Check is off** — the public API no longer returns 403
  to clients with a User-Agent such as `Python-urllib` or none.
- **Request-rate limit on the API**: 300 per 10 seconds per IP on `/api/*`,
  above that 429 for 10 seconds — a Cloudflare rule, not code (see
  `docs/en/operations.md`).

#### The point's elevation

- **`GET /api/v1/elevation?lat=&lon=`** — the elevation of the point itself
  (Open-Meteo Elevation, Copernicus DEM GLO-90, ~90 m), separate from the
  cell's elevation already returned by `/frost`: a garden in a valley
  bottom can sit hundreds of metres below its cell's average, which is
  exactly why the frost dates can mislead. Same input rules as `/frost` —
  Bulgaria only (400 `outside_bulgaria`), rounded to 3 decimals; cached for
  a week.
- **The page** appends the cell line with "approximate elevation near the
  point: ≈ … m" and a short note that the two elevations come from
  different models and don't correct the dates — only after the frost
  result is already shown (never blocking it) and only on success (never
  0, never the cell's elevation instead; on failure the line is simply
  absent).
- **Budget and a short refusal**: Open-Meteo's free tier is limited and for
  non-commercial use; on a 429 or 5xx from the provider the endpoint stops
  asking upstream for 10 minutes — kept at two levels, locally per isolate
  (`worker/elevation.js`) and shared through the Cache API across the whole
  Cloudflare data centre (`worker/index.js`), since Cloudflare spreads
  requests across many isolates. An `ELEVATION` (`on`/`off`) switch in
  `wrangler.toml`. Details in `docs/en/operations.md`.

---

## [0.3.0] — 2026-09-23

### 🇧🇬 Български

#### Историята по години

- **Графика с последните 30 години** под датите: по една точка за
  последната пролетна и първата есенна слана, месеците по оста, таблица със
  същите числа и бутон **„свали CSV“**. Обхватът на годините и скалата на
  датите са постоянни — смяната на периода само откроява избраните години,
  без да пресяга осите.
- **Период 10 / 20 / 30 години** — датите се пресмятат за избрания период
  от същия отговор, без нова заявка. По-къси периоди няма: под 10 години
  със слана „сигурна в 9 от 10 години“ е безсмислица. Прозорецът е в адреса
  на страницата (`?window=10|20|30`, подразбиращо се 30) — пазен при
  презареждане, споделяне и смяна на езика; само на страницата, API-то няма
  такъв параметър.
- **Сравнение „последните 10 срещу всичките 30“** — с колко дни се е
  преместила типичната слана.
- **Сезон без слана** — типична, най-къса и най-дълга дължина, смятани по
  години (не от типичните дати).
- **Риск от пролетна слана след дата** — „в 4 от 30 години е имало слана
  след 20 април и преди 1 юли — 13 %“, с уговорката, че е историческа
  честота, не прогноза. Същото изречение обяснява и сигурната дата.
- API-то не се променя: `/api/v1/frost` връща същото, включително `years`.

### 🇬🇧 English

#### The year history

- **A chart of the last 30 years** under the dates: one point for the last
  spring and the first autumn frost, months along the axis, a table with the
  same numbers and a **"download CSV"** button. The year range and date
  scale stay fixed — changing the period only highlights the chosen years,
  it never rescales the axes.
- **Period 10 / 20 / 30 years** — the dates are recomputed for the chosen
  period from the same response, with no new request. No shorter periods:
  with fewer than ten frost years "safe in 9 years out of 10" is meaningless.
  The period lives in the page's URL (`?window=10|20|30`, defaulting to
  30) — kept across reloads, sharing and language switches; page-only, the
  API has no such parameter.
- **A comparison "the last 10 against all 30"** — by how many days the
  typical frost has moved.
- **Frost-free season** — typical, shortest and longest length, computed per
  year (not from the typical dates).
- **Risk of spring frost after a date** — "in 4 of 30 years there was frost
  after 20 April and before 1 July — 13 %", with the caveat that it is a
  historical frequency, not a forecast. The same sentence explains the safe
  date.
- The API does not change: `/api/v1/frost` returns the same, including
  `years`.

---

## [0.2.1] — 2026-09-20

### 🇧🇬 Български

#### Първият deploy и еднаквите имена

- **frost.bg е на живо** — засега на <https://frost-bg.frost-bg.workers.dev>;
  `frost.bg` се закача, щом регистърът на .bg активира домейна. Runbook-ът
  описва реалния deploy (API token във файл, `npm test && npx wrangler
  deploy`, проверката по Маноле).
- **Списъкът с предложения вече не се крие под картата** — картата е
  отделен stacking context (`isolation: isolate`); при „Марково“ се
  виждаше само варненското.
- **Еднаквите имена се различават.** Резултатите на `/api/v1/geocode`
  носят и общината — ново поле `admin2` (винаги низ, `""` при липса;
  обратно съвместимо). Страницата иска 10 предложения вместо 5 и показва
  „име, област, община“ — „Ново Село“ има поне десет и пловдивското
  (Стамболийски) беше шесто, т.е. невидимо; двете в Кюстендилско бяха
  неразличими.
- Тестовете на страницата (`*.test.js`) не се качват като публични файлове
  (`site/.assetsignore`).

### 🇬🇧 English

#### The first deploy and duplicate names

- **frost.bg is live** — for now at <https://frost-bg.frost-bg.workers.dev>;
  `frost.bg` gets attached once the .bg registry activates the domain. The
  runbook describes the real deploy (API token in a file, `npm test && npx
  wrangler deploy`, the Manole check).
- **The suggestions list no longer hides under the map** — the map is its
  own stacking context (`isolation: isolate`); "Марково" showed only the
  Varna one.
- **Duplicate names are told apart.** `/api/v1/geocode` results now carry
  the municipality — a new `admin2` field (always a string, `""` when
  unknown; backward compatible). The page asks for 10 suggestions instead of
  5 and shows "name, province, municipality" — there are at least ten "Ново
  Село" and the Plovdiv one (Stamboliyski) was sixth, i.e. invisible; the two
  in Kyustendil province were indistinguishable.
- The page's tests (`*.test.js`) are no longer uploaded as public files
  (`site/.assetsignore`).

---

## [0.2.0] — 2026-09-20

### 🇧🇬 Български

#### Истинските данни

- **Мрежата вече е истинска.** 2 080 точки, сметнати от **ERA5-Land през
  Copernicus CDS**, 1996–2025 — по един файл на година (30 заявки, изтеглени
  за шест дни на опашката на CDS) плюс геопотенциала за височината на всяка
  клетка. Синтетичната мрежа си отива заедно с жълтата лента „пробни данни“.
- `source_id` в мрежата е `cds`; API отговорът носи етикетите на
  Copernicus и изискваното посочване; `grid.computed` е 20 септември 2026 —
  с него се сменя и ключът на кеша, така че ръбът тръгва чист.
- **179 клетки нямат дати** (`null`): 178 са над Черно море — ERA5-Land
  покрива само сушата — и една без достатъчно години със слана.
- **Кръстосана проверка** с 64-те клетки, изтеглени по-рано от Open-Meteo
  (южната граница): 24 се разминават с над 10 дни, най-много 31. Причината
  е различният модел на релефа — ERA5 на 25 км срещу ERA5-Land на 9 км: там,
  където височината се различава със стотици метри, датите се местят в
  правилната посока (по-високо → по-късна пролетна и по-ранна есенна слана).
  Пример: (41.2, 23.7) — 994 м по CDS дава 16 април / 30 октомври, 1625 м по
  Open-Meteo дава 9 май / 8 октомври. Точно заради това е избран ERA5-Land.
- Маноле (клетка 42.2, 24.9, 99 м): типична **29 март / 25 ноември**,
  сигурна **11 април / 30 октомври**, 30 години.

### 🇬🇧 English

#### The real data

- **The grid is real now.** 2,080 points computed from **ERA5-Land via the
  Copernicus CDS**, 1996–2025 — one file per year (30 requests, six days in
  the CDS queue) plus the geopotential for each cell's elevation. The
  synthetic grid and its yellow "sample data" banner are gone.
- The grid's `source_id` is `cds`; the API response carries the Copernicus
  labels and the required attribution; `grid.computed` is 20 September 2026,
  which also changes the cache key, so the edge starts clean.
- **179 cells have no dates** (`null`): 178 over the Black Sea — ERA5-Land
  covers land only — and one without enough frost years.
- **Cross-check** against the 64 cells fetched earlier from Open-Meteo (the
  southern border): 24 differ by more than 10 days, at most 31. The cause is
  the terrain model — ERA5 at 25 km versus ERA5-Land at 9 km: where the
  elevations differ by hundreds of metres, the dates move in the right
  direction (higher → later spring frost, earlier autumn frost). Example:
  (41.2, 23.7) — 994 m in CDS gives 16 April / 30 October, 1,625 m in
  Open-Meteo gives 9 May / 8 October. This is exactly why ERA5-Land was
  chosen.
- Manole (cell 42.2, 24.9, 99 m): typical **29 March / 25 November**, safe
  **11 April / 30 October**, 30 years.

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
