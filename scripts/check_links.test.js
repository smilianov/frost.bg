// Регресионни тестове за scripts/check_links.mjs.
//
// Кръг 1: директорията получава еднаква присъда в трите форми на адреса
// ("/css", "/css/", относително "css/"); reference-style Markdown, HTML в
// Markdown и многоредов href бяха невидими за парсъра.
//
// Кръг 2: HTML в Markdown продължава да се брои, но само извън inline code
// span-ове и HTML коментари (иначе `` `<a href="/missing">` `` в проза се
// брои като жива връзка); `data-href` вече не съвпада с `href`; адрес с
// крайно "/" към файл (не директория) е мъртъв (ENOTDIR); процентно
// кодирани адреси се разрешават правилно; липсващ корен или дърво без нито
// една връзка провалят проверката, вместо да минат тихо през 0/0.
// Reference-style Markdown е махнат изцяло — хранилището няма нито един
// такъв случай, а коректното му разпознаване иска истински parser.
//
// Всеки тест си строи собствена временна фикстура (mkdtempSync) — не пипа
// истинското дърво и не оставя следа след себе си.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkTree } from "./check_links.mjs";

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "check-links-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

// --- Находка 1 (кръг 1): директория, три форми, една и съща присъда -----

test("директория без index.html е мъртва и в трите форми на адреса", () => {
  const root = fixture({
    "README.md": [
      "[сайт-абсолютна без наклонена черта](/empty)",
      "[сайт-абсолютна с наклонена черта](/empty/)",
      "[относителна с наклонена черта](site/empty/)",
    ].join("\n\n"),
    "site/empty/.gitkeep": "", // директорията съществува, но няма index.html
  });
  try {
    const { dead, checked } = checkTree(root);
    assert.equal(checked, 3);
    assert.equal(dead.length, 3, JSON.stringify(dead));
    const targets = dead.map((d) => d.target).sort();
    assert.deepEqual(targets, ["/empty", "/empty/", "site/empty/"]);
  } finally {
    cleanup(root);
  }
});

test("директория с index.html минава и в трите форми на адреса", () => {
  const root = fixture({
    "README.md": [
      "[сайт-абсолютна без наклонена черта](/guide)",
      "[сайт-абсолютна с наклонена черта](/guide/)",
      "[относителна с наклонена черта](site/guide/)",
    ].join("\n\n"),
    "site/guide/index.html": "<p>ръководство</p>",
  });
  try {
    const { dead, checked } = checkTree(root);
    assert.equal(checked, 3);
    assert.deepEqual(dead, []);
  } finally {
    cleanup(root);
  }
});

// --- Находка 2 (кръг 1): форми, невидими преди поправката ----------------
// (reference-style е премахнат в кръг 2 — виж бележката най-горе; тук
// остават само двете форми, които продължават да се проверяват.)

test("HTML връзка, вградена в Markdown файл, се разпознава", () => {
  // базата носи една истинска връзка (не нула), за да не удари новата
  // проверка "файлове без нито една връзка" от кръг 2.
  const base = fixture({
    "README.md": "[база](docs/base.md)",
    "docs/base.md": "истински файл",
  });
  const withGoodHtml = fixture({
    "README.md": '[база](docs/base.md)\n\n<a href="docs/real.md">връзка</a>',
    "docs/base.md": "истински файл",
    "docs/real.md": "истински файл",
  });
  const withBadHtml = fixture({
    "README.md": '[база](docs/base.md)\n\n<a href="docs/missing.md">връзка</a>',
    "docs/base.md": "истински файл",
  });
  try {
    const baseResult = checkTree(base);
    const good = checkTree(withGoodHtml);
    const bad = checkTree(withBadHtml);
    assert.equal(good.checked, baseResult.checked + 1, "HTML връзката в Markdown трябва да се преброи");
    assert.deepEqual(good.dead, []);
    assert.equal(bad.dead.length, 1);
    assert.equal(bad.dead[0].target, "docs/missing.md");
  } finally {
    cleanup(base);
    cleanup(withGoodHtml);
    cleanup(withBadHtml);
  }
});

test("href, чиято стойност е на следващия ред спрямо тага, се разпознава", () => {
  const base = fixture({ "site/index.html": '<a href="/">начало</a>' });
  const withGoodMultiline = fixture({
    "site/index.html": '<a href="/">начало</a>\n<a href=\n  "/css/app.css">връзка</a>',
    "site/css/app.css": "/* стил */",
  });
  const withBadMultiline = fixture({
    "site/index.html": '<a href="/">начало</a>\n<a href=\n  "/css/missing.css">връзка</a>',
  });
  try {
    const baseResult = checkTree(base);
    const good = checkTree(withGoodMultiline);
    const bad = checkTree(withBadMultiline);
    assert.equal(good.checked, baseResult.checked + 1, "многоредовият href трябва да се преброи");
    assert.deepEqual(good.dead, []);
    assert.equal(bad.dead.length, 1);
    assert.equal(bad.dead[0].target, "/css/missing.css");
    assert.equal(bad.dead[0].line, 3, "докладваният ред трябва да е този на самата стойност, не на 'href='");
  } finally {
    cleanup(base);
    cleanup(withGoodMultiline);
    cleanup(withBadMultiline);
  }
});

// --- Находки от кръг 2 ----------------------------------------------------

test("inline code span не се брои като връзка — нито добра, нито счупена цел", () => {
  const base = fixture({ "README.md": "[база](docs/base.md)", "docs/base.md": "x" });
  const withInlineCode = fixture({
    "README.md": '[база](docs/base.md)\n\nПрозата споменава `<a href="/missing.html">пример</a>` в текста.',
    "docs/base.md": "x",
  });
  try {
    const baseResult = checkTree(base);
    const result = checkTree(withInlineCode);
    assert.equal(result.checked, baseResult.checked, "inline code не трябва да вдига броя");
    assert.deepEqual(result.dead, []);
  } finally {
    cleanup(base);
    cleanup(withInlineCode);
  }
});

test("```-ограден код не се брои като връзка", () => {
  const base = fixture({ "README.md": "[база](docs/base.md)", "docs/base.md": "x" });
  const withFence = fixture({
    "README.md": [
      "[база](docs/base.md)",
      "",
      "```html",
      '<a href="/missing.html">пример</a>',
      "```",
    ].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const baseResult = checkTree(base);
    const result = checkTree(withFence);
    assert.equal(result.checked, baseResult.checked, "код в ```-ограда не трябва да вдига броя");
    assert.deepEqual(result.dead, []);
  } finally {
    cleanup(base);
    cleanup(withFence);
  }
});

test("HTML коментар не се брои като връзка — нито в Markdown, нито в HTML файл", () => {
  const baseMd = fixture({ "README.md": "[база](docs/base.md)", "docs/base.md": "x" });
  const withCommentInMd = fixture({
    "README.md": '[база](docs/base.md)\n\n<!-- <a href="/missing.html">старо</a> -->',
    "docs/base.md": "x",
  });
  const baseHtml = fixture({ "site/index.html": '<a href="/">начало</a>' });
  const withCommentInHtml = fixture({
    "site/index.html": '<a href="/">начало</a>\n<!-- <a href="/missing.html">старо</a> -->',
  });
  try {
    assert.equal(checkTree(withCommentInMd).checked, checkTree(baseMd).checked);
    assert.deepEqual(checkTree(withCommentInMd).dead, []);
    assert.equal(checkTree(withCommentInHtml).checked, checkTree(baseHtml).checked);
    assert.deepEqual(checkTree(withCommentInHtml).dead, []);
  } finally {
    cleanup(baseMd);
    cleanup(withCommentInMd);
    cleanup(baseHtml);
    cleanup(withCommentInHtml);
  }
});

test("`data-href` не съвпада като `href`", () => {
  const root = fixture({
    "site/index.html": '<a href="/">начало</a>\n<div data-href="/missing.html">x</div>',
  });
  try {
    const { checked, dead } = checkTree(root);
    assert.equal(checked, 1, "само истинският href, не data-href");
    assert.deepEqual(dead, []);
  } finally {
    cleanup(root);
  }
});

test("адрес с крайно „/“ към файл (не директория) е мъртъв — ENOTDIR", () => {
  const root = fixture({
    "site/index.html": [
      '<a href="/css/app.css">добра, без наклонена черта</a>',
      '<a href="/css/app.css/">лоша, файл с наклонена черта накрая</a>',
    ].join("\n"),
    "site/css/app.css": "/* стил */",
  });
  try {
    const { dead, checked } = checkTree(root);
    assert.equal(checked, 2);
    assert.equal(dead.length, 1, JSON.stringify(dead));
    assert.equal(dead[0].target, "/css/app.css/");
  } finally {
    cleanup(root);
  }
});

test("процентно кодиран адрес се разрешава към истинския път с интервал", () => {
  const root = fixture({
    "README.md": "[текст](docs/real%20file.md)",
    "docs/real file.md": "истински файл с интервал в името",
  });
  try {
    const { dead } = checkTree(root);
    assert.deepEqual(dead, []);
  } finally {
    cleanup(root);
  }
});

test("липсващ корен проваля проверката, не минава тихо през 0/0", () => {
  const missingRoot = join(tmpdir(), "check-links-does-not-exist-" + Date.now());
  assert.throws(() => checkTree(missingRoot));
});

test("файлове без нито една връзка провалят проверката, не връщат тихо нула", () => {
  const root = fixture({ "README.md": "обикновен текст, никакви връзки тук" });
  try {
    assert.throws(() => checkTree(root));
  } finally {
    cleanup(root);
  }
});

test("единични кавички, изображения и mailto: се обработват правилно", () => {
  const root = fixture({
    "README.md": [
      "[изображение](docs/pic.png)",
      "![alt текст](docs/pic.png)",
      "[поща](mailto:info@frost.bg)",
    ].join("\n\n"),
    "docs/pic.png": "x",
    "site/index.html": "<a href='/'>начало (единични кавички)</a>",
  });
  try {
    const { dead, checked, externalSkipped } = checkTree(root);
    assert.deepEqual(dead, []);
    assert.equal(checked, 3, "изображението (х2, обикновено и ![]) плюс единичните кавички в HTML");
    assert.equal(externalSkipped, 1, "mailto: е външно");
  } finally {
    cleanup(root);
  }
});

test("низът за заявка (?...) се маха преди разрешаването", () => {
  const root = fixture({
    "README.md": "[текст](docs/real.md?utm_source=x)",
    "docs/real.md": "истински файл",
  });
  try {
    assert.deepEqual(checkTree(root).dead, []);
  } finally {
    cleanup(root);
  }
});

// --- регресия за проверката на регистъра (кръг 0) ------------------------

test("разминаване само в регистъра на пътя е мъртва връзка", () => {
  const root = fixture({
    "README.md": "[текст](docs/Real.md)",
    "docs/real.md": "истински файл, различен регистър в първата буква",
  });
  try {
    const { dead } = checkTree(root);
    assert.equal(dead.length, 1);
    assert.equal(dead[0].target, "docs/Real.md");
  } finally {
    cleanup(root);
  }
});

// --- находки, които трябва да продължат да работят (без регресия) -------

test("/api/* се пропуска, без /apiary/ или /api-something да пострадат", () => {
  const root = fixture({
    "site/index.html": [
      '<a href="/api/v1/config">config</a>',
      '<a href="/apiary/">apiary</a>',
    ].join("\n"),
    "site/apiary/index.html": "<p>не е /api/</p>",
  });
  try {
    const { dead, apiSkipped, checked } = checkTree(root);
    assert.equal(apiSkipped, 1);
    assert.equal(checked, 1);
    assert.deepEqual(dead, []);
  } finally {
    cleanup(root);
  }
});

test("котвата се маха, но базовият файл все още се проверява", () => {
  const good = fixture({
    "README.md": "[текст](docs/real.md#section)",
    "docs/real.md": "истински файл",
  });
  const bad = fixture({ "README.md": "[текст](docs/missing.md#section)" });
  try {
    assert.deepEqual(checkTree(good).dead, []);
    assert.equal(checkTree(bad).dead.length, 1);
  } finally {
    cleanup(good);
    cleanup(bad);
  }
});
