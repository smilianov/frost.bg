// Регресионни тестове за scripts/check_links.mjs.
//
// Кръг 1: директорията получава еднаква присъда в трите форми на адреса
// ("/css", "/css/", относително "css/"); reference-style Markdown, HTML в
// Markdown и многоредов href бяха невидими за парсъра.
//
// Кръг 2: HTML в Markdown продължава да се брои; `data-href` вече не
// съвпада с `href`; адрес с крайно "/" към файл (не директория) е мъртъв
// (ENOTDIR); процентно кодирани адреси се разрешават правилно; липсващ
// корен или дърво без нито една връзка провалят проверката, вместо да
// минат тихо през 0/0. Reference-style Markdown е махнат изцяло —
// хранилището няма нито един такъв случай, а коректното му разпознаване
// иска истински parser.
//
// Кръг 2 добави и редакция на inline code span-ове/HTML коментари, за да
// не се броят примери в проза — но кръг 3 я МАХНА: `<!-- ` --> [счупена
// връзка](...) `код` ` показа, че единична обратна кавичка в коментар се
// сдвоява с обратната кавичка на съвсем друг inline code span по-надолу и
// изяжда истинска връзка между тях — тих фалшив негатив, единственото
// недопустимо нещо за този инструмент. Сега се редактират само ```-огради
// (котвени за реда, без такъв риск); всичко друго, включително вътре в
// `inline code` и <!-- коментари -->, се брои. `href`/`src` вече изисква
// истинска позиция на атрибут (предхожда го `\s`), не само "не буква/тире"
// — `<div title='href="/x"'>` вече не съвпада.
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

// --- Находки от кръг 3: без inline-code/коментар редакция ----------------

test("inline code span СЕ брои като връзка — счупена цел вътре в `код` се хваща", () => {
  const root = fixture({
    "README.md": '[база](docs/base.md)\n\nПрозата споменава `<a href="/missing.html">пример</a>` в текста.',
    "docs/base.md": "x",
  });
  try {
    const { dead } = checkTree(root);
    assert.equal(dead.length, 1, JSON.stringify(dead));
    assert.equal(dead[0].target, "/missing.html");
  } finally {
    cleanup(root);
  }
});

test("```-ограден код не се брои като връзка (единствената редакция, останала в кръг 3)", () => {
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

test("HTML коментар СЕ брои като връзка — нито в Markdown, нито в HTML файл не се прескача", () => {
  const withCommentInMd = fixture({
    "README.md": '[база](docs/base.md)\n\n<!-- <a href="/missing.html">старо</a> -->',
    "docs/base.md": "x",
  });
  const withCommentInHtml = fixture({
    "site/index.html": '<a href="/">начало</a>\n<!-- <a href="/missing.html">старо</a> -->',
  });
  try {
    const md = checkTree(withCommentInMd);
    assert.equal(md.dead.length, 1, JSON.stringify(md.dead));
    assert.equal(md.dead[0].target, "/missing.html");
    const html = checkTree(withCommentInHtml);
    assert.equal(html.dead.length, 1, JSON.stringify(html.dead));
    assert.equal(html.dead[0].target, "/missing.html");
  } finally {
    cleanup(withCommentInMd);
    cleanup(withCommentInHtml);
  }
});

test("коментар с обратна кавичка не изяжда съседна Markdown връзка (репродукцията от ревюто)", () => {
  // <!-- ` --> [счупена](...) `код` — единичната обратна кавичка в
  // коментара по-рано се сдвояваше с тази на `код` и изяждаше връзката
  // между тях, докато скриптът докладваше "0 мъртви връзки".
  const root = fixture({
    "README.md": "Текст <!-- ` --> [счупена](/missing.html) `код`\n",
  });
  try {
    const { dead } = checkTree(root);
    assert.equal(dead.length, 1, JSON.stringify(dead));
    assert.equal(dead[0].target, "/missing.html");
  } finally {
    cleanup(root);
  }
});

test("`href` веднага след кавичка е ПРОБЛЕМ, не тиха несъвпадналост", () => {
  // ОБЪРНАТ след финалния преглед: досега `<div title='href="/x"'>` просто не
  // съвпадаше — тихо. Кавичка (или наклонена черта) пред името значи или
  // невалиден маркъп (`<a title="x"href=…>`), или стойност на друг атрибут:
  // и в двата случая инструментът дължи диагностика, не тишина. Целта пак НЕ
  // се проверява — броячът остава 1.
  const root = fixture({
    "site/index.html": [
      '<a href="/">начало</a>',
      '<div title=\'href="/missing.html"\'>x</div>',
    ].join("\n"),
  });
  try {
    const { checked, dead, unparsable } = checkTree(root);
    assert.equal(checked, 1, "само истинският href, не подниз в друг атрибут");
    assert.deepEqual(dead, []);
    assert.deepEqual(unparsable.map((u) => u.line), [2], JSON.stringify(unparsable));
    assert.match(unparsable[0].what, /невалидна граница на атрибут/);
  } finally {
    cleanup(root);
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

// --- Находки от кръг 4: „разпознай или се оплаши“ ------------------------
// Общото при всичките шест дефекта долу е едно: регулярен израз без граници
// прескачаше край на таг, на коментар или на ограда и изяждаше истинската
// връзка след себе си, докато скриптът докладваше „Всички са живи.“. Тих
// пропуск е единственото недопустимо; шумна фалшива тревога — не е.

test("четворна ограда: тройният ред вътре не я затваря, връзката след нея се проверява", () => {
  // Преди: `/^\s*```/` се превключваше на всеки такъв ред — тройният ред
  // вътре „затваряше“ четворната, `<a href>` отвътре се проверяваше (шумно),
  // а четворната накрая отваряше нова ограда и изяждаше остатъка от файла.
  const root = fixture({
    "README.md": [
      "[база](docs/base.md)",
      "",
      "````",
      "```html",
      '<a href="/inside.html">пример</a>',
      "````",
      "",
      "[след оградата](/missing.html)",
    ].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const { dead, checked } = checkTree(root);
    assert.equal(checked, 2, "базата и връзката след оградата, нищо отвътре");
    assert.deepEqual(dead.map((d) => d.target), ["/missing.html"]);
  } finally {
    cleanup(root);
  }
});

test("четириинтервален код с буквални огради вътре не е ограда — връзката след него се проверява", () => {
  // Отстъп от 4+ интервала не отваря ограда (CommonMark: `{0,3}`). Преди
  // „    ```“ отваряше ограда и всичко след нея изчезваше тихо.
  const root = fixture({
    "README.md": [
      "[база](docs/base.md)",
      "",
      "    ```",
      '    <a href="/inside.html">пример</a>',
      "",
      "[след кода](/missing.html)",
    ].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const { dead } = checkTree(root);
    // Четириинтервалният код СЕ проверява — шумно, но не тихо: това е
    // границата, която заглавният коментар на скрипта назовава.
    assert.deepEqual(dead.map((d) => d.target).sort(), ["/inside.html", "/missing.html"]);
  } finally {
    cleanup(root);
  }
});

test("ред, започващ с inline span, не е ограда — връзката на същия ред се проверява", () => {
  // CommonMark: при обратни кавички info string-ът не бива да съдържа
  // обратна кавичка. Преди целият ред се зануляваше и връзката на него
  // изчезваше тихо, а остатъкът от файла оставаше „в ограда“.
  const root = fixture({
    "README.md": ["[база](docs/base.md)", "", "```код``` и после [x](/missing.html)"].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const { dead } = checkTree(root);
    assert.deepEqual(dead.map((d) => d.target), ["/missing.html"]);
  } finally {
    cleanup(root);
  }
});

test("незатворена ограда се съобщава като неразпозната, а не изяжда остатъка от файла", () => {
  // Преди: отварящата ограда без затваряща зануляваше всичко до края на
  // файла — тих пропуск. Сега нищо не се зачерква, съдържанието се проверява
  // шумно, а редът на отварящата излиза в `unparsable`. CLI-ят излиза с 1
  // точно когато dead.length + unparsable.length > 0.
  const root = fixture({
    "README.md": [
      "[база](docs/base.md)",
      "",
      "```html",
      '<a href="/inside.html">пример</a>',
      "",
      "[след](/missing.html)",
    ].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const { dead, unparsable } = checkTree(root);
    assert.equal(unparsable.length, 1, JSON.stringify(unparsable));
    assert.equal(unparsable[0].file, "README.md");
    assert.equal(unparsable[0].line, 3, "редът на отварящата ограда");
    assert.deepEqual(dead.map((d) => d.target).sort(), ["/inside.html", "/missing.html"]);
    assert.ok(dead.length + unparsable.length > 0, "условието, по което CLI-ят излиза с 1");
  } finally {
    cleanup(root);
  }
});

test("~~~ ограда се разпознава — съдържанието ѝ не се проверява", () => {
  const base = fixture({ "README.md": "[база](docs/base.md)", "docs/base.md": "x" });
  const withTilde = fixture({
    "README.md": [
      "[база](docs/base.md)",
      "",
      "~~~html",
      '<a href="/inside.html">пример</a>',
      "~~~",
    ].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const baseResult = checkTree(base);
    const result = checkTree(withTilde);
    assert.equal(result.checked, baseResult.checked, "код в ~~~-ограда не трябва да вдига броя");
    assert.deepEqual(result.dead, []);
  } finally {
    cleanup(base);
    cleanup(withTilde);
  }
});

test("стойност на атрибут не прескача края на HTML коментар", () => {
  // Преди: `[^"]*` поглъщаше `https://example.com/ --> <a href=`, това
  // минаваше за „външен адрес“ и истинският href никога не се разглеждаше —
  // 0 мъртви връзки, exit 0. Сега стойност с празно пространство, `<` или
  // `>` е проблем, а сканирането продължава веднага след „=“ и намира
  // истинския href на същия ред.
  const inMd = fixture({
    "README.md": '[база](docs/base.md)\n\n<!-- href="https://example.com/ --> <a href="/missing.html">счупена</a>\n',
    "docs/base.md": "x",
  });
  const inHtml = fixture({
    "site/index.html": '<a href="/">начало</a>\n<!-- href="https://example.com/ --> <a href="/missing.html">счупена</a>\n',
  });
  try {
    const md = checkTree(inMd);
    assert.deepEqual(md.dead.map((d) => d.target), ["/missing.html"], JSON.stringify(md));
    assert.equal(md.unparsable.length, 1, JSON.stringify(md.unparsable));
    const html = checkTree(inHtml);
    assert.deepEqual(html.dead.map((d) => d.target), ["/missing.html"], JSON.stringify(html));
    assert.equal(html.unparsable.length, 1, JSON.stringify(html.unparsable));
  } finally {
    cleanup(inMd);
    cleanup(inHtml);
  }
});

test("стойност на атрибут не прескача граница на друг атрибут", () => {
  // `title=' href="https://example.com/'` — преди `[^"]*` вземаше
  // `https://example.com/' href=` за адрес и изяждаше истинския href.
  const root = fixture({
    "site/index.html": [
      '<a href="/">начало</a>',
      "<a title=' href=\"https://example.com/' href=\"/missing.html\">x</a>",
    ].join("\n"),
  });
  try {
    const { dead, unparsable } = checkTree(root);
    assert.deepEqual(dead.map((d) => d.target), ["/missing.html"], JSON.stringify(dead));
    assert.equal(unparsable.length, 1, JSON.stringify(unparsable));
  } finally {
    cleanup(root);
  }
});

test("главни HREF= и SRC= се проверяват", () => {
  const root = fixture({
    "site/index.html": ['<a href="/">начало</a>', '<a HREF="/missing.html">x</a>', '<img SRC="/missing.png">'].join("\n"),
  });
  try {
    const { dead, checked } = checkTree(root);
    assert.equal(checked, 3);
    assert.deepEqual(dead.map((d) => d.target).sort(), ["/missing.html", "/missing.png"]);
  } finally {
    cleanup(root);
  }
});

test("href без кавички се съобщава като неразпознат, не се пропуска тихо", () => {
  // Скриптът нарочно не разрешава адрес без кавички (границата му е неясна
  // без истински HTML parser), но „не проверявам“ вече не значи „мълча“.
  const root = fixture({
    "site/index.html": '<a href="/">начало</a>\n<a href=/missing.html>x</a>\n',
  });
  try {
    const { dead, unparsable } = checkTree(root);
    assert.deepEqual(dead, []);
    assert.equal(unparsable.length, 1, JSON.stringify(unparsable));
    assert.equal(unparsable[0].file, join("site", "index.html"));
    assert.equal(unparsable[0].line, 2);
    assert.match(unparsable[0].what, /без кавички/);
  } finally {
    cleanup(root);
  }
});

test("`href` в стойността на друг атрибут след празно пространство е ФАЛШИВА ТРЕВОГА (нарочно)", () => {
  // `<div title='see href="/missing.html"'>` изглежда точно като атрибут на
  // реална позиция (предхожда го интервал) и излиза като мъртва връзка,
  // каквато няма. ЗАКРЕПЕНО нарочно: шумната фалшива тревога се вижда и се
  // решава с ограден блок за минута; тихият пропуск не се вижда никога.
  // Ако някой „поправи“ това с по-хлабав regex, този тест трябва да падне и
  // да го накара да мине пак през трите кръга, които вече платихме.
  const root = fixture({
    "site/index.html": '<a href="/">начало</a>\n<div title=\'see href="/missing.html"\'>x</div>\n',
  });
  try {
    const { dead } = checkTree(root);
    assert.deepEqual(dead.map((d) => d.target), ["/missing.html"]);
  } finally {
    cleanup(root);
  }
});

test("коментар с „](“ не изяжда съседната Markdown връзка", () => {
  // Преди: `\]\(([^)]+)\)` хващаше първото `](` — това в коментара — и
  // поглъщаше `https://example.com/ --> [счупена](/missing.html`, което
  // минаваше за външен адрес. 0 мъртви връзки, exit 0. Сега MD_INLINE иска
  // истински `[етикет]` и адрес без празно пространство, а всяко `](`, което
  // не попада в прието съвпадение, излиза като проблем.
  const root = fixture({
    "README.md": "[база](docs/base.md)\n\nТекст <!-- ](https://example.com/ --> [счупена](/missing.html)\n",
    "docs/base.md": "x",
  });
  try {
    const { dead, unparsable } = checkTree(root);
    assert.deepEqual(dead.map((d) => d.target), ["/missing.html"], JSON.stringify(dead));
    assert.equal(unparsable.length, 1, JSON.stringify(unparsable));
    assert.equal(unparsable[0].line, 3);
  } finally {
    cleanup(root);
  }
});

test("[x](/a b.html) се съобщава като неразпознат, а не се разбира наполовина", () => {
  // Интервал в адреса не е Markdown връзка (в CommonMark адрес с интервал се
  // пише в `<…>`). Преди целият низ „/a b.html“ се вземаше за адрес и се
  // докладваше като мъртва връзка с невярна цел — сега е неразпознато.
  const root = fixture({
    "README.md": "[база](docs/base.md)\n\n[x](/a b.html)\n",
    "docs/base.md": "x",
  });
  try {
    const { dead, unparsable } = checkTree(root);
    assert.deepEqual(dead, []);
    assert.equal(unparsable.length, 1, JSON.stringify(unparsable));
    assert.equal(unparsable[0].line, 3);
  } finally {
    cleanup(root);
  }
});

test("адрес в <…> се разпознава, включително с интервал вътре", () => {
  const root = fixture({
    "README.md": "[текст](<docs/real file.md>)",
    "docs/real file.md": "истински файл с интервал в името",
  });
  try {
    const { dead, checked } = checkTree(root);
    assert.equal(checked, 1);
    assert.deepEqual(dead, []);
  } finally {
    cleanup(root);
  }
});

test("етикет на два реда се разпознава като връзка", () => {
  const root = fixture({
    "README.md": "[база](docs/base.md)\n\n[текст\nна два реда](/missing.html)\n",
    "docs/base.md": "x",
  });
  try {
    const { dead } = checkTree(root);
    assert.deepEqual(dead.map((d) => d.target), ["/missing.html"], JSON.stringify(dead));
  } finally {
    cleanup(root);
  }
});

test("заглавие след адреса не влиза в целта", () => {
  const root = fixture({
    "README.md": '[текст](docs/real.md "заглавие")\n[друг](docs/real.md \'заглавие\')\n',
    "docs/real.md": "истински файл",
  });
  try {
    const { dead, checked } = checkTree(root);
    assert.equal(checked, 2);
    assert.deepEqual(dead, []);
  } finally {
    cleanup(root);
  }
});

test("двойна вложеност в етикета и скоби в адреса остават неразпознати — шумно, не тихо", () => {
  // ОБЪРНАТ в кръг 5 спрямо кръг 4: тогава и `[![значка](img)](цел)`, и
  // `[а [б] в](цел)` бяха „Неразпознато“. Сега етикетът допуска ЕДНА нива
  // вложеност (виж теста за значката), а тук остава това, което НЕ се
  // поддържа: двойна вложеност и скоби в адреса. И двете са шумни, не тихи.
  // Ако някой реши да поддържа и тях, това иска истински CommonMark parser —
  // и този тест трябва да се обърне нарочно, не да падне мълчаливо.
  const root = fixture({
    "README.md": [
      "[база](docs/base.md)", // 1
      "", // 2
      "[а [б [в] г] д](/target.html)", // 3 — двойна вложеност
      "[x](/a(b).html)", // 4 — скоби в адреса
    ].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const { dead, unparsable } = checkTree(root);
    assert.deepEqual(dead, []);
    assert.deepEqual(
      unparsable.map((u) => u.line),
      [3, 4],
      JSON.stringify(unparsable),
    );
  } finally {
    cleanup(root);
  }
});

// --- Кръг 5: затворените огради си остават зачеркнати --------------------

test("незатворената ограда не отменя зачеркването на затворените преди нея", () => {
  // Кръг 4 не зачеркваше НИЩО, щом файлът завършва с незатворена ограда —
  // един истински дефект гърмеше цял файл с фалшиви тревоги. Сега шумът е
  // локален: затворените огради се зачеркват нормално, само незатворената се
  // проверява и редът ѝ излиза като проблем.
  const root = fixture({
    "README.md": [
      "[база](docs/base.md)", // 1
      "", // 2
      "```html", // 3
      '<a href="/one.html">x</a>', // 4
      "```", // 5
      "", // 6
      "~~~", // 7
      '<a href="/two.html">x</a>', // 8
      "~~~", // 9
      "", // 10
      "```js", // 11 — остава незатворена
      '<a href="/three.html">x</a>', // 12
    ].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const { dead, unparsable } = checkTree(root);
    assert.deepEqual(dead.map((d) => d.target), ["/three.html"], JSON.stringify(dead));
    assert.deepEqual(unparsable, [
      { file: "README.md", line: 11, what: "незатворен ограден блок" },
    ]);
  } finally {
    cleanup(root);
  }
});

// --- Кръг 5: една нива вложеност в етикета -------------------------------

test("изображение като връзка се проверява — и външната цел, и самото изображение", () => {
  // `[![значка](img)](цел)` е стандартната форма за значка. Кръг 4 я
  // съобщаваше като „Неразпознато“ (шумно, но загубен капацитет); сега
  // етикетът допуска една нива вложеност и се проверяват ДВЕТЕ цели —
  // външната и на самото изображение, за да не изчезне вътрешната тихо.
  const root = fixture({
    "README.md": ["[база](docs/base.md)", "", "[![значка](docs/missing.png)](/цел.html)"].join("\n"),
    "docs/base.md": "x",
  });
  // Етикет, който минава през два реда: докладваната позиция на външната
  // връзка трябва да е редът на отварящата `[`, не този на „](“.
  const wrapped = fixture({
    "README.md": ["[база](docs/base.md)", "", "[![значка](docs/missing.png)", "](/цел.html)"].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const { dead, unparsable, checked } = checkTree(root);
    assert.deepEqual(unparsable, []);
    assert.equal(checked, 3, "базата, външната цел и самото изображение");
    assert.deepEqual(
      dead.map((d) => `${d.line} ${d.target}`).sort(),
      ["3 /цел.html", "3 docs/missing.png"],
      JSON.stringify(dead),
    );
    const w = checkTree(wrapped);
    assert.deepEqual(w.unparsable, []);
    const outer = w.dead.find((d) => d.target === "/цел.html");
    assert.equal(outer.line, 3, "външната връзка се докладва на реда на своята отваряща скоба");
  } finally {
    cleanup(root);
    cleanup(wrapped);
  }
});

// --- Финален преглед: броим РАЗПОЗНАВАНЕ, не покритие --------------------

test("невалидна граница на атрибут се съобщава, а не изчезва без диагностика", () => {
  // `<a title="x"href=…>` и `<a/href=…>` са невалиден маркъп, но инструментът
  // обещава шумен отказ при неразпознаване — досега изчезваха тихо.
  const root = fixture({
    "site/index.html": [
      '<a href="/">начало</a>', // 1
      '<a title="x"href="/missing.html">broken</a>', // 2 — кавичка преди href
      '<a/href="/missing2.html">broken</a>', // 3 — наклонена черта преди href
    ].join("\n"),
  });
  try {
    const { dead, unparsable, checked } = checkTree(root);
    assert.equal(checked, 1, "само истинският href");
    assert.deepEqual(dead, []);
    assert.deepEqual(unparsable.map((u) => u.line), [2, 3], JSON.stringify(unparsable));
    assert.match(unparsable[0].what, /невалидна граница на атрибут/);
  } finally {
    cleanup(root);
  }
});

test("/api/ се решава след нормализиране — dot segments не крият мъртва връзка", () => {
  // `/api/../missing.html` и `/api/%2e%2e/missing.html` се нормализират до
  // `/missing.html`, значи НЕ са маршрути на Worker-а. Досега се пропускаха по
  // суровия префикс и броячът на пропуснатите API маршрути растеше.
  const root = fixture({
    "README.md": [
      "[база](docs/base.md)", // 1
      "[x](/api/../missing.html)", // 2
      "[x](/api/%2e%2e/missing.html)", // 3
      "[истински](/api/v1/frost)", // 4 — маршрут, пропуска се
    ].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const { dead, apiSkipped, unparsable } = checkTree(root);
    assert.equal(apiSkipped, 1, "само истинският /api/v1/frost");
    assert.deepEqual(unparsable, []);
    assert.deepEqual(dead.map((d) => d.line), [2, 3], JSON.stringify(dead));
  } finally {
    cleanup(root);
  }
});

test("адрес, който излиза над корена, е проблем, не тихо разрешаване", () => {
  const root = fixture({
    "README.md": [
      "[база](docs/base.md)", // 1
      "[x](/../outside.html)", // 2 — над корена на сайта
      "[x](../../outside.md)", // 3 — над корена на дървото
    ].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const { dead, unparsable } = checkTree(root);
    assert.deepEqual(dead, []);
    assert.deepEqual(unparsable.map((u) => u.line), [2, 3], JSON.stringify(unparsable));
    assert.match(unparsable[0].what, /над корена/);
  } finally {
    cleanup(root);
  }
});

test("маркер за ограда вътре в HTML коментар не започва зачеркване", () => {
  // Двата `~~~` са в ОТДЕЛНИ HTML коментара, а връзката между тях е
  // обикновена Markdown връзка извън код. Досега redactFences ги сдвояваше и
  // изтриваше всичко между тях — 0 проблеми, exit 0, истинската връзка
  // изчезваше тихо. Коментарният контекст се ползва САМО за решението дали
  // маркерът е истински: съдържанието на коментарите пак СЕ проверява.
  const root = fixture({
    "README.md": [
      "[база](docs/base.md)", // 1
      "", // 2
      "<!--", // 3
      "~~~", // 4
      "-->", // 5
      "[broken](/missing.html)", // 6
      "<!--", // 7
      "~~~", // 8
      "-->", // 9
    ].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const { dead, unparsable } = checkTree(root);
    assert.deepEqual(unparsable, []);
    assert.deepEqual(
      dead.map((d) => `${d.line} ${d.target}`),
      ["6 /missing.html"],
      JSON.stringify(dead),
    );
  } finally {
    cleanup(root);
  }
});

test("незатворен HTML коментар е проблем и вътре в него не се разпознават огради", () => {
  const root = fixture({
    "README.md": [
      "[база](docs/base.md)", // 1
      "", // 2
      "<!--", // 3 — не се затваря до края на файла
      "```", // 4 — маркер вътре в коментара, значи не е ограда
      "[broken](/missing.html)", // 5
    ].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const { dead, unparsable } = checkTree(root);
    assert.deepEqual(
      unparsable,
      [{ file: "README.md", line: 3, what: "незатворен HTML коментар" }],
      JSON.stringify(unparsable),
    );
    assert.deepEqual(dead.map((d) => d.target), ["/missing.html"], JSON.stringify(dead));
  } finally {
    cleanup(root);
  }
});

test("обикновена ограда СЛЕД затворен коментар пак зачерква", () => {
  const root = fixture({
    "README.md": [
      "[база](docs/base.md)", // 1
      "", // 2
      "<!-- бележка -->", // 3
      "", // 4
      "```", // 5
      '<a href="/inside.html">x</a>', // 6
      "```", // 7
      "", // 8
      "[след](/missing.html)", // 9
    ].join("\n"),
    "docs/base.md": "x",
  });
  try {
    const { dead, unparsable } = checkTree(root);
    assert.deepEqual(unparsable, []);
    assert.deepEqual(dead.map((d) => `${d.line} ${d.target}`), ["9 /missing.html"], JSON.stringify(dead));
  } finally {
    cleanup(root);
  }
});

test("CRLF ограда се разпознава — съдържанието ѝ не се проверява", () => {
  // Маркерът след `\r` не се разпознаваше: съдържанието се проверяваше шумно.
  const root = fixture({
    "README.md": "[база](docs/base.md)\r\n\r\n```\r\n<a href=\"/inside.html\">x</a>\r\n```\r\n\r\n[след](/missing.html)\r\n",
    "docs/base.md": "x",
  });
  try {
    const { dead, unparsable, checked } = checkTree(root);
    assert.deepEqual(unparsable, []);
    assert.equal(checked, 2, "базата и връзката след оградата, нищо отвътре");
    assert.deepEqual(dead.map((d) => d.target), ["/missing.html"], JSON.stringify(dead));
  } finally {
    cleanup(root);
  }
});

test("Markdown заглавие не пренася съвпадението през края на коментар", () => {
  // Репродукцията на ревюера: заглавието в кавички поглъщаше
  // ` --> [broken](/missing.html) <!-- `, външният адрес минаваше за
  // разпозната връзка, а `](` на истинската попадаше В диапазона на приетото
  // съвпадение, тоест минаваше за „вече обработено“. 115 проверени, 0
  // проблеми, exit 0. Сега заглавието не може да съдържа квадратна скоба, а
  // отчитането е по ПОЗИЦИЯ на разпознатото `](`, не по диапазон.
  const root = fixture({
    "README.md":
      '[база](docs/base.md)\n\nТекст <!-- [old](https://example.com " --> [broken](/missing.html) <!-- ") -->\n',
    "docs/base.md": "x",
  });
  try {
    const { dead, unparsable } = checkTree(root);
    assert.deepEqual(dead.map((d) => `${d.line} ${d.target}`), ["3 /missing.html"], JSON.stringify(dead));
    assert.deepEqual(unparsable.map((u) => u.line), [3], JSON.stringify(unparsable));
  } finally {
    cleanup(root);
  }
});

test("неподдържаният адрес на изображение в значка се съобщава, а не се заглушава", () => {
  // `[![alt](/a(b).png)](https://example.com)` — външната връзка се разпознава,
  // но адресът на изображението има скоби (неподдържана форма). Досега неговото
  // `](` попадаше в диапазона на външното съвпадение и изчезваше без следа.
  const root = fixture({
    "README.md": "[база](docs/base.md)\n\n[![alt](/a(b).png)](https://example.com)\n",
    "docs/base.md": "x",
  });
  try {
    const { dead, unparsable, externalSkipped } = checkTree(root);
    assert.deepEqual(dead, []);
    assert.equal(externalSkipped, 1, "външната връзка пак се разпознава");
    assert.deepEqual(unparsable.map((u) => u.line), [3], JSON.stringify(unparsable));
  } finally {
    cleanup(root);
  }
});
