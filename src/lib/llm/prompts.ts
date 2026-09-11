/**
 * 정밀 분석 프롬프트.
 *
 * ── 왜 한 곳에 모으는가 ───────────────────────────────────────
 * 이 앱이 지키는 선(지어내지 않기, 확률로 말하지 않기, 학력을 경력으로 바꾸지 않기)은
 * 프롬프트에서 한 번, 응답 검증에서 또 한 번 지켜야 한다. 프롬프트가 호출부마다
 * 흩어져 있으면 한쪽만 고쳐지고 다른 쪽이 남아 원칙이 조용히 무너진다.
 * 그래서 문구는 여기에만 두고, 검증은 analyze.ts 가 맡는다.
 */
import type { ApplicantProfile, JobPosting, StrategyReport } from "../types";

/** 모델이 무슨 일을 하든 항상 지켜야 하는 원칙. 화면 문구와 같은 말을 쓴다. */
export const LLM_CORE_RULES: string[] = [
  "너는 채용공고와 지원자 이력을 분석한다. 입력에 없는 사실을 만들지 마라.",
  "모든 판단은 입력에 있는 문장을 근거로 해야 하고, 근거가 없으면 needs-confirmation 으로 남겨라.",
  "수치는 합격확률이 아니라 직무 매칭률이다. '합격 확률', '서류 통과율', 'N% 확률' 같은 표현을 쓰지 마라.",
  "학위·수료를 실무 경력으로 바꾸지 마라. 논문 상태(게재/게재확정/심사중/프리프린트)를 섞지 마라.",
  "직무와 무관한 나이·성별·외모·종교·가족관계를 판단에 쓰지 마라.",
  "반드시 JSON 하나만 출력하라. 설명을 덧붙이지 마라.",
];

/**
 * 보강 작업의 시스템 프롬프트.
 *
 * "점수를 매기지 마라"를 분명히 적는다. 점수는 규칙 엔진이 이미 계산했고,
 * 모델이 숫자를 건드리면 같은 이력이 부를 때마다 다른 값을 받게 된다.
 * 사용자가 신뢰할 수 있으려면 숫자는 흔들리지 않아야 한다.
 */
export const ENRICH_SYSTEM_PROMPT = [
  "너는 채용 지원 전략 분석서의 문장을 다듬는 편집자다.",
  "",
  "지켜야 할 원칙:",
  ...LLM_CORE_RULES.map((rule) => `- ${rule}`),
  "",
  "이 작업의 범위:",
  "- 분석의 구조(부문·가중치·점수·판정)는 이미 정해져 있다. 너는 설명과 문장만 고친다.",
  "- 점수(current/afterStory/target/weight)를 계산하거나 바꾸려 하지 마라. 보내도 무시된다.",
  "- 주어진 id(부문 id, 스토리 id, 경험 id)만 쓴다. 새 id 를 만들면 그 항목은 버려진다.",
  "- 근거로 쓸 경험은 입력의 experiences 안에 있는 것뿐이다. 없는 경험을 인용하지 마라.",
  "- 각 문장은 500자를 넘기지 마라. 넘기면 원래 문장이 그대로 쓰인다.",
  "- 우려(concern)에는 반드시 honestLimit(답해도 남는 한계)을 함께 써라. 없으면 설득이 아니라 변명이 된다.",
  "- 다른 환경의 성과를 목표 환경의 성과처럼 바꿔 쓰지 마라. 범위와 한계를 함께 적어라.",
  "",
  "출력 형식 — 아래 모양의 JSON 하나만 출력한다. 고칠 것이 없는 항목은 빼면 된다.",
  "{",
  '  "idealCandidateOneLine": "모집팀이 찾는 사람을 한 문장으로",',
  '  "dimensions": [{ "id": "주어진 부문 id", "currentBasis": "", "storyBasis": "", "remainingGap": "" }],',
  '  "stories": [{ "id": "주어진 스토리 id", "connectionLogic": "", "resumeSentence": "", "interviewNote": "" }],',
  '  "candidacyNow": {',
  '    "headline": "이 팀이 지금 나를 검토할 이유 한 문장",',
  '    "reasonsToConsider": [""],',
  '    "concerns": [{ "concern": "", "response": "", "honestLimit": "", "evidenceIds": ["주어진 경험 id"] }],',
  '    "conditions": [""]',
  "  },",
  '  "candidacyFuture": { "위와 같은 모양" : "" }',
  "}",
].join("\n");

/* ─────────────────────────────────────────── 입력 직렬화 */

function period(start: string, end: string | null): string {
  return `${start} ~ ${end ?? "현재"}`;
}

/**
 * 모델에 보낼 입력.
 *
 * 이름·이메일·전화·주소는 담지 않는다. 문장을 다듬는 데 필요하지 않고,
 * 필요하지 않은 개인정보는 애초에 기기 밖으로 내보내지 않는 것이 이 앱의 기본값이다.
 */
export function buildEnrichUserPrompt(
  posting: JobPosting,
  profile: ApplicantProfile,
  report: StrategyReport,
): string {
  const payload = {
    공고: {
      회사: posting.company,
      팀: posting.team,
      직무: posting.roleTitle,
      업무: posting.responsibilities,
      조건: posting.requirements.map((r) => ({
        id: r.id,
        구분: r.kind,
        내용: r.text,
        출처: r.derivation,
      })),
      인재상: {
        한줄: posting.idealCandidate.oneLine,
        핵심업무: posting.idealCandidate.coreTasks.map((t) => ({
          일: t.task,
          기대결과: t.expectedOutcome,
        })),
        책임범위: posting.idealCandidate.responsibilityNote,
      },
    },
    내경험: profile.experiences.map((e) => ({
      id: e.id,
      종류: e.kind,
      소속: e.organization,
      직함: e.title,
      기간: period(e.start, e.end),
      요약: e.summary,
      한일: e.tasks,
      성과: e.outcomes,
      내역할: e.ownRole,
      결과물: e.artifacts,
      기술: e.skills,
      확인상태: e.confidence,
      논문상태: e.publicationStatus,
      메모: e.note,
    })),
    분석결과: {
      인재상한줄: report.idealCandidate.oneLine,
      부문: report.dimensions.map((d) => ({
        id: d.id,
        기대: d.teamExpectation,
        현재근거: d.currentBasis,
        연결할경험: d.storyBasis,
        남는차이: d.remainingGap,
        쓴경험id: d.usedExperienceIds,
        확인상태: d.confidence,
      })),
      스토리: report.stories.map((s) => ({
        id: s.id,
        부문id: s.dimensionId,
        쓴경험id: s.usedExperienceIds,
        연결논리: s.connectionLogic,
        이력서문장: s.resumeSentence,
        면접설명: s.interviewNote,
        범위와한계: s.scopeAndLimit,
      })),
      지금지원: {
        한줄: report.candidacyNow.headline,
        검토할이유: report.candidacyNow.reasonsToConsider,
        우려: report.candidacyNow.concerns,
        지원조건: report.candidacyNow.conditions,
      },
      과제완료후: {
        한줄: report.candidacyFuture.headline,
        검토할이유: report.candidacyFuture.reasonsToConsider,
        우려: report.candidacyFuture.concerns,
        지원조건: report.candidacyFuture.conditions,
      },
    },
  };

  return [
    "아래는 규칙 기반 분석이 이미 만들어 둔 결과다. 구조와 점수는 그대로 두고 설명과 문장만 고쳐라.",
    "고칠 필요가 없다고 판단한 항목은 응답에서 빼라. 억지로 바꾸지 않아도 된다.",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}
