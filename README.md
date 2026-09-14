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
