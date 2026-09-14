"""Тестове за мрежата (решетка, запис на клетка, сглобяване, пробег) — пускат се с: python tests_grid.py"""
import io, json, os, sys, tempfile
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import frost_estimate as fe                  # noqa: E402
import compute_grid as cg                    # noqa: E402

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


section("Решетката")
pts = cg.lattice()
check("2 080 точки", len(pts) == 2080, str(len(pts)))
check("първата е (41.2, 22.3), последната (44.3, 28.7)",
      pts[0] == (41.2, 22.3) and pts[-1] == (44.3, 28.7), f"{pts[0]} {pts[-1]}")
check("всички са закръглени до 0.1", all(round(a, 1) == a and round(b, 1) == b for a, b in pts))
check("няма дубликати", len(set(pts)) == 2080)

section("Записът на една точка")
def flat_year_days(y, spring=(4, 10), autumn=(10, 20)):
    d = date(y, 1, 1); out = []
    while d.year == y:
        t = -1.0 if (d.month, d.day) in (spring, autumn) else 10.0
        out.append((d, t)); d += timedelta(days=1)
    return out
days = [x for y in range(1996, 2026) for x in flat_year_days(y)]
rec = cg.cell_record(42.2, 24.9, fe.DailyTmin(days=days, grid_elevation_m=152), 1996, 2025)
check("координати и височина", rec["lat"] == 42.2 and rec["lon"] == 24.9 and rec["elev"] == 152, str(rec)[:120])
check("типична като MM-DD", rec["typical"] == ["04-10", "10-20"], str(rec["typical"]))
check("сигурна като MM-DD", rec["safe"] == ["04-10", "10-20"], str(rec["safe"]))
check("30 години със суровите дати", len(rec["years"]) == 30 and rec["years"][0] == [1996, "04-10", "10-20"], str(rec["years"][:2]))
check("бройките", rec["years_used"] == 30 and rec["years_with_spring"] == 30 and rec["years_with_autumn"] == 30)
# година без есенна слана -> null в суровите
days2 = [x for y in range(1996, 2026) for x in flat_year_days(y, autumn=(1, 15) if y == 2000 else (10, 20))]
rec2 = cg.cell_record(42.2, 24.9, fe.DailyTmin(days=days2, grid_elevation_m=None), 1996, 2025)
check("година без есенна слана: null на второто място", rec2["years"][4] == [2000, "04-10", None], str(rec2["years"][4]))
check("без височина -> elev null", rec2["elev"] is None)
# под 10 години -> typical null
few = [x for y in range(1996, 2026) for x in flat_year_days(y, spring=(4, 10) if y >= 2021 else None)]
rec3 = cg.cell_record(42.2, 24.9, fe.DailyTmin(days=few, grid_elevation_m=1), 1996, 2025)
check("под 10 години с пролетна слана -> typical/safe пролетна null",
      rec3["typical"][0] is None and rec3["safe"][0] is None and rec3["years_with_spring"] == 5, str(rec3["typical"]))

section("Сглобяването на grid.json")
g = cg.build_grid([rec, rec2], 1996, 2025)
check("version 1, period, threshold, step, bbox", g["version"] == 1 and g["period"] == {"start": 1996, "end": 2025}
      and g["threshold_c"] == 0.0 and g["step_deg"] == 0.1
      and g["bbox"] == {"lat": [41.2, 44.3], "lon": [22.3, 28.7]}, str({k: g[k] for k in g if k != "cells"}))
check("computed е днешната дата", g["computed"] == date.today().isoformat())
check("synthetic е false по подразбиране", g["synthetic"] is False)
check("cells са подадените", len(g["cells"]) == 2)
check("synthetic=True се записва", cg.build_grid([], 1996, 2025, synthetic=True)["synthetic"] is True)

section("Синтетичната мрежа (за разработка, докато истинската се смята)")
st = cg.synthetic_tmin(42.2, 24.9, 1996, 2025)
check("30 години дни", len(st.days) >= 30 * 365, str(len(st.days)))
check("има слана през пролетта и есента", any(t is not None and t <= 0 and d.month < 7 for d, t in st.days)
      and any(t is not None and t <= 0 and d.month >= 7 for d, t in st.days))
r_low = cg.cell_record(41.5, 25.0, cg.synthetic_tmin(41.5, 25.0, 1996, 2025), 1996, 2025)
r_high = cg.cell_record(43.5, 25.0, cg.synthetic_tmin(43.5, 25.0, 1996, 2025), 1996, 2025)
check("по на север пролетната слана е по-късна (синтетиката е правдоподобна)",
      r_high["typical"][0] > r_low["typical"][0], f"{r_low['typical']} {r_high['typical']}")

section("Пробегът: подменена мрежа, продължаване, повторен опит, обобщение")
tmp = tempfile.mkdtemp()
calls = []
def fake_fetch(lat, lon, start, end):
    calls.append((lat, lon))
    if (lat, lon) == (41.2, 22.5) and len([c for c in calls if c == (lat, lon)]) == 1:
        raise fe.FrostFetchError("429")          # първият опит пада, вторият минава
    return fe.DailyTmin(days=days, grid_elevation_m=100)
real = fe.fetch_daily_tmin
fe.fetch_daily_tmin = fake_fetch
try:
    out = io.StringIO()
    rc = cg.main(["--out", tmp, "--pause", "0", "--limit", "5", "--today", "2026-09-14"], stdout=out)
    check("връща 0", rc == 0, str(rc))
    lines = open(os.path.join(tmp, "cells.jsonl"), encoding="utf-8").read().splitlines()
    check("5 точки в cells.jsonl", len(lines) == 5, str(len(lines)))
    check("429 -> повторен опит: 6 обаждания за 5 точки", len(calls) == 6, str(len(calls)))
    check("обобщението казва 5 от 2080", "5 / 2080" in out.getvalue(), out.getvalue()[-300:])
    # второ пускане: готовите се прескачат
    calls.clear()
    rc2 = cg.main(["--out", tmp, "--pause", "0", "--limit", "7", "--today", "2026-09-14"], stdout=io.StringIO())
    check("продължава: само 2 нови обаждания", len(calls) == 2, str(calls))
    check("cells.jsonl има 7 реда", len(open(os.path.join(tmp, "cells.jsonl"), encoding="utf-8").read().splitlines()) == 7)
    # --finish: сглобява grid.json от каквото има (за тест; истинският пробег е без --limit)
    rc3 = cg.main(["--out", tmp, "--finish", "--today", "2026-09-14"], stdout=io.StringIO())
    g2 = json.load(open(os.path.join(tmp, "grid.json"), encoding="utf-8"))
    check("grid.json с 7 клетки и период 1996–2025", len(g2["cells"]) == 7 and g2["period"] == {"start": 1996, "end": 2025}, str(g2["period"]))
finally:
    fe.fetch_daily_tmin = real

calls.clear()
def always_fail(lat, lon, start, end):
    calls.append((lat, lon)); raise fe.FrostFetchError("down")
fe.fetch_daily_tmin = always_fail
try:
    tmp2 = tempfile.mkdtemp(); out = io.StringIO()
    rc = cg.main(["--out", tmp2, "--pause", "0", "--limit", "2", "--today", "2026-09-14"], stdout=out)
    check("три опита на точка, после нататък: 6 обаждания за 2 точки", len(calls) == 6, str(len(calls)))
    check("връща 1, когато има пропуснати", rc == 1, str(rc))
    check("обобщението казва 2 пропуснати", "пропуснати: 2" in out.getvalue(), out.getvalue()[-300:])
finally:
    fe.fetch_daily_tmin = real

section("--synthetic пише мрежа без мрежа")
tmp3 = tempfile.mkdtemp()
rc = cg.main(["--out", tmp3, "--synthetic", "--today", "2026-09-14"], stdout=io.StringIO())
g3 = json.load(open(os.path.join(tmp3, "grid.json"), encoding="utf-8"))
check("2 080 синтетични клетки, synthetic true", len(g3["cells"]) == 2080 and g3["synthetic"] is True)
check("всяка има typical и safe от 2 елемента", all(len(c["typical"]) == 2 and len(c["safe"]) == 2 for c in g3["cells"]))


print("\n====================================================")
print(f"  {OK} успешни, {FAIL} неуспешни")
for f in FAILURES:
    print(f"    ✗ {f}")
sys.exit(1 if FAIL else 0)
