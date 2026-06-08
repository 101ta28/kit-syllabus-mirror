import { useEffect, useMemo, useState } from "react";
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
        <button onClick={() => navigate("/courses")}>科目一覧</button>
        <a href="https://europa.kanazawa-it.ac.jp/opsyllabus/kitos0100/0" target="_blank" rel="noreferrer">
          元サイト
        </a>
      </nav>
    </header>
  );
}

function CourseList() {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("2026");
  const [semester, setSemester] = useState("");
  const [program, setProgram] = useState("");
  const years = useMemo(() => uniqueSorted(courses.map((course) => course.yearLabel)).reverse(), []);
  const programs = useMemo(() => uniqueSorted(courses.filter((course) => course.yearLabel === year).map((course) => course.programLabel)), [year]);
  const semesters = useMemo(
    () =>
      uniqueSorted(courses.filter((course) => course.yearLabel === year).map((course) => course.semesterLabel)).sort(
        (a, b) => semesterOrder.indexOf(courses.find((course) => course.semesterLabel === a)?.semesterSlug ?? "") - semesterOrder.indexOf(courses.find((course) => course.semesterLabel === b)?.semesterSlug ?? ""),
      ),
    [year],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return courses.filter((course) => {
      const matchesQuery =
        !needle ||
        [course.courseName, course.courseCodeLabel, course.programLabel, course.departmentLabel ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return (
        matchesQuery &&
        (!year || course.yearLabel === year) &&
        (!semester || course.semesterLabel === semester) &&
        (!program || course.programLabel === program)
      );
    });
  }, [query, year, semester, program]);

  return (
    <main>
      <section className="list-hero">
        <div>
          <p className="eyebrow">2026 captured dataset</p>
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

      <section className="filters" aria-label="検索条件">
        <label>
          <span>キーワード</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="科目名・コード・課程で検索" />
        </label>
        <label>
          <span>年度</span>
          <select value={year} onChange={(event) => setYear(event.target.value)}>
            <option value="">すべて</option>
            {years.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>学期</span>
          <select value={semester} onChange={(event) => setSemester(event.target.value)}>
            <option value="">すべて</option>
            {semesters.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>課程</span>
          <select value={program} onChange={(event) => setProgram(event.target.value)}>
            <option value="">すべて</option>
            {programs.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="result-summary">
        <strong>{filtered.length.toLocaleString()}</strong>
        <span>件を表示中</span>
      </section>

      <section className="course-table-wrap">
        <table className="course-table">
          <thead>
            <tr>
              <th>年度</th>
              <th>学期</th>
              <th>科目コード</th>
              <th>科目名</th>
              <th>課程</th>
              <th>対象学科</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((course) => (
              <tr key={course.id} onClick={() => navigate(course.routePath)}>
                <td>{course.yearLabel}</td>
                <td>{course.semesterLabel}</td>
                <td>
                  <code>{course.courseCodeLabel}</code>
                </td>
                <td>
                  <button className="link-button" onClick={() => navigate(course.routePath)}>
                    {course.courseName}
                  </button>
                  {course.hasDetail && <span className="detail-badge">{course.hasEnglishDetail ? "日英詳細あり" : "詳細あり"}</span>}
                </td>
                <td>{course.programLabel}</td>
                <td>{course.departmentLabel ?? "全学"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 200 && <p className="table-note">表示を軽くするため先頭 200 件を表示しています。検索条件を追加してください。</p>}
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
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TextSection({ title, body }: { title: string; body?: string }) {
  if (!body) return null;
  return (
    <section className="detail-section">
      <h2>{title}</h2>
      <p className="preline">{body}</p>
    </section>
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
          setDetail(value);
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
      <button className="back-button" onClick={() => navigate("/courses")}>
        ← 一覧へ戻る
      </button>
      <section className="detail-hero">
        <p className="eyebrow">
          {course.programLabel} / {course.departmentLabel ?? "全学"}
        </p>
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
        <MetadataStrip course={course} detail={detail} language={language} />
        <div className="language-tabs" aria-label="シラバス言語">
          <button className={language === "ja" ? "active" : ""} onClick={() => navigate(japanesePath)}>
            日本語
          </button>
          <button className={language === "en" ? "active" : ""} disabled={!course.hasEnglishDetail} onClick={() => navigate(englishPath)}>
            English
          </button>
        </div>
      </section>

      {status === "loading" && (
        <section className="empty-detail">
          <h2>{labels.loading}</h2>
          <p>{labels.loadingBody}</p>
        </section>
      )}

      {(status === "empty" || status === "error") && (
        <section className="empty-detail">
          <h2>{status === "error" ? "詳細を読み込めませんでした" : "共有 URL は作成済みです"}</h2>
          <p>
            {language === "en"
              ? "この科目の英語シラバス本文は取得データ内で確認できませんでした。日本語版は同じ URL から切り替えて確認できます。"
              : "この科目のフルシラバス本文はまだ取り込んでいません。検索結果由来の基本情報は URL に固定済みなので、今後の詳細取り込み時にも同じ共有リンクを使えます。"}
          </p>
          <code>{course.routePath}</code>
        </section>
      )}

      {detail && (
        <>
          <section className="detail-section teachers">
            <h2>{labels.teachers}</h2>
            <div className="teacher-list">
              {detail.teachers.map((teacher) => (
                <span key={teacher}>{teacher}</span>
              ))}
            </div>
          </section>

          <section className="detail-section">
            <h2>{labels.keywords}</h2>
            <div className="keyword-list">
              {detail.keywords.map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>
          </section>

          <TextSection title={labels.educationalGoal} body={detail.educationalGoal} />
          <TextSection title={labels.advice} body={detail.advice} />
          <TextSection title={labels.books} body={detail.books} />
          <TextSection title={labels.requiredKnowledge} body={detail.requiredKnowledge} />

          <section className="detail-section">
            <h2>{labels.activityGoals}</h2>
            <div className="goal-list">
              {detail.activityGoals.map((goal) => (
                <article key={goal.index}>
                  <strong>{goal.index}</strong>
                  <span>{goal.type}</span>
                  <p>{goal.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="detail-section">
            <h2>{labels.evaluation}</h2>
            <div className="evaluation-grid">
              {detail.evaluationWeights.map((row) => (
                <article key={row.label}>
                  <h3>{row.label}</h3>
                  <div>
                    {row.values.map((value, index) => (
                      <span key={`${row.label}-${index}`}>{value}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="detail-section split-section">
            <div>
              <h2>{labels.ideal}</h2>
              <p className="preline">{detail.achievementLevels.ideal}</p>
            </div>
            <div>
              <h2>{labels.standard}</h2>
              <p className="preline">{detail.achievementLevels.standard}</p>
            </div>
          </section>

          <TextSection title={labels.clip} body={detail.clipProcess} />

          <section className="detail-section">
            <h2>{labels.lessons}</h2>
            {detail.lessons.length ? (
              <div className="lesson-list">
                {detail.lessons.map((lesson) => (
                  <article key={lesson.index}>
                    <div className="lesson-index">{lesson.index}</div>
                    <div>
                      <h3>{labels.lessonContent}</h3>
                      <p className="preline">{lesson.content}</p>
                    </div>
                    <div>
                      <h3>{labels.lessonOperation}</h3>
                      <p className="preline">{lesson.operation}</p>
                    </div>
                    <div>
                      <h3>{labels.lessonAssignments}</h3>
                      <p className="preline">{lesson.assignments}</p>
                    </div>
                    <div>
                      <h3>{labels.lessonMinutes}</h3>
                      <p className="preline">{lesson.minutes}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">この科目の授業明細は取得データ内で確認できませんでした。</p>
            )}
          </section>
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
