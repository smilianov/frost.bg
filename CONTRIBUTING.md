# Как да предложиш промяна в frost.bg

## Локален пуск

```bash
npm install
npm run dev
```

Отваря на [http://localhost:8787](http://localhost:8787) — `npm run dev` е
`npx wrangler dev`: истинският Cloudflare Workers runtime локално, нищо не
се качва в Cloudflare. Подробности за архитектурата на проекта —
[`docs/bg/architecture.md`](docs/bg/architecture.md).

## Тестове

```bash
npm test
```

Пуска подред тестовете на Worker-а (`node --test "worker/*.test.js"`), на
страницата (`node --test "site/js/*.test.js"`) и питоновите тестове на
мрежата и на CDS инструментите. CI (`.github/workflows/ci.yml`) пуска
същото на Node 24 и Python 3.12 при всеки push и pull request — PR не се
приема с червено CI.

**Само `npm install` не стига за CDS тестовете.** `grid/tests_cds.py`
иска `netCDF4`/`cdsapi` от отделната venv `grid/.venv-cds`
(`grid/requirements-cds.txt`); без нея тестът **пропуска тихо с изход 0**
(„пропуснато: няма netCDF4“) — `npm test` пак излиза зелен, но без нито
една реално пусната CDS проверка. За да ги пуснеш наистина:

```bash
python3 -m venv grid/.venv-cds
grid/.venv-cds/bin/pip install -r grid/requirements-cds.txt
npm test    # test:cds сега вижда venv-а и пуска tests_cds.py истински
```

Виж реда „пропуснато“ (или липсата му) в извеждането — това е единствената
разлика между пропуснат и наистина пуснат CDS пробег.

## Правилото за промените

Всяка поправка идва с **тест за конкретния случай, който пада преди нея** —
не общ RED пробег на целия пакет, а тест, написан за точно този бъг или
точно тази нова проверка, който демонстрируемо не минава преди поправката и
минава след нея. Общ провал на съществуващи тестове не е това — тестът
трябва да е нов (или разширен) и насочен точно към промяната.

## Прегледите

Промените в frost.bg минават през външен reviewer, не само през собственика
на репото. За теб това значи: дръж PR-а **малък и фокусиран върху едно
нещо** — един бъг, една функция — с обяснено „защо“, не само „какво“, в
описанието. По-голям PR отнема повече кръгове преглед и по-лесно крие бъг;
раздели го, ако можеш.

## Езикови правила

- Думата е **„слана“**, никога „мраз“ — навсякъде в българския текст (виж
  `worker/texts.js`).
- Технически термини остават на **английски** в българския текст — „push“,
  не „бутам“; „deploy“, не „разгръщане“; „commit“, не „подаване“.
- **Всеки видим текст съществува и на двата езика** — интерфейсът
  (`site/js/texts.js`), грешките и посочванията на API-то
  (`worker/texts.js`), документацията (`docs/bg/` и `docs/en/`, огледални
  по съдържание). Нов текст на един език без своя близнак на другия не се
  приема.

## Мрежата не се редактира на ръка

`grid/grid.json` е **генериран файл** — сметнат офлайн от `grid/compute_grid.py`
(виж [`docs/bg/architecture.md`](docs/bg/architecture.md) и
[`docs/bg/operations.md`](docs/bg/operations.md)). Промяна в число в него
директно, без да мине през скрипта и истинските данни, ще бъде презаписана
при следващото опресняване на мрежата — а дотогава ще лъже. Промяна в
самата статистика (медианата, персентилът зад типичната/сигурната дата)
минава през `grid/frost_estimate.py` **и** през сърцевината на нейното
копие на страницата, `site/js/stats.js` — двете там трябва да останат
еднакви, виж `site/js/stats.parity.test.js` (сверява само датите и
годишните бройки, не цялата логика на `stats.js` — прозорецът, сезонът и
рискът съществуват само в JS, виж
[`docs/bg/architecture.md`](docs/bg/architecture.md)); нищо от това не
минава през самия `grid.json`.

## Нови зависимости в Worker-а не се приемат

`worker/` е нарочно **без runtime зависимости** (`package.json` държи само
`wrangler`, като dev dependency за самото пускане/качване). Всеки ред код,
внесен от `npm`, е ред, който не си написал и не си прегледал — на ръба, на
всяка заявка, за публично API без бекенд зад него. Ако имаш нужда от нещо,
което изглежда като зависимост — увери се, че не се решава с малко чист
код, преди да предложиш `npm install`. Правилото не е по преценка: PR с
нова зависимост в `worker/` се връща с молба за алтернатива без такава.

## Въпроси и лиценз

За въпроси — [GitHub issues](https://github.com/smilianov/frost.bg/issues) на
репото. Приносът се приема под лиценза на проекта, **MIT** — виж
[`LICENSE`](LICENSE).

---

# How to propose a change to frost.bg

## Running locally

```bash
npm install
npm run dev
```

Opens at [http://localhost:8787](http://localhost:8787) — `npm run dev` is
`npx wrangler dev`: the real Cloudflare Workers runtime, locally, nothing
gets uploaded to Cloudflare. For the project's architecture, see
[`docs/en/architecture.md`](docs/en/architecture.md).

## Tests

```bash
npm test
```

Runs, in order, the Worker's tests (`node --test "worker/*.test.js"`), the
page's tests (`node --test "site/js/*.test.js"`) and the Python tests for
the grid and the CDS tooling. CI (`.github/workflows/ci.yml`) runs the same
on Node 24 and Python 3.12 on every push and pull request — a PR is not
merged with red CI.

**`npm install` alone is not enough for the CDS tests.** `grid/tests_cds.py`
needs `netCDF4`/`cdsapi` from the separate `grid/.venv-cds` venv
(`grid/requirements-cds.txt`); without it, the test **skips silently with
exit code 0** ("пропуснато: няма netCDF4") — `npm test` still comes back
green, but without a single CDS check actually having run. To run them for
real:

```bash
python3 -m venv grid/.venv-cds
grid/.venv-cds/bin/pip install -r grid/requirements-cds.txt
npm test    # test:cds now sees the venv and runs tests_cds.py for real
```

Watch for that "skipped" line (or its absence) in the output — that is the
only difference between a skipped and a genuinely completed CDS run.

## The rule for changes

Every fix comes with **a test for that specific case, which fails before
the fix** — not a general RED run of the whole suite, but a test written
for exactly that bug or exactly that new check, demonstrably failing before
the fix and passing after it. A general failure of existing tests doesn't
count — the test must be new (or extended) and aimed precisely at the
change.

## Reviews

Changes to frost.bg go through an external reviewer, not just the
repository owner. What that means for you: keep a PR **small and focused
on one thing** — one bug, one feature — with the "why" explained, not just
the "what", in the description. A larger PR takes more review rounds and
hides a bug more easily; split it up if you can.

## Language rules

- In Bulgarian text, the word is always **"слана"**, never "мраз" (see
  `worker/texts.js`).
- Technical terms stay in **English** inside the Bulgarian text — "push",
  not a translated word for it; same for "deploy", "commit", and the like.
- **Every user-visible text exists in both languages** — the interface
  (`site/js/texts.js`), the API's errors and attributions
  (`worker/texts.js`), the documentation (`docs/bg/` and `docs/en/`,
  mirrored in content). New text in one language without its twin in the
  other is not accepted.

## The grid is not hand-edited

`grid/grid.json` is a **generated file** — computed offline by
`grid/compute_grid.py` (see [`docs/en/architecture.md`](docs/en/architecture.md)
and [`docs/en/operations.md`](docs/en/operations.md)). Changing a number in
it directly, without going through the script and the real data, will be
overwritten at the next grid refresh — and until then it will lie. A change
to the statistics themselves (the median, the percentile behind the
typical/safe date) goes through `grid/frost_estimate.py` **and** through the
core of its counterpart on the page, `site/js/stats.js` — those two must
stay identical there, see `site/js/stats.parity.test.js` (it checks only
the dates and the yearly counts, not the rest of `stats.js`'s logic — the
window, the season and the risk figure exist only in JS, see
[`docs/en/architecture.md`](docs/en/architecture.md)); none of this goes
through `grid.json` itself.

## New dependencies in the Worker are not accepted

`worker/` is deliberately **free of runtime dependencies**
(`package.json` lists only `wrangler`, as a dev dependency for running and
deploying it). Every line of code pulled in from `npm` is a line you did
not write and did not review — at the edge, on every request, for a public
API with no backend behind it. If something looks like it needs a
dependency, make sure it can't be solved with a little plain code first.
The rule isn't discretionary: a PR that adds a new dependency to `worker/`
comes back with a request for an alternative that doesn't.

## Questions and licence

For questions, use [GitHub issues](https://github.com/smilianov/frost.bg/issues)
on the repository. Contributions are accepted under the project's licence,
**MIT** — see [`LICENSE`](LICENSE).
