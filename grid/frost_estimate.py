"""Сланите от координатите: дневни минимуми (ERA5 през Open-Meteo) → дати.

Сметката е чиста функция върху списък от дни, за да се тества със
синтетични години без мрежа; мрежата е една функция, която рутерът вика
през модула, а тестовете подменят.

„Слана“ тук е ден с минимум на 2 м ≤ прага. За всяка година: последният
такъв ден преди 1 юли е пролетната, първият на или след 1 юли — есенната.
От 30 години: типична (медиана) и сигурна (в 9 от 10 години няма слана
след/преди нея). Датите се сравняват като (месец, ден) — 29 февруари се
брои като 1 март — и се връщат в поисканата година, както живее
`last_frost`; `horticulture.same_day_in_year` ги пренася нататък.

Известно ограничение: ERA5 е мрежа от 9–25 км и в котловини надценява
нощния минимум, тоест подценява сланата. Затова отговорът носи и
височината на клетката — екранът я показва до тази на мястото.
"""
# Копие от Garden Planner (backend/app/frost_estimate.py), 14 септември 2026. Не се променя тук — промени се правят там и се копират.
from __future__ import annotations

import http.client
import json
import math
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date
from typing import List, Optional, Tuple

FROST_THRESHOLD_C = 0.0        # минимум на 2 м ≤ това е слана
FROST_YEARS = 30               # пълни години назад
MIN_YEARS = 10                 # под толкова години с данни е грешка
MIN_VALID_DAYS = 300           # година с по-малко валидни дни не се брои
FETCH_TIMEOUT_S = 20
OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

Day = Tuple[date, Optional[float]]


@dataclass
class FrostEstimate:
    typical_last: Optional[date]
    typical_first: Optional[date]
    safe_last: Optional[date]
    safe_first: Optional[date]
    years_used: int
    years_with_spring: int
    years_with_autumn: int


@dataclass
class DailyTmin:
    days: List[Day]
    grid_elevation_m: Optional[int]


class FrostFetchError(Exception):
    """Open-Meteo не отговори или отговорът е негоден."""


def _key(d: date) -> int:
    """(месец, ден) като пореден ден в невисокосна година; 29.02 → 1.03."""
    if d.month == 2 and d.day == 29:
        return date(2001, 3, 1).timetuple().tm_yday
    return date(2001, d.month, d.day).timetuple().tm_yday


def _to_date(key: int, year: int) -> date:
    """Обратното на _key: (месец, ден) от невисокосния календар в поисканата година."""
    d = date(2001, 1, 1).fromordinal(date(2001, 1, 1).toordinal() + key - 1)
    return date(year, d.month, d.day)


def _median(vals: List[int], later: bool) -> int:
    """Медиана; при четен брой — по-късната (пролет) или по-ранната (есен)."""
    s = sorted(vals)
    n = len(s)
    if n % 2 == 1:
        return s[n // 2]
    return s[n // 2] if later else s[n // 2 - 1]


def _percentile(vals: List[int], q: float) -> int:
    """Nearest-rank: стойността на ранг ceil(q·n)."""
    s = sorted(vals)
    rank = max(1, math.ceil(q * len(s)))
    return s[rank - 1]


def _per_year(days: List[Day], threshold: float):
    """За всяка година с достатъчно данни: (ключ на пролетната, ключ на есенната)."""
    by_year = {}
    for d, t in days:
        by_year.setdefault(d.year, []).append((d, t))
    out = {}
    for y, items in by_year.items():
        valid = [(d, t) for d, t in items if t is not None]
        if len(valid) < MIN_VALID_DAYS:
            continue
        spring = [d for d, t in valid if t <= threshold and d.month < 7]
        autumn = [d for d, t in valid if t <= threshold and d.month >= 7]
        out[y] = (_key(max(spring)) if spring else None,
                  _key(min(autumn)) if autumn else None)
    return out


def estimate_frost(days: List[Day], threshold: float = FROST_THRESHOLD_C,
                   year: Optional[int] = None) -> FrostEstimate:
    year = year or date.today().year
    per_year = _per_year(days, threshold)
    springs = [s for s, _ in per_year.values() if s is not None]
    autumns = [a for _, a in per_year.values() if a is not None]
    enough_s, enough_a = len(springs) >= MIN_YEARS, len(autumns) >= MIN_YEARS
    return FrostEstimate(
        typical_last=_to_date(_median(springs, later=True), year) if enough_s else None,
        typical_first=_to_date(_median(autumns, later=False), year) if enough_a else None,
        safe_last=_to_date(_percentile(springs, 0.9), year) if enough_s else None,
        safe_first=_to_date(_percentile(autumns, 0.1), year) if enough_a else None,
        years_used=len(per_year),
        years_with_spring=len(springs),
        years_with_autumn=len(autumns),
    )


def period(today: date) -> Tuple[date, date]:
    """30 пълни години до миналата: текущата още не е свършила."""
    end_year = today.year - 1
    return date(end_year - FROST_YEARS + 1, 1, 1), date(end_year, 12, 31)


def source_label(start_year: int, end_year: int, grid_elevation_m: Optional[int]) -> str:
    label = f"ERA5 {start_year}–{end_year} през Open-Meteo, праг {FROST_THRESHOLD_C:g} °C"
    if grid_elevation_m is not None:
        label += f", клетка {grid_elevation_m} м"
    return label


def fetch_daily_tmin(lat: float, lon: float, start: date, end: date) -> DailyTmin:
    """Една заявка към архива на Open-Meteo: дневен минимум за периода.

    Рутерът я вика като `frost_estimate.fetch_daily_tmin(...)`, за да може
    тестът да я подмени на модула — CI няма мрежа.
    """
    query = urllib.parse.urlencode({
        "latitude": f"{lat:.5f}", "longitude": f"{lon:.5f}",
        "start_date": start.isoformat(), "end_date": end.isoformat(),
        "daily": "temperature_2m_min", "timezone": "Europe/Sofia",
    })
    try:
        with urllib.request.urlopen(f"{OPEN_METEO_ARCHIVE}?{query}",
                                    timeout=FETCH_TIMEOUT_S) as resp:
            payload = json.load(resp)
    except (urllib.error.URLError, TimeoutError, ValueError, OSError,
            http.client.HTTPException) as e:
        # http.client.HTTPException хваща и IncompleteRead — тялото е
        # няколкостотин KB и мрежата го къса по средата не рядко.
        raise FrostFetchError(f"Open-Meteo не отговори: {e}") from e
    try:
        times = payload["daily"]["time"]
        temps = payload["daily"]["temperature_2m_min"]
        if len(times) != len(temps):
            raise FrostFetchError(
                f"Open-Meteo върна негоден отговор: {len(times)} дати срещу {len(temps)} стойности")
        days = [(date.fromisoformat(t), v) for t, v in zip(times, temps)]
        elev = payload.get("elevation")
    except (KeyError, TypeError, ValueError) as e:
        raise FrostFetchError(f"Open-Meteo върна негоден отговор: {e}") from e
    try:
        grid_elevation_m = int(round(elev)) if elev is not None else None
    except (TypeError, ValueError):
        grid_elevation_m = None       # негодна височина не е фатална за сметката
    return DailyTmin(days=days, grid_elevation_m=grid_elevation_m)
