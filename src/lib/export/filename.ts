/**
 * 내보내기 파일명.
 *
 * 사용자는 여러 회사에 지원하면서 같은 이름의 문서를 여러 벌 내려받는다.
 * 그래서 파일 이름만 보고 **어느 회사의 몇 번 판본인지** 구분할 수 있어야 한다.
 *
 *   RoleFit_이력서2_제출용_루멘플레이_한서준_2026-09.docx
 *   RoleFit_지원전략분석서_루멘플레이_한서준_2026-09.docx
 *
 * 판본 이름은 RESUME_VARIANT_META 에서 가져온다 — 화면에 보이는 이름과 파일명이 어긋나면
 * "이력서 2 를 받았는데 파일은 뭐지?" 가 된다.
 *
 * 시각은 호출부가 stamp("YYYY-MM")로 넘긴다. 이 모듈은 new Date() 를 부르지 않는다.
 * 같은 입력이면 언제 실행해도 같은 이름이 나와야, 다시 받았을 때 파일이 덮어써지고
 * 테스트도 시간에 흔들리지 않는다.
 */
import { RESUME_VARIANT_META, type Application, type ResumeVariant } from "@/lib/types";

/** 모든 내보내기 파일의 공통 앞머리. 다운로드 폴더에서 한 번에 모인다. */
export const FILE_PREFIX = "RoleFit";

/** 분석서의 파일명 라벨. 이력서와 한 글자도 겹치지 않게 둔다. */
export const REPORT_FILE_LABEL = "지원전략분석서";

/** 확장자를 포함한 전체 길이 상한. */
export const FILENAME_MAX = 120;

/** 파일명 부분을 잇는 구분자. */
const JOIN = "_";

/** 어느 운영체제에서도 파일명에 쓸 수 없는 문자. */
const FORBIDDEN = /[/\\:*?"<>|]/g;

/** 제어문자 — 붙어 들어오면 저장 자체가 실패한다. */
const CONTROL = /[\u0000-\u001f\u007f]/g;

/**
 * 가운뎃점·글머리표·긴 대시. 파일명에서는 구분자(_)로 바꾼다.
 * ASCII 하이픈(-)은 남긴다 — stamp 의 "2026-09" 가 하이픈을 쓰기 때문.
 */
const SEPARATOR_MARKS = /[·ㆍ・‧•∙―—–]/g;

/** "이력서 2" 는 눈으로 한 낱말로 읽힌다. 파일명에서는 붙여 쓴다. */
const HANGUL_BEFORE_DIGIT = /([가-힣])\s+(?=\d)/g;

/** 부분 이름의 최소 길이 — 이보다 짧게 자르면 회사를 알아볼 수 없다. */
const MIN_PART = 2;

/**
 * 파일명에 쓸 수 있게 한 조각을 다듬는다.
 * 한글을 로마자로 바꾸지 않는다 — 회사별 버전을 사용자가 눈으로 구분해야 하기 때문이다.
 */
export function sanitizeFileNamePart(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(CONTROL, "")
    .replace(FORBIDDEN, "")
    .replace(SEPARATOR_MARKS, " ")
    .replace(HANGUL_BEFORE_DIGIT, "$1")
    .trim()
    .replace(/\s+/g, JOIN)
    .replace(/_{2,}/g, JOIN)
    .replace(/^[_.]+|[_.]+$/g, "");
}

/** 확장자도 사용자가 넘기므로 같이 다듬는다. ".docx" 로 와도 점은 하나만 남긴다. */
function sanitizeExt(ext: string): string {
  return sanitizeFileNamePart(ext.replace(/^\.+/, "")).toLowerCase();
}

/** 코드 포인트 단위로 자른다 — 이모지가 섞여도 반 토막 난 글자를 남기지 않는다. */
function cut(value: string, max: number): string {
  const chars = Array.from(value);
  if (chars.length <= max) return value;
  return chars.slice(0, Math.max(0, max)).join("");
}

function len(value: string): number {
  return Array.from(value).length;
}

/**
 * 남은 예산을 나눠 준다. 짧은 조각이 먼저 제 길이를 다 받고, 남은 만큼을 긴 조각이 가져간다.
 * 회사 이름 하나가 길다고 지원자 이름까지 사라지지 않게 하려는 것이다.
 */
function allocate(lengths: number[], budget: number): number[] {
  const out = lengths.map(() => 0);
  const order = lengths
    .map((length, index) => ({ length, index }))
    .sort((a, b) => a.length - b.length || a.index - b.index);

  let remaining = Math.max(0, budget);
  let left = order.length;
  for (const { length, index } of order) {
    const share = Math.floor(remaining / left);
    const take = Math.min(length, share);
    out[index] = take;
    remaining -= take;
    left -= 1;
  }
  return out;
}

interface NameParts {
  /** 항상 남겨야 하는 조각 — 앞머리·판본·시각 */
  fixed: { value: string; at: number }[];
  /** 길면 줄여도 되는 조각 — 회사·지원자 이름 */
  flexible: { value: string; at: number }[];
  count: number;
}

/**
 * 상한을 넘으면 가변 조각(회사·이름)만 줄인다.
 * 판본 이름과 시각은 판본을 구분하는 정보라서 끝에서 잘라 버리면 안 된다.
 */
function assemble(parts: NameParts, ext: string): string {
  const extSuffix = ext ? `.${ext}` : "";
  const budget = FILENAME_MAX - len(extSuffix);
  const slots: string[] = new Array<string>(parts.count).fill("");
  for (const p of parts.fixed) slots[p.at] = p.value;

  const fixedLen = parts.fixed.reduce((sum, p) => sum + len(p.value), 0);
  const separators = Math.max(0, parts.count - 1);
  const room = budget - fixedLen - separators;

  const sizes = allocate(
    parts.flexible.map((p) => len(p.value)),
    room,
  );
  parts.flexible.forEach((p, i) => {
    const size = sizes[i];
    // 2글자도 못 남길 만큼 자리가 없으면 아예 뺀다. "루" 만 남는 편보다 없는 편이 낫다.
    slots[p.at] = size >= MIN_PART ? sanitizeFileNamePart(cut(p.value, size)) : "";
  });

  const base = slots.filter(Boolean).join(JOIN);
  return `${cut(base, budget)}${extSuffix}`;
}

/** 회사 이름. 공고가 없으면 지원 건 이름으로 대신한다. */
function companyOf(app: Application): string {
  return sanitizeFileNamePart(app.posting?.company || app.name || "");
}

/** 지원자 이름. 없으면 그 자리를 비운다 — 빈 조각은 파일명에서 사라진다. */
function applicantOf(app: Application): string {
  return sanitizeFileNamePart(app.profile?.name || "");
}

/**
 * 이력서 파일명.
 *
 * @param variant 판본 — 이름은 RESUME_VARIANT_META 의 title 을 따른다
 * @param ext     "docx" | "txt" | "pdf" — 점은 붙이지 않아도 된다
 * @param stamp   "YYYY-MM". 호출부가 만든다.
 */
export function resumeFileName(
  app: Application,
  variant: ResumeVariant,
  ext: string,
  stamp: string,
): string {
  const variantLabel = sanitizeFileNamePart(RESUME_VARIANT_META[variant].title);
  const when = sanitizeFileNamePart(stamp);

  const fixed = [
    { value: FILE_PREFIX, at: 0 },
    { value: variantLabel, at: 1 },
  ];
  if (when) fixed.push({ value: when, at: 4 });

  return assemble(
    {
      fixed,
      flexible: [
        { value: companyOf(app), at: 2 },
        { value: applicantOf(app), at: 3 },
      ],
      count: 5,
    },
    sanitizeExt(ext),
  );
}

/**
 * 지원전략 분석서 파일명.
 * 이력서와 다른 파일이라는 것이 이름에서 바로 보여야 한다 — 실수로 기업에 보내지 않도록.
 */
export function reportFileName(app: Application, ext: string, stamp: string): string {
  const when = sanitizeFileNamePart(stamp);

  const fixed = [
    { value: FILE_PREFIX, at: 0 },
    { value: REPORT_FILE_LABEL, at: 1 },
  ];
  if (when) fixed.push({ value: when, at: 4 });

  return assemble(
    {
      fixed,
      flexible: [
        { value: companyOf(app), at: 2 },
        { value: applicantOf(app), at: 3 },
      ],
      count: 5,
    },
    sanitizeExt(ext),
  );
}
