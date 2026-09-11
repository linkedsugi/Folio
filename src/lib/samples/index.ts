/**
 * 데모 샘플 5종. (기획서 11·12)
 *
 * 샘플마다 JD 와 지원자 이력 원문을 제공하고, 앱의 실제 엔진이 그것을 읽어
 * 인재상·매칭·스토리·준비 과제·이력서 3판본까지 만든다.
 * 회사·인물·실적은 모두 가상이며, 결과 화면은 전부 같은
 * 현재 → 스토리 후 → 목표 구조로 통일된다.
 */
export { getSample, getSamples, buildSample } from "./build";
export { SAMPLE_SOURCES, type SampleSource } from "./sources";
