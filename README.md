# frost.bg

*[In English](README.en.md)*

Сланите по български координати: за дадена точка на картата — типичната
(медиана) и сигурната (90-и/10-и персентил от 30 години) дата на последната
пролетна и първата есенна слана.

Сметката е копие от Garden Planner (`backend/app/frost_estimate.py`) — виж
[`grid/frost_estimate.py`](grid/frost_estimate.py).

## Как се пуска локално

```bash
npm install
npm run dev
```

Отваря на [http://localhost:8787](http://localhost:8787).

Ключът за Google Geocoding (ако някога се ползва) е тайна, не променлива:
локално се задава като `GOOGLE_KEY=…` в `.dev.vars`, в продукция — с
`npx wrangler secret put GOOGLE_KEY` (`wrangler` идва с `npm install` като
локална зависимост, не като глобална команда — затова `npx`). Без него
всичко работи с Open-Meteo.

## Как се тества

```bash
npm test
```

## Документация

| Страница | Съдържание |
|---|---|
| [`docs/bg/README.md`](docs/bg/README.md) | какво е frost.bg, откъде са данните, какво значи „типична“/„сигурна“ дата |
| [`docs/bg/api.md`](docs/bg/api.md) | API v1 — трите адреса, параметри, примерни отговори, грешки, кеш и CORS |
| [`docs/bg/operations.md`](docs/bg/operations.md) | как се смята и подновява мрежата, локален пуск, тестове, кешът, какво липсва за deploy |

Английските им близнаци: [`docs/en/`](docs/en/README.md).

## Спецификация

`docs/superpowers/specs/2026-09-14-frost-bg-design.md`

## Източник на данните

Дневният минимум на 2 м от реанализа
[ERA5-Land](https://www.ecmwf.int/en/forecasts/dataset/ecmwf-reanalysis-v5)
(ECMWF), теглен от [Copernicus Climate Data Store](https://cds.climate.copernicus.eu/)
(наборът `derived-era5-land-daily-statistics`, мрежа 0,1° ≈ 9 км).
[Open-Meteo](https://open-meteo.com/) остава в проекта за две неща: имената
на местата (геокодерът по подразбиране) и кръстосаната проверка на мрежата.

## Мрежата

Показваната на сайта мрежа (`grid/grid.json`, 2 080 точки на 0,1°) се смята
офлайн, не при всяка заявка. **Всички команди по-долу се пускат от корена на
репото.** Има два начина да се напълни:

- `grid/fetch_cds.py` + `grid/compute_grid.py --from-cds` — основният път:
  директно от Copernicus CDS с ERA5-Land (~9 км, и собствен геопотенциал за
  височината на клетката);
- `grid/compute_grid.py` — през Open-Meteo, точка по точка: за проби на
  отделни точки и за кръстосаната проверка (виж квотата по-долу).

И двата инструмента са само за поддръжка на мрежата — не се пускат от Worker-а
и не влизат в продукционния bundle. Мрежата записва откъде е (`source_id`:
`cds`, `openmeteo` или `synthetic`) и API-то и страницата етикетират
източника по това, не по предположение.

### През Copernicus CDS

`cdsapi` и `netCDF4` не са зависимости на проекта — живеят в отделна venv:

```bash
python3 -m venv grid/.venv-cds
grid/.venv-cds/bin/pip install -r grid/requirements-cds.txt
```

Иска се безплатна регистрация в CDS и приемане на лицензите на наборите
[`derived-era5-land-daily-statistics`](https://cds.climate.copernicus.eu/datasets/derived-era5-land-daily-statistics)
и [`reanalysis-era5-land`](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land)
от страницата на всеки набор; ключът се записва в `~/.cdsapirc` (по
инструкциите на CDS).

```bash
# теглене: 30 години дневен минимум + геопотенциал (опашката на CDS е минути до часове; продължава при прекъсване)
grid/.venv-cds/bin/python grid/fetch_cds.py --out grid/cds

# смятане на grid.json от изтегленото, със сравнение спрямо Open-Meteo пробата в grid/cells.jsonl
grid/.venv-cds/bin/python grid/compute_grid.py --from-cds grid/cds --cross-check grid/cells.jsonl
```

Изходен код 1 от кръстосаната проверка значи „спри и прегледай“ — коя
разлика, или защо не е имало какво да се сравни, обяснява
[`docs/bg/operations.md`](docs/bg/operations.md).

Препоръчително: веднъж годишно, през януари (когато предната календарна
година вече е пълна в ERA5-Land).

Морските клетки нямат температури: ERA5-Land покрива само сушата, така че
за клетките над Черно море `read_year` връща `None` за всеки ден (около 178
от 2 080 клетки, изцяло по източния ръб на правоъгълника), а мрежата ги
записва с `null` дати; `read_elevation` за тях дава число (геопотенциалът е
дефиниран навсякъде). Очаквано, не грешка в четенето.

### През Open-Meteo (без venv, без регистрация)

```bash
python3 grid/compute_grid.py                  # точка по точка: ~64 точки на час, ~128 на ден от един IP; продължава след прекъсване
python3 grid/compute_grid.py --synthetic       # правдоподобна мрежа без мрежа, за разработка
```

Цялата мрежа през Open-Meteo би отнела около 16 дни от един IP — затова този
път е само за проби и за кръстосаната проверка, не за истинската мрежа.
