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
//
// Правилото е за СМИСЪЛА, а регулярният израз вижда само думата: „Няма връзка
// с мрежата“ е за интернет и е напълно правилно. Затова ключовете, които
// говорят за връзката, се изключват изрично — не се разчита на това, че
// днешният им текст случайно не казва „мрежа“.
const NETWORK_KEYS = new Set(["network_error"]);
const human = (obj) =>
  Object.entries(obj).filter(([k]) => !NETWORK_KEYS.has(k)).map(([, v]) => String(v)).join("\n");
const dict = (lang) => human(T[lang]);
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
// „Решетка“ също не е за хора — тя е думата за разработчиците.
const MREZHA = /(?<!\p{L})(?:мреж(?:а|ата|и|ите)|решетк(?:а|ата|и|ите))(?!\p{L})/iu;
const GRID = /(?<!\p{L})grids?(?!\p{L})/iu;

test("в текста за хора няма „мрежа“ или „решетка“ (bg) и „grid“ (en) — казва се „площ“ / „area“", () => {
  for (const [lang, re] of [["bg", MREZHA], ["en", GRID]]) {
    for (const [name, text] of Object.entries(HUMAN[lang])) {
      const m = text.match(re);
      assert.equal(m, null, `${name}: „${m?.[0]}“ в текст за хора — …${text.slice(Math.max(0, m?.index - 60), m?.index + 60)}…`);
    }
  }
});

test("съобщение за връзката може да казва „мрежата“ — то е за интернет, не за площта", () => {
  const bg = human({ ...T.bg, network_error: "Няма връзка с мрежата. Опитай пак." });
  const en = human({ ...T.en, network_error: "No network connection. Try again." });
  assert.equal(bg.match(MREZHA), null, "bg: съобщението за връзката не бива да проваля правилото");
  assert.equal(en.match(GRID), null, "en: съобщението за връзката не бива да проваля правилото");
});
test("…но същата дума в текст за сланата се хваща", () => {
  const bg = human({ ...T.bg, no_history: "Няма история за тази мрежа." });
  const bg2 = human({ ...T.bg, no_history: "Няма история за тази решетка." });
  const en = human({ ...T.en, no_history: "No history for this grid." });
  assert.notEqual(bg.match(MREZHA), null, "bg: „мрежа“ в текст за сланата трябва да се хване");
  assert.notEqual(bg2.match(MREZHA), null, "bg: „решетка“ в текст за хора трябва да се хване");
  assert.notEqual(en.match(GRID), null, "en: „grid“ в текст за сланата трябва да се хване");
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

// Точна фраза с граници: „19 × 9“ или липсваща мерна единица да не минават.
const exact = (text, phrase) =>
  new RegExp(`(?<![\\p{L}\\d])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\d])`, "u").test(text);
const visible = (p) => page(p).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("площта се въвежда с „около 9 × 9 км“ там, където човекът я среща за първи път", () => {
  // Ръководството: първото „площ“/„area“ в реда на четене носи и размера.
  for (const [p, word, phrase] of [
    ["../guide/index.html", "площ", /^площ(?:та)? около 9 × 9 км(?![\p{L}\d])/u],
    ["../en/guide/index.html", "area", /^area of about 9 × 9 km(?![\p{L}\d])/u],
  ]) {
    const text = visible(p);
    const i = text.search(new RegExp(`(?<!\\p{L})${word}`, "u"));
    assert.ok(i >= 0, `${p}: няма „${word}“`);
    assert.match(text.slice(i), phrase, `${p}: първото „${word}“ е без размера — …${text.slice(i, i + 80)}…`);
  }
  // Страницата: етикетът до координатите и височината.
  assert.equal(T.bg.cell, "Площ около 9 × 9 км");
  assert.equal(T.en.cell, "Area of about 9 × 9 km");
  // API-то: бележката под датите — целият размер, с граници и мерна единица.
  assert.ok(exact(TEXTS.note.bg, "площ около 9 × 9 км"), TEXTS.note.bg);
  assert.ok(exact(TEXTS.note.en, "area of about 9 × 9 km"), TEXTS.note.en);
});

// Решение на собственика (28 септември 2026): българският текст за хора не е на
// „ти“. Ръководството е безлично („може да се избере“), указанията на екрана
// са на „Вие“ („Въведете и двете координати“), бутоните остават кратки
// повелителни („Вземи от телефона“, „Покажи“, „Сметни“, „Свали CSV“) — те са
// команди, не обръщение, и затова не се проверяват. Регулярният израз хваща
// местоименията, сегашно време второ лице (-ш) и известните повелителни
// форми на „ти“, които вече бяха тук.
const BUTTON_KEYS = new Set(["locate", "go", "risk_go", "csv_download"]);
const TI = /(?<!\p{L})(?:ти|теб|твой|твоя|твоят|твое|твоето|твоите|твоята|\p{L}+(?:аш|яш|еш|иш)|опитай|въведи|посочи|очаквай|разчитай|виж|ползвай|погледни|щракни|докосни)(?!\p{L})/iu;
test("българският текст за хора не е на „ти“ (ръководството безлично, указанията на „Вие“)", () => {
  const texts = {
    ...HUMAN.bg,
    "site/js/texts.js (bg)": Object.entries(T.bg).filter(([k]) => !BUTTON_KEYS.has(k)).map(([, v]) => String(v)).join("\n"),
  };
  for (const [name, text] of Object.entries(texts)) {
    const m = text.match(TI);
    assert.equal(m, null, `${name}: „${m?.[0]}“ — …${text.slice(Math.max(0, m?.index - 60), m?.index + 60)}…`);
  }
});
