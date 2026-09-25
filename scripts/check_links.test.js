// Регресионни тестове за scripts/check_links.mjs — всеки покрива по една
// форма на връзка, която ревюто (кръг 1) показа, че или получава грешна
// присъда (директория без index.html), или изобщо не се вижда
// (reference-style, HTML в Markdown, href на следващия ред).
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

// --- Находка 1: директория, три форми, една и съща присъда --------------

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

// --- Находка 2: три форми, невидими преди поправката ---------------------

test("reference-style Markdown връзка се разпознава — броят пада, ако целта липсва", () => {
  const withoutRef = fixture({ "README.md": "обикновен текст, без връзки" });
  const withGoodRef = fixture({
    "README.md": "[текст][ref]\n\n[ref]: docs/real.md",
    "docs/real.md": "истински файл",
  });
  const withBadRef = fixture({
    "README.md": "[текст][ref]\n\n[ref]: docs/missing.md",
  });
  try {
    const base = checkTree(withoutRef);
    const good = checkTree(withGoodRef);
    const bad = checkTree(withBadRef);
    assert.equal(base.checked, 0);
    assert.equal(good.checked, base.checked + 1, "reference-style връзката трябва да се преброи");
    assert.deepEqual(good.dead, []);
    assert.equal(bad.dead.length, 1);
    assert.equal(bad.dead[0].target, "docs/missing.md");
  } finally {
    cleanup(withoutRef);
    cleanup(withGoodRef);
    cleanup(withBadRef);
  }
});

test("HTML връзка, вградена в Markdown файл, се разпознава", () => {
  const withoutHtml = fixture({ "README.md": "обикновен текст, без връзки" });
  const withGoodHtml = fixture({
    "README.md": '<a href="docs/real.md">връзка</a>',
    "docs/real.md": "истински файл",
  });
  const withBadHtml = fixture({
    "README.md": '<a href="docs/missing.md">връзка</a>',
  });
  try {
    const base = checkTree(withoutHtml);
    const good = checkTree(withGoodHtml);
    const bad = checkTree(withBadHtml);
    assert.equal(good.checked, base.checked + 1, "HTML връзката в Markdown трябва да се преброи");
    assert.deepEqual(good.dead, []);
    assert.equal(bad.dead.length, 1);
    assert.equal(bad.dead[0].target, "docs/missing.md");
  } finally {
    cleanup(withoutHtml);
    cleanup(withGoodHtml);
    cleanup(withBadHtml);
  }
});

test("href, чиято стойност е на следващия ред спрямо тага, се разпознава", () => {
  const withoutIt = fixture({ "site/index.html": "<p>нищо тук</p>" });
  const withGoodMultiline = fixture({
    "site/index.html": '<a href=\n  "/css/app.css">връзка</a>',
    "site/css/app.css": "/* стил */",
  });
  const withBadMultiline = fixture({
    "site/index.html": '<a href=\n  "/css/missing.css">връзка</a>',
  });
  try {
    const base = checkTree(withoutIt);
    const good = checkTree(withGoodMultiline);
    const bad = checkTree(withBadMultiline);
    assert.equal(good.checked, base.checked + 1, "многоредовият href трябва да се преброи");
    assert.deepEqual(good.dead, []);
    assert.equal(bad.dead.length, 1);
    assert.equal(bad.dead[0].target, "/css/missing.css");
    assert.equal(bad.dead[0].line, 2, "докладваният ред трябва да е този на самата стойност, не на 'href='");
  } finally {
    cleanup(withoutIt);
    cleanup(withGoodMultiline);
    cleanup(withBadMultiline);
  }
});

// --- регресия за проверката на регистъра (round 3 от предния преглед) ---

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
