/**
 * 합격 가능성 스토리. (사용자 확정 요구 4)
 *
 * 매칭 점수를 보여주는 것으로 끝내지 않는다. 사용자가 스스로 답할 수 있어야 한다:
 *   이 팀이 나를 검토할 이유는? / 어떤 부분을 우려할까? /
 *   그 우려에 내 경험으로 어떻게 답하나? / 어떤 조건이면 지금 지원할 만한가?
 *
 * 숫자와 이야기를 화면에서도 섞지 않는다.
 * 매칭률은 위쪽 3단계 패널이 맡고, 이 패널은 수치를 다시 말하지 않는다.
 *
 * 이 패널은 이 화면에서 가장 오래 읽는 글이다. 그래서 줄간격과 항목 사이를 넉넉히 둔다 —
 * 지원 준비는 이미 불안한 일이고, 빽빽한 화면은 그 자체로 사람을 몰아붙인다.
 */
import type { ApplicantProfile, CandidacyCase } from "@/lib/types";
import { RefinedMark } from "./RefinedMark";
import type { RefinedLookup } from "./refined";

export function CandidacyPanel({
  candidacy,
  profile,
  refined,
}: {
  candidacy: CandidacyCase;
  profile: ApplicantProfile;
  /** 정밀 분석이 다듬은 자리 조회. 넘기지 않으면 표식이 하나도 뜨지 않는다. */
  refined?: RefinedLookup;
}) {
  const future = candidacy.stage === "future";
  // 경로 앞머리는 서버가 쓰는 이름 그대로다: candidacyNow / candidacyFuture.
  const at = future ? "candidacyFuture" : "candidacyNow";

  return (
    <section
      className={[
        "rounded-sm border bg-canvas",
        future ? "border-goal-rule" : "border-rule-strong",
      ].join(" ")}
    >
      <header
        className={[
          "border-b px-5 py-4",
          future ? "border-goal-rule bg-goal-soft" : "border-rule bg-surface-sunken",
        ].join(" ")}
      >
        <p
          className={`text-[12px] font-semibold tracking-wide ${future ? "text-goal" : "text-brand"}`}
        >
          {future ? "실행 과제를 마쳤다면" : "지금 지원한다면"}
        </p>
        <h3 className="mt-1 text-[16px] leading-relaxed font-bold text-ink">
          {candidacy.headline}
          <RefinedMark refined={refined?.(`${at}:headline`)} />
        </h3>
      </header>

      <div className="divide-y divide-rule">
        <Block
          label="이 팀이 검토할 이유"
          hint="모집팀의 기대와 직접 맞물리는 근거"
        >
          <ul className="space-y-2.5">
            {candidacy.reasonsToConsider.map((r, i) => (
              <li key={i} className="flex gap-2 text-[14px] leading-relaxed">
                <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-ok" />
                <span>
                  {r}
                  <RefinedMark refined={refined?.(`${at}:reasonsToConsider:${i}`)} />
                </span>
              </li>
            ))}
          </ul>
        </Block>

        <Block
          label="우려와 답"
          hint="우려를 지우지 않고, 내 경험으로 어디까지 답할 수 있는지 적는다"
        >
          <ul className="space-y-4">
            {candidacy.concerns.map((c, i) => {
              const used = profile.experiences.filter((e) => c.evidenceIds.includes(e.id));
              return (
                <li key={i} className="rounded-sm border border-rule bg-surface px-4 py-3.5">
                  <p className="text-[14px] leading-relaxed font-bold text-warn">
                    {c.concern}
                    <RefinedMark refined={refined?.(`${at}:concerns:${i}:concern`)} />
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink">
                    <span className="font-semibold">답: </span>
                    {c.response}
                    <RefinedMark refined={refined?.(`${at}:concerns:${i}:response`)} />
                  </p>
                  {used.length > 0 ? (
                    <ul className="mt-2.5 flex flex-wrap gap-1.5">
                      {used.map((e) => (
                        <li
                          key={e.id}
                          className="rounded-sm bg-canvas px-2 py-1 text-[12px] text-ink-muted"
                          title={e.summary}
                        >
                          {e.organization} · {e.title}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {/*
                    답해도 남는 한계를 빼면 설득이 아니라 변명이 된다.
                    다만 답과 같은 바탕에 잇달아 두면 한계가 답의 꼬리처럼 읽힌다.
                    바탕을 한 단 낮춰, 읽기 전에 눈에서 먼저 갈리게 한다.
                  */}
                  <p className="mt-3 rounded-sm bg-surface-sunken px-3 py-2 text-[13px] leading-relaxed text-ink-muted">
                    <span className="font-semibold text-ink">그래도 남는 것: </span>
                    {c.honestLimit}
                    <RefinedMark refined={refined?.(`${at}:concerns:${i}:honestLimit`)} />
                  </p>
                </li>
              );
            })}
          </ul>
        </Block>

        <Block
          label="지금 지원을 검토할 조건"
          hint="이 조건이 정리되면 결정할 수 있다"
        >
          <ul className="space-y-2.5">
            {candidacy.conditions.map((c, i) => (
              <li key={i} className="flex gap-2 text-[14px] leading-relaxed">
                <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-brand" />
                <span>
                  {c}
                  <RefinedMark refined={refined?.(`${at}:conditions:${i}`)} />
                </span>
              </li>
            ))}
          </ul>
        </Block>
      </div>

      <footer className="border-t border-rule bg-surface px-5 py-3">
        <p className="text-[12px] leading-relaxed text-ink-faint">{candidacy.caution}</p>
      </footer>
    </section>
  );
}

function Block({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <div className="mb-2.5">
        <p className="text-[13px] font-bold text-ink">{label}</p>
        <p className="text-[12px] leading-snug text-ink-faint">{hint}</p>
      </div>
      {children}
    </div>
  );
}
