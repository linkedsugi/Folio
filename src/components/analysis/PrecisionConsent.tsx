/**
 * 정밀 분석 동의 — 분석을 시작하기 전에 지원자가 보는 자리.
 *
 * 이 앱의 기본은 "자료가 이 기기를 떠나지 않는" 것이다. 정밀 분석은 그 선을 넘으므로
 * 관리자가 켜 두었더라도 **지원자가 이번 분석에 대해 직접 동의해야** 보낸다.
 * 그래서 체크박스는 언제나 해제 상태에서 시작하고, 미리 체크해 두지 않는다.
 *
 * 쓸 수 없을 때는 체크박스를 아예 띄우지 않는다 —
 * 눌러도 아무 일이 일어나지 않는 선택지를 보여 주면, 동의는 형식이 되고
 * 사용자는 자기 자료가 어디로 가는지 판단할 근거를 잃는다.
 */
"use client";

import { useId } from "react";
import { Disclosure } from "@/components/ui";

export interface PrecisionConsentProps {
  /** 지금 이 분석에서 정밀 분석을 쓸 수 있는가 (canUseLlm 의 동의 이전 조건) */
  available: boolean;
  /** 쓸 수 없다면 왜인지 — llmUnavailableReason 의 문장을 그대로 보여 준다 */
  unavailableReason: string | null;
  /** 관리자가 고른 모델의 이름. 어디로 보내는지 지원자가 알고 동의해야 한다. */
  modelLabel: string;
  consented: boolean;
  onChange: (v: boolean) => void;
}

export function PrecisionConsent({
  available,
  unavailableReason,
  modelLabel,
  consented,
  onChange,
}: PrecisionConsentProps) {
  const id = useId();
  const checkboxId = `${id}-consent`;
  const hintId = `${id}-hint`;

  // 쓸 수 없는 기능은 담담하게 알리고 끝낸다. 결과는 그대로 나오므로 사과할 일도 아니다.
  if (!available) {
    return (
      <section className="min-w-0 rounded-sm border border-rule bg-surface px-4 py-3">
        <p className="text-[13px] font-semibold text-ink">이 기기 안에서만 분석합니다</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          {unavailableReason ?? "지금은 정밀 분석을 쓸 수 없습니다."} 공고와 이력은 밖으로 나가지
          않으며, 분석 결과는 그대로 나옵니다.
        </p>
      </section>
    );
  }

  return (
    <section className="min-w-0 rounded-sm border border-rule bg-canvas px-4 py-3">
      <label htmlFor={checkboxId} className="flex cursor-pointer items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          checked={consented}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]"
        />
        <span className="min-w-0">
          <span className="block text-[14px] leading-snug font-semibold text-ink">
            내 공고와 이력을 {modelLabel} 에 보내 더 정확하게 분석합니다.
          </span>
          <span id={hintId} className="mt-1 block text-[13px] leading-relaxed text-ink-muted">
            동의하지 않으면 이 기기 안에서만 분석하며, 결과는 그대로 나옵니다.
          </span>
        </span>
      </label>

      {/* 무엇이 나가는지 확인하지 않고도 동의할 수 있으면, 그 동의는 근거가 없다. */}
      <Disclosure summary="무엇이 전송되나요?" className="mt-3 min-w-0">
        <div className="space-y-3">
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-ink">보내는 것</p>
            <ul className="mt-1 space-y-1 text-[13px] leading-relaxed text-ink-muted">
              <li>· 공고 본문 — 붙여 넣은 채용 공고 전체</li>
              <li>· 입력한 이력 — 경험·기술·학력 등 분석에 쓰는 항목</li>
              <li>· 규칙 기반 분석 결과 — 이 기기에서 먼저 계산한 매칭 결과</li>
            </ul>
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-ink">보내지 않는 것</p>
            <ul className="mt-1 space-y-1 text-[13px] leading-relaxed text-ink-muted">
              <li>· 이메일·전화번호·주소 등 연락처 — 분석에 필요하지 않습니다</li>
              <li>· 로그인 계정 정보</li>
              <li>· 완성한 이력서 파일</li>
            </ul>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-faint">
            동의는 이번 분석에만 적용됩니다. 전송이 실패하면 이 기기에서 계산한 결과가 그대로
            나오고, 왜 그렇게 됐는지 분석서에 적힙니다.
          </p>
        </div>
      </Disclosure>
    </section>
  );
}
