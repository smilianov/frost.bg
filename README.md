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
`wrangler secret put GOOGLE_KEY`. Без него всичко работи с Open-Meteo.

## Как се тества

```bash
npm test
```

## Спецификация

`docs/superpowers/specs/2026-09-14-frost-bg-design.md`

## Източник на данните

[Open-Meteo](https://open-meteo.com/) Historical Weather API, чрез който се
получават дневните минимални температури от реанализа
[ERA5](https://www.ecmwf.int/en/forecasts/dataset/ecmwf-reanalysis-v5)
(ECMWF) — мрежа от 9–25 км.

## Мрежата

Показваната на сайта мрежа (`grid/grid.json`, 2 080 точки на 0,1°) се смята
офлайн, не при всяка заявка. Има два начина да се напълни:

- `grid/compute_grid.py` — през Open-Meteo, точка по точка (виж по-долу);
- `grid/fetch_cds.py` + `grid/compute_grid.py --from-cds` — директно от
  [Copernicus Climate Data Store](https://cds.climate.copernicus.eu/), с
  ERA5-Land (по-фина мрежа, ~9 км, и собствен геопотенциал за височината на
  клетката вместо тази на Open-Meteo).

И двата инструмента са само за поддръжка на мрежата — не се пускат от Worker-а
и не влизат в продукционния bundle.

### През Copernicus CDS

`cdsapi` и `netCDF4` не са зависимости на проекта — живеят в отделна venv:

```bash
cd grid
python3 -m venv .venv-cds
.venv-cds/bin/pip install -r requirements-cds.txt
```

Иска се безплатна регистрация в CDS и приемане на лицензите на наборите
[`derived-era5-land-daily-statistics`](https://cds.climate.copernicus.eu/datasets/derived-era5-land-daily-statistics)
и [`reanalysis-era5-land`](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land)
от страницата на всеки набор; ключът се записва в `~/.cdsapirc` (по
инструкциите на CDS).

```bash
# теглене: 30 години дневен минимум + геопотенциал (часове; продължава при прекъсване)
.venv-cds/bin/python fetch_cds.py --out cds

# смятане на grid.json от изтегленото (пътищата са относителни към grid/, след cd grid по-горе),
# със сравнение спрямо старата Open-Meteo мрежа
.venv-cds/bin/python compute_grid.py --from-cds cds --cross-check cells.jsonl
```

Препоръчително: веднъж годишно, през януари (когато предната календарна
година вече е пълна в ERA5-Land).

Морските клетки нямат температури: ERA5-Land покрива само сушата, така че
за клетките над Черно море `read_year` връща `None` за всеки ден (около 178
от 2 080 клетки, изцяло по източния ръб на правоъгълника), а мрежата ги
записва с `null` дати; `read_elevation` за тях дава число (геопотенциалът е
дефиниран навсякъде). Очаквано, не грешка в четенето.

### През Open-Meteo (без venv, без регистрация)

```bash
python3 grid/compute_grid.py                  # истинският пробег (часове; продължава след прекъсване)
python3 grid/compute_grid.py --synthetic       # правдоподобна мрежа без мрежа, за разработка
```
