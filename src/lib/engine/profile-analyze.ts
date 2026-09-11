/**
 * profile-analyze.ts — 붙여넣은 이력 원문에서 ApplicantProfile 을 규칙으로 뽑아낸다.
 *
 * 설계 전제
 *  - 재직 경력에만 한정하지 않는다. 학위·수업·논문·인턴·대회·개인 프로젝트·자격·교육·
 *    오픈소스·봉사까지 같은 구조로 받는다. (기획서 02)
 *  - 학력·수료를 실무 연수로 바꾸지 않는다. 그래서 ExperienceKind 를 나누고,
 *    경력연수 판정(professionalMonths)은 job/internship/freelance 만 센다. (기획서 05)
 *  - 논문 상태(게재/게재 확정/심사 중/프리프린트)를 섞지 않는다. 신호가 없으면 비워 두고
 *    확인 필요로 남긴다. (기획서 12 샘플 E)
 *  - 없는 사실을 만들지 않는다. 기간·역할이 불명확하면 confidence 를 'needs-confirmation' 으로
 *    두고 reviewFlags 로 물어본다. (기획서 14)
 *  - 절대 throw 하지 않는다.
 */

import type {
  ApplicantProfile,
  ExperienceItem,
  ExperienceKind,
  ProfileLink,
  PublicationStatus,
  ResponsibilityLevel,
  ReviewFlag,
} from "../types";
import { PROFESSIONAL_KINDS } from "../types";
import {
  type BulletItem,
  type ParsedPeriod,
  bulletMarker,
  currentMonthKey,
  extractEmails,
  extractUrls,
  mergeMonthRanges,
  monthsBetween,
  normalize,
  parsePeriod,
  shortHash,
  shorten,
  splitBulletItems,
  tokenize,
  unique,
} from "./text-utils";

export interface AnalyzeProfileInput {
  rawText: string;
  name?: string;
  links?: { label: string; url: string }[];
}

/* ────────────────────────────────────────────── 섹션 */

type SectionRole = "experience" | "skills" | "links" | "summary";

interface SectionRule {
  role: SectionRole;
  /** 이 섹션 아래 항목의 기본 종류 — 항목 자체에 단서가 없을 때만 쓴다. */
  kind: ExperienceKind | null;
  re: RegExp;
}

const SECTION_RULES: SectionRule[] = [
  { role: "skills", kind: null, re: /^(기술|보유\s*기술|스킬|기술\s*스택|사용\s*기술|skills?|tech\s*stack)/i },
  { role: "links", kind: null, re: /^(링크|포트폴리오|관련\s*링크|links?|portfolio)/i },
  { role: "summary", kind: null, re: /^(요약|소개|한\s*줄\s*소개|프로필|summary|about|profile)/i },
  { role: "experience", kind: "job", re: /^(경력|재직|경력\s*사항|업무\s*경력|work\s*experience|experience|employment)/i },
  { role: "experience", kind: "internship", re: /^(인턴|인턴십|internships?)/i },
  { role: "experience", kind: "degree", re: /^(학력|학위|education)/i },
  { role: "experience", kind: "publication", re: /^(논문|저작|출판|publications?|papers?)/i },
  { role: "experience", kind: "research", re: /^(연구|연구\s*경력|research)/i },
  { role: "experience", kind: "project", re: /^(프로젝트|개인\s*프로젝트|팀\s*프로젝트|projects?|side\s*projects?)/i },
  { role: "experience", kind: "competition", re: /^(대회|수상|공모전|해커톤|competitions?|awards?|hackathons?)/i },
  { role: "experience", kind: "certification", re: /^(자격|자격증|certifications?|licenses?)/i },
  { role: "experience", kind: "training", re: /^(교육|연수|부트캠프|training|bootcamps?)/i },
  { role: "experience", kind: "course", re: /^(수업|수강|이수\s*과목|coursework|courses?)/i },
  { role: "experience", kind: "opensource", re: /^(오픈소스|open\s*source|기여\s*활동|contributions?)/i },
  { role: "experience", kind: "volunteer", re: /^(봉사|봉사\s*활동|volunteer(ing)?)/i },
];

function sectionOf(line: string): SectionRule | null {
  const bare = line
    .replace(/^[#\-–—*•·▪◆■□▶【[(<]+/, "")
    .replace(/[】\])>]+/g, " ")
    .replace(/[:：]\s*$/, "")
    .trim();
  if (!bare || bare.length > 24) return null;
  for (const rule of SECTION_RULES) {
    const m = rule.re.exec(bare);
    if (m && bare.length - m[0].length <= 6) return rule;
  }
  return null;
}

/* ────────────────────────────────────────────── 종류 분류 */

/**
 * 항목 종류. 위에서부터 먼저 맞는 것을 쓴다.
 * 논문을 먼저 보는 이유: "박사 과정 중 발표한 논문"이 학위로 분류되면 안 된다.
 */
const KIND_RULES: Array<{ kind: ExperienceKind; re: RegExp }> = [
  {
    kind: "publication",
    re: /(논문|저널|학술지|학회|게재|proceedings?|journal|conference|arxiv|preprint|프리프린트)/i,
  },
  {
    kind: "degree",
    re: /(학사|석사|박사|학위|전공|졸업|b\.?\s?s\.?|m\.?\s?s\.?|ph\.?\s?d|bachelor|master|doctoral)/i,
  },
  { kind: "internship", re: /(인턴|intern)/i },
  {
    kind: "competition",
    re: /(대회|해커톤|게임잼|공모전|경진|수상|hackathon|game\s*jam|competition|contest)/i,
  },
  {
    kind: "certification",
    re: /(자격증|자격\s*취득|기사\s*자격|certification|certified|license)/i,
  },
  {
    kind: "opensource",
    re: /(오픈소스|open\s*source|contributor|컨트리뷰|pull\s*request|maintainer|메인테이너)/i,
  },
  { kind: "volunteer", re: /(봉사|volunteer|재능\s*기부)/i },
  { kind: "freelance", re: /(프리랜스|프리랜서|freelance|외주)/i },
  { kind: "research", re: /(연구실|연구원|연구\s*과제|조교|research|lab\b)/i },
  { kind: "training", re: /(부트캠프|교육\s*과정|연수|수료|training|bootcamp)/i },
  { kind: "course", re: /(수업|수강|교과목|coursework)/i },
];

const COMPANY_SUFFIX_RE =
  /(주식회사|㈜|\(주\)|스튜디오|랩스|테크|소프트|시스템즈|컴퍼니|그룹|코리아|파트너스|Inc\.?|Corp\.?|Ltd\.?|Labs?|Studios?)/i;

const ROLE_WORD_RE =
  /(개발자|엔지니어|매니저|디자이너|기획자|연구원|분석가|컨설턴트|마케터|대표|팀장|인턴|조교|PM|PO|Engineer|Developer|Manager|Designer|Analyst|Scientist|Researcher|Lead|Intern)/i;

function classifyKind(headerText: string, sectionKind: ExperienceKind | null, organization: string, title: string): ExperienceKind {
  for (const { kind, re } of KIND_RULES) {
    if (re.test(headerText)) return kind;
  }
  if (sectionKind) return sectionKind;
  // 회사처럼 보이는 이름 + 직함이 있으면 재직 경력으로 본다.
  if (title && (COMPANY_SUFFIX_RE.test(organization) || ROLE_WORD_RE.test(title))) return "job";
  return "project";
}

/* ────────────────────────────────────────────── 논문 상태 */

/**
 * 논문 상태를 섞지 않는다.
 * "게재 확정"이 "게재"보다 먼저 검사되어야 한다(문자열이 겹친다).
 * 신호가 없으면 undefined — 심사 중인 논문을 게재로 올리지 않기 위해서다.
 */
export function detectPublicationStatus(text: string): PublicationStatus | undefined {
  if (/(게재\s*확정|출판\s*예정|accepted|in\s*press|채택)/i.test(text)) return "accepted";
  if (/(심사\s*중|투고|리뷰\s*중|under\s*review|submitted)/i.test(text)) return "under-review";
  if (/(프리프린트|preprint|arxiv)/i.test(text)) return "preprint";
  if (/(게재|출판|발표|published)/i.test(text)) return "published";
  return undefined;
}

/* ────────────────────────────────────────────── 책임 수준 */

const RESPONSIBILITY_SIGNALS: Array<{ level: ResponsibilityLevel; re: RegExp }> = [
  {
    level: "own-org",
    re: /조직\s*(?:책임|운영)[가-힣]*|손익[가-힣]*|P&L|부문장|본부장|\bhead of\b/i,
  },
  {
    level: "lead",
    re: /(?:리드|리딩|총괄|팀장|책임자|매니징|멘토링)[가-힣]*|책임(?:지|집|질|져)[가-힣]*|이끌[가-힣]*|후배\s*지도[가-힣]*/i,
  },
  {
    level: "independent",
    re: /(?:단독|독립|주도|전담|오너십|혼자)[가-힣]*|직접\s*(?:수행|구현|설계|개선)[가-힣]*|설계(?:했|하고|하여)[가-힣]*/i,
  },
  {
    level: "participate",
    re: /(?:참여|보조|협업|어시스트)[가-힣]*|지원(?:했|하여|해)[가-힣]*/i,
  },
];

function detectResponsibilityLevel(text: string): { level: ResponsibilityLevel; signal: string | null } {
  for (const { level, re } of RESPONSIBILITY_SIGNALS) {
    const m = re.exec(text);
    if (m) return { level, signal: m[0] };
  }
  return { level: "participate", signal: null };
}

/* ────────────────────────────────────────────── 과업·성과 */

/**
 * 성과로 볼 신호.
 * 숫자+단위, 또는 개선·달성 류 동사. "수치가 있으면 성과"는 기획서 08 의 표현 기준과 같다.
 */
const OUTCOME_RE =
  /(\d+(?:\.\d+)?\s*(?:%|퍼센트|초|분|시간|배|건|개|명|원|억|만원|ms|회|위|등|점|배속))|(개선|향상|단축|절감|증가|감소|달성|확보|수상|채택|게재|돌파|성장|출시했|해결했)/i;

function isOutcome(text: string): boolean {
  return OUTCOME_RE.test(text);
}

/* ────────────────────────────────────────────── 기술 사전 */

/** 사전에 있는 표기는 정규 표기로 통일한다(같은 기술이 여러 이름으로 세어지지 않게). */
const SKILL_DICTIONARY: Record<string, string> = {};
function registerSkill(canonical: string, aliases: string[] = []) {
  SKILL_DICTIONARY[canonical.toLowerCase()] = canonical;
  for (const alias of aliases) SKILL_DICTIONARY[alias.toLowerCase()] = canonical;
}
[
  ["Unity", ["유니티"]],
  ["Unreal", ["언리얼", "unrealengine"]],
  ["C#", ["csharp"]],
  ["C++", ["cpp"]],
  ["C", []],
  ["Python", ["파이썬"]],
  ["Java", ["자바"]],
  ["Kotlin", []],
  ["Swift", []],
  ["Go", ["golang"]],
  ["Rust", []],
  ["TypeScript", ["ts", "타입스크립트"]],
  ["JavaScript", ["js", "자바스크립트"]],
  ["React", ["리액트"]],
  ["Next.js", ["nextjs"]],
  ["Node.js", ["nodejs", "node"]],
  ["SQL", []],
  ["PostgreSQL", ["postgres"]],
  ["MySQL", []],
  ["MongoDB", []],
  ["Redis", []],
  ["GraphQL", []],
  ["REST", ["restful"]],
  ["Docker", []],
  ["Kubernetes", ["k8s"]],
  ["AWS", []],
  ["GCP", []],
  ["Azure", []],
  ["Git", ["깃"]],
  ["GitHub Actions", []],
  ["Jenkins", []],
  ["Linux", []],
  ["Figma", ["피그마"]],
  ["Jira", ["지라"]],
  ["Notion", ["노션"]],
  ["Confluence", []],
  ["PyTorch", []],
  ["TensorFlow", []],
  ["scikit-learn", ["sklearn"]],
  ["Pandas", []],
  ["NumPy", []],
  ["Tableau", []],
  ["Power BI", []],
  ["Excel", ["엑셀"]],
  ["R", []],
  ["MATLAB", []],
  ["Spark", []],
  ["Airflow", []],
  ["Kafka", []],
  ["Shader", ["셰이더", "hlsl"]],
  ["Profiler", ["프로파일러"]],
  ["Blender", []],
  ["Photoshop", []],
  ["LLM", []],
  ["RAG", []],
  ["LangChain", []],
].forEach(([canonical, aliases]) => registerSkill(canonical as string, aliases as string[]));

/** 여러 단어로 된 기술은 토큰으로 나누면 사라지므로 문자열 포함으로 찾는다. */
const MULTIWORD_SKILLS = ["CI/CD", "GitHub Actions", "Power BI", "A/B 테스트", "머신러닝", "딥러닝", "데이터 분석", "성능 최적화", "코드 리뷰"];

function extractSkills(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const skill of MULTIWORD_SKILLS) {
    if (lower.includes(skill.toLowerCase())) found.push(skill);
  }
  for (const token of tokenize(text)) {
    const canonical = SKILL_DICTIONARY[token.toLowerCase()];
    if (canonical) {
      found.push(canonical);
      continue;
    }
    // 사전에 없어도 대문자 약어(SQL)나 버전 표기(ES6, Node.js)는 기술 후보로 본다.
    // 일반 영단어가 섞이지 않도록 조건을 좁게 둔다.
    const isAcronym = /^[A-Z]{2,6}$/.test(token);
    const isVersioned = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+|[#+]{1,2}|\d)$/.test(token) && /[\d#+.]/.test(token);
    if ((isAcronym || isVersioned) && token.length >= 2) found.push(token);
  }
  return unique(found);
}

/* ────────────────────────────────────────────── 블록 나누기 */

interface RawBlock {
  header: string;
  period: ParsedPeriod | null;
  bullets: BulletItem[];
  sectionKind: ExperienceKind | null;
}

interface BlockScan {
  blocks: RawBlock[];
  /** 기술 섹션 원문 — 항목이 아니라 프로필 공통 정보다. */
  skillText: string;
  /** 링크 섹션 원문 */
  linkText: string;
  /** 요약 섹션 원문 */
  summaryText: string;
}

/** 헤더 줄에서 기간을 뺀 나머지. 기간을 감쌌던 빈 괄호도 정리한다. */
function headerRemainder(header: string, period: ParsedPeriod | null): string {
  if (!period) return header.trim();
  const rest = `${header.slice(0, period.index)} ${header.slice(period.index + period.raw.length)}`;
  return rest
    .replace(/[(（【[]\s*[)）】\]]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s*[|·•\-–—,:：]+/, "")
    .replace(/[|·•\-–—,:：]+\s*$/, "")
    .trim();
}

/** 헤더에서 소속과 직함을 나눈다. 확실한 구분자가 없으면 억지로 나누지 않는다. */
function splitOrgTitle(remainder: string): { organization: string; title: string; note?: string } {
  const separators = [" | ", "|", " — ", " – ", " - ", " · ", "·", " • ", "•", ", ", "@"];
  for (const sep of separators) {
    if (remainder.includes(sep)) {
      const parts = remainder
        .split(sep)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (parts.length >= 2) {
        return {
          organization: parts[0],
          title: parts[1],
          note: parts.length > 2 ? parts.slice(2).join(" · ") : undefined,
        };
      }
    }
  }
  // "한국대학교 컴퓨터공학 학사" 처럼 구분자가 없는 학력 표기
  const school = /^(.+?(?:대학교|대학원|대학|University|College|고등학교))\s+(.+)$/i.exec(remainder);
  if (school) return { organization: school[1].trim(), title: school[2].trim() };
  const company = /^(.+?(?:주식회사|스튜디오|랩스|테크|소프트|컴퍼니|그룹|코리아|Inc\.?|Corp\.?|Labs?|Studios?))\s+(.+)$/i.exec(
    remainder,
  );
  if (company) return { organization: company[1].trim(), title: company[2].trim() };
  return { organization: remainder, title: "" };
}

function scanBlocks(lines: string[]): BlockScan {
  const blocks: RawBlock[] = [];
  let current: RawBlock | null = null;
  let sectionKind: ExperienceKind | null = null;
  let sectionRole: SectionRole = "experience";
  /** 회사명만 따로 한 줄에 적힌 경우를 다음 블록에 넘겨 준다. */
  let pendingOrg: string | null = null;
  const skillLines: string[] = [];
  const linkLines: string[] = [];
  const summaryLines: string[] = [];

  const flush = () => {
    if (!current) return;
    // 기간도 불릿도 없는 짧은 한 줄은 항목이 아니라 다음 항목의 소속일 가능성이 높다.
    if (!current.period && current.bullets.length === 0 && current.header.length <= 40) {
      pendingOrg = current.header;
    } else {
      // 소속이 앞 줄에 따로 적혀 있던 경우 헤더 앞에 붙여 준다.
      if (pendingOrg) current.header = `${pendingOrg} · ${current.header}`;
      pendingOrg = null;
      blocks.push(current);
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const section = sectionOf(line);
    if (section) {
      flush();
      pendingOrg = null;
      sectionRole = section.role;
      sectionKind = section.kind;
      continue;
    }

    const marker = bulletMarker(line);
    if (sectionRole === "skills") {
      skillLines.push(line);
      continue;
    }
    if (sectionRole === "links") {
      linkLines.push(line);
      continue;
    }
    if (sectionRole === "summary") {
      summaryLines.push(line);
      continue;
    }

    if (marker) {
      if (current) current.bullets.push(splitBulletItems(line)[0]);
      continue;
    }

    flush();
    current = { header: line, period: parsePeriod(line), bullets: [], sectionKind };
  }
  flush();

  // 기술·링크·요약 섹션은 경험 항목이 아니라 프로필 공통 정보다. 따로 돌려준다.
  return {
    blocks,
    skillText: skillLines.join("\n"),
    linkText: linkLines.join("\n"),
    summaryText: summaryLines.join("\n"),
  };
}

/* ────────────────────────────────────────────── 플래그 */

function makeFlagBag() {
  const flags: ReviewFlag[] = [];
  return {
    flags,
    add(field: string, message: string, severity: ReviewFlag["severity"] = "warn") {
      flags.push({
        id: `profile-flag-${flags.length + 1}`,
        field,
        message,
        severity,
        resolved: false,
      });
    },
  };
}

/* ────────────────────────────────────────────── 본체 */

const PHONE_RE = /(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/;
const LOCATION_LABEL_RE = /^(?:거주지|위치|주소|지역|location)\s*[:：]\s*(.+)$/i;
const NAME_LABEL_RE = /^(?:이름|성명|name)\s*[:：]\s*(.+)$/i;
const HEADLINE_LABEL_RE = /^(?:한\s*줄\s*소개|소개|헤드라인|headline|title)\s*[:：]\s*(.+)$/i;

function linkLabel(url: string): string {
  const host = /^(?:https?:\/\/)?(?:www\.)?([^/]+)/i.exec(url)?.[1]?.toLowerCase() ?? "";
  if (host.includes("github")) return "GitHub";
  if (host.includes("linkedin")) return "LinkedIn";
  if (host.includes("notion")) return "Notion";
  if (host.includes("velog") || host.includes("tistory") || host.includes("medium")) return "블로그";
  if (host.includes("behance") || host.includes("dribbble")) return "포트폴리오";
  return host || "링크";
}

/**
 * 이력 원문 → ApplicantProfile.
 * 여기서 만든 값은 초안이며, 사용자가 화면에서 확인·수정하는 것을 전제로 한다.
 */
export function analyzeProfile(input: AnalyzeProfileInput | string): ApplicantProfile {
  // 호출부 편의를 위해 원문 문자열만 넘기는 것도 허용한다.
  const options: AnalyzeProfileInput = typeof input === "string" ? { rawText: input } : input;
  const rawText = typeof options.rawText === "string" ? options.rawText : "";
  const body = normalize(rawText);
  const bag = makeFlagBag();
  const id = `profile-${shortHash(body || "empty")}`;

  const allLines = body.split("\n");

  // 1) 머리말(이름·연락처) 영역과 본문을 나눈다.
  //    첫 섹션 제목이나 첫 기간 표기가 나오기 전까지를 머리말로 본다.
  let bodyStart = allLines.length;
  for (let i = 0; i < allLines.length; i += 1) {
    const line = allLines[i].trim();
    if (!line) continue;
    if (sectionOf(line) || (parsePeriod(line) && i > 0)) {
      bodyStart = i;
      break;
    }
  }
  const headLines = allLines.slice(0, bodyStart).map((l) => l.trim()).filter(Boolean);

  // 2) 이름 / 한 줄 소개
  let name = options.name?.trim() ?? "";
  let headline = "";
  for (const line of headLines) {
    const labeled = NAME_LABEL_RE.exec(line);
    if (!name && labeled) name = labeled[1].trim();
    const head = HEADLINE_LABEL_RE.exec(line);
    if (!headline && head) headline = head[1].trim();
  }
  if ((!name || !headline) && headLines.length > 0) {
    // "한서준 · Unity / C# 개발자" 형태
    const parts = headLines[0]
      .split(/\s*[|·•]\s*|\s+[-–—]\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 1) {
      const candidate = parts[0];
      const looksLikeName = /^[가-힣]{2,4}$/.test(candidate) || /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)+$/.test(candidate);
      if (!name && looksLikeName) name = candidate;
      if (!headline && parts.length >= 2 && (looksLikeName || !name)) headline = parts.slice(1).join(" · ");
    }
  }

  // 3) 연락처
  const emails = extractEmails(body);
  const phone = PHONE_RE.exec(body)?.[0];
  let location: string | undefined;
  for (const line of headLines) {
    const m = LOCATION_LABEL_RE.exec(line);
    if (m) {
      location = m[1].trim();
      break;
    }
  }

  // 4) 블록 → 경험 항목
  const {
    blocks,
    skillText: sectionSkillText,
    linkText: sectionLinkText,
    summaryText: sectionSummaryText,
  } = scanBlocks(allLines.slice(bodyStart));
  if (!headline && sectionSummaryText) headline = shorten(sectionSummaryText.split("\n")[0], 80);

  const experiences: ExperienceItem[] = [];
  let missingOwnRole = 0;

  blocks.forEach((block, index) => {
    const remainder = headerRemainder(block.header, block.period);
    const { organization, title, note } = splitOrgTitle(remainder);
    const bulletTexts = block.bullets.map((b) => b.text);
    const fullText = [remainder, ...bulletTexts].join("\n");
    const kind = classifyKind(remainder, block.sectionKind, organization, title);

    const tasks = bulletTexts.filter((t) => !isOutcome(t));
    const outcomes = bulletTexts.filter((t) => isOutcome(t));

    const roleLine =
      bulletTexts.find((t) => /^(?:본인\s*역할|역할|담당)\s*[:：]/.test(t)) ??
      bulletTexts.find((t) => /(본인|직접|단독|전담|담당했|맡아|기여)/.test(t));
    const ownRole = roleLine ? shorten(roleLine.replace(/^(?:본인\s*역할|역할|담당)\s*[:：]\s*/, ""), 120) : "";
    if (!ownRole) missingOwnRole += 1;

    const artifacts = unique([
      ...extractUrls(fullText),
      ...bulletTexts.filter((t) => /(데모|저장소|repo|demo|영상|배포|스토어|포트폴리오)/i.test(t)).map((t) => shorten(t, 80)),
    ]);

    const { level, signal } = detectResponsibilityLevel(fullText);
    const publicationStatus = kind === "publication" ? detectPublicationStatus(fullText) : undefined;

    const periodUnclear = block.period === null;
    const confidence =
      periodUnclear || !title ? ("needs-confirmation" as const) : ("confirmed" as const);

    const item: ExperienceItem = {
      id: `exp-${index + 1}`,
      kind,
      organization,
      title,
      start: block.period ? block.period.start : "",
      end: block.period ? block.period.end : null,
      summary: tasks[0] ?? outcomes[0] ?? [organization, title].filter(Boolean).join(" "),
      tasks,
      outcomes,
      ownRole,
      responsibilityLevel: level,
      artifacts,
      skills: extractSkills(fullText),
      confidence,
      publicationStatus,
      note:
        note ??
        (block.period?.precision === "year"
          ? "기간이 연도까지만 적혀 있습니다. 월까지 확인하면 경력 개월 수가 정확해집니다."
          : signal
            ? `책임 범위는 "${signal}" 표현을 근거로 보았습니다.`
            : undefined),
    };
    experiences.push(item);

    const itemName = shorten([organization, title].filter(Boolean).join(" ") || remainder, 24);
    if (periodUnclear) {
      bag.add("experiences", `"${itemName}" 항목의 기간을 읽지 못했습니다. 시작·종료 시점을 확인해 주세요.`, "warn");
    }
    if (!title) {
      bag.add("experiences", `"${itemName}" 항목의 직함·역할명이 적혀 있지 않습니다. 실제 직함을 확인해 주세요.`, "warn");
    }
    if (kind === "publication" && !publicationStatus) {
      bag.add(
        "experiences",
        `"${itemName}" 논문의 상태를 확인해 주세요. 게재 / 게재 확정 / 심사 중 / 프리프린트는 서로 다른 이력입니다.`,
        "warn",
      );
    }
  });

  if (missingOwnRole > 0) {
    bag.add(
      "experiences",
      `${missingOwnRole}개 항목에 본인 역할 범위가 적혀 있지 않습니다. 어디까지 직접 했는지 적으면 근거가 분명해집니다.`,
      "info",
    );
  }

  // 5) 링크 — 오프라인 분석에서는 내용을 가져오지 않으므로 모두 "링크만 저장됨". (기획서 02)
  const urlSet = unique([
    ...extractUrls(headLines.join("\n")),
    ...extractUrls(sectionLinkText),
    ...(options.links ?? []).map((l) => l.url),
  ]);
  const links: ProfileLink[] = urlSet.map((url, i) => ({
    id: `link-${i + 1}`,
    label: (options.links ?? []).find((l) => l.url === url)?.label ?? linkLabel(url),
    url,
    status: "link-only",
  }));

  // 6) 기술 — 기술 섹션 + 각 항목에서 모은 것
  const globalSkills = unique([
    ...extractSkills(sectionSkillText),
    ...experiences.flatMap((e) => e.skills),
  ]);
  if (!headline && experiences.length > 0) {
    const main = experiences.find((e) => e.kind === "job") ?? experiences[0];
    headline = [main.title, globalSkills.slice(0, 3).join(" · ")].filter(Boolean).join(" · ");
  }

  if (!name) bag.add("name", "이름을 찾지 못했습니다. 직접 입력해 주세요.", "warn");
  if (emails.length === 0) bag.add("contact", "이메일을 찾지 못했습니다. 제출 문서에 들어갈 연락처를 확인해 주세요.", "info");
  if (experiences.length === 0)
    bag.add(
      "experiences",
      "경력·학력·프로젝트 항목을 찾지 못했습니다. 기간과 함께 항목을 적어 주세요. (예: 회사명 · 직함 | 2023.09 ~ 2025.08)",
      "warn",
    );
  if (globalSkills.length === 0)
    bag.add("skills", "기술·도구를 찾지 못했습니다. 실제로 사용한 것만 적어 주세요.", "info");

  return {
    id,
    name,
    headline,
    contact: {
      email: emails[0],
      phone: phone ?? undefined,
      location,
    },
    links,
    experiences,
    reviewFlags: bag.flags,
    confirmedByUser: false,
  };
}

/* ────────────────────────────────────────────── 경력 개월 수 */

/**
 * 경험들의 총 개월 수. 겹치는 기간은 한 번만 센다.
 * 병행 근무·프로젝트 중복으로 실제보다 긴 경력이 되는 일을 막기 위한 것이다.
 * 기간을 읽지 못한 항목(start 가 비어 있음)은 세지 않는다 — 추측해서 채우지 않는다.
 */
export function totalMonths(
  experiences: ExperienceItem[],
  kinds?: ExperienceKind[],
  now: Date = new Date(),
): number {
  const ranges = experiences
    .filter((e) => !kinds || kinds.includes(e.kind))
    .filter((e) => /^\d{4}-\d{2}$/.test(e.start))
    .map((e) => ({
      start: e.start,
      end: e.end && /^\d{4}-\d{2}$/.test(e.end) ? e.end : currentMonthKey(now),
    }));
  return mergeMonthRanges(ranges).reduce((sum, r) => sum + monthsBetween(r.start, r.end, now), 0);
}

/**
 * 필수 경력연수 판정에 쓰는 개월 수.
 * 재직·인턴·프리랜스만 센다. 학위·수료·대회는 여기에 넣지 않는다. (기획서 05)
 */
export function professionalMonths(profile: ApplicantProfile, now: Date = new Date()): number {
  return totalMonths(profile.experiences, PROFESSIONAL_KINDS, now);
}
