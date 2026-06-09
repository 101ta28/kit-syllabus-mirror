import fs from "node:fs/promises";
import path from "node:path";

process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= "0";

const baseUrl = "https://europa.kanazawa-it.ac.jp";
const sourceUrl = `${baseUrl}/opsyllabus/kitos0100/0`;
const outputPath = path.resolve(process.cwd(), "../europa-syllabus-search-detail.json");
const year = String(process.env.COURSE_YEAR ?? "2026");
const languageType = String(process.env.LANGUAGE_TYPE ?? "0");

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

const initialResponse = await fetch(sourceUrl);
storeCookies(initialResponse.headers);
if (!initialResponse.ok) {
  throw new Error(`Failed to load search page: ${initialResponse.status} ${initialResponse.statusText}`);
}

const html = await initialResponse.text();
const csrfToken = extractMeta(html, "_csrf");
const csrfHeader = extractMeta(html, "_csrf_header") || "X-CSRF-TOKEN";
if (!csrfToken) {
  throw new Error("CSRF token was not found in the search page.");
}

const initialJson = extractInitialJson(html);
const yearIndex = String(initialJson.yearSet.indexOf(year));
if (yearIndex === "-1") {
  throw new Error(`Course year ${year} is not available. Available years: ${initialJson.yearSet.join(", ")}`);
}

const payload = {
  languageType,
  yearIndex,
  semesterIndex: "",
  programDepartmentNameIndex: "",
  courseName: "",
  courseCode: "",
  fuzzyKeywordRawString: "",
  fuzzyKeywordsCondition: "AND",
  practicalTeacherCourse: "INCLUDE",
};

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
  body: JSON.stringify(payload),
});

storeCookies(resultResponse.headers);
const body = await resultResponse.text();
if (!resultResponse.ok) {
  throw new Error(`Failed to fetch results: ${resultResponse.status} ${resultResponse.statusText}\n${body.slice(0, 500)}`);
}

const parsed = JSON.parse(body);
const result = Array.isArray(parsed) ? { resultsBody: JSON.stringify(parsed) } : parsed;
if (!result.resultsBody) {
  throw new Error(`Unexpected results response keys: ${Object.keys(result).join(", ")}`);
}

const courses = JSON.parse(result.resultsBody);
await fs.writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");

console.log(`Fetched ${courses.length} courses for ${year}; languageType=${languageType}`);
console.log(`Saved ${outputPath}`);
