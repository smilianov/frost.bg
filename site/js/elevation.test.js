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
