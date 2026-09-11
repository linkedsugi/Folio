/**
 * 식별자 생성.
 *
 * 왜 이런 모양인가:
 *  - Next.js App Router 는 같은 모듈을 서버에서도 평가한다. 서버에는 window 가 없고
 *    구형 브라우저·비보안 컨텍스트에는 crypto.randomUUID 가 없다.
 *    그래서 "있으면 쓰고 없으면 카운터" 폴백으로 어디서 불려도 깨지지 않게 한다.
 *  - 값이 결정적일 필요는 없다. 다만 이 함수는 렌더 중에 부르지 않는다.
 *    (서버 렌더와 클라이언트 렌더가 다른 id 를 만들면 hydration 이 어긋나기 때문에,
 *     id 는 항상 이벤트 핸들러나 스토어 액션 안에서만 만든다.)
 */

/** 폴백 카운터. 모듈 하나당 하나이며, 같은 실행 안에서만 유일하면 충분하다. */
let counter = 0;

type CryptoLike = { randomUUID?: () => string };

function nativeUuid(): string | null {
  // globalThis 로 접근해야 서버(Node)·브라우저 양쪽에서 안전하다.
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      // 비보안 컨텍스트 등에서 던지면 폴백으로 내려간다.
      return null;
    }
  }
  return null;
}

/**
 * `prefix-xxxxxxxx` 형태의 id 를 만든다.
 * 예: makeId("app") → "app-3f2a1c0b9d8e..."
 */
export function makeId(prefix: string): string {
  const base = slugify(prefix) || "id";
  const uuid = nativeUuid();
  if (uuid) return `${base}-${uuid.replace(/-/g, "").slice(0, 12)}`;
  counter += 1;
  // 폴백도 실행 간 충돌을 줄이려고 시각을 36진수로 섞는다.
  return `${base}-${Date.now().toString(36)}${counter.toString(36).padStart(3, "0")}`;
}

/**
 * 파일명·id 에 쓸 수 있는 형태로 다듬는다.
 * 한글은 그대로 남긴다 — 회사명·이름이 한글인 경우가 대부분이라
 * 로마자로 바꾸면 오히려 알아보기 어렵다.
 */
export function slugify(s: string): string {
  return s
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    // 공백류는 하이픈으로
    .replace(/\s+/g, "-")
    // 한글·영숫자·하이픈만 남긴다 (파일명 금지문자 제거 목적)
    .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}
