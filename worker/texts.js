// Текстовете, които API-то връща на двата езика. Думата е „слана“.
export const TEXTS = {
  note: {
    bg: "Числата са средни за площ около 9 × 9 км. В котловините често показват по-топли нощи, отколкото са в действителност — тоест по-малко слана, затова там истинските дати може да са по-късни напролет и по-ранни наесен. Полезно е да се сравни средната височина на площта с височината на мястото.",
    en: "The numbers are averages for an area of about 9 × 9 km. In valleys they often show warmer nights than there really are — that is, less frost — so the real dates there may be later in spring and earlier in autumn. It's worth comparing the area's average elevation with the place's own.",
  },
  // Задача 7: посочването за /api/v1/elevation (Open-Meteo Elevation,
  // Copernicus DEM GLO-90) — отделно от sourceLabel() по-долу, което е за
  // произхода на самата решетка (/frost), не за височината на точката.
  elevationSource: {
    bg: "Copernicus DEM GLO-90 през Open-Meteo",
    en: "Copernicus DEM GLO-90 via Open-Meteo",
    url: "https://open-meteo.com/en/docs/elevation-api",
    attribution: "Elevation data: Copernicus DEM GLO-90 · Weather data by Open-Meteo.com",
  },
  // year идва от данните (grid.computed), не от часовника — иначе тестовете
  // и продукцията заедно остаряват на Нова година. sourceId идва от
  // grid.source_id (compute_grid.py): cds | openmeteo | synthetic — етикетът,
  // връзката и посочването (изисквано от лиценза) следват истинския произход.
  // attribution е един низ, не двойка: това е задължителната формулировка на
  // самия лиценз (CDS, Open-Meteo), не превод.
  sourceLabel(start, end, year, sourceId = "cds") {
    switch (sourceId) {
      case "cds":
        return { bg: `ERA5-Land през Copernicus CDS, ${start}–${end}`, en: `ERA5-Land via Copernicus CDS, ${start}–${end}`,
                 url: "https://cds.climate.copernicus.eu/datasets/derived-era5-land-daily-statistics",
                 attribution: `Contains modified Copernicus Climate Change Service information ${year}` };
      case "openmeteo":
        return { bg: `ERA5 през Open-Meteo, ${start}–${end}`, en: `ERA5 via Open-Meteo, ${start}–${end}`,
                 url: "https://open-meteo.com/", attribution: "Weather data by Open-Meteo.com" };
      case "synthetic":
        return { bg: "Пробни данни (синтетични)", en: "Sample data (synthetic)", url: null, attribution: null };
      default:
        throw new Error(`непознат source_id: ${sourceId}`);
    }
  },
  errors: {
    bad_request: { bg: "Невалидни координати: lat и lon са десетични градуси.",
                   en: "Invalid coordinates: lat and lon are decimal degrees." },
    outside_bulgaria: { bg: "Засега само за България.", en: "Bulgaria only for now." },
    geocoder_failed: { bg: "Услугата за търсене на места не отговори. Опитайте пак след малко.",
                       en: "The place search did not respond. Try again shortly." },
    bad_query: { bg: "Търсенето иска поне 2 знака.", en: "The search needs at least 2 characters." },
    not_found: { bg: "Няма такъв адрес в API-то.", en: "No such API endpoint." },
    elevation_failed: { bg: "Услугата за височината не отговори. Опитайте пак след малко.",
                         en: "The elevation service did not respond. Try again shortly." },
  },
};
