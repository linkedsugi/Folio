/**
 * 정밀 분석이 다듬은 자리를 찾아 주는 조회 함수.
 *
 * 서버는 "몇 개가 바뀌었나"가 아니라 "어디가 바뀌었나"를 경로 문자열로 돌려준다.
 *   'idealCandidate:oneLine'
 *   'dimension:<id>:currentBasis' | ':storyBasis' | ':remainingGap'
 *   'story:<id>:connectionLogic' | ':resumeSentence' | ':interviewNote'
 *   'candidacyNow:reasonsToConsider:0' | 'candidacyFuture:concerns:1:response' | ...
 *
 * 화면은 문장 하나를 그릴 때마다 "이 자리가 그 안에 있나"를 묻는다.
 * 부문·스토리·우려가 각각 여러 개이므로 그때마다 배열을 훑으면 묻는 횟수만큼 곱해진다.
 * 그래서 Set 하나로 만들어 두고 조회 함수만 넘긴다.
 */

/** 경로 하나가 정밀 분석에서 다듬어졌는지 묻는다. */
export type RefinedLookup = (path: string) => boolean;

/**
 * 정밀 분석을 쓰지 않은 분석서에는 표식이 하나도 뜨지 않는 것이 옳다.
 * 그 경우를 호출부의 분기로 떠넘기지 않으려고, 언제나 false 인 함수를 돌려준다.
 */
const NEVER: RefinedLookup = () => false;

export function makeRefinedLookup(changedPaths: string[] | undefined): RefinedLookup {
  if (!changedPaths || changedPaths.length === 0) return NEVER;

  const paths = new Set(changedPaths);

  /*
   * 정확히 일치할 때만 참이다.
   * 'dimension:d1:currentBasis' 가 바뀌었다고 해서 'dimension:d1' 이나
   * 'dimension:d1:storyBasis' 까지 다듬어진 것은 아니다. 앞부분이 같다는 이유로 표식을 붙이면,
   * 규칙 기반 그대로인 문장에 모델의 출처를 잘못 달게 된다. 출처는 넓게 잡을수록 거짓이 된다.
   */
  return (path) => paths.has(path);
}
