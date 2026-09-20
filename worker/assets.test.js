// Публичните файлове (site/) се качват в Cloudflare като статични assets.
// Тестовете на страницата (site/js/*.test.js) не са част от сайта —
// `site/.assetsignore` ги спира при deploy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SITE = new URL("../site/", import.meta.url).pathname;

// Суровите редове (без празни и коментари) — водещ/краен интервал остава,
// за да го хване unsupported(): за Wrangler той е част от шаблона.
function ignorePatterns() {
  return readFileSync(join(SITE, ".assetsignore"), "utf8")
    .split("\n")
    .filter((l) => l !== "" && !l.startsWith("#"));
}

// Приема се само `*.разширение` с малки букви и цифри (напр. `*.test.js`).
// Всичко друго от .gitignore синтаксиса — голи имена (спират и директории),
// пътища, отрицания, `**`, класове, `?`, backslash, главни букви (Wrangler
// мачва без разлика в регистъра), интервали — се отхвърля, за да не мине
// тест, който Wrangler чете другояче.
const SIMPLE = /^\*\.[a-z0-9]+(\.[a-z0-9]+)*$/;

function unsupported(patterns) {
  return patterns.filter((p) => !p.startsWith("#") && !SIMPLE.test(p));
}

// За приетия subset това е точната семантика на Wrangler (.gitignore):
// шаблон без наклонена черта се мачва срещу всяко звено на пътя — файл или
// директория (тя спира всичко под себе си) — без разлика в регистъра.
function ignored(rel, patterns) {
  const segments = rel.toLowerCase().split("/");
  return patterns.some((p) => {
    const suffix = p.slice(1); // "*.test.js" -> ".test.js"
    return segments.some((seg) => seg.endsWith(suffix));
  });
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(relative(SITE, p));
  }
  return out;
}

test("unsupported: връща всичко, което не е точно *.разширение с малки букви", () => {
  assert.deepEqual(
    unsupported(["*.test.js", "!js/format.test.js", "js/", "**/x.js", "a[1].js", "b?.js", "# коментар"]),
    ["!js/format.test.js", "js/", "**/x.js", "a[1].js", "b?.js"],
  );
  // голо име (Wrangler спира и директория с това име), backslash, главни
  // букви (Wrangler мачва без разлика в регистъра), водещ интервал
  assert.deepEqual(
    unsupported([" *.test.js", "js", "\\app.js", "*.JS", "*.min.js", "*.test.js "]),
    [" *.test.js", "js", "\\app.js", "*.JS", "*.test.js "],
  );
});

test("ignored: *.test.js спира и директория с такова име, и без разлика в регистъра", () => {
  assert.equal(ignored("fixtures.test.js/app.js", ["*.test.js"]), true);
  assert.equal(ignored("js/APP.TEST.JS", ["*.test.js"]), true);
  assert.equal(ignored("js/app.js", ["*.test.js"]), false);
  assert.equal(ignored("js/test.js", ["*.test.js"]), false);
});

test("site/.assetsignore ползва само прости шаблони", () => {
  assert.deepEqual(unsupported(ignorePatterns()), []);
});

test("site/.assetsignore спира всеки *.test.js в site/", () => {
  const patterns = ignorePatterns();
  const tests = walk(SITE).filter((f) => f.endsWith(".test.js"));
  assert.ok(tests.length > 0, "има тестове в site/, които трябва да се спрат");
  for (const f of tests) assert.ok(ignored(f, patterns), `${f} не е спрян от .assetsignore`);
});

test("site/.assetsignore не спира самата страница и скриптовете ѝ", () => {
  const patterns = ignorePatterns();
  for (const f of ["index.html", "en/index.html", "js/app.js", "js/map.js", "css/app.css", "vendor/leaflet/leaflet.js"]) {
    assert.ok(!ignored(f, patterns), `${f} е спрян погрешно`);
  }
});
