#!/usr/bin/env node
// Проверява вътрешните връзки в документацията и в сайта — без мрежа
// (в CI няма достъп до Интернет за тази стъпка).
//
// Обхожда: README.md, README.en.md, CONTRIBUTING.md, docs/**/*.md,
// site/**/*.html.
//
// ПРАВИЛОТО НА ТОЗИ СКРИПТ (кръг 4, след три кръга кръпки):
// или разпознава връзката, или я съобщава като проблем с файл:ред. Тихото
// прескачане е махнато като възможност. Шумна фалшива тревога е приемлива —
// вижда се и се решава с ограден блок за минута; тих пропуск не се вижда
// никога. Трите предни кръга паднаха все на едно и също: регулярен израз без
// граници (`[^"]*`, `[^)]+`) прескачаше край на таг или на коментар и
// изяждаше истинската връзка след себе си, докато скриптът пишеше „Всички са
// живи.“ и излизаше с 0.
//
// Разпознати форми на връзка:
//   - Markdown: [текст](цел), ![alt](цел) — с истински `[етикет]` (може да
//     минава през редове и да съдържа една нива вложени квадратни скоби) и
//     адрес или в `<…>`, или без празно пространство и без скоби;
//     незадължителното заглавие след адреса ("…", '…', (…)) не влиза в целта.
//     ВКЛЮЧИТЕЛНО вътре в `inline code` и вътре в <!-- HTML коментари -->;
//   - изображение като връзка, `[![alt](img)](цел)` — проверяват се и двете
//     цели: външната и на самото изображение (вторият пробег,
//     MD_INLINE_FLAT, е точно за да не изчезне вътрешната тихо);
//   - HTML href/src с кавички (главни или малки букви) — като атрибут на
//     реална позиция (предхожда го празно пространство или начало на
//     текста), не като подниз навсякъде в текста: `<div title='href="/x"'>`
//     и `data-href="/x"` не съвпадат. Важи и за site/**/*.html, и за HTML,
//     вграден в Markdown файл;
//   - HTML атрибутите се четат от целия текст на файла, не ред по ред, за
//     да не изчезва връзка, чийто `href="…"` пада на следващия ред спрямо
//     отварящия таг.
//
// Какво предизвиква ШУМЕН проблем (излиза в `unparsable`, exit 1):
//   - `href=`/`src=` без кавички, с незатворена кавичка, или със стойност,
//     която не изглежда като адрес (празно пространство, `<`, `>` или другата
//     кавичка вътре) — точно това хваща `<!-- href="https://example.com/ -->
//     <a href="/missing.html">`: първата стойност гърми, а сканирането
//     продължава веднага след „=“ и намира истинския href;
//   - всяко `](`, което не е част от призната Markdown връзка — напр.
//     `[x](/a b.html)` (интервал в адреса) или `](` в HTML коментар;
//   - ограден блок, отворен и незатворен до края на файла.
//
// Какво се зачерква преди разпознаването (заменя се с празни редове, за да
// останат номерата верни): САМО оградените блокове, по правила
// CommonMark-lite — виж redactFences. Умишлено НЕ се редактират `inline
// code` и HTML коментари: и двата опита (кръг 2) създадоха тих пропуск там,
// където две отделни неща се пресичат — единична обратна кавичка в HTML
// коментар се сдвоява с обратната кавичка на съвсем друг `inline code` span
// по-надолу в реда и изяжда истинска Markdown връзка между тях:
//
//   Текст <!-- ` --> [счупена](/missing.html) `код`
//
// Единственият сигурен начин да се напише пример, който скриптът не докосва,
// е ограден блок (``` или ~~~, на своя си ред, без отстъп над 3 интервала).
//
// Правила за разрешаване на адрес:
//   - целта се декодира като URI компонент (`docs/real%20file.md` →
//     `docs/real file.md`), преди да опре до файловата система;
//   - относителен път в Markdown → спрямо директорията на файла, в който
//     стои връзката;
//   - адрес, започващ с "/" (сайт-абсолютен) → спрямо site/;
//   - ако разрешеният път сочи директория (независимо дали адресът е
//     написан с крайно "/", без него, или като относителен път) — търси се
//     index.html вътре; без него връзката е мъртва. Трите форми на един и
//     същ адрес ("/css", "/css/", относително "css/") получават еднаква
//     присъда;
//   - ако адресът е написан с крайно "/", а разрешеният път излиза файл
//     (не директория) — връзката е мъртва (файловата система би върнала
//     ENOTDIR за "app.css/" — скриптът отговаря същото);
//   - адрес, започващ с "/api/" → маршрут на Worker-а, не файл — прескача
//     се нарочно (проверка във файловата система би излъгала);
//   - външни http(s) (и всякакви други URI схеми — mailto:, tel:…) → не се
//     докосват.
//
// Останалите граници — ШУМНИ, не тихи (проверява се, което не бива, вместо
// да изчезне нещо, което бива):
//   - ограда в blockquote (`> ```) не се разпознава като ограда —
//     съдържанието ѝ СЕ проверява;
//   - четириинтервален (indented) код не е ограда (CommonMark: отстъпът на
//     оградата е най-много 3 интервала) — съдържанието му СЕ проверява;
//   - `href` в стойността на друг атрибут, когато го предхожда интервал
//     (`<div title='see href="/x"'>`), СЕ проверява — фалшива тревога по
//     договор, вж. теста, който я закрепва;
//   - ДВОЙНА вложеност в етикета (`[а [б [в] г] д](цел)`) и адрес със скоби
//     вътре (`[x](/a(b).html)`) НЕ се проверяват — етикетът допуска една нива,
//     не рекурсия, а адресът не може да съдържа скоби. Излизат като
//     „Неразпознато“, тоест шумно; истинската им поддръжка иска CommonMark
//     parser;
//   - reference-style Markdown връзки ([текст][ref] / [ref]: цел) не се
//     поддържат — в хранилището няма нито една; коректното им разпознаване
//     иска истински CommonMark parser. `[ref]: цел` няма `](`, затова не
//     вдига и шум;
//   - дали "#котва" действително съществува в целевия файл не се проверява —
//     само че самият файл съществува ("#" се маха преди разрешаването).
//
// Излиза с код 1 и печата двата списъка — мъртвите като "файл:ред → цел" и
// неразпознатите като "файл:ред → какво" — ако има поне едно от двете.
// Излиза с код 1 и ако изобщо не намери файлове за проверка, или намери
// файлове, но нито една връзка и нито един проблем в тях — тих "0 живи
// връзки" е по-вероятно счупена проверка, отколкото чисто дърво (виж
// checkTree). Иначе 0 и обобщение колко връзки е прегледал.
//
// checkTree(root) е изнесена и за тестове (scripts/check_links.test.js) —
// приема произволен корен, за да могат фикстурите да не пипат истинското
// дърво.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

// --- обхождане на файловете -------------------------------------------

function walk(dir, suffix, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // фикстурите в тестовете може да нямат тази поддиректория
  }
  for (const name of entries.sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, suffix, out);
    else if (name.endsWith(suffix)) out.push(full);
  }
  return out;
}

function existingFile(path) {
  try {
    return statSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

// --- редакция: маха само оградените блокове -----------------------------

// Оградите са единственото, което се редактира (виж бележката най-горе защо
// `inline code` и HTML коментарите НЕ се редактират). Правилата са
// CommonMark-lite, защото „почти“ тук значи тих пропуск:
//   - отваря ред `^ {0,3}(`{3,}|~{3,})…`; 4+ интервала отстъп НЕ е ограда;
//   - при обратни кавички info string-ът не бива да съдържа обратна кавичка
//     (CommonMark) — иначе ред като "```код``` и после [x](/y)" би минал за
//     ограда и би изял и връзката на реда, и остатъка от файла;
//   - затваря я първият ред от същия знак, дълъг поне колкото отварящата, и
//     нищо друго освен интервали — затова троен ред НЕ затваря четворна;
//   - редовете се заменят с празни (броят редове се пази, за да са верни
//     номерата).
// Няма ли затваряща до края на файла — само ТАЗИ ограда не се зачерква
// (съдържанието ѝ се проверява шумно) и редът ѝ излиза като проблем.
// Затворените огради преди нея си остават зачеркнати: шумът е локален за
// истинския дефект, вместо един незатворен блок да гръмне цял файл.
//
// Връща { text, unclosedFence } — unclosedFence е 1-базиран ред или null.
function redactFences(text) {
  const lines = text.split("\n");
  const out = [];
  let fence = null; // { char, len, line }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      out.push("");
      // fence.char е ` или ~ — нито един от двата не е метазнак в regex;
      // `[ \t]` в шаблона дава клас от интервал и табулация.
      if (new RegExp(`^ {0,3}${fence.char}{${fence.len},}[ \t]*$`).test(line)) fence = null;
      continue;
    }
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (m && !(m[1][0] === "`" && m[2].includes("`"))) {
      fence = { char: m[1][0], len: m[1].length, line: i + 1, from: i };
      out.push("");
      continue;
    }
    out.push(line);
  }
  if (fence) {
    // връща само незатворената ограда обратно в текста — от отварящата ѝ
    // надолу; out има по един ред за всеки ред от файла, затова индексите
    // съвпадат едно към едно.
    for (let i = fence.from; i < out.length; i++) out[i] = lines[i];
    return { text: out.join("\n"), unclosedFence: fence.line };
  }
  return { text: out.join("\n"), unclosedFence: null };
}

// --- разпознаване на връзка в текста -----------------------------------

// [текст](цел) и ![alt](цел) — стандартен Markdown синтаксис, с граници:
//   - иска истински `[етикет]` (може да минава през редове) — само `](`
//     хващаше и `](` в HTML коментар и оттам поглъщаше до следващата
//     затваряща скоба, изяждайки истинската връзка между двете;
//   - етикетът допуска ЕДНА нива вложеност (`\[[^\[\]]*\]`), колкото стига
//     за стандартната значка `[![alt](img)](цел)`, но не е рекурсия: двойна
//     вложеност остава неразпозната, тоест шумна;
//   - адресът е или `<…>`, или низ без празно пространство и без скоби —
//     `[^)]+` поглъщаше и интервали, и края на коментара;
//   - незадължителното заглавие след адреса е в "…", '…' или (…) и НЕ влиза
//     в уловената група.
//
// Опашката (адрес + заглавие) е обща за двата израза, за да не се разминат.
// MD_INLINE_FLAT е същото с етикет без никакви скоби: нужен е като втори
// пробег, защото при значка първият израз хваща ВЪНШНАТА връзка и вътрешната
// `![alt](img)` остава вътре в съвпадението — без втория пробег целта на
// самото изображение би изчезнала тихо.
const MD_TAIL = String.raw`\(\s*(<[^<>\n]*>|[^()\s]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\s*\)`;
const MD_INLINE = new RegExp(String.raw`\[(?:[^\[\]]|\[[^\[\]]*\])*\]` + MD_TAIL, "g");
const MD_INLINE_FLAT = new RegExp(String.raw`\[[^\[\]]*\]` + MD_TAIL, "g");
// Началото на href=/src= като атрибут на реална позиция: изисква празно
// пространство (или начало на текста) пред името — точно това пази
// `data-href` и `<div title='href="/x"'>` да не съвпадат. Главните букви се
// изписват като класове, а не с флаг "i", нарочно: с "i" класът [a-z]
// хваща и знака Kelvin (U+212A) като "k", а тук всяко разхлабване на
// границите вече е плащано с тих пропуск.
const ATTR_START = /(?:^|\s)([Hh][Rr][Ee][Ff]|[Ss][Rr][Cc])\s*=\s*/g;

// Ръчно сканиране вместо един regex: „разпознай или се оплаши“. Регулярен
// израз със `[^"]*` за стойност прескача край на таг и край на коментар —
// `<!-- href="https://example.com/ --> <a href="/missing.html">` минаваше за
// една външна връзка и изяждаше истинската. Тук стойността се приема само
// ако изглежда като адрес; иначе излиза проблем и сканирането продължава
// веднага след „=“, за да намери истинския атрибут по-надолу на същия ред.
//
// Връща { links: [{index, target}], problems: [{index, what}] }. index на
// връзка сочи самата стойност (не "href="), за да е верен редът при
// многоредов таг; index на проблем сочи „=“.
function htmlAttrMatches(text) {
  const links = [];
  const problems = [];
  ATTR_START.lastIndex = 0;
  let m;
  while ((m = ATTR_START.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    const eq = m.index + m[0].indexOf("=");
    const valueStart = m.index + m[0].length; // след `\s*` подир „=“
    const quote = text[valueStart];
    if (quote !== '"' && quote !== "'") {
      problems.push({ index: eq, what: `${name}= без кавички — не се разпознава` });
      ATTR_START.lastIndex = eq + 1;
      continue;
    }
    const end = text.indexOf(quote, valueStart + 1);
    if (end === -1) {
      problems.push({ index: eq, what: `${name}= с незатворена кавичка` });
      ATTR_START.lastIndex = eq + 1;
      continue;
    }
    const value = text.slice(valueStart + 1, end);
    const other = quote === '"' ? "'" : '"';
    if (/[\s<>]/.test(value) || value.includes(other)) {
      problems.push({ index: eq, what: `${name}= стойност, която не изглежда като адрес` });
      ATTR_START.lastIndex = eq + 1;
      continue;
    }
    links.push({ index: valueStart + 1, target: value });
    ATTR_START.lastIndex = end + 1;
  }
  return { links, problems };
}

function extractTarget(raw) {
  const t = raw.trim();
  // <url с интервали> — рядка Markdown форма; заглавието вече не влиза в
  // уловената група, затова друго рязане не е нужно.
  if (t.startsWith("<") && t.endsWith(">")) return t.slice(1, -1);
  return t;
}

// Номер на реда (1-базиран), съдържащ дадена позиция в текста.
function buildLineIndex(text) {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}
function lineForIndex(offsets, idx) {
  let lo = 0,
    hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= idx) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

// Двете функции връщат { links, problems } — problems е това, което
// скриптът е видял, но не е разпознал като връзка. Никоя от двете не
// прескача тихо.
function findMarkdownLinks(text) {
  const { text: redacted, unclosedFence } = redactFences(text);
  const offsets = buildLineIndex(redacted);
  const links = [];
  const problems = [];
  if (unclosedFence !== null) {
    problems.push({ line: unclosedFence, what: "незатворен ограден блок" });
  }
  const accepted = [];
  const seen = new Set(); // позиция на вече добавена връзка — двата пробега
  for (const re of [MD_INLINE, MD_INLINE_FLAT]) {
    for (const m of redacted.matchAll(re)) {
      accepted.push([m.index, m.index + m[0].length]);
      if (seen.has(m.index)) continue; // обикновена връзка, хваната и от двата
      seen.add(m.index);
      links.push({ line: lineForIndex(offsets, m.index), target: extractTarget(m[1]) });
    }
  }
  // Шумният край: всяко `](`, което не попада в прието съвпадение, изглежда
  // като Markdown връзка, но не е разпозната — съобщава се, не се прескача.
  for (let i = redacted.indexOf("]("); i !== -1; i = redacted.indexOf("](", i + 1)) {
    if (!accepted.some(([from, to]) => i >= from && i < to)) {
      problems.push({
        line: lineForIndex(offsets, i),
        what: "изглежда като Markdown връзка, но не се разпознава",
      });
    }
  }
  const attrs = htmlAttrMatches(redacted);
  for (const { index, target } of attrs.links) {
    links.push({ line: lineForIndex(offsets, index), target });
  }
  for (const { index, what } of attrs.problems) {
    problems.push({ line: lineForIndex(offsets, index), what });
  }
  return { links, problems };
}

function findHtmlLinks(text) {
  const offsets = buildLineIndex(text);
  const { links, problems } = htmlAttrMatches(text);
  return {
    links: links.map(({ index, target }) => ({ line: lineForIndex(offsets, index), target })),
    problems: problems.map(({ index, what }) => ({ line: lineForIndex(offsets, index), what })),
  };
}

// --- разрешаване спрямо файловата система (чувствително към регистъра) -

// fs.existsSync е нечувствителен към регистъра на macOS (APFS по подразбиране),
// но CI е Linux — тук проверяваме всеки сегмент от пътя през readdirSync,
// за да хванем разминаване в регистъра, което иначе минава локално, но пада в CI.
//
// "/" накрая на absPath пази изискването "трябва да е директория" — точно
// каквото файловата система би отговорила (ENOTDIR за "файл/").
function statCaseSensitive(root, absPath) {
  const mustBeDir = absPath.endsWith(sep);
  const rel = relative(root, absPath);
  if (rel.startsWith("..")) return null; // извън корена
  const segments = rel === "" ? [] : rel.split(sep).filter(Boolean);
  let cur = root;
  for (const seg of segments) {
    let entries;
    try {
      entries = readdirSync(cur);
    } catch {
      return null;
    }
    if (!entries.includes(seg)) return null;
    cur = join(cur, seg);
  }
  let st;
  try {
    st = statSync(cur);
  } catch {
    return null;
  }
  if (mustBeDir && !st.isDirectory()) return null; // "app.css/" сочи файл — ENOTDIR
  return st;
}

// Директория без "/" накрая, с "/" накрая или стигната по относителен път —
// и трите форми означават едно и също нещо: сървърът/файловата система би
// върнали index.html вътре. Ако него го няма, връзката е мъртва — без
// изключение по формата, в която е написана.
function isAlive(root, absPath) {
  const st = statCaseSensitive(root, absPath);
  if (!st) return false;
  if (st.isDirectory()) {
    const idx = statCaseSensitive(root, join(absPath, "index.html"));
    return !!idx && idx.isFile();
  }
  return st.isFile();
}

const EXTERNAL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/; // http:, https:, mailto:, tel:…

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // невалидна % последователност — пробвай суровия низ
  }
}

// Връща { skip: "…" } или { path: "…абсолютен път…" }.
function resolveTarget(target, sourceFile, siteDir) {
  let t = target.split("#")[0]; // котвата не се проверява
  t = t.split("?")[0]; // низът за заявка не участва в пътя
  if (t === "") return { skip: "same-page anchor" };
  if (EXTERNAL_SCHEME.test(t)) return { skip: "external" };
  if (t.startsWith("/api/")) return { skip: "api route" };
  t = safeDecode(t);
  if (t.startsWith("/")) return { path: join(siteDir, t) };
  return { path: join(dirname(sourceFile), t) };
}

// --- главна проверка -----------------------------------------------------

// root: корена на дървото, което се проверява (истинското хранилище при
// пускане от CLI, временна фикстура при тестовете).
//
// Хвърля грешка (не връща тихо нули), ако не намери никакви файлове за
// проверка, или намери файлове, но нито една връзка в тях — и двете най-
// вероятно значат счупен/липсващ корен или счупен regex, не чисто дърво.
export function checkTree(root) {
  const siteDir = join(root, "site");
  const mdFiles = [
    existingFile(join(root, "README.md")),
    existingFile(join(root, "README.en.md")),
    existingFile(join(root, "CONTRIBUTING.md")),
    ...walk(join(root, "docs"), ".md"),
  ].filter(Boolean);
  const htmlFiles = walk(siteDir, ".html");

  if (mdFiles.length === 0 && htmlFiles.length === 0) {
    throw new Error(`няма намерени файлове за проверка под "${root}" — коренът липсва или е празен`);
  }

  const dead = [];
  const unparsable = [];
  let checked = 0;
  let externalSkipped = 0;
  let apiSkipped = 0;
  let anchorSkipped = 0;

  function record({ links, problems }, file) {
    for (const { line, what } of problems) {
      unparsable.push({ file: relative(root, file), line, what });
    }
    for (const { line, target } of links) {
      const r = resolveTarget(target, file, siteDir);
      if (r.skip === "external") {
        externalSkipped++;
        continue;
      }
      if (r.skip === "api route") {
        apiSkipped++;
        continue;
      }
      if (r.skip) {
        anchorSkipped++; // same-page anchor
        continue;
      }
      checked++;
      if (!isAlive(root, r.path)) {
        dead.push({ file: relative(root, file), line, target });
      }
    }
  }

  for (const file of mdFiles) {
    record(findMarkdownLinks(readFileSync(file, "utf8")), file);
  }
  for (const file of htmlFiles) {
    record(findHtmlLinks(readFileSync(file, "utf8")), file);
  }

  const totalFound = checked + externalSkipped + apiSkipped + anchorSkipped;
  if (totalFound + unparsable.length === 0) {
    throw new Error(
      `${mdFiles.length + htmlFiles.length} файла намерени под "${root}", но нито една връзка в тях`,
    );
  }

  return { mdFiles, htmlFiles, checked, dead, unparsable, externalSkipped, apiSkipped, anchorSkipped };
}

// --- CLI -------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const ROOT = join(import.meta.dirname, "..");
  let result;
  try {
    result = checkTree(ROOT);
  } catch (e) {
    console.error(`check:links: ${e.message}`);
    process.exit(1);
  }
  const { mdFiles, htmlFiles, checked, dead, unparsable, externalSkipped, apiSkipped } = result;

  if (dead.length > 0 || unparsable.length > 0) {
    if (dead.length > 0) {
      console.error(`Мъртви връзки (${dead.length}):`);
      for (const d of dead) console.error(`${d.file}:${d.line} → ${d.target}`);
    }
    if (unparsable.length > 0) {
      console.error(`Неразпознато (${unparsable.length}) — примерът се слага в ограден блок:`);
      for (const u of unparsable) console.error(`${u.file}:${u.line} → ${u.what}`);
    }
    process.exit(1);
  }

  console.log(
    `check:links — прегледани ${checked} вътрешни връзки в ${mdFiles.length} ` +
      `Markdown и ${htmlFiles.length} HTML файла ` +
      `(пропуснати: ${externalSkipped} външни, ${apiSkipped} /api/ маршрута). ` +
      `Всички са живи.`,
  );
}
