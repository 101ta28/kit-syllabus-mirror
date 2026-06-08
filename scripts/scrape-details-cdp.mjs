import fs from "node:fs/promises";
import path from "node:path";

const CDP = "http://127.0.0.1:9222";
const SOURCE = "https://europa.kanazawa-it.ac.jp/opsyllabus/kitos0100/0";
const root = process.cwd();
const searchSourcePath = path.resolve(root, "../europa-syllabus-search-detail.json");
const cachePath = path.resolve(root, "data/syllabus-details-cache.json");
const batchSize = Number(process.env.BATCH_SIZE ?? 20);

async function json(url, init = undefined) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  async function send(method, params = {}) {
    await ready;
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Timeout: ${method}`));
        }
      }, 120000);
    });
  }
  return { send, events, close: () => ws.close() };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitLoad(tab) {
  const start = Date.now();
  while (Date.now() - start < 30000) {
    if (tab.events.some((event) => event.method === "Page.loadEventFired")) return;
    await sleep(100);
  }
}

async function evaluate(tab, expression) {
  const result = await tab.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text);
  }
  return result.result.value;
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

const searchSource = JSON.parse(await fs.readFile(searchSourcePath, "utf8"));
const total = JSON.parse(searchSource.resultsBody).length;
const target = await json(`${CDP}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
const tab = connect(target.webSocketDebuggerUrl);
await tab.send("Page.enable");
await tab.send("Runtime.enable");

await tab.send("Page.navigate", { url: SOURCE });
await waitLoad(tab);
await sleep(3000);
await evaluate(tab, `document.querySelector('button.search')?.click(); true`);
await sleep(12000);

const detailsByIndex = new Map((await readExisting()).map((detail) => [detail.sourceIndex, detail]));
console.log(`Starting detail scrape: ${detailsByIndex.size}/${total} cached`);

for (let start = 0; start < total; start += batchSize) {
  const indexes = [];
  for (let index = start; index < Math.min(start + batchSize, total); index++) {
    if (!detailsByIndex.has(index)) indexes.push(index);
  }
  if (!indexes.length) continue;

  const batch = await evaluate(
    tab,
    `(async () => {
      const indexes = ${JSON.stringify(indexes)};
      const normalizeText = (text) => String(text ?? '')
        .replace(/\\r/g, '')
        .replace(/[ \\t]+\\n/g, '\\n')
        .replace(/\\n{3,}/g, '\\n\\n')
        .trim();
      const cellText = (row, className) => normalizeText(row?.cells?.find((cell) => String(cell.className).split(/\\s+/).includes(className))?.text ?? '');
      const firstRowByCellClass = (rows, className) => rows.find((row) => row.cells?.some((cell) => String(cell.className).split(/\\s+/).includes(className)));
      const rowsAfterHeader = (rows, headerText, untilHeaderTexts = []) => {
        const start = rows.findIndex((row) => row.cells?.some((cell) => normalizeText(cell.text) === headerText));
        if (start < 0) return [];
        const end = rows.findIndex((row, index) => index > start && row.cells?.some((cell) => untilHeaderTexts.includes(normalizeText(cell.text))));
        return rows.slice(start + 1, end < 0 ? rows.length : end);
      };
      const extractSingleSection = (rows, headerText, untilHeaderTexts = []) => normalizeText(
        rowsAfterHeader(rows, headerText, untilHeaderTexts)
          .flatMap((row) => row.cells ?? [])
          .map((cell) => cell.text)
          .filter(Boolean)
          .join('\\n')
      );
      const splitTeachers = (text) => normalizeText(text)
        .replace('＊印は、実務経験のある教員を示しています。', '')
        .split(/[、,]/)
        .map((teacher) => teacher.trim())
        .filter(Boolean);
      const splitKeywords = (text) => normalizeText(text)
        .split(/\\n+/)
        .map((line) => line.replace(/^\\d+\\./, '').trim())
        .filter(Boolean);
      const extractActivityGoals = (rows) => rowsAfterHeader(rows, '学生が達成すべき行動目標', ['達成度評価'])
        .filter((row) => row.cells?.some((cell) => String(cell.className).includes('activityGoalLabel')))
        .map((row) => ({
          index: cellText(row, 'activityGoalIndexLabel'),
          type: cellText(row, 'activityGoalType'),
          body: cellText(row, 'activityGoalLabel')
        }))
        .filter((goal) => goal.index && goal.body);
      const extractEvaluationWeights = (rows) => {
        const methodHeader = rows.find((row) => row.className === 'method');
        const labels = methodHeader?.cells?.map((cell) => normalizeText(cell.text).replace(/\\n/g, ' ')) ?? [];
        return rows
          .filter((row) => row.cells?.some((cell) => String(cell.className).includes('rate')))
          .slice(0, 6)
          .map((row) => {
            const nonRate = row.cells.filter((cell) => !String(cell.className).includes('rate')).map((cell) => normalizeText(cell.text)).filter(Boolean);
            return {
              label: nonRate.join(' / ') || '総合評価割合',
              values: row.cells.filter((cell) => String(cell.className).includes('rate')).map((cell) => normalizeText(cell.text)),
              columns: labels
            };
          });
      };
      const extractAchievementLevels = (rows) => {
        const sectionRows = rowsAfterHeader(rows, '具体的な達成の目安', ['ＣＬＩＰ学習プロセスについて']);
        const header = sectionRows.find((candidate) => candidate.cells?.length >= 2 && candidate.cells.some((cell) => normalizeText(cell.text).includes('理想的')));
        const valueRow = sectionRows.find((candidate) => candidate.cells?.length >= 2 && candidate !== header);
        return {
          ideal: normalizeText(valueRow?.cells?.[0]?.text ?? ''),
          standard: normalizeText(valueRow?.cells?.[1]?.text ?? '')
        };
      };
      const extractLessons = (rows) => {
        const start = rows.findIndex((row) => row.cells?.some((cell) => normalizeText(cell.text) === '授業明細'));
        if (start < 0) return [];
        return rows
          .slice(start + 2)
          .filter((row) => {
            const first = row.cells?.[0];
            const firstText = normalizeText(first?.text ?? '');
            const firstClass = String(first?.className ?? '');
            return firstText && firstText !== '回数' && (firstText.startsWith('第') || firstClass.includes('nth'));
          })
          .map((row) => ({
            index: normalizeText(row.cells[0]?.text ?? ''),
            content: normalizeText(row.cells[1]?.text ?? ''),
            operation: normalizeText(row.cells[2]?.text ?? ''),
            assignments: normalizeText(row.cells[3]?.text ?? ''),
            minutes: normalizeText(row.cells[4]?.text ?? '')
          }));
      };
      const parse = (html, sourceIndex, sourceUrl) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const rows = [...doc.querySelectorAll('table tr')].map((row) => ({
          className: row.className,
          cells: [...row.cells].map((cell) => ({
            className: cell.className,
            text: cell.innerText.trim()
          }))
        }));
        const basicRow = firstRowByCellClass(rows, 'courseName');
        const goalRows = rowsAfterHeader(rows, '授業科目の学習・教育目標', ['授業の概要および学習上の助言']);
        const keywordText = goalRows.map((row) => cellText(row, 'keywords')).filter(Boolean).join('\\n');
        const educationalGoal = goalRows.map((row) => cellText(row, 'educationalGoal')).filter(Boolean).join('\\n');
        const courseNameParts = cellText(basicRow, 'courseName').split('\\n');
        return {
          sourceIndex,
          sourceUrl,
          importedAt: new Date().toISOString(),
          title: normalizeText(courseNameParts[0] ?? ''),
          subtitle: normalizeText(courseNameParts.slice(1).join(' ')),
          courseType: cellText(basicRow, 'courseType'),
          credits: cellText(basicRow, 'credits'),
          term: cellText(basicRow, 'courseTerm'),
          method: cellText(basicRow, 'method'),
          teachers: splitTeachers(extractSingleSection(rows, '担当教員名', ['授業科目の学習・教育目標'])),
          keywords: splitKeywords(keywordText),
          educationalGoal: normalizeText(educationalGoal),
          advice: extractSingleSection(rows, '授業の概要および学習上の助言', ['教科書および参考書・リザーブドブック']),
          books: extractSingleSection(rows, '教科書および参考書・リザーブドブック', ['履修に必要な予備知識や技能']),
          requiredKnowledge: extractSingleSection(rows, '履修に必要な予備知識や技能', ['学生が達成すべき行動目標']),
          activityGoals: extractActivityGoals(rows),
          evaluationWeights: extractEvaluationWeights(rows),
          achievementLevels: extractAchievementLevels(rows),
          clipProcess: extractSingleSection(rows, 'ＣＬＩＰ学習プロセスについて', ['授業明細']),
          lessons: extractLessons(rows),
          rawText: normalizeText(doc.body?.innerText ?? '').slice(0, 4000)
        };
      };

      const out = [];
      for (const index of indexes) {
        const sourceUrl = '/opsyllabus/kitos0110/' + index + '/0';
        try {
          const response = await fetch(sourceUrl, { credentials: 'include' });
          const html = await response.text();
          if (!response.ok || !html.includes('授業科目区分')) {
            out.push({ sourceIndex: index, sourceUrl, error: response.status + ' detail page not available' });
          } else {
            out.push(parse(html, index, sourceUrl));
          }
        } catch (error) {
          out.push({ sourceIndex: index, sourceUrl, error: String(error?.message ?? error) });
        }
      }
      return out;
    })()`,
  );

  for (const detail of batch) {
    detailsByIndex.set(detail.sourceIndex, detail);
  }
  await writeCache([...detailsByIndex.values()]);
  console.log(`Cached ${detailsByIndex.size}/${total}`);
}

tab.close();
const details = [...detailsByIndex.values()];
const errors = details.filter((detail) => detail.error).length;
console.log(`Finished detail scrape: ${details.length}/${total}; errors=${errors}`);
