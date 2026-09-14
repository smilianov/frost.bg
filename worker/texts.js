// Текстовете, които API-то връща на двата езика. Думата е „слана“.
export const TEXTS = {
  note: {
    bg: "ERA5 е мрежа от 9–25 км; в котловини нощният минимум е надценен и сланата е подценена — истинските дати може да са по-късни напролет и по-ранни наесен. Сравни височината на клетката с тази на мястото си.",
    en: "ERA5 is a 9–25 km grid; in valley bottoms the night minimum is overestimated and frost is underestimated — real dates may be later in spring and earlier in autumn. Compare the cell elevation with your location's elevation.",
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
        return { bg: "Пробни данни (синтетична мрежа)", en: "Sample data (synthetic grid)", url: null, attribution: null };
      default:
        throw new Error(`непознат source_id: ${sourceId}`);
    }
  },
  errors: {
    bad_request: { bg: "Невалидни координати: lat и lon са десетични градуси.",
                   en: "Invalid coordinates: lat and lon are decimal degrees." },
    outside_bulgaria: { bg: "Засега само за България.", en: "Bulgaria only for now." },
    geocoder_failed: { bg: "Услугата за търсене на места не отговори. Опитай пак след малко.",
                       en: "The place search did not respond. Try again shortly." },
    bad_query: { bg: "Търсенето иска поне 2 знака.", en: "The search needs at least 2 characters." },
    not_found: { bg: "Няма такъв адрес в API-то.", en: "No such API endpoint." },
  },
};
