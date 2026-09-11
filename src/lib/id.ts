/** SSR 안전한 id 생성. 서버와 클라이언트에서 같은 코드가 돌아도 터지지 않아야 한다. */
let counter = 0;

export function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}

/**
 * 파일 시스템이 막는 문자와 제어문자.
 * 문자 클래스를 소스에 직접 쓰면 제어문자가 파일에 섞일 수 있어 유니코드 이스케이프로만 적는다.
 */
const UNSAFE_FOR_FILENAME = new RegExp(
  "[\\u0000-\\u001f\\u007f\\\\/:*?\"<>|]",
  "g",
);

/**
 * 파일명·라벨에 쓸 수 있게 다듬는다.
 * 한글을 로마자로 바꾸지 않는다 — 회사별 버전을 사용자가 눈으로 구분해야 하기 때문.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKC")
    .replace(UNSAFE_FOR_FILENAME, "")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 60);
}
