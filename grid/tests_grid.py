"""Тестове за мрежата (решетка, запис на клетка, сглобяване, пробег) — пускат се с: python tests_grid.py"""
import email.message
import email.utils
import io, json, os, sys, tempfile
import urllib.error
from datetime import date, datetime, timedelta, timezone

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
# source_id — машинният етикет на произхода, който Worker-ът чете (worker/frost.js): cds | openmeteo | synthetic
check("source_id е openmeteo по подразбиране (Open-Meteo пробег)", g.get("source_id") == "openmeteo", str(g.get("source_id")))
g_syn = cg.build_grid([], 1996, 2025, synthetic=True)
check("synthetic=True -> source_id synthetic", g_syn.get("source_id") == "synthetic", str(g_syn.get("source_id")))
try:
    g_cds = cg.build_grid([], 1996, 2025, source_id="cds")
    check("source_id=cds -> source_id cds и source текстът на CDS",
          g_cds.get("source_id") == "cds" and g_cds["source"] == cg.SOURCE_CDS, str(g_cds.get("source_id")))
except TypeError as e:
    check("source_id=cds -> source_id cds и source текстът на CDS", False, f"TypeError: {e}")

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
check("--synthetic пише source_id synthetic", g3.get("source_id") == "synthetic", str(g3.get("source_id")))

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

# (b2) само header, БЕЗ нов ред накрая (прекъсване веднага след записването му) ->
# header-ът получава своя нов ред, преди първата клетка да се допише; следващото пускане продължава
tmp7b = tempfile.mkdtemp()
cells_path7b = os.path.join(tmp7b, "cells.jsonl")
with open(cells_path7b, "w", encoding="utf-8") as f:
    f.write('{"period": [1996, 2025]}')   # нищо друго, без нов ред
calls7b = []
def _fetch7b(lat, lon, start, end):
    calls7b.append((lat, lon)); return fe.DailyTmin(days=days, grid_elevation_m=100)
fe.fetch_daily_tmin = _fetch7b
try:
    rc7b = cg.main(["--out", tmp7b, "--pause", "0", "--limit", "1", "--today", "2026-09-14"], stdout=io.StringIO())
    check("само header без нов ред: първото пускане връща 0 и смята една точка",
          rc7b == 0 and calls7b == [(41.2, 22.3)], str((rc7b, calls7b)))
    content7b = open(cells_path7b, encoding="utf-8").read()
    lines7b = content7b.split("\n")
    check("файлът е header + нов ред + една клетка + нов ред (всеки ред се парсва)",
          content7b.endswith("\n") and len(lines7b) == 3 and lines7b[-1] == ""
          and json.loads(lines7b[0]) == {"period": [1996, 2025]}
          and json.loads(lines7b[1])["lat"] == 41.2 and json.loads(lines7b[1])["lon"] == 22.3,
          repr(content7b[:80]))
    calls7b.clear()
    rc7b2 = cg.main(["--out", tmp7b, "--pause", "0", "--limit", "2", "--today", "2026-09-14"], stdout=io.StringIO())
    check("второто пускане връща 0 и добавя точно една клетка",
          rc7b2 == 0 and calls7b == [(41.2, 22.4)], str((rc7b2, calls7b)))
    content7b2 = open(cells_path7b, encoding="utf-8").read()
    good_lines7b2 = [l for l in content7b2.splitlines() if l.strip()]
    check("след второто пускане: header + 2 записа, всички се парсват",
          len(good_lines7b2) == 3 and all(json.loads(l) is not None for l in good_lines7b2)
          and content7b2.endswith("\n"), str(len(good_lines7b2)))
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

# (d) поправката на опашката е едно os.truncate, не пренаписване на целия файл —
# симулирано прекъсване точно след истинското съкращаване не бива да пипа валидния префикс
tmp8b = tempfile.mkdtemp()
calls8b = []
def _fetch8b(lat, lon, start, end):
    calls8b.append((lat, lon)); return fe.DailyTmin(days=days, grid_elevation_m=100)
fe.fetch_daily_tmin = _fetch8b
try:
    cg.main(["--out", tmp8b, "--pause", "0", "--limit", "1", "--today", "2026-09-14"], stdout=io.StringIO())
finally:
    fe.fetch_daily_tmin = real
cells_path8b = os.path.join(tmp8b, "cells.jsonl")
valid_prefix8b = open(cells_path8b, encoding="utf-8").read()
with open(cells_path8b, "a", encoding="utf-8") as f:
    f.write('{"lat":41.2,"lon":')          # скъсан запис накрая
real_truncate = os.truncate
def _truncate_then_boom(path_arg, offset_arg):
    real_truncate(path_arg, offset_arg)     # истинското съкращаване наистина се случва
    raise RuntimeError("симулирано прекъсване веднага след съкращаването")
os.truncate = _truncate_then_boom
try:
    try:
        cg._load_done(cells_path8b, (1996, 2025), lambda s: None)
        check("очаквахме симулираното прекъсване (иначе тестът не проверява нищо)", False, "не гръмна")
    except RuntimeError:
        pass
finally:
    os.truncate = real_truncate
on_disk8b = open(cells_path8b, encoding="utf-8").read()
check("валидният префикс е недокоснат дори при прекъсване веднага след съкращаването",
      on_disk8b == valid_prefix8b, repr(on_disk8b))

section("Стар формат без header се отказва (не мигрира тихо, не гадае периода)")
tmp8c = tempfile.mkdtemp()
cells_path8c = os.path.join(tmp8c, "cells.jsonl")
with open(cells_path8c, "w", encoding="utf-8") as f:
    for lat, lon in cg.lattice():
        f.write(json.dumps({**_valid_rec, "lat": lat, "lon": lon}, ensure_ascii=False) + "\n")
fe.fetch_daily_tmin = _must_not_be_called
try:
    out8c = io.StringIO()
    rc8c = cg.main(["--out", tmp8c, "--pause", "0", "--today", "2026-09-14"], stdout=out8c)
    check("2 080 записа без header -> връща 2", rc8c == 2, str(rc8c))
    check("съобщението казва стар формат", "стар формат" in out8c.getvalue(), out8c.getvalue())
    check("grid.json не се пише", not os.path.exists(os.path.join(tmp8c, "grid.json")))
finally:
    fe.fetch_daily_tmin = real

# изроден първи ред: празен/бял ред вместо header -> отказ, не се плъзга покрай проверката
tmp8d = tempfile.mkdtemp()
cells_path8d = os.path.join(tmp8d, "cells.jsonl")
with open(cells_path8d, "w", encoding="utf-8") as f:
    f.write(" \n")
fe.fetch_daily_tmin = _must_not_be_called
try:
    out8d = io.StringIO()
    rc8d = cg.main(["--out", tmp8d, "--pause", "0", "--today", "2026-09-14"], stdout=out8d)
    check("бял първи ред -> връща 2, без заявки", rc8d == 2, str(rc8d))
    check("съобщението казва стар формат (бял ред)", "стар формат" in out8d.getvalue(), out8d.getvalue())
    check("grid.json не се пише (бял ред)", not os.path.exists(os.path.join(tmp8d, "grid.json")))
finally:
    fe.fetch_daily_tmin = real

# изроден първи ред: скъсан частичен първи ред -> отказ, не се третира като „ново“
tmp8e = tempfile.mkdtemp()
cells_path8e = os.path.join(tmp8e, "cells.jsonl")
with open(cells_path8e, "w", encoding="utf-8") as f:
    f.write('{"lat":')                     # без нов ред накрая, единствен ред във файла
fe.fetch_daily_tmin = _must_not_be_called
try:
    out8e = io.StringIO()
    rc8e = cg.main(["--out", tmp8e, "--pause", "0", "--today", "2026-09-14"], stdout=out8e)
    check("скъсан първи ред -> връща 2, без заявки", rc8e == 2, str(rc8e))
    check("съобщението казва стар формат (скъсан първи ред)", "стар формат" in out8e.getvalue(), out8e.getvalue())
    check("grid.json не се пише (скъсан първи ред)", not os.path.exists(os.path.join(tmp8e, "grid.json")))
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

    # Retry-After като HTTP-дата (RFC 9110 §10.2.3), не само цяло число секунди
    waits.clear()
    attempts13 = {"n": 0}
    future = datetime.now(timezone.utc) + timedelta(seconds=7)
    http_date = email.utils.format_datetime(future, usegmt=True)
    def _retry_after_httpdate(lat, lon, start, end):
        attempts13["n"] += 1
        if attempts13["n"] == 1:
            raise _rate_limited(retry_after=http_date)
        return fe.DailyTmin(days=days, grid_elevation_m=100)
    fe.fetch_daily_tmin = _retry_after_httpdate
    tmp13 = tempfile.mkdtemp()
    cg.main(["--out", tmp13, "--pause", "0", "--limit", "1", "--today", "2026-09-14"], stdout=io.StringIO())
    check("Retry-After като HTTP-дата: изчаква ~7 s", len(waits) == 1 and abs(waits[0] - 7) <= 2, str(waits))

    # негодна стойност на Retry-After -> връща се към подразбиращите се 60
    waits.clear()
    attempts14 = {"n": 0}
    def _retry_after_garbage(lat, lon, start, end):
        attempts14["n"] += 1
        if attempts14["n"] == 1:
            raise _rate_limited(retry_after="утре някой път")
        return fe.DailyTmin(days=days, grid_elevation_m=100)
    fe.fetch_daily_tmin = _retry_after_garbage
    tmp14 = tempfile.mkdtemp()
    cg.main(["--out", tmp14, "--pause", "0", "--limit", "1", "--today", "2026-09-14"], stdout=io.StringIO())
    check("негоден Retry-After -> връща се към подразбиращите се 60", waits == [60], str(waits))

    # числов Retry-After също минава през ограничението [0, 3600] — никога отрицателна пауза
    waits.clear()
    attempts15 = {"n": 0}
    def _retry_after_too_big(lat, lon, start, end):
        attempts15["n"] += 1
        if attempts15["n"] == 1:
            raise _rate_limited(retry_after=7200)
        return fe.DailyTmin(days=days, grid_elevation_m=100)
    fe.fetch_daily_tmin = _retry_after_too_big
    tmp15 = tempfile.mkdtemp()
    cg.main(["--out", tmp15, "--pause", "0", "--limit", "1", "--today", "2026-09-14"], stdout=io.StringIO())
    check("Retry-After: 7200 се ограничава до 3600", waits == [3600], str(waits))

    waits.clear()
    attempts16 = {"n": 0}
    def _retry_after_negative(lat, lon, start, end):
        attempts16["n"] += 1
        if attempts16["n"] == 1:
            raise _rate_limited(retry_after=-1)
        return fe.DailyTmin(days=days, grid_elevation_m=100)
    fe.fetch_daily_tmin = _retry_after_negative
    tmp16 = tempfile.mkdtemp()
    cg.main(["--out", tmp16, "--pause", "0", "--limit", "1", "--today", "2026-09-14"], stdout=io.StringIO())
    check("Retry-After: -1 се ограничава до 0 (никога отрицателна пауза)", waits == [0], str(waits))
finally:
    fe.fetch_daily_tmin = real
    cg.SLEEP = real_sleep


section("Кръстосаната проверка отказва чужд период, файл без header, празен файл и нула клетки")
# Сравнение без валиден вход не е „успех“: rc 0 трябва да значи, че наистина е
# имало какво да се сравни, и за същия период като мрежата.
tmp_cc = tempfile.mkdtemp()
grid_cc = {"period": {"start": 1996, "end": 2025},
           "cells": [{"lat": 42.2, "lon": 24.9, "typical": ["04-10", "10-20"], "safe": ["04-10", "10-20"]}]}
om_rec = {"lat": 42.2, "lon": 24.9, "typical": ["04-10", "10-20"], "safe": ["04-10", "10-20"]}


def _cc(name, lines):
    path = os.path.join(tmp_cc, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write("".join(lines))
    logs = []
    rc = cg._cross_check(grid_cc, path, logs.append)
    return rc, logs


rc_ok, logs_ok = _cc("ok.jsonl", [json.dumps({"period": [1996, 2025]}) + "\n", json.dumps(om_rec) + "\n"])
check("контролна: същият период и една обща клетка -> rc 0", rc_ok == 0, str(logs_ok))
# (1) header за друг период
rc_p, logs_p = _cc("other_period.jsonl", [json.dumps({"period": [1995, 2024]}) + "\n", json.dumps(om_rec) + "\n"])
check("header за друг период -> rc 1", rc_p == 1, str(logs_p))
check("… и логва „за друг период … не се брои“", any("за друг период" in l and "не се брои" in l for l in logs_p), str(logs_p))
check("… без да сравнява клетки", not any("Δ" in l for l in logs_p), str(logs_p))
# (1б) без header — стар формат, първият ред е клетка
rc_h, logs_h = _cc("no_header.jsonl", [json.dumps(om_rec) + "\n"])
check("файл без header {\"period\": …} -> rc 1", rc_h == 1, str(logs_h))
check("… и логва „не се брои“", any("не се брои" in l for l in logs_h), str(logs_h))
# (2) нула съвпаднали клетки
rc_z, logs_z = _cc("zero.jsonl", [json.dumps({"period": [1996, 2025]}) + "\n",
                                  json.dumps({**om_rec, "lat": 43.0, "lon": 25.0}) + "\n"])
check("нула съвпаднали клетки -> rc 1", rc_z == 1, str(logs_z))
check("… и логва „0 клетки — няма какво да се сравни“",
      any("0 клетки" in l and "няма какво да се сравни" in l for l in logs_z), str(logs_z))
# (3) празен файл / само header
rc_e, logs_e = _cc("empty.jsonl", [])
check("празен файл -> rc 1", rc_e == 1, str(logs_e))
check("… и логва „не се брои“", any("не се брои" in l for l in logs_e), str(logs_e))
rc_ho, logs_ho = _cc("header_only.jsonl", [json.dumps({"period": [1996, 2025]}) + "\n"])
check("само header -> rc 1", rc_ho == 1, str(logs_ho))
check("… и логва „0 клетки“", any("0 клетки" in l for l in logs_ho), str(logs_ho))

print("\n====================================================")
print(f"  {OK} успешни, {FAIL} неуспешни")
for f in FAILURES:
    print(f"    ✗ {f}")
sys.exit(1 if FAIL else 0)
