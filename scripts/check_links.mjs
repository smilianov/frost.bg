#!/usr/bin/env node
// Проверява вътрешните връзки в документацията и в сайта — без мрежа
// (в CI няма достъп до Интернет за тази стъпка).
//
// Обхожда: README.md, README.en.md, CONTRIBUTING.md, docs/**/*.md,
// site/**/*.html.
//
// ПРАВИЛОТО НА ТОЗИ СКРИПТ (кръг 4, след три кръга кръпки):
// или разпознава връзката, или я съобщава като проблем с файл:ред. Тихото
// прескачане е махнато като възможност. Шумна фалшива тревога е приемлива —
// вижда се и се решава с ограден блок за минута; тих пропуск не се вижда
// никога. Трите предни кръга паднаха все на едно и също: регулярен израз без
// граници (`[^"]*`, `[^)]+`) прескачаше край на таг или на коментар и
// изяждаше истинската връзка след себе си, докато скриптът пишеше „Всички са
// живи.“ и излизаше с 0.
//
// Разпознати форми на връзка:
//   - Markdown: [текст](цел), ![alt](цел) — с истински `[етикет]` (може да
//     минава през редове и да съдържа една нива вложени квадратни скоби) и
//     адрес или в `<…>`, или без празно пространство и без скоби;
//     незадължителното заглавие след адреса ("…", '…', (…)) не влиза в целта.
//     ВКЛЮЧИТЕЛНО вътре в `inline code` и вътре в <!-- HTML коментари -->;
//   - изображение като връзка, `[![alt](img)](цел)` — проверяват се и двете
//     цели: външната и на самото изображение (вторият пробег,
//     MD_INLINE_FLAT, е точно за да не изчезне вътрешната тихо);
//   - HTML href/src с кавички (главни или малки букви) — като атрибут на
//     реална позиция: знакът пред името решава. Празно пространство или
//     начало на текста → кандидат; `"`, `'` или `/` → ПРОБЛЕМ (невалидна
//     граница: `<a title="x"href=…>`, `<a/href=…>`, или `href` в стойността
//     на друг атрибут); всичко друго (буква, цифра, тире, обратна кавичка) →
//     не е кандидат: `data-href="/x"` е друго име, а `` `href="/x"` `` в
//     проза е `inline code`. Важи и за site/**/*.html, и за HTML, вграден в
//     Markdown файл;
//   - HTML атрибутите се четат от целия текст на файла, не ред по ред, за
//     да не изчезва връзка, чийто `href="…"` пада на следващия ред спрямо
//     отварящия таг.
//
// Какво предизвиква ШУМЕН проблем (излиза в `unparsable`, exit 1):
//   - `href=`/`src=` без кавички, с незатворена кавичка, или със стойност,
//     която не изглежда като адрес (празно пространство, `<`, `>` или другата
//     кавичка вътре) — точно това хваща `<!-- href="https://example.com/ -->
//     <a href="/missing.html">`: първата стойност гърми, а сканирането
//     продължава веднага след „=“ и намира истинския href;
//   - всяко `](`, чиято ПОЗИЦИЯ не е разпозната като начало на адрес — напр.
//     `[x](/a b.html)` (интервал в адреса) или `](` в HTML коментар.
//     Отчитат се позиции, а не диапазони: попадането на едно `](` вътре в
//     чуждо съвпадение не доказва, че неговата цел е проверена (точно това
//     заглушаваше `[![alt](/a(b).png)](https://example.com)` — външната
//     връзка минаваше, а адресът на изображението изчезваше);
//   - ограден блок, отворен и незатворен до края на файла;
//   - HTML коментар, отворен и незатворен до края на файла;
//   - адрес, който след нормализиране излиза над корена (`/../x`);
//   - файл, в който двата анализа на оградите (слепият за коментари и
//     коментарно осведоменият) не са съгласни кои редове са в ограда:
//     сечението пази от грешка на ЕДИН от двата, но не и от обща грешка на
//     двата, затова самото разминаване се съобщава — виж redactFences.
//
// Какво се зачерква преди разпознаването (заменя се с празни редове, за да
// останат номерата верни): САМО оградените блокове, по правила
// CommonMark-lite — виж redactFences. Зачерква се СЕЧЕНИЕТО на два пробега:
// сляп за HTML коментари и коментарно осведомен. Ред става празен само ако и
// двата го смятат за вътре в ограда — затова грешка в коментарния анализ може
// единствено да остави ПОВЕЧЕ съдържание за проверка, никога по-малко. Това е
// свойство на конструкцията, не обещание: и двете по-ранни версии (само
// сляпата, после само осведомената) бяха оборени с изпълнение. Коментарният
// контекст се ползва САМО за това решение — съдържанието на коментарите
// продължава да СЕ проверява.
//
// Умишлено НЕ се редактират `inline code` и HTML коментари: и двата опита
// (кръг 2) създадоха тих пропуск там, където две отделни неща се пресичат —
// единична обратна кавичка в HTML коментар се сдвоява с обратната кавичка на
// съвсем друг `inline code` span по-надолу в реда и изяжда истинска Markdown
// връзка между тях:
//
//   Текст <!-- ` --> [счупена](/missing.html) `код`
//
// Единственият сигурен начин да се напише пример, който скриптът не докосва,
// е ограден блок (``` или ~~~, на своя си ред, без отстъп над 3 интервала).
//
// Правила за разрешаване на адрес (целият модел е в resolveTarget:
// процентното кодиране НИКОГА не създава структура):
//   - разделяне по СУРОВИТЕ "/" — декодиран `%2F` не става разделител;
//     сегментът си остава един, иначе `..` изяждат погрешните сегменти;
//   - точков сегмент е този, чийто суров ИЛИ декодиран вид е "." или ".."
//     (`%2e%2e`, `.%2e` и пр. също се нормализират);
//   - относителен път в Markdown → спрямо директорията на файла, в който
//     стои връзката; адрес, започващ с "/" (сайт-абсолютен) → спрямо site/;
//     `..` над съответния корен е проблем, не тихо разрешаване;
//   - `/api/` се познава по СУРОВИЯ първи сегмент, буквално равен на "api" —
//     нито `api%2Fv1`, нито `%61pi` са "api", точно както ги сравнява и
//     Worker-ът (`url.pathname.startsWith("/api/")`, а `URL.pathname`
//     запазва `%2F`). Маршрутите се прескачат нарочно: проверка във
//     файловата система би излъгала;
//   - крайната наклонена черта е БУЛЕВ ФЛАГ, носен през нормализирането —
//     `join` я губи, а тя носи изискването „трябва да е директория“;
//   - декодиране ЧАК НАКРАЯ, сегмент по сегмент, само за пипането на
//     файловата система: един счупен сегмент (`missing%zz.html`) не бива да
//     отменя декодирането на съседите си;
//   - ако разрешеният път сочи директория (независимо дали адресът е
//     написан с крайно "/", без него, или като относителен път) — търси се
//     index.html вътре; без него връзката е мъртва. Трите форми на един и
//     същ адрес ("/css", "/css/", относително "css/") получават еднаква
//     присъда;
//   - ако адресът е написан с крайно "/", а разрешеният път излиза файл
//     (не директория) — връзката е мъртва (файловата система би върнала
//     ENOTDIR за "app.css/" — скриптът отговаря същото);
//   - външни са адресите с URI схема (http(s):, mailto:, tel:…) И
//     protocol-relative адресите (`//example.com/…`) → не се докосват.
//
// Останалите граници — ШУМНИ, не тихи (проверява се, което не бива, вместо
// да изчезне нещо, което бива):
//   - ограда в blockquote (`> ```) не се разпознава като ограда —
//     съдържанието ѝ СЕ проверява;
//   - четириинтервален (indented) код не е ограда (CommonMark: отстъпът на
//     оградата е най-много 3 интервала) — съдържанието му СЕ проверява;
//   - `href` в стойността на друг атрибут, когато го предхожда интервал
//     (`<div title='see href="/x"'>`), СЕ проверява — фалшива тревога по
//     договор, вж. теста, който я закрепва;
//   - ДВОЙНА вложеност в етикета (`[а [б [в] г] д](цел)`) и адрес със скоби
//     вътре (`[x](/a(b).html)`) НЕ се проверяват — етикетът допуска една нива,
//     не рекурсия, а адресът не може да съдържа скоби. Излизат като
//     „Неразпознато“, тоест шумно; истинската им поддръжка иска CommonMark
//     parser;
//   - заглавие в кавички след адреса не може да съдържа квадратна скоба,
//     макар CommonMark да го позволява: иначе `<!-- [old](https://example.com
//     " --> [broken](/missing.html) <!-- ") -->` се четеше като ЕДНА връзка с
//     дълго заглавие, което поглъщаше истинската връзка след коментара. Сега
//     конструкцията е неразпозната (шумна), а вътрешната връзка се проверява;
//   - reference-style Markdown връзки ([текст][ref] / [ref]: цел) не се
//     поддържат — в хранилището няма нито една; коректното им разпознаване
//     иска истински CommonMark parser. `[ref]: цел` няма `](`, затова не
//     вдига и шум;
//   - дали "#котва" действително съществува в целевия файл не се проверява —
//     само че самият файл съществува ("#" се маха преди разрешаването).
//
// Излиза с код 1 и печата двата списъка — мъртвите като "файл:ред → цел" и
// неразпознатите като "файл:ред → какво" — ако има поне едно от двете.
// Излиза с код 1 и ако изобщо не намери файлове за проверка, или намери
// файлове, но нито една връзка и нито един проблем в тях — тих "0 живи
// връзки" е по-вероятно счупена проверка, отколкото чисто дърво (виж
// checkTree). Иначе 0 и обобщение колко връзки е прегледал.
//
// checkTree(root) е изнесена и за тестове (scripts/check_links.test.js) —
// приема произволен корен, за да могат фикстурите да не пипат истинското
// дърво.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

// --- обхождане на файловете -------------------------------------------

function walk(dir, suffix, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // фикстурите в тестовете може да нямат тази поддиректория
  }
  for (const name of entries.sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, suffix, out);
    else if (name.endsWith(suffix)) out.push(full);
  }
  return out;
}

function existingFile(path) {
  try {
    return statSync(path).isFile() ? path : null;
  } catch {
    return null;
  }
}

// --- редакция: маха само оградените блокове -----------------------------

// Оградите са единственото, което се редактира (виж бележката най-горе защо
// `inline code` и HTML коментарите НЕ се редактират). Правилата са
// CommonMark-lite, защото „почти“ тук значи тих пропуск:
//   - отваря ред `^ {0,3}(`{3,}|~{3,})…`; 4+ интервала отстъп НЕ е ограда;
//   - при обратни кавички info string-ът не бива да съдържа обратна кавичка
//     (CommonMark) — иначе ред като "```код``` и после [x](/y)" би минал за
//     ограда и би изял и връзката на реда, и остатъка от файла;
//   - затваря я първият ред от същия знак, дълъг поне колкото отварящата, и
//     нищо друго освен интервали — затова троен ред НЕ затваря четворна;
//   - редовете се заменят с празни (броят редове се пази, за да са верни
//     номерата).
// Няма ли затваряща до края на файла — само ТАЗИ ограда не се зачерква
// (съдържанието ѝ се проверява шумно) и редът ѝ излиза като проблем.
// Затворените огради преди нея си остават зачеркнати: шумът е локален за
// истинския дефект, вместо един незатворен блок да гръмне цял файл.
//
// Диапазоните на HTML коментарите в текста, линейно отпред назад. Незатворен
// коментар се смята за коментар до края на файла И се съобщава като проблем.
// Анализът е ЛЕКСИКАЛЕН и затова може да сгреши: `<!--` в един ограден блок
// се свързва с `-->` в друг. Затова резултатът му не се ползва сам — виж
// redactFences: зачерква се само сечението на двата анализа.
function htmlCommentRanges(text) {
  const ranges = [];
  let unclosed = null;
  let i = 0;
  for (;;) {
    const open = text.indexOf("<!--", i);
    if (open === -1) break;
    const close = text.indexOf("-->", open + 4);
    if (close === -1) {
      unclosed = open;
      ranges.push([open, text.length]);
      break;
    }
    ranges.push([open, close + 3]);
    i = close + 3;
  }
  return { ranges, unclosed };
}

// Един пробег по редовете: кои редове са вътре в ограден блок и какво не е
// разпознато. `inComment(pos)` решава дали ОТВАРЯЩ маркер на тази позиция е
// истински; подава се два пъти — веднъж като `() => false` (сляп за
// коментари), веднъж с истинските коментарни диапазони.
//
// Затварящият маркер нарочно НЕ минава през `inComment`: вътре в ограда
// CommonMark не познава HTML коментари, а пропуснато затваряне би зачеркнало
// ПОВЕЧЕ, тоест би могло да скрие връзка.
//
// Незатворена до края на файла ограда не зачерква НИЩО от себе си надолу
// (съдържанието ѝ се проверява шумно) и се съобщава с реда на отварящата.
function fenceScan(lines, lineStarts, inComment) {
  const redacted = new Array(lines.length).fill(false);
  const problems = [];
  let fence = null; // { char, len, line, from }
  for (let i = 0; i < lines.length; i++) {
    // CRLF: маркер след `\r` иначе не се разпознава нито като отварящ (`.` не
    // хваща `\r`), нито като затварящ (`[ \t]*$` не го хваща).
    const bare = lines[i].endsWith("\r") ? lines[i].slice(0, -1) : lines[i];
    if (fence) {
      redacted[i] = true;
      // fence.char е ` или ~ — нито един от двата не е метазнак в regex;
      // `[ \t]` в шаблона дава клас от интервал и табулация.
      if (new RegExp(`^ {0,3}${fence.char}{${fence.len},}[ \t]*$`).test(bare)) fence = null;
      continue;
    }
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/d.exec(bare);
    if (m && !(m[1][0] === "`" && m[2].includes("`")) && !inComment(lineStarts[i] + m.indices[1][0])) {
      fence = { char: m[1][0], len: m[1].length, line: i + 1, from: i };
      redacted[i] = true;
      continue;
    }
  }
  if (fence) {
    for (let i = fence.from; i < lines.length; i++) redacted[i] = false;
    problems.push({ line: fence.line, what: "незатворен ограден блок" });
  }
  return { redacted, problems };
}

// Връща { text, problems } — problems са редовете, които скриптът е видял, но
// не е разпознал (незатворена ограда, незатворен HTML коментар).
//
// Зачерква се СЕЧЕНИЕТО на два пробега: сляпия за коментари (A) и
// коментарно осведомения (B). Ред става празен само ако И ДВАТА го смятат за
// вътре в ограден блок. Това не е обещание, а свойство на конструкцията:
// сечение може само да намали зачеркнатото, тоест грешка в коментарния анализ
// може единствено да остави ПОВЕЧЕ съдържание за проверка. По-ранната версия
// ползваше само B и го твърдеше — ревюерът го обори с изпълнение: `<!--` в
// един ограден блок се свърза с `-->` в друг, потисна истинско отваряне,
// прие чуждо затваряне за отваряне и изяде истинска връзка между тях.
//
// Диагностиките за огради идват от B — той е по-точният. Самото разминаване
// между двете маски също е диагностика: сечението пази от грешка на един от
// анализите, но не от обща грешка на двата, затова файл, в който те не са
// съгласни, се съобщава. При файл без коментари двата съвпадат и нищо не се
// променя.
function redactFences(text) {
  const lines = text.split("\n");
  const lineStarts = [];
  let at = 0;
  for (const line of lines) {
    lineStarts.push(at);
    at += line.length + 1;
  }

  const { ranges, unclosed } = htmlCommentRanges(text);
  const inComment = (pos) => ranges.some(([from, to]) => pos >= from && pos < to);

  const blind = fenceScan(lines, lineStarts, () => false);
  const aware = fenceScan(lines, lineStarts, inComment);

  const out = lines.map((line, i) => (blind.redacted[i] && aware.redacted[i] ? "" : line));
  const problems = [...aware.problems];

  // Сечението пази от грешка на ЕДИН от двата анализа, но не и от обща грешка
  // на двата: при патологично преплетени огради и коментари и двете маски
  // могат да зачеркнат реда на истинска връзка. Пълното решение иска истински
  // CommonMark + HTML parser и е отказано съзнателно — затова поне не мълчим:
  // всяко разминаване между маските значи, че разпознаването на този файл не е
  // сигурно, и се съобщава веднъж, на първия различаващ се ред.
  const differsAt = lines.findIndex((_, i) => blind.redacted[i] !== aware.redacted[i]);
  if (differsAt !== -1) {
    problems.push({
      line: differsAt + 1,
      what: "смесени огради и HTML коментари — разпознаването не е сигурно",
    });
  }
  if (unclosed !== null) {
    problems.push({
      line: text.slice(0, unclosed).split("\n").length,
      what: "незатворен HTML коментар",
    });
  }
  return { text: out.join("\n"), problems };
}

// --- разпознаване на връзка в текста -----------------------------------

// [текст](цел) и ![alt](цел) — стандартен Markdown синтаксис, с граници:
//   - иска истински `[етикет]` (може да минава през редове) — само `](`
//     хващаше и `](` в HTML коментар и оттам поглъщаше до следващата
//     затваряща скоба, изяждайки истинската връзка между двете;
//   - етикетът допуска ЕДНА нива вложеност (`\[[^\[\]]*\]`), колкото стига
//     за стандартната значка `[![alt](img)](цел)`, но не е рекурсия: двойна
//     вложеност остава неразпозната, тоест шумна;
//   - адресът е или `<…>`, или низ без празно пространство и без скоби —
//     `[^)]+` поглъщаше и интервали, и края на коментара;
//   - незадължителното заглавие след адреса е в "…", '…' или (…) и НЕ влиза
//     в уловената група.
//
// Опашката (адрес + заглавие) е обща за двата израза, за да не се разминат.
// MD_INLINE_FLAT е същото с етикет без никакви скоби: нужен е като втори
// пробег, защото при значка първият израз хваща ВЪНШНАТА връзка и вътрешната
// `![alt](img)` остава вътре в съвпадението — без втория пробег целта на
// самото изображение би изчезнала тихо.
//
// Заглавието в кавички НЕ може да съдържа квадратна скоба, макар CommonMark да
// го позволява. Причината е находка от финалния преглед: `<!-- [old](https://
// example.com " --> [broken](/missing.html) <!-- ") -->` се четеше като ЕДНА
// връзка с дълго заглавие, което поглъщаше истинската връзка след края на
// коментара. Скоба в заглавието вече прави конструкцията неразпозната, тоест
// шумна, и вътрешната връзка се намира и проверява.
//
// Групата `open` е самата „(“ след етикета: от нейния индекс се смята точната
// позиция на разпознатото `](` (един знак преди нея). Отчитаме ПОЗИЦИИ, не
// диапазони — попадането в диапазон на съвпадение не доказва, че целта на
// това `](` е проверена.
const MD_TAIL = String.raw`(?<open>\()\s*(?<target><[^<>\n]*>|[^()\s]+)(?:\s+(?:"[^"\n\[\]]*"|'[^'\n\[\]]*'|\([^()\n]*\)))?\s*\)`;
const MD_INLINE = new RegExp(String.raw`\[(?:[^\[\]]|\[[^\[\]]*\])*\]` + MD_TAIL, "gd");
const MD_INLINE_FLAT = new RegExp(String.raw`\[[^\[\]]*\]` + MD_TAIL, "gd");
// Всяко `href=`/`src=` в текста; знакът ПРЕД името решава какво е то.
// Главните букви се изписват като класове, а не с флаг "i", нарочно: с "i"
// класът [a-z] хваща и знака Kelvin (U+212A) като "k", а тук всяко
// разхлабване на границите вече е плащано с тих пропуск.
const ATTR_START = /([Hh][Rr][Ee][Ff]|[Ss][Rr][Cc])\s*=\s*/g;

// Присъдата по знака пред името:
//   - празно пространство или начало на текста → кандидат за истински атрибут;
//   - `"`, `'` или `/` → ПРОБЛЕМ: `<a title="x"href=…>` и `<a/href=…>` са
//     невалиден маркъп, който досега изчезваше без диагностика;
//   - всичко друго (буква, цифра, тире, обратна кавичка…) → не е кандидат:
//     това е друго име (`data-href`), част от проза или `inline code`
//     (`` `href="/en/"` `` в план), не атрибут на реална позиция.
function attrBoundary(text, at) {
  if (at === 0) return "кандидат";
  const ch = text[at - 1];
  if (/\s/.test(ch)) return "кандидат";
  if (ch === '"' || ch === "'" || ch === "/") return "невалидна";
  return "чуждо";
}

// Ръчно сканиране вместо един regex: „разпознай или се оплаши“. Регулярен
// израз със `[^"]*` за стойност прескача край на таг и край на коментар —
// `<!-- href="https://example.com/ --> <a href="/missing.html">` минаваше за
// една външна връзка и изяждаше истинската. Тук стойността се приема само
// ако изглежда като адрес; иначе излиза проблем и сканирането продължава
// веднага след „=“, за да намери истинския атрибут по-надолу на същия ред.
//
// Връща { links: [{index, target}], problems: [{index, what}] }. index на
// връзка сочи самата стойност (не "href="), за да е верен редът при
// многоредов таг; index на проблем сочи „=“.
function htmlAttrMatches(text) {
  const links = [];
  const problems = [];
  ATTR_START.lastIndex = 0;
  let m;
  while ((m = ATTR_START.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    const eq = m.index + m[0].indexOf("=");
    const boundary = attrBoundary(text, m.index);
    if (boundary !== "кандидат") {
      if (boundary === "невалидна") {
        problems.push({ index: eq, what: `${name}=: невалидна граница на атрибут` });
      }
      ATTR_START.lastIndex = eq + 1;
      continue;
    }
    const valueStart = m.index + m[0].length; // след `\s*` подир „=“
    const quote = text[valueStart];
    if (quote !== '"' && quote !== "'") {
      problems.push({ index: eq, what: `${name}= без кавички — не се разпознава` });
      ATTR_START.lastIndex = eq + 1;
      continue;
    }
    const end = text.indexOf(quote, valueStart + 1);
    if (end === -1) {
      problems.push({ index: eq, what: `${name}= с незатворена кавичка` });
      ATTR_START.lastIndex = eq + 1;
      continue;
    }
    const value = text.slice(valueStart + 1, end);
    const other = quote === '"' ? "'" : '"';
    if (/[\s<>]/.test(value) || value.includes(other)) {
      problems.push({ index: eq, what: `${name}= стойност, която не изглежда като адрес` });
      ATTR_START.lastIndex = eq + 1;
      continue;
    }
    links.push({ index: valueStart + 1, target: value });
    ATTR_START.lastIndex = end + 1;
  }
  return { links, problems };
}

function extractTarget(raw) {
  const t = raw.trim();
  // <url с интервали> — рядка Markdown форма; заглавието вече не влиза в
  // уловената група, затова друго рязане не е нужно.
  if (t.startsWith("<") && t.endsWith(">")) return t.slice(1, -1);
  return t;
}

// Номер на реда (1-базиран), съдържащ дадена позиция в текста.
function buildLineIndex(text) {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}
function lineForIndex(offsets, idx) {
  let lo = 0,
    hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= idx) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

// Двете функции връщат { links, problems } — problems е това, което
// скриптът е видял, но не е разпознал като връзка. Никоя от двете не
// прескача тихо.
function findMarkdownLinks(text) {
  const { text: redacted, problems: fenceProblems } = redactFences(text);
  const offsets = buildLineIndex(redacted);
  const links = [];
  const problems = [...fenceProblems];
  // Точните позиции на разпознатите `](` — не диапазоните на съвпаденията.
  const recognized = new Set();
  for (const re of [MD_INLINE, MD_INLINE_FLAT]) {
    for (const m of redacted.matchAll(re)) {
      const bracket = m.indices.groups.open[0] - 1; // „](“ започва един знак преди „(“
      if (recognized.has(bracket)) continue; // обикновена връзка, хваната и от двата
      recognized.add(bracket);
      links.push({ line: lineForIndex(offsets, m.index), target: extractTarget(m.groups.target) });
    }
  }
  // Шумният край: всяко `](`, чиято позиция не е разпозната, изглежда като
  // Markdown връзка, но не е — съобщава се, не се прескача.
  for (let i = redacted.indexOf("]("); i !== -1; i = redacted.indexOf("](", i + 1)) {
    if (!recognized.has(i)) {
      problems.push({
        line: lineForIndex(offsets, i),
        what: "изглежда като Markdown връзка, но не се разпознава",
      });
    }
  }
  const attrs = htmlAttrMatches(redacted);
  for (const { index, target } of attrs.links) {
    links.push({ line: lineForIndex(offsets, index), target });
  }
  for (const { index, what } of attrs.problems) {
    problems.push({ line: lineForIndex(offsets, index), what });
  }
  return { links, problems };
}

function findHtmlLinks(text) {
  const offsets = buildLineIndex(text);
  const { links, problems } = htmlAttrMatches(text);
  return {
    links: links.map(({ index, target }) => ({ line: lineForIndex(offsets, index), target })),
    problems: problems.map(({ index, what }) => ({ line: lineForIndex(offsets, index), what })),
  };
}

// --- разрешаване спрямо файловата система (чувствително към регистъра) -

// fs.existsSync е нечувствителен към регистъра на macOS (APFS по подразбиране),
// но CI е Linux — тук проверяваме всеки сегмент от пътя през readdirSync,
// за да хванем разминаване в регистъра, което иначе минава локално, но пада в CI.
//
// "/" накрая на absPath пази изискването "трябва да е директория" — точно
// каквото файловата система би отговорила (ENOTDIR за "файл/").
function statCaseSensitive(root, absPath) {
  const mustBeDir = absPath.endsWith(sep);
  const rel = relative(root, absPath);
  if (rel.startsWith("..")) return null; // извън корена
  const segments = rel === "" ? [] : rel.split(sep).filter(Boolean);
  let cur = root;
  for (const seg of segments) {
    let entries;
    try {
      entries = readdirSync(cur);
    } catch {
      return null;
    }
    if (!entries.includes(seg)) return null;
    cur = join(cur, seg);
  }
  let st;
  try {
    st = statSync(cur);
  } catch {
    return null;
  }
  if (mustBeDir && !st.isDirectory()) return null; // "app.css/" сочи файл — ENOTDIR
  return st;
}

// Директория без "/" накрая, с "/" накрая или стигната по относителен път —
// и трите форми означават едно и също нещо: сървърът/файловата система би
// върнали index.html вътре. Ако него го няма, връзката е мъртва — без
// изключение по формата, в която е написана.
function isAlive(root, absPath) {
  const st = statCaseSensitive(root, absPath);
  if (!st) return false;
  if (st.isDirectory()) {
    const idx = statCaseSensitive(root, join(absPath, "index.html"));
    return !!idx && idx.isFile();
  }
  return st.isFile();
}

const EXTERNAL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/; // http:, https:, mailto:, tel:…

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // невалидна % последователност — пробвай суровия низ
  }
}

// --- един модел за адреса ------------------------------------------------
//
// ПРОЦЕНТНОТО КОДИРАНЕ НИКОГА НЕ СЪЗДАВА СТРУКТУРА. Това е семантиката на
// самия Worker (`url.pathname.startsWith("/api/")`, а `URL.pathname` запазва
// `%2F`) и е единственото правило тук. Две поправки подред в тази област
// чупеха съседа си, защото всяка гледаше по един случай; моделът ги решава
// наведнъж:
//   1. разделяне по СУРОВИТЕ „/“ — нищо декодирано не става разделител;
//   2. точков сегмент е този, чийто СУРОВ вид е "." или "..", или чието
//      декодиране дава точно тях (`%2e`, `%2E`, `%2e%2e`, `.%2e`, `%2e.`);
//   3. нормализиране над СУРОВИТЕ сегменти;
//   4. `/api/` се познава по СУРОВИЯ първи сегмент, буквално равен на "api"
//      — нито `api%2Fv1`, нито `%61pi` са "api", точно както ги сравнява и
//      Worker-ът; без слепване на низ и търсене на префикс в него;
//   5. крайната наклонена черта е БУЛЕВ ФЛАГ, носен през нормализирането —
//      `join` я губи, а тя носи изискването „трябва да е директория“;
//   6. декодиране ЧАК НАКРАЯ, сегмент по сегмент, само за пипането на
//      файловата система; сегмент, който не се декодира, остава суров.

// Връща "." , ".." или null.
function dotSegment(seg) {
  if (seg === "." || seg === "..") return seg;
  const decoded = safeDecode(seg);
  return decoded === "." || decoded === ".." ? decoded : null;
}

// Нормализира СУРОВИ сегменти върху начален стек. Връща null, ако ".."
// излиза над корена — това е проблем, не тихо разрешаване.
function normalizeSegments(base, rawSegments) {
  const out = [...base];
  for (const seg of rawSegments) {
    const dot = dotSegment(seg);
    if (dot === ".") continue;
    if (dot === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out;
}

// Връща { skip: "…" }, { path: "…абсолютен път…" } или { problem: "…" }.
function resolveTarget(target, sourceFile, siteDir, root) {
  let t = target.split("#")[0]; // котвата не се проверява
  t = t.split("?")[0]; // низът за заявка не участва в пътя
  if (t === "") return { skip: "same-page anchor" };
  // Външна схема — върху СУРОВИЯ низ: декодирането не бива да СЪЗДАВА схема.
  if (EXTERNAL_SCHEME.test(t)) return { skip: "external" };
  // `//host/path` е protocol-relative адрес, не локален файл.
  if (t.startsWith("//")) return { skip: "external" };

  const siteAbsolute = t.startsWith("/");
  const trailing = t.endsWith("/") && t !== "/"; // флаг, не знак в низа
  const rawSegments = t.split("/").filter((seg) => seg !== "");

  // Базата: сайт-абсолютният адрес тръгва от корена на сайта, относителният —
  // от директорията на файла, изразена в сегменти спрямо корена на дървото.
  const base = siteAbsolute
    ? []
    : relative(root, dirname(sourceFile)).split(sep).filter(Boolean);
  const out = normalizeSegments(base, rawSegments);
  if (out === null) {
    return {
      problem: siteAbsolute
        ? "адресът излиза над корена на сайта"
        : "адресът излиза над корена на дървото",
    };
  }

  // Маршрут на Worker-а, не файл — прескача се нарочно (проверка във
  // файловата система би излъгала). Условието е буквалният превод на
  // `pathname.startsWith("/api/")` върху сурови сегменти.
  if (siteAbsolute && out[0] === "api" && (out.length > 1 || trailing)) {
    return { skip: "api route" };
  }

  const dir = siteAbsolute ? siteDir : root;
  const path = join(dir, ...out.map(safeDecode)) + (trailing ? sep : "");
  return { path };
}
// --- главна проверка -----------------------------------------------------

// root: корена на дървото, което се проверява (истинското хранилище при
// пускане от CLI, временна фикстура при тестовете).
//
// Хвърля грешка (не връща тихо нули), ако не намери никакви файлове за
// проверка, или намери файлове, но нито една връзка в тях — и двете най-
// вероятно значат счупен/липсващ корен или счупен regex, не чисто дърво.
export function checkTree(root) {
  const siteDir = join(root, "site");
  const mdFiles = [
    existingFile(join(root, "README.md")),
    existingFile(join(root, "README.en.md")),
    existingFile(join(root, "CONTRIBUTING.md")),
    ...walk(join(root, "docs"), ".md"),
  ].filter(Boolean);
  const htmlFiles = walk(siteDir, ".html");

  if (mdFiles.length === 0 && htmlFiles.length === 0) {
    throw new Error(`няма намерени файлове за проверка под "${root}" — коренът липсва или е празен`);
  }

  const dead = [];
  const unparsable = [];
  let checked = 0;
  let externalSkipped = 0;
  let apiSkipped = 0;
  let anchorSkipped = 0;

  function record({ links, problems }, file) {
    for (const { line, what } of problems) {
      unparsable.push({ file: relative(root, file), line, what });
    }
    for (const { line, target } of links) {
      const r = resolveTarget(target, file, siteDir, root);
      if (r.problem) {
        unparsable.push({ file: relative(root, file), line, what: r.problem });
        continue;
      }
      if (r.skip === "external") {
        externalSkipped++;
        continue;
      }
      if (r.skip === "api route") {
        apiSkipped++;
        continue;
      }
      if (r.skip) {
        anchorSkipped++; // same-page anchor
        continue;
      }
      checked++;
      if (!isAlive(root, r.path)) {
        dead.push({ file: relative(root, file), line, target });
      }
    }
  }

  for (const file of mdFiles) {
    record(findMarkdownLinks(readFileSync(file, "utf8")), file);
  }
  for (const file of htmlFiles) {
    record(findHtmlLinks(readFileSync(file, "utf8")), file);
  }

  const totalFound = checked + externalSkipped + apiSkipped + anchorSkipped;
  if (totalFound + unparsable.length === 0) {
    throw new Error(
      `${mdFiles.length + htmlFiles.length} файла намерени под "${root}", но нито една връзка в тях`,
    );
  }

  return { mdFiles, htmlFiles, checked, dead, unparsable, externalSkipped, apiSkipped, anchorSkipped };
}

// --- CLI -------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const ROOT = join(import.meta.dirname, "..");
  let result;
  try {
    result = checkTree(ROOT);
  } catch (e) {
    console.error(`check:links: ${e.message}`);
    process.exit(1);
  }
  const { mdFiles, htmlFiles, checked, dead, unparsable, externalSkipped, apiSkipped } = result;

  if (dead.length > 0 || unparsable.length > 0) {
    if (dead.length > 0) {
      console.error(`Мъртви връзки (${dead.length}):`);
      for (const d of dead) console.error(`${d.file}:${d.line} → ${d.target}`);
    }
    if (unparsable.length > 0) {
      console.error(`Неразпознато (${unparsable.length}) — или адресът се поправя, или примерът влиза в ограден блок:`);
      for (const u of unparsable) console.error(`${u.file}:${u.line} → ${u.what}`);
    }
    process.exit(1);
  }

  console.log(
    `check:links — прегледани ${checked} вътрешни връзки в ${mdFiles.length} ` +
      `Markdown и ${htmlFiles.length} HTML файла ` +
      `(пропуснати: ${externalSkipped} външни, ${apiSkipped} /api/ маршрута). ` +
      `Всички са живи.`,
  );
}
