// Ръководството е два статични HTML файла — без JavaScript и без Markdown в
// браузъра. Тестът пази това, което един човек би счупил, без да забележи:
// изчезнала връзка назад, език, който води на грешно място, и раздел,
// добавен само на единия език.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dayOfYear, pair, riskAfter, seasonSummary } from "./stats.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const bg = read("../guide/index.html");
const en = read("../en/guide/index.html");

const headings = (html) => [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1].trim());

// Изречението, което съдържа „marker“ — не файлът като цяло. Замяна на
// числата само вътре в примерния абзац (истинската мутация от прегледа)
// трябва да събори теста; числа, вярни другаде във файла, не бива да го
// спасяват.
const paragraphContaining = (html, marker) => {
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
  const found = paras.find((p) => p.includes(marker));
  assert.ok(found !== undefined, `няма абзац, съдържащ „${marker}“`);
  return found;
};

// Всички очаквани числа по-долу идват от истинската мрежа (grid/grid.json)
// през същите чисти функции, които страницата би ползвала (site/js/stats.js)
// — не са преписани на ръка. Клетката е тази на Маноле, 42.2/24.9.
const grid = JSON.parse(read("../../grid/grid.json"));
const gridCells = Array.isArray(grid) ? grid : grid.cells;
const manole = gridCells.find((c) => c.lat === 42.2 && c.lon === 24.9);
const manoleRows = manole.years;
const N = manoleRows.length;

const risk = riskAfter(manoleRows, "04-20");
const seasonManole = seasonSummary(manoleRows);
const pairManole = pair(manoleRows);
const lengthsSorted = seasonManole.byYear.map((y) => y.days).sort((a, b) => a - b);
const midLow = lengthsSorted[lengthsSorted.length / 2 - 1];
const midHigh = lengthsSorted[lengthsSorted.length / 2];

const typicalSpringDay = dayOfYear(pairManole.typical.last_spring);
const typicalAutumnDay = dayOfYear(pairManole.typical.first_autumn);
const springDays = manoleRows.map((r) => dayOfYear(r[1])).filter((d) => d !== null);
const autumnDays = manoleRows.map((r) => dayOfYear(r[2])).filter((d) => d !== null);
const springOnOrBefore = springDays.filter((d) => d <= typicalSpringDay).length;
const autumnOnOrBefore = autumnDays.filter((d) => d <= typicalAutumnDay).length;
const typicalDatesDiffDays = typicalAutumnDay - typicalSpringDay - 1;

const safeSpringDay = dayOfYear(pairManole.safe.last_spring);
const safeAutumnDay = dayOfYear(pairManole.safe.first_autumn);
let springBreach = 0, autumnBreach = 0, eitherBreach = 0;
for (const r of manoleRows) {
  const s = dayOfYear(r[1]), a = dayOfYear(r[2]);
  const sBad = s !== null && s > safeSpringDay;
  const aBad = a !== null && a < safeAutumnDay;
  if (sBad) springBreach++;
  if (aBad) autumnBreach++;
  if (sBad || aBad) eitherBreach++;
}
const neitherBreach = N - eitherBreach;

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
  const bgP = paragraphContaining(bg, "надморска височина");
  const enP = paragraphContaining(en, "elevation of");
  assert.ok(bgP.includes(`${manole.lat}, ${manole.lon}, на ${manole.elev} м`), "bg: клетката (от grid.json)");
  assert.ok(enP.includes(`${manole.lat}, ${manole.lon}, at an elevation of ${manole.elev} m`), "en: клетката (от grid.json)");
  // 152 м е височината на самата точка (Open-Meteo/Copernicus DEM за точния
  // Маноле от брифа) — идва от отделен доставчик, не е в grid.json, затова
  // остава документирана константа, не преизчислена стойност.
  assert.match(bg, /точката е ≈ 152 м/);
  assert.match(en, /the point is ≈ 152 m/);
});

// Рисковият пример е преизчислен от истинската мрежа (riskAfter върху
// клетка 42.2/24.9 от grid/grid.json, вижте изчисленията по-горе) — не
// преписан на ръка. Числата трябва да стоят В абзаца с „Пример“, не някъде
// другаде: прегледът замени датите само вътре в примерния абзац и старите
// тестове пак минаха — paragraphContaining хваща точно това.
test("рисковият пример носи истинските числа за Маноле, в самия примерен абзац", () => {
  const bgP = paragraphContaining(bg, "Пример за Маноле");
  const enP = paragraphContaining(en, "Example for Manole");
  assert.ok(bgP.includes(`${risk.count} от ${risk.total} години`), `bg: очаквах ${risk.count} от ${risk.total}`);
  assert.ok(bgP.includes(`${risk.percent} %`), `bg: очаквах ${risk.percent} %`);
  assert.ok(bgP.includes("20 април"), "bg: датата на примера");
  assert.ok(enP.includes(`${risk.count} of ${risk.total} years`), `en: очаквах ${risk.count} of ${risk.total}`);
  assert.ok(enP.includes(`${risk.percent}%`), `en: очаквах ${risk.percent}%`);
  assert.ok(enP.includes("April 20"), "en: датата на примера");
});

// Границите на „сигурна“ поотделно (напролет/наесен/нито едното) —
// преброени директно от годините на клетката, не съчинена обща „9 от 10“
// статистика за двете граници наведнъж. В абзаца, който ги обяснява.
test("границите на сигурната дата стоят поотделно, с истинските числа за Маноле, в изречението", () => {
  const bgP = paragraphContaining(bg, "Двете граници са отделни статистики");
  const enP = paragraphContaining(en, "The two boundaries are separate statistics");
  assert.ok(bgP.includes(`${springBreach} от ${N} години е имало слана след сигурната пролетна дата (11 април)`), "bg: пролетна граница");
  assert.ok(bgP.includes(`${autumnBreach} от ${N} — преди сигурната есенна (30 октомври)`), "bg: есенна граница");
  assert.ok(bgP.includes(`${neitherBreach} от ${N} — нито едното, нито другото`), "bg: нито едното");
  assert.ok(enP.includes(`${springBreach} of the ${N} years had frost after the safe spring date (April 11)`), "en: пролетна граница");
  assert.ok(enP.includes(`${autumnBreach} of the ${N} had frost before the safe autumn date (October 30)`), "en: есенна граница");
  assert.ok(enP.includes(`${neitherBreach} of the ${N} had neither`), "en: нито едното");
});

// „Типичната“ не дели точно наполовина — реалният брой години „на или
// преди“ границата, поотделно за пролет и есен, в абзаца, който го твърди.
test("типичната дата дава истинския брой години „на или преди“ границата, не точно наполовина", () => {
  const bgP = paragraphContaining(bg, "медианата на годините с данни за съответния сезон");
  const enP = paragraphContaining(en, "median of the years with data for that season");
  assert.ok(bgP.includes(`${springOnOrBefore} от ${N} години последната пролетна слана`), "bg: пролетта на/преди типичната");
  assert.ok(bgP.includes(`${autumnOnOrBefore} от ${N} — първата есенна слана`), "bg: есента на/преди типичната");
  assert.ok(enP.includes(`${springOnOrBefore} of the ${N} years had the last spring frost`), "en: пролетта на/преди типичната");
  assert.ok(enP.includes(`${autumnOnOrBefore} of the ${N} had the first autumn frost`), "en: есента на/преди типичната");
});

// 237 е медианата на годишните дължини — при четен брой години (30),
// средното на двете средни стойности (не „нищо не се осреднява“: точно
// обратното, самата медиана тук Е средно). 240 е каквото дава същата
// сметка, приложена направо върху двете типични дати. И четирите числа в
// изречението, което ги обяснява.
test("237, 240 и средните две годишни стойности стоят в изреченията, които ги обясняват", () => {
  const bgTypicalP = paragraphContaining(bg, "средното на двете средни");
  const enTypicalP = paragraphContaining(en, "average of the two middle ones");
  assert.ok(bgTypicalP.includes(`(${midLow} + ${midHigh}) / 2 = ${seasonManole.typical} дни`), "bg: средното на двете средни");
  assert.ok(enTypicalP.includes(`(${midLow} + ${midHigh}) / 2 = ${seasonManole.typical} days`), "en: средното на двете средни");

  const bgExtremesP = paragraphContaining(bg, "Най-късата");
  const enExtremesP = paragraphContaining(en, "shortest");
  assert.ok(bgExtremesP.includes(`${seasonManole.shortest.days} дни, ${seasonManole.shortest.years[0]}`), "bg: най-късата година");
  assert.ok(bgExtremesP.includes(`${seasonManole.longest.days} дни, ${seasonManole.longest.years[0]}`), "bg: най-дългата година");
  assert.ok(enExtremesP.includes(`${seasonManole.shortest.days} days, ${seasonManole.shortest.years[0]}`), "en: shortest year");
  assert.ok(enExtremesP.includes(`${seasonManole.longest.days} days, ${seasonManole.longest.years[0]}`), "en: longest year");

  const bgHintP = paragraphContaining(bg, "Затова изваждането");
  const enHintP = paragraphContaining(en, "That's why subtracting");
  assert.ok(bgHintP.includes(`дава ${typicalDatesDiffDays} дни`), "bg: 240 от типичните дати");
  assert.ok(bgHintP.includes(`е ${seasonManole.typical}`), "bg: 237 от медианата");
  assert.ok(enHintP.includes(`gives ${typicalDatesDiffDays} days`), "en: 240 от типичните дати");
  assert.ok(enHintP.includes(`is ${seasonManole.typical}`), "en: 237 от медианата");
});

test("началните страници водят към ръководството", () => {
  const home = read("../index.html"), homeEn = read("../en/index.html");
  assert.match(home, /href="\/guide\/"/);
  assert.match(homeEn, /href="\/en\/guide\/"/);
});
