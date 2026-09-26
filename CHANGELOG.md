# Changelog

Двуезичен · bilingual. Форматът следва [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

---

## [0.3.4] — 2026-09-26

### 🇧🇬 Български

- **Предупреждение, когато точката е далеч от височината на клетката.** Щом
  точката е поне 50 м по-високо от средната височина на клетката, страницата
  казва, че там сланата идва по-късно напролет и по-рано наесен от
  показаните дати. Щом е поне 50 м по-ниско — да не се разчита на по-ранни
  дати, защото нощем студеният въздух се стича в ниското. Разликата се
  закръгля до 10 м; дни не се дават нарочно.
- **Защо без дни:** изчислено от 30-те години дневни минимуми за Маноле,
  53 м над клетката местят сигурната пролетна дата със седмица — но почти
  цялата поправка идва от това колко бързо пада нощният минимум с
  височината, а това е най-несигурното число. Посоката е сигурна, големината
  не е.
- Датите на клетката **не се променят** — решетката и `/api/v1/frost` са
  същите. Разделът „Двете височини“ в ръководството обяснява предупреждението
  на двата езика.

### 🇬🇧 English

- **A warning when the point is far from the cell's elevation.** When the
  point is at least 50 m above the cell's average elevation, the page says
  frost there comes later in spring and earlier in autumn than the dates
  shown. When it is at least 50 m below, it warns not to count on earlier
  dates, because cold air settles in low ground at night. The difference is
  rounded to 10 m; no days are given, on purpose.
- **Why no days:** computed from 30 years of Manole's daily minima, 53 m
  above the cell moves the safe spring date by a week — but nearly all of
  that correction comes from how fast the night-time minimum falls with
  height, which is the most uncertain number. The direction is certain; the
  size is not.
- The cell's dates **do not change** — the grid and `/api/v1/frost` are the
  same. The guide's "The two elevations" section explains the warning in
  both languages.

---

## [0.3.3] — 2026-09-25

### 🇧🇬 Български

#### Ръководството и документацията след читателски преглед

- **Съветът за сеитба вече не омекотява предупреждението.** „Една седмица
  по-късна сеитба“ звучеше като достатъчно отместване, а за Маноле разликата
  между типичната и сигурната пролетна дата е **13 дни**; текстът казва и че
  тази дата не обещава, че слана повече няма да има. Числото се смята от
  мрежата в `site/js/guide.test.js`, не се преписва.
- **Сезонът без слана следва избрания период.** Ръководството го описваше
  като неизменно сметнат от 30 години, а той се смята от годините с данни в
  избрания период (10, 20 или 30). Добавено е и как се брои дължината, когато
  за годината липсва пролетна или есенна дата, и че календарът е 365-дневен.
- **Персентилът не е обещание за 9 от 10 години.** В `docs/{bg,en}/README.md`
  сигурната дата вече се описва като „в поне 90% от включените години със
  записана слана за този сезон“ — две отделни исторически граници, и всеки
  сезон ползва наличните си дати, които може да са по-малко от приетите години.
- **Една височина за едно място.** Примерът за `/api/v1/elevation` в
  `api.md` ползваше координатите на Маноле с `350` м, докато ръководството
  казва ≈ 152 м. Числото е поправено на **152**, а нов тест чете височината от
  ръководството и иска същата в двата `api.md`.
- **Командите за мрежата са алтернативи, не стъпки.** `--synthetic` и
  `--finish` презаписват `grid/grid.json`, който сайтът чете; блоковете в
  README-тата и в `operations.md` вече го казват, заедно с `--out` за отделна
  проба.
- **Deploy-ът проверява това, което обещава.** Командата започва с
  `import netCDF4` във venv-а (пропуснати CDS тестове с изход 0 вече не минават
  за зелено) и включва `npm run check:links`.
- **Open-Meteo има три роли, не две** — липсваше височината на самата избрана
  точка, зависимост по време на работа със свой бюджет и свои откази.
- **Още поправени твърдения:** „всеки януари помества с една година“ (периодът
  се избира при ръчното преизчисляване); изтичането на браузърния кеш не е
  автоматична повторна проверка; десетминутният отказ на `/elevation` не значи
  502 за всяка заявка (успешният кеш се проверява преди маркера); 405 важи за
  всеки `/api/*` път, защото проверката на метода предхожда маршрутизирането;
  `elevation_m` разделя `null`, `0` и отрицателна стойност; таймаутът за
  височината е 8 секунди; `years_used` вече е определен; `grid.json` СЕ
  преизчислява след промяна в статистиката — забранено е ръчното редактиране на
  числата; и пътят от одобрен PR до публикуван main е описан, с препратка към
  `AGENTS.md` за самите команди.

### 🇬🇧 English

#### The guide and the documentation after a reader-level review

- **The sowing tip no longer softens its own warning.** "Sowing a week later"
  read like a sufficient offset, while for Manole the gap between the typical
  and the safe spring date is **13 days**; the text now also says this date does
  not promise that frost is over. The number is computed from the grid in
  `site/js/guide.test.js`, not copied by hand.
- **The frost-free season follows the selected period.** The guide described it
  as always computed from 30 years; it is computed from the years with data in
  the selected period (10, 20 or 30). It now also explains how the length is
  counted when a year's spring or autumn date is missing, and that the calendar
  has 365 days.
- **The percentile is not a promise of 9 in 10 years.** In
  `docs/{bg,en}/README.md` the safe date is now "at least 90% of the included
  years with recorded frost for that season" — two separate historical
  boundaries, and each season uses its available dates, which may be fewer than
  the accepted years.
- **One elevation per place.** The `/api/v1/elevation` example in `api.md` used
  Manole's coordinates with `350` m while the guide says ≈ 152 m. The number is
  now **152**, and a new test reads the elevation from the guide and requires
  the same in both `api.md` files.
- **The grid commands are alternatives, not steps.** `--synthetic` and
  `--finish` overwrite `grid/grid.json`, which the site reads; the blocks in the
  READMEs and in `operations.md` now say so, together with `--out` for a
  separate experiment.
- **The deploy checks what it promises.** The command starts with
  `import netCDF4` in the venv (skipped CDS tests with exit code 0 no longer
  pass for green) and includes `npm run check:links`.
- **Open-Meteo has three roles, not two** — the elevation of the selected point
  itself was missing, a runtime dependency with its own budget and failures.
- **Other corrected statements:** "shifts by one year every January" (the period
  is chosen during the manual recomputation); browser cache expiry is not an
  automatic re-check; the ten-minute refusal on `/elevation` does not mean a 502
  for every request (a successful cache entry is checked before the marker); 405
  applies to any `/api/*` path because the method check precedes routing;
  `elevation_m` separates `null`, `0` and a negative value; the elevation
  timeout is eight seconds; `years_used` is now defined; `grid.json` IS
  regenerated after a change in the statistics — what is forbidden is editing
  its numbers by hand; and the path from an approved PR to a published main is
  described, pointing to `AGENTS.md` for the commands themselves.

---

## [0.3.2] — 2026-09-25

### 🇧🇬 Български

#### Ръководство на сайта

- **`/guide` и `/en/guide`** — осем кратки раздела: двете двойки дати,
  графиката, периодите 10/20/30 години, рискът след дата, сезонът без
  слана, двете височини, откъде са числата, защо не съвпада с
  наблюденията. Статични страници, без JavaScript; връзка от футъра на
  двете начални страници (и обратно), двуезично.
- **Контрастът на футъра — навсякъде, не само на новите страници.** Общото
  правило `.foot { opacity: 0.75 }` композираше и връзките в него: за
  `--accent` върху `--paper` това мереше ≈3.04:1 на светла тема, под
  изискваните 4.5:1 за нормален текст. Премахнато изцяло от споделеното
  правило — важи и за двете начални страници, не само за ръководството:
  връзките вече носят чистия `--accent`, ≈4.80:1 на светла тема, ≈8.40:1
  на тъмна.

#### За разработчици

- **`docs/bg/architecture.md`, `docs/en/architecture.md`** — как е
  устроен проектът: мрежата, Worker-ът, кешът, страницата, средите,
  тестовете и пътят на една заявка `GET /api/v1/frost`.
- **`CONTRIBUTING.md`** — локален пуск, тестове, правилото за промените,
  прегледите, езиковите правила, мрежата не се редактира на ръка, нови
  зависимости в Worker-а не се приемат.
- **Проверка на връзките в CI** (`npm run check:links`,
  `scripts/check_links.mjs`) — минава през README-тата, `CONTRIBUTING.md`,
  `docs/**/*.md` и `site/**/*.html`. Разпознава Markdown връзките и
  кавичните `href`/`src` и проверява дали пътят им съществува
  (относителните — спрямо файла, адресите с „/“ — спрямо `site/`, след
  нормализиране на `.`/`..`); пропуска `/api/*` (маршрут на Worker-а, не
  файл) и външните връзки (без мрежа в CI). По правило връзка ИЗВЪН ограден
  блок или се проверява, или излиза като проблем с файл и ред, и проверката
  пада — пример, който не бива да се проверява, влиза в ограден блок. Това
  НЕ е гаранция: проверката е евристика, не parser — при
  преплетени огради и HTML коментари файлът пада шумно (разминаването между
  двата анализа на оградите е диагностика), но една връзка в него може да
  остане непроверена, а чист ограден блок не е достатъчен, ако съседният
  съдържа парче от HTML коментар. Приетите граници: reference-style връзките
  (`[текст][ref]`) не се разпознават и не дават диагностика; заглавие в
  кавички с квадратна скоба вътре е „Неразпознато“ (в кръгли скоби — не);
  „#котва“ не се проверява, само целевият файл; измерени тихи случаи, които
  остават описани, а не поправени — адрес, завършващ с точков сегмент върху
  файл, и привидни оградни редове вътре в HTML блок. Адрес в `<…>` се
  поддържа,
  включително с интервали и скоби; външни са адресите с URI схема и
  protocol-relative адресите (`//example.com/…`).

### 🇬🇧 English

#### Site guide

- **`/guide` and `/en/guide`** — eight short sections: the two pairs of
  dates, the chart, the 10/20/30-year periods, the risk after a date, the
  frost-free season, the two elevations, where the numbers come from, why
  it doesn't match what you see. Static pages, no JavaScript; linked from
  both home pages' footers (and back), bilingual.
- **Footer contrast — sitewide, not just on the new pages.** The shared
  `.foot { opacity: 0.75 }` rule composited the links in it too: for
  `--accent` over `--paper` that measured ≈3.04:1 in the light theme,
  below the 4.5:1 required for normal text. Removed entirely from the
  shared rule — it applies to both home pages too, not just the guide:
  the links now carry the plain `--accent`, ≈4.80:1 in the light theme,
  ≈8.40:1 in dark.

#### For contributors

- **`docs/bg/architecture.md`, `docs/en/architecture.md`** — how the
  project is put together: the grid, the Worker, the cache, the page, the
  environments, the tests, and the path of one `GET /api/v1/frost`
  request.
- **`CONTRIBUTING.md`** — running locally, tests, the rule for changes,
  reviews, language rules, the grid is not hand-edited, new dependencies
  in the Worker are not accepted.
- **Link checker in CI** (`npm run check:links`,
  `scripts/check_links.mjs`) — walks the READMEs, `CONTRIBUTING.md`,
  `docs/**/*.md` and `site/**/*.html`. It recognizes Markdown links and
  quoted `href`/`src` and checks whether their path exists (relative ones
  against the file, `/`-prefixed ones against `site/`, after normalizing
  `.`/`..`); skips `/api/*` (a Worker route, not a file) and external links
  (no network in CI). As a rule, a link OUTSIDE a fenced block is either
  checked or comes out as a problem with file and line, and the check fails —
  an example that must not be checked goes in a fenced block. This is NOT a
  guarantee: the check is a heuristic, not a parser —
  with interleaved fences and HTML comments the file fails noisily (a
  disagreement between the two fence analyses is itself a diagnostic), but
  one link in it may go unchecked, and a clean fenced block is not enough if
  a neighbouring one holds a piece of an HTML comment. The accepted
  boundaries: reference-style links (`[text][ref]`) are neither recognized
  nor reported; a quoted title with a square bracket in it is „Неразпознато“
  (one in parentheses is not); a "#fragment" is not checked, only the target
  file; and the measured silent cases that stay described rather than fixed —
  an address ending in a dot segment on top of a file, and fence-looking
  lines inside an HTML block. An address in `<…>` is supported, spaces and parentheses included;
  external are addresses with a URI scheme and protocol-relative ones
  (`//example.com/…`).

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
