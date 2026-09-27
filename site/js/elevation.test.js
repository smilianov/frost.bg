// Височината на точката: чистата трансформация в elevation.js — без DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { elevationView } from "./elevation.js";

const t = { point_elev: (m) => `≈ ${m} m`, elev_note: "note" };
const source = {
  bg: "Copernicus DEM GLO-90 през Open-Meteo",
  en: "Copernicus DEM GLO-90 via Open-Meteo",
  url: "https://open-meteo.com/en/docs/elevation-api",
  attribution: "Elevation data: Copernicus DEM GLO-90 · Weather data by Open-Meteo.com",
};

// Fix wave (blocker): app.js по-рано изхвърляше `source` — този тест доказва,
// че view моделът вече го пази (текст, връзка, посочване), не само елевацията.
test("elevationView: успешен отговор пази source (текст, url, посочване), не го изхвърля", () => {
  const view = elevationView({ elevation_m: 152, source }, { lang: "en", t });
  assert.equal(view.pointElevText, "≈ 152 m");
  assert.equal(view.elevNoteText, "note");
  assert.equal(view.sourceText, "Copernicus DEM GLO-90 via Open-Meteo");
  assert.equal(view.sourceUrl, "https://open-meteo.com/en/docs/elevation-api");
  assert.equal(view.sourceAttribution, "Elevation data: Copernicus DEM GLO-90 · Weather data by Open-Meteo.com");
});
test("elevationView: bg взима bg текста на source", () => {
  const view = elevationView({ elevation_m: 152, source }, { lang: "bg", t });
  assert.equal(view.sourceText, "Copernicus DEM GLO-90 през Open-Meteo");
});
test("elevationView: elevation_m === null -> null, никакъв текст/посочване", () => {
  assert.equal(elevationView({ elevation_m: null, source }, { lang: "bg", t }), null);
});
test("elevationView: липсващ/негоден elevation_m -> null", () => {
  assert.equal(elevationView({}, { lang: "bg", t }), null);
  assert.equal(elevationView({ elevation_m: "abc" }, { lang: "bg", t }), null);
  assert.equal(elevationView(null, { lang: "bg", t }), null);
});
test("elevationView: 0 е валидна височина, не се третира като липсваща", () => {
  const view = elevationView({ elevation_m: 0, source }, { lang: "bg", t });
  assert.equal(view.pointElevText, "≈ 0 m");
});
test("elevationView: опасен url (напр. javascript:) се отхвърля от safeHttpUrl", () => {
  const view = elevationView({ elevation_m: 10, source: { ...source, url: "javascript:alert(1)" } }, { lang: "bg", t });
  assert.equal(view.sourceUrl, null);
});
test("elevationView: липсващ source -> празни низове/null, не гърми", () => {
  const view = elevationView({ elevation_m: 10 }, { lang: "bg", t });
  assert.equal(view.sourceText, "");
  assert.equal(view.sourceUrl, null);
  assert.equal(view.sourceAttribution, "");
});

// Предупреждението за разликата във височината (0.3.4). Изчисленията за
// Маноле показаха, че още 53 м над средната височина на клетката местят
// сигурната пролетна дата със седмица (11.04 → 18.04), а зависят почти
// изцяло от това колко бързо пада нощният минимум с височината — затова
// предупреждаваме за ПОСОКАТА, без дни. Асиметрията е нарочна: по-високо
// значи по-студено, но по-ниско НЕ значи по-топло (нощем студеният въздух
// се стича в ниското), така че за ниска точка не обещаваме по-ранни дати.
const tw = { ...t, elev_above: (m) => `above ${m}`, elev_below: (m) => `below ${m}` };
const warn = (point, cellElev) =>
  elevationView({ elevation_m: point, source }, { lang: "bg", t: tw, cellElev }).warnText;

test("предупреждение: точка 53 м над клетката (Маноле: 152 срещу 99) -> по-високо, закръглено до 10 м", () => {
  assert.equal(warn(152, 99), "above 50");
});
test("предупреждение: точка 81 м под клетката -> по-ниско, закръглено до 10 м", () => {
  assert.equal(warn(99, 180), "below 80");
});
test("предупреждение: прагът е 50 м включително — 50 над дава предупреждение, 49 не", () => {
  assert.equal(warn(150, 100), "above 50");
  assert.equal(warn(149, 100), "");
});
test("предупреждение: прагът е 50 м включително и надолу — 50 под дава предупреждение, 49 не", () => {
  assert.equal(warn(50, 100), "below 50");
  assert.equal(warn(51, 100), "");
});
test("предупреждение: закръглянето е до най-близките 10 м (55 -> 60, 54 -> 50)", () => {
  assert.equal(warn(155, 100), "above 60");
  assert.equal(warn(154, 100), "above 50");
});
test("предупреждение: без височина на клетката няма предупреждение (не се измисля)", () => {
  assert.equal(warn(400, undefined), "");
  assert.equal(warn(400, null), "");
  assert.equal(warn(400, "abc"), "");
});
