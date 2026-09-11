/**
 * 지금의 판단 + 필수 조건 상태. (기획서 04·07)
 *
 * 총점과 필수 조건은 서로 다른 정보다.
 * 전체 목표가 72%여도 필수 경력 5년을 충족했다는 뜻이 아니고,
 * 100%에 도달해야만 지원할 수 있다고 안내하지도 않는다.
 */
import {
  MUST_HAVE_STATE_LABEL,
  VERDICT_GUIDANCE,
  VERDICT_LABEL,
  type ApplicationVerdict,
  type MustHaveStatus,
} from "@/lib/types";

const STATE_TONE: Record<MustHaveStatus["state"], string> = {
  met: "bg-ok-soft text-ok",
  "partially-met": "bg-story-soft text-story",
  "not-met": "bg-danger-soft text-danger",
  "needs-confirmation": "bg-warn-soft text-warn",
};

export function VerdictPanel({
  verdict,
  note,
  mustHave,
}: {
  verdict: ApplicationVerdict;
  note: string;
  mustHave: MustHaveStatus[];
}) {
  return (
    <section className="rounded-sm border border-rule bg-canvas">
      <div className="border-b border-rule px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold tracking-wide text-brand">지금의 판단</span>
          <span className="rounded-sm bg-ink px-2 py-0.5 text-[12px] font-bold text-white">
            {VERDICT_LABEL[verdict]}
          </span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink">{note}</p>
        <p className="mt-1 text-[13px] text-ink-muted">{VERDICT_GUIDANCE[verdict]}</p>
      </div>

      <div className="px-4 py-3 sm:px-5">
        <p className="text-[13px] font-bold text-ink">필수 조건</p>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">
          전체 매칭률과는 별개의 정보입니다. 총점이 올라도 필수 조건 충족을 뜻하지 않습니다.
        </p>
        {mustHave.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-muted">공고에서 필수 조건을 찾지 못했습니다.</p>
        ) : (
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {mustHave.map((m) => (
              <li key={m.requirementId} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
                <span
                  className={`h-fit shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${STATE_TONE[m.state]}`}
                >
                  {MUST_HAVE_STATE_LABEL[m.state]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">{m.label}</p>
                  {m.note ? <p className="text-[12px] text-ink-muted">{m.note}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
