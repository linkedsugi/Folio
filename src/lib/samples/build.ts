/**
 * 샘플 패키지 조립.
 *
 * 샘플을 손으로 쓴 거대한 객체로 두지 않고, **앱의 실제 엔진에 통과시켜** 만든다.
 *
 * 이유:
 *  - 손으로 쓴 샘플은 엔진이 바뀌면 조용히 어긋난다. 그러면 데모가 거짓말이 된다.
 *  - 기획서 11 은 "샘플마다 JD 와 지원자 이력을 함께 제공한다"고 했다.
 *    원문을 주고 앱이 읽게 하는 것이 그 말에 가장 가깝다.
 *  - 데모가 곧 앱의 실증이 된다. 샘플이 잘 나오지 않으면 엔진이 부족한 것이고,
 *    원문을 고쳐서 숨길 일이 아니라 엔진을 고칠 일이다.
 *
 * 회사·인물·실적은 모두 가상이다.
 */
import type { SampleId, SamplePackage } from "@/lib/types";
import { runPipeline } from "@/lib/engine/pipeline";
import { SAMPLE_SOURCES, type SampleSource } from "./sources";

export function buildSample(src: SampleSource): SamplePackage {
  const result = runPipeline({
    jdText: src.jdText,
    profileText: src.profileText,
    sourceType: "sample",
    docType: src.docType,
    language: src.language,
    templateId: src.templateId,
    targetPages: src.targetPages,
  });

  return {
    id: src.id,
    label: src.label,
    tagline: src.tagline,
    situation: src.situation,
    resumeDirection: src.resumeDirection,
    posting: result.posting,
    profile: result.profile,
    report: { ...result.report, generatedBy: "sample" },
    resumes: result.resumes,
    questions: result.questions,
  };
}

/**
 * 5종을 한 번만 만들어 둔다.
 *
 * 시작 화면이 카드마다 매칭 3단계를 보여주므로 다섯 개가 모두 필요하고,
 * 입력이 고정이라 결과도 고정이다. 매 렌더마다 다시 돌릴 이유가 없다.
 */
let cache: SamplePackage[] | null = null;

export function getSamples(): SamplePackage[] {
  const built = cache ?? SAMPLE_SOURCES.map(buildSample);
  cache = built;
  return built;
}

export function getSample(id: SampleId): SamplePackage | undefined {
  return getSamples().find((s) => s.id === id);
}
