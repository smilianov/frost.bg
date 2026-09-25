// Ръководството е два статични HTML файла — без JavaScript и без Markdown в
// браузъра. Тестът пази това, което един човек би счупил, без да забележи:
// изчезнала връзка назад, език, който води на грешно място, и раздел,
// добавен само на единия език.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const bg = read("../guide/index.html");
const en = read("../en/guide/index.html");

const headings = (html) => [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1].trim());

test("двете страници нямат JavaScript", () => {
  for (const [name, html] of [["bg", bg], ["en", en]]) {
    assert.ok(!/<script/i.test(html), `${name}: няма <script>`);
    assert.ok(!/ on[a-z]+=/i.test(html), `${name}: няма inline handler`);
  }
});

test("носят облика на сайта: app.css, header, wrap, footer", () => {
  for (const [name, html] of [["bg", bg], ["en", en]]) {
    assert.match(html, /<link rel="stylesheet" href="\/css\/app\.css">/, `${name}: app.css`);
    assert.match(html, /<header class="top">/, `${name}: header`);
    assert.match(html, /<main class="wrap">/, `${name}: wrap`);
    assert.match(html, /<footer class="foot">/, `${name}: footer`);
    assert.ok(!/leaflet/i.test(html), `${name}: няма Leaflet — тук няма карта`);
  }
});

test("всяка страница води обратно към началната на своя език", () => {
  assert.match(bg, /<a class="brand" href="\/">frost\.bg<\/a>/);
  assert.match(en, /<a class="brand" href="\/en\/">frost\.bg<\/a>/);
});

test("превключвателят на езика води към другото ръководство, не към началната", () => {
  assert.match(bg, /<a class="lang" href="\/en\/guide\/">English<\/a>/);
  assert.match(en, /<a class="lang" href="\/guide\/">Български<\/a>/);
});

// Осемте раздела, по ред — двойка (bg, en) за всеки. Проверява и броя, и
// съдържанието, и реда, на двата езика поотделно: размяна на заглавия на
// единия език (без да се пипа другият) би минала през стар тест, който
// само брои дължините — този я хваща.
const EXPECTED_HEADINGS = [
  ["Двете двойки дати", "The two pairs of dates"],
  ["Графиката", "The chart"],
  ["Периодите 10, 20 и 30 години", "The 10, 20 and 30-year periods"],
  ["Рискът след дата", "The risk after a date"],
  ["Сезонът без слана", "The frost-free season"],
  ["Двете височини", "The two elevations"],
  ["Откъде са числата", "Where the numbers come from"],
  ["Защо не съвпада с моите наблюдения", "Why it doesn't match what I see"],
];

test("осемте раздела са в един и същ ред и на двата езика", () => {
  const bgH = headings(bg), enH = headings(en);
  assert.equal(bgH.length, EXPECTED_HEADINGS.length, `bg: очаквах ${EXPECTED_HEADINGS.length} раздела, намерих ${bgH.length}`);
  assert.equal(enH.length, EXPECTED_HEADINGS.length, `en: очаквах ${EXPECTED_HEADINGS.length} раздела, намерих ${enH.length}`);
  EXPECTED_HEADINGS.forEach(([bgTitle, enTitle], i) => {
    assert.equal(bgH[i], bgTitle, `bg раздел ${i + 1}`);
    assert.equal(enH[i], enTitle, `en раздел ${i + 1}`);
  });
});

test("езикът на документа е обявен вярно", () => {
  assert.match(bg, /<html lang="bg">/);
  assert.match(en, /<html lang="en">/);
});

test("клетката и точката на Маноле стоят в изречението, което ги обяснява", () => {
  assert.match(bg, /клетката е 42\.2, 24\.9, на 99 м/);
  assert.match(en, /the cell is 42\.2, 24\.9, at an elevation of 99 m/);
  assert.match(bg, /точката е ≈ 152 м/);
  assert.match(en, /the point is ≈ 152 m/);
});

// Рисковият пример е преизчислен от истинската мрежа (site/js/stats.js
// riskAfter върху клетка 42.2/24.9): 1 от 30 години, 3 % — не 4/30, 13 %,
// каквото беше в плана. Числата трябва да стоят В изречението, не някъде
// другаде във файла (иначе замяна с невярно число пак минава).
test("рисковият пример носи истинските числа за Маноле, в самото изречение", () => {
  assert.match(bg, /в 1 от 30 години е имало слана след 20 април и преди 1 юли — 3\s?%/);
  assert.match(en, /in 1 of 30 years there was frost after April 20 and before July 1 — 3%/);
});

// Границите на „сигурна“ поотделно (3/30 напролет, 2/30 наесен, 25/30
// нито едното) — преизчислени от истинската мрежа, не съчинена обща
// „9 от 10“ статистика за двете граници наведнъж.
test("границите на сигурната дата стоят поотделно, с истинските числа за Маноле", () => {
  assert.match(bg, /в 3 от 30 години е имало слана след сигурната пролетна дата \(11 април\)/);
  assert.match(bg, /в 2 от 30 — преди сигурната есенна \(30 октомври\)/);
  assert.match(bg, /в 25 от 30 — нито едното, нито другото/);
  assert.match(en, /3 of the 30 years had frost after the safe spring date \(April 11\)/);
  assert.match(en, /2 of the 30 had frost before the safe autumn date \(October 30\)/);
  assert.match(en, /25 of the 30 had neither/);
});

// 237 е медианата на годишните дължини (site/js/stats.js seasonSummary за
// 42.2/24.9); 240 е каквото дава същата сметка приложена направо върху
// двете типични дати — двете число трябва да стоят в изречението, което
// обяснява разликата, не разпръснати другаде.
test("237 стои в изречението, което го обяснява като медиана на годишните дължини", () => {
  assert.match(bg, /истинската типична дължина — медианата на годишните дължини — е 237/);
  assert.match(en, /the true typical length — the median of the yearly lengths — is 237/);
  assert.match(bg, /29 март и 25 ноември, дава 240 дни/);
  assert.match(en, /March 29 and November 25, gives 240 days/);
});

test("началните страници водят към ръководството", () => {
  const home = read("../index.html"), homeEn = read("../en/index.html");
  assert.match(home, /href="\/guide\/"/);
  assert.match(homeEn, /href="\/en\/guide\/"/);
});
