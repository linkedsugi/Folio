/**
 * RoleFit Canvas — 도메인 모델
 *
 * 기획서(앱 기획서 v4.0)의 두 결과물을 그대로 타입으로 옮긴다.
 *  - 결과물 01 · 기업 제출용 맞춤형 Resume / CV        → ResumeDocument
 *  - 결과물 02 · 지원자 전용 지원전략 분석서             → StrategyReport
 *
 * 기획 원칙 중 타입으로 강제하는 것:
 *  - 근거가 없는 내용은 만들지 않는다 → 모든 점수/문장은 evidence(출처)를 참조한다.
 *  - 사실과 앱의 해석을 구분한다     → RationaleNote 는 jdQuote(원문)와 interpretation(해석)을 나눈다.
 *  - 확인이 필요한 것은 남겨 둔다     → ConfidenceState 의 'needs-confirmation'.
 */

/* ────────────────────────────────────────────────────────────── 공통 */

/** 자료에 없는 것은 지어내지 않고 "확인 필요"로 남긴다. (기획서 14 / 이용 중 지킬 원칙) */
export type ConfidenceState = "confirmed" | "needs-confirmation" | "not-found";

/** 0–100 의 매칭률. "합격확률"이 아니라 "직무 매칭률"이다. (기획서 04) */
export type MatchScore = number;

export type Language = "ko" | "en";

/** 근거: JD 원문 또는 지원자 이력의 특정 항목을 가리킨다. */
export interface EvidenceRef {
  /** 'jd' = 채용공고 본문, 'profile' = 지원자 이력 항목, 'user' = 사용자가 직접 답한 내용 */
  source: "jd" | "profile" | "user";
  /** profile 이면 ExperienceItem.id, jd 면 JobPosting.id */
  refId: string;
  /** 실제 인용 문구 — "왜 이렇게 해석했나요?" 에서 그대로 보여준다. */
  quote: string;
}

/** "왜 이런 인재상과 점수가 나왔나?" 에 답하는 한 줄. 사실(quote)과 해석(interpretation)을 분리한다. */
export interface RationaleNote {
  claim: string;
  evidence: EvidenceRef[];
  interpretation: string;
}

/* ─────────────────────────────────────────────────── 01 / 채용공고(JD) */

export type RequirementKind = "must" | "preferred";

/** 동등 경험 인정 여부. JD 에 명시가 없으면 'unknown' 으로 두고 "확인 필요"로 안내한다. */
export type EquivalenceAllowance = "allowed" | "not-allowed" | "unknown";

export interface Requirement {
  id: string;
  kind: RequirementKind;
  /** 화면에 쓰는 짧은 이름 (예: "게임 개발 5년") */
  label: string;
  /** 공고에서 요구하는 내용 전체 */
  text: string;
  equivalence: EquivalenceAllowance;
  /** 이 조건을 뽑아낸 공고 원문 */
  sourceQuote: string;
}

/** 책임 수준: 단순 참여 / 독립 수행 / 과제 리드 / 조직 책임 (기획서 04) */
export type ResponsibilityLevel = "participate" | "independent" | "lead" | "own-org";

export const RESPONSIBILITY_LEVEL_LABEL: Record<ResponsibilityLevel, string> = {
  participate: "단순 참여",
  independent: "독립 수행",
  lead: "과제 리드",
  "own-org": "조직 책임",
};

/** 모집팀의 인재상 — 한 문장 + 세 가지 핵심 업무. 성격을 추측하지 않는다. (기획서 04) */
export interface IdealCandidate {
  /** 한 문장 정의 */
  oneLine: string;
  /** 이 팀이 맡기려는 일: 가장 중요한 업무 3개와 기대하는 결과 */
  coreTasks: CoreTask[];
  responsibilityLevel: ResponsibilityLevel;
  responsibilityNote: string;
  /** "왜 이렇게 해석했나요?" 에서 펼쳐 보는 판단 근거 */
  rationale: RationaleNote[];
}

export interface CoreTask {
  id: string;
  /** 맡기려는 일 */
  task: string;
  /** 기대하는 결과 */
  expectedOutcome: string;
}

export interface JobPosting {
  id: string;
  sourceType: "paste" | "url" | "file" | "sample";
  sourceUrl?: string;
  /** 광고·메뉴 등을 제외한 공고 본문 (기획서 02) */
  body: string;
  company: string;
  team?: string;
  roleTitle: string;
  location?: string;
  employmentType?: string;
  /** 업무 내용 */
  responsibilities: string[];
  requirements: Requirement[];
  idealCandidate: IdealCandidate;
  /** 문서 양식·분량·언어를 공고가 정했다면 이력서 작성에서 우선한다. (기획서 08) */
  documentRules?: {
    language?: Language;
    maxPages?: number;
    format?: string;
    note?: string;
  };
  /** 사용자가 틀리거나 빠진 부분을 확인해야 하는 항목 */
  reviewFlags: ReviewFlag[];
  /** 사용자가 "이 공고가 맞다"고 확인했는가 */
  confirmedByUser: boolean;
}

export interface ReviewFlag {
  id: string;
  field: string;
  message: string;
  severity: "info" | "warn";
  resolved: boolean;
}

/* ─────────────────────────────────────────────── 02 / 지원자 이력 */

/**
 * 재직 경력에만 한정하지 않는다.
 * 학위·수업·논문·인턴·대회·개인 프로젝트·자격·교육·오픈소스·봉사까지 받는다. (기획서 02)
 */
export type ExperienceKind =
  | "job"
  | "internship"
  | "freelance"
  | "project"
  | "competition"
  | "degree"
  | "course"
  | "research"
  | "publication"
  | "certification"
  | "training"
  | "opensource"
  | "volunteer";

export const EXPERIENCE_KIND_LABEL: Record<ExperienceKind, string> = {
  job: "재직 경력",
  internship: "인턴",
  freelance: "프리랜스",
  project: "프로젝트",
  competition: "대회",
  degree: "학위",
  course: "수업",
  research: "연구",
  publication: "논문",
  certification: "자격",
  training: "교육",
  opensource: "오픈소스",
  volunteer: "봉사",
};

/** 재직/학업 경력으로 인정되는 연수에 포함되는 종류 — "수료"를 "연수"로 바꾸지 않기 위한 구분. */
export const PROFESSIONAL_KINDS: ExperienceKind[] = ["job", "internship", "freelance"];

/** 논문 상태: 게재 / 게재 확정 / 심사 중 / 프리프린트 — 섞지 않는다. (기획서 12 샘플 E) */
export type PublicationStatus = "published" | "accepted" | "under-review" | "preprint";

export const PUBLICATION_STATUS_LABEL: Record<PublicationStatus, string> = {
  published: "게재",
  accepted: "게재 확정",
  "under-review": "심사 중",
  preprint: "프리프린트",
};

export interface ExperienceItem {
  id: string;
  kind: ExperienceKind;
  /** 회사·학교·대회 이름 */
  organization: string;
  /** 실제 직함·학위명. 유지하고 바꾸지 않는다. (기획서 08) */
  title: string;
  /** YYYY-MM */
  start: string;
  /** YYYY-MM, 재직 중이면 null */
  end: string | null;
  /** 무엇을 했는지 */
  summary: string;
  /** 맡았던 과업 / 직접 내린 결정 / 해결한 문제 */
  tasks: string[];
  /** 성과 — 측정 가능한 것 우선 */
  outcomes: string[];
  /** 본인의 역할은 어디까지였는가 */
  ownRole: string;
  responsibilityLevel: ResponsibilityLevel;
  /** 보여줄 결과물이 있는가 */
  artifacts: string[];
  skills: string[];
  /** 이 항목이 사실로 확인되었는가 */
  confidence: ConfidenceState;
  publicationStatus?: PublicationStatus;
  /** 팀 규모·본인 기여 비중 등 구분이 필요한 메모 */
  note?: string;
}

/** URL 만 입력해도 항상 내용을 가져오는 것은 아니다. (기획서 02) */
export interface ProfileLink {
  id: string;
  label: string;
  url: string;
  status: "fetched" | "link-only" | "failed";
}

export interface ApplicantProfile {
  id: string;
  name: string;
  headline: string;
  contact: {
    email?: string;
    phone?: string;
    location?: string;
  };
  links: ProfileLink[];
  experiences: ExperienceItem[];
  /** 사실 오류·누락 확인이 필요한 항목 */
  reviewFlags: ReviewFlag[];
  confirmedByUser: boolean;
}

/* ─────────────────────────────────────── 03 / 확인·보강 추가 질문 */

/** 추가 질문은 부족한 항목에 맞춘다. (기획서 05) */
export interface EnrichmentQuestion {
  id: string;
  /** 어떤 부문이 부족해서 묻는가 */
  dimensionId: string;
  question: string;
  /** 왜 묻는지 — 사용자가 납득할 수 있어야 한다 */
  why: string;
  /** 답하기 / 자료 추가 / 아직 모름 / 건너뛰기 (기획서 10) */
  answerState: "unanswered" | "answered" | "material-added" | "unknown" | "skipped";
  answer?: string;
  /** 답변으로 새로 만들어진 경험 항목 */
  createdExperienceId?: string;
}

/* ─────────────────────────────────────── 04 / 매칭률 · 분석 */

/**
 * 부문별 매칭. 현재 → 스토리텔링 후 → 실행 목표 세 단계.
 *
 *  current    : 목표 업무를 "직접 수행한" 현재 근거로 설명되는 수준
 *  afterStory : 이미 가진 관련 경력·학력·활동까지 연결해 설명할 수 있는 수준
 *               (미확인 후보는 포함하지 않는다 — 문장만 고쳐도 오르지 않는다)
 *  target     : 부족한 경험·결과물을 확보한 뒤 도달하고자 하는 조건부 목표
 */
export interface MatchDimension {
  id: string;
  /** 모집팀의 기대 (표 첫 열) */
  label: string;
  /** 어떤 조건에서 나온 부문인가 */
  kind: RequirementKind | "general";
  requirementId?: string;
  /** 부문 비중 % — 전체 합이 100 */
  weight: number;

  current: MatchScore;
  afterStory: MatchScore;
  target: MatchScore;

  /** 팀의 기대 — 상세에서 보여줄 설명 */
  teamExpectation: string;
  /** 현재 점수의 근거 */
  currentBasis: string;
  /** 스토리텔링에 활용할 경험 (표 3열) */
  storyBasis: string;
  /** 이후 진행할 부분 → 완료 증거 (표 5열) */
  nextStep: string;
  evidenceToProduce: string;
  /** 남는 차이 */
  remainingGap: string;
  /** 점수의 이유 */
  rationale: RationaleNote[];
  /** 반영한 내 경험 */
  usedExperienceIds: string[];
  /** 정보가 부족하면 'needs-confirmation' */
  confidence: ConfidenceState;
  /** 목표에서도 필수 조건이 충족되지 않는 경우의 안내 (예: "게임 5년"은 별도 확인) */
  targetCaveat?: string;
}

/** 지원 판단 — 총점 하나로 결정하지 않는다. (기획서 07) */
export type ApplicationVerdict =
  | "proceed-with-current"
  | "apply-while-confirming"
  | "strengthen-then-reassess"
  | "adjust-scope";

export const VERDICT_LABEL: Record<ApplicationVerdict, string> = {
  "proceed-with-current": "현재 근거로 지원 준비",
  "apply-while-confirming": "조건 확인과 지원 병행",
  "strengthen-then-reassess": "핵심 근거 보강 후 재평가",
  "adjust-scope": "경력 축적·지원 범위 조정",
};

export const VERDICT_GUIDANCE: Record<ApplicationVerdict, string> = {
  "proceed-with-current": "필수 조건과 핵심 근거를 확인하고 이력서·면접 사례를 완성합니다.",
  "apply-while-confirming": "동등 경험 인정 여부 등을 문의하면서 사실 기반 문서를 준비합니다.",
  "strengthen-then-reassess": "중요 업무의 역할·산출물·결과를 확보해 해당 항목을 재검토합니다.",
  "adjust-scope": "필수 조건과 핵심 책임의 차이를 확인하고 현실적인 중간 역할을 검토합니다.",
};

export interface OverallMatch {
  /** 가중 반영 전 원값 (예: 32.75) */
  raw: { current: number; afterStory: number; target: number };
  /** 화면 표기용 반올림 (예: 33) */
  display: { current: number; afterStory: number; target: number };
}

/** 한 항목은 하나의 이야기로 완성 (기획서 05) */
export interface StoryCard {
  id: string;
  dimensionId: string;
  /** 팀의 기대 → 활용할 내 경험 → 공통점 → 실제 증거 */
  teamExpectation: string;
  usedExperience: string;
  usedExperienceIds: string[];
  /** 연결 논리 — 다만 다른 환경의 성과를 목표 환경의 성과로 바꾸지 않는다 */
  connectionLogic: string;
  /** 실제 증거 */
  evidence: string[];
  /** 이력서 문장 */
  resumeSentence: string;
  /** 면접 설명 */
  interviewNote: string;
  /** 보완 범위와 한계 */
  scopeAndLimit: string;
  from: MatchScore;
  to: MatchScore;
  /** 사용자가 이 문장을 채택했는가 */
  adopted: boolean;
}

/** 실행 카드에 반드시 들어갈 여섯 가지 (기획서 06) */
export interface ActionCard {
  id: string;
  dimensionId: string;
  /** 1 지금 정리하기 / 2 새 결과물 만들기 / 3 실무 책임 쌓기 */
  priority: 1 | 2 | 3;
  /** ① 부족한 기대 */
  gap: string;
  /** ② 현재 → 목표 */
  from: MatchScore;
  to: MatchScore;
  /** ③ 진행할 일 */
  actions: string[];
  /** ④ 완료 증거 */
  evidence: string[];
  /** ⑤ 진행 조건 */
  conditions: string[];
  /** ⑥ 재평가 기준 */
  reassessCriteria: string;
  /**
   * 체크만으로 목표 점수를 주지 않는다. (기획서 10)
   * 'evidence-submitted' 가 되어야 재평가 대상이 된다.
   */
  status: "todo" | "in-progress" | "evidence-submitted";
  /** 사용자가 추가한 결과물·역할 설명 */
  submittedEvidence?: string;
  savedToPlan: boolean;
}

export const PRIORITY_LABEL: Record<1 | 2 | 3, string> = {
  1: "지금 정리하기",
  2: "새 결과물 만들기",
  3: "실무 책임 쌓기",
};

export const PRIORITY_DONE_CRITERIA: Record<1 | 2 | 3, string> = {
  1: "어떤 사실을 어떤 근거로 주장하는지 설명할 수 있다",
  2: "수료가 아니라 실제 수행한 내용과 결과를 확인한다",
  3: "진행 기간·본인 책임·성과를 기록하고 재평가한다",
};

/** 결과물 02 · 지원전략 분석서 */
export interface StrategyReport {
  id: string;
  jobPostingId: string;
  profileId: string;
  idealCandidate: IdealCandidate;
  overall: OverallMatch;
  dimensions: MatchDimension[];
  stories: StoryCard[];
  actions: ActionCard[];
  verdict: ApplicationVerdict;
  /** 지금의 판단 한 줄 */
  verdictNote: string;
  /** 필수 조건 충족 여부 — 총점과 별개의 정보 (기획서 04) */
  mustHaveStatus: MustHaveStatus[];
  /** 읽는 법 안내 */
  readingNote: string;
  /** 기본 비공개 (기획서 07) */
  visibility: "private" | "shared";
  generatedBy: "heuristic" | "llm" | "sample";
}

export interface MustHaveStatus {
  requirementId: string;
  label: string;
  state: "met" | "partially-met" | "not-met" | "needs-confirmation";
  note: string;
}

export const MUST_HAVE_STATE_LABEL: Record<MustHaveStatus["state"], string> = {
  met: "충족",
  "partially-met": "일부 충족",
  "not-met": "미충족",
  "needs-confirmation": "확인 필요",
};

/* ─────────────────────────────────── 05 / 이력서 · 템플릿 */

export type ResumeDocType = "resume" | "cv";

export type TemplateId =
  | "ats-classic"
  | "executive-impact"
  | "technical-evidence"
  | "career-transition"
  | "academic-cv"
  | "custom-upload";

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  koName: string;
  /** 어떤 지원에 맞는가 */
  fitFor: string;
  /** 강조하는 구성 */
  emphasis: string;
  /** 기본 섹션 순서 */
  sectionOrder: ResumeSectionKind[];
  docType: ResumeDocType;
  accent: string;
}

export type ResumeSectionKind =
  | "summary"
  | "experience"
  | "skills"
  | "projects"
  | "education"
  | "research"
  | "publications"
  | "teaching"
  | "certifications"
  | "activities";

export const SECTION_LABEL: Record<ResumeSectionKind, { ko: string; en: string }> = {
  summary: { ko: "핵심 요약", en: "Summary" },
  experience: { ko: "경력·성과", en: "Experience" },
  skills: { ko: "기술·역량", en: "Skills" },
  projects: { ko: "프로젝트", en: "Projects" },
  education: { ko: "학력", en: "Education" },
  research: { ko: "연구 분야", en: "Research" },
  publications: { ko: "논문·저작", en: "Publications" },
  teaching: { ko: "교육·강의", en: "Teaching" },
  certifications: { ko: "자격·교육", en: "Certifications" },
  activities: { ko: "기타 활동", en: "Activities" },
};

/**
 * 이력서는 매칭 3단계와 1:1 로 대응하는 세 판본으로 만든다.
 *
 *  baseline (이력서 1) — 직접 수행한 사실만으로, JD 요구에 곧바로 대응되는 내용만 담는다.
 *                        → 현재 매칭률(current)과 같은 근거를 쓴다.
 *  story    (이력서 2) — 이미 가진 관련 경력·학력·활동까지 연결해 최대치로 설명한다.
 *                        → 스토리텔링 후 매칭률(afterStory)과 같은 근거를 쓴다.
 *                        → **실제 기업 제출용 기본 판본.**
 *  future   (이력서 3) — 실행 과제를 완료했을 때의 모습을 미리 본다.
 *                        → 목표 매칭률(target)과 같은 근거를 쓴다.
 *                        → **제출 불가.** 아직 사실이 아닌 항목이 들어 있으므로
 *                           지원자 전용 계획 미리보기로만 쓰고, 예정 항목은 [예정]으로 표시한다.
 *                           (기획서 06 "예정된 학위·자격·교육·프로젝트는 완료된 이력서 항목으로 넣지 않는다")
 */
export type ResumeVariant = "baseline" | "story" | "future";

export const RESUME_VARIANT_META: Record<
  ResumeVariant,
  {
    order: 1 | 2 | 3;
    title: string;
    subtitle: string;
    /** 어느 매칭 단계의 근거를 쓰는가 */
    matchStage: "current" | "afterStory" | "target";
    /** 기업에 제출할 수 있는 판본인가 */
    submittable: boolean;
    note: string;
  }
> = {
  baseline: {
    order: 1,
    title: "이력서 1 · Baseline",
    subtitle: "직접 수행한 사실만",
    matchStage: "current",
    submittable: true,
    note: "공고 요구에 직접 대응되는 경험만 담은 기준 판본입니다. 보수적이지만 모든 문장이 직접 근거를 가집니다.",
  },
  story: {
    order: 2,
    title: "이력서 2 · 제출용",
    subtitle: "관련 경험까지 연결한 최대치",
    matchStage: "afterStory",
    submittable: true,
    note: "이미 가진 관련 경험을 이 직무와 연결해 설명한 판본입니다. 기업에 제출할 기본 판본입니다.",
  },
  future: {
    order: 3,
    title: "이력서 3 · 미래(계획)",
    subtitle: "실행 과제를 완료했을 때",
    matchStage: "target",
    submittable: false,
    note: "실행 과제를 마쳤을 때의 모습을 미리 보는 지원자 전용 자료입니다. 아직 사실이 아닌 [예정] 항목이 있어 제출용으로 내려받을 수 없습니다.",
  },
};

/**
 * 이력서의 한 문장.
 * 사용자는 채택·수정·제외할 수 있고, "왜 이 경험을 넣었나요?" 로 근거를 확인한다. (기획서 08)
 */
export interface ResumeLine {
  id: string;
  text: string;
  /** 원래 문장 — 사용자가 수정하면 original 을 남긴다 */
  original: string;
  /** 어떤 경험에서 나왔는가 */
  experienceId?: string;
  /** 어떤 JD 기대와 연결되는가 */
  jdExpectation?: string;
  dimensionId?: string;
  status: "adopted" | "edited" | "excluded";
  /**
   * 이 문장이 어떤 근거로 서 있는가.
   *  direct  — 직접 수행한 사실 (이력서 1 부터 등장)
   *  related — 관련 경험을 이 직무와 연결한 설명 (이력서 2 부터 등장)
   *  planned — 아직 하지 않은 계획 (이력서 3 에만 등장, 제출 불가)
   */
  basis: "direct" | "related" | "planned";
  /** planned 문장이 근거로 삼는 실행 과제 */
  actionCardId?: string;
}

export interface ResumeEntry {
  id: string;
  experienceId?: string;
  /** 기간과 실제 직함은 유지한다 */
  organization: string;
  title: string;
  period: string;
  meta?: string;
  lines: ResumeLine[];
  /** 이력서 3 에서만 등장하는 예정 항목 */
  planned?: boolean;
}

export interface ResumeSection {
  id: string;
  kind: ResumeSectionKind;
  heading: string;
  /** summary/skills 처럼 항목 없이 문장만 있는 섹션 */
  lines: ResumeLine[];
  entries: ResumeEntry[];
  included: boolean;
}

export interface ResumeDocument {
  id: string;
  variant: ResumeVariant;
  jobPostingId: string;
  profileId: string;
  docType: ResumeDocType;
  language: Language;
  templateId: TemplateId;
  /** 회사별 버전 구분 */
  versionLabel: string;
  header: {
    name: string;
    headline: string;
    contactLine: string;
  };
  sections: ResumeSection[];
  /** 분량 목표 */
  targetPages: 1 | 2 | 3;
  /** 사용자가 최종 사실 확인을 마쳤는가 */
  factsConfirmed: boolean;
  customTemplate?: CustomTemplate;
  /**
   * 이 판본이 설명하는 합격 가능성 스토리텔링.
   * "이 이력서를 낸다면 모집팀에 어떻게 읽히는가" 를 사실 기준으로 설명한다.
   */
  narrative: ResumeNarrative;
}

/** 판본별 스토리텔링 — 수치는 직무 매칭률이며 합격 확률이 아니다. */
export interface ResumeNarrative {
  /** 이 판본이 도달하는 매칭률 */
  matchScore: MatchScore;
  /** 한 문장 요약 */
  headline: string;
  /** 모집팀이 이 이력서에서 읽어낼 강점 */
  readsAs: string[];
  /** 이 판본에서도 남는 차이 */
  remainingGap: string[];
  /** 면접에서 설명할 방식 */
  interviewAngle: string;
  /** 이 판본을 쓸 때의 주의 */
  caution?: string;
}

/** 세 판본을 한 묶음으로 관리한다. */
export interface ResumeSet {
  baseline: ResumeDocument;
  story: ResumeDocument;
  future: ResumeDocument;
  /** 편집 화면에서 현재 보고 있는 판본 */
  active: ResumeVariant;
  /** 제출용으로 확정한 판본 (future 는 선택 불가) */
  submitVariant: Exclude<ResumeVariant, "future">;
}

/** 사용자 템플릿 불러오기 (기획서 09) */
export interface CustomTemplate {
  fileName: string;
  kind: "docx" | "reference-only";
  /** 그대로 재현할 수 없는 요소 */
  unsupported: string[];
  /** 어느 위치에 무엇을 넣을지 */
  slotMap: { slot: string; section: ResumeSectionKind }[];
}

/** 내려받기 전에 확인하는 내용 (기획서 09) */
export interface PreflightCheck {
  id: string;
  category: "content" | "fit" | "polish" | "privacy";
  label: string;
  detail: string;
  checked: boolean;
}

/* ─────────────────────────────────── 06 / 지원 건 · 파이프라인 */

/**
 * 분석 파이프라인.
 *
 *   1 intake   JD 입력 + 내 이력 입력
 *   2 review   JD 분석 결과(인재상·requirements) 확인 + 내 이력 분석 확인
 *   3 baseline 내 이력 ↔ requirements 직접 매핑        → 현재 매칭률 + 이력서 1
 *   4 story    관련 경험까지 연결한 최대치 매핑          → 스토리 후 매칭률 + 이력서 2
 *   5 plan     남는 차이 → 실행 과제와 목표             → 목표 매칭률 + 이력서 3(계획)
 *   6 export   두 결과물을 확인하고 각각 내려받기
 */
export type StageId =
  | "start"
  | "intake"
  | "review"
  | "baseline"
  | "story"
  | "plan"
  | "export";

export const STAGE_ORDER: StageId[] = [
  "start",
  "intake",
  "review",
  "baseline",
  "story",
  "plan",
  "export",
];

export const STAGE_LABEL: Record<
  StageId,
  { step: string; title: string; desc: string; output?: string }
> = {
  start: {
    step: "",
    title: "시작",
    desc: "내 자료로 시작하거나 샘플 5종으로 체험",
  },
  intake: {
    step: "1",
    title: "공고·이력 입력",
    desc: "좌측에는 공고, 우측에는 내 이력",
  },
  review: {
    step: "2",
    title: "분석 확인",
    desc: "모집팀의 인재상과 요구 조건, 내 이력 정리 결과를 확인",
  },
  baseline: {
    step: "3",
    title: "현재 매핑",
    desc: "직접 수행한 사실만으로 요구 조건과 맞춰 본다",
    output: "이력서 1 · Baseline",
  },
  story: {
    step: "4",
    title: "스토리텔링 매핑",
    desc: "이미 가진 관련 경험까지 연결해 최대치를 설명한다",
    output: "이력서 2 · 제출용",
  },
  plan: {
    step: "5",
    title: "개선 과제·목표",
    desc: "남는 차이를 과제와 목표로 바꾼다",
    output: "이력서 3 · 미래(계획)",
  },
  export: {
    step: "6",
    title: "확인·받기",
    desc: "이력서와 분석서를 각각 확인하고 내려받기",
  },
};

/** 하나의 지원 건 — 같은 지원 건 안에서 두 결과를 연결한다. (기획서 10) */
export interface Application {
  id: string;
  /** 회사별 버전 구분용 이름 */
  name: string;
  createdAt: string;
  updatedAt: string;
  stage: StageId;
  /** 사용자가 지나온 단계 — 되돌아가도 결과를 유지한다 */
  completedStages: StageId[];
  posting: JobPosting | null;
  profile: ApplicantProfile | null;
  questions: EnrichmentQuestion[];
  report: StrategyReport | null;
  resumes: ResumeSet | null;
  preflight: PreflightCheck[];
  /** 샘플 체험이면 샘플 id */
  sampleId?: SampleId;
}

export type SampleId = "sample-a" | "sample-b" | "sample-c" | "sample-d" | "sample-e";

export interface SamplePackage {
  id: SampleId;
  /** 화면 표기 이름 (예: "샘플 A | 게임 개발자") */
  label: string;
  tagline: string;
  /** 어떤 지원 상황인가 */
  situation: string;
  posting: JobPosting;
  profile: ApplicantProfile;
  report: StrategyReport;
  resumes: ResumeSet;
  questions: EnrichmentQuestion[];
  /** 이력서 방향 요약 */
  resumeDirection: string;
}
