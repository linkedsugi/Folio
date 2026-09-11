/**
 * 데모 샘플 5종. (기획서 11·12)
 *
 * 샘플마다 JD 와 지원자 이력을 함께 제공하고,
 * 인재상·매칭·스토리·준비 과제·이력서까지 연결해 보여준다.
 * 회사·인물·실적은 모두 가상이며, 결과 화면은 전부 같은
 * 현재 → 스토리 후 → 목표 구조로 통일한다.
 */
import type { SampleId, SamplePackage } from "@/lib/types";
import { SAMPLE_A } from "./sample-a";
import { SAMPLE_B } from "./sample-b";
import { SAMPLE_C } from "./sample-c";
import { SAMPLE_D } from "./sample-d";
import { SAMPLE_E } from "./sample-e";

export const SAMPLES: SamplePackage[] = [SAMPLE_A, SAMPLE_B, SAMPLE_C, SAMPLE_D, SAMPLE_E];

export const SAMPLE_BY_ID: Record<SampleId, SamplePackage> = Object.fromEntries(
  SAMPLES.map((s) => [s.id, s]),
) as Record<SampleId, SamplePackage>;

export function getSample(id: SampleId): SamplePackage | undefined {
  return SAMPLE_BY_ID[id];
}

export { SAMPLE_A, SAMPLE_B, SAMPLE_C, SAMPLE_D, SAMPLE_E };
