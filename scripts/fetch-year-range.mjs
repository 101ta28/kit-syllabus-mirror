import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const startYear = Number(process.env.START_YEAR ?? 2012);
const endYear = Number(process.env.END_YEAR ?? 2026);
const years = Array.from({ length: endYear - startYear + 1 }, (_, index) => String(startYear + index));
const rawDir = path.resolve(root, "data/raw-search-results");
const detailDir = path.resolve(root, "data/yearly-detail-caches");
const combinedSearchPath = path.resolve(root, "../europa-syllabus-search-detail.json");
const combinedJaCachePath = path.resolve(root, "data/syllabus-details-cache.json");
const combinedEnCachePath = path.resolve(root, "data/syllabus-details-cache-en.json");

function runNode(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function fetchYear(year) {
  const searchPath = path.join(rawDir, `${year}.json`);
  const jaCachePath = path.join(detailDir, `${year}.json`);
  const enCachePath = path.join(detailDir, `${year}-en.json`);

  await runNode("scripts/fetch-search-results.mjs", {
    COURSE_YEAR: year,
    LANGUAGE_TYPE: "0",
    OUTPUT_PATH: searchPath,
  });
  await runNode("scripts/scrape-details-http.mjs", {
    LANGUAGE_TYPE: "0",
    SEARCH_SOURCE_PATH: searchPath,
    CACHE_PATH: jaCachePath,
  });
  await runNode("scripts/scrape-details-http.mjs", {
    LANGUAGE_TYPE: "1",
    SEARCH_SOURCE_PATH: searchPath,
    CACHE_PATH: enCachePath,
  });
}

async function combineYears() {
  const allCourses = [];
  const allJaDetails = [];
  const allEnDetails = [];
  const summary = [];

  for (const year of years) {
    const searchPath = path.join(rawDir, `${year}.json`);
    const jaCachePath = path.join(detailDir, `${year}.json`);
    const enCachePath = path.join(detailDir, `${year}-en.json`);
    const source = await readJson(searchPath);
    const courses = JSON.parse(source.resultsBody);
    const offset = allCourses.length;

    allCourses.push(...courses);

    const adjustDetails = (details) =>
      details.map((detail) => ({
        ...detail,
        sourceYear: year,
        originalSourceIndex: Number(detail.sourceIndex ?? 0),
        sourceIndex: offset + Number(detail.sourceIndex ?? 0),
      }));

    const jaDetails = adjustDetails(await readJson(jaCachePath));
    const enDetails = adjustDetails(await readJson(enCachePath));
    allJaDetails.push(...jaDetails);
    allEnDetails.push(...enDetails);
    summary.push({
      year,
      courses: courses.length,
      jaDetails: jaDetails.length,
      jaErrors: jaDetails.filter((detail) => detail.error).length,
      enDetails: enDetails.length,
      enErrors: enDetails.filter((detail) => detail.error).length,
    });
  }

  await fs.writeFile(combinedSearchPath, JSON.stringify({ resultsBody: JSON.stringify(allCourses) }, null, 2), "utf8");
  await fs.writeFile(combinedJaCachePath, JSON.stringify(allJaDetails, null, 2), "utf8");
  await fs.writeFile(combinedEnCachePath, JSON.stringify(allEnDetails, null, 2), "utf8");
  console.table(summary);
}

await fs.mkdir(rawDir, { recursive: true });
await fs.mkdir(detailDir, { recursive: true });

for (const year of years) {
  await fetchYear(year);
}

await combineYears();
await runNode("scripts/prepare-data.mjs", {});
