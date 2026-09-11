/**
 * 시작 화면. (기획서 10)
 *
 * "공고와 이력으로 지원 준비를 시작하세요" — 내 자료 시작 / 샘플 5종 체험.
 *
 * 샘플을 앞에 두는 이유: 이 앱의 결과물은 설명만으로는 감이 오지 않는다.
 * 직군별 샘플로 인재상·매칭·스토리·준비 과제·이력서까지 먼저 보게 한다.
 */
"use client";

import type { Application, SamplePackage } from "@/lib/types";

export interface StartScreenProps {
  samples: SamplePackage[];
  applications: Application[];
  onStartOwn: () => void;
  onStartSample: (id: SamplePackage["id"]) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function StartScreen({
  samples,
  applications,
  onStartOwn,
  onStartSample,
  onOpen,
  onDelete,
}: StartScreenProps) {
  return (
    <div className="space-y-10">
      {/*
        히어로는 이 앱의 첫인상이다. 지원 준비는 그 자체로 불안한 일이라,
        첫 화면부터 빽빽하면 시작하기도 전에 사람을 몰아붙인다.
        여백을 넉넉히 두어 읽을 마음이 생기게 한다.
      */}
      <section className="rounded-sm border border-rule bg-canvas px-6 py-8 shadow-card sm:px-10 sm:py-12">
        <p className="text-[12px] font-semibold tracking-wide text-brand">
          MINDCANVAS / ROLEFIT CANVAS
        </p>
        <h1 className="mt-3 text-2xl leading-tight font-bold text-ink sm:text-3xl">
          공고와 이력으로
          <br />
          지원 준비를 시작하세요
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
          지원할 회사의 공고와 나의 이력을 연결해, 무엇을 보여주고 무엇을 더 준비할지 알려줍니다.
          하나의 지원에서 <strong className="font-bold text-ink">기업에 낼 이력서</strong>와{" "}
          <strong className="font-bold text-ink">나만 보는 지원전략 분석서</strong>가 함께 나옵니다.
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <Deliverable
            eyebrow="결과물 01 · 기업 제출용"
            title="맞춤형 Resume / CV"
            body="직무에 맞춘 내용·구성·문장과 선택한 템플릿으로 완성하는 이력서"
            tone="ink"
          />
          <Deliverable
            eyebrow="결과물 02 · 지원자 전용"
            title="지원전략 분석서"
            body="모집팀의 인재상과 현재·스토리텔링 후·목표 매칭률, 목표에 도달할 실행 과제"
            tone="soft"
          />
        </div>

        {/*
          이 세 단계가 앱 전체의 뼈대다. 여기서 "현재 → 스토리텔링 후 → 목표"를 이해하지 못하면
          이후 화면의 수치 세 개도 읽히지 않는다. 그래서 히어로 안에서 가장 크게 잡는다.
        */}
        <div className="mt-7 rounded-sm bg-brand-soft px-5 py-5 sm:px-6 sm:py-6">
          <p className="text-[15px] font-bold text-brand">분석은 세 단계로 진행됩니다</p>
          <ol className="mt-3 grid gap-4 text-[14px] leading-relaxed text-ink sm:grid-cols-3">
            <li>
              <span className="font-bold text-now">① 현재</span> — 직접 수행한 사실만으로 맞춰 보기
              <span className="mt-1 block text-[13px] text-ink-faint">→ 이력서 1 · Baseline</span>
            </li>
            <li>
              <span className="font-bold text-story">② 스토리텔링 후</span> — 이미 가진 관련 경험까지 연결
              <span className="mt-1 block text-[13px] text-ink-faint">→ 이력서 2 · 제출용</span>
            </li>
            <li>
              <span className="font-bold text-goal">③ 목표</span> — 부족분을 과제와 목표로
              <span className="mt-1 block text-[13px] text-ink-faint">→ 이력서 3 · 미래(계획)</span>
            </li>
          </ol>
        </div>

        <button
          type="button"
          onClick={onStartOwn}
          className="mt-7 w-full rounded-sm bg-ink px-6 py-3.5 text-[16px] font-bold text-white shadow-card transition-shadow hover:bg-ink-strong hover:shadow-raised sm:w-auto"
        >
          내 자료로 시작
        </button>
      </section>

      {applications.length > 0 ? (
        <section>
          <h2 className="text-lg font-bold text-ink">진행 중인 지원</h2>
          <p className="mt-1 text-[13px] text-ink-muted">지원 회사별로 문서를 따로 보관합니다.</p>
          <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-sm border border-rule bg-canvas shadow-card">
            {applications.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <button
                  type="button"
                  onClick={() => onOpen(a.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block text-[14px] font-bold text-ink">{a.name}</span>
                  <span className="block text-[12px] text-ink-muted">
                    {a.posting?.company ?? "공고 미입력"}
                    {a.posting?.roleTitle ? ` · ${a.posting.roleTitle}` : ""}
                    {a.report
                      ? ` · ${a.report.overall.display.current}% → ${a.report.overall.display.afterStory}% → ${a.report.overall.display.target}%`
                      : ""}
                  </span>
                </button>
                {a.sampleId ? (
                  <span className="shrink-0 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[12px] font-medium text-ink-muted">
                    샘플
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onDelete(a.id)}
                  className="shrink-0 rounded-sm px-1.5 py-0.5 text-[12px] text-ink-faint hover:text-danger"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-lg font-bold text-ink">샘플 5종으로 먼저 체험</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-muted">
          샘플마다 공고와 지원자 이력을 함께 제공하고, 인재상·매칭·스토리·준비 과제·이력서까지
          연결해 보여줍니다. 회사·인물·수치는 모두 가상입니다.
        </p>
        {/*
          샘플은 설명을 대신하는 자리다. 카드가 작으면 읽고 지나가지만,
          크고 떠오르면 눌러 보게 된다 — 눌러 봐야 이 앱이 무엇인지 알 수 있다.
        */}
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {samples.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onStartSample(s.id)}
                className="flex h-full w-full flex-col rounded-sm border border-rule bg-canvas p-5 text-left shadow-card transition-all hover:border-ink hover:shadow-raised"
              >
                <p className="text-[12px] font-semibold tracking-wide text-brand">{s.label}</p>
                <p className="mt-2 text-[16px] font-bold text-ink">{s.posting.roleTitle}</p>
                <p className="mt-0.5 text-[13px] text-ink-muted">{s.posting.company}</p>
                <p className="mt-3 flex-1 text-[13px] leading-relaxed text-ink-muted">{s.tagline}</p>
                <p className="tabular mt-4 text-[16px] font-bold">
                  <span className="text-now">{s.report.overall.display.current}%</span>
                  <span className="mx-1.5 text-ink-faint">→</span>
                  <span className="text-story">{s.report.overall.display.afterStory}%</span>
                  <span className="mx-1.5 text-ink-faint">→</span>
                  <span className="text-goal">{s.report.overall.display.target}%</span>
                </p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  현재 → 스토리텔링 후 → 목표 (직무 매칭률)
                </p>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-rule pt-6 text-[12px] leading-relaxed text-ink-faint">
        <p>
          수치는 합격확률이 아닌 직무 매칭률입니다. 이 앱은 근거 없는 내용을 추가하지 않으며,
          자료에 없는 것은 “확인 필요”로 남깁니다. 직무와 무관한 나이·성별·외모·종교·가족관계로
          인재상이나 점수를 만들지 않습니다.
        </p>
        <p className="mt-2">
          지원자 자료와 분석서는 기본 비공개이며 이 브라우저에만 보관됩니다.
        </p>
      </footer>
    </div>
  );
}

function Deliverable({
  eyebrow,
  title,
  body,
  tone,
}: {
  eyebrow: string;
  title: string;
  body: string;
  tone: "ink" | "soft";
}) {
  return (
    <div
      className={
        tone === "ink"
          ? "rounded-sm border-2 border-ink bg-canvas px-5 py-4 shadow-card"
          : "rounded-sm border border-rule-strong bg-surface px-5 py-4"
      }
    >
      <p
        className={`text-[12px] font-semibold tracking-wide ${tone === "ink" ? "text-ink" : "text-ink-muted"}`}
      >
        {eyebrow}
      </p>
      <p className="mt-1 text-[16px] font-bold text-ink">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}
