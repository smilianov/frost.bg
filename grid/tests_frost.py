"""Тестове за сметката на сланите — пускат се с: python tests_frost.py"""
import http.client
import json
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import frost_estimate as fe                  # noqa: E402

OK = FAIL = 0
FAILURES = []


def check(name, cond, extra=""):
    global OK, FAIL
    if cond:
        OK += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
        FAILURES.append(f"{name} {extra}")
        print(f"  ✗ {name}   {extra}")


def section(title):
    print(f"\n--- {title} ---")


# ===================================================================
section("Сметката на сланите от дневни минимуми (чиста функция)")
# ===================================================================


def synthetic_years(spring_days, autumn_days, start_year=1996, gaps=None, drop_year=None,
                    frost_temp=-1.0):
    """30 години по 10 °C, със слана (frost_temp, по подразбиране −1 °C) на зададените дни.

    spring_days[i]/autumn_days[i] са (месец, ден) за година start_year+i;
    None = няма такава слана. gaps = {година: брой дни с None в средата}.
    drop_year = година, от която се дават само 100 дни (трябва да се пропусне).
    frost_temp = температурата на зададените дни; 0,0 °C проверява дали прагът е „≤“.
    """
    days = []
    for i, (sp, au) in enumerate(zip(spring_days, autumn_days)):
        y = start_year + i
        d = date(y, 1, 1)
        n = 0
        while d.year == y:
            t = 10.0
            if sp and (d.month, d.day) == sp:
                t = frost_temp
            if au and (d.month, d.day) == au:
                t = frost_temp
            if d.month == 12 and d.day >= 20:
                t = -3.0                      # декемврийските слани не са „първата“
            if gaps and y in gaps and 150 <= d.timetuple().tm_yday < 150 + gaps[y]:
                t = None
            if drop_year == y and n >= 100:
                break
            days.append((d, t))
            d += timedelta(days=1)
            n += 1
    return days


springs = [(4, 1 + i) for i in range(30)]          # 1–30 април
autumns = [(10, 1 + i) for i in range(30)]         # 1–30 октомври
est = fe.estimate_frost(synthetic_years(springs, autumns), year=2026)
check("30 години се броят", est.years_used == 30 and est.years_with_spring == 30
      and est.years_with_autumn == 30, str(est))
check("типична пролетна = медиана, по-късната при четен брой (16 април)",
      est.typical_last == date(2026, 4, 16), str(est.typical_last))
check("типична есенна = медиана, по-ранната при четен брой (15 октомври)",
      est.typical_first == date(2026, 10, 15), str(est.typical_first))
check("сигурна пролетна = 90-и персентил (27 април)", est.safe_last == date(2026, 4, 27), str(est.safe_last))
check("сигурна есенна = 10-и персентил (3 октомври)", est.safe_first == date(2026, 10, 3), str(est.safe_first))
check("датите са в поисканата година", est.typical_last.year == 2026 and est.safe_first.year == 2026)

# декемврийската слана (−3 °C) е след първата есенна и не я измества;
# сланата в началото на януари не е „последната пролетна“ — тя е преди април
jan = synthetic_years(springs, autumns)
jan = [(d, -2.0 if (d.month, d.day) == (1, 5) else t) for d, t in jan]
est2 = fe.estimate_frost(jan, year=2026)
check("слана на 5 януари не измества последната пролетна", est2.typical_last == date(2026, 4, 16), str(est2.typical_last))

# високосен ден: слана на 29 февруари във високосните, на 1 март в другите
leap_springs = [((2, 29) if (1996 + i) % 4 == 0 else (3, 1)) for i in range(12)]
est3 = fe.estimate_frost(synthetic_years(leap_springs, [(10, 10)] * 12), year=2026)
check("29 февруари се брои като 1 март: типичната е 1 март в невисокосна година",
      est3.typical_last == date(2026, 3, 1), str(est3.typical_last))

# дни с None се пропускат, но годината остава (30 дни липсват, 335 остават)
est4 = fe.estimate_frost(synthetic_years(springs, autumns, gaps={2000: 30}), year=2026)
check("30 липсващи дни не изхвърлят годината", est4.years_used == 30 and est4.typical_last == date(2026, 4, 16), str(est4))

# година със 100 дни данни се пропуска
est5 = fe.estimate_frost(synthetic_years(springs, autumns, drop_year=2010), year=2026)
check("година с под 300 валидни дни не се брои", est5.years_used == 29, str(est5.years_used))

# година без пролетна слана се брои като година, но не в пролетните
no_spring = list(springs); no_spring[3] = None
est6 = fe.estimate_frost(synthetic_years(no_spring, autumns), year=2026)
check("година без пролетна слана: years_used 30, years_with_spring 29",
      est6.years_used == 30 and est6.years_with_spring == 29, str(est6))

# под 10 години с пролетна слана -> None, но броят се вижда
few = [None] * 25 + springs[25:]
est7 = fe.estimate_frost(synthetic_years(few, autumns), year=2026)
check("под 10 години с пролетна слана -> None и брой 5",
      est7.typical_last is None and est7.safe_last is None and est7.years_with_spring == 5, str(est7))
check("есенната при това си е сметната", est7.typical_first == date(2026, 10, 15))

# --- Границите на договора, всяка поотделно ---------------------------
# Седем гранични правила оцеляваха мутация: можеше да се сменят и целият
# пакет да мине. Всеки тест по-долу пази точно едно от тях и е доказан с
# мутация — правилото се сменя, тестът пада, правилото се връща. Тестовете
# са копие от Garden Planner (backend/tests_places.py), защото
# frost_estimate.py тук е замразено копие на същия договор.

# „Слана“ е минимум ≤ прага, не < прага: ден с точно 0,0 °C се брои.
zero = fe.estimate_frost(synthetic_years(springs, autumns, frost_temp=0.0), year=2026)
check("ден с точно 0,0 °C е пролетна слана (прагът е ≤, не <)",
      zero.typical_last == date(2026, 4, 16) and zero.years_with_spring == 30,
      f"{zero.typical_last}, {zero.years_with_spring} години")
check("ден с точно 0,0 °C е есенна слана (прагът е ≤, не <)",
      zero.typical_first == date(2026, 10, 15) and zero.years_with_autumn == 30,
      f"{zero.typical_first}, {zero.years_with_autumn} години")

# Границата от 300 валидни дни е „под“: точно 300 дни се броят, 299 — не.
# 2001 е невисокосна (365 дни), затова 65 липсващи оставят точно 300.
est300 = fe.estimate_frost(synthetic_years(springs, autumns, gaps={2001: 65}), year=2026)
est299 = fe.estimate_frost(synthetic_years(springs, autumns, gaps={2001: 66}), year=2026)
check("година с точно 300 валидни дни се брои, с 299 — не",
      est300.years_used == 30 and est299.years_used == 29,
      f"300 дни -> {est300.years_used} години, 299 дни -> {est299.years_used} години")

# Годината се разделя на 1 юли: юни е пролет, юли е есен.
june_july = fe.estimate_frost(synthetic_years([(6, 30)] * 30, [(7, 1)] * 30), year=2026)
check("слана на 30 юни е последната пролетна, а 1 юли не е пролетна",
      june_july.typical_last == date(2026, 6, 30), str(june_july.typical_last))
check("слана на 1 юли е първата есенна, не последната пролетна",
      june_july.typical_first == date(2026, 7, 1), str(june_july.typical_first))

# Персентилът е nearest-rank с ceil: при 25 години 0,9·25 = 22,5, тоест
# ранг 23 (23 април) и 0,1·25 = 2,5, тоест ранг 3 (3 октомври).
# floor би дал 22 април и 2 октомври.
p25 = fe.estimate_frost(synthetic_years([(4, 1 + i) for i in range(25)],
                                        [(10, 1 + i) for i in range(25)]), year=2026)
check("персентилът е nearest-rank с ceil: при 25 години 23 април и 3 октомври",
      p25.safe_last == date(2026, 4, 23) and p25.safe_first == date(2026, 10, 3),
      f"{p25.safe_last}, {p25.safe_first}")

# Прагът от 10 години е „поне“: точно 10 стигат, 9 не.
ten = fe.estimate_frost(synthetic_years([(4, 1 + i) for i in range(10)],
                                        [(10, 1 + i) for i in range(10)]), year=2026)
nine = fe.estimate_frost(synthetic_years([(4, 1 + i) for i in range(9)],
                                         [(10, 1 + i) for i in range(9)]), year=2026)
check("точно 10 години със слана дават дати, 9 години -> None",
      ten.typical_last is not None and ten.safe_first is not None
      and nine.typical_last is None and nine.safe_first is None,
      f"10 години -> {ten.typical_last} / {ten.safe_first}, "
      f"9 години -> {nine.typical_last} / {nine.safe_first}")

check("period: 30 пълни години до миналата",
      fe.period(date(2026, 9, 8)) == (date(1996, 1, 1), date(2025, 12, 31)), str(fe.period(date(2026, 9, 8))))
check("source_label назовава периода, прага и клетката",
      fe.source_label(1996, 2025, 168) == "ERA5 1996–2025 през Open-Meteo, праг 0 °C, клетка 168 м",
      fe.source_label(1996, 2025, 168))
check("source_label без височина на клетката",
      fe.source_label(1996, 2025, None) == "ERA5 1996–2025 през Open-Meteo, праг 0 °C")
check("прагът е константа 0 °C", fe.FROST_THRESHOLD_C == 0.0)


# ===================================================================
section("Договорът за FrostFetchError на fetch_daily_tmin (мрежата е подменена)")
# ===================================================================


class _FakeResp:
    """Контекстен мениджър, чийто .read() гърми или дава поток за json.load."""
    def __init__(self, raise_on_read=None, payload=None):
        self._raise = raise_on_read
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        if self._raise:
            raise self._raise
        return json.dumps(self._payload).encode("utf-8")


real_urlopen = fe.urllib.request.urlopen
try:
    fe.urllib.request.urlopen = lambda *a, **k: _FakeResp(raise_on_read=http.client.IncompleteRead(b""))
    try:
        fe.fetch_daily_tmin(42.0, 24.0, date(1996, 1, 1), date(2025, 12, 31))
        check("прекъснато тяло (IncompleteRead) -> FrostFetchError", False, "не гръмна")
    except fe.FrostFetchError:
        check("прекъснато тяло (IncompleteRead) -> FrostFetchError", True)

    fe.urllib.request.urlopen = lambda *a, **k: _FakeResp(payload={
        "daily": {"time": ["2020-01-01", "2020-01-02", "2020-01-03"], "temperature_2m_min": [1.0, 2.0]},
        "elevation": 100})
    try:
        fe.fetch_daily_tmin(42.0, 24.0, date(1996, 1, 1), date(2025, 12, 31))
        check("3 дати срещу 2 стойности -> FrostFetchError", False, "не гръмна")
    except fe.FrostFetchError as e:
        check("3 дати срещу 2 стойности -> FrostFetchError", "3" in str(e) and "2" in str(e), str(e))

    fe.urllib.request.urlopen = lambda *a, **k: _FakeResp(payload={
        "daily": {"time": ["2020-01-01"], "temperature_2m_min": [1.0]}, "elevation": "abc"})
    result = fe.fetch_daily_tmin(42.0, 24.0, date(1996, 1, 1), date(2025, 12, 31))
    check("негодна височина (низ) -> grid_elevation_m None, не гърми",
          result.grid_elevation_m is None, str(result.grid_elevation_m))
finally:
    fe.urllib.request.urlopen = real_urlopen


print("\n====================================================")
print(f"  {OK} успешни, {FAIL} неуспешни")
for f in FAILURES:
    print(f"    ✗ {f}")
sys.exit(1 if FAIL else 0)
