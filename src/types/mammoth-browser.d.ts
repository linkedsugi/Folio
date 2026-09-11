/**
 * mammoth 의 브라우저 번들에는 타입 선언이 없다.
 * 우리가 쓰는 한 가지 함수만 좁게 선언한다 — any 로 열어 두면 실수를 잡지 못한다.
 */
declare module "mammoth/mammoth.browser" {
  export interface MammothMessage {
    type?: string;
    message?: string;
  }
  export interface RawTextResult {
    value: string;
    messages: MammothMessage[];
  }
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<RawTextResult>;
}
