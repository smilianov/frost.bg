// history.js — чисти функции за интеграцията на историята в app.js. Без DOM
// (за разлика от renderChart/renderTable в chart.js), затова се тества
// директно, без фалшив document. `historyView()` е решението за какво се
// показва; `app.js` само го рисува — обръщане на избора на обхвата на
// графиката, на инициализацията на #lang-switch или на видимостта на
// празната клетка би развалило тест тук, не само в браузъра.
import { selectWindow, pair, seasonSummary, riskAfter, compareWindows, dayOfYear } from "./stats.js";
import { chartModel, toCsv } from "./chart.js";
import { formatMMDD, shareUrl, DEFAULT_WINDOW } from "./format.js";

function num(x) {
  if (x === null || x === undefined || x === "") return null; // Number(null)===0, Number("")===0 — не бива да минават за истински 0
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

const LAST_SPRING_DAY = dayOfYear("06-30");

// Ф4: „При нула използваеми години — недостъпно.“ riskAfter() връща null и
// за невъзможна/извън обхвата дата, и за нула използваеми години — двете не
// бива да се показват с едно и също съобщение (Ф2: трите състояния не се
// смесват). Датата се проверява отделно; ако е годна, останалото null пада
// само по причина на нулев знаменател. Числото при успех е самият резултат
// на riskAfter — не второ смятане по друга формула.
export function riskFor(rows, mmdd) {
  const day = dayOfYear(mmdd);
  if (day === null || day > LAST_SPRING_DAY) return "bad_date";
  const result = riskAfter(rows, mmdd);
  return result === null ? "unavailable" : result;
}

// Ф5/Ф2: коя година е в текущо избрания прозорец — за да се открои в
// графиката/таблицата, чиито обхват и мащаб остават фиксирани на пълните
// 30 години (Ф5: „Мащабът... не се променят при смяна на прозореца“).
export function inWindow(year, w) {
  return year >= w.from && year <= w.to;
}

// Ф4 + видимото съобщение за риска. `explicit` разграничава непипнати
// полета (редовете при смяна на прозорец/ново търсене не бива да мълчат
// с досадна грешка) от изрично натиснато "Сметни" с празни полета (тогава
// мълчанието е бъг — трябва да обясни защо, точно като невъзможна дата):
// - без дата, не изрично -> "empty" (нищо не се показва);
// - без дата, изрично -> "bad_date" (същото обяснение като невъзможна дата);
// - невъзможна/извън обхвата -> "bad_date"; годна дата, нула използваеми
//   години -> "unavailable"; иначе резултатът, с бележката за малка извадка
//   и с видимото изречение за 29 февруари (Ф4: сгъването е видимо, не тихо,
//   и се пише независимо от изхода — resultOK или unavailable).
// `focus: true` само при изрично изчисление (за фокус-прехвърлянето в
// app.js — #status остава единствената aria-live област, риск-резултатът
// се обявява чрез преместен фокус, не чрез собствен aria-live).
// Чист израз на (rows, riskInput, explicit) — никакво "последно показано"
// състояние за пазене никъде, затова смяната на прозореца не може да остави
// стар отговор.
export function classifyRisk(rows, withData, riskInput, t, lang, explicit = false) {
  const dayStr = String(riskInput?.day ?? "").trim();
  const monthStr = String(riskInput?.month ?? "").trim();
  if (!dayStr && !monthStr) {
    if (!explicit) return { state: "empty", message: "", focus: false };
    return { state: "bad_date", message: t.risk_bad_date, focus: true };
  }
  const day = Number(dayStr), month = Number(monthStr);
  const mmdd = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const outcome = riskFor(rows, mmdd);
  if (outcome === "bad_date") return { state: "bad_date", message: t.risk_bad_date, focus: explicit };
  let message;
  if (outcome === "unavailable") {
    message = t.risk_unavailable;
  } else {
    message = `${t.risk_result(outcome.count, outcome.total, formatMMDD(mmdd, lang), outcome.percent)} ${t.risk_disclaimer}`;
    if (withData < 10) message += ` ${t.risk_small_sample}`;
  }
  if (day === 29 && month === 2) message += ` ${t.risk_feb29_note}`;
  return { state: outcome === "unavailable" ? "unavailable" : "result", message, focus: explicit };
}

// Ф7: #lang-switch носи прозореца независимо от координатите — с координати
// целият shareUrl("", …), без тях само "?window=" (нищо при подразбиращия
// се). Отделна от адреса на историята (updateUrl() в app.js), която има
// смисъл само с координати.
export function langSwitchQuery(lat, lon, window) {
  return lat !== null && lon !== null
    ? shareUrl("", lat, lon, window)
    : (window !== DEFAULT_WINDOW ? `?window=${window}` : "");
}

// historyView(): цялото решение какво се показва в #history — app.js само
// го рисува (DOM, renderChart/renderTable, Blob). Ф2's три състояния не се
// смесват: липсващ period.end крие цялата секция (нямаме календар); years:
// [] показва секцията с обяснение (Ф2: "не е записана слана" != "нямаме
// нищо"); редове без записана слана из графиката/таблицата, самите те, не
// разчитат никаква скрита стъпка.
export function historyView({ data, window, lang, t, riskInput, explicitRisk }) {
  const years = Array.isArray(data?.years) ? data.years : [];
  const periodEnd = num(data?.period?.end);
  if (periodEnd === null) return { visible: false };
  if (!years.length) return { visible: true, empty: true, message: t.no_history };

  // Ф5: графиката/таблицата пазят пълния 30-годишен обхват; само числата
  // над тях (двойките, сезонът, рискът) следват избрания прозорец `w`.
  const full = selectWindow(years, periodEnd, DEFAULT_WINDOW);
  const w = selectWindow(years, periodEnd, window);
  const p = pair(w.rows);
  const cmp = compareWindows(years, periodEnd);
  const seasonData = seasonSummary(w.rows);
  const model = chartModel(full.rows, { from: full.from, to: full.to });
  const cellLat = data?.cell?.lat, cellLon = data?.cell?.lon;

  const compareParts = [];
  if (cmp.spring) {
    compareParts.push(t.compare_spring(
      formatMMDD(cmp.full.typical.last_spring, lang), formatMMDD(cmp.recent.typical.last_spring, lang),
      cmp.spring.days, cmp.spring.direction,
    ));
  }
  if (cmp.autumn) {
    compareParts.push(t.compare_autumn(
      formatMMDD(cmp.full.typical.first_autumn, lang), formatMMDD(cmp.recent.typical.first_autumn, lang),
      cmp.autumn.days, cmp.autumn.direction,
    ));
  }

  // Преглед/полир: "най-къс: години: 2020" повтаряше етикета — една фраза
  // на година, без отделен "години:" отпред.
  //
  // Преглед (последна вълна): "няма данни за тази клетка" (t.no_history) е
  // вярно само когато цялата клетка е без ред (клонът по-горе). Ред извън
  // избрания прозорец дава w.rows == [] тук, но клетката НЕ е без данни —
  // графиката/таблицата/CSV-то (от `full`) си ги показват; текстът трябва
  // да казва точно това: празен е избраният период, не клетката.
  const seasonText = !seasonData ? t.no_data_in_window : [
    t.season_summary(seasonData.typical, seasonData.shortest.days, seasonData.longest.days),
    t.season_shortest_years(seasonData.shortest.years),
    t.season_longest_years(seasonData.longest.years),
    ...(seasonData.clipped > 0 ? [t.season_clipped] : []),
  ].join(" · ");

  // Ф4: изречението до сигурната дата — трайно, отделно от калкулатора за риск.
  let safeMeans = "";
  if (p.safe.last_spring) {
    const safeRisk = riskAfter(w.rows, p.safe.last_spring);
    if (safeRisk) safeMeans = t.safe_means(safeRisk.count, safeRisk.total, formatMMDD(p.safe.last_spring, lang));
  }

  // Ф5: морска клетка (без нито един ред в 30-годишния обхват) — различно
  // от Ф2's "редовете ги има, но никъде не е записана слана".
  const chartEmpty = full.rows.length === 0;
  const chartAllNull = !chartEmpty && model.empty;

  const tooFewYears = p.typical.last_spring === null || p.typical.first_autumn === null;

  return {
    visible: true, empty: false,
    windowNote: t.window_note(w.from, w.to, w.withData, window),
    pairs: {
      typicalSpring: formatMMDD(p.typical.last_spring, lang),
      typicalAutumn: formatMMDD(p.typical.first_autumn, lang),
      safeSpring: formatMMDD(p.safe.last_spring, lang),
      safeAutumn: formatMMDD(p.safe.first_autumn, lang),
      tooFewYears,
      tooFewYearsMessage: tooFewYears ? t.too_few_years : "",
    },
    compare: compareParts.join(" · "),
    season: seasonText,
    safeMeans,
    chart: {
      model, rows: full.rows, from: full.from, to: full.to,
      selectedFrom: w.from, selectedTo: w.to,
      empty: chartEmpty, allNull: chartAllNull,
      message: chartEmpty ? t.no_history : (chartAllNull ? t.no_frost_any : null),
      title: t.chart_title(cellLat ?? "—", cellLon ?? "—", full.from, full.to),
    },
    csv: toCsv(full.rows, { lat: cellLat, lon: cellLon, period: data?.period, source: data?.source?.[lang] }),
    csvFilename: `frost-bg-${cellLat}-${cellLon}.csv`,
    risk: classifyRisk(w.rows, w.withData, riskInput, t, lang, explicitRisk),
  };
}
