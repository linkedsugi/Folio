/**
 * 인재상 카드. (기획서 04)
 *
 * 사람의 성격을 추측하지 않는다. 팀이 맡기려는 일과 기대 수준을 구체적으로 보여준다.
 * 네 가지를 고정으로 담는다: 핵심 역할 / 책임 수준 / 필수·우대 / 판단 근거.
 */
import {
  RESPONSIBILITY_LEVEL_LABEL,
  type IdealCandidate,
  type Requirement,
} from "@/lib/types";

export function IdealCandidateCard({
  ideal,
  requirements,
  compact = false,
}: {
  ideal: IdealCandidate;
  requirements: Requirement[];
  compact?: boolean;
}) {
  const must = requirements.filter((r) => r.kind === "must");
  const preferred = requirements.filter((r) => r.kind === "preferred");

  return (
    <section className="rounded-sm border border-rule bg-canvas">
      <header className="border-b border-rule bg-surface-sunken px-4 py-3 sm:px-5">
        <p className="text-[11px] font-semibold tracking-wide text-brand">모집팀의 인재상</p>
        <p className="mt-1 text-[15px] leading-snug font-bold text-ink sm:text-base">
          {ideal.oneLine}
        </p>
      </header>

      <div className="divide-y divide-rule">
        <Row label="핵심 역할" hint="가장 중요한 업무 3개와 기대하는 결과">
          <ul className="space-y-1.5">
            {ideal.coreTasks.map((t) => (
              <li key={t.id} className="text-sm">
                <span className="font-medium text-ink">{t.task}</span>
                <span className="mx-1.5 text-ink-faint">→</span>
                <span className="text-ink-muted">{t.expectedOutcome}</span>
              </li>
            ))}
          </ul>
        </Row>

        <Row label="책임 수준" hint="단순 참여 / 독립 수행 / 과제 리드 / 조직 책임 중 요구되는 범위">
          <p className="text-sm">
            <span className="rounded-sm bg-brand-soft px-1.5 py-0.5 text-[13px] font-semibold text-brand">
              {RESPONSIBILITY_LEVEL_LABEL[ideal.responsibilityLevel]}
            </span>
            {ideal.responsibilityNote ? (
              <span className="ml-2 text-ink-muted">{ideal.responsibilityNote}</span>
            ) : null}
          </p>
        </Row>

        <Row label="필수·우대" hint="동등 경험 허용 여부도 함께 표시">
          <div className="space-y-2">
            <ReqList items={must} kind="must" />
            <ReqList items={preferred} kind="preferred" />
          </div>
        </Row>

        {compact ? null : (
          <Row label="판단 근거" hint="왜 이렇게 해석했나요?">
            <details className="group">
              <summary className="cursor-pointer list-none text-sm font-medium text-brand underline-offset-2 hover:underline">
                해당 JD 문구와 설명 확인
                <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
              </summary>
              <ol className="mt-2 space-y-2.5">
                {ideal.rationale.map((r, i) => (
                  <li key={i} className="border-l-2 border-rule pl-3">
                    <p className="text-sm font-medium text-ink">{r.claim}</p>
                    {r.evidence.map((e, j) => (
                      <blockquote
                        key={j}
                        className="mt-1 bg-surface px-2 py-1 text-[13px] text-ink-muted italic"
                      >
                        “{e.quote}”
                      </blockquote>
                    ))}
                    <p className="mt-1 text-[13px] text-ink-muted">{r.interpretation}</p>
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
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[7.5rem_1fr] sm:gap-4 sm:px-5">
      <div>
        <p className="text-[13px] font-bold text-ink">{label}</p>
        <p className="hidden text-[11px] leading-snug text-ink-faint sm:block">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ReqList({ items, kind }: { items: Requirement[]; kind: "must" | "preferred" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-ink-muted">
        {kind === "must" ? "필수" : "우대"}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((r) => (
          <li
            key={r.id}
            className={[
              "rounded-sm border px-1.5 py-0.5 text-[12px]",
              kind === "must"
                ? "border-rule-strong bg-surface-sunken font-medium text-ink"
                : "border-rule bg-canvas text-ink-muted",
            ].join(" ")}
            title={r.text}
          >
            {r.label}
            {/* 동등 경험 인정 여부는 지원 판단을 바꾸므로 조건 옆에 바로 붙인다. */}
            {r.equivalence === "allowed" ? (
              <span className="ml-1 text-[10px] font-semibold text-ok">동등 인정</span>
            ) : r.equivalence === "unknown" ? (
              <span className="ml-1 text-[10px] font-semibold text-warn">동등 여부 확인 필요</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
