// elevation.js — чиста трансформация: тялото на /api/v1/elevation -> какво
// да се покаже до клетката (текст + посочване). Не пипа DOM (тества се без
// браузър, в духа на paint.js/history.js) — app.js само рисува резултата.
// Fix wave (Task 7 review, blocker): по-рано app.js изхвърляше `source` от
// отговора, значи височината на точката се показваше без посочване към
// Open-Meteo/Copernicus, каквото изискват и двата лиценза — тази функция
// вече го пази, а app.js го рисува (елемент #elev-source).
import { num, safeHttpUrl } from "./format.js";

// Под толкова метра разлика двата модела височина (средната на клетката в
// ERA5-Land и точката в Copernicus DEM) не се различават повече от шума си.
// Над него разликата вече мести датите: за Маноле 53 м местят сигурната
// пролетна слана със седмица. Затова тук се предупреждава за посоката.
const WARN_M = 50;

// Предупреждение за ПОСОКАТА, без дни — нарочно, по решение на собственика:
// поправката на датите зависи почти изцяло от това колко бързо пада нощният
// минимум с височината, а това е най-несигурното. Асиметрията също е нарочна:
// по-високо значи по-студено, но по-ниско НЕ значи по-топло — нощем студеният
// въздух се стича в ниското, затова за ниска точка не обещаваме по-ранни дати.
function warning(m, cellElev, t) {
  const cell = num(cellElev);
  if (cell === null) return ""; // без височина на клетката няма с какво да се сравни
  const diff = m - cell;
  const rounded = Math.round(Math.abs(diff) / 10) * 10;
  if (diff >= WARN_M) return t.elev_above(rounded);
  if (diff <= -WARN_M) return t.elev_below(rounded);
  return "";
}

export function elevationView(body, { lang, t, cellElev }) {
  const m = num(body?.elevation_m);
  if (m === null) return null; // грешка/липсваща стойност -> реда просто липсва (никога 0)
  const source = body?.source ?? {};
  return {
    pointElevText: t.point_elev(m),
    elevNoteText: t.elev_note,
    warnText: warning(m, cellElev, t),
    sourceText: typeof source[lang] === "string" ? source[lang] : "",
    sourceUrl: safeHttpUrl(source.url),
    sourceAttribution: typeof source.attribution === "string" ? source.attribution : "",
  };
}
