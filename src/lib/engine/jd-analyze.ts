/**
 * jd-analyze.ts — 붙여넣은 채용공고 원문에서 JobPosting 을 규칙으로 뽑아낸다.
 *
 * 설계 전제
 *  - LLM 없이 동작해야 한다. 여기서 나온 결과는 사용자가 화면에서 고치는 "초안"이다.
 *    그래서 확신이 없는 필드는 비워 두고 reviewFlags 로 "확인 필요"를 남긴다. (기획서 02)
 *  - 공고 원문을 인용할 수 있어야 한다. Requirement.sourceQuote 와 RationaleNote.evidence 는
 *    항상 원문 줄을 그대로 담는다. ("왜 이렇게 해석했나요?" 기획서 04)
 *  - 절대 throw 하지 않는다. 읽을 수 없는 입력이면 빈 골격 + 안내 플래그를 돌려준다.
 *  - 나이·성별·외모·종교·가족관계는 인재상 판단에 쓰지 않는다. (기획서 14)
 */

import type {
  CoreTask,
  EquivalenceAllowance,
  IdealCandidate,
  JobPosting,
  Language,
  RationaleNote,
  Requirement,
  RequirementDerivation,
  RequirementKind,
  ResponsibilityLevel,
  ReviewFlag,
} from "../types";
import { RESPONSIBILITY_LEVEL_LABEL } from "../types";
import {
  type BulletItem,
  containsAny,
  lineContaining,
  normalize,
  shortHash,
  shorten,
  splitBulletItems,
  tokenize,
  unique,
} from "./text-utils";

export interface AnalyzeJobPostingInput {
  rawText: string;
  sourceType: JobPosting["sourceType"];
  sourceUrl?: string;
}

/** 한 페이지에 여러 공고가 있을 때 사용자가 고를 수 있게 하는 후보. (기획서 02) */
export interface PostingCandidate {
  title: string;
  body: string;
}

/* ────────────────────────────────────────────── 본문 정리 */

/**
 * 채용 사이트에서 긁어 오면 메뉴·버튼·광고 문구가 섞인다.
 * 확실한 것만 지운다 — 문장 일부를 지우면 근거 인용이 깨지므로 "줄 전체가 그 단어"일 때만.
 */
const NOISE_EXACT = new Set(
  [
    "로그인",
    "회원가입",
    "홈",
    "메뉴",
    "검색",
    "공유",
    "공유하기",
    "스크랩",
    "스크랩하기",
    "지원하기",
    "즉시지원",
    "입사지원",
    "목록",
    "목록보기",
    "이전",
    "다음",
    "닫기",
    "더보기",
    "맨위로",
    "top",
    "관심공고",
    "채용정보",
    "전체보기",
    "광고",
    "ad",
    "sponsored",
    "쿠키 설정",
    "개인정보처리방침",
    "이용약관",
    "고객센터",
    "앱 다운로드",
    "인쇄",
    "print",
    "apply",
    "apply now",
    "share",
  ].map((s) => s.toLowerCase()),
);

const BREADCRUMB_RE = /^(홈|home|채용|recruit)\s*[>›»/]/i;

function cleanBody(text: string): string {
  return normalize(text)
    .split("\n")
    .filter((rawLine) => {
      const line = rawLine.trim();
      if (!line) return true; // 빈 줄은 섹션 경계로 쓰므로 남긴다
      if (NOISE_EXACT.has(line.toLowerCase().replace(/[.·•\s]+$/, ""))) return false;
      if (BREADCRUMB_RE.test(line)) return false;
      if (/^[^가-힣A-Za-z0-9]+$/.test(line)) return false; // 구분선만 있는 줄
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 본문으로 볼 수 있을 만큼의 내용이 있는가. 없으면 빈 골격을 돌려준다. */
function isReadable(body: string): boolean {
  const lines = body.split("\n").filter((l) => l.trim().length > 0);
  return body.replace(/\s/g, "").length >= 40 && lines.length >= 2;
}

/* ────────────────────────────────────────────── 섹션 감지 */

type SectionKey = "responsibilities" | "must" | "preferred" | "benefits" | "process" | "about";

/**
 * 섹션 제목 패턴. 위에서부터 먼저 맞는 것을 쓴다.
 * "우대"를 "자격요건"보다 먼저 본다 — "우대 자격요건" 같은 제목이 필수로 분류되면 안 된다.
 */
const SECTION_PATTERNS: Array<{ key: SectionKey; re: RegExp }> = [
  {
    key: "preferred",
    re: /^(우대\s*(사항|조건|요건|자격|경험)?|이런\s*분이면\s*더|있으면\s*좋은|preferred|nice\s*to\s*have|plus(es)?|bonus)/i,
  },
  {
    key: "must",
    re: /^(자격\s*요건|지원\s*자격|필수\s*(사항|조건|요건|자격|경험)?|기본\s*요건|응시\s*자격|이런\s*분을\s*찾|requirements?|qualifications?|must[\s-]?haves?|basic\s*qualifications|who\s*you\s*are)/i,
  },
  {
    key: "responsibilities",
    re: /^(주요\s*업무|담당\s*업무|업무\s*내용|수행\s*업무|하게\s*될\s*일|맡게\s*될\s*일|역할과\s*책임|업무\s*범위|업무|responsibilities|what\s*you.?ll\s*do|the\s*role|job\s*description|key\s*duties)/i,
  },
  {
    key: "benefits",
    re: /^(근무\s*(조건|환경|형태|지|시간)|고용\s*형태|혜택|복지|처우|보상|급여|benefits?|perks?|compensation|we\s*offer)/i,
  },
  {
    key: "process",
    re: /^(전형\s*절차|채용\s*절차|채용\s*과정|제출\s*서류|지원\s*방법|지원\s*서류|서류\s*접수|접수\s*방법|기타\s*사항|유의\s*사항|how\s*to\s*apply|hiring\s*process|application)/i,
  },
  {
    key: "about",
    re: /^(회사\s*소개|팀\s*소개|조직\s*소개|about\s*(us|the\s*team|the\s*company))/i,
  },
];

interface HeadingMatch {
  key: SectionKey;
  heading: string;
  /** "자격요건: 5년 이상" 처럼 제목 줄에 내용이 붙어 온 경우 */
  inline?: string;
}

/** 줄 앞뒤의 장식 문자(#, ■, ▶, 불릿)만 떼어 낸다. 내용은 건드리지 않는다. */
function stripDecoration(line: string): string {
  return line
    .replace(/^[#*•·▪▫◦‣※◆■□▶✓✔\-–—\s]+/, "")
    .replace(/[\s#*•·▪◆■□▶]+$/, "")
    .trim();
}

/**
 * 제목 줄에서 장식과 감싼 괄호, 끝의 콜론을 떼어 낸다.
 * 괄호는 "감싼 것"만 벗긴다 — "주요업무 (Responsibilities)" 의 닫는 괄호를 지워 버리면
 * 뒤에서 괄호 설명을 걷어낼 수 없게 된다.
 */
function bareHeading(line: string): string {
  const value = stripDecoration(line);
  // 줄 전체를 감싼 괄호일 때만 벗긴다. 그래야 "주요업무 (Responsibilities)" 의
  // 닫는 괄호가 살아남아 뒤에서 괄호 설명을 걷어낼 수 있다.
  const wrapped = /^[【[(<]\s*([^】\])>]*)\s*[】\])>]$/.exec(value);
  return (wrapped ? wrapped[1] : value).replace(/[:：]\s*$/, "").trim();
}

function sectionKeyOf(candidate: string): SectionKey | null {
  // 괄호 설명("주요업무 (Responsibilities)")은 길이 판정에서 뺀다.
  const bare = candidate.replace(/\s*[(（][^)）]*[)）]\s*$/, "").trim();
  if (!bare || bare.length > 30) return null;
  for (const { key, re } of SECTION_PATTERNS) {
    const m = re.exec(bare);
    // 제목은 키워드가 줄의 대부분을 차지해야 한다. 그래야 "자격요건을 확인하세요" 같은
    // 본문 문장을 제목으로 오해하지 않는다.
    if (m && bare.length - m[0].length <= 8) return key;
  }
  return null;
}

function matchHeading(line: string): HeadingMatch | null {
  const bare = bareHeading(line);
  const direct = sectionKeyOf(bare);
  if (direct) return { key: direct, heading: bare };

  const inline = /^([^:：]{2,24})[:：]\s*(.+)$/.exec(bare);
  if (inline) {
    const key = sectionKeyOf(inline[1].trim());
    if (key) return { key, heading: inline[1].trim(), inline: inline[2].trim() };
  }
  return null;
}

interface Section {
  key: SectionKey;
  heading: string;
  items: BulletItem[];
}

interface SectionScan {
  sections: Section[];
  /** 첫 섹션 제목 앞에 있던 줄들 — 회사·직무 추출과 업무 대체 추출에 쓴다. */
  preamble: string[];
}

function detectSections(body: string): SectionScan {
  const preamble: string[] = [];
  const sections: Section[] = [];
  let current: { key: SectionKey; heading: string; buffer: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    sections.push({
      key: current.key,
      heading: current.heading,
      items: splitBulletItems(current.buffer.join("\n")),
    });
    current = null;
  };

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    const heading = line ? matchHeading(line) : null;
    if (heading) {
      flush();
      current = {
        key: heading.key,
        heading: heading.heading,
        buffer: heading.inline ? [heading.inline] : [],
      };
      continue;
    }
    if (current) current.buffer.push(line);
    else if (line) preamble.push(line);
  }
  flush();
  return { sections, preamble };
}

function itemsOf(sections: Section[], key: SectionKey): BulletItem[] {
  // 같은 제목이 두 번 나오는 공고(예: 직무별 필수 조건)를 모두 모은다.
  return sections.filter((s) => s.key === key).flatMap((s) => s.items);
}

/* ────────────────────────────────────────────── 여러 공고 분리 */

/** 공고 제목처럼 보이는 줄인가. 섹션 제목은 제외한다. */
function isPostingHeading(line: string): boolean {
  const value = stripDecoration(line);
  if (value.length < 4 || value.length > 70) return false;
  if (sectionKeyOf(bareHeading(value))) return false;
  if (/^#{1,3}\s+\S/.test(value)) return true;
  if (/^[[【(]\s*[^\]】)]{2,30}\s*[\]】)]/.test(value)) return true;
  if (/(채용|모집|공고|포지션)\s*$/.test(value)) return true;
  if (/(채용|모집)\s*(공고|중|합니다)/.test(value)) return true;
  if (
    /^\d{1,2}[.)]\s*\S/.test(value) &&
    /(개발자|엔지니어|매니저|디자이너|기획자|연구원|analyst|engineer|manager|designer|scientist|pm)\b/i.test(
      value,
    )
  )
    return true;
  return false;
}

/**
 * 한 페이지에 여러 공고가 있으면 나눈다. (기획서 02 "여러 공고가 한 페이지에 있으면 하나를 고른다")
 * 확실하지 않으면 나누지 않는다 — 하나의 공고를 잘못 쪼개면 조건이 통째로 사라진다.
 */
export function splitPostings(rawText: string): PostingCandidate[] {
  const body = cleanBody(rawText);
  if (!body) return [];

  const lines = body.split("\n");
  const headingIndexes: number[] = [];
  lines.forEach((line, i) => {
    if (isPostingHeading(line)) headingIndexes.push(i);
  });

  const segments: PostingCandidate[] = [];
  if (headingIndexes.length >= 2) {
    for (let i = 0; i < headingIndexes.length; i += 1) {
      const from = headingIndexes[i];
      const to = i + 1 < headingIndexes.length ? headingIndexes[i + 1] : lines.length;
      const chunk = lines.slice(from, to);
      const filled = chunk.filter((l) => l.trim().length > 0);
      // 제목만 있고 내용이 없는 조각은 공고가 아니라 소제목일 가능성이 크다.
      if (filled.length >= 3) {
        segments.push({
          title: stripDecoration(lines[from]),
          body: chunk.join("\n").trim(),
        });
      }
    }
  }

  if (segments.length >= 2) return segments;
  const firstLine = lines.find((l) => l.trim().length > 0) ?? "";
  return [{ title: stripDecoration(firstLine), body }];
}

/* ────────────────────────────────────────────── 회사·직무·팀 */

function labelValue(body: string, labels: string[]): string | null {
  for (const line of body.split("\n")) {
    const m = new RegExp(`^\\s*[\\[(]?\\s*(?:${labels.join("|")})\\s*[\\])]?\\s*[:：]\\s*(.+)$`, "i").exec(
      line.trim(),
    );
    if (m) {
      const value = m[1].trim().replace(/[.,·|]+$/, "");
      if (value) return value;
    }
  }
  return null;
}

const COMPANY_SUFFIX_RE =
  /(주식회사|㈜|\(주\)|스튜디오|랩스|랩|테크|소프트|시스템즈|컴퍼니|그룹|코리아|파트너스|Inc\.?|Corp\.?|Ltd\.?|LLC|Labs?|Studios?|Technologies)$/i;

function extractCompany(body: string, preamble: string[]): string {
  const labeled = labelValue(body, ["회사", "회사명", "기업", "기업명", "소속", "company"]);
  if (labeled) return labeled;

  for (const rawLine of preamble.slice(0, 6)) {
    const line = stripDecoration(rawLine);
    // "[루멘플레이 스튜디오] Senior Unity Gameplay Engineer 채용"
    const bracket = /^[[【(]\s*([^\]】)]{2,30})\s*[\]】)]/.exec(line.trim());
    if (bracket) {
      const value = bracket[1].trim();
      if (!/^(신입|경력|정규직|계약직|채용|모집|D-\d+)/.test(value)) return value;
    }
    // "루멘플레이 스튜디오에서 ... 모집합니다"
    const subject = /^(.{2,30}?)(?:에서|은|는)\s.*(?:모집|채용)/.exec(line.trim());
    if (subject && COMPANY_SUFFIX_RE.test(subject[1].trim())) return subject[1].trim();
    const suffix = /((?:주식회사\s*)?[가-힣A-Za-z0-9&.\s]{2,24}?(?:주식회사|㈜|\(주\)|스튜디오|랩스|테크|소프트|컴퍼니|그룹|코리아|Inc\.?|Corp\.?|Labs?))(?=\s|$|[,·|])/.exec(
      line.trim(),
    );
    if (suffix) return suffix[1].trim();
  }
  return "";
}

const ROLE_WORD_RE =
  /(개발자|엔지니어|매니저|디자이너|기획자|연구원|분석가|컨설턴트|마케터|PM|PO|리드|Engineer|Developer|Manager|Designer|Analyst|Scientist|Researcher|Specialist|Lead|Director|Fellow)/i;

function cleanRoleTitle(value: string): string {
  return stripDecoration(value)
    .replace(/^[[【(]\s*[^\]】)]*\s*[\]】)]\s*/, "") // 앞의 [회사] 제거
    .replace(/\s*[[(（]\s*(신입|경력|경력직|정규직|계약직|인턴|채용전환형)[^)\]）]*\s*[)\]）]/g, "")
    .replace(/\s*(채용\s*공고|채용|모집)\s*$/, "")
    .replace(/\s*(합니다|해요|중)\s*$/, "")
    .replace(/[.,·|:-]+$/, "")
    .trim();
}

function extractRoleTitle(body: string, preamble: string[]): string {
  const labeled = labelValue(body, [
    "직무",
    "포지션",
    "모집부문",
    "모집\\s*분야",
    "모집\\s*직무",
    "채용\\s*직무",
    "직군",
    "position",
    "job\\s*title",
    "role",
  ]);
  if (labeled) return cleanRoleTitle(labeled);

  for (const line of preamble.slice(0, 6)) {
    const value = cleanRoleTitle(line.trim());
    if (value.length >= 2 && value.length <= 60 && ROLE_WORD_RE.test(value)) return value;
  }
  // 제목 줄에 직무 단어가 없더라도, 첫 줄이 "○○ 채용"이면 그 앞부분을 직무로 본다.
  for (const line of preamble.slice(0, 3)) {
    if (/(채용|모집)/.test(line)) {
      const value = cleanRoleTitle(line.trim());
      if (value.length >= 2 && value.length <= 60) return value;
    }
  }
  return "";
}

function extractTeam(body: string, preamble: string[]): string | undefined {
  const labeled = labelValue(body, ["팀", "소속\\s*팀", "부서", "조직", "team", "department"]);
  if (labeled) return labeled;
  for (const line of preamble.slice(0, 8)) {
    const m = /([가-힣A-Za-z0-9 ]{2,20}팀)(?=[\s,·|]|$|에서|에|은|는)/.exec(line);
    if (m) return m[1].trim();
  }
  return undefined;
}

function extractLocation(body: string): string | undefined {
  const labeled = labelValue(body, ["근무지", "근무\\s*장소", "위치", "지역", "location", "office"]);
  return labeled ?? undefined;
}

function extractEmploymentType(body: string): string | undefined {
  const labeled = labelValue(body, ["고용\\s*형태", "근무\\s*형태", "employment\\s*type"]);
  if (labeled) return labeled;
  const m = /(정규직|계약직|파견직|인턴십|인턴|프리랜스|Full[-\s]?time|Part[-\s]?time|Contract)/i.exec(body);
  return m ? m[1] : undefined;
}

/* ────────────────────────────────────────────── 조건(requirements) */

/** 동등 경험을 인정한다는 신호. */
const EQUIVALENCE_ALLOWED_SIGNALS = [
  "또는 동등",
  "동등한",
  "동등 경험",
  "동등한 경험",
  "이에 준하는",
  "준하는 경험",
  "상응하는",
  "그에 상응",
  "equivalent",
  "or equivalent",
  "comparable experience",
];

/** 대체를 인정하지 않는다는 신호. "필수"라는 단어만으로는 판단하지 않는다. */
const EQUIVALENCE_BLOCKED_SIGNALS = [
  "대체 불가",
  "대체할 수 없",
  "예외 없",
  "반드시 충족",
  "필수이며 대체",
  "no exception",
  "strictly required",
  "non-negotiable",
];

/**
 * 동등 경험 인정 여부.
 * 신호가 없으면 반드시 'unknown' 이다. 모르면 모른다고 남기고 사용자가 채용팀에 확인하게 한다.
 * (기획서 03 "동등 경력 인정 여부 확인", 기획서 04 "정보가 부족한 항목은 확인 필요로 남긴다")
 */
export function detectEquivalence(text: string, kind: RequirementKind): EquivalenceAllowance {
  if (containsAny(text, EQUIVALENCE_BLOCKED_SIGNALS)) return "not-allowed";
  if (containsAny(text, EQUIVALENCE_ALLOWED_SIGNALS)) return "allowed";
  // 우대 조건은 충족하지 못해도 지원이 막히지 않으므로, 관련 경험으로 설명할 여지가 열려 있다.
  if (kind === "preferred") return "allowed";
  if (/우대|preferred|plus/i.test(text)) return "allowed";
  return "unknown";
}

/** 화면에 쓸 짧은 이름. 문장을 그대로 두면 표가 읽히지 않는다. */
export function toRequirementLabel(text: string): string {
  let label = text.split(/[.\n]|(?:\s[-–—]\s)/)[0].trim();
  label = label.replace(/\s*[(（][^)）]*[)）]\s*/g, " ");
  label = label.replace(/\s*(?:하신|있으신|가능하신|보유하신|해보신)\s*분.*$/, "");
  label = label.replace(/\s*(?:경험|이해|지식)이?\s*있(?:는|으신)\s*분.*$/, "");
  label = label.replace(/\s*(?:에\s*대한|에\s*관한)\s*(?:경험|이해|지식|이해도)\s*$/, "");
  // 조사를 먼저 떼야 "…경험이" 같은 꼬리가 남지 않는다.
  label = label.replace(/\s*(?:이|가|을|를|은|는)\s*$/, "");
  label = label.replace(/\s*(?:경험|경력|역량|능력|이해도|지식)\s*(?:보유|필요|필수|우대)?\s*$/, "");
  label = label.replace(/\s*(?:이|가|을|를|은|는)\s*$/, "");
  label = label.replace(/[,·:;\-–—]+$/, "").trim();
  if (!label) label = text.trim();
  return shorten(label, 24);
}

function buildRequirement(
  item: BulletItem,
  kind: RequirementKind,
  index: number,
  derivation: RequirementDerivation = "stated",
  inferenceNote?: string,
): Requirement {
  const text = item.text.trim();
  return {
    id: `req-${kind}-${index + 1}${derivation === "inferred" ? "-inf" : ""}`,
    kind,
    label: toRequirementLabel(text),
    text,
    equivalence: detectEquivalence(text, kind),
    sourceQuote: item.raw, // 원문 줄 그대로 — 근거로 보여줘야 한다
    // 자격 요건 절에서 뽑은 것은 공고에 명시된 조건이다.
    derivation,
    inferenceNote,
  };
}

/**
 * 주요 업무에서 읽어낸 기대를 조건으로 덧붙인다.
 *
 * 공고가 자격 요건에 적지 않았더라도, 업무 설명에 "성능 문제를 해결하고 출시 품질을 책임진다"가
 * 있으면 그 팀이 기대하는 사람의 모습은 분명하다. 그 해석은 유용하다.
 * 다만 명시된 조건과 같은 무게로 보이면 안 되므로 derivation: 'inferred' 로 남긴다.
 */
function inferRequirementsFromDuties(
  responsibilities: BulletItem[],
  stated: Requirement[],
): Requirement[] {
  const statedTokens = new Set(
    stated.flatMap((r) => tokenize(`${r.label} ${r.text}`)).filter((t) => t.length > 1),
  );

  const out: Requirement[] = [];
  responsibilities.forEach((item, i) => {
    const tokens = tokenize(item.text).filter((t) => t.length > 1);
    if (tokens.length === 0) return;
    // 이미 명시 조건이 덮고 있는 업무는 다시 만들지 않는다.
    const covered = tokens.filter((t) => statedTokens.has(t)).length / tokens.length;
    if (covered >= 0.4) return;
    out.push(
      buildRequirement(
        item,
        "must",
        stated.length + i + 1,
        "inferred",
        "자격 요건이 아니라 주요 업무 설명에서 읽어낸 기대입니다. 모집팀의 공식 요건과 다를 수 있습니다.",
      ),
    );
  });
  // 해석으로 만든 조건이 명시 조건보다 많아지면 분석이 추측처럼 보인다. 상위 2개만 쓴다.
  return out.slice(0, 2);
}

/* ────────────────────────────────────────────── 인재상 */

/**
 * 책임 수준 신호.
 * 위에서부터 검사해 가장 높은 수준을 택한다. 성격이 아니라 "맡기려는 책임 범위"만 본다.
 */
const RESPONSIBILITY_SIGNALS: Array<{ level: ResponsibilityLevel; label: string; re: RegExp }> = [
  {
    level: "own-org",
    label: "조직·손익 책임",
    re: /조직\s*(?:책임|운영)[가-힣]*|손익[가-힣]*|P&L|부문장|본부장|\bhead of\b|country\s*manager/i,
  },
  {
    level: "lead",
    label: "리드·총괄·책임",
    re: /(?:리드|리딩|총괄|팀장|책임자|매니징|멘토링)[가-힣]*|책임(?:지|집|질|져)[가-힣]*|이끄[가-힣]*|이끌[가-힣]*|\blead(?:s|ing)?\b|\bmentor(?:ing)?\b/i,
  },
  {
    level: "independent",
    label: "주도·독립·설계",
    re: /(?:주도|독립|단독|설계|전담|오너십)[가-힣]*|직접\s*(?:수행|구현|설계)[가-힣]*|\bownership\b|\bindependently\b|\bdrive[sn]?\b/i,
  },
];

interface LevelDecision {
  level: ResponsibilityLevel;
  /** 근거가 된 표현 그대로 */
  signal: string | null;
  label: string | null;
  /** 그 표현이 들어 있던 원문 줄 */
  quote: string | null;
}

function detectResponsibilityLevel(body: string): LevelDecision {
  for (const { level, label, re } of RESPONSIBILITY_SIGNALS) {
    const m = re.exec(body);
    if (m) return { level, signal: m[0], label, quote: lineContaining(body, m[0]) };
  }
  return { level: "participate", signal: null, label: null, quote: null };
}

/** 업무 문장을 명사구로 다듬어 인재상 한 문장에 넣는다. */
function toTaskNoun(task: string): string {
  let value = task.split(/[.\n]/)[0].trim();
  value = value.replace(/\s*[(（][^)）]*[)）]\s*/g, " ");
  value = value.replace(/\s*(?:등|및\s*기타)\s*$/, "");
  value = value.replace(
    /(했습니다|합니다|집니다|됩니다|입니다|해요|한다|된다|하기|하며|하고|함|할\s*수\s*있는|하는\s*일)\s*$/,
    "",
  );
  value = value.replace(/\s*(?:을|를|이|가|은|는)\s*$/, "");
  value = value.replace(/[,·:;\-–—]+$/, "").trim();
  return shorten(value || task.trim(), 22);
}

/** 업무에서 팀이 기대하는 결과를 말로 풀어 준다. 근거 없는 수치는 만들지 않는다. */
function expectedOutcomeFor(task: string): string {
  const rules: Array<[RegExp, string]> = [
    [/최적화|성능|개선|튜닝|profil/i, "같은 조건에서 개선 전후를 측정해 설명할 수 있는 상태"],
    [/출시|배포|런칭|release|deploy/i, "담당한 출시 단계와 본인 결정을 기록으로 보여줄 수 있는 상태"],
    [/운영|장애|대응|모니터링|live|ops/i, "대응 기록과 후속 조치를 보여줄 수 있는 상태"],
    [/협업|커뮤니케이션|리뷰|review|협의/i, "다른 직군과의 합의 과정과 결과를 설명할 수 있는 상태"],
    [/설계|아키텍처|architect|design/i, "설계 판단의 근거와 검토한 대안을 설명할 수 있는 상태"],
    [/분석|리서치|analysis|research|데이터/i, "분석 과정과 결론의 근거를 재현할 수 있는 상태"],
    [/멘토|교육|온보딩|coach/i, "지원한 내용과 이후 피드백을 보여줄 수 있는 상태"],
    [/구현|개발|기능|build|implement/i, "요구한 기능이 동작하는 형태로 구현되어 있는 상태"],
  ];
  for (const [re, outcome] of rules) {
    if (re.test(task)) return outcome;
  }
  return "맡은 범위와 본인 역할을 결과물로 보여줄 수 있는 상태";
}

function buildCoreTasks(responsibilities: string[]): CoreTask[] {
  // 공고는 중요한 업무를 앞에 적는다. 상위 3개를 팀이 맡기려는 일로 본다. (기획서 04)
  return responsibilities.slice(0, 3).map((task, i) => ({
    id: `task-${i + 1}`,
    task: shorten(task, 70),
    expectedOutcome: expectedOutcomeFor(task),
  }));
}

function buildIdealCandidate(args: {
  postingId: string;
  body: string;
  roleTitle: string;
  responsibilityQuotes: BulletItem[];
  mustRequirements: Requirement[];
}): IdealCandidate {
  const { postingId, body, roleTitle, responsibilityQuotes, mustRequirements } = args;
  const responsibilities = responsibilityQuotes.map((item) => item.text);
  const coreTasks = buildCoreTasks(responsibilities);
  const decision = detectResponsibilityLevel(body);

  const nouns = coreTasks.map((t) => toTaskNoun(t.task));
  const subject = roleTitle || "지원자";
  // 업무 문구에 이미 "…을/를" 이 들어 있는 경우가 많아, 뒤에 조사를 또 붙이면 문장이 깨진다.
  // 그래서 업무는 나열하고 한 번만 "이 일을 맡을 ○○" 로 닫는다.
  const oneLine = nouns.length > 0 ? `${nouns.join(" · ")} — 이 일을 맡을 ${subject}` : "";

  const rationale: RationaleNote[] = [];
  if (coreTasks.length > 0) {
    rationale.push({
      claim: `이 팀이 맡기려는 일은 "${nouns.join(" / ")}" 로 읽었습니다.`,
      evidence: responsibilityQuotes.slice(0, 3).map((item) => ({
        source: "jd" as const,
        refId: postingId,
        quote: item.raw,
      })),
      interpretation:
        "주요 업무 항목에서 먼저 적힌 순서를 팀이 중요하게 보는 순서로 해석했습니다. 순서가 다르면 직접 바꿀 수 있습니다.",
    });
  }
  rationale.push({
    claim: `기대하는 책임 수준은 "${RESPONSIBILITY_LEVEL_LABEL[decision.level]}" 로 읽었습니다.`,
    evidence: decision.quote
      ? [{ source: "jd" as const, refId: postingId, quote: decision.quote }]
      : [],
    interpretation: decision.signal
      ? `${decision.label} 신호("${decision.signal}")를 책임 범위의 근거로 보았습니다.`
      : "책임 범위를 가리키는 표현이 없어 가장 낮은 수준(단순 참여)으로 두었습니다. 확인이 필요합니다.",
  });
  if (mustRequirements.length > 0) {
    rationale.push({
      claim: `필수 조건 ${mustRequirements.length}개를 총점과 분리해 따로 확인합니다.`,
      evidence: mustRequirements.slice(0, 3).map((req) => ({
        source: "jd" as const,
        refId: postingId,
        quote: req.sourceQuote,
      })),
      interpretation:
        "필수 조건 충족 여부는 매칭률과 다른 정보입니다. 총점이 높아도 필수 조건이 충족되었다는 뜻은 아닙니다.",
    });
  }

  return {
    oneLine,
    coreTasks,
    responsibilityLevel: decision.level,
    responsibilityNote: decision.signal
      ? `공고의 "${decision.signal}" 표현을 근거로 ${RESPONSIBILITY_LEVEL_LABEL[decision.level]} 수준으로 보았습니다.`
      : "책임 범위를 가리키는 표현을 찾지 못해 단순 참여로 두었습니다. 확인이 필요합니다.",
    rationale,
  };
}

/* ────────────────────────────────────────────── 문서 규칙 */

function extractDocumentRules(body: string): JobPosting["documentRules"] | undefined {
  const rules: NonNullable<JobPosting["documentRules"]> = {};
  const quotes: string[] = [];

  // 문서 언어는 "국문 이력서" 처럼 문서를 가리킬 때만 본다.
  // 본문에 "영어 커뮤니케이션" 같은 표현이 있다고 영문 이력서로 바꾸면 안 된다.
  const koMatch = /(?:국문|한국어|한글)\s*(?:이력서|자기소개서|지원서|resume|cv)/i.exec(body);
  const enMatch = /(?:영문|영어|English)\s*(?:이력서|자기소개서|지원서|resume|cv)/i.exec(body);
  let language: Language | undefined;
  if (enMatch && !koMatch) language = "en";
  else if (koMatch && !enMatch) language = "ko";
  else if (koMatch && enMatch) {
    // 둘 다 언급되면 먼저 적힌 쪽을 기본으로 본다.
    language = (koMatch.index ?? 0) <= (enMatch.index ?? 0) ? "ko" : "en";
  }
  if (language) {
    rules.language = language;
    const quote = lineContaining(body, (language === "ko" ? koMatch : enMatch)?.[0] ?? "");
    if (quote) quotes.push(quote);
  }

  const pageMatch =
    /A4\s*(\d)\s*(?:장|페이지|쪽)|(\d)\s*(?:장|페이지|쪽)\s*(?:이내|이하|내외|분량)|within\s*(\d)\s*pages?|(\d)\s*pages?\s*(?:max|or less)/i.exec(
      body,
    );
  if (pageMatch) {
    const page = Number(pageMatch[1] ?? pageMatch[2] ?? pageMatch[3] ?? pageMatch[4]);
    if (page >= 1 && page <= 9) {
      rules.maxPages = page;
      const quote = lineContaining(body, pageMatch[0]);
      if (quote) quotes.push(quote);
    }
  }

  const formats = unique(
    (body.match(/\b(PDF|Word|DOCX|DOC|HWP|한글\s*파일|PPT)\b/gi) ?? []).map((f) => f.toUpperCase()),
  );
  if (formats.length > 0) {
    rules.format = formats.join(" / ");
    const quote = lineContaining(body, formats[0]);
    if (quote) quotes.push(quote);
  }

  if (Object.keys(rules).length === 0) return undefined;
  if (quotes.length > 0) rules.note = unique(quotes).join(" / ");
  return rules;
}

/* ────────────────────────────────────────────── 플래그 */

function makeFlagBag() {
  const flags: ReviewFlag[] = [];
  return {
    flags,
    add(field: string, message: string, severity: ReviewFlag["severity"] = "warn") {
      flags.push({
        id: `jd-flag-${flags.length + 1}`,
        field,
        message,
        severity,
        resolved: false,
      });
    },
  };
}

/* ────────────────────────────────────────────── 본체 */

function emptyIdealCandidate(): IdealCandidate {
  return {
    oneLine: "",
    coreTasks: [],
    responsibilityLevel: "participate",
    responsibilityNote: "공고 본문을 읽지 못해 책임 범위를 판단하지 않았습니다.",
    rationale: [],
  };
}

/**
 * 채용공고 원문 → JobPosting.
 * 실패하지 않는다. 읽지 못하면 빈 골격과 안내 플래그를 돌려주고 사용자가 직접 채우게 한다.
 */
export function analyzeJobPosting(input: AnalyzeJobPostingInput | string): JobPosting {
  // 호출부 편의를 위해 원문 문자열만 넘기는 것도 허용한다(붙여넣기로 간주).
  const options: AnalyzeJobPostingInput =
    typeof input === "string" ? { rawText: input, sourceType: "paste" } : input;
  const rawText = typeof options.rawText === "string" ? options.rawText : "";
  const cleaned = cleanBody(rawText);
  const id = `jd-${shortHash(cleaned || rawText || "empty")}`;
  const bag = makeFlagBag();

  if (!isReadable(cleaned)) {
    bag.add(
      "body",
      "공고 본문을 읽지 못했습니다. 공고 전문을 붙여넣거나 파일로 올려 주세요. (본문이 너무 짧습니다)",
      "warn",
    );
    return {
      id,
      sourceType: options.sourceType,
      sourceUrl: options.sourceUrl,
      body: cleaned,
      company: "",
      roleTitle: "",
      responsibilities: [],
      requirements: [],
      idealCandidate: emptyIdealCandidate(),
      reviewFlags: bag.flags,
      confirmedByUser: false,
    };
  }

  // 한 페이지에 여러 공고가 있으면 첫 공고를 분석하고, 선택하라고 안내한다.
  const candidates = splitPostings(cleaned);
  const body = candidates.length > 0 ? candidates[0].body : cleaned;
  if (candidates.length > 1) {
    bag.add(
      "body",
      `이 페이지에서 공고 ${candidates.length}개를 찾았습니다. 첫 번째 공고로 분석했습니다. 지원할 공고를 직접 골라 주세요.`,
      "warn",
    );
  }

  const { sections, preamble } = detectSections(body);

  const company = extractCompany(body, preamble);
  const roleTitle = extractRoleTitle(body, preamble);
  const team = extractTeam(body, preamble);

  let responsibilityItems = itemsOf(sections, "responsibilities");
  if (responsibilityItems.length === 0) {
    // 업무 섹션이 없으면 제목 앞 불릿이라도 업무 후보로 본다 — 다만 확인 필요로 남긴다.
    const preambleBullets = splitBulletItems(preamble.join("\n")).filter((i) => i.marker !== null);
    if (preambleBullets.length > 0) {
      responsibilityItems = preambleBullets;
      bag.add(
        "responsibilities",
        "주요 업무 항목을 찾지 못해 본문 앞부분의 목록을 업무로 보았습니다. 맞는지 확인해 주세요.",
        "warn",
      );
    }
  }

  const mustItems = itemsOf(sections, "must");
  const preferredItems = itemsOf(sections, "preferred");
  const statedRequirements: Requirement[] = [
    ...mustItems.map((item, i) => buildRequirement(item, "must", i)),
    ...preferredItems.map((item, i) => buildRequirement(item, "preferred", i)),
  ];
  /*
   * 명시 조건만 뽑고 끝내면 "Unity, C#, 5년" 같은 키워드 목록이 된다.
   * 이 팀이 맡기려는 일까지 읽어야 인재상이 사람의 모습으로 보인다.
   * 다만 해석은 해석으로 표시한다.
   */
  const requirements: Requirement[] = [
    ...statedRequirements,
    ...inferRequirementsFromDuties(responsibilityItems, statedRequirements),
  ];

  const idealCandidate = buildIdealCandidate({
    postingId: id,
    body,
    roleTitle,
    responsibilityQuotes: responsibilityItems,
    mustRequirements: requirements.filter((r) => r.kind === "must"),
  });

  if (!company) bag.add("company", "회사명을 찾지 못했습니다. 직접 입력해 주세요.", "warn");
  if (!roleTitle) bag.add("roleTitle", "직무명을 찾지 못했습니다. 직접 입력해 주세요.", "warn");
  if (responsibilityItems.length === 0)
    bag.add("responsibilities", "주요 업무를 찾지 못했습니다. 공고의 업무 항목을 추가해 주세요.", "warn");
  if (mustItems.length === 0)
    bag.add("requirements", "필수 자격요건을 찾지 못했습니다. 공고의 자격요건을 추가해 주세요.", "warn");
  if (preferredItems.length === 0)
    bag.add("requirements", "우대사항을 찾지 못했습니다. 없는 공고일 수도 있습니다.", "info");
  if (idealCandidate.coreTasks.length < 3)
    bag.add(
      "idealCandidate",
      "핵심 업무를 3개까지 찾지 못했습니다. 팀이 맡기려는 일을 직접 보태 주세요.",
      "info",
    );

  const unknownMust = requirements.filter((r) => r.kind === "must" && r.equivalence === "unknown");
  if (unknownMust.length > 0) {
    bag.add(
      "requirements",
      `필수 조건 ${unknownMust.length}개는 동등 경험 인정 여부가 공고에 없습니다. 채용 담당자에게 확인이 필요합니다. (${unknownMust
        .slice(0, 3)
        .map((r) => r.label)
        .join(", ")})`,
      "info",
    );
  }

  return {
    id,
    sourceType: options.sourceType,
    sourceUrl: options.sourceUrl,
    body,
    company,
    team,
    roleTitle,
    location: extractLocation(body),
    employmentType: extractEmploymentType(body),
    responsibilities: responsibilityItems.map((item) => item.text),
    requirements,
    idealCandidate,
    documentRules: extractDocumentRules(body),
    reviewFlags: bag.flags,
    confirmedByUser: false,
  };
}
