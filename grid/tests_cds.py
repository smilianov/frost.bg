"""Тестове за четенето от Copernicus CDS (NetCDF) и fetch_cds (без мрежа) —
пускат се с: .venv-cds/bin/python tests_cds.py

Ако netCDF4 не е наличен (значи venv-ът grid/.venv-cds не е бил активиран),
тестът пропуска тихо с изход 0, за да не чупи `npm test` на машина без venv-а.
"""
import io, json, os, sys, tempfile, zipfile
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


tmp = tempfile.mkdtemp()
section("Четене на една година от CDS NetCDF")
frost = lambda d, lat, lon: -1.0 if (d.month, d.day) in ((4, 10), (10, 20)) else 10.0
write_year_nc(os.path.join(tmp, "t2m_daily_min_2000.nc"), 2000, frost, missing={date(2000, 6, 1)})
by_cell = cds_reader.read_year(os.path.join(tmp, "t2m_daily_min_2000.nc"))
check("2 080 клетки", len(by_cell) == 2080, str(len(by_cell)))
days = by_cell[(42.2, 24.9)]
check("366 дни за 2000", len(days) == 366, str(len(days)))
check("Kelvin -> °C", abs(days[0][1] - 10.0) < 0.01, str(days[0]))
check("сланата е на 10 април", any(d == date(2000, 4, 10) and t is not None and t <= 0 for d, t in days))
check("липсващ ден -> None", any(d == date(2000, 6, 1) and t is None for d, t in days))
check("ключовете са закръглени до 0.1 и в правоъгълника", all(round(a, 1) == a and round(b, 1) == b for a, b in by_cell) and (41.2, 22.3) in by_cell and (44.3, 28.7) in by_cell)

section("Височина от геопотенциала")
write_geo_nc(os.path.join(tmp, "geopotential.nc"))
elev = cds_reader.read_elevation(os.path.join(tmp, "geopotential.nc"))
check("2 080 стойности, в метри", len(elev) == 2080 and elev[(42.2, 24.9)] == round(42.2 * 100 + 24.9), str(elev.get((42.2, 24.9))))

section("compute_grid --from-cds")
for y in range(1996, 2026):
    if y != 2000:
        write_year_nc(os.path.join(tmp, f"t2m_daily_min_{y}.nc"), y, frost)
rc = cg.main(["--from-cds", tmp, "--out", tmp, "--today", "2026-09-14"], stdout=io.StringIO())
g = json.load(open(os.path.join(tmp, "grid.json"), encoding="utf-8"))
check("връща 0 и пише 2 080 клетки", rc == 0 and len(g["cells"]) == 2080, str(rc))
c = next(x for x in g["cells"] if x["lat"] == 42.2 and x["lon"] == 24.9)
check("типична/сигурна от 30 години", c["typical"] == ["04-10", "10-20"] and c["safe"] == ["04-10", "10-20"], str(c["typical"]))
check("височината от геопотенциала", c["elev"] == round(42.2 * 100 + 24.9), str(c["elev"]))
check("years_used 30", c["years_used"] == 30)
check("source казва CDS, synthetic false", "CDS" in g["source"] and g["synthetic"] is False, g["source"])
check("period 1996–2025", g["period"] == {"start": 1996, "end": 2025})

section("Липсваща година -> грешка, не тиха мрежа")
os.remove(os.path.join(tmp, "t2m_daily_min_2010.nc"))
out = io.StringIO()
rc = cg.main(["--from-cds", tmp, "--out", tmp, "--today", "2026-09-14"], stdout=out)
check("връща 1 и казва коя година липсва", rc == 1 and "2010" in out.getvalue(), out.getvalue()[-200:])

section("Кръстосана проверка с cells.jsonl от Open-Meteo")
# --cross-check FILE: за всяка клетка в FILE (формат cells.jsonl с header) печата разликата в дни; над 10 дни -> предупреждение и rc 1
write_year_nc(os.path.join(tmp, "t2m_daily_min_2010.nc"), 2010, frost)
om = os.path.join(tmp, "om.jsonl")
with open(om, "w", encoding="utf-8") as f:
    f.write(json.dumps({"period": [1996, 2025]}) + "\n")
    f.write(json.dumps({"lat": 42.2, "lon": 24.9, "typical": ["04-12", "10-19"], "safe": ["04-13", "10-18"]}) + "\n")   # 2 и 1 дни разлика
    f.write(json.dumps({"lat": 43.0, "lon": 25.0, "typical": ["05-10", "10-20"], "safe": ["05-12", "10-20"]}) + "\n")   # 30 дни -> предупреждение
out = io.StringIO()
rc = cg.main(["--from-cds", tmp, "--out", tmp, "--today", "2026-09-14", "--cross-check", om], stdout=out)
check("кръстосаната проверка предупреждава за 43.0/25.0 и връща 1", rc == 1 and "43.0" in out.getvalue() and "30" in out.getvalue(), out.getvalue()[-300:])
check("а 42.2/24.9 минава (2 дни)", "42.2" in out.getvalue() and "2" in out.getvalue())

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

print("\n====================================================")
print(f"  {OK} успешни, {FAIL} неуспешни")
for f in FAILURES:
    print(f"    ✗ {f}")
sys.exit(1 if FAIL else 0)
