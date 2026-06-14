import { useEffect, useMemo, useState } from "react";
import { loadDefaultJapaneseParser } from "budoux";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { courses, type CourseSummary, type SyllabusDetail } from "./data/generated";

type View =
  | { name: "list" }
  | { name: "detail"; course: CourseSummary; language: "ja" | "en" };

const semesterOrder = ["spring", "fall", "full-year"];
const sectionLabels = {
  ja: {
    teachers: "担当教員",
    keywords: "キーワード",
    educationalGoal: "学習・教育目標",
    advice: "授業の概要および学習上の助言",
    books: "教科書および参考書",
    requiredKnowledge: "履修に必要な予備知識や技能",
    activityGoals: "学生が達成すべき行動目標",
    evaluation: "達成度評価",
    ideal: "理想的な達成レベル",
    standard: "標準的な達成レベル",
    clip: "CLIP 学習プロセス",
    lessons: "授業明細",
    lessonContent: "学習内容",
    lessonOperation: "運営方法",
    lessonAssignments: "学習課題",
    lessonMinutes: "時間",
    loading: "詳細を読み込み中です",
    loadingBody: "この科目の詳細 JSON を取得しています。",
  },
  en: {
    teachers: "Instructor",
    keywords: "Keywords",
    educationalGoal: "Learning and Educational Goals",
    advice: "Course Outline and Advice",
    books: "Textbooks and References",
    requiredKnowledge: "Required Knowledge and Skills",
    activityGoals: "Behavioral Goals",
    evaluation: "Performance Evaluation",
    ideal: "Ideal Achievement Level",
    standard: "Standard Achievement Level",
    clip: "CLIP Learning Process",
    lessons: "Course Schedule",
    lessonContent: "Content",
    lessonOperation: "Method",
    lessonAssignments: "Assignments",
    lessonMinutes: "Time",
    loading: "Loading details",
    loadingBody: "Loading the detailed syllabus JSON for this course.",
  },
} as const;

const creditRequirements = [
  { id: "shugaku", label: "修学基礎", required: 4, commonEligible: false },
  { id: "ethics", label: "技術者倫理", required: 4, commonEligible: false },
  { id: "humanities", label: "人文社会科学・外国語", required: 6, commonEligible: true },
  { id: "sports", label: "生涯スポーツ", required: 2, commonEligible: false },
  { id: "english", label: "英語", required: 8, commonEligible: true },
  { id: "math", label: "数理基礎", required: 15, commonEligible: true },
  { id: "basicPractice", label: "基礎実技", required: 10, commonEligible: true },
  { id: "specialized", label: "専門", required: 60, commonEligible: true },
  { id: "specializedProject", label: "専門プロジェクト", required: 9, commonEligible: false },
] as const;

const commonRequirement = { label: "課程共通", required: 6 };
const graduationRequirementUrl = "https://www.kanazawa-it.ac.jp/campus_guide/2021/chapter_3/list_1/page_9.html";
const japaneseParser = loadDefaultJapaneseParser();
const breakOpportunity = "\u200b";
const allSelectValue = "__all__";

function normalizeDisplayWidth(value: string) {
  return value
    .replace(/[\uff61-\uff9f]+/g, (text) => text.normalize("NFKC"))
    .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ");
}

function removeJapaneseIntraWordSpaces(value: string) {
  return value.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])[\s　]+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, "$1");
}

function displayText(value: string | number | null | undefined) {
  if (value == null) return "";
  return removeJapaneseIntraWordSpaces(normalizeDisplayWidth(String(value)));
}

function normalizeSoftLineBreaks(value: string) {
  const lines = value.split("\n");
  return lines.reduce((text, line, index) => {
    if (index === 0) return line;
    const previous = lines[index - 1] ?? "";
    const next = line;
    const previousText = previous.trim();
    const nextText = next.trim();
    const hasUnclosedParen = (previousText.match(/[（(]/g)?.length ?? 0) > (previousText.match(/[）)]/g)?.length ?? 0);
    const startsContinuation = /^[のをにがはへでと、。・･）)]/.test(nextText);
    const previousLooksStandalone = previousText.length >= 4 && previousText.length <= 14 && !startsContinuation && !hasUnclosedParen;
    const shouldKeepBreak =
      !previousText ||
      !nextText ||
      previousLooksStandalone ||
      /[。．.!?！？;；:：」』）)]$/.test(previousText) ||
      /^[^:\n]{1,16}:/.test(nextText) ||
      /^[\s　]*(?:[・･\-－]|[0-9０-９]+[.)．、]|第[0-9０-９]+回|[①-⑳])/.test(next);
    if (shouldKeepBreak) return `${text}\n${next}`;
    const needsSpace = /[A-Za-z0-9]$/.test(previousText) && /^[A-Za-z0-9]/.test(nextText);
    return `${text}${needsSpace ? " " : ""}${next.trimStart()}`;
  }, "");
}

function readableText(value: string | number | null | undefined) {
  const normalized = normalizeSoftLineBreaks(displayText(value));
  if (!/[\u3040-\u30ff\u3400-\u9fff]/.test(normalized)) return normalized;
  return normalized
    .split("\n")
    .map((line) => (line.trim() ? japaneseParser.parse(line).join(breakOpportunity) : line))
    .join("\n");
}

function splitNumberedItems(value: string) {
  const normalized = removeJapaneseIntraWordSpaces(displayText(value).replace(/\u200b/g, ""));
  if (!/(?:^|\s)[0-9０-９]+[.．]/.test(normalized)) return null;
  const marked = normalized.replace(/(?:^|\s)([0-9０-９]+[.．])/g, "\n$1");
  const items = marked
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^[0-9０-９]+[.．]\s*/, "").trim())
    .filter(Boolean);
  return items.length >= 2 ? items : null;
}

function splitKeywordItems(keywords: string[]) {
  return keywords.flatMap((keyword) =>
    displayText(keyword)
      .split(/\s+(?=[0-9０-９]+[.．])/)
      .map((item) => item.replace(/^[0-9０-９]+[.．]\s*/, "").trim())
      .filter(Boolean),
  );
}

function normalizeDetailText<T>(value: T): T {
  if (typeof value === "string") return normalizeDisplayWidth(value) as T;
  if (Array.isArray(value)) return value.map((item) => normalizeDetailText(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeDetailText(item)])) as T;
  }
  return value;
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function useLocation() {
  const [location, setLocation] = useState(window.location.pathname + window.location.search);
  useEffect(() => {
    const onPop = () => setLocation(window.location.pathname + window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return location;
}

function routeToView(location: string): View {
  const [pathname, search = ""] = location.split("?");
  const language = new URLSearchParams(search).get("lang") === "en" ? "en" : "ja";
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "courses" || parts.length < 4) return { name: "list" };
  const [, year, semester, code] = parts;
  const course = courses.find(
    (item) =>
      item.yearLabel === year &&
      item.semesterSlug === semester &&
      item.courseCodeLabel.toLowerCase() === code.toLowerCase(),
  );
  if (!course) return { name: "list" };
  return {
    name: "detail",
    course,
    language,
  };
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
}

function normalizeForSearch(value: string | null | undefined) {
  return normalizeDisplayWidth(String(value ?? "")).trim().toLowerCase();
}

function wordsForSearch(value: string) {
  return normalizeForSearch(value).split(/\s+/).filter(Boolean);
}

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(page, 1), totalPages);
}

function SelectField({
  value,
  onValueChange,
  options,
  placeholder = "すべて",
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <Select value={value || allSelectValue} onValueChange={(next) => onValueChange(next === allSelectValue ? "" : next)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={allSelectValue}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {displayText(option.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function selectedCreditStats(selectedCourses: CourseSummary[]) {
  const creditsByCategory = new Map<string, number>();
  for (const course of selectedCourses) {
    creditsByCategory.set(course.creditCategory, (creditsByCategory.get(course.creditCategory) ?? 0) + course.credits);
  }
  const total = selectedCourses.reduce((sum, course) => sum + course.credits, 0);
  const commonCredits = creditRequirements
    .filter((requirement) => requirement.commonEligible)
    .reduce((sum, requirement) => {
      const credits = creditsByCategory.get(requirement.id) ?? 0;
      return sum + Math.max(0, credits - requirement.required);
    }, 0);
  return { creditsByCategory, total, commonCredits };
}

function AppHeader() {
  return (
    <header className="app-header">
      <button className="brand-button" onClick={() => navigate("/")}>
        <span className="brand-mark">KIT</span>
        <span>
          <strong>Syllabus Clone</strong>
          <small>shareable course URLs</small>
        </span>
      </button>
      <nav>
        <Button variant="outline" onClick={() => navigate("/courses")}>
          科目一覧
        </Button>
        <Button variant="outline" asChild>
          <a href="https://europa.kanazawa-it.ac.jp/opsyllabus/kitos0100/0" target="_blank" rel="noreferrer">
            元サイト
          </a>
        </Button>
      </nav>
    </header>
  );
}

function CreditCalculator({
  selectedCourses,
  isOpen,
  onClear,
  onToggle,
}: {
  selectedCourses: CourseSummary[];
  isOpen: boolean;
  onClear: () => void;
  onToggle: () => void;
}) {
  const stats = useMemo(() => selectedCreditStats(selectedCourses), [selectedCourses]);
  const commonFulfilled = Math.min(stats.commonCredits, commonRequirement.required);
  const graduationMinimum = 124;
  return (
    <Card className={`credit-calculator ${isOpen ? "open" : "collapsed"}`} aria-label="単位計算">
      <CardHeader className="credit-calculator-header">
        <div>
          <p className="eyebrow">credit calculator</p>
          <CardTitle>選択科目の単位計算</CardTitle>
        </div>
        <div className="credit-actions">
          <div className="credit-total">
            <strong>{displayText(stats.total)}</strong>
            <span>/ {graduationMinimum} 単位</span>
          </div>
          <Button variant="outline" onClick={onToggle} aria-expanded={isOpen}>
            {isOpen ? "閉じる" : "単位計算を開く"}
          </Button>
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent>
          <div className="credit-bars">
            {creditRequirements.map((requirement) => {
              const credits = stats.creditsByCategory.get(requirement.id) ?? 0;
              const fulfilled = Math.min(credits, requirement.required);
              const percent = requirement.required ? Math.min(100, (fulfilled / requirement.required) * 100) : 100;
              return (
                <article key={requirement.id}>
                  <div>
                    <strong>{requirement.label}</strong>
                    <span>
                      {displayText(credits)} / {displayText(requirement.required)}
                    </span>
                  </div>
                  <Progress className="credit-bar" value={percent} aria-hidden="true" />
                </article>
              );
            })}
            <article>
              <div>
                <strong>{commonRequirement.label}</strong>
                <span>
                  {displayText(commonFulfilled)} / {displayText(commonRequirement.required)}
                </span>
              </div>
              <Progress className="credit-bar" value={Math.min(100, (commonFulfilled / commonRequirement.required) * 100)} aria-hidden="true" />
            </article>
          </div>
          <Separator className="my-4" />
          <div className="credit-calculator-footer">
            <p>
              卒業に必要な最低単位数 124 単位と科目群別の最低単位数を目安に集計します。課程共通 6 単位は、対象科目群の最低単位を超えた分から計算します。
              <a href={graduationRequirementUrl} target="_blank" rel="noreferrer">
                出典
              </a>
            </p>
            <Button variant="outline" onClick={onClear} disabled={!selectedCourses.length}>
              選択解除
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function CourseList() {
  const [year, setYear] = useState("2026");
  const [semester, setSemester] = useState("");
  const [programDepartment, setProgramDepartment] = useState("");
  const [courseNameQuery, setCourseNameQuery] = useState("");
  const [courseCodeQuery, setCourseCodeQuery] = useState("");
  const [fuzzyKeywords, setFuzzyKeywords] = useState("");
  const [fuzzyCondition, setFuzzyCondition] = useState<"AND" | "OR">("AND");
  const [practicalOnly, setPracticalOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(() => new Set());
  const [creditCalculatorOpen, setCreditCalculatorOpen] = useState(false);
  const [searchIndexes, setSearchIndexes] = useState<Record<string, Record<string, string>>>({});
  const [searchIndexLoadingYears, setSearchIndexLoadingYears] = useState<Set<string>>(() => new Set());
  const years = useMemo(() => uniqueSorted(courses.map((course) => course.yearLabel)).reverse(), []);
  const selectedSearchYears = useMemo(() => (year ? [year] : years), [year, years]);
  const programDepartmentOptions = useMemo(() => {
    const scoped = courses.filter((course) => !year || course.yearLabel === year);
    return [
      ...uniqueSorted(scoped.map((course) => course.programLabel)).map((value) => ({ value: `program:${value}`, label: value })),
      ...uniqueSorted(scoped.map((course) => course.departmentLabel ?? "")).map((value) => ({ value: `department:${value}`, label: `　${value}` })),
    ];
  }, [year]);
  const semesters = useMemo(
    () =>
      uniqueSorted(courses.filter((course) => course.yearLabel === year).map((course) => course.semesterLabel)).sort(
        (a, b) => semesterOrder.indexOf(courses.find((course) => course.semesterLabel === a)?.semesterSlug ?? "") - semesterOrder.indexOf(courses.find((course) => course.semesterLabel === b)?.semesterSlug ?? ""),
      ),
    [year],
  );

  const filtered = useMemo(() => {
    const courseNameNeedle = normalizeForSearch(courseNameQuery);
    const courseCodeNeedle = normalizeForSearch(courseCodeQuery);
    const fuzzyWords = wordsForSearch(fuzzyKeywords);
    return courses.filter((course) => {
      const courseName = normalizeForSearch(course.courseName);
      const courseCode = normalizeForSearch(course.courseCodeLabel);
      const searchText = normalizeForSearch(searchIndexes[course.yearLabel]?.[course.id] ?? [course.courseName, course.courseCodeLabel, course.programLabel, course.departmentLabel ?? ""].join(" "));
      const matchesProgramDepartment =
        !programDepartment ||
        (programDepartment.startsWith("program:") && course.programLabel === programDepartment.slice("program:".length)) ||
        (programDepartment.startsWith("department:") && (course.departmentLabel ?? "") === programDepartment.slice("department:".length));
      const matchesFuzzy =
        fuzzyWords.length === 0 ||
        (fuzzyCondition === "AND"
          ? fuzzyWords.every((word) => searchText.includes(word))
          : fuzzyWords.some((word) => searchText.includes(word)));
      return (
        (!year || course.yearLabel === year) &&
        (!semester || course.semesterLabel === semester) &&
        matchesProgramDepartment &&
        (!courseNameNeedle || courseName.includes(courseNameNeedle)) &&
        (!courseCodeNeedle || courseCode.startsWith(courseCodeNeedle)) &&
        matchesFuzzy &&
        (!practicalOnly || course.hasPracticalTeacher)
      );
    });
  }, [courseCodeQuery, courseNameQuery, fuzzyCondition, fuzzyKeywords, practicalOnly, programDepartment, searchIndexes, semester, year]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = clampPage(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const paginated = filtered.slice(pageStart, pageStart + pageSize);
  const pageRangeStart = filtered.length ? pageStart + 1 : 0;
  const pageRangeEnd = Math.min(pageStart + pageSize, filtered.length);
  const selectedCourses = useMemo(() => courses.filter((course) => selectedCourseIds.has(course.id)), [selectedCourseIds]);
  const selectedOnPage = paginated.filter((course) => selectedCourseIds.has(course.id)).length;
  const allOnPageSelected = paginated.length > 0 && selectedOnPage === paginated.length;

  useEffect(() => {
    setPage(1);
  }, [courseCodeQuery, courseNameQuery, fuzzyCondition, fuzzyKeywords, practicalOnly, programDepartment, semester, year]);

  useEffect(() => {
    if (!fuzzyKeywords.trim()) return;
    const missingYears = selectedSearchYears.filter((searchYear) => !searchIndexes[searchYear] && !searchIndexLoadingYears.has(searchYear));
    if (!missingYears.length) return;
    let cancelled = false;
    setSearchIndexLoadingYears((current) => new Set([...current, ...missingYears]));
    Promise.all(
      missingYears.map(async (searchYear) => {
        const response = await fetch(`/search-index/${searchYear}.json`);
        if (!response.ok) return [searchYear, {}] as const;
        return [searchYear, (await response.json()) as Record<string, string>] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) {
          setSearchIndexes((current) => Object.fromEntries([...Object.entries(current), ...entries]));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearchIndexLoadingYears((current) => {
            const next = new Set(current);
            for (const searchYear of missingYears) next.delete(searchYear);
            return next;
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fuzzyKeywords, searchIndexes, searchIndexLoadingYears, selectedSearchYears]);

  useEffect(() => {
    setPage((value) => clampPage(value, totalPages));
  }, [totalPages]);

  function toggleCourse(courseId: string) {
    setSelectedCourseIds((current) => {
      const next = new Set(current);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  }

  function togglePageSelection() {
    setSelectedCourseIds((current) => {
      const next = new Set(current);
      if (allOnPageSelected) {
        for (const course of paginated) next.delete(course.id);
      } else {
        for (const course of paginated) next.add(course.id);
      }
      return next;
    });
  }

  function clearFilters() {
    setYear("");
    setSemester("");
    setProgramDepartment("");
    setCourseNameQuery("");
    setCourseCodeQuery("");
    setFuzzyKeywords("");
    setFuzzyCondition("AND");
    setPracticalOnly(false);
  }

  return (
    <main>
      <section className="list-hero">
        <div>
          <p className="eyebrow">2012-2026 captured dataset</p>
          <h1>URL で共有できるシラバス検索</h1>
          <p>
            元サイトの検索結果を React で再構成しています。各科目は年度・学期・科目コード・科目名 slug を含む共有用 URL を持ちます。
          </p>
        </div>
        <div className="hero-stats" aria-label="データ件数">
          <strong>{courses.length.toLocaleString()}</strong>
          <span>captured courses</span>
        </div>
      </section>

      <Card className="search-panel" aria-label="検索条件">
        <CardHeader className="search-panel-header">
          <div>
            <CardTitle>検索条件</CardTitle>
            <CardDescription>科目名・科目コード・キーワードで絞り込みできます。</CardDescription>
          </div>
          <Button variant="outline" type="button" onClick={clearFilters}>
            条件クリア
          </Button>
        </CardHeader>

        <CardContent>
          <div className="primary-filters">
            <label className="keyword-filter">
              <span>キーワード</span>
              <div>
                <Input value={fuzzyKeywords} onChange={(event) => setFuzzyKeywords(event.target.value)} placeholder="全文検索" />
                <fieldset className="inline-options" aria-label="キーワード検索条件">
                  <label>
                    <input checked={fuzzyCondition === "AND"} name="fuzzy-condition" type="radio" onChange={() => setFuzzyCondition("AND")} />
                    <span>AND</span>
                  </label>
                  <label>
                    <input checked={fuzzyCondition === "OR"} name="fuzzy-condition" type="radio" onChange={() => setFuzzyCondition("OR")} />
                    <span>OR</span>
                  </label>
                </fieldset>
              </div>
            </label>
            <label>
              <span>科目名</span>
              <Input value={courseNameQuery} onChange={(event) => setCourseNameQuery(event.target.value)} placeholder="部分一致検索" />
            </label>
            <label>
              <span>科目コード</span>
              <Input value={courseCodeQuery} onChange={(event) => setCourseCodeQuery(event.target.value)} maxLength={7} placeholder="前方一致検索" />
            </label>
          </div>

          <details className="advanced-filters">
            <summary>詳細条件</summary>
            <div className="filters">
              <label>
                <span>年度</span>
                <SelectField value={year} onValueChange={setYear} options={years.map((value) => ({ value, label: value }))} />
              </label>
              <label>
                <span>学期</span>
                <SelectField value={semester} onValueChange={setSemester} options={semesters.map((value) => ({ value, label: value }))} />
              </label>
              <label>
                <span>課程／学科</span>
                <SelectField value={programDepartment} onValueChange={setProgramDepartment} options={programDepartmentOptions} />
              </label>
              <label className="checkbox-filter">
                <Checkbox checked={practicalOnly} onCheckedChange={(checked) => setPracticalOnly(checked === true)} />
                <span>実務経験のある教員の担当科目</span>
              </label>
            </div>
          </details>
        </CardContent>
      </Card>

      <section className="result-summary">
        <div>
          <strong>{filtered.length.toLocaleString()}</strong>
          <span>件を表示中</span>
        </div>
      </section>

      <CreditCalculator
        selectedCourses={selectedCourses}
        isOpen={creditCalculatorOpen}
        onClear={() => setSelectedCourseIds(new Set())}
        onToggle={() => setCreditCalculatorOpen((value) => !value)}
      />

      <div className="table-controls">
        <div className="selection-summary">
          <strong>{displayText(selectedCourseIds.size)}</strong>
          <span>件を単位計算に選択中</span>
        </div>
        <nav className="pagination" aria-label="ページネーション">
          <Button variant="outline" disabled={currentPage <= 1} onClick={() => setPage(1)}>
            最初
          </Button>
          <Button variant="outline" disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)}>
            前へ
          </Button>
          <span>
            {displayText(currentPage)} / {displayText(totalPages)} ページ（{displayText(pageRangeStart)}-
            {displayText(pageRangeEnd)} 件）
          </span>
          <Button variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage((value) => value + 1)}>
            次へ
          </Button>
          <Button variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>
            最後
          </Button>
        </nav>
      </div>

      <section className="course-table-wrap">
        <Table className="course-table">
          <TableHeader>
            <TableRow>
              <TableHead className="selection-cell">
                <Checkbox
                  aria-label="このページの科目を選択"
                  checked={allOnPageSelected}
                  disabled={!paginated.length}
                  onCheckedChange={togglePageSelection}
                />
              </TableHead>
              <TableHead>年度</TableHead>
              <TableHead>学期</TableHead>
              <TableHead>科目コード</TableHead>
              <TableHead>単位</TableHead>
              <TableHead>科目名</TableHead>
              <TableHead>課程</TableHead>
              <TableHead>対象学科</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((course) => (
              <TableRow key={course.id} onClick={() => navigate(course.routePath)}>
                <TableCell className="selection-cell" onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    aria-label={`${displayText(course.courseName)}を単位計算に追加`}
                    checked={selectedCourseIds.has(course.id)}
                    onCheckedChange={() => toggleCourse(course.id)}
                  />
                </TableCell>
                <TableCell>{displayText(course.yearLabel)}</TableCell>
                <TableCell>{displayText(course.semesterLabel)}</TableCell>
                <TableCell>
                  <code>{displayText(course.courseCodeLabel)}</code>
                </TableCell>
                <TableCell>{displayText(course.credits)}</TableCell>
                <TableCell>
                  <Button
                    variant="link"
                    className="link-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(course.routePath);
                    }}
                  >
                    {displayText(course.courseName)}
                  </Button>
                  {course.hasDetail && (
                    <Badge className="detail-badge" variant="outline">
                      {course.hasEnglishDetail ? "日英詳細あり" : "詳細あり"}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{displayText(course.programLabel)}</TableCell>
                <TableCell>{displayText(course.departmentLabel ?? "全学")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </main>
  );
}

function MetadataStrip({ course, detail, language }: { course: CourseSummary; detail?: SyllabusDetail; language: "ja" | "en" }) {
  const labels =
    language === "en"
      ? { year: "Year", semester: "Semester", code: "Course Code", credits: "Credits", method: "Registration" }
      : { year: "年度", semester: "学期", code: "科目コード", credits: "単位", method: "履修方法" };
  const items = [
    [labels.year, course.yearLabel],
    [labels.semester, course.semesterLabel],
    [labels.code, course.courseCodeLabel],
    [labels.credits, detail?.credits || "-"],
    [labels.method, detail?.method || "-"],
  ];
  return (
    <dl className="metadata-strip">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{displayText(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function TextSection({ title, body }: { title: string; body?: string }) {
  if (!body) return null;
  const normalizedBody = displayText(body);
  const visibleBody = normalizedBody.startsWith(title) ? normalizedBody.slice(title.length).trimStart() : normalizedBody;
  const numberedItems = splitNumberedItems(visibleBody);
  return (
    <Card className="detail-section">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {numberedItems ? (
          <ol className="text-list">
            {numberedItems.map((item, index) => (
              <li key={`${title}-${index}`}>{readableText(item)}</li>
            ))}
          </ol>
        ) : (
          <p className="preline">{readableText(visibleBody)}</p>
        )}
      </CardContent>
    </Card>
  );
}

function DetailPage({ course, language }: Extract<View, { name: "detail" }>) {
  const [detail, setDetail] = useState<SyllabusDetail | undefined>();
  const selectedDetailPath = language === "en" ? course.detailPaths.en : course.detailPaths.ja;
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">(selectedDetailPath ? "loading" : "empty");

  useEffect(() => {
    let cancelled = false;
    setDetail(undefined);
    setStatus(selectedDetailPath ? "loading" : "empty");
    if (!selectedDetailPath) return;
    fetch(selectedDetailPath)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<SyllabusDetail>;
      })
      .then((value) => {
        if (!cancelled) {
          setDetail(normalizeDetailText(value));
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDetailPath]);

  const japanesePath = course.routePath;
  const englishPath = `${course.routePath}?lang=en`;
  const labels = sectionLabels[language];
  const title = language === "en" && detail?.subtitle ? detail.subtitle : course.courseName;
  const subtitle = language === "en" && detail?.subtitle ? course.courseName : detail?.subtitle;

  return (
    <main>
      <Button className="back-button" variant="outline" onClick={() => navigate("/courses")}>
        ← 一覧へ戻る
      </Button>
      <section className="detail-hero">
        <p className="eyebrow">
          {displayText(course.programLabel)} / {displayText(course.departmentLabel ?? "全学")}
        </p>
        <h1>{readableText(title)}</h1>
        {subtitle && <p className="subtitle">{readableText(subtitle)}</p>}
        <MetadataStrip course={course} detail={detail} language={language} />
        <Tabs value={language} onValueChange={(value) => navigate(value === "en" ? englishPath : japanesePath)} className="language-tabs">
          <TabsList aria-label="シラバス言語">
            <TabsTrigger value="ja">日本語</TabsTrigger>
            <TabsTrigger value="en" disabled={!course.hasEnglishDetail}>
              English
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </section>

      {status === "loading" && (
        <Card className="empty-detail">
          <CardHeader>
            <CardTitle>{labels.loading}</CardTitle>
            <CardDescription>{labels.loadingBody}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {(status === "empty" || status === "error") && (
        <Card className="empty-detail">
          <CardHeader>
            <CardTitle>{status === "error" ? "詳細を読み込めませんでした" : "共有 URL は作成済みです"}</CardTitle>
            <CardDescription>
              {language === "en"
                ? "この科目の英語シラバス本文は取得データ内で確認できませんでした。日本語版は同じ URL から切り替えて確認できます。"
                : "この科目のフルシラバス本文はまだ取り込んでいません。検索結果由来の基本情報は URL に固定済みなので、今後の詳細取り込み時にも同じ共有リンクを使えます。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code>{displayText(course.routePath)}</code>
          </CardContent>
        </Card>
      )}

      {detail && (
        <>
          {detail.teachers.length > 0 && (
            <Card className="detail-section teachers">
              <CardHeader>
                <CardTitle>{labels.teachers}</CardTitle>
              </CardHeader>
              <CardContent className="teacher-list">
                {detail.teachers.map((teacher) => (
                  <Badge key={teacher} variant="secondary">
                    {displayText(teacher)}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="detail-section">
            <CardHeader>
              <CardTitle>{labels.keywords}</CardTitle>
            </CardHeader>
            <CardContent className="keyword-list">
              {splitKeywordItems(detail.keywords).map((keyword) => (
                <Badge key={keyword} variant="outline">
                  {displayText(keyword)}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <TextSection title={labels.educationalGoal} body={detail.educationalGoal} />
          <TextSection title={labels.advice} body={detail.advice} />
          <TextSection title={labels.books} body={detail.books} />
          <TextSection title={labels.requiredKnowledge} body={detail.requiredKnowledge} />

          <Card className="detail-section">
            <CardHeader>
              <CardTitle>{labels.activityGoals}</CardTitle>
            </CardHeader>
            <CardContent className="goal-list">
              {detail.activityGoals.map((goal) => (
                <article key={goal.index}>
                  <strong>{displayText(goal.index)}</strong>
                  <span>{displayText(goal.type)}</span>
                  <p>{readableText(goal.body)}</p>
                </article>
              ))}
            </CardContent>
          </Card>

          <Card className="detail-section">
            <CardHeader>
              <CardTitle>{labels.evaluation}</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="evaluation-table-wrap">
              <Table className="evaluation-table">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">評価方法</TableHead>
                    {(detail.evaluationWeights[0]?.columns?.length ? detail.evaluationWeights[0].columns : detail.evaluationWeights[0]?.values.map((_, index) => `${index + 1}`) ?? []).map((column) => (
                      <TableHead key={column} scope="col">
                        {displayText(column)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.evaluationWeights.map((row) => (
                    <TableRow key={row.label}>
                      <TableHead scope="row">{displayText(row.label)}</TableHead>
                      {row.values.map((value, index) => (
                        <TableCell key={`${row.label}-${index}`}>{displayText(value)}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </CardContent>
          </Card>

          <Card className="detail-section split-section">
            <div>
              <h2>{labels.ideal}</h2>
              <p className="preline">{readableText(detail.achievementLevels.ideal)}</p>
            </div>
            <div>
              <h2>{labels.standard}</h2>
              <p className="preline">{readableText(detail.achievementLevels.standard)}</p>
            </div>
          </Card>

          <TextSection title={labels.clip} body={detail.clipProcess} />

          <Card className="detail-section">
            <CardHeader>
              <CardTitle>{labels.lessons}</CardTitle>
            </CardHeader>
            <CardContent>
            {detail.lessons.length ? (
              <div className="lesson-list">
                {detail.lessons.map((lesson) => (
                  <article key={lesson.index}>
                    <div className="lesson-index">{displayText(lesson.index)}</div>
                    <div>
                      <h3>{labels.lessonContent}</h3>
                      <p className="preline">{readableText(lesson.content)}</p>
                    </div>
                    <div>
                      <h3>{labels.lessonOperation}</h3>
                      <p className="preline">{readableText(lesson.operation)}</p>
                    </div>
                    <div>
                      <h3>{labels.lessonAssignments}</h3>
                      <p className="preline">{readableText(lesson.assignments)}</p>
                    </div>
                    <div>
                      <h3>{labels.lessonMinutes}</h3>
                      <p className="preline">{readableText(lesson.minutes)}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">この科目の授業明細は取得データ内で確認できませんでした。</p>
            )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}

export function App() {
  const location = useLocation();
  const view = routeToView(location);
  return (
    <>
      <AppHeader />
      {view.name === "detail" ? <DetailPage {...view} /> : <CourseList />}
    </>
  );
}
