// Ръководството е два статични HTML файла — без JavaScript и без Markdown в
// браузъра. Тестът пази това, което един човек би счупил, без да забележи:
// изчезнала връзка назад, език, който води на грешно място, и раздел,
// добавен само на единия език.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dayOfYear, pair, riskAfter, seasonSummary } from "./stats.js";
import { formatMMDD } from "./format.js";

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

// String#includes върху низ с число приема и грешно число, стига да го
// съдържа като подниз: "1 от 30" стои и вътре в "11 от 30", "3 %" — вътре в
// "13 %". Граница само (?<!\d)…(?!\d) пак не стига: "3" стои и вътре в
// "0,3" (десетична запетая/точка), "237" — вътре в "237,5" или "1 194"
// (интервал/NBSP/тесен NBSP като разделител на хилядите), "20" — вътре в
// "19–20" (тире за диапазон от дати). SEP изброява всичко, което може да
// свързва число с друго число тук: точка, запетая, интервал, NBSP (U+00A0),
// тесен NBSP (U+202F), тире, en dash, em dash. includesExact() превръща
// очаквания низ в regex, в който всяко число пази граница И към цифра, И
// към „цифра+разделител“ отляво/„разделител+цифра“ отдясно — докато
// всичко останало си остава буквален, екраниран текст.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SEP = "[.,\\u00A0\\u202F\\u2013\\u2014\\- ]";
const numberBoundary = (token) => `(?<!\\d)(?<!\\d${SEP})${escapeRe(token)}(?!\\d)(?!${SEP}\\d)`;
// Токенът е ЦЯЛОТО число, включително собствен десетичен разделител
// ("42.2" остава един токен, не "42" + "." + "2" поотделно) — иначе
// границата отхвърля и легитимно число само защото продължава със своята
// СОБСТВЕНА десетична част.
const exactNumberPattern = (expected) =>
  expected.split(/(\d+(?:[.,]\d+)*)/).map((part, i) => (i % 2 === 1 ? numberBoundary(part) : escapeRe(part))).join("");
const includesExact = (paragraph, expected) => new RegExp(exactNumberPattern(expected)).test(paragraph);

// За число + мерна единица (152 м / 152 m): освен границата на числото,
// единицата зад него не бива да продължава с още буква — "мм"/"mm" не
// бива да мине за "м"/"m". \p{L} изисква флага "u".
const includesExactValueWithUnit = (text, prefix, number, unit) =>
  new RegExp(`${escapeRe(prefix)}${numberBoundary(String(number))} ${escapeRe(unit)}(?![\\p{L}])`, "u").test(text);

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

// Датите, форматирани точно както страницата ги пише (site/js/format.js —
// същата функция, която app.js/chart.js/history.js ползват за показване).
const typicalSpringBg = formatMMDD(pairManole.typical.last_spring, "bg");
const typicalAutumnBg = formatMMDD(pairManole.typical.first_autumn, "bg");
const safeSpringBg = formatMMDD(pairManole.safe.last_spring, "bg");
const safeAutumnBg = formatMMDD(pairManole.safe.first_autumn, "bg");
const typicalSpringEn = formatMMDD(pairManole.typical.last_spring, "en");
const typicalAutumnEn = formatMMDD(pairManole.typical.first_autumn, "en");
const safeSpringEn = formatMMDD(pairManole.safe.last_spring, "en");
const safeAutumnEn = formatMMDD(pairManole.safe.first_autumn, "en");

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
  assert.ok(includesExact(bgP, `${manole.lat}, ${manole.lon}, на `), "bg: клетката (координати, от grid.json)");
  assert.ok(includesExact(enP, `${manole.lat}, ${manole.lon}, at an elevation of `), "en: клетката (координати, от grid.json)");
  // Единицата зад числото също се проверява точно — "мм"/"mm" не бива да
  // мине за "м"/"m" (същата дупка като при числата, само с буква).
  assert.ok(includesExactValueWithUnit(bgP, "на ", manole.elev, "м"), "bg: клетката (99 м, от grid.json)");
  assert.ok(includesExactValueWithUnit(enP, "at an elevation of ", manole.elev, "m"), "en: клетката (99 m, от grid.json)");
  // 152 м е височината на самата точка (Open-Meteo/Copernicus DEM за точния
  // Маноле от брифа) — идва от отделен доставчик, не е в grid.json, затова
  // остава документирана константа, не преизчислена стойност.
  assert.ok(includesExactValueWithUnit(bg, "точката е ≈ ", 152, "м"), "bg: 152 м, точна граница");
  assert.ok(includesExactValueWithUnit(en, "the point is ≈ ", 152, "m"), "en: 152 m, точна граница");
});

// Обобщаващото изречение („типична 29 март / 25 ноември, сигурна 11 април /
// 30 октомври“) е отделен абзац от този, който обяснява методите — прегледът
// го счупи, докато другите тестове мълчаха: замени и четирите дати с 1–4
// януари и целият файл пак мина 12/12. formatMMDD е същата функция, с която
// страницата би написала датите (site/js/format.js).
test("обобщаващото изречение носи истинските четири дати за Маноле, изчислени от мрежата", () => {
  const bgP = paragraphContaining(bg, "по 30 години данни");
  const enP = paragraphContaining(en, "over 30 years of data");
  assert.ok(includesExact(bgP, `типична ${typicalSpringBg} / ${typicalAutumnBg}, сигурна ${safeSpringBg} / ${safeAutumnBg}`), "bg: и четирите дати");
  assert.ok(includesExact(enP, `typical ${typicalSpringEn} / ${typicalAutumnEn}, safe ${safeSpringEn} / ${safeAutumnEn}`), "en: и четирите дати");
});

// Рисковият пример е преизчислен от истинската мрежа (riskAfter върху
// клетка 42.2/24.9 от grid/grid.json, вижте изчисленията по-горе) — не
// преписан на ръка. Числата трябва да стоят В абзаца с „Пример“, не някъде
// другаде: прегледът замени датите само вътре в примерния абзац и старите
// тестове пак минаха — paragraphContaining хваща точно това.
// includesExact (не String#includes) пази границите на числото: "1 от 30"
// стоеше и вътре в "11 от 30", "3 %" — вътре в "13 %" (прегледа откри и
// това); фиксирано с (?<!\d)…(?!\d) около всяко число.
test("рисковият пример носи истинските числа за Маноле, в самия примерен абзац", () => {
  const bgP = paragraphContaining(bg, "Пример за Маноле");
  const enP = paragraphContaining(en, "Example for Manole");
  assert.ok(includesExact(bgP, `${risk.count} от ${risk.total} години`), `bg: очаквах ${risk.count} от ${risk.total}, не подниз`);
  assert.ok(includesExact(bgP, `${risk.percent} %`), `bg: очаквах ${risk.percent} %, не подниз`);
  assert.ok(includesExact(bgP, "20 април"), "bg: датата на примера");
  assert.ok(includesExact(enP, `${risk.count} of ${risk.total} years`), `en: очаквах ${risk.count} of ${risk.total}, не подниз`);
  assert.ok(includesExact(enP, `${risk.percent}%`), `en: очаквах ${risk.percent}%, не подниз`);
  assert.ok(includesExact(enP, "April 20"), "en: датата на примера");
});

// Границите на „сигурна“ поотделно (напролет/наесен/нито едното) —
// преброени директно от годините на клетката, не съчинена обща „9 от 10“
// статистика за двете граници наведнъж. В абзаца, който ги обяснява; и
// самите гранични дати (11 април/30 октомври) идват от formatMMDD, не са
// преписани на ръка.
test("границите на сигурната дата стоят поотделно, с истинските числа за Маноле, в изречението", () => {
  const bgP = paragraphContaining(bg, "Двете граници са отделни статистики");
  const enP = paragraphContaining(en, "The two boundaries are separate statistics");
  assert.ok(includesExact(bgP, `${springBreach} от ${N} години е имало слана след сигурната пролетна дата (${safeSpringBg})`), "bg: пролетна граница");
  assert.ok(includesExact(bgP, `${autumnBreach} от ${N} — преди сигурната есенна (${safeAutumnBg})`), "bg: есенна граница");
  assert.ok(includesExact(bgP, `${neitherBreach} от ${N} — нито едното, нито другото`), "bg: нито едното");
  assert.ok(includesExact(enP, `${springBreach} of the ${N} years had frost after the safe spring date (${safeSpringEn})`), "en: пролетна граница");
  assert.ok(includesExact(enP, `${autumnBreach} of the ${N} had frost before the safe autumn date (${safeAutumnEn})`), "en: есенна граница");
  assert.ok(includesExact(enP, `${neitherBreach} of the ${N} had neither`), "en: нито едното");
});

// „Типичната“ не дели точно наполовина — реалният брой години „на или
// преди“ границата, поотделно за пролет и есен, в абзаца, който го твърди.
test("типичната дата дава истинския брой години „на или преди“ границата, не точно наполовина", () => {
  const bgP = paragraphContaining(bg, "медианата на годините с данни за съответния сезон");
  const enP = paragraphContaining(en, "median of the years with data for that season");
  assert.ok(includesExact(bgP, `${springOnOrBefore} от ${N} години последната пролетна слана`), "bg: пролетта на/преди типичната");
  assert.ok(includesExact(bgP, `${autumnOnOrBefore} от ${N} — първата есенна слана`), "bg: есента на/преди типичната");
  assert.ok(includesExact(enP, `${springOnOrBefore} of the ${N} years had the last spring frost`), "en: пролетта на/преди типичната");
  assert.ok(includesExact(enP, `${autumnOnOrBefore} of the ${N} had the first autumn frost`), "en: есента на/преди типичната");
});

// 237 е медианата на годишните дължини — при четен брой години (30),
// средното на двете средни стойности (не „нищо не се осреднява“: точно
// обратното, самата медиана тук Е средно). 240 е каквото дава същата
// сметка, приложена направо върху двете типични дати. И четирите числа в
// изречението, което ги обяснява.
test("237, 240 и средните две годишни стойности стоят в изреченията, които ги обясняват", () => {
  const bgTypicalP = paragraphContaining(bg, "средното на двете средни");
  const enTypicalP = paragraphContaining(en, "average of the two middle ones");
  assert.ok(includesExact(bgTypicalP, `(${midLow} + ${midHigh}) / 2 = ${seasonManole.typical} дни`), "bg: средното на двете средни");
  assert.ok(includesExact(enTypicalP, `(${midLow} + ${midHigh}) / 2 = ${seasonManole.typical} days`), "en: средното на двете средни");

  const bgExtremesP = paragraphContaining(bg, "Най-късата");
  const enExtremesP = paragraphContaining(en, "shortest");
  assert.ok(includesExact(bgExtremesP, `${seasonManole.shortest.days} дни, ${seasonManole.shortest.years[0]}`), "bg: най-късата година");
  assert.ok(includesExact(bgExtremesP, `${seasonManole.longest.days} дни, ${seasonManole.longest.years[0]}`), "bg: най-дългата година");
  assert.ok(includesExact(enExtremesP, `${seasonManole.shortest.days} days, ${seasonManole.shortest.years[0]}`), "en: shortest year");
  assert.ok(includesExact(enExtremesP, `${seasonManole.longest.days} days, ${seasonManole.longest.years[0]}`), "en: longest year");

  const bgHintP = paragraphContaining(bg, "Затова изваждането");
  const enHintP = paragraphContaining(en, "That's why subtracting");
  assert.ok(includesExact(bgHintP, `дава ${typicalDatesDiffDays} дни`), "bg: 240 от типичните дати");
  assert.ok(includesExact(bgHintP, `е ${seasonManole.typical}`), "bg: 237 от медианата");
  assert.ok(includesExact(enHintP, `gives ${typicalDatesDiffDays} days`), "en: 240 от типичните дати");
  assert.ok(includesExact(enHintP, `is ${seasonManole.typical}`), "en: 237 от медианата");
});

test("началните страници водят към ръководството", () => {
  const home = read("../index.html"), homeEn = read("../en/index.html");
  assert.match(home, /href="\/guide\/"/);
  assert.match(homeEn, /href="\/en\/guide\/"/);
});
