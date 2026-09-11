/**
 * text-utils.ts — 입력 분석 엔진(JD 분석 · 이력 분석)이 공유하는 텍스트 처리.
 *
 * 왜 따로 두는가
 *  - 채용공고와 이력서는 같은 문제를 공유한다: 붙여넣기 과정에서 깨진 불릿·공백,
 *    전각 문자, 제각각인 기간 표기("2023.09~2025.08" / "2023년 9월 ~ 현재" / "Sep 2023 - Aug 2025").
 *  - 앱은 LLM 없이도(오프라인) 1차 추출이 되어야 하므로, 규칙을 한곳에 모아 두고
 *    테스트로 고정해 두는 편이 안전하다.
 *  - 기획 원칙상 "자료에 없는 것은 만들지 않는다". 그래서 여기 함수들은 애매하면
 *    추측값을 만들지 않고 null 을 돌려준다. 판단은 호출한 쪽에서 '확인 필요'로 남긴다.
 */

/* ──────────────────────────────────────────────────────── 정규화 */

/** 폭이 0 인 문자들 — 웹에서 복사하면 자주 섞여 들어와 정규식을 깨뜨린다. */
const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF]/g;

/** 원문자 불릿(①②③…)은 NFKC 로 넘기면 그냥 "1" 이 되어 숫자와 구분되지 않는다. 먼저 "1." 로 바꾼다. */
const CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";

/**
 * 붙여넣은 원문을 다루기 쉬운 형태로 정리한다.
 * 내용을 바꾸지 않고 표기만 통일한다(원문 인용에 그대로 쓸 수 있어야 하므로).
 */
export function normalize(input: string): string {
  if (!input) return "";
  return input
    .replace(/[①-⑮]/g, (m) => `${CIRCLED_DIGITS.indexOf(m) + 1}.`)
    .normalize("NFKC") // 전각 영숫자·괄호·물결표(～)를 반각으로
    .replace(/\r\n?/g, "\n")
    .replace(ZERO_WIDTH_RE, "")
    .replace(/\u00A0/g, " ") // NBSP
    .replace(/\t/g, "  ")
    .split("\n")
    .map((line) => line.replace(/ {3,}/g, "  ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 비어 있지 않은 줄만 돌려준다. */
export function splitLines(text: string): string[] {
  return normalize(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/* ──────────────────────────────────────────────────────── 불릿 */

/** 기호 불릿. "-" 는 "-3초" 같은 음수·범위와 헷갈리므로 따로 처리한다. */
const SYMBOL_BULLET_RE = /^([•·▪▫◦‣※◆■□▶✓✔*])\s*(?=\S)/;
const DASH_BULLET_RE = /^([-–—])\s+(?=\S)/;
/** 번호 불릿. normalize 를 거치면 "①" 도 "1." 로 들어온다. */
const ORDERED_BULLET_RE = /^(\(\d{1,2}\)|\d{1,2}[.)]|[가-힣][.)]|[A-Za-z][.)])\s+(?=\S)/;

/** 이 줄이 불릿이면 마커 문자열을, 아니면 null 을 돌려준다. */
export function bulletMarker(line: string): string | null {
  const trimmed = line.trim();
  const match =
    SYMBOL_BULLET_RE.exec(trimmed) ?? DASH_BULLET_RE.exec(trimmed) ?? ORDERED_BULLET_RE.exec(trimmed);
  return match ? match[1] : null;
}

export interface BulletItem {
  /** 원문 줄 그대로 — Requirement.sourceQuote 처럼 "원문 인용"이 필요한 곳에 쓴다. */
  raw: string;
  /** 마커를 떼어낸 내용 */
  text: string;
  marker: string | null;
}

/**
 * 블록을 항목 배열로 나눈다.
 *
 * 규칙(설명 가능해야 하므로 단순하게 유지한다):
 *  - 마커로 시작하는 줄은 새 항목이다.
 *  - 블록에 마커가 한 번이라도 나왔다면, 마커 없는 줄은 바로 앞 항목의 이어지는 줄로 본다.
 *    (공고는 한 항목이 두 줄로 접혀 오는 경우가 흔하다)
 *  - 빈 줄은 항목 경계다 — 빈 줄 다음의 마커 없는 줄은 새 항목으로 센다.
 *  - 마커가 하나도 없으면 각 줄이 곧 항목이다.
 */
export function splitBulletItems(block: string): BulletItem[] {
  const items: BulletItem[] = [];
  let sawMarker = false;
  let continuable = false;

  for (const rawLine of normalize(block).split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continuable = false;
      continue;
    }
    const marker = bulletMarker(line);
    if (marker) {
      sawMarker = true;
      continuable = true;
      items.push({ raw: line, marker, text: line.slice(marker.length).trim() });
      continue;
    }
    if (sawMarker && continuable && items.length > 0) {
      const last = items[items.length - 1];
      last.text = `${last.text} ${line}`.trim();
      last.raw = `${last.raw} ${line}`.trim();
      continue;
    }
    items.push({ raw: line, marker: null, text: line });
    continuable = true;
  }

  return items.filter((item) => item.text.length > 0);
}

/** 내용만 필요할 때. */
export function splitBullets(block: string): string[] {
  return splitBulletItems(block).map((item) => item.text);
}

/* ──────────────────────────────────────────────────────── 문장 */

/**
 * 한국어 문장 분리.
 * 국문 공고·이력은 마침표를 생략하는 경우가 많아, 종결어미(…니다/…었다/…한다)도 경계로 본다.
 * 과도한 분리를 막으려고 확실한 어미만 넣었다.
 */
const KO_SENTENCE_END_RE = /(?<=(?:니다|세요|어요|아요|았다|었다|한다|된다|있다|없다|같다|이다))\s+(?=\S)/;

export function splitSentences(text: string): string[] {
  return normalize(text)
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?…])\s+/))
    .flatMap((part) => part.split(KO_SENTENCE_END_RE))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/* ──────────────────────────────────────────────────────── 기간 */

export interface MonthRange {
  /** YYYY-MM */
  start: string;
  /** YYYY-MM (포함) */
  end: string;
}

export interface ParsedPeriod {
  /** YYYY-MM */
  start: string;
  /** YYYY-MM. 진행 중이면 null — 기획상 "재직 중"은 끝난 기간으로 바꾸지 않는다. */
  end: string | null;
  ongoing: boolean;
  /** 월까지 적혀 있었는지, 연도만 있었는지. 연도만이면 매칭 판단에서 조심해야 한다. */
  precision: "month" | "year";
  /** 원문에서 기간으로 인식한 부분 */
  raw: string;
  /** raw 가 시작하는 위치 — 나머지 글자에서 회사·직함을 뽑을 때 쓴다. */
  index: number;
}

const EN_MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** 연·월 토큰. 앞쪽 대안이 우선하므로 "2023.09" 는 연도만 보는 대안으로 떨어지지 않는다. */
const DATE_TOKEN_RE = new RegExp(
  [
    String.raw`(?<y1>\d{4})\s*[.\-/년]\s*(?<m1>\d{1,2})(?!\d)\s*월?`,
    String.raw`(?<mn>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(?<y2>\d{4})`,
    String.raw`(?<y3>\d{4})\s*년?`,
  ].join("|"),
  "gi",
);

/** 진행 중을 뜻하는 표현. */
const ONGOING_RE = /(현재|지금|재직\s*중|근무\s*중|진행\s*중|present|current|ongoing|now)/i;

/** 기간 구분자만으로 이루어진 사이 글자인가 (예: "~", " - ", "부터", "to"). */
const RANGE_GAP_RE = /^(?:[\s~\-–—―,]|부터|까지|to|until|through)*$/i;

interface DateToken {
  year: number;
  month: number | null;
  start: number;
  end: number;
}

function scanDateTokens(text: string): DateToken[] {
  const tokens: DateToken[] = [];
  DATE_TOKEN_RE.lastIndex = 0;
  for (const m of text.matchAll(DATE_TOKEN_RE)) {
    const g = m.groups ?? {};
    let year: number;
    let month: number | null = null;
    if (g.y1) {
      year = Number(g.y1);
      month = Number(g.m1);
    } else if (g.y2) {
      year = Number(g.y2);
      month = EN_MONTHS.indexOf(g.mn.toLowerCase().slice(0, 3)) + 1;
    } else if (g.y3) {
      year = Number(g.y3);
    } else {
      continue;
    }
    // 1900~2100 밖의 네 자리 숫자는 연도가 아니라 금액·수량일 가능성이 높다.
    if (year < 1900 || year > 2100) continue;
    if (month !== null && (month < 1 || month > 12)) continue;
    tokens.push({ year, month, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return tokens;
}

function toKey(year: number, month: number | null, fallback: number): string {
  return `${String(year).padStart(4, "0")}-${String(month ?? fallback).padStart(2, "0")}`;
}

/**
 * 한 줄에서 기간을 읽는다. 읽지 못하면 null — 여기서 오늘 날짜로 추측해 채우지 않는다.
 *
 * 지원하는 표기
 *   2023.09 ~ 2025.08 / 2023-09–2025-08 / 2023/09 ~ 현재
 *   2023년 9월 ~ 2025년 8월 / 2023년 9월부터 현재까지
 *   Sep 2023 - Aug 2025 / September 2023 – Present
 *   2024.06 (한 달짜리) / 2021 ~ 2023 (연도만)
 */
export function parsePeriod(input: string): ParsedPeriod | null {
  const text = normalize(input);
  const tokens = scanDateTokens(text);
  if (tokens.length === 0) return null;

  // "글로벌 게임잼 2024 · 팀 프로젝트 | 2024.06" 처럼 이름 안에 연도가 섞이는 일이 잦다.
  // 월까지 적힌 토큰이 하나라도 있으면 거기서부터 읽어야 실제 기간에 가깝다.
  const base = Math.max(
    0,
    tokens.findIndex((t) => t.month !== null),
  );
  const first = tokens[base];
  const second = tokens[base + 1];
  const ongoingMatch = ONGOING_RE.exec(text.slice(first.end));

  // 두 토큰 사이가 기간 구분자뿐이면 범위로 읽는다.
  if (second) {
    const gap = text.slice(first.end, second.start);
    if (gap.length <= 10 && RANGE_GAP_RE.test(gap)) {
      const precision: ParsedPeriod["precision"] =
        first.month !== null && second.month !== null ? "month" : "year";
      return {
        start: toKey(first.year, first.month, 1),
        end: toKey(second.year, second.month, 12),
        ongoing: false,
        precision,
        raw: text.slice(first.start, second.end),
        index: first.start,
      };
    }
  }

  // "2023.09 ~ 현재"
  if (ongoingMatch) {
    const gap = text.slice(first.end, first.end + (ongoingMatch.index ?? 0));
    if (gap.length <= 10 && RANGE_GAP_RE.test(gap)) {
      return {
        start: toKey(first.year, first.month, 1),
        end: null,
        ongoing: true,
        precision: first.month !== null ? "month" : "year",
        raw: text.slice(first.start, first.end + (ongoingMatch.index ?? 0) + ongoingMatch[0].length),
        index: first.start,
      };
    }
  }

  // 한 시점만 적힌 경우 — 게임잼·자격 취득처럼 하루/한 달짜리 이력이 여기 해당한다.
  return {
    start: toKey(first.year, first.month, 1),
    end: toKey(first.year, first.month, 12),
    ongoing: false,
    precision: first.month !== null ? "month" : "year",
    raw: text.slice(first.start, first.end),
    index: first.start,
  };
}

const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;

/** YYYY-MM 을 통산 월 번호로. 내부 계산용. */
function monthIndex(key: string): number | null {
  const m = MONTH_KEY_RE.exec(key.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return Number(m[1]) * 12 + (month - 1);
}

function fromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** 오늘이 속한 달. 진행 중인 경력의 끝으로 쓴다. */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * 두 달 사이의 개월 수(양끝 포함).
 * 2023-09 ~ 2025-08 = 24개월. end 가 null 이면 진행 중으로 보고 이번 달까지 센다.
 */
export function monthsBetween(start: string, end: string | null, now: Date = new Date()): number {
  const a = monthIndex(start);
  const b = monthIndex(end ?? currentMonthKey(now));
  if (a === null || b === null) return 0;
  if (b < a) return 0;
  return b - a + 1;
}

/**
 * 겹치는 기간을 하나로 합친다.
 * 경력연수를 셀 때 같은 달을 두 번 세지 않기 위한 것 — 병행 근무·프로젝트 중복이 흔하다.
 * 맞닿은 구간(…-06, 07-…)도 하나로 합친다(개월 수 합계는 같다).
 */
export function mergeMonthRanges(ranges: MonthRange[]): MonthRange[] {
  const sorted = ranges
    .map((r) => ({ a: monthIndex(r.start), b: monthIndex(r.end) }))
    .filter((r): r is { a: number; b: number } => r.a !== null && r.b !== null && r.b >= r.a)
    .sort((x, y) => x.a - y.a);

  const merged: { a: number; b: number }[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.a <= last.b + 1) {
      last.b = Math.max(last.b, range.b);
    } else {
      merged.push({ ...range });
    }
  }
  return merged.map((r) => ({ start: fromIndex(r.a), end: fromIndex(r.b) }));
}

/** 화면 표기용 기간 문자열. 진행 중은 "현재"로 남긴다. */
export function formatPeriod(period: { start: string; end: string | null }): string {
  const start = period.start ? period.start.replace("-", ".") : "";
  if (!start) return period.end ? `~ ${period.end.replace("-", ".")}` : "기간 미상";
  if (period.end === null) return `${start} ~ 현재`;
  const end = period.end.replace("-", ".");
  return start === end ? start : `${start} ~ ${end}`;
}

/* ──────────────────────────────────────────────────────── 추출 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function extractEmails(text: string): string[] {
  return unique(normalize(text).match(EMAIL_RE) ?? []);
}

const URL_RE =
  /\b(?:https?:\/\/|www\.)[^\s<>()[\]{}"']+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.(?:com|net|org|io|dev|me|so|ai|co|kr|app|xyz|page|blog|site)\/[^\s<>()[\]{}"']*/gi;

export function extractUrls(text: string): string[] {
  const found = normalize(text).match(URL_RE) ?? [];
  // 문장 끝 문장부호가 URL 에 붙어 오는 일이 잦다.
  return unique(found.map((u) => u.replace(/[.,;:)\]}>]+$/, "")));
}

/**
 * 토큰 분리. 기술 이름을 살려야 하므로 "C#", "C++", "Next.js", "CI/CD" 의 구성 요소가 깨지지 않게 한다.
 */
export function tokenize(text: string): string[] {
  const matched = normalize(text).match(/[A-Za-z][A-Za-z0-9+#._-]*|[가-힣]+|\d+(?:\.\d+)?%?/g) ?? [];
  return matched.map((t) => t.replace(/[._-]+$/, "")).filter((t) => t.length > 0);
}

/** needles 중 하나라도 들어 있으면 true (대소문자 무시). */
export function containsAny(text: string, needles: readonly string[]): boolean {
  return findFirst(text, needles) !== null;
}

/** 어떤 신호에 걸렸는지 근거로 보여줘야 하므로, 걸린 문자열을 돌려주는 형태도 둔다. */
export function findFirst(text: string, needles: readonly string[]): string | null {
  const haystack = normalize(text).toLowerCase();
  for (const needle of needles) {
    if (needle && haystack.includes(needle.toLowerCase())) return needle;
  }
  return null;
}

/** 그 신호가 들어 있는 줄을 찾는다 — rationale 의 원문 인용에 쓴다. */
export function lineContaining(text: string, needle: string): string | null {
  const target = needle.toLowerCase();
  for (const line of splitLines(text)) {
    if (line.toLowerCase().includes(target)) return line;
  }
  return null;
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/** 너무 긴 문장을 화면용 짧은 이름으로 자른다. 자를 때는 잘렸음을 표시한다. */
export function shorten(text: string, max = 28): string {
  const value = text.trim().replace(/\s+/g, " ");
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}…`;
}

/**
 * 목적격 조사. 자동 생성 문장이 "기능을/를" 처럼 어색해지지 않게 한다.
 * 한글이 아니면 판단하지 않고 "을(를)"로 남긴다 — 추측해서 틀리게 쓰지 않는다.
 */
export function objectParticle(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return "을(를)";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

/** 입력이 같으면 항상 같은 id 를 만든다. 테스트와 비교가 가능해야 하므로 난수를 쓰지 않는다. */
export function shortHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}
