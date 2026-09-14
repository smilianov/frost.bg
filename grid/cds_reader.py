"""Четене на NetCDF файлове от Copernicus CDS (ERA5-Land daily statistics)."""
from __future__ import annotations
from datetime import date
from typing import Dict, List, Optional, Tuple
import netCDF4
import numpy as np

Day = Tuple[date, Optional[float]]


def _var(ds: netCDF4.Dataset, *names: str):
    for n in names:
        if n in ds.variables:
            return ds.variables[n]
    raise KeyError(f"липсва променлива {names} в {ds.filepath()}")


def _coords(ds):
    lats = [round(float(x), 1) for x in _var(ds, "latitude", "lat")[:]]
    lons = [round(float(x), 1) for x in _var(ds, "longitude", "lon")[:]]
    return lats, lons


def read_year(path: str) -> Dict[Tuple[float, float], List[Day]]:
    """t2m(time, lat, lon) в Kelvin → по клетка: [(дата, °C или None)]."""
    ds = netCDF4.Dataset(path)
    try:
        lats, lons = _coords(ds)
        tv = _var(ds, "valid_time", "time")
        times = netCDF4.num2date(tv[:], tv.units, getattr(tv, "calendar", "standard"),
                                 only_use_cftime_datetimes=False, only_use_python_datetimes=True)
        days = [date(t.year, t.month, t.day) for t in times]
        t2m = _var(ds, "t2m", "2m_temperature")
        arr = np.ma.filled(t2m[:].astype("f8"), np.nan)          # fill → NaN
        if arr.ndim == 4:                                         # понякога има измерение expver/number
            arr = arr[:, 0, :, :] if arr.shape[1] < arr.shape[2] else arr[0]
        out: Dict[Tuple[float, float], List[Day]] = {}
        for a, lat in enumerate(lats):
            for b, lon in enumerate(lons):
                col = arr[:, a, b]
                out[(lat, lon)] = [(d, None if np.isnan(v) else round(float(v) - 273.15, 2)) for d, v in zip(days, col)]
        return out
    finally:
        ds.close()


def read_elevation(path: str) -> Dict[Tuple[float, float], int]:
    """z (m² s⁻²) → метри: z / 9.80665, закръглено."""
    ds = netCDF4.Dataset(path)
    try:
        lats, lons = _coords(ds)
        z = np.ma.filled(_var(ds, "z", "geopotential")[:].astype("f8"), np.nan)
        while z.ndim > 2:
            z = z[0]
        return {(lat, lon): int(round(float(z[a, b]) / 9.80665))
                for a, lat in enumerate(lats) for b, lon in enumerate(lons)}
    finally:
        ds.close()
