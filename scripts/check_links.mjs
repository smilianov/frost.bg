#!/usr/bin/env node
// Проверява вътрешните връзки в документацията и в сайта — без мрежа
// (в CI няма достъп до Интернет за тази стъпка).
//
// Обхожда: README.md, README.en.md, CONTRIBUTING.md, docs/**/*.md,
// site/**/*.html.
//
// Разпознати форми на връзка (нарочно тесен обхват — виж „Какво НЕ
// проверява“ по-долу за границите):
//   - Markdown: [текст](цел), ![alt](цел);
//   - HTML href/src (само с кавички) — като атрибут, не като подниз (не
//     съвпада с `data-href="…"`), както в site/**/*.html, така и вградено
//     в Markdown файл (напр. `<a href="…">` в проза);
//   - HTML атрибутите се четат от целия текст на файла, не ред по ред, за
//     да не изчезва връзка, чийто `href="…"` пада на следващия ред спрямо
//     отварящия таг.
//
// Преди разпознаването текстът се "редактира" (заменя се със същия брой
// редове, но празно съдържание), за да не се четат като истински връзки:
//   - ```-оградени блокове (примерен код в плановете);
//   - inline code span-ове (`...`) — `` `<a href="/x">` `` в проза не е
//     истинска връзка, дори да изглежда като HTML;
//   - HTML коментари (`<!-- ... -->`) — закоментирана връзка не е жива.
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
// Какво НЕ проверява (нарочно, не пропуск по невнимание):
//   - reference-style Markdown връзки ([текст][ref] / [ref]: цел) — в
//     хранилището няма нито една днес; правилното им разпознаване иска
//     истински CommonMark parser (заглавия, дублирани дефиниции, адреси с
//     интервали в `<...>`), а не си струва за нула случая;
//   - href/src без кавички (`href=/x`) — рядка, неконвенционална форма в
//     тези файлове;
//   - дали "#котва" действително съществува в целевия файл — само че
//     самият файл съществува ("#" се маха преди разрешаването).
//
// Излиза с код 1 и печата всяка мъртва връзка като "файл:ред → цел", ако
// намери поне една. Излиза с код 1 и ако изобщо не намери файлове за
// проверка, или намери файлове, но нито една връзка в тях — тих "0 живи
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

// --- редакция: маха ```-блокове, inline code и HTML коментари ----------

// Заменя всеки не-"\n" знак с интервал в дадения обхват — пази дължината
// и номерата на редовете, само маха съдържанието от полезрението на
// следващите regex-и.
function blank(text, start, end) {
  return (
    text.slice(0, start) +
    text
      .slice(start, end)
      .replace(/[^\n]/g, " ") +
    text.slice(end)
  );
}

function redactPattern(text, regex) {
  let out = text;
  for (const m of text.matchAll(regex)) {
    out = blank(out, m.index, m.index + m[0].length);
  }
  return out;
}

// ```-оградени блокове — по цели редове, само в Markdown.
function redactFences(text) {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
}

// `inline code` — само в рамките на един ред (никой реален файл тук няма
// code span, преминаващ през нов ред); само в Markdown.
const INLINE_CODE = /`[^`\n]*`/g;
function redactInlineCode(text) {
  return redactPattern(text, INLINE_CODE);
}

// <!-- коментар --> — може да минава през няколко реда; и в Markdown, и в
// HTML (закоментирана връзка не е жива връзка).
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
function redactComments(text) {
  return redactPattern(text, HTML_COMMENT);
}

// --- разпознаване на връзка в текста -----------------------------------

// [текст](цел) и ![alt](цел) — стандартен Markdown синтаксис.
const MD_INLINE = /\]\(([^)]+)\)/g;
// href="…"/src="…" или href='…'/src='…' (само с кавички) — като атрибут,
// не като подниз: изисква да НЕ е предшествано от буква/цифра/тире, за да
// не хване "data-href=" или подобно. Флагът "d" дава началото на самата
// уловена група, за да сочи докладваният ред точно към стойността, не към
// "href"/"src" (може да е на предния ред при многоредов таг).
const HTML_ATTR =
  /(?<![\w-])(?:href|src)\s*=\s*"([^"]*)"|(?<![\w-])(?:href|src)\s*=\s*'([^']*)'/gd;

function htmlAttrMatches(text) {
  const out = [];
  for (const m of text.matchAll(HTML_ATTR)) {
    const g = m[1] !== undefined ? 1 : 2;
    out.push({ index: m.indices[g][0], target: m[g] });
  }
  return out;
}

function extractTarget(raw) {
  let t = raw.trim();
  if (t.startsWith("<") && t.includes(">")) {
    // <url с интервали> — рядка Markdown форма
    t = t.slice(1, t.indexOf(">"));
  } else {
    // маха незадължителното "заглавие" след адреса: (цел "заглавие")
    const m = t.match(/^(\S+)(?:\s+["'].*)?$/);
    if (m) t = m[1];
  }
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

function findMarkdownLinks(text) {
  const redacted = redactComments(redactInlineCode(redactFences(text)));
  const offsets = buildLineIndex(redacted);
  const links = [];
  for (const m of redacted.matchAll(MD_INLINE)) {
    links.push({ line: lineForIndex(offsets, m.index), target: extractTarget(m[1]) });
  }
  for (const { index, target } of htmlAttrMatches(redacted)) {
    links.push({ line: lineForIndex(offsets, index), target });
  }
  return links;
}

function findHtmlLinks(text) {
  const redacted = redactComments(text);
  const offsets = buildLineIndex(redacted);
  return htmlAttrMatches(redacted).map(({ index, target }) => ({
    line: lineForIndex(offsets, index),
    target,
  }));
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
  let checked = 0;
  let externalSkipped = 0;
  let apiSkipped = 0;
  let anchorSkipped = 0;

  function record(links, file) {
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
  if (totalFound === 0) {
    throw new Error(
      `${mdFiles.length + htmlFiles.length} файла намерени под "${root}", но нито една връзка в тях`,
    );
  }

  return { mdFiles, htmlFiles, checked, dead, externalSkipped, apiSkipped, anchorSkipped };
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
  const { mdFiles, htmlFiles, checked, dead, externalSkipped, apiSkipped } = result;

  if (dead.length > 0) {
    console.error(`Мъртви връзки (${dead.length}):`);
    for (const d of dead) console.error(`${d.file}:${d.line} → ${d.target}`);
    process.exit(1);
  }

  console.log(
    `check:links — прегледани ${checked} вътрешни връзки в ${mdFiles.length} ` +
      `Markdown и ${htmlFiles.length} HTML файла ` +
      `(пропуснати: ${externalSkipped} външни, ${apiSkipped} /api/ маршрута). ` +
      `Всички са живи.`,
  );
}
