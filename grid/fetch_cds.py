"""Тегли от Copernicus CDS: 30 години дневни минимуми на 2 м (ERA5-Land) + геопотенциал.

    .venv-cds/bin/python fetch_cds.py [--out cds] [--start 1996 --end 2025] [--parallel 3]

Иска ~/.cdsapirc с ключа на собственика и приет лиценз на наборите в сайта на CDS.
Продължава: съществуващи файлове се прескачат, .part файлове от прекъснат опит
се презаписват. Всяка година е отделна заявка (опашката на CDS е минути до
часове); --parallel N (по подразбиране 3) тегли до N години наведнъж, всяка в
своя нишка със свой cdsapi.Client() — --parallel 1 за последователно теглене.
Резултатът е zip с един NetCDF или чист NetCDF — и двете се приемат, разархивира
се до t2m_daily_min_<YYYY>.nc.
"""
import argparse
import os
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date

AREA = [44.3, 22.3, 41.2, 28.7]          # N, W, S, E — правоъгълникът на България, стъпка 0,1
DATASET = "derived-era5-land-daily-statistics"
GEO_DATASET = "reanalysis-era5-land"


def year_request(year: int) -> dict:
    return {
        "variable": ["2m_temperature"],
        "year": str(year),
        "month": [f"{m:02d}" for m in range(1, 13)],
        "day": [f"{d:02d}" for d in range(1, 32)],
        "daily_statistic": "daily_minimum",
        "time_zone": "utc+02:00",
        "frequency": "1_hourly",
        "area": AREA,
    }


def geo_request() -> dict:
    return {"variable": ["geopotential"], "year": "2025", "month": "01", "day": ["01"],
            "time": ["00:00"], "area": AREA, "data_format": "netcdf", "download_format": "unarchived"}


def _extract_nc(zip_or_nc: str, target: str) -> None:
    if zipfile.is_zipfile(zip_or_nc):
        with zipfile.ZipFile(zip_or_nc) as z:
            names = [n for n in z.namelist() if n.endswith(".nc")]
            if len(names) != 1:
                raise SystemExit(f"очаквах един .nc в архива, има {names}")
            with z.open(names[0]) as src, open(target, "wb") as dst:
                dst.write(src.read())
        os.remove(zip_or_nc)
    else:
        os.replace(zip_or_nc, target)


def _fetch_year(y: int, out: str) -> str:
    """Тегли една година; готов файл се прескача. Отделен cdsapi.Client() за всяко извикване,
    за да може всяка нишка да си има свой (клиентът не е сигурно безопасен между нишки)."""
    target = os.path.join(out, f"t2m_daily_min_{y}.nc")
    if os.path.exists(target):
        return f"{y}: има го"
    print(f"{y}: заявка към CDS (може да чака на опашка)…", flush=True)
    import cdsapi
    client = cdsapi.Client()
    tmp = target + ".part"
    client.retrieve(DATASET, year_request(y)).download(tmp)
    _extract_nc(tmp, target)
    return f"{y}: {os.path.getsize(target) // 1024} KB"


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "cds"))
    p.add_argument("--start", type=int, default=date.today().year - 30)
    p.add_argument("--end", type=int, default=date.today().year - 1)
    p.add_argument("--parallel", type=int, default=3, help="успоредни години (нишки, всяка със свой cdsapi.Client())")
    a = p.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    import cdsapi                                    # тук, за да може --help да работи без него

    geo = os.path.join(a.out, "geopotential.nc")
    if not os.path.exists(geo):
        print("геопотенциал…", flush=True)
        client = cdsapi.Client()
        tmp = geo + ".part"
        client.retrieve(GEO_DATASET, geo_request()).download(tmp)
        _extract_nc(tmp, geo)

    years = list(range(a.start, a.end + 1))
    workers = max(1, a.parallel)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_fetch_year, y, a.out): y for y in years}
        for fut in as_completed(futures):
            print(fut.result(), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
