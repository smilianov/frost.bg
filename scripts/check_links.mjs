#!/usr/bin/env node
// Проверява вътрешните връзки в документацията и в сайта — без мрежа
// (в CI няма достъп до Интернет за тази стъпка).
//
// Обхожда: README.md, README.en.md, CONTRIBUTING.md, docs/**/*.md,
// site/**/*.html.
//
// Правила за разрешаване на адрес:
//   - относителен път в Markdown → спрямо директорията на файла, в който
//     стои връзката;
//   - адрес, започващ с "/" (сайт-абсолютен) → спрямо site/, като "/guide/"
//     значи site/guide/index.html (сървърът връща index.html за папка);
//   - адрес, започващ с "/api/" → маршрут на Worker-а, не файл — прескача
//     се нарочно (проверка във файловата система би излъгала);
//   - външни http(s) (и всякакви други URI схеми — mailto:, tel:…) → не се
//     докосват;
//   - "#котва" се маха преди разрешаването; самата котва НЕ се проверява
//     (виж бележката накрая на файла).
//
// Излиза с код 1 и печата всяка мъртва връзка като "файл:ред → цел", ако
// намери поне една; иначе 0 и обобщение колко връзки е прегледал.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SITE_DIR = join(ROOT, "site");

// --- обхождане на файловете -------------------------------------------

function walk(dir, suffix, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, suffix, out);
    else if (name.endsWith(suffix)) out.push(full);
  }
  return out;
}

const mdFiles = [
  join(ROOT, "README.md"),
  join(ROOT, "README.en.md"),
  join(ROOT, "CONTRIBUTING.md"),
  ...walk(join(ROOT, "docs"), ".md"),
];
const htmlFiles = walk(SITE_DIR, ".html");

// --- разпознаване на връзка в текста -----------------------------------

// [текст](цел) и ![alt](цел) — стандартен Markdown синтаксис.
const MD_LINK = /\]\(([^)]+)\)/g;
// href="…" или src="…" (единични или двойни кавички) в HTML.
const HTML_LINK = /(?:href|src)\s*=\s*"([^"]*)"|(?:href|src)\s*=\s*'([^']*)'/g;

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

function findMarkdownLinks(text) {
  const lines = text.split("\n");
  const links = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    for (const m of line.matchAll(MD_LINK)) {
      links.push({ line: i + 1, target: extractTarget(m[1]) });
    }
  });
  return links;
}

function findHtmlLinks(text) {
  const lines = text.split("\n");
  const links = [];
  lines.forEach((line, i) => {
    for (const m of line.matchAll(HTML_LINK)) {
      links.push({ line: i + 1, target: m[1] ?? m[2] });
    }
  });
  return links;
}

// --- разрешаване спрямо файловата система (чувствително към регистъра) -

// fs.existsSync е нечувствителен към регистъра на macOS (APFS по подразбиране),
// но CI е Linux — тук проверяваме всеки сегмент от пътя през readdirSync,
// за да хванем разминаване в регистъра, което иначе минава локално, но пада в CI.
function existsCaseSensitive(absPath) {
  const rel = relative(ROOT, absPath);
  if (rel.startsWith("..")) return false; // извън хранилището
  const segments = rel.split(sep).filter(Boolean);
  let cur = ROOT;
  for (const seg of segments) {
    let entries;
    try {
      entries = readdirSync(cur);
    } catch {
      return false;
    }
    if (!entries.includes(seg)) return false;
    cur = join(cur, seg);
  }
  return true;
}

const EXTERNAL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/; // http:, https:, mailto:, tel:…

// Връща { skip: true } или { path: "…абсолютен път…" }.
function resolveTarget(target, sourceFile) {
  let t = target.split("#")[0]; // котвата не се проверява
  t = t.split("?")[0]; // низът за заявка не участва в пътя
  if (t === "") return { skip: "same-page anchor" };
  if (EXTERNAL_SCHEME.test(t)) return { skip: "external" };
  if (t.startsWith("/api/")) return { skip: "api route" };
  if (t.startsWith("/")) {
    let p = t;
    if (p.endsWith("/")) p += "index.html";
    return { path: join(SITE_DIR, p) };
  }
  return { path: join(dirname(sourceFile), t) };
}

// --- главен цикъл --------------------------------------------------------

const dead = [];
let checked = 0;
let externalSkipped = 0;
let apiSkipped = 0;

for (const file of mdFiles) {
  const text = readFileSync(file, "utf8");
  for (const { line, target } of findMarkdownLinks(text)) {
    const r = resolveTarget(target, file);
    if (r.skip === "external") { externalSkipped++; continue; }
    if (r.skip === "api route") { apiSkipped++; continue; }
    if (r.skip) continue;
    checked++;
    if (!existsCaseSensitive(r.path)) {
      dead.push({ file: relative(ROOT, file), line, target });
    }
  }
}

for (const file of htmlFiles) {
  const text = readFileSync(file, "utf8");
  for (const { line, target } of findHtmlLinks(text)) {
    const r = resolveTarget(target, file);
    if (r.skip === "external") { externalSkipped++; continue; }
    if (r.skip === "api route") { apiSkipped++; continue; }
    if (r.skip) continue;
    checked++;
    if (!existsCaseSensitive(r.path)) {
      dead.push({ file: relative(ROOT, file), line, target });
    }
  }
}

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

// Бележка: "#котва" се маха преди разрешаването на пътя — проверява се само
// че самият файл съществува, не че котвата действително стои в него. В
// момента нито един целеви файл не съдържа връзка с "#…", така че това е
// теоретична граница, не пропуск, установен на практика.
