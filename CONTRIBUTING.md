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

**Какво е и какво НЕ е това.** Markdown връзка или кавичен `href`/`src` извън
ограден блок по правило или се проверява, или излиза като проблем с файл и
ред. Това **не е гаранция**: проверката е евристика, не parser. При
преплетени огради и HTML коментари разпознаването не е сигурно — файлът пада
шумно (диагностика „смесени огради и HTML коментари — разпознаването не е
сигурно“), но **една връзка в него може да остане непроверена**. Шумният
провал е това, което се обещава; пълнотата на разпознаването — не.

**Какво проверява.** Markdown връзките и кавичните `href`/`src` на реална
позиция, включително вътре в `inline code` и вътре в `<!-- HTML коментари
-->`. Етикетът може да съдържа една нива вложени скоби, колкото стига за
значка (изображение, което само по себе си е връзка) — тогава се проверяват
и двете цели. Двете форми, в ограден блок именно защото иначе щяха да бъдат
проверени:

```markdown
[текст](цел.md)
[![описание](картинка.png)](цел.html)
```

Относителните адреси се разрешават спрямо файла, започващите с „/“ — спрямо
`site/`, след нормализиране на `.` и `..` (процентното кодиране никога не
създава структура: `%2F` не е разделител); `/api/*` се пропуска като маршрут
на Worker-а по суровия първи сегмент, точно както го сравнява и самият
Worker. Външни — и затова недокоснати — са адресите с URI схема (`https:`,
`mailto:`, `tel:`…) и protocol-relative адресите (`//example.com/…`).

**Какво съобщава като проблем** (излиза с файл и ред под „Неразпознато“ и
проверката пада — тих пропуск е единственото недопустимо за този
инструмент, шумен фалшив резултат е поносим): `href`/`src` без кавички, с
незатворена кавичка, със стойност, която не изглежда като адрес, или с
невалидна граница на атрибута (кавичка или наклонена черта веднага пред
`href`/`src`); нещо, което изглежда като Markdown връзка, но не е (интервал
или скоби в адрес БЕЗ `<…>`, двойна вложеност в етикета); незатворен ограден
блок; незатворен HTML коментар; адрес, който излиза над корена; файл, в
който двата анализа на оградите не са съгласни. Адрес в `<…>` е поддържан,
включително с интервали и със скоби вътре — той се проверява, не се
съобщава.

**Какво остава непроверено — всяка граница е приета, не пропуск.**

- **Ограден блок** (три обратни кавички или три тилди на своя си ред) —
  **там влиза пример, който не бива да се проверява.** Той обаче не изключва
  БЕЗУСЛОВНО: блок, съдържащ само отварящ HTML коментар без затварящ, пак
  дава диагностика „незатворен HTML коментар“; а ако първият блок съдържа
  отварящ коментар, а вторият — затварящ, връзката във ВТОРИЯ блок се
  проверява (и излиза мъртва, ако целта ѝ не съществува). **Дори напълно
  чист блок не е достатъчен**: ограден блок, в който има отварящ HTML
  коментар, кара следващия — съвсем чист — блок също да бъде проверен.
  Надеждността
  зависи от контекста на целия файл, не само от съдържанието на конкретната
  ограда — затова, ако примерът гръмне, решението е да се махнат парчетата
  от HTML коментар наоколо, не само да се огради.
- **Reference-style връзки** (`[текст][ref]`) не се разпознават И не дават
  диагностика. Приета граница: в хранилището няма нито една такава връзка, а
  коректното им разпознаване иска истински CommonMark parser.
- **Заглавието на връзка в кавички не може да съдържа квадратна скоба**,
  макар CommonMark да го позволява: такава връзка излиза като „Неразпознато“
  (шумно, не тихо). Цената е платена нарочно — заглавие, което може да
  съдържа скоби, поглъща истинската връзка след себе си. Заглавие в КРЪГЛИ
  скоби обаче минава без диагностика — друг израз, друга граница. Трите
  форми, пак в ограден блок, защото първите две нарочно не се разпознават, а
  третата се проверява:

  ```markdown
  [текст](цел.md "виж [бележка]")
  [текст](цел.md 'виж [бележка]')
  [текст](цел.md (виж [бележка]))
  ```

Освен това: проверява се само че целевият ФАЙЛ съществува, не и дали
„#котва“ в него съществува. Диагностиката „незатворен HTML коментар“ важи за
Markdown файловете; в `site/**/*.html` не се зачерква нищо, затова там няма
и такъв анализ. Примери в `inline code`, в HTML коментари, в блокцитат и в
четириинтервален код СЕ проверяват — ако целта им не съществува, това е
шумна фалшива тревога и мястото ѝ е ограден блок.

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

**What this is and what it is NOT.** As a rule, a Markdown link or a quoted
`href`/`src` outside a fenced block is either checked or comes out as a
problem with file and line. This is **not a guarantee**: the check is a
heuristic, not a parser. With interleaved fences and HTML comments the
recognition is not certain — the file fails noisily (the diagnostic "смесени
огради и HTML коментари — разпознаването не е сигурно"), but **one link in
it may go unchecked**. The noisy failure is what is promised; completeness of
the recognition is not.

**What it checks.** Markdown links and quoted `href`/`src` in a real
attribute position, including inside `inline code` and inside `<!-- HTML
comments -->`. The label may contain one level of nested brackets, enough
for a badge (an image that is itself a link) — then both targets are
checked. The two forms, in a fenced block precisely because they would
otherwise be checked:

```markdown
[text](target.md)
[![description](picture.png)](target.html)
```

Relative addresses resolve against the file, `/`-prefixed ones against
`site/`, after normalizing `.` and `..` (percent-encoding never creates
structure: `%2F` is not a separator); `/api/*` is skipped as a Worker route
by its raw first segment, exactly as the Worker itself compares it. External
— and therefore untouched — are addresses with a URI scheme (`https:`,
`mailto:`, `tel:`…) and protocol-relative addresses (`//example.com/…`).

**What it reports as a problem** (printed with file and line under
„Неразпознато“, and the check fails — a silent miss is the one outcome this
tool does not allow; a noisy false positive is acceptable): an `href`/`src`
without quotes, with an unterminated quote, with a value that does not look
like an address, or with an invalid attribute boundary (a quote or a slash
immediately before `href`/`src`); something that looks like a Markdown link but
isn't (a space or parentheses in an address WITHOUT `<…>`, double nesting in
the label); an unclosed fenced block; an unclosed HTML comment; an address
that escapes the root; a file where the two fence analyses disagree. An
address in `<…>` is supported, including spaces and parentheses inside — it
is checked, not reported.

**What stays unchecked — every boundary is accepted, not an oversight.**

- **A fenced block** (three backticks or three tildes on a line of their
  own) — **put an example there if it must not be checked.** It does not,
  however, exclude UNCONDITIONALLY: a block containing only an opening HTML
  comment marker with no closing one still yields an "unclosed HTML comment"
  diagnostic; and if the first block holds an opening comment marker and the
  second a closing one, a link in the SECOND block is checked (and comes out
  dead if its target does not exist). **Even a completely clean block is not
  enough**: a fenced block that holds an opening HTML comment makes the next
  — entirely clean — block be checked too. Reliability depends on the context
  of the whole file, not only on the contents of that one fence: if an
  example fires, remove the pieces of the HTML comment around it rather than
  only fencing it.
- **Reference-style links** (`[text][ref]`) are neither recognized NOR
  reported. An accepted boundary: the repository has no such link, and
  recognizing them properly needs a real CommonMark parser.
- **A quoted link title may not contain a square bracket**, even though
  CommonMark allows it: such a link comes out as „Неразпознато“ (noisy, not
  silent). The price is paid on purpose — a title that may contain brackets
  swallows the real link after it. A title in PARENTHESES, however, passes
  with no diagnostic — a different expression, a different boundary. The
  three forms, again in a fenced block because the first two are deliberately
  not recognized while the third is checked:

  ```markdown
  [text](target.md "see [note]")
  [text](target.md 'see [note]')
  [text](target.md (see [note]))
  ```

Besides that: only the target FILE is checked for existence, not whether a
"#fragment" inside it exists. The "unclosed HTML comment" diagnostic applies
to Markdown files; nothing is redacted in `site/**/*.html`, so there is no
such analysis there. Examples in `inline code`, in HTML comments, in a
blockquote and in four-space indented code ARE checked — if their target
does not exist that is a noisy false alarm, and its place is a fenced
block.

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
