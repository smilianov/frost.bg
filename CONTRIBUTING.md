# Как да предложиш промяна в frost.bg

## Локален пуск

Иска се **Node 24.21.0** (`AGENTS.md`):

```bash
npm install
npm run dev
```

Отваря на [http://localhost:8787](http://localhost:8787) — `npm run dev` е
`npx wrangler dev`: истинският Cloudflare Workers runtime локално, нищо не
се качва в Cloudflare. Подробности за архитектурата на проекта —
[`docs/bg/architecture.md`](docs/bg/architecture.md).

## Тестове

Пълният пакет иска **Node 24.21.0**, **Python 3.12** и — за CDS частта —
`grid/requirements-cds.txt` в собствена venv; пускай ги **non-root**
(`AGENTS.md`):

```bash
python3 -m venv grid/.venv-cds
grid/.venv-cds/bin/pip install -r grid/requirements-cds.txt
npm test
```

Пуска подред тестовете на Worker-а (`node --test "worker/*.test.js"`), на
страницата (`node --test "site/js/*.test.js"`), на скриптовете
(`node --test "scripts/*.test.js"`) и питоновите тестове на мрежата и на
CDS инструментите. Същото се пуска в CI при всеки push и pull request — PR
не се приема с червено CI.

**CDS тестовете се пропускат, когато избраният интерпретатор не може да
внесе `netCDF4`.** `test:cds` (`package.json`) пуска `grid/tests_cds.py`
през `grid/.venv-cds/bin/python`, ако е изпълним файл, иначе през
системния `python3`; самият тест **пропуска тихо с изход 0** („пропуснато:
няма netCDF4“) точно в този случай.

Завършен пробег не е същото като успешен пробег: редът с бройки в края —
„NN успешни, M неуспешни“ (`grid/tests_cds.py`) — доказва, че CDS тестовете
наистина са **пуснати** (за разлика от пропуснатите с „пропуснато“); дали
са и **минали**, личи по `M` — нула неуспешни.

`npm run check:links` (пуска се и в CI, след `npm test`) проверява
вътрешните връзки в документацията и сайта. Границата му е точно тази:

**Какво проверява.** Всяка Markdown връзка и всеки кавичен `href`/`src` на
реална позиция, включително вътре в `inline code` и вътре в `<!-- HTML
коментари -->`. Етикетът може да съдържа една нива вложени скоби, колкото
стига за значка (изображение, което само по себе си е връзка) — тогава се
проверяват и двете цели. Двете форми, в ограден блок именно защото иначе
щяха да бъдат проверени:

```markdown
[текст](цел.md)
[![описание](картинка.png)](цел.html)
```

Относителните адреси се разрешават спрямо файла, започващите с „/“ — спрямо
`site/`, след нормализиране на `.` и `..`; `/api/*` се пропуска като
маршрут на Worker-а, а външните адреси не се докосват.

**Какво съобщава като проблем** (излиза с файл и ред под „Неразпознато“ и
проверката пада — тих пропуск е единственото недопустимо за този
инструмент, шумен фалшив резултат е поносим): `href`/`src` без кавички, с
незатворена кавичка, със стойност, която не изглежда като адрес, или с
невалидна граница на атрибута (кавичка или наклонена черта веднага пред
`href`/`src`); нещо, което изглежда като Markdown връзка, но не е (интервал или скоби в адреса, двойна
вложеност в етикета); незатворен ограден блок; незатворен HTML коментар;
адрес, който излиза над корена.

**Какво остава непроверено.** Ограден блок (три обратни кавички или три
тилди на своя си ред) — **там влиза пример, който не бива да се
проверява**; reference-style Markdown връзки (`[текст][ref]`); дали
„#котва“ действително съществува в целевия файл (проверява се само че
самият файл го прави). Примери в `inline code`, в HTML коментари, в
блокцитат и в четириинтервален код СЕ проверяват — ако целта им не
съществува, това е шумна фалшива тревога и мястото ѝ е ограден блок.

## Версия

Вдигането на версията (`APP_VERSION` в `worker/index.js`, `version` в
`package.json`) минава и през примерните стойности в документацията —
`"app_version"` в `docs/bg/api.md` и `docs/en/api.md`; иначе остават стари
до следващия преглед.

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

Needs **Node 24.21.0** (`AGENTS.md`):

```bash
npm install
npm run dev
```

Opens at [http://localhost:8787](http://localhost:8787) — `npm run dev` is
`npx wrangler dev`: the real Cloudflare Workers runtime, locally, nothing
gets uploaded to Cloudflare. For the project's architecture, see
[`docs/en/architecture.md`](docs/en/architecture.md).

## Tests

The full suite needs **Node 24.21.0**, **Python 3.12**, and — for the CDS
part — `grid/requirements-cds.txt` in its own venv; run them **non-root**
(`AGENTS.md`):

```bash
python3 -m venv grid/.venv-cds
grid/.venv-cds/bin/pip install -r grid/requirements-cds.txt
npm test
```

Runs, in order, the Worker's tests (`node --test "worker/*.test.js"`), the
page's tests (`node --test "site/js/*.test.js"`), the scripts' tests
(`node --test "scripts/*.test.js"`) and the Python tests for the grid and
the CDS tooling. The same runs in CI on every push and pull request — a PR
is not merged with red CI.

**The CDS tests are skipped whenever the selected interpreter can't import
`netCDF4`.** `test:cds` (`package.json`) runs `grid/tests_cds.py` through
`grid/.venv-cds/bin/python` if that's an executable file, else through the
system `python3`; the test itself **skips silently with exit code 0**
("пропуснато: няма netCDF4") exactly in that case.

A completed run is not the same as a passing run: the totals line at the
end — "NN успешни, M неуспешни" (`grid/tests_cds.py`) — proves the CDS
tests actually **ran** (as opposed to being skipped); whether they also
**passed** shows in `M` — zero failures.

`npm run check:links` (also runs in CI, after `npm test`) checks the
internal links in the documentation and the site. Its boundary is exactly
this:

**What it checks.** Every Markdown link and every quoted `href`/`src` in a
real attribute position, including inside `inline code` and inside
`<!-- HTML comments -->`. The label may contain one level of nested
brackets, enough for a badge (an image that is itself a link) — then both
targets are checked. The two forms, in a fenced block precisely because
they would otherwise be checked:

```markdown
[text](target.md)
[![description](picture.png)](target.html)
```

Relative addresses resolve against the file, `/`-prefixed ones against
`site/`, after normalizing `.` and `..`; `/api/*` is skipped as a Worker
route, and external addresses are left alone.

**What it reports as a problem** (printed with file and line under
„Неразпознато“, and the check fails — a silent miss is the one outcome this
tool does not allow; a noisy false positive is acceptable): an `href`/`src`
without quotes, with an unterminated quote, with a value that does not look
like an address, or with an invalid attribute boundary (a quote or a slash
immediately before `href`/`src`); something that looks like a Markdown link but
isn't (a space or parentheses in the address, double nesting in the label);
an unclosed fenced block; an unclosed HTML comment; an address that escapes
the root.

**What stays unchecked.** A fenced block (three backticks or three tildes
on a line of their own) — **put an example there if it must not be
checked**; reference-style Markdown links (`[text][ref]`); whether a
"#fragment" actually exists in the target file (only that the file itself
does). Examples in `inline code`, in HTML comments, in a blockquote and in
four-space indented code ARE checked — if their target does not exist that
is a noisy false alarm, and its place is a fenced block.

## Version

Bumping the version (`APP_VERSION` in `worker/index.js`, `version` in
`package.json`) also means updating the example values in the
documentation — `"app_version"` in `docs/bg/api.md` and `docs/en/api.md`;
otherwise they go stale until the next review catches them.

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
