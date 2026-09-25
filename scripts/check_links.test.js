// Регресионни тестове за scripts/check_links.mjs.
//
// СЪРЦЕТО НА ФАЙЛА Е ТАБЛИЦАТА `CASES`. Този инструмент мина през седем кръга
// поправки и почти всеки от тях счупи съседа си незабелязано — защото
// репродукциите живееха в докладите на ревюера, а не в пакета. Затова всяка
// репродукция от цялата история е ред в таблицата, с коментар откъде идва.
// Ред се маха само съзнателно: ако нечия „поправка“ го обърне, това се вижда
// по име и по произход, а не се случва в тишина.
//
// Всеки ред е { from, name, files, expect }. `expect` описва само това, което
// го интересува; каквото не е споменато, се очаква празно (нула мъртви, нула
// неразпознати) — така нов шум се вижда веднага.
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

// README.md с една жива базова връзка на ред 1 (за да не удари проверката
// „файлове без нито една връзка“) и празен ред 2 — проверяваното започва от
// РЕД 3. Номерата в `expect` се четат спрямо това.
function md(lines, extra = {}) {
  return {
    "README.md": ["[база](docs/base.md)", "", ...(Array.isArray(lines) ? lines : [lines])].join("\n"),
    "docs/base.md": "x",
    ...extra,
  };
}

// site/index.html с една жива връзка на ред 1 — същата роля като `md`.
function html(lines, extra = {}) {
  return {
    "site/index.html": ['<a href="/">начало</a>', ...(Array.isArray(lines) ? lines : [lines])].join("\n"),
    ...extra,
  };
}

const CASES = [
  // --- адресът: /api/, процентно кодиране, нормализиране ------------------
  {
    from: "повторен преглед 2, находка 2 (декодиране по сегменти)",
    name: "/api/a%2Fb/../../missing%zz.html — %2F не е разделител, значи не е маршрут",
    files: md("[x](/api/a%2Fb/../../missing%zz.html)"),
    expect: { checked: 2, api: 0, dead: ["3 /api/a%2Fb/../../missing%zz.html"] },
  },
  {
    from: "повторен преглед 2, находка 2 (вариантът с %FF)",
    name: "/api/a%2Fb/../../missing%FF.html — същото със счупен UTF-8 сегмент",
    files: md("[x](/api/a%2Fb/../../missing%FF.html)"),
    expect: { checked: 2, api: 0, dead: ["3 /api/a%2Fb/../../missing%FF.html"] },
  },
  {
    from: "повторен преглед 3, ново счупване 1",
    name: "/api%2Fv1/missing%zz.html — суровият първи сегмент не е „api“",
    files: md("[x](/api%2Fv1/missing%zz.html)"),
    expect: { checked: 2, api: 0, dead: ["3 /api%2Fv1/missing%zz.html"] },
  },
  {
    from: "повторен преглед 2, находка 3 / преглед 3",
    name: "/api%2Fv1/frost — Worker-ът го дава на ASSETS, значи се проверява",
    files: md("[x](/api%2Fv1/frost)"),
    expect: { checked: 2, api: 0, dead: ["3 /api%2Fv1/frost"] },
  },
  {
    from: "повторен преглед 2, раздел „Проби“ — потвърдено с изпълнение на Worker-а",
    name: "/api/..%2Fmissing.html — pathname запазва %2F, значи Е маршрут",
    files: md("[x](/api/..%2Fmissing.html)"),
    expect: { checked: 1, api: 1 },
  },
  {
    from: "повторен преглед 3, ново счупване 1 (регресията от вълна 3)",
    name: "/api/../a%2Fb/../api%2Fv1/missing.html — „api“ е изяден от ..",
    files: md("[x](/api/../a%2Fb/../api%2Fv1/missing.html)"),
    expect: { checked: 2, api: 0, dead: ["3 /api/../a%2Fb/../api%2Fv1/missing.html"] },
  },
  {
    from: "кръг 1, находка за /api/",
    name: "/api/v1/frost — истинският маршрут се пропуска",
    files: md("[x](/api/v1/frost)"),
    expect: { checked: 1, api: 1 },
  },
  {
    from: "финален преглед, находка 3",
    name: "/api/../missing.html — нормализира се извън /api/",
    files: md("[x](/api/../missing.html)"),
    expect: { checked: 2, api: 0, dead: ["3 /api/../missing.html"] },
  },
  {
    from: "финален преглед, находка 3 (процентно кодиран dot segment)",
    name: "/api/%2e%2e/missing.html — %2e%2e е точков сегмент",
    files: md("[x](/api/%2e%2e/missing.html)"),
    expect: { checked: 2, api: 0, dead: ["3 /api/%2e%2e/missing.html"] },
  },
  {
    from: "кръг 1 — да не пострадат съседите на /api/",
    name: "/apiary/ не е /api/",
    files: html(['<a href="/api/v1/config">config</a>', '<a href="/apiary/">apiary</a>'], {
      "site/apiary/index.html": "<p>не е /api/</p>",
    }),
    expect: { checked: 2, api: 1 },
  },
  {
    from: "повторен преглед 3, „Обещанията“ — външните адреси",
    name: "//example.com/… е protocol-relative, не локален файл",
    files: md("[x](//example.com/missing.html)"),
    expect: { checked: 1, external: 1 },
  },
  {
    from: "кръг 2 — външните схеми",
    name: "mailto: е външен адрес",
    files: md("[поща](mailto:info@frost.bg)"),
    expect: { checked: 1, external: 1 },
  },
  {
    from: "финален преглед, находка 3 (излизане над корена)",
    name: "адрес над корена на сайта е проблем, не тихо разрешаване",
    files: md("[x](/../outside.html)"),
    expect: { checked: 1, unparsable: ["3 над корена на сайта"] },
  },
  {
    from: "финален преглед, находка 3 (излизане над корена)",
    name: "адрес над корена на дървото е проблем",
    files: md("[x](../../outside.md)"),
    expect: { checked: 1, unparsable: ["3 над корена на дървото"] },
  },

  // --- крайна наклонена черта и директории --------------------------------
  {
    from: "повторен преглед 3, ново счупване 2",
    name: "относителен адрес с крайно „/“ към файл е мъртъв (ENOTDIR)",
    files: md("[x](site/css/app.css/)", { "site/css/app.css": "/* стил */" }),
    expect: { checked: 2, dead: ["3 site/css/app.css/"] },
  },
  {
    from: "кръг 2, находка 3",
    name: "сайт-абсолютен адрес с крайно „/“ към файл е мъртъв (ENOTDIR)",
    files: md(["[добра](/css/app.css)", "[лоша](/css/app.css/)"], { "site/css/app.css": "/* стил */" }),
    expect: { checked: 3, dead: ["4 /css/app.css/"] },
  },
  {
    from: "кръг 1, находка 1",
    name: "директория без index.html е мъртва и в трите форми",
    files: md(["[a](/empty)", "[b](/empty/)", "[c](site/empty/)"], { "site/empty/.gitkeep": "" }),
    expect: { checked: 4, dead: ["3 /empty", "4 /empty/", "5 site/empty/"] },
  },
  {
    from: "кръг 1, находка 1",
    name: "директория с index.html минава и в трите форми",
    files: md(["[a](/guide)", "[b](/guide/)", "[c](site/guide/)"], { "site/guide/index.html": "<p>x</p>" }),
    expect: { checked: 4 },
  },
];

const RECOGNITION_CASES = [
  // --- прескачане на граници: коментари, тагове, атрибути -----------------
  {
    from: "кръг 4, дефект 1",
    name: "стойност на атрибут не прескача края на HTML коментар (в Markdown)",
    files: md('<!-- href="https://example.com/ --> <a href="/missing.html">счупена</a>'),
    expect: { checked: 2, dead: ["3 /missing.html"], unparsable: ["3 не изглежда като адрес"] },
  },
  {
    from: "кръг 4, дефект 1 (същото в HTML файл)",
    name: "стойност на атрибут не прескача края на HTML коментар (в site/*.html)",
    files: html('<!-- href="https://example.com/ --> <a href="/missing.html">счупена</a>'),
    expect: { checked: 2, dead: ["2 /missing.html"], unparsable: ["2 не изглежда като адрес"] },
  },
  {
    from: "кръг 4, дефект 3",
    name: "стойност на атрибут не прескача граница на друг атрибут",
    files: html("<a title=' href=\"https://example.com/' href=\"/missing.html\">x</a>"),
    expect: { checked: 2, dead: ["2 /missing.html"], unparsable: ["2 не изглежда като адрес"] },
  },
  {
    from: "кръг 4, дефект 2",
    name: "„](“ в коментар не изяжда съседната Markdown връзка",
    files: md("Текст <!-- ](https://example.com/ --> [счупена](/missing.html)"),
    expect: { checked: 2, dead: ["3 /missing.html"], unparsable: ["3 но не се разпознава"] },
  },
  {
    from: "кръг 3, репродукцията от ревюто",
    name: "обратна кавичка в коментар не изяжда съседната връзка",
    files: md("Текст <!-- ` --> [счупена](/missing.html) `код`"),
    expect: { checked: 2, dead: ["3 /missing.html"] },
  },
  {
    from: "финален преглед, находка 1 (първата репродукция)",
    name: "Markdown заглавие не пренася съвпадението през края на коментар",
    files: md('Текст <!-- [old](https://example.com " --> [broken](/missing.html) <!-- ") -->'),
    expect: { checked: 2, dead: ["3 /missing.html"], unparsable: ["3 но не се разпознава"] },
  },
  {
    from: "финален преглед, находка 1 (втората репродукция)",
    name: "неподдържаният адрес на изображение в значка се съобщава",
    files: md("[![alt](/a(b).png)](https://example.com)"),
    expect: { checked: 1, external: 1, unparsable: ["3 но не се разпознава"] },
  },

  // --- какво СЕ брои: inline code, коментари, HTML в Markdown -------------
  {
    from: "кръг 3, находка 1",
    name: "връзка вътре в `inline code` СЕ се проверява",
    files: md('Прозата споменава `<a href="/missing.html">пример</a>` в текста.'),
    expect: { checked: 2, dead: ["3 /missing.html"] },
  },
  {
    from: "кръг 3, находка 1",
    name: "връзка вътре в HTML коментар СЕ се проверява (в Markdown)",
    files: md('<!-- <a href="/missing.html">старо</a> -->'),
    expect: { checked: 2, dead: ["3 /missing.html"] },
  },
  {
    from: "кръг 3, находка 1",
    name: "връзка вътре в HTML коментар СЕ се проверява (в site/*.html)",
    files: html('<!-- <a href="/missing.html">старо</a> -->'),
    expect: { checked: 2, dead: ["2 /missing.html"] },
  },
  {
    from: "кръг 1, находка 2",
    name: "HTML връзка, вградена в Markdown файл, се разпознава",
    files: md('<a href="docs/missing.md">връзка</a>'),
    expect: { checked: 2, dead: ["3 docs/missing.md"] },
  },
  {
    from: "кръг 1, находка 2",
    name: "href на следващия ред спрямо тага — докладва се редът на СТОЙНОСТТА",
    files: html(["<a href=", '  "/css/missing.css">връзка</a>']),
    expect: { checked: 2, dead: ["3 /css/missing.css"] },
  },

  // --- атрибути: граници, регистър, кавички -------------------------------
  {
    from: "кръг 4, дефект 5",
    name: "главни HREF= и SRC= се проверяват",
    files: html(['<a HREF="/missing.html">x</a>', '<img SRC="/missing.png">']),
    expect: { checked: 3, dead: ["2 /missing.html", "3 /missing.png"] },
  },
  {
    from: "финален преглед, находка 4 (Minor)",
    name: "невалидна граница на атрибут се съобщава, не изчезва",
    files: html(['<a title="x"href="/missing.html">b</a>', '<a/href="/missing2.html">b</a>']),
    expect: { checked: 1, unparsable: ["2 невалидна граница", "3 невалидна граница"] },
  },
  {
    from: "кръг 2 (тихо несъвпадение) → обърнато от финалния преглед, находка 4",
    name: "`href` веднага след кавичка е ПРОБЛЕМ, не тишина",
    files: html("<div title='href=\"/missing.html\"'>x</div>"),
    expect: { checked: 1, unparsable: ["2 невалидна граница"] },
  },
  {
    from: "кръг 4 — фалшива тревога ПО ДОГОВОР, закрепена нарочно",
    name: "`href` след интервал в чужда стойност е мъртва връзка (шумно, допустимо)",
    files: html("<div title='see href=\"/missing.html\"'>x</div>"),
    expect: { checked: 2, dead: ["2 /missing.html"] },
  },
  {
    from: "кръг 2, находка 2",
    name: "`data-href` не съвпада като `href`",
    files: html('<div data-href="/missing.html">x</div>'),
    expect: { checked: 1 },
  },
  {
    from: "кръг 4, дефект 6",
    name: "href без кавички се съобщава, не се пропуска тихо",
    files: html("<a href=/missing.html>x</a>"),
    expect: { checked: 1, unparsable: ["2 без кавички"] },
  },

  // --- Markdown форми ------------------------------------------------------
  {
    from: "кръг 5, притеснение 1 (върнато като капацитет)",
    name: "значка: проверяват се И двете цели — външната и на изображението",
    files: md("[![значка](docs/missing.png)](/цел.html)"),
    expect: { checked: 3, dead: ["3 /цел.html", "3 docs/missing.png"] },
  },
  {
    from: "кръг 5 — позицията на външната връзка",
    name: "значка с етикет на два реда: външната се докладва на реда на своята „[“",
    files: md(["[![значка](docs/missing.png)", "](/цел.html)"]),
    expect: { checked: 3, dead: ["3 /цел.html", "3 docs/missing.png"] },
  },
  {
    from: "кръг 5 — една нива вложеност",
    name: "етикет с една нива вложени скоби се проверява",
    files: md("[а [б] в](/missing.html)"),
    expect: { checked: 2, dead: ["3 /missing.html"] },
  },
  {
    from: "кръг 5 — границата на вложеността",
    name: "двойна вложеност и скоби в адреса остават неразпознати",
    files: md(["[а [б [в] г] д](/target.html)", "[x](/a(b).html)"]),
    expect: { checked: 1, unparsable: ["3 но не се разпознава", "4 но не се разпознава"] },
  },
  {
    from: "финален преглед, находка 1 → границата на заглавието",
    name: "заглавие в кавички с квадратна скоба е неразпознато (и двата вида кавички)",
    files: md(['[a](docs/base.md "виж [бележка]")', "[b](docs/base.md 'виж [бележка]')"]),
    expect: { checked: 1, unparsable: ["3 но не се разпознава", "4 но не се разпознава"] },
  },
  {
    from: "повторен преглед 3, „Обещанията“ — уточнението",
    name: "заглавие в КРЪГЛИ скоби с квадратна скоба вътре се приема",
    files: md("[a](docs/base.md (виж [бележка]))"),
    expect: { checked: 2 },
  },
  {
    from: "повторен преглед 3, „Обещанията“ — подценената поддръжка",
    name: "адрес в <…> с интервал и със скоби СЕ проверява",
    files: md(["[x](<docs/space file.md>)", "[y](<docs/a(b).md>)"], {
      "docs/space file.md": "x",
      "docs/a(b).md": "x",
    }),
    expect: { checked: 3 },
  },
  {
    from: "кръг 4 — интервал в адреса БЕЗ <…>",
    name: "[x](/a b.html) е неразпознат, а не разбран наполовина",
    files: md("[x](/a b.html)"),
    expect: { checked: 1, unparsable: ["3 но не се разпознава"] },
  },
  {
    from: "кръг 4 — етикет през редове",
    name: "етикет на два реда се разпознава",
    files: md(["[текст", "на два реда](/missing.html)"]),
    expect: { checked: 2, dead: ["3 /missing.html"] },
  },
  {
    from: "кръг 4 — заглавието не влиза в целта",
    name: "обикновено заглавие след адреса не влиза в целта",
    files: md(['[a](docs/base.md "заглавие")', "[b](docs/base.md 'заглавие')"]),
    expect: { checked: 3 },
  },
  {
    from: "кръг 2, находка 4",
    name: "процентно кодиран адрес се разрешава към пътя с интервал",
    files: md("[текст](docs/real%20file.md)", { "docs/real file.md": "x" }),
    expect: { checked: 2 },
  },
  {
    from: "кръг 0 — регистърът",
    name: "разминаване само в регистъра е мъртва връзка",
    files: md("[текст](docs/Real.md)", { "docs/real.md": "x" }),
    expect: { checked: 2, dead: ["3 docs/Real.md"] },
  },
  {
    from: "кръг 1 — котвата",
    name: "котвата се маха, но базовият файл се проверява",
    files: md(["[a](docs/base.md#section)", "[b](docs/missing.md#section)"]),
    expect: { checked: 3, dead: ["4 docs/missing.md#section"] },
  },
  {
    from: "кръг 2 — низът за заявка",
    name: "низът за заявка (?…) се маха преди разрешаването",
    files: md("[текст](docs/base.md?utm_source=x)"),
    expect: { checked: 2 },
  },
  {
    from: "кръг 2 — изображения и единични кавички",
    name: "![alt](цел) и единични кавички в HTML се броят",
    files: md(["[изображение](docs/pic.png)", "![alt текст](docs/pic.png)"], {
      "docs/pic.png": "x",
      "site/index.html": "<a href='/'>начало</a>",
    }),
    expect: { checked: 4 },
  },
];

const FENCE_CASES = [
  // --- огради: CommonMark-lite -------------------------------------------
  {
    from: "кръг 3 — единствената редакция",
    name: "```-ограден код не се проверява",
    files: md(["```html", '<a href="/missing.html">пример</a>', "```"]),
    expect: { checked: 1 },
  },
  {
    from: "кръг 4, дефект 4 (първо тире)",
    name: "четворна ограда: троен ред вътре не я затваря",
    files: md(["````", "```html", '<a href="/inside.html">пример</a>', "````", "", "[след](/missing.html)"]),
    expect: { checked: 2, dead: ["8 /missing.html"] },
  },
  {
    from: "кръг 4, дефект 4 (пето тире)",
    name: "~~~ ограда се разпознава",
    files: md(["~~~html", '<a href="/inside.html">x</a>', "~~~"]),
    expect: { checked: 1 },
  },
  {
    from: "кръг 4, дефект 4 (второ тире)",
    name: "четириинтервален код не е ограда — съдържанието му СЕ проверява",
    files: md(["    ```", '    <a href="/inside.html">x</a>', "", "[след](/missing.html)"]),
    expect: { checked: 3, dead: ["4 /inside.html", "6 /missing.html"] },
  },
  {
    from: "кръг 4, дефект 4 (трето тире)",
    name: "ред, започващ с inline span, не е ограда",
    files: md("```код``` и после [x](/missing.html)"),
    expect: { checked: 2, dead: ["3 /missing.html"] },
  },
  {
    from: "паркирано от финалния преглед",
    name: "CRLF ограда се разпознава",
    files: {
      "README.md":
        '[база](docs/base.md)\r\n\r\n```\r\n<a href="/inside.html">x</a>\r\n```\r\n\r\n[след](/missing.html)\r\n',
      "docs/base.md": "x",
    },
    expect: { checked: 2, dead: ["7 /missing.html"] },
  },
  {
    from: "кръг 4, дефект 4 (четвърто тире)",
    name: "незатворена ограда не изяжда остатъка от файла — съобщава се",
    files: md(["```html", '<a href="/inside.html">пример</a>', "", "[след](/missing.html)"]),
    expect: {
      checked: 3,
      dead: ["4 /inside.html", "6 /missing.html"],
      unparsable: ["3 незатворен ограден блок"],
    },
  },
  {
    from: "кръг 5, точка 2 (шумът остава локален)",
    name: "незатворената ограда не отменя зачеркването на затворените преди нея",
    files: md([
      "```html",
      '<a href="/one.html">x</a>',
      "```",
      "",
      "~~~",
      '<a href="/two.html">x</a>',
      "~~~",
      "",
      "```js",
      '<a href="/three.html">x</a>',
    ]),
    expect: { checked: 2, dead: ["12 /three.html"], unparsable: ["11 незатворен ограден блок"] },
  },

  // --- огради и HTML коментари: сечението на двата анализа -----------------
  {
    from: "финален преглед, находка 2",
    name: "маркер за ограда вътре в HTML коментар не започва зачеркване",
    files: md(["<!--", "~~~", "-->", "[broken](/missing.html)", "<!--", "~~~", "-->"]),
    expect: { checked: 2, dead: ["6 /missing.html"], unparsable: ["4 смесени огради"] },
  },
  {
    from: "повторен преглед 1 (обходът на лексикалния анализ)",
    name: "`<!--` в един ограден блок и `-->` в друг не зачеркват истинска връзка",
    files: md([
      "~~~html",
      "<!--",
      "~~~",
      "~~~html",
      "-->",
      "~~~",
      "",
      "[broken](/missing.html)",
      "",
      "<!--",
      "~~~",
      "-->",
    ]),
    expect: { checked: 2, dead: ["10 /missing.html"], unparsable: ["6 смесени огради"] },
  },
  {
    from: "повторен преглед 2, „Може ли още да пропусне тихо връзка?“, точка 1",
    name: "обща грешка на двете маски: връзката НЕ се проверява, но файлът крещи",
    files: {
      "README.md": [
        "~~~html", // 1
        "<!--", // 2
        "~~~", // 3
        "~~~html", // 4
        "-->", // 5
        "~~~", // 6
        "<!--", // 7
        "```", // 8
        "-->", // 9
        "[broken](/missing.html)", // 10 — приета граница: не се проверява
        "<!--", // 11
        "~~~", // 12
        "```", // 13
        "-->", // 14
        "", // 15
        "[база](docs/base.md)", // 16
      ].join("\n"),
      "docs/base.md": "x",
    },
    expect: { checked: 1, unparsable: ["4 смесени огради"] },
  },
  {
    from: "повторен преглед 3, контрапримерът срещу „чистият блок е достатъчен“",
    name: "предходен блок влияе на следващия, макар вторият да е чист",
    files: {
      "README.md": [
        "```html", // 1
        "<!--", // 2
        "```", // 3
        "```text", // 4
        "[x](/missing.html)", // 5 — проверява се въпреки оградата
        "```", // 6
        "-->", // 7
        "", // 8
        "[база](docs/base.md)", // 9
      ].join("\n"),
      "docs/base.md": "x",
    },
    expect: { checked: 2, dead: ["5 /missing.html"], unparsable: ["4 смесени огради"] },
  },
  {
    from: "повторен преглед 2 — правилото да не стане шумно за всичко",
    name: "огради и коментари със СЪВПАДАЩИ маски не вдигат диагностика",
    files: md(["```html", "<!-- пример -->", '<a href="/inside.html">x</a>', "```", "", "[след](/missing.html)"]),
    expect: { checked: 2, dead: ["8 /missing.html"] },
  },
  {
    from: "финален преглед, находка 2 (незатворен коментар)",
    name: "незатворен HTML коментар е проблем; вътре в него не се разпознават огради",
    files: md(["<!--", "```", "[broken](/missing.html)"]),
    expect: { checked: 2, dead: ["5 /missing.html"], unparsable: ["3 незатворен HTML коментар"] },
  },
  {
    from: "повторен преглед 2, „Проби“",
    name: "ограден блок само с отварящ коментар пак дава диагностика",
    files: md(["```", "<!--", "```", "", "[след](/missing.html)"]),
    expect: { checked: 2, dead: ["7 /missing.html"], unparsable: ["4 незатворен HTML коментар"] },
  },
  {
    from: "финален преглед, находка 2",
    name: "обикновена ограда СЛЕД затворен коментар пак зачерква",
    files: md(["<!-- бележка -->", "", "```", '<a href="/inside.html">x</a>', "```", "", "[след](/missing.html)"]),
    expect: { checked: 2, dead: ["9 /missing.html"] },
  },
];

// --- пускането на таблицата ----------------------------------------------

// Очакваните неразпознати се пишат като "<ред> <част от съобщението>" — за да
// не се налага целият текст на диагностиката да се повтаря във всеки ред.
function unparsableMatches(actual, expected) {
  if (actual.length !== expected.length) return false;
  const left = [...actual];
  for (const want of expected) {
    const space = want.indexOf(" ");
    const line = Number(want.slice(0, space));
    const fragment = want.slice(space + 1);
    const at = left.findIndex((u) => u.line === line && u.what.includes(fragment));
    if (at === -1) return false;
    left.splice(at, 1);
  }
  return true;
}

// Всеки ред е подтест със собствено име и произход — за да личи по име кой
// точно случай е паднал и откъде идва, а не само че „таблицата“ е паднала.
test("таблицата с репродукциите от цялата история на инструмента", async (t) => {
  for (const kase of [...CASES, ...RECOGNITION_CASES, ...FENCE_CASES]) {
    await t.test(`${kase.name}  [${kase.from}]`, () => {
      const root = fixture(kase.files);
      try {
        const result = checkTree(root);
        const got = {
          checked: result.checked,
          api: result.apiSkipped,
          external: result.externalSkipped,
          dead: result.dead.map((d) => `${d.line} ${d.target}`).sort(),
          unparsable: result.unparsable.map((u) => `${u.line} ${u.what}`).sort(),
        };
        const want = kase.expect;
        for (const key of ["checked", "api", "external"]) {
          if (want[key] !== undefined) assert.equal(got[key], want[key], `${key} (${kase.from})`);
        }
        assert.deepEqual(got.dead, [...(want.dead ?? [])].sort(), `мъртви връзки (${kase.from})`);
        assert.ok(
          unparsableMatches(result.unparsable, want.unparsable ?? []),
          `неразпознати: ${JSON.stringify(got.unparsable)}, а се очаква ` +
            `${JSON.stringify(want.unparsable ?? [])} (${kase.from})`,
        );
      } finally {
        cleanup(root);
      }
    });
  }
});

// --- това, което таблицата не може да изрази ------------------------------

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
