"""Мрежата за frost.bg: 2 080 точки на 0,1° върху България → grid.json.

    python3 compute_grid.py                  # истинският пробег (часове; продължава след прекъсване)
    python3 compute_grid.py --synthetic      # правдоподобна мрежа без мрежа, за разработка
    python3 compute_grid.py --finish         # сглобява grid.json от cells.jsonl, каквото има

Всяка сметната точка се записва веднага в cells.jsonl; при ново пускане
готовите се прескачат. Open-Meteo има дневни лимити — --pause (s) между
заявките; 429/мрежова грешка → до 3 опита с нарастващо изчакване; трети
пореден 429 спира целия пробег (квотата явно е изчерпана — контролната
точка вече е на диска, пусни пак по-късно).
"""
from __future__ import annotations

import argparse
import email.utils
import json
import math
import os
import sys
import time
import urllib.error
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import frost_estimate as fe

LAT_MIN, LAT_MAX = 41.2, 44.3
LON_MIN, LON_MAX = 22.3, 28.7
STEP = 0.1
ATTEMPTS = 3
SOURCE = "ERA5 през Open-Meteo, дневен минимум на 2 м"
SOURCE_CDS = "ERA5-Land през Copernicus CDS, дневен минимум на 2 м"
SLEEP = time.sleep         # ниво на модула, за да могат тестовете да го подменят


class _CorruptCheckpoint(Exception):
    """Повреда в cells.jsonl другаде освен в последния (прекъснат) ред."""


class _PeriodMismatch(Exception):
    """cells.jsonl е за друг период от поискания — не бива да се пише връз него."""


class QuotaExhausted(Exception):
    """Open-Meteo отказва с 429 и на третия опит — дневната/часовата квота е изчерпана."""


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
    period_days = [(d, t) for d, t in tmin.days if start_year <= d.year <= end_year]
    est = fe.estimate_frost(period_days, year=2001)     # невисокосна: датите са само (месец, ден)
    per_year = fe._per_year(period_days, fe.FROST_THRESHOLD_C)
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


def _load_done(path: str, expected_period: Tuple[int, int], log) -> Dict[Tuple[float, float], dict]:
    """Чете cells.jsonl: първият ред е header {"period":[Y0,Y1]}, после по един запис на ред.

    Хедър-проверката е върху суровия първи ред, преди каквото и да е
    възстановяване на опашката: непразен файл (size > 0), чийто първи ред
    не се парсва като `{"period":[Y0,Y1]}` — бил той стар формат без
    header, бял ред или скъсан частичен първи ред — се отказва веднага.
    Само нулев по байтове (или несъществуващ) файл е „нов“. Възстановяване
    на скъсана опашка важи единствено за записите СЛЕД header-а: скъсан
    последен ред (прекъснато пускане по средата на запис) се маха тихо с
    едно `os.truncate` до края на последния пълен ред — никога
    пренаписване на целия файл, за да не изгуби валидния префикс, ако и
    самото възстановяване бъде прекъснато. Точката просто се пресмята пак
    при това пускане. Валиден последен ред без завършващ нов ред се
    доогражда с такъв — включително самият header, когато е единственият
    ред (прекъсване веднага след записването му); иначе първата клетка би
    се залепила за него и следващото пускане би отказало файла. Повреда
    другаде във файла е фатална грешка — там
    няма как записът да е просто „недовършен“. Периодът в header-а трябва
    да съвпада с поискания, иначе годишното опресняване би написало нова
    година върху стара мрежа.
    """
    done: Dict[Tuple[float, float], dict] = {}
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return done
    with open(path, "rb") as f:
        raw = f.read()
    first_nl = raw.find(b"\n")
    first_line = raw if first_nl == -1 else raw[:first_nl]
    header_rec = None
    try:
        header_rec = json.loads(first_line.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        pass
    if not (isinstance(header_rec, dict) and "period" in header_rec):
        raise _PeriodMismatch("cells.jsonl е в стар формат без период — изтрий го и пусни пак")
    header_period = tuple(header_rec["period"])
    if header_period != tuple(expected_period):
        raise _PeriodMismatch(
            f"cells.jsonl е за {header_period[0]}–{header_period[1]}, поискано "
            f"{expected_period[0]}–{expected_period[1]} — изтрий го или пусни с --today за стария период")

    ends_with_newline = raw.endswith(b"\n")
    byte_lines = raw.split(b"\n")
    if ends_with_newline:
        byte_lines = byte_lines[:-1]        # последният елемент след split е b'' заради крайния \n
    n = len(byte_lines)
    needs_newline = False
    offset = 0                              # байтова позиция на началото на текущия ред
    for i, bline in enumerate(byte_lines):
        line_len = len(bline) + 1           # +1 за \n, който го е следвал (реален или предполагаем)
        if i == 0:
            if i == n - 1 and not ends_with_newline:
                needs_newline = True        # само header, прекъснат преди \n — иначе първата клетка се залепя за него
            offset += line_len
            continue                        # header-ът вече е проверен по-горе
        line = bline.decode("utf-8")
        if not line.strip():
            offset += line_len
            continue
        is_last = i == n - 1
        try:
            rec = json.loads(line)
        except json.JSONDecodeError as e:
            if is_last and not ends_with_newline:
                os.truncate(path, offset)   # едно системно извикване — не пипа нищо преди offset
                log("  недовършен запис в края на cells.jsonl (прекъснато пускане) — изтрит, точката ще се пресметне пак")
                break
            raise _CorruptCheckpoint(f"повреден запис на ред {i + 1} в cells.jsonl: {e}") from e
        else:
            if is_last and not ends_with_newline:
                needs_newline = True
            done[(rec["lat"], rec["lon"])] = rec
        offset += line_len
    if needs_newline:
        with open(path, "a", encoding="utf-8") as f:
            f.write("\n")
    return done


def _is_rate_limited(err: fe.FrostFetchError) -> bool:
    cause = err.__cause__
    return isinstance(cause, urllib.error.HTTPError) and cause.code == 429


def _retry_after_seconds(err: fe.FrostFetchError) -> Optional[float]:
    """Retry-After (RFC 9110 §10.2.3): цяло число секунди или HTTP-дата."""
    cause = err.__cause__
    if not (isinstance(cause, urllib.error.HTTPError) and cause.headers):
        return None
    value = cause.headers.get("Retry-After")
    if value is None:
        return None
    value = value.strip()
    try:
        return max(0.0, min(3600.0, float(int(value))))    # никога отрицателна или прекалено дълга пауза
    except ValueError:
        pass
    try:
        when = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    seconds = (when - datetime.now(timezone.utc)).total_seconds()
    return max(0.0, min(3600.0, seconds))


def _fetch_with_retries(lat: float, lon: float, start: date, end: date, pause: float, log):
    for attempt in range(1, ATTEMPTS + 1):
        try:
            return fe.fetch_daily_tmin(lat, lon, start, end)
        except fe.FrostFetchError as e:
            if _is_rate_limited(e):
                if attempt >= ATTEMPTS:
                    raise QuotaExhausted(
                        "квотата на Open-Meteo е изчерпана — пусни пак по-късно (обикновено на следващия ден)"
                    ) from e
                wait = _retry_after_seconds(e)
                if wait is None:
                    wait = 60 if attempt == 1 else 120
                log(f"  ({lat}, {lon}) опит {attempt}/{ATTEMPTS}: 429, изчаквам {wait} s")
                SLEEP(wait)
            else:
                log(f"  ({lat}, {lon}) опит {attempt}/{ATTEMPTS} падна: {e}")
                if attempt < ATTEMPTS:
                    SLEEP(pause * attempt)
    return None


def main(argv: Optional[List[str]] = None, stdout=None) -> int:
    out = stdout or sys.stdout
    log = lambda s: print(s, file=out)            # noqa: E731
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", default=os.path.dirname(os.path.abspath(__file__)))
    p.add_argument("--pause", type=float, default=1.0)
    p.add_argument("--limit", type=int, default=None,
                    help="общ лимит: вече готови + новоопитани точки (за тест)")
    p.add_argument("--today", default=None, help="YYYY-MM-DD, за периода (по подразбиране днес)")
    p.add_argument("--synthetic", action="store_true")
    p.add_argument("--finish", action="store_true", help="само сглоби grid.json от cells.jsonl")
    p.add_argument("--from-cds", dest="from_cds", default=None,
                    help="папка с t2m_daily_min_<YYYY>.nc и geopotential.nc от Copernicus CDS (fetch_cds.py)")
    p.add_argument("--cross-check", dest="cross_check", default=None,
                    help="cells.jsonl от Open-Meteo — сравнява годините на клетка с изчислените от CDS")
    a = p.parse_args(argv)

    today = date.fromisoformat(a.today) if a.today else date.today()
    start, end = fe.period(today)
    cells_path = os.path.join(a.out, "cells.jsonl")
    grid_path = os.path.join(a.out, "grid.json")
    points = lattice()

    if a.from_cds:
        import cds_reader                      # lazy: netCDF4 не е нужен за Open-Meteo/синтетика
        years = list(range(start.year, end.year + 1))
        missing = [y for y in years if not os.path.exists(os.path.join(a.from_cds, f"t2m_daily_min_{y}.nc"))]
        if missing:
            log(f"липсват файлове за години: {', '.join(map(str, missing))} — пусни fetch_cds.py")
            return 1
        geo_path = os.path.join(a.from_cds, "geopotential.nc")
        elev = cds_reader.read_elevation(geo_path) if os.path.exists(geo_path) else {}
        if not elev:
            log("няма geopotential.nc — височините ще са null")
        days_by_cell: Dict[Tuple[float, float], list] = {}
        for y in years:
            for key, days in cds_reader.read_year(os.path.join(a.from_cds, f"t2m_daily_min_{y}.nc")).items():
                days_by_cell.setdefault(key, []).extend(days)
            log(f"  {y}: прочетена")
        cells = []
        for lat, lon in points:
            days = days_by_cell.get((lat, lon))
            if not days:
                log(f"  ({lat}, {lon}) липсва във файловете — null клетка")
                cells.append(cell_record(lat, lon, fe.DailyTmin(days=[], grid_elevation_m=elev.get((lat, lon))), start.year, end.year))
                continue
            cells.append(cell_record(lat, lon, fe.DailyTmin(days=days, grid_elevation_m=elev.get((lat, lon))), start.year, end.year))
        grid = build_grid(cells, start.year, end.year)
        grid["source"] = SOURCE_CDS
        rc = 0
        if a.cross_check:
            rc = _cross_check(grid, a.cross_check, log)
        _write_grid(grid_path, grid, log)
        return rc

    if a.synthetic:
        cells = [cell_record(lat, lon, synthetic_tmin(lat, lon, start.year, end.year), start.year, end.year)
                 for lat, lon in points]
        _write_grid(grid_path, build_grid(cells, start.year, end.year, synthetic=True), log)
        return 0

    try:
        done = _load_done(cells_path, (start.year, end.year), log)
    except _CorruptCheckpoint as e:
        log(str(e))
        return 1
    except _PeriodMismatch as e:
        log(str(e))
        return 2

    if not a.finish:
        skipped, new = [], 0
        needs_header = not os.path.exists(cells_path) or os.path.getsize(cells_path) == 0
        with open(cells_path, "a", encoding="utf-8") as f:
            if needs_header:
                f.write(json.dumps({"period": [start.year, end.year]}, ensure_ascii=False) + "\n")
                f.flush()
            for lat, lon in points:
                if (lat, lon) in done:
                    continue
                if a.limit is not None and len(done) + len(skipped) >= a.limit:
                    break
                try:
                    tmin = _fetch_with_retries(lat, lon, start, end, a.pause, log)
                except QuotaExhausted as e:
                    log(str(e))
                    return 1
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


def _mmdd_ordinal(mmdd: str) -> int:
    """MM-DD -> пореден ден в невисокосна година (2001), за сравнение на разлики;
    29.02 -> 1.03, както `fe._key` — външно подадени (не от `cell_record`) дати
    все пак може да носят литерален 29 февруари."""
    month, day = int(mmdd[:2]), int(mmdd[3:5])
    if month == 2 and day == 29:
        return date(2001, 3, 1).toordinal()
    return date(2001, month, day).toordinal()


def _day_delta(a: Optional[str], b: Optional[str]) -> Optional[int]:
    """Разлика в дни между две MM-DD дати; None срещу стойност -> None (предупреждение);
    и двете None -> 0."""
    if a is None and b is None:
        return 0
    if a is None or b is None:
        return None
    return abs(_mmdd_ordinal(a) - _mmdd_ordinal(b))


def _cross_check(grid: dict, path: str, log) -> int:
    """Сравнява клетките на `grid` (от CDS) със записите в `path` (cells.jsonl от
    Open-Meteo, с header ред). За всяка съвпадаща клетка печата разликата в дни за
    typical/safe; разлика > 10 дни (или None срещу стойност) -> предупреждение и
    крайният код е 1; иначе 0 с обобщение."""
    by_key = {(c["lat"], c["lon"]): c for c in grid["cells"]}
    fmt = lambda x: "n/a" if x is None else str(x)          # noqa: E731
    n = 0
    max_diff = 0
    any_over = False
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()
    for line in lines[1:]:                                   # прескача header реда
        line = line.strip()
        if not line:
            continue
        rec = json.loads(line)
        key = (rec["lat"], rec["lon"])
        cell = by_key.get(key)
        if cell is None:
            continue
        n += 1
        d_typ = [_day_delta(cell["typical"][i], rec["typical"][i]) for i in (0, 1)]
        d_safe = [_day_delta(cell["safe"][i], rec["safe"][i]) for i in (0, 1)]
        deltas = d_typ + d_safe
        log(f"  ({key[0]}, {key[1]}): типична Δ {fmt(d_typ[0])}/{fmt(d_typ[1])} дни, "
            f"сигурна Δ {fmt(d_safe[0])}/{fmt(d_safe[1])} дни")
        numeric = [x for x in deltas if x is not None]
        if numeric:
            max_diff = max(max_diff, max(numeric))
        if any(x is None for x in deltas):
            any_over = True
            log(f"  ПРЕДУПРЕЖДЕНИЕ: ({key[0]}, {key[1]}) n/a — липсва стойност")
        if any(x is not None and x > 10 for x in deltas):
            any_over = True
            log(f"  ПРЕДУПРЕЖДЕНИЕ: ({key[0]}, {key[1]}) над 10 дни")
    log(f"кръстосана проверка: {n} клетки, най-голяма разлика {max_diff} дни")
    return 1 if any_over else 0


def _write_grid(path: str, grid: dict, log) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(grid, f, ensure_ascii=False, separators=(",", ":"))
    nulls = sum(1 for c in grid["cells"] if None in c["typical"] or None in c["safe"])
    log(f"grid.json: {len(grid['cells'])} клетки, с null: {nulls}, период "
        f"{grid['period']['start']}–{grid['period']['end']}, synthetic={grid['synthetic']}")


if __name__ == "__main__":
    sys.exit(main())
