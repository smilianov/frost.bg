import { test } from "node:test";
import assert from "node:assert/strict";
import { T } from "./texts.js";
import { readFileSync } from "node:fs";

test("bg и en имат едни и същи ключове", () => {
  assert.deepEqual(Object.keys(T.bg).sort(), Object.keys(T.en).sort());
});
test("никъде „мраз“; думата е „слана“", () => {
  const all = Object.values(T.bg).join(" ");
  assert.ok(!all.includes("мраз")); assert.ok(all.includes("слана"));
});
// Footer-ът кредитира геокодера и източника според /config — текстът за
// всеки случай е в речника, на двата езика.
test("footer: кредит за геокодера (openmeteo/google) и етикети за източника (cds/openmeteo/synthetic) на двата езика", () => {
  for (const lang of ["bg", "en"]) {
    for (const k of ["credit_openmeteo", "credit_google", "src_cds", "src_openmeteo", "src_synthetic"]) {
      assert.ok(typeof T[lang][k] === "string" && T[lang][k].trim(), `${lang}.${k}`);
    }
    assert.ok(T[lang].credit_openmeteo.includes("Open-Meteo"), lang);
    assert.ok(T[lang].credit_google.includes("Google"), lang);
    assert.ok(!T[lang].src_synthetic.includes("ERA5"), `${lang}: синтетичното не е ERA5`);
  }
  assert.notEqual(T.bg.credit_openmeteo, T.en.credit_openmeteo);
});
// Заглавието: на страницата и в раздела на браузъра е едно и също, и на
// двата езика казва едно и също — „в района“ / „in your area“. Площта е
// около 9 × 9 км, не точната градина (собственикът, 5 октомври 2026).
test("заглавието е едно и също в раздела и на страницата; en казва „area“ като bg „района“", () => {
  for (const [lang, file] of [["bg", "../index.html"], ["en", "../en/index.html"]]) {
    const html = readFileSync(new URL(file, import.meta.url), "utf8");
    const tab = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
    assert.equal(tab, `frost.bg — ${T[lang].title.replace(/\?$/, "").toLowerCase()}`, lang);
  }
  assert.ok(T.bg.title.includes("в района"), T.bg.title);
  assert.ok(/\bin your area\b/.test(T.en.title) && !/your place/.test(T.en.title), T.en.title);
});
test("нищо празно", () => {
  for (const lang of ["bg", "en"]) for (const [k, v] of Object.entries(T[lang])) assert.ok(String(v).trim(), `${lang}.${k}`);
});
