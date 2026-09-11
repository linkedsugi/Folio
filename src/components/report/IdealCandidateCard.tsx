/**
 * 인재상 카드. (기획서 04)
 *
 * 사람의 성격을 추측하지 않는다. 팀이 맡기려는 일과 기대 수준을 구체적으로 보여준다.
 * 네 가지를 고정으로 담는다: 핵심 역할 / 책임 수준 / 필수·우대 / 판단 근거.
 */
import {
  REQUIREMENT_DERIVATION_LABEL,
  RESPONSIBILITY_LEVEL_LABEL,
  type IdealCandidate,
  type Requirement,
} from "@/lib/types";
import { RefinedMark } from "./RefinedMark";
import type { RefinedLookup } from "./refined";

export function IdealCandidateCard({
  ideal,
  requirements,
  compact = false,
  refined,
}: {
  ideal: IdealCandidate;
  requirements: Requirement[];
  compact?: boolean;
  /** 정밀 분석이 다듬은 자리 조회. 넘기지 않으면 표식이 하나도 뜨지 않는다. */
  refined?: RefinedLookup;
}) {
  const must = requirements.filter((r) => r.kind === "must");
  const preferred = requirements.filter((r) => r.kind === "preferred");

  return (
    <section className="rounded-sm border border-rule bg-canvas">
      <header className="border-b border-rule bg-surface-sunken px-5 py-4 sm:px-6">
        <p className="text-[12px] font-semibold tracking-wide text-brand">모집팀의 인재상</p>
        <p className="mt-1.5 text-[16px] leading-relaxed font-bold text-ink sm:text-[17px]">
          {ideal.oneLine}
          <RefinedMark refined={refined?.("idealCandidate:oneLine")} />
        </p>
      </header>

      <div className="divide-y divide-rule">
        <Row label="핵심 역할" hint="가장 중요한 업무 3개와 기대하는 결과">
          <ul className="space-y-2">
            {ideal.coreTasks.map((t) => (
              <li key={t.id} className="text-[15px] leading-relaxed">
                <span className="font-medium text-ink">{t.task}</span>
                <span className="mx-2 text-ink-faint">→</span>
                <span className="text-ink-muted">{t.expectedOutcome}</span>
              </li>
            ))}
          </ul>
        </Row>

        <Row label="책임 수준" hint="단순 참여 / 독립 수행 / 과제 리드 / 조직 책임 중 요구되는 범위">
          <p className="text-[15px] leading-relaxed">
            <span className="rounded-sm bg-brand-soft px-2 py-1 text-[14px] font-semibold text-brand">
              {RESPONSIBILITY_LEVEL_LABEL[ideal.responsibilityLevel]}
            </span>
            {ideal.responsibilityNote ? (
              <span className="ml-2 text-ink-muted">{ideal.responsibilityNote}</span>
            ) : null}
          </p>
        </Row>

        <Row label="필수·우대" hint="동등 경험 허용 여부도 함께 표시">
          <div className="space-y-3">
            <ReqList items={must} kind="must" />
            <ReqList items={preferred} kind="preferred" />
          </div>
          {/*
            공고에 적힌 조건과, 앱이 읽어낸 해석은 다른 무게를 가진다.
            해석이 유용하더라도 사실과 같은 자리에 놓으면 안 된다.
          */}
          {requirements.some((r) => r.derivation === "inferred") ? (
            <p className="mt-3 rounded-sm bg-surface px-3 py-2 text-[12px] leading-snug text-ink-muted">
              <span className="font-semibold text-ink">읽는 법</span> — 점선 테두리 항목은 공고에
              직접 적힌 조건이 아니라, 업무 설명에서 앱이 읽어낸 해석입니다. 모집팀의 공식 요건과는
              다를 수 있습니다.
            </p>
          ) : null}
        </Row>

        {compact ? null : (
          <Row label="판단 근거" hint="왜 이렇게 해석했나요?">
            <details className="group">
              <summary className="cursor-pointer list-none text-[15px] font-medium text-brand underline-offset-2 hover:underline">
                해당 JD 문구와 설명 확인
                <span className="ml-1.5 inline-block transition-transform group-open:rotate-90">›</span>
              </summary>
              <ol className="mt-3 space-y-3.5">
                {ideal.rationale.map((r, i) => (
                  <li key={i} className="border-l-2 border-rule pl-4">
                    <p className="text-[15px] leading-relaxed font-medium text-ink">{r.claim}</p>
                    {r.evidence.map((e, j) => (
                      <blockquote
                        key={j}
                        className="mt-1.5 bg-surface px-3 py-2 text-[14px] leading-relaxed text-ink-muted italic"
                      >
                        “{e.quote}”
                      </blockquote>
                    ))}
                    <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
                      {r.interpretation}
                    </p>
                  </li>
                ))}
              </ol>
            </details>
          </Row>
        )}
      </div>
    </section>
  );
}

/* 라벨과 설명이 왼쪽, 내용이 오른쪽. 두 단 사이가 좁으면 어느 쪽이 답인지 눈이 헤맨다. */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 px-5 py-4 sm:grid-cols-[8rem_1fr] sm:gap-5 sm:px-6">
      <div>
        <p className="text-[14px] font-bold text-ink">{label}</p>
        <p className="hidden text-[12px] leading-snug text-ink-faint sm:block">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ReqList({ items, kind }: { items: Requirement[]; kind: "must" | "preferred" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-semibold text-ink-muted">
        {kind === "must" ? "필수" : "우대"}
      </p>
      <ul className="flex flex-wrap gap-2">
        {items.map((r) => (
          <li
            key={r.id}
            className={[
              "rounded-sm px-2.5 py-1 text-[13px]",
              // 해석으로 만든 조건은 점선으로 구분한다.
              r.derivation === "inferred" ? "border border-dashed" : "border",
              kind === "must"
                ? "border-rule-strong bg-surface-sunken font-medium text-ink"
                : "border-rule bg-canvas text-ink-muted",
            ].join(" ")}
            title={
              r.derivation === "inferred"
                ? `${REQUIREMENT_DERIVATION_LABEL[r.derivation]} — ${r.inferenceNote ?? r.text}`
                : `${REQUIREMENT_DERIVATION_LABEL[r.derivation]} — ${r.text}`
            }
          >
            {r.label}
            {/* 동등 경험 인정 여부는 지원 판단을 바꾸므로 조건 옆에 바로 붙인다. */}
            {r.equivalence === "allowed" ? (
              <span className="ml-1.5 text-[11px] font-semibold text-ok">동등 인정</span>
            ) : r.equivalence === "unknown" ? (
              <span className="ml-1.5 text-[11px] font-semibold text-warn">동등 여부 확인 필요</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
