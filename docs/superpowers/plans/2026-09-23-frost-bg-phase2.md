# frost.bg, фаза 2 — план за изпълнение

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Страницата на frost.bg да показва историята на клетката по години — графика, прозорец 10/20/30, сравнение „последните 10 срещу 30“, дължина на сезона без слана, риск от пролетна слана след дата, сваляне като CSV — и височината на самата точка до тази на клетката.

**Architecture:** Всичко за историята се смята **в браузъра** от `years`, които `/api/v1/frost` вече връща: нов чист модул `site/js/stats.js` (без DOM) и `site/js/chart.js` (чист модел на графиката + CSV + тънък слой, който рисува). API v1 не се променя. Височината е единствената нова заявка: `GET /api/v1/elevation` в Worker-а (`worker/elevation.js`), с кеш, краен срок, кратък отказ след 429 и превключвател `ELEVATION`.

**Tech Stack:** Vanilla ES модули без build стъпка, `node --test` за тестовете на `site/js/*.test.js` и `worker/*.test.js`, Cloudflare Workers (workerd) за Worker-а, inline SVG без библиотека.

**Spec:** `docs/superpowers/specs/2026-09-23-frost-bg-phase2-design.md` (фаза 1: `docs/superpowers/specs/2026-09-14-frost-bg-design.md`)

## Global Constraints

- **Договорът на сметките (Ф1), дума по дума:** `MM-DD` → пореден ден в невисокосната 2001 г.; `02-29` → 1 март; „пролет“ = месец < 7, „есен“ = месец ≥ 7. За всеки сезон поотделно: махат се `null`-овете, сортира се възходящо; при **под 10** дати типичната и сигурната са `null`. При `n` дати, нулево-базирани индекси: типична пролет `s[floor(n/2)]`; типична есен `s[floor((n−1)/2)]`; сигурна `s[max(1, ceil(q·n)) − 1]`, `q = 0.9` напролет, `q = 0.1` наесен. Без интерполиране и без осредняване.
- **Прозорецът е календарен:** `N` избира годините `period.end − N + 1 … period.end`; липсваща година си остава липсваща. Бутони **10 / 20 / 30**, по подразбиране 30.
- **Три състояния не се смесват:** липсваща година (не влиза в знаменателите), `null` сезонна дата („не е записана слана в наличните данни“, влиза като „без събитие“ при риска), `null` типична/сигурна („твърде малко години за надеждна дата“).
- **Дължина на сезона:** по години, `A − S − 1` върху 365-дневния календар (`S = 0` без пролетна, `A = 366` без есенна), после медиана; **никога** от типичните дати.
- **Риск:** само пролетен, вход 1 януари – 30 юни, строго по-късно от въведената дата, знаменател = всички редове в прозореца.
- **API v1 не се променя** — никакъв параметър за прозорец, никакви нови варианти в кеша на `/frost`.
- **Никаква анимация**; печат и forced-colors: само „нищо да не изчезва“.
- Български текст: **„слана“, никога „мраз“**; техническите термини остават на английски.
- Всяка функция/поправка: първо тест, който пада (RED), после код (GREEN).
- Тестовете се пускат с `npm test` (worker + site + python); новите файлове се хващат от съществуващите глобове `"site/js/*.test.js"` и `"worker/*.test.js"`.
- Прегледът на всяка задача е през Codex `gpt-6-astra` xhigh (`.superpowers/sdd/codex-review-retry.sh`), включително `< /dev/null`, иначе виси на stdin.

---

# Доставка А — историята (без външни доставчици)

### Task 1: `stats.js` — календарът, прозорецът, типичната и сигурната двойка

**Files:**
- Create: `site/js/stats.js`
- Create: `site/js/stats.test.js`
- Create: `site/js/stats.parity.test.js`

**Interfaces:**
- Consumes: `grid/grid.json` (само в теста за паралелност; форматът е `{period: {start, end}, cells: [{lat, lon, elev, typical: [MM-DD|null, MM-DD|null], safe: […], years_used, years_with_spring, years_with_autumn, years: [[година, MM-DD|null, MM-DD|null], …]}]}`).
- Produces (ползват се от Задачи 2–4):
  - `dayOfYear(mmdd: string) → number | null` — 1…365 в календара на 2001 г., `02-29` → денят на `03-01`; негодно → `null`
  - `toMMDD(day: number) → string | null` — обратното
  - `selectWindow(years: Array, periodEnd: number, n: number) → { rows, from, to, withData }`
  - `pair(rows) → { typical: {last_spring, first_autumn}, safe: {last_spring, first_autumn}, springCount, autumnCount }` (датите са `MM-DD` или `null`)

- [ ] **Step 1: Тестовете (RED)**

Създай `site/js/stats.test.js`:

```js
// Сметките зад историята по години. Договорът е преписан дума по дума от
// grid/frost_estimate.py — ако тези тестове минат, а мрежата казва друго,
// значи договорът е нарушен (виж stats.parity.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayOfYear, toMMDD, selectWindow, pair } from "./stats.js";

test("dayOfYear: календарът е невисокосен, 29 февруари е 1 март", () => {
  assert.equal(dayOfYear("01-01"), 1);
  assert.equal(dayOfYear("03-01"), 60);
  assert.equal(dayOfYear("02-29"), 60);   // сгънато, както в мрежата
  assert.equal(dayOfYear("12-31"), 365);
  for (const bad of ["13-01", "00-10", "04-31", "4-1", "", null, undefined, "2026-04-01", "0a-01"]) {
    assert.equal(dayOfYear(bad), null, String(bad));
  }
});

test("toMMDD е обратното на dayOfYear", () => {
  assert.equal(toMMDD(1), "01-01");
  assert.equal(toMMDD(60), "03-01");
  assert.equal(toMMDD(365), "12-31");
  for (const bad of [0, 366, -1, 1.5, NaN, null]) assert.equal(toMMDD(bad), null, String(bad));
  for (let d = 1; d <= 365; d++) assert.equal(dayOfYear(toMMDD(d)), d);
});

const rows = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => [from + i, "04-01", "10-01"]);

test("selectWindow избира календарни години, не последните N реда", () => {
  const years = [...rows(1996, 2019), ...rows(2022, 2025)];       // 2020 и 2021 липсват
  const w = selectWindow(years, 2025, 10);
  assert.deepEqual([w.from, w.to], [2016, 2025]);
  assert.equal(w.withData, 8, "2016–2019 и 2022–2025");
  assert.deepEqual(w.rows.map((r) => r[0]), [2016, 2017, 2018, 2019, 2022, 2023, 2024, 2025]);
});

test("selectWindow: празни данни и негодни редове", () => {
  assert.deepEqual(selectWindow([], 2025, 30), { rows: [], from: 1996, to: 2025, withData: 0 });
  const w = selectWindow([[2025, "04-01", "10-01"], "боклук", [null, "04-01", null], [2024]], 2025, 30);
  assert.deepEqual(w.rows.map((r) => r[0]), [2025], "негодните редове се пропускат");
});

test("pair: типичната при четен брой е по-късната напролет и по-ранната наесен", () => {
  // 10 години: пролет 03-25…04-03, есен 10-20…10-29
  const springs = ["03-25", "03-26", "03-27", "03-28", "03-29", "03-30", "03-31", "04-01", "04-02", "04-03"];
  const autumns = ["10-20", "10-21", "10-22", "10-23", "10-24", "10-25", "10-26", "10-27", "10-28", "10-29"];
  const p = pair(springs.map((s, i) => [1996 + i, s, autumns[i]]));
  assert.equal(p.typical.last_spring, "03-30", "s[floor(10/2)] = s[5]");
  assert.equal(p.typical.first_autumn, "10-24", "s[floor(9/2)] = s[4]");
  assert.equal(p.safe.last_spring, "04-02", "ceil(0.9*10)=9 -> s[8]");
  assert.equal(p.safe.first_autumn, "10-20", "max(1, ceil(0.1*10))=1 -> s[0]");
  assert.deepEqual([p.springCount, p.autumnCount], [10, 10]);
});

test("pair: под 10 дати за сезона -> null, без приблизителни стойности", () => {
  const nine = Array.from({ length: 9 }, (_, i) => [1996 + i, "04-01", "10-01"]);
  const p = pair(nine);
  assert.deepEqual(p.typical, { last_spring: null, first_autumn: null });
  assert.deepEqual(p.safe, { last_spring: null, first_autumn: null });
  assert.deepEqual([p.springCount, p.autumnCount], [9, 9]);
});

test("pair: сезоните се броят поотделно — може пролетта да има дата, а есента не", () => {
  const rs = Array.from({ length: 12 }, (_, i) => [1996 + i, "04-01", i < 9 ? "10-01" : null]);
  const p = pair(rs);
  assert.equal(p.typical.last_spring, "04-01");
  assert.equal(p.typical.first_autumn, null);
  assert.deepEqual([p.springCount, p.autumnCount], [12, 9]);
});

test("pair: негодна дата в реда не се брои за сезона", () => {
  const rs = Array.from({ length: 11 }, (_, i) => [1996 + i, i === 0 ? "31-31" : "04-01", "10-01"]);
  assert.equal(pair(rs).springCount, 10);
});
```

- [ ] **Step 2: Пусни ги — трябва да паднат**

Run: `node --test site/js/stats.test.js`
Expected: `ERR_MODULE_NOT_FOUND` за `./stats.js`.

- [ ] **Step 3: Модулът**

Създай `site/js/stats.js`:

```js
// stats.js — сметките зад историята по години. Чисти функции, без DOM.
//
// Договорът е преписан дума по дума от grid/frost_estimate.py: страницата
// смята същите числа, които мрежата е сметнала офлайн, и не бива да се
// разминава с тях (site/js/stats.parity.test.js доказва това за всичките
// 2 080 клетки).

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const CUM = MONTH_DAYS.reduce((acc, d) => (acc.push(acc[acc.length - 1] + d), acc), [0]);

// "MM-DD" -> пореден ден 1..365 в невисокосната 2001 г.; 29 февруари се
// сгъва към 1 март (мрежата вече е сгъната така — истинският 29 февруари е
// загубен и не може да се възстанови тук).
export function dayOfYear(mmdd) {
  if (typeof mmdd !== "string" || !/^[0-9]{2}-[0-9]{2}$/.test(mmdd)) return null;
  const m = Number(mmdd.slice(0, 2)), d = Number(mmdd.slice(3));
  if (m < 1 || m > 12 || d < 1) return null;
  if (m === 2 && d === 29) return CUM[2] + 1;            // 1 март
  if (d > MONTH_DAYS[m - 1]) return null;
  return CUM[m - 1] + d;
}

export function toMMDD(day) {
  if (!Number.isInteger(day) || day < 1 || day > 365) return null;
  let m = 0;
  while (m < 12 && day > CUM[m + 1]) m++;
  const d = day - CUM[m];
  return `${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const validRow = (r) => Array.isArray(r) && r.length === 3 && Number.isInteger(r[0]);

// Прозорецът е календарен: N избира годините periodEnd-N+1 … periodEnd.
// Липсваща година си остава липсваща — по-стари редове не влизат на нейно
// място. `withData` е колко от тези години наистина имат ред.
export function selectWindow(years, periodEnd, n) {
  const to = Number.isInteger(periodEnd) ? periodEnd : 0;
  const from = to - n + 1;
  const rows = (Array.isArray(years) ? years : [])
    .filter((r) => validRow(r) && r[0] >= from && r[0] <= to)
    .sort((a, b) => a[0] - b[0]);
  return { rows, from, to, withData: rows.length };
}

const MIN_YEARS = 10;

// Медиана (nearest-rank, консервативно при четен брой: по-късната напролет,
// по-ранната наесен) и персентил по ранг ceil(q·n).
function median(sorted, later) {
  const n = sorted.length;
  return sorted[later ? Math.floor(n / 2) : Math.floor((n - 1) / 2)];
}
function percentile(sorted, q) {
  return sorted[Math.max(1, Math.ceil(q * sorted.length)) - 1];
}

// Датите за един сезон, сортирани възходящо; негодните и null се махат.
const season = (rows, i) => rows.map((r) => dayOfYear(r[i])).filter((d) => d !== null).sort((a, b) => a - b);

export function pair(rows) {
  const springs = season(rows, 1), autumns = season(rows, 2);
  const okS = springs.length >= MIN_YEARS, okA = autumns.length >= MIN_YEARS;
  return {
    typical: {
      last_spring: okS ? toMMDD(median(springs, true)) : null,
      first_autumn: okA ? toMMDD(median(autumns, false)) : null,
    },
    safe: {
      last_spring: okS ? toMMDD(percentile(springs, 0.9)) : null,
      first_autumn: okA ? toMMDD(percentile(autumns, 0.1)) : null,
    },
    springCount: springs.length,
    autumnCount: autumns.length,
  };
}
```

- [ ] **Step 4: Пусни тестовете — зелени**

Run: `node --test site/js/stats.test.js`
Expected: всички ✔, 0 fail.

- [ ] **Step 5: Тестът за паралелност с мрежата (RED → GREEN сам по себе си)**

Създай `site/js/stats.parity.test.js`:

```js
// Приемателен тест: сметката в браузъра при пълния прозорец дава същото,
// което мрежата е записала — за всичките 2 080 клетки, включително
// null-овете. Това е единственото, което пази страницата и grid.json да не
// се разминат.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pair, selectWindow } from "./stats.js";

const grid = JSON.parse(readFileSync(new URL("../../grid/grid.json", import.meta.url), "utf8"));

test("всички клетки: пълният прозорец съвпада с typical/safe от мрежата", () => {
  let checked = 0, withDates = 0;
  const n = grid.period.end - grid.period.start + 1;
  for (const c of grid.cells) {
    const w = selectWindow(c.years, grid.period.end, n);
    assert.equal(w.withData, c.years.length, `${c.lat},${c.lon}: всички години в прозореца`);
    const p = pair(w.rows);
    assert.deepEqual(
      [p.typical.last_spring, p.typical.first_autumn, p.safe.last_spring, p.safe.first_autumn],
      [c.typical[0], c.typical[1], c.safe[0], c.safe[1]],
      `клетка ${c.lat},${c.lon}`,
    );
    assert.deepEqual([p.springCount, p.autumnCount], [c.years_with_spring, c.years_with_autumn], `клетка ${c.lat},${c.lon}`);
    checked++;
    if (c.typical[0] !== null) withDates++;
  }
  assert.equal(checked, grid.cells.length);
  assert.ok(withDates > 1800, `очаквах над 1800 клетки с дати, намерих ${withDates}`);
});
```

- [ ] **Step 6: Пусни го**

Run: `node --test site/js/stats.parity.test.js`
Expected: минава. **Ако падне — договорът в `stats.js` е грешен, не тестът.** Поправя се `stats.js`, докато съвпадне с мрежата.

- [ ] **Step 7: Целият пакет**

Run: `npm run test:site`
Expected: старите 18 + новите, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add site/js/stats.js site/js/stats.test.js site/js/stats.parity.test.js
git commit -m "stats.js: календарът, прозорецът и двойките дати; паралелност с мрежата за всички клетки"
```

---

### Task 2: `stats.js` — сезонът, рискът, сравнението 10 срещу 30

**Files:**
- Modify: `site/js/stats.js` (добавя се в края)
- Modify: `site/js/stats.test.js` (добавя се в края)

**Interfaces:**
- Consumes: от Задача 1 — `dayOfYear`, `toMMDD`, `selectWindow`, `pair`.
- Produces (ползват се от Задачи 3–4):
  - `seasonSummary(rows) → { typical, shortest: {days, years}, longest: {days, years}, count, clipped } | null`
  - `riskAfter(rows, mmdd) → { count, total, percent } | null`
  - `compareWindows(years, periodEnd) → { full: pair, recent: pair, spring: {days, direction} | null, autumn: {…} | null }`

- [ ] **Step 1: Тестовете (RED)**

Добави в края на `site/js/stats.test.js`:

```js
import { seasonSummary, riskAfter, compareWindows } from "./stats.js";

test("seasonSummary: дължината се смята по години, не от типичните дати", () => {
  // 03-31 (ден 90) и 10-01 (ден 274) -> 274-90-1 = 183
  const rs = [[2020, "03-31", "10-01"], [2021, "03-31", "10-02"], [2022, "04-01", "10-01"]];
  const s = seasonSummary(rs);
  assert.equal(s.count, 3);
  assert.equal(s.typical, 183, "медианата на 183, 184, 182");
  assert.deepEqual([s.shortest.days, s.shortest.years], [182, [2022]]);
  assert.deepEqual([s.longest.days, s.longest.years], [184, [2021]]);
});

test("seasonSummary: липсваща сезонна дата отрязва на границата на годината", () => {
  const s = seasonSummary([[2020, null, "10-01"], [2021, "03-31", null], [2022, null, null]]);
  assert.deepEqual(s.byYear.map((y) => y.days), [273, 275, 365], "S=0 / A=366");
  assert.equal(s.clipped, 3, "и трите са отрязани");
});

test("seasonSummary: медиана при четен брой позволява половинка; съседни дати дават 0", () => {
  assert.equal(seasonSummary([[2020, "04-01", "10-01"], [2021, "04-01", "10-02"]]).typical, 182.5);
  assert.equal(seasonSummary([[2020, "04-01", "04-02"]]).typical, 0, "съседни дати = 0 дни");
  assert.equal(seasonSummary([]), null);
  assert.equal(seasonSummary([[2020, "31-31", null]]).count, 1, "негодна дата се брои като липсваща");
});

test("riskAfter: строго по-късно от датата, знаменател = всички редове", () => {
  const rs = [
    [2020, "04-25", "10-01"],   // след 20 април
    [2021, "04-20", "10-01"],   // точно на датата — не се брои
    [2022, "04-10", "10-01"],
    [2023, null, "10-01"],      // без записана слана — влиза в знаменателя
  ];
  assert.deepEqual(riskAfter(rs, "04-20"), { count: 1, total: 4, percent: 25 });
  assert.deepEqual(riskAfter(rs, "01-01"), { count: 3, total: 4, percent: 75 });
  assert.deepEqual(riskAfter([], "04-20"), null);
});

test("riskAfter: само пролет — датите от юли нататък и негодните се отказват", () => {
  const rs = [[2020, "04-25", "10-01"]];
  for (const bad of ["07-01", "12-31", "13-01", "04-31", "", null, "4-1"]) {
    assert.equal(riskAfter(rs, bad), null, String(bad));
  }
  assert.ok(riskAfter(rs, "06-30"), "30 юни още е пролет");
  assert.deepEqual(riskAfter(rs, "02-29"), riskAfter(rs, "03-01"), "29 февруари = 1 март");
});

test("compareWindows: разликата в дни между последните 10 и всичките 30", () => {
  const years = Array.from({ length: 30 }, (_, i) => {
    const y = 1996 + i;
    return [y, y >= 2016 ? "03-20" : "04-01", "10-01"];
  });
  const c = compareWindows(years, 2025);
  assert.equal(c.recent.typical.last_spring, "03-20");
  assert.equal(c.full.typical.last_spring, "04-01");
  assert.deepEqual(c.spring, { days: 12, direction: "earlier" });
  assert.deepEqual(c.autumn, { days: 0, direction: "same" });
});

test("compareWindows: без дата в единия прозорец -> null за този сезон", () => {
  const years = Array.from({ length: 30 }, (_, i) => [1996 + i, i < 20 ? "04-01" : null, "10-01"]);
  const c = compareWindows(years, 2025);
  assert.equal(c.recent.typical.last_spring, null, "последните 10 години нямат пролетни дати");
  assert.equal(c.spring, null);
  assert.ok(c.autumn);
});
```

- [ ] **Step 2: Пусни ги — падат**

Run: `node --test site/js/stats.test.js`
Expected: `SyntaxError … does not provide an export named 'seasonSummary'`.

- [ ] **Step 3: Кодът**

Добави в края на `site/js/stats.js`:

```js
// --- дължина на сезона без слана -----------------------------------------
//
// Медианата на разликите НЕ е разлика на медианите, затова сезонът се смята
// по години и чак тогава се взема медианата. Върху 365-дневния календар:
// A − S − 1, със S = 0 при липсваща пролетна и A = 366 при липсваща есенна
// дата (тогава интервалът е отрязан на границата на годината). Не се брои
// нито денят на пролетната, нито на есенната слана.
export function seasonSummary(rows) {
  const byYear = (Array.isArray(rows) ? rows : []).filter(validRow).map((r) => {
    const s = dayOfYear(r[1]), a = dayOfYear(r[2]);
    return { year: r[0], days: (a === null ? 366 : a) - (s === null ? 0 : s) - 1, clipped: s === null || a === null };
  });
  if (!byYear.length) return null;
  const lengths = byYear.map((y) => y.days).sort((x, y) => x - y);
  const n = lengths.length;
  const typical = n % 2 ? lengths[(n - 1) / 2] : (lengths[n / 2 - 1] + lengths[n / 2]) / 2;
  const at = (d) => byYear.filter((y) => y.days === d).map((y) => y.year);
  const min = lengths[0], max = lengths[n - 1];
  return {
    typical, count: n, byYear,
    shortest: { days: min, years: at(min) },
    longest: { days: max, years: at(max) },
    clipped: byYear.filter((y) => y.clipped).length,
  };
}

// --- риск от пролетна слана след дата ------------------------------------
//
// Само пролетен: данните отговарят единствено на „последната пролетна слана
// е била след D (и преди 1 юли)“. Знаменателят са всички редове в прозореца,
// включително годините без записана слана — те са „без събитие“.
const LAST_SPRING_DAY = dayOfYear("06-30");

export function riskAfter(rows, mmdd) {
  const d = dayOfYear(mmdd);
  if (d === null || d > LAST_SPRING_DAY) return null;
  const usable = (Array.isArray(rows) ? rows : []).filter(validRow);
  if (!usable.length) return null;
  const count = usable.filter((r) => {
    const s = dayOfYear(r[1]);
    return s !== null && s > d;
  }).length;
  return { count, total: usable.length, percent: Math.round((count / usable.length) * 100) };
}

// --- сравнение „последните 10 срещу всичките 30“ -------------------------
//
// Отговаря на „затопля ли се при мен“ — по-честно от тригодишен прозорец.
// Сезон без дата в единия прозорец не дава сравнение (null).
const FULL_YEARS = 30, RECENT_YEARS = 10, NOTICEABLE_DAYS = 3;

function diff(fullMMDD, recentMMDD) {
  const a = dayOfYear(fullMMDD), b = dayOfYear(recentMMDD);
  if (a === null || b === null) return null;
  const days = Math.abs(b - a);
  if (days < NOTICEABLE_DAYS) return { days, direction: "same" };
  return { days, direction: b < a ? "earlier" : "later" };
}

export function compareWindows(years, periodEnd) {
  const full = pair(selectWindow(years, periodEnd, FULL_YEARS).rows);
  const recent = pair(selectWindow(years, periodEnd, RECENT_YEARS).rows);
  return {
    full, recent,
    spring: diff(full.typical.last_spring, recent.typical.last_spring),
    autumn: diff(full.typical.first_autumn, recent.typical.first_autumn),
  };
}
```

- [ ] **Step 4: Зелено**

Run: `node --test site/js/stats.test.js && node --test site/js/stats.parity.test.js`
Expected: 0 fail и в двата.

- [ ] **Step 5: Commit**

```bash
git add site/js/stats.js site/js/stats.test.js
git commit -m "stats.js: дължина на сезона по години, пролетен риск след дата, сравнение 10 срещу 30"
```

---

### Task 3: `chart.js` — моделът на графиката, таблицата и CSV-то

**Files:**
- Create: `site/js/chart.js`
- Create: `site/js/chart.test.js`

**Interfaces:**
- Consumes: от Задача 1 — `dayOfYear`, `toMMDD`; от `site/js/format.js` — `formatMMDD(mmdd, lang)`.
- Produces (ползват се от Задача 4):
  - `chartModel(rows, { from, to }) → { points: [{year, day, season, mmdd}], months: [{day, label}], years: {from, to}, empty: boolean }`
  - `toCsv(years, meta) → string`
  - `renderChart(model, { lang, selected }) → SVGElement` (DOM)
  - `renderTable(rows, { lang, from, to }) → HTMLTableElement` (DOM)

- [ ] **Step 1: Тестовете на чистите части (RED)**

Създай `site/js/chart.test.js`:

```js
// Графиката се дели на две: чист модел (тук) и рисуване в DOM (проверява се
// в браузър, Р6). CSV-то също е чиста функция.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartModel, toCsv } from "./chart.js";

const rows = [[2023, "04-01", "10-01"], [2024, null, "10-05"], [2025, "03-20", null]];

test("chartModel: по една точка на всяка непразна дата, null няма точка", () => {
  const m = chartModel(rows, { from: 2023, to: 2025 });
  assert.equal(m.points.length, 4, "3+2 дати минус двата null-а");
  assert.deepEqual(m.points.filter((p) => p.season === "spring").map((p) => p.year), [2023, 2025]);
  assert.deepEqual(m.points.filter((p) => p.season === "autumn").map((p) => p.year), [2023, 2024]);
  const first = m.points[0];
  assert.deepEqual([first.year, first.mmdd, first.day], [2023, "04-01", 91]);
});

test("chartModel: обхватът на годините е на прозореца, не на данните", () => {
  const m = chartModel(rows, { from: 1996, to: 2025 });
  assert.deepEqual(m.years, { from: 1996, to: 2025 });
  assert.equal(m.empty, false);
});

test("chartModel: празни данни -> empty, без точки", () => {
  const m = chartModel([], { from: 1996, to: 2025 });
  assert.deepEqual(m.points, []);
  assert.equal(m.empty, true);
});

test("chartModel: етикетите на месеците са на истинските граници", () => {
  const m = chartModel(rows, { from: 2023, to: 2025 });
  assert.equal(m.months.length, 12);
  assert.deepEqual(m.months[0], { day: 1, label: 1 });
  assert.deepEqual(m.months[2], { day: 60, label: 3 }, "1 март е ден 60");
  assert.deepEqual(m.months[11], { day: 335, label: 12 });
});

test("toCsv: заглавен коментар, колони, празно за липсваща дата", () => {
  const csv = toCsv(rows, { lat: 42.2, lon: 24.9, period: { start: 1996, end: 2025 }, source: "ERA5-Land през Copernicus CDS" });
  const lines = csv.trimEnd().split("\n");
  assert.match(lines[0], /^# frost\.bg · 42\.2, 24\.9 · 1996–2025 · ERA5-Land през Copernicus CDS$/);
  assert.equal(lines[1], "year,last_spring,first_autumn");
  assert.deepEqual(lines.slice(2), ["2023,04-01,10-01", "2024,,10-05", "2025,03-20,"]);
  assert.ok(csv.endsWith("\n"), "файлът свършва с нов ред");
});

test("toCsv: източникът не може да вкара нов ред или запетая в коментара", () => {
  const csv = toCsv([], { lat: 1, lon: 2, period: { start: 1, end: 2 }, source: "а\nб,в" });
  assert.equal(csv.split("\n")[0], "# frost.bg · 1, 2 · 1–2 · а б,в");
});
```

- [ ] **Step 2: Пусни ги — падат**

Run: `node --test site/js/chart.test.js`
Expected: `ERR_MODULE_NOT_FOUND` за `./chart.js`.

- [ ] **Step 3: Чистите части**

Създай `site/js/chart.js` с модела и CSV-то (рисуването идва в Step 5):

```js
// chart.js — графиката, таблицата и CSV-то. Моделът е чист (тества се);
// рисуването е тънък слой над него (проверява се в браузър).
import { dayOfYear, toMMDD } from "./stats.js";
import { formatMMDD } from "./format.js";

const MONTH_STARTS = Array.from({ length: 12 }, (_, i) => dayOfYear(`${String(i + 1).padStart(2, "0")}-01`));

export function chartModel(rows, { from, to }) {
  const points = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(r) || !Number.isInteger(r[0])) continue;
    for (const [i, season] of [[1, "spring"], [2, "autumn"]]) {
      const day = dayOfYear(r[i]);
      if (day !== null) points.push({ year: r[0], day, season, mmdd: toMMDD(day) });
    }
  }
  return {
    points,
    months: MONTH_STARTS.map((day, i) => ({ day, label: i + 1 })),
    years: { from, to },
    empty: points.length === 0,
  };
}

// CSV за хора с Excel: коментар с клетката, периода и източника, после
// година,последна_пролетна,първа_есенна (празно за липсваща дата).
export function toCsv(rows, meta) {
  const clean = (s) => String(s ?? "").replace(/[\r\n]+/g, " ").trim();
  const head = `# frost.bg · ${meta.lat}, ${meta.lon} · ${meta.period?.start}–${meta.period?.end} · ${clean(meta.source)}`;
  const body = (Array.isArray(rows) ? rows : [])
    .filter((r) => Array.isArray(r) && Number.isInteger(r[0]))
    .map((r) => `${r[0]},${r[1] ?? ""},${r[2] ?? ""}`);
  return [head, "year,last_spring,first_autumn", ...body].join("\n") + "\n";
}
```

- [ ] **Step 4: Зелено**

Run: `node --test site/js/chart.test.js`
Expected: 0 fail.

- [ ] **Step 5: Рисуването (DOM)**

Добави в края на `site/js/chart.js`. Изисквания от спецификацията, които кодът трябва да спазва: без анимация; двете редици се различават и по форма (кръг за пролетта, ромб за есента), не само по цвят; без линия през липсваща година; всяка точка е достижима с клавиатура; `<title>` не е единственият носител на информацията (таблицата е видима и разгъваема).

```js
const SVG = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

const W = 720, H = 260, PAD_L = 44, PAD_R = 12, PAD_T = 12, PAD_B = 28;

export function renderChart(model, { lang, title }) {
  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img",
    "aria-label": title, preserveAspectRatio: "xMidYMid meet",
  });
  svg.append(svgEl("title")).lastChild.textContent = title;
  const years = Math.max(1, model.years.to - model.years.from);
  const x = (year) => PAD_L + ((year - model.years.from) / years) * (W - PAD_L - PAD_R);
  const y = (day) => PAD_T + ((day - 1) / 364) * (H - PAD_T - PAD_B);

  for (const m of model.months) {
    const yy = y(m.day);
    svg.append(svgEl("line", { x1: PAD_L, x2: W - PAD_R, y1: yy, y2: yy, class: "grid" }));
    const label = svgEl("text", { x: 4, y: yy + 4, class: "tick" });
    label.textContent = String(m.label);
    svg.append(label);
  }
  for (const year of [model.years.from, model.years.to]) {
    const t = svgEl("text", { x: x(year), y: H - 8, class: "tick", "text-anchor": year === model.years.from ? "start" : "end" });
    t.textContent = String(year);
    svg.append(t);
  }
  for (const p of model.points) {
    const cx = x(p.year), cy = y(p.day);
    const node = p.season === "spring"
      ? svgEl("circle", { cx, cy, r: 4, class: "pt spring" })
      : svgEl("rect", { x: cx - 3.5, y: cy - 3.5, width: 7, height: 7, class: "pt autumn", transform: `rotate(45 ${cx} ${cy})` });
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", `${p.year}: ${formatMMDD(p.mmdd, lang)}`);
    node.append(svgEl("title")).lastChild.textContent = `${p.year}: ${formatMMDD(p.mmdd, lang)}`;
    svg.append(node);
  }
  return svg;
}

// Видимата таблица — не „алтернатива за четци“, а самите данни: и с пръст,
// и с клавиатура, и при печат.
export function renderTable(rows, { lang, t }) {
  const table = document.createElement("table");
  table.className = "years";
  const caption = document.createElement("caption");
  caption.textContent = t.table_caption;
  table.append(caption);
  const head = document.createElement("tr");
  for (const label of [t.year, t.last_spring, t.first_autumn]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    head.append(th);
  }
  const thead = document.createElement("thead");
  thead.append(head);
  const tbody = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = String(r[0]);
    tr.append(th);
    for (const i of [1, 2]) {
      const td = document.createElement("td");
      td.textContent = r[i] ? formatMMDD(r[i], lang) : t.no_frost_recorded;
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  return table;
}
```

- [ ] **Step 6: Целият пакет**

Run: `npm run test:site`
Expected: 0 fail.

- [ ] **Step 7: Commit**

```bash
git add site/js/chart.js site/js/chart.test.js
git commit -m "chart.js: чист модел на графиката, CSV, SVG и таблица"
```

---

### Task 4: Страницата — прозорец, сравнение, сезон, риск, CSV, адрес

**Files:**
- Modify: `site/js/app.js` (`render`, `lookup`, началото с текстовете)
- Modify: `site/js/format.js` (`shareUrl`, `readQuery`)
- Modify: `site/js/format.test.js`
- Modify: `site/js/texts.js` (bg и en)
- Modify: `site/index.html`, `site/en/index.html`
- Modify: `site/css/app.css`

**Interfaces:**
- Consumes: Задачи 1–3 (`selectWindow`, `pair`, `seasonSummary`, `riskAfter`, `compareWindows`, `chartModel`, `toCsv`, `renderChart`, `renderTable`).
- Produces: нищо за следващи задачи (край на доставка А).

- [ ] **Step 1: Тестовете за адреса (RED)**

Добави в `site/js/format.test.js`:

```js
import { readWindow, shareUrl } from "./format.js";

test("readWindow: само 10, 20 и 30; всичко друго е 30", () => {
  assert.equal(readWindow("?window=10"), 10);
  assert.equal(readWindow("?window=20"), 20);
  assert.equal(readWindow("?window=30"), 30);
  for (const bad of ["?window=3", "?window=5", "?window=0", "?window=abc", "?window=", "", "?lat=42"]) {
    assert.equal(readWindow(bad), 30, bad);
  }
});

test("shareUrl носи прозореца само когато не е подразбиращият се", () => {
  assert.equal(shareUrl("https://frost.bg/", 42.184, 24.929, 30), "https://frost.bg/?lat=42.184&lon=24.929");
  assert.equal(shareUrl("https://frost.bg/", 42.184, 24.929, 10), "https://frost.bg/?lat=42.184&lon=24.929&window=10");
});
```

- [ ] **Step 2: Пусни — пада**

Run: `node --test site/js/format.test.js`
Expected: `does not provide an export named 'readWindow'`.

- [ ] **Step 3: `format.js`**

```js
export const WINDOWS = [10, 20, 30];
export const DEFAULT_WINDOW = 30;

export function readWindow(search) {
  const raw = new URLSearchParams(search || "").get("window");
  const n = Number(raw);
  return WINDOWS.includes(n) ? n : DEFAULT_WINDOW;
}
```

и `shareUrl` получава трети параметър:

```js
export function shareUrl(base, lat, lon, window = DEFAULT_WINDOW) {
  const r = (x) => String(Math.round(x * 1000) / 1000);
  const w = window !== DEFAULT_WINDOW ? `&window=${window}` : "";
  return `${base}?lat=${r(lat)}&lon=${r(lon)}${w}`;
}
```

- [ ] **Step 4: Зелено**

Run: `node --test site/js/format.test.js`
Expected: 0 fail. (Ако стар тест вика `shareUrl` с три аргумента — подразбиращата се стойност го пази.)

- [ ] **Step 5: Текстовете (bg и en)**

В `site/js/texts.js` добави към **двата** езика (стойностите са дадени; en е превод дума по дума):

```js
    // фаза 2 — историята
    history: "Историята по години", window_label: "Период",
    window_years: (n) => `последните ${n} години`,
    window_note: (from, to, withData, n) => `${from}–${to} · ${withData} от ${n} години с данни`,
    too_few_years: "твърде малко години за надеждна дата — графиката показва самите години",
    compare_spring: (days, dir) => dir === "same" ? "пролетната слана: без осезаема разлика спрямо 30-те години"
      : `пролетната слана: с ${days} дни по-${dir === "earlier" ? "рано" : "късно"} през последните 10 години`,
    compare_autumn: (days, dir) => dir === "same" ? "есенната слана: без осезаема разлика спрямо 30-те години"
      : `есенната слана: с ${days} дни по-${dir === "earlier" ? "рано" : "късно"} през последните 10 години`,
    season: "Сезон без слана",
    season_summary: (typical, min, max) => `типично ${typical} дни (най-къс ${min}, най-дълъг ${max})`,
    season_years: (years) => `години: ${years.join(", ")}`,
    season_clipped: "години без записана слана се броят до края на годината",
    risk_label: "Риск от слана след дата",
    risk_day: "ден", risk_month: "месец", risk_go: "Сметни",
    risk_result: (count, total, date, percent) =>
      `В ${count} от ${total} години с данни тази клетка е записала слана след ${date} и преди 1 юли — ${percent} %.`,
    risk_disclaimer: "Историческа честота, не прогноза за тази година; слана на самата дата не се брои.",
    risk_small_sample: "Малка извадка — описва само тези години; нула случая не значи нулев риск.",
    risk_bad_date: "Въведи ден и месец между 1 януари и 30 юни.",
    safe_means: (count, total, date) => `сигурната дата ${date} значи: в ${count} от ${total} години е имало слана след нея`,
    table_caption: "Последна пролетна и първа есенна слана по години",
    year: "Година", no_frost_recorded: "няма записана слана",
    chart_title: (lat, lon, from, to) => `История на клетката ${lat}, ${lon} по ERA5-Land, ${from}–${to}, праг 0 °C`,
    csv_download: "Свали CSV",
    no_history: "За тази клетка няма години с данни.",
```

- [ ] **Step 6: HTML-ът**

В `site/index.html` и `site/en/index.html`, веднага след `<section id="result" …>`:

```html
  <section id="history" class="history" hidden>
    <h2 id="history-title"></h2>
    <div class="windows" role="group" id="windows" aria-label=""></div>
    <p id="window-note" class="hint"></p>
    <p id="compare" class="compare"></p>
    <div id="chart" class="chart-wrap"></div>
    <details id="table-wrap"><summary id="table-summary"></summary><div id="table-slot"></div></details>
    <p><button id="csv" type="button" class="ghost"></button></p>
    <h3 id="season-title"></h3>
    <p id="season" class="season"></p>
    <h3 id="risk-title"></h3>
    <div class="risk">
      <label><span id="risk-day-label"></span><input id="risk-day" inputmode="numeric" maxlength="2"></label>
      <label><span id="risk-month-label"></span><input id="risk-month" inputmode="numeric" maxlength="2"></label>
      <button id="risk-go" type="button"></button>
    </div>
    <p id="risk-result" class="risk-result" aria-live="polite"></p>
  </section>
```

**Важно:** `#result` е `aria-live` област; `#history` **не е** — при смяна на прозореца се обявява само `#risk-result`/кратък статус, не цялата таблица.

- [ ] **Step 7: `app.js`**

Свързването (напиши го в `app.js`; имената на функциите са задължителни, за да ги намери прегледът):

```js
import { selectWindow, pair, seasonSummary, riskAfter, compareWindows } from "./stats.js";
import { chartModel, toCsv, renderChart, renderTable } from "./chart.js";
import { readWindow, WINDOWS, DEFAULT_WINDOW } from "./format.js";

let currentWindow = readWindow(location.search);
let lastData = null;   // последният отговор на /frost, за прерисуване без заявка

function renderHistory(d) {
  lastData = d;
  const years = Array.isArray(d?.years) ? d.years : [];
  const periodEnd = num(d?.period?.end);
  const section = $("history");
  if (!years.length || periodEnd === null) { section.hidden = true; return; }
  section.hidden = false;

  const w = selectWindow(years, periodEnd, currentWindow);
  const p = pair(w.rows);
  // двойките горе се пресмятат за прозореца; при под 10 години — обяснение
  redrawPairs(p, w);
  redrawCompare(compareWindows(years, periodEnd));
  redrawSeason(seasonSummary(w.rows));
  redrawChart(chartModel(w.rows, { from: w.from, to: w.to }), w, d);
  redrawSafeMeans(p, w);
  $("window-note").textContent = t.window_note(w.from, w.to, w.withData, currentWindow);
}

function setWindow(n) {
  currentWindow = WINDOWS.includes(n) ? n : DEFAULT_WINDOW;
  if (lastData) renderHistory(lastData);            // без нова заявка
  updateUrl();
}
```

Правила, които кодът трябва да спазва (проверяват се на преглед):

1. `render(d)` вика `renderHistory(d)` накрая; при грешка или ново търсене `#history` се скрива веднага (`lastData = null`).
2. Бутоните за прозорец се строят веднъж, с `aria-pressed` за избрания.
3. `updateUrl()` вика `shareUrl(location.origin + location.pathname, lat, lon, currentWindow)` и слага същия `window` в `#lang-switch`.
4. Началният прозорец идва от адреса (`readWindow`), преди първата заявка.
5. Бутонът за CSV прави `Blob` от `toCsv(w.rows, {lat: cell.lat, lon: cell.lon, period: d.period, source: d.source?.[lang]})` и `URL.createObjectURL`; името на файла е `frost-bg-<lat>-<lon>.csv`; URL-ът се освобождава с `URL.revokeObjectURL`.
6. Полето за риск: ден и месец като отделни `input`-и; при негодна двойка — `t.risk_bad_date`; иначе `riskAfter(w.rows, "MM-DD")` и текстът `t.risk_result(...) + " " + t.risk_disclaimer`, а при `w.withData < 10` и `t.risk_small_sample`.
7. Изречението до сигурната дата: `riskAfter(w.rows, p.safe.last_spring)` → `t.safe_means(count, total, formatMMDD(p.safe.last_spring, lang))`; само когато има сигурна дата.
8. `lookupSeq` пази и `#history`: закъснял отговор не рисува история за друга точка.

- [ ] **Step 8: CSS**

В `site/css/app.css` добави правила за `.history`, `.windows button[aria-pressed="true"]`, `.chart`, `.chart .grid`, `.chart .tick`, `.chart .pt.spring`, `.chart .pt.autumn`, `.years`, `.risk`. Изисквания: **никаква анимация**; двете редици се различават по форма и по цвят; фокусът върху точка е видим (`:focus-visible` контур); в тъмна тема мрежата и етикетите ползват съществуващите променливи (`--line`, `--ink`); при печат (`@media print`) графиката и таблицата остават видими на светъл фон; при `@media (forced-colors: active)` точките ползват `currentColor` и не изчезват.

- [ ] **Step 9: Проверка на живо**

Run: `npm run dev` и отвори `http://localhost:8787/?lat=42.18425&lon=24.92936`
Провери: историята се появява; бутоните 10/20/30 сменят датите и бележката без мрежова заявка (мрежовият панел е празен); адресът се сменя; CSV-то се сваля и се отваря в таблица; рискът за 20 април дава число; смяна на езика пази прозореца; с Tab се стига до точките в графиката; на 320 px нищо не излиза извън екрана; тъмната тема е четима. Запиши какво си проверил в доклада.

- [ ] **Step 10: Целият пакет и commit**

Run: `npm test`
Expected: 0 fail навсякъде.

```bash
git add site/ && git commit -m "Страницата показва историята: прозорец, сравнение, сезон, риск, CSV"
```

---

### Task 5: Версия 0.3.0, документация, CHANGELOG (край на доставка А)

**Files:**
- Modify: `worker/index.js` (`APP_VERSION`), `package.json`, `worker/index.test.js` (литералите с версията)
- Modify: `CHANGELOG.md`
- Modify: `docs/bg/README.md`, `docs/en/README.md` (какво показва страницата)
- Modify: `docs/bg/api.md`, `docs/en/api.md` (само бележката, че `years` вече се ползва от страницата; API-то не се променя; махни остарелия текст за синтетичната мрежа в началото)
- Modify: `site/js/texts.js` (`api`: текстът „същото като JSON“ става „пълният отговор като JSON“)

**Interfaces:**
- Consumes: всичко от Задачи 1–4.
- Produces: нищо.

- [ ] **Step 1: Версията**

`APP_VERSION` в `worker/index.js` и `version` в `package.json` стават `0.3.0` (страницата се промени и `APP_VERSION` е в ключа на кеша — иначе ръбът ще сервира старата страница). Смени и литералите в `worker/index.test.js`.

Run: `npm run test:worker`
Expected: 0 fail.

- [ ] **Step 2: CHANGELOG**

Нов запис над `## [0.2.1]`, двуезичен, в същия формат:

```markdown
## [0.3.0] — 2026-09-23

### 🇧🇬 Български

#### Историята по години

- **Графика с последните 30 години** под датите: по една точка за
  последната пролетна и първата есенна слана, месеците по оста, таблица със
  същите числа и бутон **„свали CSV“**.
- **Период 10 / 20 / 30 години** — датите се пресмятат за избрания период
  от същия отговор, без нова заявка. По-къси периоди няма: под 10 години
  със слана „сигурна в 9 от 10 години“ е безсмислица.
- **Сравнение „последните 10 срещу всичките 30“** — с колко дни се е
  преместила типичната слана.
- **Сезон без слана** — типична, най-къса и най-дълга дължина, смятани по
  години (не от типичните дати).
- **Риск от пролетна слана след дата** — „в 4 от 30 години е имало слана
  след 20 април и преди 1 юли — 13 %“, с уговорката, че е историческа
  честота, не прогноза. Същото изречение обяснява и сигурната дата.
- API-то не се променя: `/api/v1/frost` връща същото, включително `years`.

### 🇬🇧 English

#### The year history

- **A chart of the last 30 years** under the dates: one point for the last
  spring and the first autumn frost, months along the axis, a table with the
  same numbers and a **"download CSV"** button.
- **Period 10 / 20 / 30 years** — the dates are recomputed for the chosen
  period from the same response, with no new request. No shorter periods:
  with fewer than ten frost years "safe in 9 years out of 10" is meaningless.
- **A comparison "the last 10 against all 30"** — by how many days the
  typical frost has moved.
- **Frost-free season** — typical, shortest and longest length, computed per
  year (not from the typical dates).
- **Risk of spring frost after a date** — "in 4 of 30 years there was frost
  after 20 April and before 1 July — 13 %", with the caveat that it is a
  historical frequency, not a forecast. The same sentence explains the safe
  date.
- The API does not change: `/api/v1/frost` returns the same, including
  `years`.

---
```

- [ ] **Step 3: Документацията**

В `docs/{bg,en}/README.md` — един абзац какво показва страницата сега (история, период, сезон, риск, CSV) с връзка към спецификацията на фаза 2. В `docs/{bg,en}/api.md` — изречение, че `years` е това, от което страницата смята периодите, и че API-то остава без параметър за период; махни остарелия увод за синтетичната мрежа.

- [ ] **Step 4: Зелено и commit**

Run: `npm test`

```bash
git add -A && git commit -m "Версия 0.3.0: историята по години в CHANGELOG и документацията"
```

---

# Доставка Б — височината на точката

### Task 6: `worker/elevation.js` — доставчикът

**Files:**
- Create: `worker/elevation.js`
- Create: `worker/elevation.test.js`

**Interfaces:**
- Consumes: `parseCoords` от `worker/frost.js` (само за формата на координатите — модулът получава вече нормализирани числа).
- Produces (ползва се от Задача 7):
  - `elevation({ lat, lon, fetchImpl, timeoutMs, now }) → { elevation_m: number | null }`
  - `ElevationError` (клас) — всяка грешка навън е този тип, със стабилно съобщение без стойности от доставчика
  - `cooldownUntil(now) → number` / вътрешно състояние за краткия отказ (10 минути след 429/5xx)

- [ ] **Step 1: Тестовете (RED)**

Създай `worker/elevation.test.js`:

```js
// Височината на самата точка (Open-Meteo Elevation). Мрежата е подменена.
import { test } from "node:test";
import assert from "node:assert/strict";
import { elevation, ElevationError, resetCooldown } from "./elevation.js";

const ok = (body) => () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const status = (code) => () => new Response("{}", { status: code });

test("нормален отговор -> метри", async () => {
  let seen;
  const r = await elevation({ lat: 42.184, lon: 24.929, fetchImpl: (u) => { seen = new URL(u); return ok({ elevation: [350.4] })(); } });
  assert.deepEqual(r, { elevation_m: 350 });
  assert.equal(seen.searchParams.get("latitude"), "42.184");
  assert.equal(seen.searchParams.get("longitude"), "24.929");
});

test("нула и отрицателна височина са валидни стойности", async () => {
  assert.deepEqual(await elevation({ lat: 42, lon: 24, fetchImpl: ok({ elevation: [0] }) }), { elevation_m: 0 });
  assert.deepEqual(await elevation({ lat: 42, lon: 24, fetchImpl: ok({ elevation: [-3.2] }) }), { elevation_m: -3 });
});

test("негоден отговор -> ElevationError, без стойности в съобщението", async () => {
  for (const body of [{}, { elevation: [] }, { elevation: "350" }, { elevation: [null] }, { elevation: [NaN] }, [1, 2]]) {
    await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: ok(body) }), (e) => {
      assert.ok(e instanceof ElevationError);
      assert.ok(!/350|NaN/.test(e.message), e.message);
      return true;
    });
  }
});

test("429 и 5xx включват кратък отказ: следващата заявка не пита нагоре", async () => {
  resetCooldown();
  let calls = 0;
  const f = () => { calls++; return status(429)(); };
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: f, now: 1000 }));
  assert.equal(calls, 1);
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: f, now: 2000 }), /cooldown/i);
  assert.equal(calls, 1, "в отказа не се пита нагоре");
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: f, now: 1000 + 10 * 60 * 1000 + 1 }));
  assert.equal(calls, 2, "след 10 минути пак се пита");
});

test("краен срок: бавен доставчик -> ElevationError", async () => {
  resetCooldown();
  const slow = () => new Promise(() => {});
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: slow, timeoutMs: 20 }), ElevationError);
});

test("мрежова грешка -> ElevationError, без автоматичен повторен опит", async () => {
  resetCooldown();
  let calls = 0;
  await assert.rejects(() => elevation({ lat: 42, lon: 24, fetchImpl: () => { calls++; return Promise.reject(new Error("boom")); } }), ElevationError);
  assert.equal(calls, 1);
});
```

- [ ] **Step 2: Пусни — пада**

Run: `node --test worker/elevation.test.js`
Expected: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Модулът**

Създай `worker/elevation.js`:

```js
// Височината на самата точка: Open-Meteo Elevation (Copernicus DEM GLO-90,
// ~90 м). Свободният план е 600/мин, 5 000/час, 10 000/ден и е за
// нетърговска употреба — правилото за лимит на зоната не пази този бюджет,
// затова след 429 или 5xx Worker-ът спира да пита нагоре за 10 минути.
const URL_BASE = "https://api.open-meteo.com/v1/elevation";
const TIMEOUT_MS = 8000;
const COOLDOWN_MS = 10 * 60 * 1000;

export class ElevationError extends Error {}

let cooldownUntil = 0;
export function resetCooldown() { cooldownUntil = 0; }

export async function elevation({ lat, lon, fetchImpl = fetch, timeoutMs = TIMEOUT_MS, now = Date.now() }) {
  if (now < cooldownUntil) throw new ElevationError("elevation provider in cooldown");
  const url = `${URL_BASE}?latitude=${lat}&longitude=${lon}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await Promise.race([
      fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } }),
      new Promise((_, reject) => setTimeout(() => reject(new ElevationError("elevation provider timed out")), timeoutMs)),
    ]);
  } catch (e) {
    throw e instanceof ElevationError ? e : new ElevationError("elevation provider did not answer");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429 || res.status >= 500) {
    cooldownUntil = now + COOLDOWN_MS;
    throw new ElevationError("elevation provider is throttling");
  }
  if (!res.ok) throw new ElevationError("elevation provider returned an error status");
  let body;
  try { body = await res.json(); } catch (_) { throw new ElevationError("elevation provider returned malformed data"); }
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new ElevationError("elevation provider returned malformed data");
  const list = body.elevation;
  if (!Array.isArray(list) || list.length < 1) throw new ElevationError("elevation provider returned malformed data");
  const v = list[0];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ElevationError("elevation provider returned malformed data");
  return { elevation_m: Math.round(v) };
}
```

- [ ] **Step 4: Зелено и commit**

Run: `node --test worker/elevation.test.js && npm run test:worker`

```bash
git add worker/elevation.js worker/elevation.test.js
git commit -m "elevation.js: височината на точката с краен срок и кратък отказ след 429"
```

---

### Task 7: Адресът `/api/v1/elevation`, екранът, документацията

**Files:**
- Modify: `worker/index.js` (маршрут, кеш ключ, `ELEVATION` в `/config`)
- Modify: `worker/index.test.js`
- Modify: `worker/texts.js` (посочване за височината)
- Modify: `wrangler.toml` (`ELEVATION = "on"` в `[vars]`)
- Modify: `site/js/app.js`, `site/js/texts.js`, `site/css/app.css`
- Modify: `docs/{bg,en}/api.md`, `docs/{bg,en}/operations.md`, `CHANGELOG.md`, `package.json`, `worker/index.js` (версия 0.3.1)

**Interfaces:**
- Consumes: `elevation`, `ElevationError` от Задача 6; `parseCoords`, `frostResponse` от `worker/frost.js`.
- Produces: `GET /api/v1/elevation?lat=&lon=` → `{"query":{"lat":…,"lon":…},"elevation_m":350|null,"source":{"bg":…,"en":…,"url":…,"attribution":…},"version":"1"}`.

- [ ] **Step 1: Тестовете в `worker/index.test.js` (RED)**

```js
test("/api/v1/elevation: нормализира, кешира и връща метри", async () => {
  const env = { ...baseEnv, FETCH: () => new Response(JSON.stringify({ elevation: [350.4] }), { status: 200 }) };
  const r = await worker.fetch(new Request("https://x/api/v1/elevation?lat=42.18425&lon=24.92936"), env, ctx);
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.deepEqual(b.query, { lat: 42.184, lon: 24.929 });
  assert.equal(b.elevation_m, 350);
  assert.equal(b.version, "1");
  assert.match(r.headers.get("cache-control"), /s-maxage=604800/);
  assert.ok(b.source.attribution.includes("Copernicus"));
});

test("/api/v1/elevation: извън България -> 400, негодни координати -> 400", async () => {
  const env = { ...baseEnv, FETCH: () => { throw new Error("не бива да се пита нагоре"); } };
  assert.equal((await worker.fetch(new Request("https://x/api/v1/elevation?lat=48.85&lon=2.35"), env, ctx)).status, 400);
  assert.equal((await worker.fetch(new Request("https://x/api/v1/elevation?lat=abc&lon=2"), env, ctx)).status, 400);
});

test("/api/v1/elevation: грешка на доставчика -> 502 no-store, не кеширан празен отговор", async () => {
  const env = { ...baseEnv, FETCH: () => new Response("{}", { status: 500 }) };
  const r = await worker.fetch(new Request("https://x/api/v1/elevation?lat=42.2&lon=24.9"), env, ctx);
  assert.equal(r.status, 502);
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("/api/v1/elevation: ELEVATION=off -> 404 и нищо нагоре", async () => {
  const env = { ...baseEnv, ELEVATION: "off", FETCH: () => { throw new Error("не бива"); } };
  assert.equal((await worker.fetch(new Request("https://x/api/v1/elevation?lat=42.2&lon=24.9"), env, ctx)).status, 404);
});

test("/api/v1/config казва дали височината е включена", async () => {
  const on = await (await worker.fetch(new Request("https://x/api/v1/config"), baseEnv, ctx)).json();
  assert.equal(on.elevation, true);
  const off = await (await worker.fetch(new Request("https://x/api/v1/config"), { ...baseEnv, ELEVATION: "off" }, ctx)).json();
  assert.equal(off.elevation, false);
});
```

- [ ] **Step 2: Пусни — падат**

Run: `npm run test:worker`
Expected: новите ✗, старите ✓.

- [ ] **Step 3: Worker-ът**

В `worker/index.js`: `const elevationOn = (env) => env.ELEVATION !== "off";`, маршрут `case "/api/v1/elevation": return handleElevation(url, env, ctx);` (при изключено — `error("not_found", 404)`), и:

```js
// Собствен rev: effectiveGeocoder описва ПРАВО геокодиране и не важи тук.
function elevationRev(env) {
  return encodeURIComponent([APP_VERSION, "openmeteo-elevation"].join("|"));
}

async function handleElevation(url, env, ctx) {
  if (!elevationOn(env)) return error("not_found", 404);
  const q = parseCoords(url.searchParams.get("lat"), url.searchParams.get("lon"));
  if (!q) return error("bad_request", 400);
  if (!frostResponse(grid, q.lat, q.lon)) return error("outside_bulgaria", 400);
  const cache = cacheOf();
  const key = cache ? new Request(`${url.origin}/api/v1/elevation?rev=${elevationRev(env)}&lat=${q.lat}&lon=${q.lon}`) : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  try {
    const { elevation_m } = await elevation({ lat: q.lat, lon: q.lon, fetchImpl: env.FETCH ?? fetch });
    const res = json({ query: q, elevation_m, source: TEXTS.elevationSource, version: "1" }, 200, { "cache-control": WEEK });
    if (cache) ctx?.waitUntil?.(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    if (e instanceof ElevationError) return error("elevation_failed", 502);
    throw e;
  }
}
```

В `worker/texts.js`: `elevationSource` с `bg`/`en` („Copernicus DEM GLO-90 през Open-Meteo“ / „Copernicus DEM GLO-90 via Open-Meteo“), `url: "https://open-meteo.com/en/docs/elevation-api"`, `attribution: "Elevation data: Copernicus DEM GLO-90 · Weather data by Open-Meteo.com"`, и нов код на грешка `elevation_failed` с двата езика. В `/config` се добавя `elevation: elevationOn(env)`.

В `wrangler.toml`, в `[vars]`: `ELEVATION = "on"   # "off" изключва /api/v1/elevation и реда на екрана`.

- [ ] **Step 4: Зелено**

Run: `npm run test:worker`
Expected: 0 fail.

- [ ] **Step 5: Екранът**

В `app.js`: след `render(d)`, ако `cfg.elevation !== false`, се пуска `fetch("/api/v1/elevation?lat=…&lon=…")` с **текущия** `lookupSeq`; при успех към реда за клетката се добавя `t.point_elev(≈метри)`; при грешка или `elevation_m === null` редът просто липсва (никога 0, никога височината на клетката). Текстове (bg): `point_elev: (m) => \`приблизителна височина около точката: ≈ ${m} м\``, `elev_note: "Двете височини идват от различни модели и не коригират датите."`; en — същото на английски.

- [ ] **Step 6: Версия 0.3.1, документация, CHANGELOG**

`APP_VERSION` и `package.json` → `0.3.1`; литералите в тестовете. В `docs/{bg,en}/api.md` — новият адрес с параметри, отговор, грешки, кеш; в `docs/{bg,en}/operations.md` — бюджетът на Open-Meteo, краткият отказ и превключвателят `ELEVATION`; в `CHANGELOG.md` — двуезичен запис.

- [ ] **Step 7: Проверка на живо и commit**

Run: `npm run dev`, отвори `http://localhost:8787/?lat=42.18425&lon=24.92936` — появява се редът с двете височини; спри мрежата и провери, че резултатът остава, а редът изчезва.

```bash
npm test && git add -A && git commit -m "Височината на точката: /api/v1/elevation с бюджет и превключвател, редът на екрана"
```

---

## Self-review

**Покритие на спецификацията:** Ф1 → Задача 1 (+ тестът за паралелност); Ф2 → Задачи 1 и 4; Ф3 → Задача 2; Ф4 → Задачи 2 и 4; Ф5 → Задачи 3 и 4 (CSV, таблица, достъп, печат); Ф6 → Задачи 6 и 7; Ф7 → Задача 4 (`window` в адреса, `lookupSeq`, езиковата връзка); Ф8 → файловете по задачите; Ф9 → тестовете във всяка задача + проверките на живо (Стъпка 9 на Задача 4, Стъпка 7 на Задача 7); Ф10 → доставка А (Задачи 1–5) и Б (Задачи 6–7).

**Плейсхолдери:** няма — всеки код и всеки текст е даден.

**Имена:** `dayOfYear`, `toMMDD`, `selectWindow`, `pair`, `seasonSummary`, `riskAfter`, `compareWindows` (Задачи 1–2) се ползват със същите имена в Задачи 3–4; `chartModel`, `toCsv`, `renderChart`, `renderTable` (Задача 3) — в Задача 4; `elevation`, `ElevationError`, `resetCooldown` (Задача 6) — в Задача 7; `readWindow`, `WINDOWS`, `DEFAULT_WINDOW`, `shareUrl(base, lat, lon, window)` (Задача 4) са в `format.js`.
