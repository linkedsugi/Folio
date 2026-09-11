/**
 * 계획을 사실로 옮기기.
 *
 * 실행 과제를 마치고 결과물과 본인 역할이 확인되면,
 * 이력서 3에서 [예정] 으로 있던 문장이 실제 이력서의 문장이 된다.
 *
 *   이력서 3 [예정] 문장  →  (증거 확인)  →  이력서 1·2 의 사실 문장
 *
 * 이 이동이 이 앱에서 "미래 이력서"가 목록이 아니라 설계도인 이유다.
 * 다만 옮기는 조건은 느슨하면 안 된다. 체크만으로는 옮기지 않는다.
 */

import type { ActionCard, ResumeDocument, ResumeLine, ResumeSet } from "@/lib/types";

/** 증거가 실제로 제출되었는가. 상태만 바꾸고 설명이 비어 있으면 아니다. */
export function isEvidenced(action: ActionCard): boolean {
  return action.status === "evidence-submitted" && Boolean(action.submittedEvidence?.trim());
}

function stripPlannedPrefix(text: string): string {
  return text.replace(/^\[예정\]\s*/, "");
}

/** 문서 안의 모든 문장을 순회하며 바꾼다. 섹션 직속 문장과 항목 안 문장 모두. */
function mapLines(doc: ResumeDocument, fn: (l: ResumeLine) => ResumeLine | null): ResumeDocument {
  return {
    ...doc,
    sections: doc.sections.map((s) => ({
      ...s,
      lines: s.lines.map(fn).filter((l): l is ResumeLine => l !== null),
      entries: s.entries.map((e) => ({
        ...e,
        lines: e.lines.map(fn).filter((l): l is ResumeLine => l !== null),
      })),
    })),
  };
}

function findLine(doc: ResumeDocument, id: string): ResumeLine | undefined {
  for (const s of doc.sections) {
    const direct = s.lines.find((l) => l.id === id);
    if (direct) return direct;
    for (const e of s.entries) {
      const inner = e.lines.find((l) => l.id === id);
      if (inner) return inner;
    }
  }
  return undefined;
}

/** 같은 문장이 이미 있는지. 옮긴 문장이 중복으로 쌓이는 것을 막는다. */
function hasText(doc: ResumeDocument, text: string): boolean {
  const norm = text.replace(/\s+/g, " ").trim();
  return doc.sections.some(
    (s) =>
      s.lines.some((l) => l.text.replace(/\s+/g, " ").trim() === norm) ||
      s.entries.some((e) => e.lines.some((l) => l.text.replace(/\s+/g, " ").trim() === norm)),
  );
}

/**
 * 문장을 문서에 넣는다.
 * 같은 부문의 문장이 이미 있는 섹션에 붙이고, 없으면 경력 섹션에, 그것도 없으면 첫 섹션에 붙인다.
 */
function appendLine(doc: ResumeDocument, line: ResumeLine): ResumeDocument {
  if (hasText(doc, line.text)) return doc;

  const byDimension = doc.sections.findIndex(
    (s) =>
      s.included &&
      (s.lines.some((l) => l.dimensionId === line.dimensionId) ||
        s.entries.some((e) => e.lines.some((l) => l.dimensionId === line.dimensionId))),
  );
  const byExperience = doc.sections.findIndex(
    (s) => s.included && s.entries.some((e) => e.experienceId === line.experienceId),
  );
  const byKind = doc.sections.findIndex((s) => s.included && s.kind === "experience");
  const index = [byDimension, byExperience, byKind].find((i) => i >= 0) ?? 0;

  return {
    ...doc,
    sections: doc.sections.map((s, i) => {
      if (i !== index) return s;
      // 해당 경험의 항목이 있으면 그 항목 안에, 없으면 섹션 직속으로 붙인다.
      const entryIndex = s.entries.findIndex((e) => e.experienceId === line.experienceId);
      if (entryIndex >= 0) {
        return {
          ...s,
          entries: s.entries.map((e, j) =>
            j === entryIndex ? { ...e, lines: [...e.lines, line] } : e,
          ),
        };
      }
      return { ...s, lines: [...s.lines, line] };
    }),
  };
}

export interface PromotionResult {
  resumes: ResumeSet;
  /** 실제로 옮겨진 과제와 문장 */
  promoted: { actionId: string; text: string; lineId: string }[];
  /** 옮기지 않은 과제와 이유 */
  skipped: { actionId: string; reason: string }[];
}

/**
 * 증거가 확인된 과제의 [예정] 문장을 사실 문장으로 옮긴다.
 *
 * 어디로 옮기는가:
 *  - 이력서 2 (제출용): 이제 사실이므로 들어간다.
 *  - 이력서 1 (Baseline): 직접 수행한 사실이므로 여기에도 들어간다.
 *  - 이력서 3 (미래): [예정] 표시를 떼고 남긴다. 계획이 아니라 달성한 것이 되었으므로.
 */
export function promoteCompletedActions(set: ResumeSet, actions: ActionCard[]): PromotionResult {
  const promoted: PromotionResult["promoted"] = [];
  const skipped: PromotionResult["skipped"] = [];

  let baseline = set.baseline;
  let story = set.story;
  let future = set.future;

  for (const action of actions) {
    if (!isEvidenced(action)) {
      if (action.status !== "todo") {
        skipped.push({
          actionId: action.id,
          reason:
            action.status === "in-progress"
              ? `“${action.targetSentence}” — 진행 중 표시만으로는 옮기지 않습니다. 결과물과 본인 역할을 적어 주세요.`
              : `“${action.targetSentence}” — 완료 증거 설명이 비어 있습니다.`,
        });
      }
      continue;
    }
    if (action.promotedLineId) continue; // 이미 옮김

    const plannedLine = action.plannedLineId ? findLine(future, action.plannedLineId) : undefined;
    const text = stripPlannedPrefix(plannedLine?.text ?? action.targetSentence);

    if (hasText(story, text)) {
      skipped.push({
        actionId: action.id,
        reason: `“${text}” — 이미 이력서에 있는 내용입니다.`,
      });
      continue;
    }

    // 옮겨진 문장은 사용자가 쓴 증거 설명을 근거로 가진다.
    const lineId = `${action.id}-promoted`;
    const factLine: ResumeLine = {
      id: lineId,
      text,
      original: text,
      experienceId: plannedLine?.experienceId,
      jdExpectation: plannedLine?.jdExpectation,
      dimensionId: action.dimensionId,
      status: "adopted",
      basis: "direct",
    };

    baseline = appendLine(baseline, { ...factLine, id: `${lineId}-b` });
    story = appendLine(story, factLine);
    // 미래 판본에서는 [예정] 표시만 떼고 근거를 direct 로 바꾼다.
    future = mapLines(future, (l) =>
      l.id === action.plannedLineId
        ? { ...l, text, original: text, basis: "direct" as const }
        : l,
    );

    promoted.push({ actionId: action.id, text, lineId });
  }

  return { resumes: { ...set, baseline, story, future }, promoted, skipped };
}

/** 옮긴 결과를 실행 카드에 되돌려 기록한다. 두 번 옮기지 않기 위해서다. */
export function markPromoted(
  actions: ActionCard[],
  promoted: PromotionResult["promoted"],
): ActionCard[] {
  const map = new Map(promoted.map((p) => [p.actionId, p.lineId]));
  return actions.map((a) => (map.has(a.id) ? { ...a, promotedLineId: map.get(a.id) } : a));
}
