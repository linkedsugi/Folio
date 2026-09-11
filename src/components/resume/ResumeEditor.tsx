/**
 * 문장 편집기. (기획서 08·10)
 *
 * 사용자는 문장을 채택·수정·제외할 수 있고, "왜 이 경험을 넣었나요?" 로
 * 해당 JD 기대와 원래 경험을 확인한다.
 * 틀린 사실을 수정하면 관련 분석과 이력서에 함께 반영되어야 하므로,
 * 이 컴포넌트는 상태를 직접 바꾸지 않고 변경 요청만 위로 올린다.
 */
"use client";

import { useEffect, useState } from "react";
import type { ExperienceItem, ResumeLine } from "@/lib/types";

export interface ResumeLinePatch {
  text?: string;
  status?: ResumeLine["status"];
}

export function ResumeEditor({
  line,
  experience,
  onChange,
  onClose,
  readOnlyReason,
}: {
  line: ResumeLine;
  experience?: ExperienceItem;
  onChange: (patch: ResumeLinePatch) => void;
  onClose: () => void;
  /** 편집할 수 없는 판본(미래 계획)에서 이유를 보여준다 */
  readOnlyReason?: string;
}) {
  const [text, setText] = useState(line.text);

  // 다른 문장을 선택하면 편집 중인 내용을 그 문장으로 바꾼다.
  useEffect(() => setText(line.text), [line.id, line.text]);

  const dirty = text.trim() !== line.text.trim();
  const edited = line.status === "edited" || line.text !== line.original;

  return (
    <aside className="rounded-sm border border-rule-strong bg-canvas" aria-label="문장 편집">
      <header className="flex items-center justify-between gap-2 border-b border-rule bg-surface-sunken px-3 py-2">
        <p className="text-[12px] font-bold text-ink">문장 편집</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm px-1.5 text-[12px] text-ink-muted hover:text-ink"
          aria-label="편집 닫기"
        >
          닫기 ✕
        </button>
      </header>

      <div className="space-y-3 px-3 py-3">
        {readOnlyReason ? (
          <p className="rounded-sm bg-goal-soft px-2 py-1.5 text-[12px] leading-snug text-goal">
            {readOnlyReason}
          </p>
        ) : null}

        <div>
          <label htmlFor={`line-${line.id}`} className="text-[11px] font-semibold text-ink-faint">
            제출 문안
          </label>
          <textarea
            id={`line-${line.id}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            disabled={Boolean(readOnlyReason)}
            className="mt-1 w-full rounded-sm border border-rule-strong bg-canvas px-2 py-1.5 text-[13px] leading-relaxed text-ink disabled:bg-surface disabled:text-ink-muted"
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={!dirty || Boolean(readOnlyReason)}
              onClick={() => onChange({ text: text.trim(), status: "edited" })}
              className="rounded-sm bg-ink px-2.5 py-1 text-[12px] font-medium text-white disabled:bg-rule-strong"
            >
              수정 반영
            </button>
            <button
              type="button"
              disabled={Boolean(readOnlyReason)}
              onClick={() =>
                onChange({
                  status: line.status === "excluded" ? "adopted" : "excluded",
                })
              }
              className="rounded-sm border border-rule-strong px-2.5 py-1 text-[12px] font-medium text-ink-muted hover:border-ink hover:text-ink"
            >
              {line.status === "excluded" ? "다시 포함" : "이 문장 제외"}
            </button>
            {edited ? (
              <button
                type="button"
                disabled={Boolean(readOnlyReason)}
                onClick={() => {
                  setText(line.original);
                  onChange({ text: line.original, status: "adopted" });
                }}
                className="rounded-sm px-2 py-1 text-[12px] text-ink-muted underline-offset-2 hover:underline"
              >
                원래 문장으로
              </button>
            ) : null}
          </div>
        </div>

        {/* "왜 이 경험을 넣었나요?" — 해당 JD 기대와 원래 경험 */}
        <details className="border-t border-rule pt-2.5" open>
          <summary className="cursor-pointer list-none text-[12px] font-medium text-brand hover:underline">
            왜 이 경험을 넣었나요?
          </summary>
          <dl className="mt-2 space-y-2">
            {line.jdExpectation ? (
              <div>
                <dt className="text-[11px] font-semibold text-ink-faint">공고의 기대</dt>
                <dd className="text-[12px] text-ink">{line.jdExpectation}</dd>
              </div>
            ) : null}
            {experience ? (
              <div>
                <dt className="text-[11px] font-semibold text-ink-faint">원래 경험</dt>
                <dd className="text-[12px]">
                  <span className="font-medium text-ink">{experience.organization}</span>
                  <span className="mx-1 text-ink-faint">·</span>
                  <span className="text-ink-muted">{experience.title}</span>
                  {experience.ownRole ? (
                    <span className="block text-ink-muted">본인 역할: {experience.ownRole}</span>
                  ) : null}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-[11px] font-semibold text-ink-faint">근거 종류</dt>
              <dd className="text-[12px] text-ink-muted">
                {line.basis === "direct"
                  ? "직접 수행한 사실입니다."
                  : line.basis === "related"
                    ? "이미 가진 관련 경험을 이 직무와 연결해 설명한 문장입니다."
                    : "아직 하지 않은 계획입니다. 제출용 문서에는 넣을 수 없습니다."}
              </dd>
            </div>
            {edited ? (
              <div>
                <dt className="text-[11px] font-semibold text-ink-faint">원래 문장</dt>
                <dd className="text-[12px] text-ink-muted italic">“{line.original}”</dd>
              </div>
            ) : null}
          </dl>
        </details>
      </div>
    </aside>
  );
}
