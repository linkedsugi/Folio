/**
 * 매칭 엔진 — 3단계 매핑.
 *
 *   current    직접 매핑      : 그 일을 "직접 수행한" 기록만으로 설명되는 수준
 *   afterStory 스토리 매핑    : 이미 가진 "실제 관련 경험"까지 연결했을 때의 수준
 *   target     조건부 목표    : 실행 과제를 마쳤을 때 도달하려는 수준
 *
 * 이 파일이 지키는 기획 원칙(기획서 03~06, 14):
 *  - 수치는 "직무 매칭률"이다. 합격확률이 아니다.
 *  - 자료에 없는 것은 만들지 않는다. 근거가 없으면 confidence 를 'needs-confirmation' 으로 남긴다.
 *  - 단순 문장 수정으로 afterStory 가 오르지 않는다. 연결할 "실제 경험"이 있어야만 오른다.
 *  - 경력 연수 요구는 목표에 미래 개월 수를 미리 더하지 않는다. (기획서 03 "게임 개발 5년 20% 유지")
 *  - 학력·수료를 실무 연수로 바꾸지 않는다. 연수 계산은 PROFESSIONAL_KINDS 만 센다.
 *  - 나이·성별·외모·종교·가족관계는 어떤 점수에도 쓰지 않는다. (이 파일은 그런 필드를 읽지 않는다)
 *
 * 순수 함수다. Math.random / Date.now 를 쓰지 않고, id 는 내용 해시로 결정적으로 만든다.
 */

import type {
  ActionCard,
  ApplicantProfile,
  ConfidenceState,
  EnrichmentQuestion,
  EvidenceRef,
  ExperienceItem,
  ExperienceKind,
  JobPosting,
  MatchDimension,
  MatchScore,
  RationaleNote,
  Requirement,
  RequirementKind,
  ResponsibilityLevel,
  StoryCard,
  StrategyReport,
} from "../types";
import {
  EXPERIENCE_KIND_LABEL,
  PROFESSIONAL_KINDS,
  RESPONSIBILITY_LEVEL_LABEL,
  VERDICT_GUIDANCE,
  VERDICT_LABEL,
} from "../types";
import {
  computeOverall,
  deriveMustHaveStatus,
  deriveVerdict,
  normalizeDimensions,
  READING_NOTE,
} from "../scoring";

/* ──────────────────────────────────────────────── 0. 결정적 id / 작은 도구 */

/** FNV-1a 32bit — 같은 문자열이면 항상 같은 값. id 를 결정적으로 만들기 위해서만 쓴다. */
function hash32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(36);
}

/** 같은 입력이면 항상 같은 id. (Math.random / Date.now 금지) */
export function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${hash32(parts.join("|"))}`;
}

/** 인용문은 화면에서 한 줄로 보여주므로 너무 길면 자른다. */
function quoteOf(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

/* ──────────────────────────────────────────────── 1. 토큰화 / 키워드 대조 */

/**
 * 의미 없는 조사·일반어. 이 단어가 겹쳤다는 이유로 "경험이 있다"고 판단하면 안 된다.
 * (text-utils 의 tokenize 와 별개로, 매칭 판정에 필요한 불용어만 여기에 둔다)
 */
const STOPWORDS = new Set([
  "및",
  "등",
  "또는",
  "이상",
  "이하",
  "관련",
  "경험",
  "경력",
  "능력",
  "업무",
  "가능",
  "우대",
  "필수",
  "이해",
  "보유",
  "사용",
  "활용",
  "수행",
  "담당",
  "직접",
  "대한",
  "위한",
  "있는",
  "하는",
  "years",
  "year",
  "the",
  "and",
  "or",
  "of",
  "in",
  "with",
  "for",
  "to",
  "a",
  "an",
  "on",
  "at",
  "plus",
  "experience",
  "skills",
  "ability",
]);

/**
 * 국문/영문이 섞인 채용공고에서 같은 뜻의 단어를 잇는 최소한의 대응표.
 * 사전을 크게 만들지 않는다 — 없는 것을 있다고 판단하는 위험이 더 크다.
 */
const ALIASES: Record<string, string> = {
  data: "데이터",
  analyst: "분석",
  analysis: "분석",
  analytics: "분석",
  developer: "개발",
  development: "개발",
  engineer: "개발",
  engineering: "개발",
  design: "디자인",
  designer: "디자인",
  product: "제품",
  research: "연구",
  researcher: "연구",
  marketing: "마케팅",
  sales: "영업",
  game: "게임",
  gameplay: "게임",
  performance: "성능",
  optimization: "최적화",
  release: "출시",
  operation: "운영",
  operations: "운영",
  mentoring: "멘토링",
  portfolio: "포트폴리오",
  teaching: "강의",
  publication: "논문",
};

/**
 * 한국어 조사·어미. 토큰 끝에서 떼어 낸다(긴 것부터).
 *
 * "최적화를"과 "최적화", "구현한"과 "구현"이 다른 토큰으로 갈리면
 * 실제로 같은 일을 한 경험을 "근거 없음"으로 판정하게 된다. 그것이 가장 나쁜 오류다.
 */
const KO_SUFFIXES = [
  "하였습니다",
  "했습니다",
  "하였으며",
  "합니다",
  "됩니다",
  "하였고",
  "했으며",
  "하면서",
  "에서는",
  "에서의",
  "하였다",
  "했다",
  "한다",
  "하고",
  "하며",
  "하는",
  "되는",
  "시킨",
  "시켜",
  "이며",
  "이고",
  "에서",
  "으로",
  "에게",
  "까지",
  "부터",
  "처럼",
  "보다",
  "마다",
  "이나",
  "에는",
  "에도",
  "와의",
  "과의",
  "라는",
  "을",
  "를",
  "이",
  "가",
  "은",
  "는",
  "에",
  "의",
  "와",
  "과",
  "로",
  "도",
  "만",
  "한",
  "된",
  "함",
  "됨",
  "들",
].sort((a, b) => b.length - a.length);

const HANGUL_ONLY = /^[가-힣]+$/;

/** 토큰에서 조사·어미를 떼어 낸 형태들. 두 번까지만 떼어 낸다("개선했습니다" → "개선"). */
function stemsOf(token: string): string[] {
  if (!HANGUL_ONLY.test(token)) return [];
  const out: string[] = [];
  let t = token;
  for (let i = 0; i < 2; i += 1) {
    const hit = KO_SUFFIXES.find((suffix) => t.endsWith(suffix) && t.length - suffix.length >= 2);
    if (!hit) break;
    t = t.slice(0, t.length - hit.length);
    out.push(t);
  }
  return out;
}

/** 토큰화 — 소문자화 후 한글/영문/숫자와 기술 기호(+, #)만 남긴다. "C#" 이 쪼개지지 않게 한다. */
export function keywordsOf(...texts: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  const add = (token: string) => {
    if (token.length < 2) return;
    if (STOPWORDS.has(token)) return;
    if (/^\d+$/.test(token)) return; // 숫자만 있는 토큰은 의미가 없다 (연수는 따로 해석한다)
    out.add(token);
    const alias = ALIASES[token];
    if (alias) out.add(alias);
  };
  for (const raw of texts) {
    if (!raw) continue;
    const parts = raw
      .toLowerCase()
      .split(/[^a-z0-9가-힣+#]+/)
      .filter(Boolean);
    for (const p of parts) {
      add(p);
      for (const stem of stemsOf(p)) add(stem);
    }
  }
  return out;
}

/**
 * 요구 라벨은 공고 문장을 그대로 옮긴 것이라 뒤에 조사가 붙어 있을 수 있다.
 * 문장 안에 넣을 때는 인용부호로 감싸 어색해지지 않게 한다.
 */
function quoted(label: string): string {
  return `\u201c${label.trim()}\u201d`;
}

/**
 * 개념 연결표 — 이력에 적힌 사실을 공고의 용어로 읽어 주기 위한 최소한의 대응.
 *
 * "로딩 시간을 4.0초에서 3.0초로 개선했다"는 문장에는 '성능'이라는 단어가 없지만
 * 그것은 성능 개선 작업이다. 없는 사실을 만들어 내는 것이 아니라,
 * 이미 적혀 있는 사실을 공고의 용어로 알아보게 하는 것이다.
 * 이렇게 붙은 해석은 storyBasis / rationale 에 그대로 드러나므로 사용자가 확인할 수 있다.
 *
 * 표를 크게 키우지 않는다 — 넓힐수록 "관련 있다"는 오판이 늘어난다.
 */
const CONCEPT_LINKS: { concept: string; hint: RegExp }[] = [
  {
    concept: "성능",
    hint: /로딩|지연|레이턴시|latency|응답\s*시간|처리량|throughput|메모리|프레임|fps|병목|캐시|속도/i,
  },
  { concept: "최적화", hint: /최적화|병목|튜닝|경량화|로딩|메모리|속도|단축/i },
  { concept: "분석", hint: /분석|측정|프로파일|profil|지표|모니터링|통계/i },
  { concept: "운영", hint: /운영|장애|온콜|인시던트|배포|릴리스|패치|모니터링|유지\s*보수/i },
  { concept: "출시", hint: /출시|릴리스|런칭|배포|launch|release/i },
  { concept: "멘토링", hint: /멘토|온보딩|후배|주니어|코칭|지도|사용을\s*지원/i },
  { concept: "협업", hint: /협업|유관\s*부서|코드\s*리뷰|스크럼|스프린트|타\s*부서/i },
  { concept: "포트폴리오", hint: /github|깃허브|데모|저장소|repository/i },
];

/** 이력 문장에서 읽어 낼 수 있는 개념 토큰. */
function conceptTokens(text: string): string[] {
  const out: string[] = [];
  for (const { concept, hint } of CONCEPT_LINKS) {
    if (hint.test(text)) out.push(concept);
  }
  return out;
}

/**
 * 겹치는 키워드.
 * 부분 문자열이 아니라 토큰 일치로만 본다 — "비게임"과 "게임"을 같은 것으로 보지 않기 위해서다.
 */
function overlap(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  a.forEach((t) => {
    if (b.has(t)) out.push(t);
  });
  return out.sort();
}

/* ──────────────────────────────────────────────── 2. 이산 점수 단계 */

/** 정성 요구의 단계. 0 / 25 / 50 / 75 / 100 */
export const QUALITATIVE_LEVELS = [0, 25, 50, 75, 100] as const;
/** 정량(연수) 요구의 단계. 0 / 20 / 50 / 75 / 100 — 기획서 03 의 "20% 유지"를 그대로 쓴다. */
export const TENURE_LEVELS = [0, 20, 50, 75, 100] as const;
/** 엔진이 만들어도 되는 모든 점수 값. */
export const ALLOWED_LEVELS: MatchScore[] = [0, 20, 25, 50, 75, 100];

/** 관련 경험만으로 도달할 수 있는 상한. 직접 근거 없이 100% 를 주장하지 않는다. */
const RELATED_CEILING = 75;

function stepUp(level: number, ladder: readonly number[]): number {
  for (const v of ladder) if (v > level) return v;
  return ladder[ladder.length - 1];
}

/* ──────────────────────────────────────────────── 3. 경력 개월 수 */

/** "2025-09" → 개월 인덱스. 형식이 아니면 null. */
function monthIndex(ym: string | null | undefined): number | null {
  if (!ym) return null;
  const m = /^(\d{4})[-.](\d{1,2})/.exec(ym.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return Number(m[1]) * 12 + (month - 1);
}

/**
 * 프로필 안에서 관찰되는 가장 마지막 시점.
 * 재직 중(end=null)인 경력의 끝을 정할 때 Date.now 대신 이 값을 쓴다 — 출력이 결정적이어야 한다.
 */
export function inferAsOf(profile: ApplicantProfile): string {
  let max: number | null = null;
  for (const e of profile.experiences) {
    const idx = monthIndex(e.end) ?? monthIndex(e.start);
    if (idx !== null && (max === null || idx > max)) max = idx;
  }
  if (max === null) return "1970-01";
  const y = Math.floor(max / 12);
  const mo = (max % 12) + 1;
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/** 한 경험의 개월 수(양끝 포함). 기간을 읽을 수 없으면 0. */
export function experienceMonths(exp: ExperienceItem, asOf: string): number {
  const s = monthIndex(exp.start);
  if (s === null) return 0;
  const e = monthIndex(exp.end) ?? monthIndex(asOf);
  if (e === null) return 0;
  return Math.max(0, e - s + 1);
}

/**
 * 재직 연수. 겹치는 기간은 한 번만 센다.
 * 학위·수업·자격은 포함하지 않는다 — "수료"를 "연수"로 바꾸지 않기 위해서다. (기획서 05)
 */
export function defaultProfessionalMonths(experiences: ExperienceItem[], asOf: string): number {
  const ranges: [number, number][] = [];
  for (const e of experiences) {
    if (!PROFESSIONAL_KINDS.includes(e.kind)) continue;
    const s = monthIndex(e.start);
    if (s === null) continue;
    const end = monthIndex(e.end) ?? monthIndex(asOf);
    if (end === null || end < s) continue;
    ranges.push([s, end]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let curStart: number | null = null;
  let curEnd = -1;
  for (const [s, e] of ranges) {
    if (curStart === null) {
      curStart = s;
      curEnd = e;
      continue;
    }
    if (s <= curEnd + 1) {
      curEnd = Math.max(curEnd, e);
    } else {
      months += curEnd - curStart + 1;
      curStart = s;
      curEnd = e;
    }
  }
  if (curStart !== null) months += curEnd - curStart + 1;
  return months;
}

/** 개월 수 계산기를 바깥에서 갈아끼울 수 있게 한다 (profile-analyze 의 professionalMonths 주입용). */
export type MonthsCounter = (experiences: ExperienceItem[]) => number;

export interface MatchEngineOptions {
  /** 주입하지 않으면 이 파일의 defaultProfessionalMonths 를 쓴다. */
  professionalMonths?: MonthsCounter;
  /** 재직 중인 경력의 기준 시점. 주입하지 않으면 프로필에서 유추한다. */
  asOf?: string;
}

/* ──────────────────────────────────────────────── 4. 부문 비중 배분 */

/** 부문 비중을 정할 때의 기본 크기 — 필수는 우대보다 반드시 크다. */
const KIND_BASE: Record<RequirementKind | "general", number> = {
  must: 6,
  preferred: 3,
  general: 2,
};

/**
 * 부문 비중(%)을 정수로 배분한다. 합은 정확히 100.
 *
 *  - 필수 > 우대 > 일반 순으로 기본값을 준다.
 *  - 공고에 먼저 적힌 조건을 조금 더 크게 본다(최대 1.5배). 배수를 1.5 로 묶어 두었기 때문에
 *    "가장 뒤에 적힌 필수(6.0)" 가 "가장 앞에 적힌 우대(4.5)" 보다 항상 크다.
 *  - 내림한 뒤 남는 값은 가장 큰 부문에 더한다.
 */
export function assignWeights(kinds: (RequirementKind | "general")[]): number[] {
  const n = kinds.length;
  if (n === 0) return [];
  if (n >= 100) {
    // 부문이 100개를 넘으면 정수 비중을 의미 있게 나눌 수 없다. 균등 배분 후 나머지만 보정한다.
    const even = kinds.map(() => 1);
    even[0] += 100 - n;
    return even;
  }

  const raw = kinds.map((kind, i) => {
    const order = n === 1 ? 1 : 1 + 0.5 * ((n - 1 - i) / (n - 1));
    return KIND_BASE[kind] * order;
  });
  const sum = raw.reduce((a, b) => a + b, 0);

  // 0% 부문은 만들지 않는다 — 화면에서 "비중 0" 은 설명할 수 없다.
  const weights = raw.map((r) => Math.max(1, Math.floor((r / sum) * 100)));

  let largest = 0;
  for (let i = 1; i < n; i += 1) if (raw[i] > raw[largest]) largest = i;

  let diff = 100 - weights.reduce((a, b) => a + b, 0);
  weights[largest] += diff;

  // 과잉 배분이라 가장 큰 부문이 1 미만이 되면, 큰 부문부터 1씩 되돌린다.
  while (weights[largest] < 1) {
    let donor = -1;
    for (let i = 0; i < n; i += 1) {
      if (i === largest) continue;
      if (weights[i] > 1 && (donor === -1 || weights[i] > weights[donor])) donor = i;
    }
    if (donor === -1) break;
    weights[donor] -= 1;
    weights[largest] += 1;
  }
  diff = 100 - weights.reduce((a, b) => a + b, 0);
  if (diff !== 0) weights[largest] += diff;
  return weights;
}

/* ──────────────────────────────────────────────── 5. 요구 조건 해석 */

/** 연수 요구에서 빼야 하는 일반어 — 도메인 한정어만 남기기 위한 목록. */
const TENURE_GENERIC = new Set(["개발", "년", "개월", "년차", "이상", "상용", "실무", "직무", "기간"]);

interface TenureSpec {
  requiredMonths: number;
  /** 이 연수를 인정할 도메인 한정어 (예: 게임). 비어 있으면 도메인 제한이 없다. */
  domain: string[];
}

/**
 * "상용 게임 개발 5년 이상" 같은 정량 조건을 읽는다.
 * "신입 지원 가능" 처럼 연수를 요구하지 않는 공고에 임의의 연수 부족 항목을 만들지 않는다. (기획서 12 샘플 D)
 */
export function parseTenure(req: Requirement): TenureSpec | null {
  const text = `${req.label} ${req.text}`;
  if (/신입|경력\s*무관|무관/.test(text)) return null;
  const m = /(\d+)\s*(년|개월|year|yr)/i.exec(text);
  if (!m) return null;
  if (!/경력|경험|년차|이상|years?/i.test(text)) return null;
  const unit = m[2].toLowerCase();
  const requiredMonths = unit === "개월" ? Number(m[1]) : Number(m[1]) * 12;
  if (requiredMonths <= 0) return null;

  const domain: string[] = [];
  keywordsOf(req.label, req.text).forEach((t) => {
    if (TENURE_GENERIC.has(t)) return;
    // "5년", "3개월" 같은 수량 표현은 영역을 뜻하지 않는다.
    if (/^\d+(년|개월|년차|주|일|회)$/.test(t)) return;
    domain.push(t);
  });
  return { requiredMonths, domain: domain.sort() };
}

/**
 * 도메인 앵커 — "직접 수행"으로 인정할 영역을 정한다.
 *
 * 공고의 연수 요구가 영역을 규정한다고 본다("상용 게임 개발 5년" → 게임).
 * 연수 요구가 없으면 직무명에서 일반 직함어를 뺀 나머지를 쓴다.
 * 그래도 없으면 빈 배열 — 도메인 제한 없이 판정한다.
 */
const ROLE_GENERIC = new Set([
  "senior",
  "junior",
  "staff",
  "lead",
  "principal",
  "manager",
  "specialist",
  "associate",
  "개발",
  "개발자",
  "매니저",
  "담당자",
  "팀장",
]);

export function domainAnchors(posting: JobPosting): string[] {
  const fromTenure: string[] = [];
  for (const r of posting.requirements) {
    const t = parseTenure(r);
    if (t) fromTenure.push(...t.domain);
  }
  if (fromTenure.length > 0) return uniq(fromTenure).sort();

  const fromRole: string[] = [];
  keywordsOf(posting.roleTitle).forEach((t) => {
    if (!ROLE_GENERIC.has(t)) fromRole.push(t);
  });
  return uniq(fromRole).sort();
}

/* ──────────────────────────────────────────────── 6. 경험 대조 */

/** "직접 수행"으로 인정할 경험 종류. 학위·수업·자격·교육은 직접 수행이 아니라 관련 경험이다. */
const PERFORMED_KINDS: ExperienceKind[] = [
  "job",
  "internship",
  "freelance",
  "project",
  "competition",
  "opensource",
  "research",
  "publication",
];

const RESPONSIBILITY_RANK: Record<ResponsibilityLevel, number> = {
  participate: 1,
  independent: 2,
  lead: 3,
  "own-org": 4,
};

export interface ExperienceMatch {
  exp: ExperienceItem;
  /** 겹친 요구 키워드 */
  shared: string[];
  /** 요구 키워드 중 몇 %가 이 경험에서 확인되는가 */
  ratio: number;
  /** 실제 수행 기록(과업·성과·역할·기술)에서 확인되었는가 */
  performed: boolean;
  /** 공고가 요구하는 영역 안의 경험인가 */
  inDomain: boolean;
  /** 이 요구에 해당하는, 이력에 실제로 적힌 과업·성과 문장 */
  matchedFacts: string[];
}

/** "참여·보조"라고 적힌 기록. 이 표현이 있으면 독립 수행으로 읽지 않는다. */
const PARTICIPATION_WORDS = /참여|보조|어시스트|서포트|협업만|일부\s*담당/;
/** "내가 했다"고 적힌 기록. */
const PERFORMED_VERBS =
  /(구현|개발|설계|개선|분석|해결|구축|작성|운영|출시|배포|최적화|검증|도입|리팩터|마이그레이션)(했|하였|하고|하며|한|함)/;

/**
 * 이 요구에 한정한 책임 수준.
 *
 * 이력 분석은 근거를 못 찾으면 '단순 참여'를 기본값으로 둔다(보수적 기본값).
 * 그런데 그 요구에 해당하는 기록이 "…을 구현했습니다"처럼 본인이 수행했다고 적혀 있고
 * 참여·보조를 뜻하는 표현이 없다면, 그 요구에 한해 '독립 수행'으로 읽는다.
 * 이력에 적힌 표현만 근거로 쓰며, 없는 근거를 만들지 않는다.
 */
function effectiveLevel(m: ExperienceMatch): ResponsibilityLevel {
  if (m.exp.responsibilityLevel !== "participate") return m.exp.responsibilityLevel;
  const text = m.matchedFacts.join(" ") || m.exp.ownRole;
  if (PERFORMED_VERBS.test(text) && !PARTICIPATION_WORDS.test(text)) return "independent";
  return "participate";
}

function experienceTexts(exp: ExperienceItem, scope: "performed" | "all"): (string | undefined)[] {
  if (scope === "performed") {
    return [...exp.tasks, ...exp.outcomes, exp.ownRole, ...exp.skills];
  }
  return [
    exp.organization,
    exp.title,
    exp.summary,
    exp.ownRole,
    exp.note,
    ...exp.tasks,
    ...exp.outcomes,
    ...exp.skills,
    ...exp.artifacts,
  ];
}

/**
 * 경험에서 뽑아 낸 키워드.
 * withConcepts 를 켜면 개념 연결표로 읽어 낸 토큰까지 더한다(요구와의 대조용).
 * 도메인 판정에는 개념 토큰을 쓰지 않는다 — 영역은 이력에 적힌 말 그대로만 본다.
 */
function experienceTokens(
  exp: ExperienceItem,
  scope: "performed" | "all",
  withConcepts = true,
): Set<string> {
  const texts = experienceTexts(exp, scope);
  const tokens = keywordsOf(...texts);
  if (withConcepts) {
    for (const c of conceptTokens(texts.filter(Boolean).join(" "))) tokens.add(c);
  }
  return tokens;
}

function isInDomain(exp: ExperienceItem, anchors: string[]): boolean {
  if (anchors.length === 0) return true; // 도메인을 특정할 수 없으면 제한하지 않는다
  const tokens = experienceTokens(exp, "all", false);
  return anchors.some((a) => tokens.has(a));
}

/** 요구 키워드와 경험을 대조한다. 직접/관련 판정은 여기서 한 번만 한다. */
function matchExperiences(
  reqTokens: Set<string>,
  profile: ApplicantProfile,
  anchors: string[],
): { direct: ExperienceMatch[]; related: ExperienceMatch[] } {
  const direct: ExperienceMatch[] = [];
  const related: ExperienceMatch[] = [];
  const size = Math.max(1, reqTokens.size);

  for (const exp of profile.experiences) {
    const performedShared = overlap(reqTokens, experienceTokens(exp, "performed"));
    const allShared = overlap(reqTokens, experienceTokens(exp, "all"));
    if (allShared.length === 0) continue;

    const inDomain = isInDomain(exp, anchors);
    const performed = performedShared.length > 0 && PERFORMED_KINDS.includes(exp.kind);
    const matchedFacts = [...exp.outcomes, ...exp.tasks].filter((line) => {
      const lineTokens = keywordsOf(line);
      for (const c of conceptTokens(line)) lineTokens.add(c);
      return overlap(reqTokens, lineTokens).length > 0;
    });
    const m: ExperienceMatch = {
      exp,
      shared: allShared,
      ratio: allShared.length / size,
      performed,
      inDomain,
      matchedFacts,
    };
    // 직접 수행 = 수행 계열 경험 + 실제 수행 기록에서 확인 + 공고가 요구하는 영역 안.
    if (performed && inDomain) direct.push(m);
    else related.push(m);
  }

  const byStrength = (a: ExperienceMatch, b: ExperienceMatch) =>
    b.ratio - a.ratio ||
    RESPONSIBILITY_RANK[effectiveLevel(b)] - RESPONSIBILITY_RANK[effectiveLevel(a)] ||
    a.exp.id.localeCompare(b.exp.id);

  return { direct: direct.sort(byStrength), related: related.sort(byStrength) };
}

function bestResponsibility(matches: ExperienceMatch[]): ResponsibilityLevel {
  let best: ResponsibilityLevel = "participate";
  for (const m of matches) {
    const level = effectiveLevel(m);
    if (RESPONSIBILITY_RANK[level] > RESPONSIBILITY_RANK[best]) best = level;
  }
  return best;
}

/**
 * 직접 근거의 수준.
 *   0   근거 없음
 *   25  같은 영역에 참여했다는 기록만 있음
 *   50  독립적으로 수행한 기록이 있음
 *   75  독립 수행 + 성과와 보여줄 결과물이 함께 있음
 *   100 과제 리드·조직 책임 수준에서 성과까지 확인됨
 */
function directLevel(matches: ExperienceMatch[]): MatchScore {
  if (matches.length === 0) return 0;
  const best = bestResponsibility(matches);
  const hasOutcome = matches.some((m) => m.exp.outcomes.length > 0);
  const hasArtifact = matches.some((m) => m.exp.artifacts.length > 0);

  if (best === "own-org") return 100;
  if (best === "lead") return hasOutcome ? 100 : 75;
  if (best === "independent") return hasOutcome && hasArtifact ? 75 : 50;
  return 25;
}

/** 관련 경험이 "설명할 수 있는 근거"인지. 독립 수행 + 성과/결과물이면 한 단계를 끌어올릴 수 있다. */
function isStrongRelated(matches: ExperienceMatch[]): boolean {
  return matches.some(
    (m) =>
      RESPONSIBILITY_RANK[effectiveLevel(m)] >= RESPONSIBILITY_RANK.independent &&
      (m.exp.outcomes.length > 0 || m.exp.artifacts.length > 0),
  );
}

/* ──────────────────────────────────────────────── 7. 부문 만들기 */

type DimensionMode = "keyword" | "tenure" | "portfolio";

interface DimensionSpec {
  key: string;
  kind: RequirementKind | "general";
  label: string;
  expectation: string;
  mode: DimensionMode;
  requirement?: Requirement;
  tenure?: TenureSpec;
}

/** 포트폴리오 부문은 "보여줄 결과물"이 이 지원에서 의미가 있을 때만 만든다. */
function needsPortfolioDimension(posting: JobPosting, profile: ApplicantProfile): boolean {
  const jdText = `${posting.body} ${posting.responsibilities.join(" ")} ${posting.requirements
    .map((r) => r.text)
    .join(" ")}`;
  if (/포트폴리오|결과물|산출물|github|깃허브|데모|portfolio|sample/i.test(jdText)) return true;
  return profile.experiences.some((e) => e.artifacts.length > 0);
}

function specsOf(posting: JobPosting, profile: ApplicantProfile): DimensionSpec[] {
  const specs: DimensionSpec[] = [];

  if (posting.requirements.length > 0) {
    for (const r of posting.requirements) {
      const tenure = parseTenure(r) ?? undefined;
      specs.push({
        key: r.id,
        kind: r.kind,
        label: r.label,
        expectation: r.text || r.label,
        mode: tenure ? "tenure" : "keyword",
        requirement: r,
        tenure,
      });
    }
  } else {
    // 요구 조건을 읽지 못했으면 인재상의 핵심 업무로 부문을 만든다. 빈 분석서를 내보내지 않기 위해서다.
    for (const t of posting.idealCandidate.coreTasks.slice(0, 3)) {
      specs.push({
        key: t.id,
        kind: "general",
        label: t.task,
        expectation: `${t.task} → ${t.expectedOutcome}`,
        mode: "keyword",
      });
    }
  }

  if (needsPortfolioDimension(posting, profile)) {
    specs.push({
      key: "portfolio",
      kind: "general",
      label: "포트폴리오·결과물",
      expectation: "핵심 요구에 맞는, 공개 가능한 결과물과 그 안에서의 본인 역할",
      mode: "portfolio",
    });
  }
  return specs;
}

function periodText(exp: ExperienceItem): string {
  const end = exp.end ? exp.end.replace("-", ".") : "현재";
  return `${exp.start.replace("-", ".")}~${end}`;
}

function describeExperience(exp: ExperienceItem): string {
  return `${exp.organization} · ${exp.title}(${periodText(exp)})`;
}

/** 이 경험에서 가장 사실적인 한 줄. 측정 가능한 성과를 먼저 쓴다. */
export function primaryFact(exp: ExperienceItem): string {
  return exp.outcomes[0] ?? exp.tasks[0] ?? exp.summary ?? exp.ownRole ?? exp.title;
}

/**
 * 그 요구에 가장 가까운 "실제 사실" 한 줄을 고른다.
 * 같은 경험이라도 요구가 다르면 인용할 사실이 달라야 한다
 * (예: 같은 3D 개발 경험이라도 기능 구현 요구에는 과업을, 최적화 요구에는 측정 성과를 쓴다).
 * 없는 사실을 만들지 않고, 이미 적혀 있는 문장 중에서만 고른다.
 */
export function bestFactFor(exp: ExperienceItem, reqTokens: Set<string>): string {
  const candidates = [...exp.outcomes, ...exp.tasks, exp.summary, exp.ownRole].filter(
    (v): v is string => Boolean(v && v.trim()),
  );
  if (candidates.length === 0) return exp.title;
  let best = candidates[0];
  let bestScore = -1;
  for (const c of candidates) {
    const tokens = keywordsOf(c);
    for (const concept of conceptTokens(c)) tokens.add(concept);
    // 측정 가능한 성과(outcomes)를 조금 우대한다.
    const score = overlap(reqTokens, tokens).length + (exp.outcomes.includes(c) ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function evidenceRefs(posting: JobPosting, spec: DimensionSpec, matches: ExperienceMatch[]): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  const jdQuote = spec.requirement?.sourceQuote || spec.expectation;
  refs.push({ source: "jd", refId: posting.id, quote: quoteOf(jdQuote) });
  for (const m of matches.slice(0, 3)) {
    refs.push({
      source: "profile",
      refId: m.exp.id,
      quote: quoteOf(`${describeExperience(m.exp)} — ${primaryFact(m.exp)}`),
    });
  }
  return refs;
}

export interface DimensionDraft {
  dimension: MatchDimension;
  direct: ExperienceMatch[];
  related: ExperienceMatch[];
}

function buildOneDimension(
  spec: DimensionSpec,
  weight: number,
  posting: JobPosting,
  profile: ApplicantProfile,
  anchors: string[],
  countMonths: MonthsCounter,
): DimensionDraft {
  const reqTokens = keywordsOf(spec.label, spec.expectation);
  const matched = matchExperiences(reqTokens, profile, anchors);

  let direct = matched.direct;
  let related = matched.related;
  let current: MatchScore;
  let afterStory: MatchScore;
  let target: MatchScore;
  let currentBasis: string;
  let storyBasis: string;
  let nextStep: string;
  let evidenceToProduce: string;
  let remainingGap: string;
  let targetCaveat: string | undefined;

  if (spec.mode === "portfolio") {
    // 결과물은 키워드가 아니라 artifacts 의 유무로 본다.
    const withArtifacts = profile.experiences.filter((e) => e.artifacts.length > 0);
    const toMatch = (exp: ExperienceItem): ExperienceMatch => ({
      exp,
      shared: [],
      ratio: 1,
      performed: PERFORMED_KINDS.includes(exp.kind),
      inDomain: isInDomain(exp, anchors),
      matchedFacts: [...exp.outcomes, ...exp.tasks],
    });
    direct = withArtifacts.filter((e) => isInDomain(e, anchors) && PERFORMED_KINDS.includes(e.kind)).map(toMatch);
    related = withArtifacts.filter((e) => !direct.some((d) => d.exp.id === e.id)).map(toMatch);

    current = direct.length >= 2 ? 75 : direct.length === 1 ? 50 : 0;
    afterStory =
      related.length > 0 ? Math.max(current, Math.min(RELATED_CEILING, stepUp(current, QUALITATIVE_LEVELS))) : current;
    target = 100;

    currentBasis =
      direct.length > 0
        ? `공고 영역 안에서 보여줄 수 있는 결과물이 ${direct.length}건 확인됩니다: ${direct
            .slice(0, 2)
            .map((m) => describeExperience(m.exp))
            .join(", ")}.`
        : "이 공고의 영역에서 바로 보여줄 수 있는 결과물을 찾지 못했습니다.";
    storyBasis =
      related.length > 0
        ? `다른 영역의 결과물 ${related.length}건(${related
            .slice(0, 2)
            .map((m) => describeExperience(m.exp))
            .join(", ")})에서 본인 역할과 기여를 명료화하면 함께 설명할 수 있습니다.`
        : "연결할 결과물을 찾지 못해 현재 값을 유지합니다.";
    nextStep = "핵심 요구에 맞는 공개 가능한 결과물을 정리하고, 각 결과물에서 본인이 맡은 범위를 적는다.";
    evidenceToProduce = "결과물 링크·역할 설명·구현 범위·확인 가능한 성과 자료";
    remainingGap =
      current >= 75
        ? "공개 범위와 비공개 정보 분리를 확인해야 합니다."
        : "공고의 핵심 요구를 직접 보여주는 결과물이 더 필요합니다.";
  } else if (spec.mode === "tenure" && spec.tenure) {
    const required = spec.tenure.requiredMonths;
    const domain = spec.tenure.domain;
    const inDomainExps = profile.experiences.filter((e) => {
      if (!PROFESSIONAL_KINDS.includes(e.kind)) return false;
      if (domain.length === 0) return true;
      const tokens = experienceTokens(e, "all");
      return domain.some((d) => tokens.has(d));
    });
    const domainMonths = countMonths(inDomainExps);
    const allMonths = countMonths(profile.experiences);

    direct = inDomainExps.map((exp) => ({
      exp,
      shared: [],
      ratio: 1,
      performed: true,
      inDomain: true,
      matchedFacts: [...exp.outcomes, ...exp.tasks],
    }));
    // 다른 영역의 재직 경력은 "직접 근거"가 아니다. 기술 관련성은 별도 부문에서 본다.
    related = profile.experiences
      .filter((e) => PROFESSIONAL_KINDS.includes(e.kind) && !inDomainExps.some((x) => x.id === e.id))
      .map((exp) => ({
        exp,
        shared: [],
        ratio: 0.5,
        performed: true,
        inDomain: false,
        matchedFacts: [...exp.outcomes, ...exp.tasks],
      }));

    const ratio = domainMonths / required;
    current = ratio >= 1 ? 100 : ratio >= 0.6 ? 75 : ratio >= 0.35 ? 50 : ratio > 0 ? 20 : 0;

    const equivalence = spec.requirement?.equivalence ?? "unknown";
    if (equivalence === "allowed") {
      // 공고가 동등 경험을 인정한다고 밝힌 경우에만 전체 재직 연수로 다시 본다.
      const allRatio = allMonths / required;
      const allLevel = allRatio >= 1 ? 100 : allRatio >= 0.6 ? 75 : allRatio >= 0.35 ? 50 : allRatio > 0 ? 20 : 0;
      afterStory = Math.max(current, allLevel);
    } else {
      afterStory = current;
    }
    // 미래의 개월 수를 목표에 미리 더하지 않는다. (기획서 03 하단)
    target = afterStory;
    targetCaveat =
      "실무 연수 충족은 별도 장기 과제입니다. 목표 매칭률에 앞으로 쌓을 경력 개월 수를 미리 더하지 않았습니다.";

    const yearsText = `${Math.floor(domainMonths / 12)}년 ${domainMonths % 12}개월`;
    currentBasis =
      domainMonths > 0
        ? `요구 영역(${domain.join("·") || "해당 직무"})의 재직 경력은 ${yearsText}로, 요구 ${Math.floor(
            required / 12,
          )}년 대비 일부입니다.`
        : `요구 영역(${domain.join("·") || "해당 직무"})의 재직 경력을 확인하지 못했습니다.`;
    storyBasis =
      equivalence === "allowed"
        ? `공고가 동등 경험을 인정하므로 전체 재직 경력 ${Math.floor(allMonths / 12)}년 ${allMonths % 12}개월을 함께 설명합니다.`
        : `다른 영역의 재직 경력 ${Math.floor((allMonths - domainMonths) / 12)}년 ${(allMonths - domainMonths) % 12}개월은 연수로 합산하지 않고 구분해 설명합니다. 기술 관련성은 별도 부문에 반영했습니다.`;
    nextStep =
      equivalence === "unknown"
        ? "동등 경력 인정 여부를 모집팀에 확인한다. 실무 연수 충족은 별도 장기 과제로 둔다."
        : "요구 영역의 실무 경력을 계속 쌓고, 기간과 본인 책임을 기록한다.";
    evidenceToProduce = "재직 기간·직함·담당 범위를 확인할 수 있는 경력 기록";
    remainingGap = `요구 ${Math.floor(required / 12)}년 대비 ${Math.max(
      0,
      required - domainMonths,
    )}개월이 남아 있습니다. 이 차이는 문장으로 메울 수 없습니다.`;
  } else {
    current = directLevel(direct);
    if (related.length === 0) {
      // 연결할 실제 경험이 없으면 오르지 않는다. 문장만 고쳐서 점수를 주지 않는다.
      afterStory = current;
    } else if (isStrongRelated(related)) {
      afterStory = Math.max(current, Math.min(RELATED_CEILING, stepUp(current, QUALITATIVE_LEVELS)));
    } else {
      afterStory = current === 0 ? 25 : current;
    }

    if (spec.kind === "preferred") {
      target = Math.max(afterStory, Math.min(RELATED_CEILING, stepUp(afterStory, QUALITATIVE_LEVELS)));
    } else {
      target = afterStory >= 75 ? 100 : 75;
    }

    currentBasis =
      direct.length > 0
        ? `${direct
            .slice(0, 2)
            .map((m) => describeExperience(m.exp))
            .join(", ")}에서 ${RESPONSIBILITY_LEVEL_LABEL[bestResponsibility(direct)]} 수준으로 직접 수행한 기록이 있습니다(확인 키워드: ${direct[0].shared
            .slice(0, 4)
            .join(", ")}).`
        : "이 기대를 직접 수행한 기록을 찾지 못했습니다.";
    storyBasis =
      related.length > 0
        ? `${related
            .slice(0, 2)
            .map((m) => `${describeExperience(m.exp)}의 ${EXPERIENCE_KIND_LABEL[m.exp.kind]} 경험`)
            .join(", ")}을 이 기대와 연결해 설명할 수 있습니다. 다른 환경의 성과를 이 직무의 성과로 바꾸지 않습니다.`
        : "연결할 관련 경험을 찾지 못했습니다. 문장을 고쳐도 이 값은 오르지 않습니다.";
    nextStep =
      current >= 75
        ? `${quoted(spec.label)} 에서 맡은 범위와 성과를 정리해 설명 가능한 형태로 만든다.`
        : `${quoted(spec.label)} 을 요구 범위에서 직접 수행하고, 본인 판단과 결과를 남긴다.`;
    evidenceToProduce = "수행 기록·본인 역할 설명·전후 측정 자료·동료 확인(리뷰·피드백)";
    remainingGap =
      afterStory >= 75
        ? "요구 범위 전체를 직접 책임진 근거가 남아 있습니다."
        : `이 공고가 요구하는 범위에서 직접 수행하고 결과를 측정한 근거가 더 필요합니다(현재 ${current}%).`;
  }

  const usedExperienceIds = uniq([...direct.map((m) => m.exp.id), ...related.map((m) => m.exp.id)]);

  // 근거가 하나도 없거나, 쓰인 경험 중 확인되지 않은 것이 있으면 "확인 필요"로 남긴다.
  let confidence: ConfidenceState = "confirmed";
  if (direct.length === 0 && related.length === 0) {
    confidence = "needs-confirmation";
  } else if ([...direct, ...related].some((m) => m.exp.confidence !== "confirmed")) {
    confidence = "needs-confirmation";
  } else if (spec.mode === "tenure" && (spec.requirement?.equivalence ?? "unknown") === "unknown") {
    confidence = "needs-confirmation";
  }

  const rationale: RationaleNote[] = [
    {
      claim: `현재 매칭 ${current}% — 직접 수행한 사실만 반영했습니다.`,
      evidence: evidenceRefs(posting, spec, direct),
      interpretation: currentBasis,
    },
    {
      claim: `스토리텔링 후 ${afterStory}% — 이미 가진 관련 경험을 연결한 값입니다.`,
      evidence: evidenceRefs(posting, spec, related),
      interpretation: storyBasis,
    },
    {
      claim: `실행 목표 ${target}% — 증거 확보 후 재평가할 조건부 목표입니다.`,
      evidence: [
        {
          source: "jd",
          refId: posting.id,
          quote: quoteOf(spec.requirement?.sourceQuote || spec.expectation),
        },
      ],
      interpretation: `${nextStep} 완료 증거: ${evidenceToProduce}.`,
    },
  ];

  const dimension: MatchDimension = {
    id: stableId("dim", posting.id, spec.key),
    label: spec.label,
    kind: spec.kind,
    requirementId: spec.requirement?.id,
    weight,
    current,
    afterStory,
    target,
    teamExpectation: spec.expectation,
    currentBasis,
    storyBasis,
    nextStep,
    evidenceToProduce,
    remainingGap,
    rationale,
    usedExperienceIds,
    confidence,
    targetCaveat,
  };

  return { dimension, direct, related };
}

/** 부문 초안(직접/관련 근거 포함) — 스토리·실행 카드가 같은 근거를 다시 계산하지 않도록 함께 돌려준다. */
export function buildDimensionDrafts(
  posting: JobPosting,
  profile: ApplicantProfile,
  options: MatchEngineOptions = {},
): DimensionDraft[] {
  const anchors = domainAnchors(posting);
  const asOf = options.asOf ?? inferAsOf(profile);
  const countMonths: MonthsCounter =
    options.professionalMonths ?? ((exps: ExperienceItem[]) => defaultProfessionalMonths(exps, asOf));

  const specs = specsOf(posting, profile);
  const weights = assignWeights(specs.map((s) => s.kind));
  const drafts = specs.map((spec, i) =>
    buildOneDimension(spec, weights[i], posting, profile, anchors, countMonths),
  );

  // 단계 역전(current > afterStory 등)을 마지막에 한 번 정리한다.
  const normalized = normalizeDimensions(drafts.map((d) => d.dimension));
  return drafts.map((d, i) => ({ ...d, dimension: normalized[i] }));
}

export function buildDimensions(
  posting: JobPosting,
  profile: ApplicantProfile,
  options: MatchEngineOptions = {},
): MatchDimension[] {
  return buildDimensionDrafts(posting, profile, options).map((d) => d.dimension);
}

/* ──────────────────────────────────────────────── 8. 경험 스토리 */

/**
 * afterStory > current 인 부문마다 하나의 이야기를 만든다.
 * resumeSentence 는 실제 경험의 사실만 쓴다 — 없는 성과를 만들지 않는다.
 */
export function buildStories(
  dimensions: MatchDimension[],
  profile: ApplicantProfile,
  posting: JobPosting,
  /** 이미 계산해 둔 초안이 있으면 다시 계산하지 않는다(같은 입력 → 같은 결과이므로 생략해도 무방). */
  precomputed?: DimensionDraft[],
): StoryCard[] {
  const drafts = precomputed ?? buildDimensionDrafts(posting, profile);
  const byId = new Map(drafts.map((d) => [d.dimension.id, d]));
  const cards: StoryCard[] = [];

  for (const dim of dimensions) {
    if (dim.afterStory <= dim.current) continue;
    const draft = byId.get(dim.id);
    const related = draft?.related ?? [];
    if (related.length === 0) continue; // 근거 없이 이야기를 만들지 않는다

    const primary = related[0].exp;
    const fact = bestFactFor(primary, keywordsOf(dim.label, dim.teamExpectation));
    // 사실 문장 앞에 출처(조직)만 덧붙인다. 내용은 바꾸지 않는다.
    const resumeSentence = fact.includes(primary.organization) ? fact : `${primary.organization}에서 ${fact}`;

    const evidence = uniq([
      ...primary.outcomes,
      ...primary.artifacts.map((a) => `결과물: ${a}`),
      primary.ownRole ? `본인 역할: ${primary.ownRole}` : "",
    ]).filter(Boolean);

    cards.push({
      id: stableId("story", dim.id, primary.id),
      dimensionId: dim.id,
      teamExpectation: dim.teamExpectation,
      usedExperience: describeExperience(primary),
      usedExperienceIds: related.slice(0, 3).map((m) => m.exp.id),
      connectionLogic: `${EXPERIENCE_KIND_LABEL[primary.kind]} 경험에서 ${
        primary.ownRole || "본인이 맡은 범위"
      }로 수행한 절차가 이 기대와 이어집니다. 다만 다른 환경의 성과를 이 직무의 성과로 바꾸지 않습니다.`,
      evidence,
      resumeSentence,
      interviewNote: `${describeExperience(
        primary,
      )}에서 수행한 내용이며, 이 공고가 요구하는 환경과의 차이와 공통된 절차를 함께 설명할 수 있습니다.`,
      scopeAndLimit: `${dim.current}% → ${dim.afterStory}%. ${dim.remainingGap}`,
      from: dim.current,
      to: dim.afterStory,
      adopted: true,
    });
  }
  return cards;
}

/* ──────────────────────────────────────────────── 9. 실행 과제 */

/** 실무 기회가 있어야만 채울 수 있는 기대. 이런 부문은 "3 실무 책임 쌓기"로 둔다. */
const NEEDS_REAL_WORK = /운영|출시|배포|장애|책임|리드|관리|멘토링|온보딩|고객|매출|손익|조직/;

/** 측정·결과물이 필요한 기대. "2 새 결과물 만들기". */
const NEEDS_ARTIFACT =
  /성능|최적화|분석|구현|설계|개발|데이터|모델|테스트|검증|연구|실험|결과물|포트폴리오|산출물/;

/** 부문 라벨을 문장 안에 넣을 때 쓰는 인용 표기. */
function quotedLabel(label: string): string {
  return quoted(label);
}

export function buildActions(dimensions: MatchDimension[], posting: JobPosting): ActionCard[] {
  const cards: ActionCard[] = [];

  for (const dim of dimensions) {
    if (dim.target <= dim.afterStory) continue; // 목표가 오르지 않는 부문은 과제를 만들지 않는다

    const text = `${dim.label} ${dim.teamExpectation}`;
    const gapSize = dim.target - dim.afterStory;
    let priority: 1 | 2 | 3;
    if (NEEDS_REAL_WORK.test(text)) {
      // 실제 업무 기회가 있어야 채울 수 있는 기대
      priority = 3;
    } else if (gapSize >= 50 || dim.usedExperienceIds.length === 0 || NEEDS_ARTIFACT.test(text)) {
      // 결과물과 측정이 필요한 기대
      priority = 2;
    } else {
      // 이미 있는 사실을 정리하면 설명이 되는 경우
      priority = 1;
    }

    const label = quotedLabel(dim.label);
    const actions =
      priority === 1
        ? [
            `${label} 에서 본인이 맡은 범위와 판단을 시간 순으로 정리한다.`,
            "이력서·면접에서 쓸 문장으로 옮기고, 어떤 사실을 어떤 근거로 말하는지 확인한다.",
          ]
        : priority === 2
          ? [
              `${label} 에 필요한 내용을 학습하고, 요구 범위와 같은 조건의 과제를 직접 수행한다.`,
              "수행 전후를 같은 조건에서 측정하고, 본인 코드·판단 과정을 함께 남긴다.",
            ]
          : [
              `${label} 을 실제 업무에서 맡을 기회를 확보한다(사내 과제·협업 프로젝트 포함).`,
              "진행 기간과 본인 책임 범위, 결과를 기록한다.",
            ];

    cards.push({
      id: stableId("action", dim.id),
      dimensionId: dim.id,
      priority,
      gap: `${dim.teamExpectation} — ${dim.remainingGap}`,
      from: dim.afterStory,
      to: dim.target,
      actions,
      evidence: [dim.evidenceToProduce, `${label} 의 수행 범위와 본인 역할을 확인할 수 있는 자료`],
      conditions: [
        priority === 3 ? "실제 업무 기회 또는 이에 준하는 협업 과제" : "학습·수행에 쓸 수 있는 시간",
        "결과물의 공개 가능 범위(비공개 정보 제외) 확인",
        dim.confidence === "needs-confirmation" ? "관련 사실 확인(자료 추가 또는 답변)" : "선행 지식 점검",
      ],
      reassessCriteria: `${label} 의 어느 범위를 본인이 직접 수행했는지, 결과가 같은 조건에서 확인되는지를 기준으로 ${dim.afterStory}% → ${dim.target}% 를 재평가합니다. 체크만으로는 반영하지 않습니다.`,
      status: "todo",
      savedToPlan: false,
    });
  }

  // 우선순위(지금 정리 → 새 결과물 → 실무 책임), 같은 순위면 비중이 큰 부문을 먼저.
  const weightOf = new Map(dimensions.map((d) => [d.id, d.weight]));
  return cards.sort(
    (a, b) =>
      a.priority - b.priority ||
      (weightOf.get(b.dimensionId) ?? 0) - (weightOf.get(a.dimensionId) ?? 0) ||
      a.id.localeCompare(b.id),
  );
}

/* ──────────────────────────────────────────────── 10. 추가 질문 */

const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 5;

/**
 * 점수가 낮고 근거가 부족한 부문에 대해서만 묻는다. (기획서 05)
 * 질문은 "무엇을 바꾸었고 어떻게 측정했는지"까지 구체적으로 묻는다.
 */
export function buildEnrichmentQuestions(
  dimensions: MatchDimension[],
  posting: JobPosting,
): EnrichmentQuestion[] {
  const anchors = domainAnchors(posting);
  const anchorWord = anchors[0];

  const ranked = [...dimensions]
    .filter((d) => d.afterStory < 75 || d.confidence === "needs-confirmation")
    .sort(
      (a, b) =>
        Number(b.confidence === "needs-confirmation") - Number(a.confidence === "needs-confirmation") ||
        a.afterStory - b.afterStory ||
        b.weight - a.weight ||
        a.id.localeCompare(b.id),
    );

  const take = Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, Math.min(ranked.length, MAX_QUESTIONS)));
  return ranked.slice(0, take).map((d) => {
    let question: string;
    if (d.usedExperienceIds.length === 0 && anchorWord) {
      // 기획서 05 의 예시 형식: "게임 외의 앱이나 3D 환경에서 …"
      question = `${anchorWord} 외의 환경에서 ${quoted(d.label)} 에 해당하는 문제를 직접 다뤄 본 경험이 있나요? 무엇을 바꾸었고 결과를 어떻게 측정했나요?`;
    } else if (d.usedExperienceIds.length === 0) {
      question = `${quoted(d.label)} 과 관련해 직접 수행한 일이 있나요? 무엇을 맡았고 결과를 어떻게 확인했나요?`;
    } else if (d.current === 0) {
      question = `${quoted(d.label)} 을 본인이 주도해서 수행한 사례가 있나요? 어느 범위까지 직접 결정했나요?`;
    } else {
      question = `${quoted(d.label)} 에서 바꾼 내용과 그 결과를 어떻게 측정했나요? 전후 수치나 확인할 수 있는 자료가 있나요?`;
    }

    return {
      id: stableId("q", d.id),
      dimensionId: d.id,
      question,
      why: `"${quoteOf(d.teamExpectation, 60)}" 에 대한 근거가 부족해 현재 ${d.current}%, 스토리 후 ${d.afterStory}% 로 보고 있습니다. 확인되면 이 부문을 다시 계산합니다.`,
      answerState: "unanswered",
    };
  });
}

/* ──────────────────────────────────────────────── 11. 분석서 조립 */

export function buildReport(
  posting: JobPosting,
  profile: ApplicantProfile,
  options: MatchEngineOptions = {},
): StrategyReport {
  const drafts = buildDimensionDrafts(posting, profile, options);
  const dimensions = drafts.map((d) => d.dimension);

  const stories = buildStories(dimensions, profile, posting, drafts);
  const actions = buildActions(dimensions, posting);
  const overall = computeOverall(dimensions);
  const mustHaveStatus = deriveMustHaveStatus(posting.requirements, dimensions);
  const equivalenceUnknown = posting.requirements.some(
    (r) => r.kind === "must" && r.equivalence === "unknown",
  );
  const verdict = deriveVerdict(overall, mustHaveStatus, equivalenceUnknown);

  const caveats = dimensions.filter((d) => d.targetCaveat).map((d) => d.label);
  const verdictNote = [
    `${VERDICT_LABEL[verdict]} — ${VERDICT_GUIDANCE[verdict]}`,
    caveats.length > 0
      ? `목표를 달성해도 ${caveats.join("·")} 조건은 별도 확인이 필요합니다.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: stableId("report", posting.id, profile.id),
    jobPostingId: posting.id,
    profileId: profile.id,
    idealCandidate: posting.idealCandidate,
    overall,
    dimensions,
    stories,
    actions,
    verdict,
    verdictNote,
    mustHaveStatus,
    readingNote: READING_NOTE,
    visibility: "private", // 분석서는 기본 비공개 (기획서 07)
    generatedBy: "heuristic",
  };
}

/* ──────────────────────────────────────────────── 12. 이력서 생성기가 쓰는 보조 */

/** 한 부문의 근거를 직접/관련으로 나눠 둔 것. 이력서 1 은 direct 만 담아야 하므로 필요하다. */
export interface DimensionEvidence {
  dimensionId: string;
  /** 그 일을 직접 수행한 경험 (이력서 1 부터 등장) */
  direct: string[];
  /** 관련성으로 연결한 경험 (이력서 2 부터 등장) */
  related: string[];
}

/**
 * 부문별 근거 색인.
 * MatchDimension.usedExperienceIds 는 직접+관련을 한 배열에 담기 때문에,
 * 이력서 판본을 나눌 때 필요한 구분을 여기서 따로 제공한다.
 */
export function buildEvidenceIndex(
  posting: JobPosting,
  profile: ApplicantProfile,
  options: MatchEngineOptions = {},
): Map<string, DimensionEvidence> {
  const index = new Map<string, DimensionEvidence>();
  for (const d of buildDimensionDrafts(posting, profile, options)) {
    index.set(d.dimension.id, {
      dimensionId: d.dimension.id,
      direct: uniq(d.direct.map((m) => m.exp.id)),
      related: uniq(d.related.map((m) => m.exp.id)),
    });
  }
  return index;
}
