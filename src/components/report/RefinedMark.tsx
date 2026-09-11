/**
 * "이 문장은 정밀 분석이 다듬었다"를 밝히는 표식.
 *
 * 모델이 다듬은 문장과 앱이 규칙으로 계산한 문장이 한 화면에 섞여 있으면,
 * 사용자는 무엇을 어디까지 믿어야 할지 알 수 없다. 출처를 밝히는 것이 정직한 일이다.
 * 점수와 근거는 규칙 엔진 그대로이므로, 표식은 "문장만 손봤다"는 뜻으로 읽혀야 한다.
 *
 * 인쇄물에는 나가지 않는다(no-print). 앱이 어떤 경로로 이 문장을 얻었는지는
 * 이 앱을 쓰는 사람의 사정이지, 문서를 받아 읽는 사람의 사정이 아니다.
 */

export interface RefinedMarkProps {
  refined?: boolean;
}

export function RefinedMark({ refined }: RefinedMarkProps) {
  if (!refined) return null;

  return (
    <span
      className="no-print ml-2 inline-block shrink-0 rounded-sm bg-brand-soft px-2 py-0.5 align-middle text-[11px] leading-normal font-semibold whitespace-nowrap text-brand"
      title="모델이 문장을 다듬었습니다. 점수와 근거는 규칙 기반 분석 그대로입니다."
    >
      정밀 분석이 다듬음
    </span>
  );
}
