"""Тестове за четенето от Copernicus CDS (NetCDF) и fetch_cds (без мрежа) —
пускат се с: .venv-cds/bin/python tests_cds.py

Ако netCDF4 не е наличен (значи venv-ът grid/.venv-cds не е бил активиран),
тестът пропуска тихо с изход 0, за да не чупи `npm test` на машина без venv-а.
"""
import copy, io, json, os, struct, sys, tempfile, types, zipfile
from datetime import date, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import netCDF4
except ImportError:
    print("пропуснато: няма netCDF4 (grid/.venv-cds)"); sys.exit(0)
import numpy as np                           # идва с netCDF4
import frost_estimate as fe                  # noqa: E402
import compute_grid as cg                    # noqa: E402
import cds_reader                            # noqa: E402
import fetch_cds                             # noqa: E402

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


LATS = [round(44.3 - 0.1 * i, 1) for i in range(32)]      # CDS дава ширината НИЗХОДЯЩО
LONS = [round(22.3 + 0.1 * j, 1) for j in range(65)]


def write_year_nc(path, year, tmin_c_fn, missing=()):
    """Един NetCDF като от CDS: t2m(valid_time, latitude, longitude) в Kelvin,
    valid_time в дни от 1 януари на годината. tmin_c_fn(d, lat, lon) -> °C. missing: дни (date) с fill."""
    days = []
    d = date(year, 1, 1)
    while d.year == year:
        days.append(d); d += timedelta(days=1)
    ds = netCDF4.Dataset(path, "w", format="NETCDF4")
    ds.createDimension("valid_time", len(days)); ds.createDimension("latitude", 32); ds.createDimension("longitude", 65)
    vt = ds.createVariable("valid_time", "i8", ("valid_time",)); vt.units = f"days since {year}-01-01 00:00:00"; vt.calendar = "proleptic_gregorian"
    la = ds.createVariable("latitude", "f8", ("latitude",)); lo = ds.createVariable("longitude", "f8", ("longitude",))
    t = ds.createVariable("t2m", "f4", ("valid_time", "latitude", "longitude"), fill_value=-9999.0); t.units = "K"
    vt[:] = list(range(len(days)))
    num = ds.createVariable("number", "i8"); num[...] = 0
    la[:] = LATS; lo[:] = LONS
    arr = np.full((len(days), 32, 65), -9999.0, dtype="f4")
    for i, dd in enumerate(days):
        if dd in missing: continue
        for a, lat in enumerate(LATS):
            for b, lon in enumerate(LONS):
                arr[i, a, b] = tmin_c_fn(dd, lat, lon) + 273.15
    t[:] = arr
    ds.close()


def write_geo_nc(path):
    ds = netCDF4.Dataset(path, "w", format="NETCDF4")
    ds.createDimension("time", 1); ds.createDimension("latitude", 32); ds.createDimension("longitude", 65)
    la = ds.createVariable("latitude", "f8", ("latitude",)); lo = ds.createVariable("longitude", "f8", ("longitude",))
    z = ds.createVariable("z", "f4", ("time", "latitude", "longitude")); z.units = "m**2 s**-2"
    la[:] = LATS; lo[:] = LONS
    z[0] = np.array([[(lat * 100 + lon) * 9.80665 for lon in LONS] for lat in LATS], dtype="f4")  # elev = lat*100+lon, лесно за проверка
    ds.close()


def _frost_dates(lat, year):
    """Пролетна/есенна дата на слана за тази ширина: денят се мести с 1 ден на
    всеки 0,1° северно спрямо юга (41.2 -> 10 април/20 октомври, без изместване).
    Целта е разменени редове на ширината в reader-а да дадат ГРЕШНА дата за
    дадена (lat, lon) — плоска (lat-независима) температура не би хванала това.
    Разстоянието стои изцяло в април–май и септември–октомври, така че 29
    февруари/високосна година никога не участват тук."""
    shift = round(lat * 10) - 412                    # 0 на юг (41.2) .. 31 на север (44.3)
    return date(year, 4, 10) + timedelta(days=shift), date(year, 10, 20) - timedelta(days=shift)


def frost(d, lat, lon):
    spring, autumn = _frost_dates(lat, d.year)
    return -1.0 if d in (spring, autumn) else 10.0


tmp = tempfile.mkdtemp()
section("Четене на една година от CDS NetCDF")
write_year_nc(os.path.join(tmp, "t2m_daily_min_2000.nc"), 2000, frost, missing={date(2000, 6, 1)})
by_cell = cds_reader.read_year(os.path.join(tmp, "t2m_daily_min_2000.nc"))
check("2 080 клетки", len(by_cell) == 2080, str(len(by_cell)))
days = by_cell[(42.2, 24.9)]
check("366 дни за 2000", len(days) == 366, str(len(days)))
check("Kelvin -> °C", abs(days[0][1] - 10.0) < 0.01, str(days[0]))
mid_spring, mid_autumn = _frost_dates(42.2, 2000)
check("сланата на (42.2, 24.9) е на изместения ден по формулата",
      any(d == mid_spring and t is not None and t <= 0 for d, t in days), str(mid_spring))
check("липсващ ден -> None", any(d == date(2000, 6, 1) and t is None for d, t in days))
check("ключовете са закръглени до 0.1 и в правоъгълника", all(round(a, 1) == a and round(b, 1) == b for a, b in by_cell) and (41.2, 22.3) in by_cell and (44.3, 28.7) in by_cell)

# ширината не е разменена: южният ред (41.2) остава на 10 април/20 октомври,
# северният (44.3) е изместен с точно 31 дни — ако reader-ът обърне редовете
# на ширината, тези две клетки ще имат разменените (грешните) дати.
south_days, north_days = by_cell[(41.2, 24.9)], by_cell[(44.3, 24.9)]
south_spring, south_autumn = _frost_dates(41.2, 2000)
north_spring, north_autumn = _frost_dates(44.3, 2000)
check("южният ред (41.2, 24.9): слана на 10 април — не е разменен",
      any(d == south_spring and t is not None and t <= 0 for d, t in south_days), str(south_spring))
check("северният ред (44.3, 24.9): слана на 11 май (31 дни по-късно) — не е разменен",
      north_spring == south_spring + timedelta(days=31)
      and any(d == north_spring and t is not None and t <= 0 for d, t in north_days),
      f"{north_spring} vs {south_spring}")
check("южният и северният ред имат различна слана (обръщане на редовете би ги оставило еднакви/разменени)",
      south_days != north_days)

section("Височина от геопотенциала")
write_geo_nc(os.path.join(tmp, "geopotential.nc"))
elev = cds_reader.read_elevation(os.path.join(tmp, "geopotential.nc"))
check("2 080 стойности, в метри", len(elev) == 2080 and elev[(42.2, 24.9)] == round(42.2 * 100 + 24.9), str(elev.get((42.2, 24.9))))
check("южният ред (41.2, 22.3) — не е разменен", elev.get((41.2, 22.3)) == round(41.2 * 100 + 22.3), str(elev.get((41.2, 22.3))))
check("северният ред (44.3, 22.3) — не е разменен", elev.get((44.3, 22.3)) == round(44.3 * 100 + 22.3), str(elev.get((44.3, 22.3))))

section("compute_grid --from-cds")
for y in range(1996, 2026):
    if y != 2000:
        write_year_nc(os.path.join(tmp, f"t2m_daily_min_{y}.nc"), y, frost)
rc = cg.main(["--from-cds", tmp, "--out", tmp, "--today", "2026-09-14"], stdout=io.StringIO())
g = json.load(open(os.path.join(tmp, "grid.json"), encoding="utf-8"))
check("връща 0 и пише 2 080 клетки", rc == 0 and len(g["cells"]) == 2080, str(rc))
c = next(x for x in g["cells"] if x["lat"] == 42.2 and x["lon"] == 24.9)
exp_spring_42, exp_autumn_42 = _frost_dates(42.2, 2001)          # невисокосна — годината, в която estimate_frost връща датите
exp_mmdd_42 = [cg._mmdd(exp_spring_42), cg._mmdd(exp_autumn_42)]
check("типична/сигурна от 30 години, по формулата на ширината", c["typical"] == exp_mmdd_42 and c["safe"] == exp_mmdd_42, str(c["typical"]))
check("височината от геопотенциала", c["elev"] == round(42.2 * 100 + 24.9), str(c["elev"]))
check("years_used 30", c["years_used"] == 30)
check("source казва CDS, synthetic false", "CDS" in g["source"] and g["synthetic"] is False, g["source"])
check("source_id е cds (Worker-ът етикетира източника по него)", g.get("source_id") == "cds", str(g.get("source_id")))
check("period 1996–2025", g["period"] == {"start": 1996, "end": 2025})

section("Липсваща година -> грешка, не тиха мрежа")
os.remove(os.path.join(tmp, "t2m_daily_min_2010.nc"))
out = io.StringIO()
rc = cg.main(["--from-cds", tmp, "--out", tmp, "--today", "2026-09-14"], stdout=out)
check("връща 1 и казва коя година липсва", rc == 1 and "2010" in out.getvalue(), out.getvalue()[-200:])

section("Кръстосана проверка с cells.jsonl от Open-Meteo")
# --cross-check FILE: за всяка клетка в FILE (формат cells.jsonl с header) печата разликата в дни; над 10 дни -> предупреждение и rc 1
write_year_nc(os.path.join(tmp, "t2m_daily_min_2010.nc"), 2010, frost)
exp_spring_43, exp_autumn_43 = _frost_dates(43.0, 2001)
om = os.path.join(tmp, "om.jsonl")
with open(om, "w", encoding="utf-8") as f:
    f.write(json.dumps({"period": [1996, 2025]}) + "\n")
    f.write(json.dumps({
        "lat": 42.2, "lon": 24.9,
        "typical": [cg._mmdd(exp_spring_42 + timedelta(days=2)), cg._mmdd(exp_autumn_42 - timedelta(days=1))],
        "safe": [cg._mmdd(exp_spring_42 + timedelta(days=3)), cg._mmdd(exp_autumn_42 - timedelta(days=2))],
    }) + "\n")   # 2 и 1 дни разлика (типична), 3 и 2 (сигурна)
    f.write(json.dumps({
        "lat": 43.0, "lon": 25.0,
        "typical": [cg._mmdd(exp_spring_43 + timedelta(days=30)), cg._mmdd(exp_autumn_43)],
        "safe": [cg._mmdd(exp_spring_43 + timedelta(days=32)), cg._mmdd(exp_autumn_43)],
    }) + "\n")   # 30 дни -> предупреждение
out = io.StringIO()
rc = cg.main(["--from-cds", tmp, "--out", tmp, "--today", "2026-09-14", "--cross-check", om], stdout=out)
check("кръстосаната проверка предупреждава за 43.0/25.0 и връща 1", rc == 1 and "43.0" in out.getvalue() and "30" in out.getvalue(), out.getvalue()[-400:])
check("а 42.2/24.9 минава (2 дни)", "42.2" in out.getvalue() and "2" in out.getvalue())
check("обобщението (бройка, най-голяма разлика) се печата дори при rc 1", "кръстосана проверка:" in out.getvalue(), out.getvalue()[-400:])
check("предупреждението за 43.0/25.0 е „над 10 дни“, не „n/a“", "над 10 дни" in out.getvalue(), out.getvalue()[-400:])

section("Кръстосана проверка: None срещу стойност — и осемте комбинации")
for field in ("typical", "safe"):
    for season in (0, 1):
        for reverse in (False, True):
            cell = {"lat": 42.2, "lon": 24.9, "typical": ["04-10", "10-20"], "safe": ["04-10", "10-20"]}
            rec = copy.deepcopy(cell)
            (rec if reverse else cell)[field][season] = None
            path8 = os.path.join(tmp, "none_vs_value.jsonl")
            with open(path8, "w", encoding="utf-8") as f:
                f.write(json.dumps({"period": [1996, 2025]}) + "\n")
                f.write(json.dumps(rec) + "\n")
            logs8 = []
            rc8 = cg._cross_check({"cells": [cell]}, path8, logs8.append)
            label = f"{field}[{season}] reverse={reverse}"
            check(f"None/стойност ({label}): rc 1", rc8 == 1, str(logs8))
            check(f"None/стойност ({label}): логва n/a — липсва стойност", any("n/a" in line for line in logs8), str(logs8))
            check(f"None/стойност ({label}): логва ПРЕДУПРЕЖДЕНИЕ", any("ПРЕДУПРЕЖДЕНИЕ" in line for line in logs8), str(logs8))
            check(f"None/стойност ({label}): не пише „над 10 дни“ (няма числова разлика)",
                  not any("над 10 дни" in line for line in logs8), str(logs8))

section("Кръстосана проверка: 29 февруари се брои като 1 март (както fe._key), не гърми")
cell29 = {"lat": 42.2, "lon": 24.9, "typical": ["02-29", "10-20"], "safe": ["02-29", "10-20"]}
path9 = os.path.join(tmp, "leap_in_grid.jsonl")
with open(path9, "w", encoding="utf-8") as f:
    f.write(json.dumps({"period": [1996, 2025]}) + "\n")
    f.write(json.dumps({"lat": 42.2, "lon": 24.9, "typical": ["03-01", "10-20"], "safe": ["03-01", "10-20"]}) + "\n")
logs9 = []
try:
    rc9 = cg._cross_check({"cells": [cell29]}, path9, logs9.append)
    check("02-29 в клетка от мрежата: не гърми, разлика 0 дни, rc 0", rc9 == 0, str(logs9))
except ValueError as e:
    check("02-29 в клетка от мрежата: не гърми, разлика 0 дни, rc 0", False, f"ValueError: {e}")

cell_norm = {"lat": 42.2, "lon": 24.9, "typical": ["03-01", "10-20"], "safe": ["03-01", "10-20"]}
path10 = os.path.join(tmp, "leap_in_om.jsonl")
with open(path10, "w", encoding="utf-8") as f:
    f.write(json.dumps({"period": [1996, 2025]}) + "\n")
    f.write(json.dumps({"lat": 42.2, "lon": 24.9, "typical": ["02-29", "10-20"], "safe": ["02-29", "10-20"]}) + "\n")
logs10 = []
try:
    rc10 = cg._cross_check({"cells": [cell_norm]}, path10, logs10.append)
    check("02-29 в OM файла: не гърми, разлика 0 дни, rc 0", rc10 == 0, str(logs10))
except ValueError as e:
    check("02-29 в OM файла: не гърми, разлика 0 дни, rc 0", False, f"ValueError: {e}")

section("fetch_cds: заявките и разархивирането, без мрежа")
req = fetch_cds.year_request(2000)
check("year_request(2000): точните ключове/стойности", req == {
    "variable": ["2m_temperature"],
    "year": "2000",
    "month": [f"{m:02d}" for m in range(1, 13)],
    "day": [f"{d:02d}" for d in range(1, 32)],
    "daily_statistic": "daily_minimum",
    "time_zone": "utc+02:00",
    "frequency": "1_hourly",
    "area": [44.3, 22.3, 41.2, 28.7],
}, str(req))
geo_req = fetch_cds.geo_request()
check("geo_request(): точните ключове/стойности", geo_req == {
    "variable": ["geopotential"], "year": "2025", "month": "01", "day": ["01"],
    "time": ["00:00"], "area": [44.3, 22.3, 41.2, 28.7], "data_format": "netcdf", "download_format": "unarchived",
}, str(geo_req))

tmpd = tempfile.mkdtemp()
nc_content = b"fake nc bytes"
zip_one = os.path.join(tmpd, "one.zip")
with zipfile.ZipFile(zip_one, "w") as z:
    z.writestr("data.nc", nc_content)
target = os.path.join(tmpd, "target.nc")
fetch_cds._extract_nc(zip_one, target)
check("_extract_nc: разархивира единствения .nc и трие zip-а",
      os.path.exists(target) and not os.path.exists(zip_one) and open(target, "rb").read() == nc_content)

zip_two = os.path.join(tmpd, "two.zip")
with zipfile.ZipFile(zip_two, "w") as z:
    z.writestr("a.nc", b"a"); z.writestr("b.nc", b"b")
target2 = os.path.join(tmpd, "target2.nc")
try:
    fetch_cds._extract_nc(zip_two, target2)
    check("zip с два .nc -> SystemExit", False, "не гръмна")
except SystemExit:
    check("zip с два .nc -> SystemExit", True)

plain_src = os.path.join(tmpd, "plain.nc")
with open(plain_src, "wb") as f:
    f.write(b"plain nc bytes")
target3 = os.path.join(tmpd, "target3.nc")
fetch_cds._extract_nc(plain_src, target3)
check("_extract_nc: чист .nc (не zip) се приема, преименува се направо",
      os.path.exists(target3) and not os.path.exists(plain_src) and open(target3, "rb").read() == b"plain nc bytes")


def _make_bad_crc_zip(path, member_name, content):
    """Валиден ZIP с един STORED член, после един обърнат байт в самите данни:
    централната директория (и is_zipfile) остават здрави, но CRC-32 не пасва —
    точно каквото дава прекъснато/повредено теглене от CDS."""
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED) as z:
        z.writestr(member_name, content)
    with zipfile.ZipFile(path) as z:
        info = z.getinfo(member_name)
    with open(path, "rb") as f:
        data = bytearray(f.read())
    fn_len, extra_len = struct.unpack("<HH", data[info.header_offset + 26:info.header_offset + 30])
    data_offset = info.header_offset + 30 + fn_len + extra_len
    data[data_offset] ^= 0xFF
    with open(path, "wb") as f:
        f.write(bytes(data))


section("fetch_cds: развален ZIP (лош CRC) не оставя лъжовен краен .nc")
tmpy = tempfile.mkdtemp()
year_target = os.path.join(tmpy, "t2m_daily_min_2050.nc")
bad_zip = os.path.join(tmpy, "bad.zip")
_make_bad_crc_zip(bad_zip, "data.nc", b"x" * 1000)
check("is_zipfile още смята zip-а за валиден (само CRC е лош)", zipfile.is_zipfile(bad_zip))
try:
    fetch_cds._extract_nc(bad_zip, year_target)
    check("развален CRC -> изключение (BadZipFile)", False, "не гръмна")
except zipfile.BadZipFile:
    check("развален CRC -> изключение (BadZipFile)", True)
check("не остава краен .nc файл", not os.path.exists(year_target))
check("не остава недовършен временен файл", not any(n.endswith((".part", ".part2")) for n in os.listdir(tmpy)))

calls = []


class _FakeResult:
    def download(self, path):
        calls.append(path)
        with open(path, "wb") as f:
            f.write(b"ok")


class _FakeClient:
    def retrieve(self, dataset, req):
        return _FakeResult()


fake_cdsapi = types.ModuleType("cdsapi")
fake_cdsapi.Client = _FakeClient
sys.modules["cdsapi"] = fake_cdsapi
try:
    msg = fetch_cds._fetch_year(2050, tmpy)
finally:
    del sys.modules["cdsapi"]
check("следващият опит НЕ прескача (реално тегли пак, а не „има го“)",
      calls == [os.path.join(tmpy, "t2m_daily_min_2050.nc.part")] and "има го" not in msg, f"{calls} {msg}")
check("след успешен втори опит файлът вече съществува", os.path.exists(year_target))

print("\n====================================================")
print(f"  {OK} успешни, {FAIL} неуспешни")
for f in FAILURES:
    print(f"    ✗ {f}")
sys.exit(1 if FAIL else 0)
