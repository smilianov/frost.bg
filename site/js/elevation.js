// elevation.js — чиста трансформация: тялото на /api/v1/elevation -> какво
// да се покаже до клетката (текст + посочване). Не пипа DOM (тества се без
// браузър, в духа на paint.js/history.js) — app.js само рисува резултата.
// Fix wave (Task 7 review, blocker): по-рано app.js изхвърляше `source` от
// отговора, значи височината на точката се показваше без посочване към
// Open-Meteo/Copernicus, каквото изискват и двата лиценза — тази функция
// вече го пази, а app.js го рисува (елемент #elev-source).
import { num, safeHttpUrl } from "./format.js";

export function elevationView(body, { lang, t }) {
  const m = num(body?.elevation_m);
  if (m === null) return null; // грешка/липсваща стойност -> реда просто липсва (никога 0)
  const source = body?.source ?? {};
  return {
    pointElevText: t.point_elev(m),
    elevNoteText: t.elev_note,
    sourceText: typeof source[lang] === "string" ? source[lang] : "",
    sourceUrl: safeHttpUrl(source.url),
    sourceAttribution: typeof source.attribution === "string" ? source.attribution : "",
  };
}
