// texts.js — всичко, което човекът чете. Думата е „слана“.
export const T = {
  bg: {
    title: "Кога е сланата при теб?",
    lead: "Последна пролетна и първа есенна слана за всяко място в България — от 30 години данни.",
    search_label: "Населено място", search_placeholder: "напр. Маноле",
    map_label: "Или посочи на картата", coords_label: "Или координати",
    lat: "Ширина", lon: "Дължина", locate: "Вземи от телефона", go: "Покажи",
    typical: "Типична", safe: "Сигурна",
    typical_hint: "в половината години сланата вече е минала",
    safe_hint: "в 9 от 10 години",
    last_spring: "последна пролетна слана", first_autumn: "първа есенна слана",
    cell: "Клетка на мрежата", elev: "височина", distance: "на", km: "км",
    note_title: "Бележка", source: "Източник", period: "период", api: "За програмисти: пълният отговор на API-то (JSON)",
    outside: "Засега само за България.", network_error: "Няма връзка. Опитай пак.",
    geo_denied: "Телефонът не даде местоположение — въведи го на ръка или посочи на картата.",
    searching: "търся…", no_results: "нищо не намерих — опитай друго изписване или посочи на картата",
    synthetic_banner: "Пробни данни — истинската мрежа още се смята.",
    coords_missing: "Въведи и двете координати.",
    lang_switch: "English", lang_switch_href: "/en/",
    // footer: източникът на мрежата (по /config grid.source_id) и кой дава имената на местата (по /config geocoder)
    src_cds: "ERA5-Land през Copernicus CDS", src_openmeteo: "ERA5 през Open-Meteo", src_synthetic: "пробни данни (синтетична мрежа)",
    credit_openmeteo: "Open-Meteo (имена на места)", credit_google: "Google (имена на места)",

    // фаза 2 — историята
    history: "Историята по години", window_label: "Период",
    window_years: (n) => `последните ${n} години`,
    window_note: (from, to, withData, n) => `${from}–${to} · ${withData} от ${n} години с данни`,
    too_few_years: "твърде малко години за надеждна дата — графиката показва самите години",
    compare_spring: (fullDate, recentDate, days, dir) => dir === "same"
      ? `типичната пролетна слана: ${fullDate} за 30 години, ${recentDate} за последните 10 — без осезаема разлика`
      : `типичната пролетна слана: ${fullDate} за 30 години, ${recentDate} за последните 10 — с ${days} дни по-${dir === "earlier" ? "рано" : "късно"}`,
    compare_autumn: (fullDate, recentDate, days, dir) => dir === "same"
      ? `типичната есенна слана: ${fullDate} за 30 години, ${recentDate} за последните 10 — без осезаема разлика`
      : `типичната есенна слана: ${fullDate} за 30 години, ${recentDate} за последните 10 — с ${days} дни по-${dir === "earlier" ? "рано" : "късно"}`,
    season: "Сезон без слана",
    season_summary: (typical, min, max) => `типично ${typical} дни (най-къс ${min}, най-дълъг ${max})`,
    season_years: (years) => `години: ${years.join(", ")}`,
    season_shortest_label: "най-къс:", season_longest_label: "най-дълъг:",
    season_clipped: "липсваща пролетна дата отброява сезона от началото на годината, липсваща есенна — до края ѝ",
    risk_label: "Риск от слана след дата",
    risk_day: "ден", risk_month: "месец", risk_go: "Сметни",
    risk_result: (count, total, date, percent) =>
      `В ${count} от ${total} години с данни тази клетка е записала слана след ${date} и преди 1 юли — ${percent} %.`,
    risk_disclaimer: "Историческа честота, не прогноза за тази година; слана на самата дата не се брои.",
    risk_small_sample: "Малка извадка — описва само тези години; нула случая не значи нулев риск.",
    risk_bad_date: "Въведи ден и месец между 1 януари и 30 юни.",
    risk_unavailable: "Недостъпно — в избрания прозорец няма използваеми години.",
    risk_feb29_note: "29 февруари се брои като 1 март.",
    safe_means: (count, total, date) => `сигурната дата ${date} значи: в ${count} от ${total} години е имало слана след нея`,
    table_caption: "Последна пролетна и първа есенна слана по години",
    year: "Година", no_frost_recorded: "няма записана слана",
    chart_title: (lat, lon, from, to) => `История на клетката ${lat}, ${lon} по ERA5-Land, ${from}–${to}, праг 0 °C`,
    csv_download: "Свали CSV",
    no_history: "За тази клетка няма години с данни.",
    no_frost_any: "В наличните данни за тази клетка не е записана слана — нито напролет, нито наесен.",
    // за chart.js: renderChart/renderTable (не са в списъка от sdd-документа)
    spring_word: "пролетна", autumn_word: "есенна",
    no_data_year: "няма достатъчно данни",
    // Ф5/преглед: единственият жив статус — #status (визуално скрит), не #result
    status_result_ready: (lat, lon) => `Резултат готов за ${lat}, ${lon}.`,
    status_window_changed: (n) => `Периодът е сменен на последните ${n} години.`,
  },
  en: {
    title: "When is the frost at your place?",
    lead: "Last spring and first autumn frost for any place in Bulgaria — from 30 years of data.",
    search_label: "Town or village", search_placeholder: "e.g. Manole",
    map_label: "Or point on the map", coords_label: "Or coordinates",
    lat: "Latitude", lon: "Longitude", locate: "Use my location", go: "Show",
    typical: "Typical", safe: "Safe",
    typical_hint: "in half the years the frost is over by then",
    safe_hint: "in 9 years out of 10",
    last_spring: "last spring frost", first_autumn: "first autumn frost",
    cell: "Grid cell", elev: "elevation", distance: "at", km: "km",
    note_title: "Note", source: "Source", period: "period", api: "For developers: the API's full response (JSON)",
    outside: "Bulgaria only for now.", network_error: "No connection. Try again.",
    geo_denied: "No location from the device — type it or point on the map.",
    searching: "searching…", no_results: "nothing found — try another spelling or point on the map",
    synthetic_banner: "Sample data — the real grid is still being computed.",
    coords_missing: "Enter both coordinates.",
    lang_switch: "Български", lang_switch_href: "/",
    // footer: the grid's source (from /config grid.source_id) and who provides place names (from /config geocoder)
    src_cds: "ERA5-Land via Copernicus CDS", src_openmeteo: "ERA5 via Open-Meteo", src_synthetic: "sample data (synthetic grid)",
    credit_openmeteo: "Open-Meteo (place names)", credit_google: "Google (place names)",

    // phase 2 — the history
    history: "History by year", window_label: "Period",
    window_years: (n) => `last ${n} years`,
    window_note: (from, to, withData, n) => `${from}–${to} · ${withData} of ${n} years with data`,
    too_few_years: "too few years for a reliable date — the chart shows the years themselves",
    compare_spring: (fullDate, recentDate, days, dir) => dir === "same"
      ? `typical spring frost: ${fullDate} over 30 years, ${recentDate} over the last 10 — no noticeable change`
      : `typical spring frost: ${fullDate} over 30 years, ${recentDate} over the last 10 — ${days} days ${dir === "earlier" ? "earlier" : "later"}`,
    compare_autumn: (fullDate, recentDate, days, dir) => dir === "same"
      ? `typical autumn frost: ${fullDate} over 30 years, ${recentDate} over the last 10 — no noticeable change`
      : `typical autumn frost: ${fullDate} over 30 years, ${recentDate} over the last 10 — ${days} days ${dir === "earlier" ? "earlier" : "later"}`,
    season: "Frost-free season",
    season_summary: (typical, min, max) => `typically ${typical} days (shortest ${min}, longest ${max})`,
    season_years: (years) => `years: ${years.join(", ")}`,
    season_shortest_label: "shortest:", season_longest_label: "longest:",
    season_clipped: "a missing spring date starts the season at the beginning of the year, a missing autumn date extends it to the end",
    risk_label: "Risk of frost after a date",
    risk_day: "day", risk_month: "month", risk_go: "Calculate",
    risk_result: (count, total, date, percent) =>
      `In ${count} of ${total} years with data, this cell recorded frost after ${date} and before July 1 — ${percent}%.`,
    risk_disclaimer: "Historical frequency, not a forecast for this year; frost on the date itself does not count.",
    risk_small_sample: "Small sample — describes only these years; zero occurrences does not mean zero risk.",
    risk_bad_date: "Enter a day and month between January 1 and June 30.",
    risk_unavailable: "Unavailable — the selected window has no usable years.",
    risk_feb29_note: "February 29 counts as March 1.",
    safe_means: (count, total, date) => `the safe date ${date} means: ${count} of ${total} years had frost after it`,
    table_caption: "Last spring and first autumn frost by year",
    year: "Year", no_frost_recorded: "no frost recorded",
    chart_title: (lat, lon, from, to) => `History of cell ${lat}, ${lon} from ERA5-Land, ${from}–${to}, 0 °C threshold`,
    csv_download: "Download CSV",
    no_history: "No years with data for this cell.",
    no_frost_any: "No frost was recorded in the available data for this cell — neither in spring nor in autumn.",
    // for chart.js: renderChart/renderTable (not in the sdd document's list)
    spring_word: "spring", autumn_word: "autumn",
    no_data_year: "not enough data",
    // Ф5/review: the one live status — #status (visually hidden), not #result
    status_result_ready: (lat, lon) => `Result ready for ${lat}, ${lon}.`,
    status_window_changed: (n) => `Period changed to the last ${n} years.`,
  },
};
