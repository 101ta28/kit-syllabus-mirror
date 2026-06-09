import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.resolve(root, "../europa-syllabus-search-detail.json");
const detailCachePath = path.resolve(root, "data/syllabus-details-cache.json");
const englishDetailCachePath = path.resolve(root, "data/syllabus-details-cache-en.json");
const outputPath = path.resolve(root, "src/data/generated.ts");
const searchIndexOutputPath = path.resolve(root, "public/search-index.json");
const detailsOutputDir = path.resolve(root, "public/details");
const englishDetailsOutputDir = path.resolve(root, "public/details-en");

const knownCourseSlugs = new Map([
  ["修学基礎Ａ", "shugaku-kiso-a"],
  ["修学基礎Ｂ", "shugaku-kiso-b"],
  ["技術者と持続可能社会", "engineers-and-sustainable-society"],
  ["日本学（日本と日本人）Ａ", "japanese-studies-a"],
]);

function semesterSlug(label) {
  if (label.includes("前")) return "spring";
  if (label.includes("後")) return "fall";
  if (label.includes("通")) return "full-year";
  return "term-" + stableAscii(label);
}

function stableAscii(text) {
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function slugifyCourseName(name) {
  const known = knownCourseSlugs.get(name);
  if (known) return known;
  const ascii = name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return ascii || `course-${stableAscii(name)}`;
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

function firstRowByCellClass(rows, className) {
  return rows.find((row) => row.cells?.some((cell) => String(cell.className).split(/\s+/).includes(className)));
}

function cellText(row, className) {
  return normalizeText(row?.cells?.find((cell) => String(cell.className).split(/\s+/).includes(className))?.text ?? "");
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

function extractActivityGoals(rows) {
  const bodyRows = rowsAfterHeader(rows, "学生が達成すべき行動目標", ["達成度評価"]);
  return bodyRows
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
  const row = sectionRows.find((candidate) => candidate.cells?.length >= 2 && candidate.cells.some((cell) => normalizeText(cell.text).includes("理想的")));
  const valueRow = sectionRows.find((candidate) => candidate.cells?.length >= 2 && candidate !== row);
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

function parseCredits(value) {
  const numeric = Number(normalizeText(value).match(/\d+(?:\.\d+)?/)?.[0] ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function creditCategoryFor(detail, course) {
  const courseType = normalizeText(detail?.courseType ?? "");
  const name = normalizeText(course?.courseName ?? detail?.title ?? "");
  if (courseType.includes("修学基礎科目")) return "shugaku";
  if (courseType.includes("生涯スポーツ")) return "sports";
  if (courseType.includes("英語教育課程")) return "english";
  if (courseType.includes("数理") && courseType.includes("数理基礎")) return "math";
  if (courseType.includes("基礎実技") || courseType.includes("PD基礎")) return "basicPractice";
  if (courseType.includes("専門プロジェクト")) return "specializedProject";
  if (courseType.includes("専門教育課程") && courseType.includes("専門科目")) return "specialized";
  if (name.includes("科学技術者倫理") || name.includes("技術者と持続可能社会")) return "ethics";
  if (courseType.includes("リベラルアーツ") || courseType.includes("人間形成基礎")) return "humanities";
  return "other";
}

function collectSearchParts(value, parts = []) {
  if (typeof value === "string") {
    parts.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectSearchParts(item, parts);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (!["rawText", "sourceUrl", "importedAt", "courseId", "sourceIndex", "language"].includes(key)) {
        collectSearchParts(item, parts);
      }
    }
  }
  return parts;
}

function buildSearchText(course, detail) {
  return normalizeText([
    course.courseName,
    course.courseCodeLabel,
    course.programLabel,
    course.departmentLabel ?? "",
    course.courseType ?? "",
    ...collectSearchParts(detail),
  ].join("\n")).toLowerCase();
}

function buildDetail(detailDom, firstCourse) {
  const rows = detailDom.rows ?? [];
  const basicRow = firstRowByCellClass(rows, "courseName");
  const goalRows = rowsAfterHeader(rows, "授業科目の学習・教育目標", ["授業の概要および学習上の助言"]);
  const keywordText = goalRows.map((row) => cellText(row, "keywords")).filter(Boolean).join("\n");
  const educationalGoal = goalRows.map((row) => cellText(row, "educationalGoal")).filter(Boolean).join("\n");
  const detail = {
    courseId: firstCourse.id,
    sourceUrl: detailDom.url,
    importedAt: new Date().toISOString(),
    title: firstCourse.courseName,
    subtitle: cellText(basicRow, "courseName").split("\n").slice(1).join(" "),
    courseType: cellText(basicRow, "courseType"),
    credits: cellText(basicRow, "credits"),
    term: cellText(basicRow, "courseTerm"),
    method: cellText(basicRow, "method"),
    teachers: splitTeachers(extractSingleSection(rows, "担当教員名", ["授業科目の学習・教育目標"])),
    keywords: splitKeywords(keywordText),
    educationalGoal: normalizeText(educationalGoal),
    advice: extractSingleSection(rows, "授業の概要および学習上の助言", ["教科書および参考書・リザーブドブック"]),
    books: extractSingleSection(rows, "教科書および参考書・リザーブドブック", ["履修に必要な予備知識や技能"]),
    requiredKnowledge: extractSingleSection(rows, "履修に必要な予備知識や技能", ["学生が達成すべき行動目標"]),
    activityGoals: extractActivityGoals(rows),
    evaluationWeights: extractEvaluationWeights(rows),
    achievementLevels: extractAchievementLevels(rows),
    clipProcess: extractSingleSection(rows, "ＣＬＩＰ学習プロセスについて", ["授業明細"]),
    lessons: extractLessons(rows),
    rawText: normalizeText(detailDom.visibleTextSample),
  };
  return detail;
}

function toCourse(raw, index) {
  const courseName = normalizeText(raw.courseName);
  const courseNameSlug = slugifyCourseName(courseName);
  const semSlug = semesterSlug(raw.semesterLabel ?? "");
  const id = [
    raw.yearLabel,
    semSlug,
    raw.courseCodeLabel,
    raw.languageType ?? "0",
    index,
  ].join(":");
  return {
    id,
    schoolType: Number(raw.schoolType ?? 0),
    yearLabel: String(raw.yearLabel ?? ""),
    semester: String(raw.semester ?? ""),
    semesterLabel: String(raw.semesterLabel ?? ""),
    semesterSlug: semSlug,
    curriculumYear: String(raw.curriculumYear ?? ""),
    courseCode: String(raw.courseCode ?? ""),
    courseCodeDetail1: String(raw.courseCodeDetail1 ?? ""),
    courseCodeDetail2: String(raw.courseCodeDetail2 ?? ""),
    languageType: String(raw.languageType ?? "0"),
    courseName,
    courseNameSlug,
    programLabel: normalizeText(raw.programLabel),
    departmentLabel: raw.departmentLabel == null ? null : normalizeText(raw.departmentLabel),
    courseCategoryLabel: raw.courseCategoryLabel == null ? null : normalizeText(raw.courseCategoryLabel),
    courseCodeLabel: String(raw.courseCodeLabel ?? ""),
    credits: 0,
    courseType: "",
    creditCategory: "other",
    searchText: "",
    hasPracticalTeacher: false,
    sourceIndex: index,
    hasDetail: false,
    hasEnglishDetail: false,
    detailPath: null,
    englishDetailPath: null,
    detailPaths: {
      ja: null,
      en: null,
    },
    routePath: `/courses/${raw.yearLabel}/${semSlug}/${raw.courseCodeLabel}`,
  };
}

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const rawCourses = JSON.parse(source.resultsBody);
const courses = rawCourses.map(toCourse);
let details = [];
try {
  details = JSON.parse(await fs.readFile(detailCachePath, "utf8"));
} catch {
  details = [{ sourceIndex: 0, ...buildDetail(source.detailDom, courses[0]) }];
}
let englishDetails = [];
try {
  englishDetails = JSON.parse(await fs.readFile(englishDetailCachePath, "utf8"));
} catch {
  englishDetails = [];
}

await fs.rm(detailsOutputDir, { recursive: true, force: true });
await fs.rm(englishDetailsOutputDir, { recursive: true, force: true });
await fs.mkdir(detailsOutputDir, { recursive: true });
await fs.mkdir(englishDetailsOutputDir, { recursive: true });
const validDetails = [];
async function writeDetailsForLanguage(detailList, language, outputDir) {
  const valid = [];
  for (const detail of detailList) {
  const sourceIndex = Number(detail.sourceIndex ?? 0);
  const course = courses[sourceIndex];
  if (!course || detail.error) continue;
  const normalizedDetail = {
    ...detail,
    sourceIndex,
    courseId: course.id,
    language,
    title: detail.title || course.courseName,
  };
  const filename = `${sourceIndex}.json`;
  await fs.writeFile(path.join(outputDir, filename), JSON.stringify(normalizedDetail, null, 2), "utf8");
  const publicPath = language === "en" ? `/details-en/${filename}` : `/details/${filename}`;
  if (language === "en") {
    course.hasEnglishDetail = true;
    course.englishDetailPath = publicPath;
    course.detailPaths.en = publicPath;
  } else {
    course.hasDetail = true;
    course.detailPath = publicPath;
    course.detailPaths.ja = publicPath;
    course.credits = parseCredits(normalizedDetail.credits);
    course.courseType = normalizeText(normalizedDetail.courseType);
    course.creditCategory = creditCategoryFor(normalizedDetail, course);
    course.searchText = buildSearchText(course, normalizedDetail);
    course.hasPracticalTeacher = normalizedDetail.teachers?.some((teacher) => String(teacher).includes("＊")) ?? false;
  }
  valid.push(normalizedDetail);
  }
  return valid;
}
validDetails.push(...await writeDetailsForLanguage(details, "ja", detailsOutputDir));
const validEnglishDetails = await writeDetailsForLanguage(englishDetails, "en", englishDetailsOutputDir);

const generated = `export interface CourseSummary {
  id: string;
  schoolType: number;
  yearLabel: string;
  semester: string;
  semesterLabel: string;
  semesterSlug: string;
  curriculumYear: string;
  courseCode: string;
  courseCodeDetail1: string;
  courseCodeDetail2: string;
  languageType: string;
  courseName: string;
  courseNameSlug: string;
  programLabel: string;
  departmentLabel: string | null;
  courseCategoryLabel: string | null;
  courseCodeLabel: string;
  credits: number;
  courseType: string;
  creditCategory: string;
  hasPracticalTeacher: boolean;
  sourceIndex: number;
  hasDetail: boolean;
  hasEnglishDetail: boolean;
  detailPath: string | null;
  englishDetailPath: string | null;
  detailPaths: {
    ja: string | null;
    en: string | null;
  };
  routePath: string;
}

export interface SyllabusDetail {
  sourceIndex: number;
  courseId: string;
  language?: "ja" | "en";
  sourceUrl: string;
  importedAt: string;
  title: string;
  subtitle?: string;
  courseType: string;
  credits: string;
  term: string;
  method: string;
  teachers: string[];
  keywords: string[];
  educationalGoal: string;
  advice: string;
  books: string;
  requiredKnowledge: string;
  activityGoals: Array<{ index: string; type: string; body: string }>;
  evaluationWeights: Array<{ label: string; values: string[]; columns?: string[] }>;
  achievementLevels: { ideal: string; standard: string };
  clipProcess: string;
  lessons: Array<{
    index: string;
    content: string;
    operation: string;
    assignments: string;
    minutes: string;
  }>;
  rawText: string;
}

export const courses: CourseSummary[] = ${JSON.stringify(courses.map(({ searchText, ...course }) => course), null, 2)};
`;

await fs.writeFile(outputPath, generated, "utf8");
await fs.writeFile(searchIndexOutputPath, JSON.stringify(Object.fromEntries(courses.map((course) => [course.id, course.searchText ?? ""]))), "utf8");
console.log(`Generated ${courses.length} courses, ${validDetails.length} Japanese detail pages, and ${validEnglishDetails.length} English detail pages.`);
console.log(`Example route: ${courses[0].routePath}`);
