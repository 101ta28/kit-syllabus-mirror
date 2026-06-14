import fs from "node:fs/promises";
import path from "node:path";
import { parseHTML } from "linkedom";

process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= "0";

const baseUrl = "https://europa.kanazawa-it.ac.jp";
const sourceUrl = `${baseUrl}/opsyllabus/kitos0100/0`;
const root = process.cwd();
const searchSourcePath = path.resolve(root, process.env.SEARCH_SOURCE_PATH ?? "../europa-syllabus-search-detail.json");
const languageType = String(process.env.LANGUAGE_TYPE ?? "0");
const languageSuffix = languageType === "1" ? "-en" : "";
const cachePath = path.resolve(root, process.env.CACHE_PATH ?? `data/syllabus-details-cache${languageSuffix}.json`);
const batchSize = Number(process.env.BATCH_SIZE ?? 20);

const cookies = new Map();

function storeCookies(headers) {
  const setCookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  for (const value of setCookies) {
    const [pair] = value.split(";");
    const [key] = pair.split("=");
    cookies.set(key, pair);
  }
}

function cookieHeader() {
  return [...cookies.values()].join("; ");
}

function extractMeta(html, name) {
  const marker = `<meta name="${name}" content="`;
  const start = html.indexOf(marker);
  if (start < 0) return "";
  const valueStart = start + marker.length;
  const valueEnd = html.indexOf('"', valueStart);
  return valueEnd < 0 ? "" : html.slice(valueStart, valueEnd);
}

function extractInitialJson(html) {
  const marker = '<input type="hidden" name="json" value="';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("Initial search condition JSON was not found.");
  const valueStart = start + marker.length;
  const valueEnd = html.indexOf('"', valueStart);
  if (valueEnd < 0) throw new Error("Initial search condition JSON was not closed.");
  return JSON.parse(html.slice(valueStart, valueEnd).replace(/'/g, '"'));
}

async function readExisting() {
  if (process.env.FORCE === "1") return [];
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {
    return [];
  }
}

async function writeCache(details) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  details.sort((a, b) => a.sourceIndex - b.sourceIndex);
  await fs.writeFile(cachePath, JSON.stringify(details, null, 2), "utf8");
}

function normalizeText(text) {
  return String(text ?? "")
    .replace(/[\uff61-\uff9f]+/g, (value) => value.normalize("NFKC"))
    .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textOf(element) {
  return normalizeText(element?.innerText ?? element?.textContent ?? "");
}

function tableRows(document) {
  return Array.from(document.querySelectorAll("table tr")).map((row) => ({
    className: row.className,
    cells: Array.from(row.children)
      .filter((cell) => ["TD", "TH"].includes(cell.tagName))
      .map((cell) => ({
        tag: cell.tagName,
        className: cell.className,
        text: textOf(cell),
      })),
  }));
}

function hasClass(cell, className) {
  return String(cell?.className ?? "").split(/\s+/).includes(className);
}

function cellText(row, className) {
  return normalizeText(row?.cells?.find((cell) => hasClass(cell, className))?.text ?? "");
}

function firstRowByCellClass(rows, className) {
  return rows.find((row) => row.cells?.some((cell) => hasClass(cell, className)));
}

function rowsBetweenClass(rows, startClass, endClasses = []) {
  const start = rows.findIndex((row) => row.cells?.some((cell) => hasClass(cell, startClass)));
  if (start < 0) return [];
  const end = rows.findIndex((row, index) => index > start && row.cells?.some((cell) => endClasses.some((className) => hasClass(cell, className))));
  return rows.slice(start + 1, end < 0 ? rows.length : end);
}

function rowsAfterHeader(rows, headerText, untilHeaderTexts = []) {
  const start = rows.findIndex((row) => row.cells?.some((cell) => normalizeText(cell.text) === headerText));
  if (start < 0) return [];
  const end = rows.findIndex((row, index) => index > start && row.cells?.some((cell) => untilHeaderTexts.includes(normalizeText(cell.text))));
  return rows.slice(start + 1, end < 0 ? rows.length : end);
}

function extractSingleSection(rows, headerText, untilHeaderTexts = []) {
  return normalizeText(
    rowsAfterHeader(rows, headerText, untilHeaderTexts)
      .flatMap((row) => row.cells ?? [])
      .map((cell) => cell.text)
      .filter(Boolean)
      .join("\n"),
  );
}

function extractSingleSectionByClass(rows, startClass, endClasses = []) {
  return normalizeText(
    rowsBetweenClass(rows, startClass, endClasses)
      .flatMap((row) => row.cells ?? [])
      .map((cell) => cell.text)
      .filter(Boolean)
      .join("\n"),
  );
}

function splitTeachers(text) {
  return normalizeText(text)
    .replace("＊印は、実務経験のある教員を示しています。", "")
    .split(/[、,\n]/)
    .map((teacher) => teacher.trim())
    .filter((teacher) => teacher !== "授業科目の学習・教育目標" && teacher !== "担当教員名")
    .filter(Boolean);
}

function splitKeywords(text) {
  return normalizeText(text)
    .split(/\n+/)
    .map((line) => line.replace(/^\d+\./, "").trim())
    .filter((line) => line !== "キーワード" && line !== "Keywords")
    .filter(Boolean);
}

function extractActivityGoals(rows) {
  return rowsAfterHeader(rows, "学生が達成すべき行動目標", ["達成度評価"])
    .filter((row) => row.cells?.some((cell) => String(cell.className).includes("activityGoalLabel")))
    .map((row) => ({
      index: cellText(row, "activityGoalIndexLabel"),
      type: cellText(row, "activityGoalType"),
      body: cellText(row, "activityGoalLabel"),
    }))
    .filter((goal) => goal.index && goal.body);
}

function extractEvaluationWeights(rows) {
  const methodHeader = rows.find((row) => row.className === "method");
  const labels = methodHeader?.cells?.map((cell) => normalizeText(cell.text).replace(/\n/g, " ")) ?? [];
  return rows
    .filter((row) => row.cells?.some((cell) => String(cell.className).includes("rate")))
    .slice(0, 6)
    .map((row) => {
      const nonRate = row.cells.filter((cell) => !String(cell.className).includes("rate")).map((cell) => normalizeText(cell.text)).filter(Boolean);
      return {
        label: nonRate.join(" / ") || "総合評価割合",
        values: row.cells.filter((cell) => String(cell.className).includes("rate")).map((cell) => normalizeText(cell.text)),
        columns: labels,
      };
    });
}

function extractAchievementLevels(rows) {
  const sectionRows = rowsAfterHeader(rows, "具体的な達成の目安", ["ＣＬＩＰ学習プロセスについて"]);
  const header = sectionRows.find((candidate) => candidate.cells?.length >= 2 && candidate.cells.some((cell) => normalizeText(cell.text).includes("理想的")));
  const valueRow = sectionRows.find((candidate) => candidate.cells?.length >= 2 && candidate !== header);
  return {
    ideal: normalizeText(valueRow?.cells?.[0]?.text ?? ""),
    standard: normalizeText(valueRow?.cells?.[1]?.text ?? ""),
  };
}

function extractLessons(rows) {
  const start = rows.findIndex((row) => row.cells?.some((cell) => normalizeText(cell.text) === "授業明細"));
  if (start < 0) return [];
  return rows
    .slice(start + 2)
    .filter((row) => {
      const first = row.cells?.[0];
      const firstText = normalizeText(first?.text ?? "");
      const firstClass = String(first?.className ?? "");
      return firstText && firstText !== "回数" && (firstText.startsWith("第") || firstClass.includes("nth"));
    })
    .map((row) => ({
      index: normalizeText(row.cells[0]?.text ?? ""),
      content: normalizeText(row.cells[1]?.text ?? ""),
      operation: normalizeText(row.cells[2]?.text ?? ""),
      assignments: normalizeText(row.cells[3]?.text ?? ""),
      minutes: normalizeText(row.cells[4]?.text ?? ""),
    }));
}

function parseDetail(html, sourceIndex, sourcePath) {
  const { document } = parseHTML(html);
  const rows = tableRows(document);
  const basicRow = firstRowByCellClass(rows, "courseName");
  const goalRows = rowsBetweenClass(rows, "keywords", ["abstractAndAdvice"]);
  const keywordText = goalRows
    .flatMap((row) => row.cells ?? [])
    .filter((cell) => hasClass(cell, "keywords") && cell.tag !== "TH")
    .map((cell) => cell.text)
    .filter(Boolean)
    .join("\n");
  const educationalGoal = goalRows
    .flatMap((row) => row.cells ?? [])
    .filter((cell) => hasClass(cell, "educationalGoal") && cell.tag !== "TH")
    .map((cell) => cell.text)
    .filter(Boolean)
    .join("\n");
  const courseNameParts = cellText(basicRow, "courseName").split("\n");
  return {
    sourceIndex,
    sourceUrl: sourcePath,
    importedAt: new Date().toISOString(),
    title: normalizeText(courseNameParts[0] ?? ""),
    subtitle: normalizeText(courseNameParts.slice(1).join(" ")),
    courseType: cellText(basicRow, "courseType"),
    credits: cellText(basicRow, "credits"),
    term: cellText(basicRow, "courseTerm"),
    method: cellText(basicRow, "method"),
    teachers: splitTeachers(extractSingleSectionByClass(rows, "teacherNames", ["keywords", "educationalGoal", "abstractAndAdvice"])),
    keywords: splitKeywords(keywordText),
    educationalGoal: normalizeText(educationalGoal),
    advice: extractSingleSectionByClass(rows, "abstractAndAdvice", ["reservedBook"]),
    books: extractSingleSectionByClass(rows, "reservedBook", ["requiredKnowledge"]),
    requiredKnowledge: extractSingleSectionByClass(rows, "requiredKnowledge", ["activityGoal"]),
    activityGoals: extractActivityGoals(rows),
    evaluationWeights: extractEvaluationWeights(rows),
    achievementLevels: extractAchievementLevels(rows),
    clipProcess: extractSingleSection(rows, "ＣＬＩＰ学習プロセスについて", ["授業明細"]) || extractSingleSection(rows, "CLIP Learning Process", ["Course Schedule"]),
    lessons: extractLessons(rows),
    rawText: normalizeText(textOf(document.body)).slice(0, 4000),
  };
}

async function initializeSession(year) {
  const initialResponse = await fetch(sourceUrl);
  storeCookies(initialResponse.headers);
  if (!initialResponse.ok) {
    throw new Error(`Failed to load search page: ${initialResponse.status} ${initialResponse.statusText}`);
  }
  const html = await initialResponse.text();
  const csrfToken = extractMeta(html, "_csrf");
  const csrfHeader = extractMeta(html, "_csrf_header") || "X-CSRF-TOKEN";
  const initialJson = extractInitialJson(html);
  const yearIndex = String(initialJson.yearSet.indexOf(year));
  if (yearIndex === "-1") {
    throw new Error(`Course year ${year} is not available. Available years: ${initialJson.yearSet.join(", ")}`);
  }
  const resultResponse = await fetch(`${baseUrl}/opsyllabus/kitos0100/kitos010001/results`, {
    method: "POST",
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/json",
      "x-requested-with": "XMLHttpRequest",
      referer: sourceUrl,
      cookie: cookieHeader(),
      [csrfHeader]: csrfToken,
    },
    body: JSON.stringify({
      languageType,
      yearIndex,
      semesterIndex: "",
      programDepartmentNameIndex: "",
      courseName: "",
      courseCode: "",
      fuzzyKeywordRawString: "",
      fuzzyKeywordsCondition: "AND",
      practicalTeacherCourse: "INCLUDE",
    }),
  });
  storeCookies(resultResponse.headers);
  if (!resultResponse.ok) {
    throw new Error(`Failed to initialize search results: ${resultResponse.status} ${resultResponse.statusText}`);
  }
}

async function fetchDetail(index) {
  const sourcePath = `/opsyllabus/kitos0110/${index}/${languageType}`;
  try {
    const response = await fetch(`${baseUrl}${sourcePath}`, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        cookie: cookieHeader(),
        referer: sourceUrl,
      },
    });
    storeCookies(response.headers);
    const html = await response.text();
    if (!response.ok || !html.includes("courseName")) {
      return { sourceIndex: index, sourceUrl: sourcePath, error: `${response.status} detail page not available` };
    }
    return parseDetail(html, index, sourcePath);
  } catch (error) {
    return { sourceIndex: index, sourceUrl: sourcePath, error: String(error?.message ?? error) };
  }
}

const searchSource = JSON.parse(await fs.readFile(searchSourcePath, "utf8"));
const courses = JSON.parse(searchSource.resultsBody);
const total = courses.length;
const targetYear = String(courses[0]?.yearLabel ?? process.env.COURSE_YEAR ?? "2026");

await initializeSession(targetYear);

const detailsByIndex = new Map((await readExisting()).map((detail) => [detail.sourceIndex, detail]));
console.log(`Starting HTTP detail scrape: ${detailsByIndex.size}/${total} cached; year=${targetYear}; languageType=${languageType}`);

for (let start = 0; start < total; start += batchSize) {
  const indexes = [];
  for (let index = start; index < Math.min(start + batchSize, total); index++) {
    if (!detailsByIndex.has(index)) indexes.push(index);
  }
  if (!indexes.length) continue;
  const batch = await Promise.all(indexes.map((index) => fetchDetail(index)));
  for (const detail of batch) {
    detailsByIndex.set(detail.sourceIndex, detail);
  }
  await writeCache([...detailsByIndex.values()]);
  console.log(`Cached ${detailsByIndex.size}/${total}`);
}

const details = [...detailsByIndex.values()];
const errors = details.filter((detail) => detail.error).length;
console.log(`Finished HTTP detail scrape: ${details.length}/${total}; errors=${errors}`);
