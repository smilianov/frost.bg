// Публичните файлове (site/) се качват в Cloudflare като статични assets.
// Тестовете на страницата (site/js/*.test.js) не са част от сайта —
// `site/.assetsignore` ги спира при deploy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SITE = new URL("../site/", import.meta.url).pathname;

function ignorePatterns() {
  return readFileSync(join(SITE, ".assetsignore"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

// Същата семантика като .gitignore за простите шаблони, които ползваме:
// без наклонена черта → мачва името на файла на всяко ниво.
function ignored(rel, patterns) {
  const name = rel.split("/").pop();
  return patterns.some((p) => {
    const re = new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    return p.includes("/") ? re.test(rel) : re.test(name);
  });
}

function unsupported(patterns) {
  return patterns.filter((p) => !p.startsWith("#") && /[!\/?\[]|\*\*/.test(p));
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(relative(SITE, p));
  }
  return out;
}

// Матчерът горе е точен само за прости шаблони (име или *.разширение, без
// път). Всичко друго от .gitignore синтаксиса — отрицания „!", пътища с „/",
// „**", класове „[…]", „?" — Wrangler разбира, а матчерът не; такива
// шаблони се отхвърлят, за да не мине тест, който Wrangler чете другояче.
test("unsupported: връща шаблоните, които простият матчер не разбира", () => {
  assert.deepEqual(
    unsupported(["*.test.js", "!js/format.test.js", "js/", "**/x.js", "a[1].js", "b?.js", "# коментар"]),
    ["!js/format.test.js", "js/", "**/x.js", "a[1].js", "b?.js"],
  );
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
