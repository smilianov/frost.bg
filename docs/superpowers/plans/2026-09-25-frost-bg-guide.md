# Ръководството на сайта и документацията за разработчика — план за изпълнение

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Човекът, който вижда датите, да може да прочете на самия сайт какво значат — графиката, периодите, рискът, сезонът, двете височини, защо се разминават с наблюденията му — а разработчикът да намери в репото как е устроен проектът и как да предложи промяна.

**Architecture:** Две нови статични страници (`site/guide/index.html`, `site/en/guide/index.html`) със същия облик като началната — същият `app.css`, същият header и footer, без JavaScript и без нова зависимост. Никакъв Markdown не се рендира в браузъра: за човека пишем HTML, за разработчика остава Markdown в `docs/`. Плюс `docs/{bg,en}/architecture.md` и `CONTRIBUTING.md` в корена, и връзка „Как се чете“ / „How to read this“ във футъра на трите страници.

**Tech Stack:** Vanilla HTML/CSS, без build стъпка и без зависимости; тестовете са `node --test` (`worker/*.test.js`, `site/js/*.test.js`); Cloudflare Workers static assets.

**Spec:** Няма отделен документ — дизайнът е одобрен в разговора на 25 септември 2026 и е записан изцяло в „Global Constraints“ по-долу. Обвързващата спецификация на проекта остава `docs/superpowers/specs/2026-09-14-frost-bg-design.md` (Р3 — страницата) и `docs/superpowers/specs/2026-09-23-frost-bg-phase2-design.md` (Ф1–Ф7 — числата, които ръководството обяснява).

## Global Constraints

- **Никакъв Markdown в браузъра и никаква нова зависимост.** Ръководството е HTML, написан на ръка; `docs/*.md` остават за GitHub.
- **Същият облик като началната страница:** `<link rel="stylesheet" href="/css/app.css">` (без Leaflet), `<header class="top">` с `frost.bg` и превключвателя на езика, `<main class="wrap">`, `<footer class="foot">`. Нови CSS правила само ако съществуващите не стигат, и в същия файл.
- **Без JavaScript** в двете нови страници: няма `<script>`, значи няма и какво да чака.
- **Двата езика казват едно и също** — същите раздели, в същия ред; българският е оригиналът, английският е негов превод.
- **Български текст:** „слана“, никога „мраз“; техническите термини остават на английски.
- **Числата в текста са истински** и идват от живия отговор за Маноле (клетка 42,2 / 24,9 на 99 м): типична 29 март / 25 ноември, сигурна 11 април / 30 октомври, 30 години, точката на ≈152 м. Никакви измислени примери.
- **Нищо не обещава повече от това, което данните дават:** рискът е историческа честота, не прогноза; „няма записана слана“ не значи „няма слана“; двете височини не коригират датите.
- **Версия 0.3.2** в `worker/index.js` (`APP_VERSION`, локален const — не се export-ва) и `package.json`, плюс литералите в `worker/index.test.js`; запис в `CHANGELOG.md` (двуезичен, формат като 0.3.1).
- Всяка промяна: първо тест, който пада (там, където тест е възможен), после кодът.

## Review Focus

- **Страница, отворена директно без началната** (`/guide` като първи адрес): трябва да е четима и да води обратно — тестът за връзките в Задача 1 го пази.
- **Превключвателят на езика от ръководството:** от `/guide` трябва да води към `/en/guide`, не към началната страница — пази се в Задача 1.
- **Нова страница, която не е качена:** статичните файлове минават през `site/.assetsignore`; ако някой утре сложи там шаблон, който ги хване, страниците изчезват мълчаливо — Задача 1 добавя проверка в `worker/assets.test.js`.
- **Разминаване между двата езика:** раздел, добавен само на единия език — Задача 1 сравнява заглавията на разделите.
- **Мъртва връзка в новите текстове** (към `docs/`, към лиценза, към CDS): Задача 3 проверява, че всеки вътрешен път съществува в работното дърво.

---

### Task 1: Двете страници с ръководството и връзката във футъра

**Files:**
- Create: `site/guide/index.html`, `site/en/guide/index.html`
- Create: `site/js/guide.test.js`
- Modify: `site/index.html:70-72`, `site/en/index.html:70-72` (футърът), `site/css/app.css` (само ако трябва)
- Modify: `worker/assets.test.js`

**Interfaces:**
- Consumes: `/css/app.css` (съществуващ), класовете `top`, `brand`, `lang`, `wrap`, `lead`, `foot`, `hint`.
- Produces: адресите `/guide/` и `/en/guide/`; заглавия на разделите, които тестът сравнява между езиците.

- [ ] **Step 1: Тестът (RED)**

Създай `site/js/guide.test.js`:

```js
// Ръководството е два статични HTML файла — без JavaScript и без Markdown в
// браузъра. Тестът пази това, което един човек би счупил, без да забележи:
// изчезнала връзка назад, език, който води на грешно място, и раздел,
// добавен само на единия език.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const bg = read("../guide/index.html");
const en = read("../en/guide/index.html");

const headings = (html) => [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1].trim());

test("двете страници нямат JavaScript", () => {
  for (const [name, html] of [["bg", bg], ["en", en]]) {
    assert.ok(!/<script/i.test(html), `${name}: няма <script>`);
    assert.ok(!/ on[a-z]+=/i.test(html), `${name}: няма inline handler`);
  }
});

test("носят облика на сайта: app.css, header, wrap, footer", () => {
  for (const [name, html] of [["bg", bg], ["en", en]]) {
    assert.match(html, /<link rel="stylesheet" href="\/css\/app\.css">/, `${name}: app.css`);
    assert.match(html, /<header class="top">/, `${name}: header`);
    assert.match(html, /<main class="wrap">/, `${name}: wrap`);
    assert.match(html, /<footer class="foot">/, `${name}: footer`);
    assert.ok(!/leaflet/i.test(html), `${name}: няма Leaflet — тук няма карта`);
  }
});

test("всяка страница води обратно към началната на своя език", () => {
  assert.match(bg, /<a class="brand" href="\/">frost\.bg<\/a>/);
  assert.match(en, /<a class="brand" href="\/en\/">frost\.bg<\/a>/);
});

test("превключвателят на езика води към другото ръководство, не към началната", () => {
  assert.match(bg, /<a class="lang" href="\/en\/guide\/">English<\/a>/);
  assert.match(en, /<a class="lang" href="\/guide\/">Български<\/a>/);
});

test("двата езика имат едни и същи раздели, в същия ред", () => {
  assert.equal(headings(bg).length, headings(en).length);
  assert.ok(headings(bg).length >= 6, `очаквах поне 6 раздела, намерих ${headings(bg).length}`);
});

test("езикът на документа е обявен вярно", () => {
  assert.match(bg, /<html lang="bg">/);
  assert.match(en, /<html lang="en">/);
});

test("числата в примера са истинските за Маноле", () => {
  for (const [name, html] of [["bg", bg], ["en", en]]) {
    for (const needle of ["42.2", "24.9", "99", "152", "30"]) {
      assert.ok(html.includes(needle), `${name}: липсва ${needle}`);
    }
  }
});

test("началните страници водят към ръководството", () => {
  const home = read("../index.html"), homeEn = read("../en/index.html");
  assert.match(home, /href="\/guide\/"/);
  assert.match(homeEn, /href="\/en\/guide\/"/);
});
```

- [ ] **Step 2: Пусни — пада**

Run: `node --test site/js/guide.test.js`
Expected: `ENOENT` за `site/guide/index.html`.

- [ ] **Step 3: Българската страница**

Създай `site/guide/index.html`. Скелетът е фиксиран (копирай точно):

```html
<!doctype html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>frost.bg — как се чете</title>
<meta name="description" content="Какво значат датите, графиката, периодите, рискът и двете височини на frost.bg.">
<link rel="stylesheet" href="/css/app.css">
</head>
<body data-lang="bg">
<header class="top">
  <a class="brand" href="/">frost.bg</a>
  <a class="lang" href="/en/guide/">English</a>
</header>
<main class="wrap">
  <h1>Как се чете</h1>
  <p class="lead">Страницата дава две двойки дати за твоята точка и историята зад тях. Ето какво значи всяко число.</p>
  <!-- разделите по-долу -->
</main>
<footer class="foot">
  <a href="/">Обратно към сланите</a> · <a href="https://github.com/smilianov/frost.bg">Кодът в GitHub</a> · <a href="/api/v1/config">API</a>
</footer>
</body>
</html>
```

Разделите (всеки `<h2>` + текст; пиши ги свободно, но покрий точно това съдържание, с тези числа):

1. **„Двете двойки дати“** — типичната е медианата: в половината години сланата вече е минала на тази дата. Сигурната е 90-и персентил напролет и 10-и наесен: в 9 от 10 години няма слана след пролетната и преди есенната. За Маноле: типична 29 март / 25 ноември, сигурна 11 април / 30 октомври, от 30 години. Съвет: първата година взимай сигурната — една седмица по-късна сеитба струва по-малко от измръзнал разсад.
2. **„Графиката“** — всяка точка е една година: кръгче за последната пролетна слана, ромб за първата есенна. Оста вляво са месеците. Стрелките (или пръст) избират година и показват датите ѝ. Точките извън избрания период са кухи, не скрити — обхватът не се мени, за да не изглежда, че годините изчезват.
3. **„Периодите 10, 20 и 30 години“** — датите се пресмятат наново за избрания период от същите данни, без нова заявка. По-къси периоди няма: под 10 години със слана „сигурна в 9 от 10 години“ е безсмислица. Под датите пише с колко дни се е преместила типичната слана през последните 10 години спрямо всичките 30.
4. **„Рискът след дата“** — „в 4 от 30 години е имало слана след 20 април и преди 1 юли — 13 %“. Това е историческа честота, не прогноза за тази година; слана **на** самата дата не се брои. Отговаря само за пролетта: първата есенна слана преди дадена дата не казва нищо за следващите дни. Същото изречение обяснява и сигурната дата.
5. **„Сезонът без слана“** — типична, най-къса и най-дълга дължина, смятани за всяка година поотделно и чак тогава осреднени. (Ваденето на двете типични дати дава друго число: за Маноле 240 вместо 237 дни.)
6. **„Двете височини“** — клетката е ~9 км и има своя средна височина (за Маноле 99 м); точката ти може да е на друга (≈152 м). Двете идват от различни модели и **не** коригират датите — служат ти да прецениш сам. ERA5 надценява нощния минимум в котловини, тоест подценява сланата: ако си по-ниско от клетката, чакай по-късна пролетна и по-ранна есенна слана от показаните.
7. **„Откъде са числата“** — ERA5-Land през Copernicus CDS, 30 пълни години, слана = ден с минимум на 2 м ≤ 0 °C, мрежа 0,1° (≈9 км), сметната предварително за 2 080 точки над България. Година с под 300 валидни дни не се брои; клетка с под 10 години със слана няма дати. Празна година в таблицата значи „няма достатъчно данни“, а празна дата — „не е записана слана“, което не е същото.
8. **„Защо не съвпада с моите наблюдения“** — мрежата е модел, не термометър в твоята градина: 9 км, средна височина, без микрорелеф, без студена яма зад плета. Ползвай датите като рамка, не като присъда, и си води бележки — след три години твоите записки бият всеки модел.

- [ ] **Step 4: Английската страница**

Създай `site/en/guide/index.html` — същият скелет с `lang="en"`, `href="/en/"` на марката, `href="/guide/"` и текст `Български` на превключвателя, заглавие `frost.bg — how to read this`, футър `<a href="/en/">Back to the frost dates</a> · <a href="https://github.com/smilianov/frost.bg">Source on GitHub</a> · <a href="/api/v1/config">API</a>`, и същите осем раздела, преведени.

- [ ] **Step 5: Връзката във футъра на трите съществуващи страници**

В `site/index.html`, във футъра, преди `<a href="/api/v1/config">API</a>`, добави `<a href="/guide/">Как се чете</a> · `. В `site/en/index.html` — `<a href="/en/guide/">How to read this</a> · `. (Началните страници строят футъра частично от JavaScript; тази връзка е статична и не минава през `texts.js`.)

- [ ] **Step 6: Проверката, че страниците се качват**

В `worker/assets.test.js`, в теста „не спира самата страница и скриптовете ѝ“, добави `"guide/index.html"` и `"en/guide/index.html"` към списъка с пътища, които не бива да са спрени.

- [ ] **Step 7: Зелено**

Run: `node --test site/js/guide.test.js && npm run test:worker && npm test`
Expected: 0 fail.

- [ ] **Step 8: Commit**

```bash
git add site worker/assets.test.js
git commit -m "Ръководство на сайта: /guide и /en/guide, връзка във футъра"
```

---

### Task 2: `architecture.md` и `CONTRIBUTING.md`

**Files:**
- Create: `docs/bg/architecture.md`, `docs/en/architecture.md`, `CONTRIBUTING.md`
- Modify: `docs/bg/README.md`, `docs/en/README.md` (индексът), `README.md`, `README.en.md` (връзка към CONTRIBUTING)

**Interfaces:**
- Consumes: нищо от Задача 1.
- Produces: пътищата, които Задача 3 проверява за мъртви връзки.

- [ ] **Step 1: `architecture.md` (двата езика)**

Половин до една страница, с истинските числа. Покрий: **мрежата** (`grid/grid.json`, 2 080 клетки на 0,1°, ~1 MB, сметната офлайн от ERA5-Land през CDS, един файл на година, шест дни на опашката; `grid/compute_grid.py` и `grid/fetch_cds.py` не влизат в продукционния bundle); **Worker-а** (един файл-рутер `worker/index.js`, `frost.js` за сметката, `geocode.js` и `elevation.js` за двата външни доставчика, `texts.js` за текстовете; без зависимости; мрежата се импортира като JSON модул и живее в паметта на изолата); **кеша** (Cache API на ръба с ключ `rev = APP_VERSION | дата на мрежата | карта | геокодер`, отделен rev за `/config` с превключвателя на височината и за `/elevation`; грешките не се кешират); **страницата** (чисти модули `stats.js`, `chart.js`, `history.js`, `paint.js`, `format.js` без DOM или с ясно отделен DOM слой; `app.js` само рисува); **средите** (`wrangler dev` локално, `wrangler deploy` в продукция, `ELEVATION` и `GEOCODER`/`MAP` като променливи, `GOOGLE_KEY` като тайна); **тестовете** (Worker, страница, Python; тестът за паралелност срещу всичките 2 080 клетки). Завърши с една диаграма в текст (ASCII или списък със стрелки), която показва пътя на една заявка от браузъра до отговора.

- [ ] **Step 2: `CONTRIBUTING.md`**

На български и английски в един файл (първо българският, после хоризонтална черта и английският), защото е кратък. Покрий: как се пуска локално (`npm install`, `npm run dev`, адресът); как се пускат тестовете (`npm test` и какво включва); **правилото за промените** — всяка поправка идва с тест, който пада преди нея (не общ RED пробег, а тест за конкретната поправка); че прегледите на този проект минават през външен reviewer и какво значи това за размера на един PR; езиковите правила („слана“, никога „мраз“; техническите термини на английски; всеки текст и на двата езика); че `grid/grid.json` е генериран файл и не се редактира на ръка; че нови зависимости в Worker-а не се приемат (проектът е нарочно без такива) и защо. Накрая: къде да се пита (GitHub issues) и че лицензът на приноса е MIT като на проекта.

- [ ] **Step 3: Индексите**

В `docs/bg/README.md` и `docs/en/README.md` добави ред за `architecture.md` в списъка с документи. В `README.md` и `README.en.md` добави ред към `CONTRIBUTING.md` и към ръководството на сайта (`https://frost.bg/guide/` и `/en/guide/`).

- [ ] **Step 4: Зелено и commit**

Run: `npm test`

```bash
git add docs CONTRIBUTING.md README.md README.en.md
git commit -m "architecture.md и CONTRIBUTING.md: как е устроен проектът и как се предлага промяна"
```

---

### Task 3: Проверка на връзките, версия 0.3.2, CHANGELOG

**Files:**
- Create: `scripts/check_links.mjs`
- Modify: `package.json` (версия и нов script), `worker/index.js` (`APP_VERSION`), `worker/index.test.js`, `CHANGELOG.md`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: файловете от Задачи 1 и 2.
- Produces: `npm run check:links`, пуснат и в CI.

- [ ] **Step 1: Тестът чрез самия скрипт (RED)**

Създай `scripts/check_links.mjs`, който минава през `README.md`, `README.en.md`, `CONTRIBUTING.md`, `docs/**/*.md`, `site/**/*.html` и проверява, че всеки **вътрешен** път съществува: относителните пътища в Markdown спрямо файла, а адресите, започващи с `/`, спрямо `site/` (`/guide/` → `site/guide/index.html`). Външните `http(s)` връзки не се пипат (без мрежа в CI). Печата всяка мъртва връзка като `файл:ред → цел` и излиза с код 1, ако има поне една.

- [ ] **Step 2: Пусни го върху текущото дърво**

Run: `node scripts/check_links.mjs`
Expected: първо пада поне върху нещо (докато Задачи 1–2 не са слети, или върху съществуваща мъртва връзка); поправи намереното, докато излезе 0.

- [ ] **Step 3: В `package.json` и в CI**

Добави `"check:links": "node scripts/check_links.mjs"` в `scripts`, и стъпка в `.github/workflows/ci.yml` в job-а „Тестове“ след `npm test`:

```yaml
      - name: Връзките в документацията
        run: npm run check:links
```

- [ ] **Step 4: Версия 0.3.2**

`APP_VERSION` в `worker/index.js` и `version` в `package.json` стават `0.3.2`; смени и литералите в `worker/index.test.js`. Run: `npm run test:worker`.

- [ ] **Step 5: CHANGELOG**

Запис `## [0.3.2] — 2026-09-25`, двуезичен, в същия формат като 0.3.1: ръководството на сайта (`/guide`, `/en/guide`) и връзката от футъра; `architecture.md` и `CONTRIBUTING.md`; проверката на връзките в CI.

- [ ] **Step 6: Зелено и commit**

Run: `npm test && npm run check:links`

```bash
git add -A
git commit -m "Версия 0.3.2: проверка на връзките в CI, CHANGELOG"
```

---

## Self-review

**Покритие:** ръководството на сайта → Задача 1 (осемте раздела, двата езика, футърът, качването като assets); документацията за разработчика → Задача 2; версия, CHANGELOG и защитата срещу мъртви връзки → Задача 3. Няма изискване от одобрения дизайн без задача.

**Плейсхолдери:** няма — тестът е даден дословно, скелетът на страницата също, а съдържанието на разделите е изброено с конкретните числа, вместо да се остави „опиши графиката“.

**Имена:** `site/guide/index.html`, `site/en/guide/index.html`, `site/js/guide.test.js`, `scripts/check_links.mjs`, `npm run check:links` — еднакви в трите задачи.

**Review Focus:** всяка от петте линии има тест — директно отваряне и връзката назад, превключвателят на езика, `.assetsignore`, разминаването между езиците (заглавията на разделите) и мъртвите връзки (Задача 3).
