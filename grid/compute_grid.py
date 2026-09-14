"""Мрежата за frost.bg: 2 080 точки на 0,1° върху България → grid.json.

    python3 compute_grid.py                  # истинският пробег (часове; продължава след прекъсване)
    python3 compute_grid.py --synthetic      # правдоподобна мрежа без мрежа, за разработка
    python3 compute_grid.py --finish         # сглобява grid.json от cells.jsonl, каквото има

Всяка сметната точка се записва веднага в cells.jsonl; при ново пускане
готовите се прескачат. Open-Meteo има дневни лимити — --pause (s) между
заявките; 429/мрежова грешка → до 3 опита с нарастващо изчакване.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple

import frost_estimate as fe

LAT_MIN, LAT_MAX = 41.2, 44.3
LON_MIN, LON_MAX = 22.3, 28.7
STEP = 0.1
ATTEMPTS = 3
SOURCE = "ERA5 през Open-Meteo, дневен минимум на 2 м"


def lattice() -> List[Tuple[float, float]]:
    """Точките по ред: ширина отвън, дължина отвътре; закръглени до 0,1."""
    n_lat = int(round((LAT_MAX - LAT_MIN) / STEP)) + 1
    n_lon = int(round((LON_MAX - LON_MIN) / STEP)) + 1
    return [(round(LAT_MIN + i * STEP, 1), round(LON_MIN + j * STEP, 1))
            for i in range(n_lat) for j in range(n_lon)]


def _mmdd(d: Optional[date]) -> Optional[str]:
    return None if d is None else f"{d.month:02d}-{d.day:02d}"


def cell_record(lat: float, lon: float, tmin: fe.DailyTmin,
                start_year: int, end_year: int) -> dict:
    est = fe.estimate_frost(tmin.days, year=2001)      # невисокосна: датите са само (месец, ден)
    per_year = fe._per_year(tmin.days, fe.FROST_THRESHOLD_C)
    years = [[y, _mmdd(fe._to_date(s, 2001) if s else None), _mmdd(fe._to_date(a, 2001) if a else None)]
             for y, (s, a) in sorted(per_year.items()) if start_year <= y <= end_year]
    return {
        "lat": lat, "lon": lon, "elev": tmin.grid_elevation_m,
        "typical": [_mmdd(est.typical_last), _mmdd(est.typical_first)],
        "safe": [_mmdd(est.safe_last), _mmdd(est.safe_first)],
        "years_used": est.years_used,
        "years_with_spring": est.years_with_spring,
        "years_with_autumn": est.years_with_autumn,
        "years": years,
    }


def build_grid(cells: List[dict], start_year: int, end_year: int, synthetic: bool = False) -> dict:
    return {
        "version": 1,
        "computed": date.today().isoformat(),
        "synthetic": synthetic,
        "period": {"start": start_year, "end": end_year},
        "threshold_c": fe.FROST_THRESHOLD_C,
        "step_deg": STEP,
        "bbox": {"lat": [LAT_MIN, LAT_MAX], "lon": [LON_MIN, LON_MAX]},
        "source": SOURCE,
        "cells": cells,
    }


def synthetic_tmin(lat: float, lon: float, start_year: int, end_year: int) -> fe.DailyTmin:
    """Правдоподобни дни без мрежа: по на север и по-високо — по-късна пролет,
    по-ранна есен; детерминистично по координатите, с малко „разсейване“ по години."""
    elev = int(200 + 900 * max(0.0, math.sin((lon - 22.3) * 1.3)) * max(0.0, 1 - abs(lat - 42.7)))
    base_spring = 85 + int((lat - 41.2) * 12) + elev // 40          # ден от годината
    base_autumn = 305 - int((lat - 41.2) * 10) - elev // 40
    days: List[fe.Day] = []
    for y in range(start_year, end_year + 1):
        wobble = ((y * 7 + int(lat * 10) + int(lon * 10)) % 11) - 5   # −5..+5 дни
        spring_doy, autumn_doy = base_spring + wobble, base_autumn - wobble
        d = date(y, 1, 1)
        while d.year == y:
            doy = d.timetuple().tm_yday
            t = 10.0
            if doy <= spring_doy and doy >= spring_doy - 2:
                t = -1.0
            if doy >= autumn_doy and doy <= autumn_doy + 2:
                t = -1.0
            if doy < 40 or doy > 340:
                t = -3.0
            days.append((d, t))
            d += timedelta(days=1)
    return fe.DailyTmin(days=days, grid_elevation_m=elev)


def _load_done(path: str) -> Dict[Tuple[float, float], dict]:
    done = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    rec = json.loads(line)
                    done[(rec["lat"], rec["lon"])] = rec
    return done


def _fetch_with_retries(lat: float, lon: float, start: date, end: date, pause: float, log):
    for attempt in range(1, ATTEMPTS + 1):
        try:
            return fe.fetch_daily_tmin(lat, lon, start, end)
        except fe.FrostFetchError as e:
            log(f"  ({lat}, {lon}) опит {attempt}/{ATTEMPTS} падна: {e}")
            if attempt < ATTEMPTS:
                time.sleep(pause * attempt)
    return None


def main(argv: Optional[List[str]] = None, stdout=None) -> int:
    out = stdout or sys.stdout
    log = lambda s: print(s, file=out)            # noqa: E731
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", default=os.path.dirname(os.path.abspath(__file__)))
    p.add_argument("--pause", type=float, default=1.0)
    p.add_argument("--limit", type=int, default=None, help="най-много толкова нови точки (за тест)")
    p.add_argument("--today", default=None, help="YYYY-MM-DD, за периода (по подразбиране днес)")
    p.add_argument("--synthetic", action="store_true")
    p.add_argument("--finish", action="store_true", help="само сглоби grid.json от cells.jsonl")
    a = p.parse_args(argv)

    today = date.fromisoformat(a.today) if a.today else date.today()
    start, end = fe.period(today)
    cells_path = os.path.join(a.out, "cells.jsonl")
    grid_path = os.path.join(a.out, "grid.json")
    points = lattice()

    if a.synthetic:
        cells = [cell_record(lat, lon, synthetic_tmin(lat, lon, start.year, end.year), start.year, end.year)
                 for lat, lon in points]
        _write_grid(grid_path, build_grid(cells, start.year, end.year, synthetic=True), log)
        return 0

    done = _load_done(cells_path)
    if not a.finish:
        skipped, new = [], 0
        with open(cells_path, "a", encoding="utf-8") as f:
            for lat, lon in points:
                if (lat, lon) in done:
                    continue
                if a.limit is not None and len(done) + len(skipped) >= a.limit:
                    break
                tmin = _fetch_with_retries(lat, lon, start, end, a.pause, log)
                if tmin is None:
                    skipped.append((lat, lon))
                    continue
                rec = cell_record(lat, lon, tmin, start.year, end.year)
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                f.flush()
                done[(lat, lon)] = rec
                new += 1
                if a.pause:
                    time.sleep(a.pause)
        log(f"готови: {len(done)} / {len(points)}, нови този път: {new}, пропуснати: {len(skipped)}")
        if skipped:
            log("пропуснати точки (пусни пак, за да ги довърши): " + ", ".join(f"({x}, {y})" for x, y in skipped))
            return 1
        if len(done) < len(points):
            log("още не са всички — пусни пак (или --finish, за да сглобиш каквото има)")
            return 0

    cells = [done[pt] for pt in points if pt in done]
    _write_grid(grid_path, build_grid(cells, start.year, end.year), log)
    return 0


def _write_grid(path: str, grid: dict, log) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(grid, f, ensure_ascii=False, separators=(",", ":"))
    nulls = sum(1 for c in grid["cells"] if None in c["typical"] or None in c["safe"])
    log(f"grid.json: {len(grid['cells'])} клетки, с null: {nulls}, период "
        f"{grid['period']['start']}–{grid['period']['end']}, synthetic={grid['synthetic']}")


if __name__ == "__main__":
    sys.exit(main())
