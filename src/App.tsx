import { useEffect, useMemo, useState } from "react";
import { courses, detailsByCourseId, type CourseSummary, type SyllabusDetail } from "./data/generated";

type View =
  | { name: "list" }
  | { name: "detail"; course: CourseSummary; detail?: SyllabusDetail; canonicalMismatch: boolean };

const semesterOrder = ["spring", "fall", "full-year"];

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function useLocationPath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

function routeToView(pathname: string): View {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "courses" || parts.length < 4) return { name: "list" };
  const [, year, semester, code, slug = ""] = parts;
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
    detail: detailsByCourseId[course.id],
    canonicalMismatch: course.courseNameSlug !== slug,
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
                  {detailsByCourseId[course.id] && <span className="detail-badge">詳細あり</span>}
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

function MetadataStrip({ course, detail }: { course: CourseSummary; detail?: SyllabusDetail }) {
  const items = [
    ["年度", course.yearLabel],
    ["学期", course.semesterLabel],
    ["科目コード", course.courseCodeLabel],
    ["単位", detail?.credits || "-"],
    ["履修方法", detail?.method || "-"],
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

function DetailPage({ course, detail, canonicalMismatch }: Extract<View, { name: "detail" }>) {
  return (
    <main>
      {canonicalMismatch && (
        <div className="canonical-warning">
          このリンクは開けますが、正規 URL は{" "}
          <button onClick={() => navigate(course.routePath)}>{course.routePath}</button>
          です。
        </div>
      )}
      <button className="back-button" onClick={() => navigate("/courses")}>
        ← 一覧へ戻る
      </button>
      <section className="detail-hero">
        <p className="eyebrow">
          {course.programLabel} / {course.departmentLabel ?? "全学"}
        </p>
        <h1>{course.courseName}</h1>
        {detail?.subtitle && <p className="subtitle">{detail.subtitle}</p>}
        <MetadataStrip course={course} detail={detail} />
      </section>

      {!detail && (
        <section className="empty-detail">
          <h2>共有 URL は作成済みです</h2>
          <p>
            この科目のフルシラバス本文はまだ取り込んでいません。検索結果由来の基本情報は URL に固定済みなので、今後の詳細取り込み時にも同じ共有リンクを使えます。
          </p>
          <code>{course.routePath}</code>
        </section>
      )}

      {detail && (
        <>
          <section className="detail-section teachers">
            <h2>担当教員</h2>
            <div className="teacher-list">
              {detail.teachers.map((teacher) => (
                <span key={teacher}>{teacher}</span>
              ))}
            </div>
          </section>

          <section className="detail-section">
            <h2>キーワード</h2>
            <div className="keyword-list">
              {detail.keywords.map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>
          </section>

          <TextSection title="学習・教育目標" body={detail.educationalGoal} />
          <TextSection title="授業の概要および学習上の助言" body={detail.advice} />
          <TextSection title="教科書および参考書" body={detail.books} />
          <TextSection title="履修に必要な予備知識や技能" body={detail.requiredKnowledge} />

          <section className="detail-section">
            <h2>学生が達成すべき行動目標</h2>
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
            <h2>達成度評価</h2>
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
              <h2>理想的な達成レベル</h2>
              <p className="preline">{detail.achievementLevels.ideal}</p>
            </div>
            <div>
              <h2>標準的な達成レベル</h2>
              <p className="preline">{detail.achievementLevels.standard}</p>
            </div>
          </section>

          <TextSection title="CLIP 学習プロセス" body={detail.clipProcess} />

          <section className="detail-section">
            <h2>授業明細</h2>
            <div className="lesson-list">
              {detail.lessons.map((lesson) => (
                <article key={lesson.index}>
                  <div className="lesson-index">{lesson.index}</div>
                  <div>
                    <h3>学習内容</h3>
                    <p className="preline">{lesson.content}</p>
                  </div>
                  <div>
                    <h3>運営方法</h3>
                    <p className="preline">{lesson.operation}</p>
                  </div>
                  <div>
                    <h3>学習課題</h3>
                    <p className="preline">{lesson.assignments}</p>
                  </div>
                  <div>
                    <h3>時間</h3>
                    <p className="preline">{lesson.minutes}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export function App() {
  const path = useLocationPath();
  const view = routeToView(path);
  return (
    <>
      <AppHeader />
      {view.name === "detail" ? <DetailPage {...view} /> : <CourseList />}
    </>
  );
}
