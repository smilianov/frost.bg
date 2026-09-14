# frost.bg

*[In English](README.en.md)*

Сланите по български координати: за дадена точка на картата — типичната
(медиана) и сигурната (90-и/10-и персентил от 30 години) дата на последната
пролетна и първата есенна слана.

Сметката е copy от [Garden Planner](https://github.com/smilianov/GardenPlanner)
(`backend/app/frost_estimate.py`) — виж `grid/frost_estimate.py`.

## Как се пуска локално

```bash
npm install
npm run dev
```

Отваря на [http://localhost:8787](http://localhost:8787).

## Как се тества

```bash
npm test
```

## Спецификация

`docs/superpowers/specs/2026-09-14-frost-bg-design.md`

## Източник на данните

[Open-Meteo](https://open-meteo.com/) Historical Weather API, което сервира
дневни минимуми от реанализа [ERA5](https://www.ecmwf.int/en/forecasts/dataset/ecmwf-reanalysis-v5)
(ECMWF) — мрежа от 9–25 км.
