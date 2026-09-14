"""Тестове за мрежата (решетка, запис на клетка, сглобяване, пробег) — пускат се с: python tests_grid.py"""
import email.message
import io, json, os, sys, tempfile
import urllib.error
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
expected_years = [[y, "04-10", "10-20"] for y in range(1996, 2026)]
check("30 години със суровите дати, целият списък", rec["years"] == expected_years, str(rec["years"][:3]))
check("бройките", rec["years_used"] == 30 and rec["years_with_spring"] == 30 and rec["years_with_autumn"] == 30)
# данни извън поискания период (1995) не бива да влияят на сметката — филтърът е един, преди двете чисти функции
days_extra = flat_year_days(1995) + days
rec_extra = cg.cell_record(42.2, 24.9, fe.DailyTmin(days=days_extra, grid_elevation_m=152), 1996, 2025)
check("данни извън периода се филтрират еднократно (years_used остава 30, типична/сигурна непроменени)",
      rec_extra["years_used"] == 30 and rec_extra["typical"] == rec["typical"] and rec_extra["safe"] == rec["safe"]
      and rec_extra["years"] == expected_years, str(rec_extra["years_used"]))
# годините излизат хронологично подредени, дори данните да идват разбъркани по години
shuffled_order = sorted(range(1996, 2026), key=lambda y: (y * 13 + 7) % 30)
days_shuffled = [x for y in shuffled_order for x in flat_year_days(y)]
rec_shuffled = cg.cell_record(42.2, 24.9, fe.DailyTmin(days=days_shuffled, grid_elevation_m=152), 1996, 2025)
check("годините излизат хронологично подредени, дори данните да не идват така",
      rec_shuffled["years"] == expected_years, str(rec_shuffled["years"][:3]))
# година без есенна слана -> null в суровите
days2 = [x for y in range(1996, 2026) for x in flat_year_days(y, autumn=(1, 15) if y == 2000 else (10, 20))]
rec2 = cg.cell_record(42.2, 24.9, fe.DailyTmin(days=days2, grid_elevation_m=None), 1996, 2025)
expected_years2 = [[y, "04-10", "10-20"] if y != 2000 else [2000, "04-10", None] for y in range(1996, 2026)]
check("година без есенна слана: null на второто място, целият списък", rec2["years"] == expected_years2, str(rec2["years"][4]))
check("без височина -> elev null", rec2["elev"] is None)
# под 10 години -> typical null
few = [x for y in range(1996, 2026) for x in flat_year_days(y, spring=(4, 10) if y >= 2021 else None)]
rec3 = cg.cell_record(42.2, 24.9, fe.DailyTmin(days=few, grid_elevation_m=1), 1996, 2025)
check("под 10 години с пролетна слана -> typical/safe пролетна null",
      rec3["typical"][0] is None and rec3["safe"][0] is None and rec3["years_with_spring"] == 5, str(rec3["typical"]))

section("Сглобяването на grid.json")
g = cg.build_grid([rec, rec2], 1996, 2025)
check("version 1, period, threshold, step, bbox, source", g["version"] == 1 and g["period"] == {"start": 1996, "end": 2025}
      and g["threshold_c"] == 0.0 and g["step_deg"] == 0.1
      and g["bbox"] == {"lat": [41.2, 44.3], "lon": [22.3, 28.7]} and g["source"] == cg.SOURCE,
      str({k: g[k] for k in g if k != "cells"}))
check("computed е днешната дата", g["computed"] == date.today().isoformat())
check("synthetic е false по подразбиране", g["synthetic"] is False)
check("cells са точно подадените, в реда си", g["cells"] == [rec, rec2], str(len(g["cells"])))
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
    check("cells.jsonl: header + 5 записа", len(lines) == 6, str(len(lines)))
    check("първият ред е header с периода", json.loads(lines[0]) == {"period": [1996, 2025]}, lines[0])
    check("429 -> повторен опит: 6 обаждания за 5 точки", len(calls) == 6, str(len(calls)))
    check("обобщението казва точно „готови: 5 / 2080“", "готови: 5 / 2080" in out.getvalue(), out.getvalue()[-300:])
    # второ пускане: готовите се прескачат
    calls.clear()
    rc2 = cg.main(["--out", tmp, "--pause", "0", "--limit", "7", "--today", "2026-09-14"], stdout=io.StringIO())
    check("продължава: само 2 нови обаждания", len(calls) == 2, str(calls))
    check("cells.jsonl: header + 7 записа", len(open(os.path.join(tmp, "cells.jsonl"), encoding="utf-8").read().splitlines()) == 8)
    # --finish: сглобява grid.json от каквото има (за тест; истинският пробег е без --limit)
    rc3 = cg.main(["--out", tmp, "--finish", "--today", "2026-09-14"], stdout=io.StringIO())
    check("--finish връща 0", rc3 == 0, str(rc3))
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

# обикновена (не-429) грешка също изчаква между опитите, с нарастваща пауза
waits_plain = []
real_sleep_plain = cg.SLEEP
cg.SLEEP = lambda s: waits_plain.append(s)
fe.fetch_daily_tmin = always_fail
try:
    tmp2b = tempfile.mkdtemp()
    cg.main(["--out", tmp2b, "--pause", "3", "--limit", "1", "--today", "2026-09-14"], stdout=io.StringIO())
    check("обикновена грешка: пауза расте (3, после 6)", waits_plain == [3.0, 6.0], str(waits_plain))
finally:
    fe.fetch_daily_tmin = real
    cg.SLEEP = real_sleep_plain

section("--synthetic пише мрежа без мрежа")
tmp3 = tempfile.mkdtemp()
rc = cg.main(["--out", tmp3, "--synthetic", "--today", "2026-09-14"], stdout=io.StringIO())
g3 = json.load(open(os.path.join(tmp3, "grid.json"), encoding="utf-8"))
check("2 080 синтетични клетки, synthetic true", len(g3["cells"]) == 2080 and g3["synthetic"] is True)
check("всяка има typical и safe от 2 елемента", all(len(c["typical"]) == 2 and len(c["safe"]) == 2 for c in g3["cells"]))

section("--limit: помощният текст вече не лъже за „нови точки“")
import contextlib
p_help = io.StringIO()
try:
    with contextlib.redirect_stdout(p_help):
        cg.main(["--help"])
except SystemExit:
    pass
check("--limit помощта говори за общ лимит, не за „нови точки“",
      "вече готови" in p_help.getvalue() and "нови точки (за тест)" not in p_help.getvalue(), p_help.getvalue())

section("Продължаване след скъсан запис в cells.jsonl (прекъснато пускане)")
# (a) валиден запис + скъсана опашка -> продължава, пресмята само липсващата точка, файлът остава чист
tmp6 = tempfile.mkdtemp()
calls6 = []
def _fetch6(lat, lon, start, end):
    calls6.append((lat, lon)); return fe.DailyTmin(days=days, grid_elevation_m=100)
fe.fetch_daily_tmin = _fetch6
try:
    cg.main(["--out", tmp6, "--pause", "0", "--limit", "1", "--today", "2026-09-14"], stdout=io.StringIO())
finally:
    fe.fetch_daily_tmin = real
cells_path6 = os.path.join(tmp6, "cells.jsonl")
with open(cells_path6, "a", encoding="utf-8") as f:
    f.write('{"lat":41.2,"lon":')          # прекъснат запис, без нов ред накрая
calls6.clear()
fe.fetch_daily_tmin = _fetch6
try:
    out6 = io.StringIO()
    rc6 = cg.main(["--out", tmp6, "--pause", "0", "--limit", "2", "--today", "2026-09-14"], stdout=out6)
    check("продължава след скъсан запис, без грешка", rc6 == 0, str(rc6))
    check("пресметната е само липсващата точка", calls6 == [(41.2, 22.4)], str(calls6))
    check("логът споменава недовършения запис", "недовършен" in out6.getvalue(), out6.getvalue())
    content6 = open(cells_path6, encoding="utf-8").read()
    check("файлът завършва чисто (с нов ред)", content6.endswith("\n"), repr(content6[-30:]))
    good_lines6 = [l for l in content6.splitlines() if l.strip()]
    check("header + 2 валидни записа, всички се парсват", len(good_lines6) == 3, str(len(good_lines6)))
    for l in good_lines6:
        json.loads(l)
finally:
    fe.fetch_daily_tmin = real

# (b) валиден последен запис без нов ред накрая -> следващото пускане добавя правилно
tmp7 = tempfile.mkdtemp()
calls7 = []
def _fetch7(lat, lon, start, end):
    calls7.append((lat, lon)); return fe.DailyTmin(days=days, grid_elevation_m=100)
fe.fetch_daily_tmin = _fetch7
try:
    cg.main(["--out", tmp7, "--pause", "0", "--limit", "1", "--today", "2026-09-14"], stdout=io.StringIO())
finally:
    fe.fetch_daily_tmin = real
cells_path7 = os.path.join(tmp7, "cells.jsonl")
raw7 = open(cells_path7, encoding="utf-8").read()
with open(cells_path7, "w", encoding="utf-8") as f:
    f.write(raw7.rstrip("\n"))          # маха последния нов ред; записът остава годен JSON
calls7.clear()
fe.fetch_daily_tmin = _fetch7
try:
    rc7 = cg.main(["--out", tmp7, "--pause", "0", "--limit", "2", "--today", "2026-09-14"], stdout=io.StringIO())
    check("валиден запис без нов ред: следващото пускане добавя правилно",
          rc7 == 0 and calls7 == [(41.2, 22.4)], str((rc7, calls7)))
    content7 = open(cells_path7, encoding="utf-8").read()
    good_lines7 = [l for l in content7.splitlines() if l.strip()]
    check("файлът се чете изцяло след добавката", len(good_lines7) == 3, str(len(good_lines7)))
    for l in good_lines7:
        json.loads(l)
finally:
    fe.fetch_daily_tmin = real

# (c) повреда в средата (не в последния ред) -> спира с грешка, назовава реда, не докосва мрежата
tmp8 = tempfile.mkdtemp()
cells_path8 = os.path.join(tmp8, "cells.jsonl")
_valid_rec = {"lat": 41.2, "lon": 22.3, "elev": 100, "typical": ["04-10", "10-20"],
              "safe": ["04-10", "10-20"], "years_used": 30, "years_with_spring": 30,
              "years_with_autumn": 30, "years": []}
with open(cells_path8, "w", encoding="utf-8") as f:
    f.write(json.dumps({"period": [1996, 2025]}, ensure_ascii=False) + "\n")
    f.write(json.dumps(_valid_rec, ensure_ascii=False) + "\n")
    f.write('{"lat":41.2,"lon":22.4, СЧУПЕНО\n')                       # повреда, НЕ последният ред
    f.write(json.dumps({**_valid_rec, "lon": 22.5}, ensure_ascii=False) + "\n")
def _must_not_be_called(lat, lon, start, end):
    raise AssertionError("не биваше да вика мрежата — повредата трябва да спре пробега преди заявки")
fe.fetch_daily_tmin = _must_not_be_called
try:
    out8 = io.StringIO()
    rc8 = cg.main(["--out", tmp8, "--pause", "0", "--today", "2026-09-14"], stdout=out8)
    check("повреда в средата -> връща 1", rc8 == 1, str(rc8))
    check("грешката назовава реда (3)", "3" in out8.getvalue(), out8.getvalue()[-300:])
finally:
    fe.fetch_daily_tmin = real

section("Годишното опресняване: cells.jsonl пази периода си, не се пише връз стар")
tmp9 = tempfile.mkdtemp()
calls9 = []
def _fetch9(lat, lon, start, end):
    calls9.append((lat, lon)); return fe.DailyTmin(days=days, grid_elevation_m=100)
fe.fetch_daily_tmin = _fetch9
try:
    cg.main(["--out", tmp9, "--pause", "0", "--limit", "3", "--today", "2026-09-14"], stdout=io.StringIO())
finally:
    fe.fetch_daily_tmin = real
calls9.clear()
fe.fetch_daily_tmin = _fetch9
try:
    out9 = io.StringIO()
    rc9 = cg.main(["--out", tmp9, "--pause", "0", "--today", "2027-01-15"], stdout=out9)
    check("различен период -> връща 2, без нито една заявка", rc9 == 2 and calls9 == [], str((rc9, calls9)))
    check("съобщението споменава стария и новия период", "1996" in out9.getvalue() and "1997" in out9.getvalue(), out9.getvalue())
    check("grid.json не е записан", not os.path.exists(os.path.join(tmp9, "grid.json")))
    out9b = io.StringIO()
    rc9b = cg.main(["--out", tmp9, "--finish", "--today", "2027-01-15"], stdout=out9b)
    check("--finish спазва същата проверка -> връща 2", rc9b == 2, str(rc9b))
finally:
    fe.fetch_daily_tmin = real

section("429 от Open-Meteo: изчаква по Retry-After или нарастващо, спира целия пробег на третия отказ")
def _rate_limited(retry_after=None):
    hdrs = None
    if retry_after is not None:
        hdrs = email.message.Message()
        hdrs["Retry-After"] = str(retry_after)
    cause = urllib.error.HTTPError("https://example.invalid", 429, "Too Many Requests", hdrs, None)
    err = fe.FrostFetchError(f"Open-Meteo не отговори: {cause}")
    err.__cause__ = cause
    return err

waits = []
real_sleep = cg.SLEEP
cg.SLEEP = lambda s: waits.append(s)
try:
    # три 429-и подред на същата точка -> спира целия пробег, точно 3 опита, изчаквания 60 после 120
    calls10 = []
    def _always_429(lat, lon, start, end):
        calls10.append((lat, lon)); raise _rate_limited()
    fe.fetch_daily_tmin = _always_429
    tmp10 = tempfile.mkdtemp(); out10 = io.StringIO()
    rc10 = cg.main(["--out", tmp10, "--pause", "0", "--today", "2026-09-14"], stdout=out10)
    check("три 429-и -> връща 1", rc10 == 1, str(rc10))
    check("точно 3 опита, всички на същата точка", len(calls10) == 3 and len(set(calls10)) == 1, str(calls10))
    check("изчаквания 60, после 120", waits == [60, 120], str(waits))
    check("съобщението казва, че квотата е изчерпана", "квота" in out10.getvalue(), out10.getvalue()[-300:])

    # 429, после успех -> продължава нормално
    waits.clear()
    attempts11 = {"n": 0}
    def _fail_once_429(lat, lon, start, end):
        attempts11["n"] += 1
        if attempts11["n"] == 1:
            raise _rate_limited()
        return fe.DailyTmin(days=days, grid_elevation_m=100)
    fe.fetch_daily_tmin = _fail_once_429
    tmp11 = tempfile.mkdtemp()
    rc11 = cg.main(["--out", tmp11, "--pause", "0", "--limit", "1", "--today", "2026-09-14"], stdout=io.StringIO())
    check("429, после успех -> продължава (2 опита, връща 0)", rc11 == 0 and attempts11["n"] == 2, str(attempts11))
    check("изчаква 60 преди втория опит", waits == [60], str(waits))

    # Retry-After: 7 се спазва вместо подразбиращите се 60
    waits.clear()
    attempts12 = {"n": 0}
    def _retry_after_7(lat, lon, start, end):
        attempts12["n"] += 1
        if attempts12["n"] == 1:
            raise _rate_limited(retry_after=7)
        return fe.DailyTmin(days=days, grid_elevation_m=100)
    fe.fetch_daily_tmin = _retry_after_7
    tmp12 = tempfile.mkdtemp()
    cg.main(["--out", tmp12, "--pause", "0", "--limit", "1", "--today", "2026-09-14"], stdout=io.StringIO())
    check("Retry-After: 7 се спазва", waits == [7], str(waits))
finally:
    fe.fetch_daily_tmin = real
    cg.SLEEP = real_sleep


print("\n====================================================")
print(f"  {OK} успешни, {FAIL} неуспешни")
for f in FAILURES:
    print(f"    ✗ {f}")
sys.exit(1 if FAIL else 0)
