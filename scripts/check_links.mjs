#!/usr/bin/env node
// Проверява вътрешните връзки в документацията и в сайта — без мрежа
// (в CI няма достъп до Интернет за тази стъпка).
//
// Обхожда: README.md, README.en.md, CONTRIBUTING.md, docs/**/*.md,
// site/**/*.html.
//
// Разпознати форми на връзка:
//   - Markdown: [текст](цел), ![alt](цел);
//   - reference-style Markdown: [текст][ref] заедно с дефиницията
//     `[ref]: цел` (проверява се самата дефиниция — тя носи адреса);
//   - HTML href/src (двойни или единични кавички), както в site/**/*.html,
//     така и вградени в Markdown файл (напр. `<a href="…">` в проза);
//   - HTML атрибутите се четат от целия текст на файла, не ред по ред, за
//     да не изчезва връзка, чийто `href="…"` пада на следващия ред спрямо
//     отварящия таг.
//
// Правила за разрешаване на адрес:
//   - относителен път в Markdown → спрямо директорията на файла, в който
//     стои връзката;
//   - адрес, започващ с "/" (сайт-абсолютен) → спрямо site/;
//   - ако разрешеният път сочи директория (независимо дали адресът е
//     написан с крайно "/", без него, или като относителен път) — търси се
//     index.html вътре; без него връзката е мъртва. Трите форми на един и
//     същ адрес ("/css", "/css/", относително "css/") получават еднаква
//     присъда;
//   - адрес, започващ с "/api/" → маршрут на Worker-а, не файл — прескача
//     се нарочно (проверка във файловата система би излъгала);
//   - външни http(s) (и всякакви други URI схеми — mailto:, tel:…) → не се
//     докосват;
//   - "#котва" се маха преди разрешаването; самата котва НЕ се проверява
//     (виж бележката накрая на файла).
//
// Излиза с код 1 и печата всяка мъртва връзка като "файл:ред → цел", ако
// намери поне една; иначе 0 и обобщение колко връзки е прегледал.
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

// --- разпознаване на връзка в текста -----------------------------------

// [текст](цел) и ![alt](цел) — стандартен Markdown синтаксис.
const MD_INLINE = /\]\(([^)]+)\)/g;
// [ref]: цел "незадължително заглавие" — дефиниция на reference-style връзка
// (до 3 водещи интервала, каквото позволява CommonMark).
const MD_REF_DEF = /^[ \t]{0,3}\[[^\]]+\]:[ \t]*(\S+)/gm;
// href="…" или src="…" (единични или двойни кавички) — в HTML файл, и
// вградени в Markdown. Върху целия текст на файла (не ред по ред), за да
// хване и атрибут, чиято стойност е на следващия ред спрямо тага. Флагът
// "d" дава началото на самата уловена група, за да сочи докладваният ред
// точно към стойността, не към "href"/"src" (може да е на предния ред).
const HTML_ATTR = /(?:href|src)\s*=\s*"([^"]*)"|(?:href|src)\s*=\s*'([^']*)'/gd;

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

// Маха ```-оградените блокове (заменя реда с празен низ, за да не мести
// номерата на редовете) — примерен код в плановете не бива да се третира
// като истинска връзка.
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
  const redacted = redactFences(text);
  const offsets = buildLineIndex(redacted);
  const links = [];
  for (const m of redacted.matchAll(MD_INLINE)) {
    links.push({ line: lineForIndex(offsets, m.index), target: extractTarget(m[1]) });
  }
  for (const m of redacted.matchAll(MD_REF_DEF)) {
    links.push({ line: lineForIndex(offsets, m.index), target: extractTarget(m[1]) });
  }
  for (const { index, target } of htmlAttrMatches(redacted)) {
    links.push({ line: lineForIndex(offsets, index), target });
  }
  return links;
}

function findHtmlLinks(text) {
  const offsets = buildLineIndex(text);
  return htmlAttrMatches(text).map(({ index, target }) => ({
    line: lineForIndex(offsets, index),
    target,
  }));
}

// --- разрешаване спрямо файловата система (чувствително към регистъра) -

// fs.existsSync е нечувствителен към регистъра на macOS (APFS по подразбиране),
// но CI е Linux — тук проверяваме всеки сегмент от пътя през readdirSync,
// за да хванем разминаване в регистъра, което иначе минава локално, но пада в CI.
function statCaseSensitive(root, absPath) {
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
  try {
    return statSync(cur);
  } catch {
    return null;
  }
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

// Връща { skip: "…" } или { path: "…абсолютен път…" }.
function resolveTarget(target, sourceFile, siteDir) {
  let t = target.split("#")[0]; // котвата не се проверява
  t = t.split("?")[0]; // низът за заявка не участва в пътя
  if (t === "") return { skip: "same-page anchor" };
  if (EXTERNAL_SCHEME.test(t)) return { skip: "external" };
  if (t.startsWith("/api/")) return { skip: "api route" };
  if (t.startsWith("/")) return { path: join(siteDir, t) };
  return { path: join(dirname(sourceFile), t) };
}

// --- главна проверка -----------------------------------------------------

// root: корена на дървото, което се проверява (истинското хранилище при
// пускане от CLI, временна фикстура при тестовете).
export function checkTree(root) {
  const siteDir = join(root, "site");
  const mdFiles = [
    existingFile(join(root, "README.md")),
    existingFile(join(root, "README.en.md")),
    existingFile(join(root, "CONTRIBUTING.md")),
    ...walk(join(root, "docs"), ".md"),
  ].filter(Boolean);
  const htmlFiles = walk(siteDir, ".html");

  const dead = [];
  let checked = 0;
  let externalSkipped = 0;
  let apiSkipped = 0;

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
      if (r.skip) continue; // same-page anchor
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

  return { mdFiles, htmlFiles, checked, dead, externalSkipped, apiSkipped };
}

// --- CLI -------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const ROOT = join(import.meta.dirname, "..");
  const { mdFiles, htmlFiles, checked, dead, externalSkipped, apiSkipped } = checkTree(ROOT);

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

// Бележка: "#котва" се маха преди разрешаването на пътя — проверява се само
// че самият файл съществува, не че котвата действително стои в него. В
// момента нито един целеви файл не съдържа връзка с "#…", така че това е
// теоретична граница, не пропуск, установен на практика.
