// Решение на собственика (27 септември 2026): в текста за хора изчислителната
// решетка е „площ около 9 × 9 км“, после „площта“ („an area of about 9 × 9
// km“, „the area“). „Мрежа“ се чете като интернет — самият собственик я
// прочете така. „Решетката“ остава за разработчиците (README, docs/,
// коментарите) и тук не се проверява.
//
// „9 × 9 км“, не „площ от 9 км“: второто се чете като 9 км², а площта е около
// 90 км² (≈ 11 км север–юг × ≈ 8 км изток–запад на 42° с. ш.).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { T } from "./texts.js";
import { TEXTS } from "../../worker/texts.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
// Кодът на страницата не е текст за хора — остава видимото и атрибутите.
const page = (p) => read(p).replace(/<(script|style)\b[\s\S]*?<\/\1>/g, "");

// Функциите в речника се четат като изходен код — шаблонът им е текстът.
const dict = (lang) => Object.values(T[lang]).map(String).join("\n");
const worker = (lang) =>
  [
    TEXTS.note[lang],
    TEXTS.elevationSource[lang],
    ...["cds", "openmeteo", "synthetic"].map((id) => TEXTS.sourceLabel(1996, 2025, 2026, id)[lang]),
    ...Object.values(TEXTS.errors).map((e) => e[lang]),
  ].join("\n");

const HUMAN = {
  bg: {
    "site/guide/index.html": page("../guide/index.html"),
    "site/index.html": page("../index.html"),
    "site/js/texts.js (bg)": dict("bg"),
    "worker/texts.js (bg)": worker("bg"),
  },
  en: {
    "site/en/guide/index.html": page("../en/guide/index.html"),
    "site/en/index.html": page("../en/index.html"),
    "site/js/texts.js (en)": dict("en"),
    "worker/texts.js (en)": worker("en"),
  },
};

// Само съществителното: „мрежова грешка“ (интернет) не е решетката.
const MREZHA = /(?<!\p{L})мреж(?:а|ата|и|ите)(?!\p{L})/iu;
const GRID = /(?<!\p{L})grids?(?!\p{L})/iu;

test("в текста за хора няма „мрежа“ (bg) и „grid“ (en) — казва се „площ“ / „area“", () => {
  for (const [lang, re] of [["bg", MREZHA], ["en", GRID]]) {
    for (const [name, text] of Object.entries(HUMAN[lang])) {
      const m = text.match(re);
      assert.equal(m, null, `${name}: „${m?.[0]}“ в текст за хора — …${text.slice(Math.max(0, m?.index - 60), m?.index + 60)}…`);
    }
  }
});

test("размерът на площта е „9 × 9 км“, никога само „9 км“", () => {
  for (const [lang, unit] of [["bg", "км"], ["en", "km"]]) {
    for (const [name, text] of Object.entries(HUMAN[lang])) {
      const rest = text.replaceAll(`9 × 9 ${unit}`, "");
      const lone = rest.match(new RegExp(`(?<![\\d.,])9\\s*${unit}(?!\\p{L})`, "u"));
      assert.equal(lone, null, `${name}: „9 ${unit}“ без „9 ×“ се чете като 9 ${unit}²`);
    }
  }
});

test("площта се въвежда с „около 9 × 9 км“ там, където човекът я среща за първи път", () => {
  // Ръководството: абзацът, който започва „Двете височини“.
  const bgIntro = read("../guide/index.html").match(/<h2>Двете височини<\/h2>\s*<p>([\s\S]*?)<\/p>/);
  const enIntro = read("../en/guide/index.html").match(/<h2>The two elevations<\/h2>\s*<p>([\s\S]*?)<\/p>/);
  assert.ok(bgIntro && bgIntro[1].includes("площ около 9 × 9 км"), `bg ръководство: ${bgIntro?.[1]}`);
  assert.ok(enIntro && enIntro[1].includes("an area of about 9 × 9 km"), `en ръководство: ${enIntro?.[1]}`);
  // Страницата: етикетът до координатите и височината.
  assert.equal(T.bg.cell, "Площ около 9 × 9 км");
  assert.equal(T.en.cell, "Area of about 9 × 9 km");
  // API-то: бележката, която страницата показва под датите.
  assert.ok(TEXTS.note.bg.includes("9 × 9") && TEXTS.note.bg.includes("площ"), TEXTS.note.bg);
  assert.ok(TEXTS.note.en.includes("9 × 9") && TEXTS.note.en.includes("area"), TEXTS.note.en);
});
