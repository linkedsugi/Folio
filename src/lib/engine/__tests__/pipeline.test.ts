import { describe, expect, it } from "vitest";
import { runPipeline } from "@/lib/engine/pipeline";

const jd = `루멘플레이 스튜디오
Senior Unity Gameplay Engineer

주요 업무
- 핵심 게임 기능을 설계하고 구현합니다.
- 게임 성능 문제를 분석하고 최적화합니다.
- 출시 품질을 책임집니다.

자격 요건
- 상용 게임 개발 경력 5년 이상
- Unity 와 C# 으로 핵심 기능을 구현한 경험
- 성능 분석과 최적화를 직접 수행한 경험

우대 사항
- 장기 라이브 운영 경험
- 주니어 멘토링 경험
`;

const profile = `한서준
Unity / C# 개발자
seojun@example.com

경력
픽셀브릿지 | 게임 클라이언트 개발자 | 2025.09 ~ 2026.08
- 상용 게임의 퀘스트 UI 와 데이터 연동 기능을 구현했습니다
- 기획, 아트, QA 와 협업하며 코드 리뷰를 진행했습니다
- 게임 업데이트 2회에 참여했습니다

노바인더스트리 | C# 3D 소프트웨어 개발자 | 2023.09 ~ 2025.08
- 산업용 3D 뷰어의 기능 개발과 배포, 장애로그 대응을 수행했습니다
- 동일 내부 테스트 장면의 로딩 시간을 4.0초에서 3.0초로 개선했습니다

학력
한국대학교 | 컴퓨터공학 학사 | 2019.03 ~ 2023.02

기술
Unity, C#, 3D, 성능 최적화
`;

describe("smoke", () => {
  it("runs", () => {
    const r = runPipeline({ jdText: jd, profileText: profile });
    console.log("posting", r.posting.company, "/", r.posting.roleTitle, "reqs:", r.posting.requirements.length);
    console.log("exps", r.profile.experiences.map(e => `${e.kind}:${e.organization}/${e.title}`));
    console.log("overall", r.report.overall.display, "verdict", r.report.verdict);
    console.log("dims", r.report.dimensions.map(d => `${d.label} w${d.weight} ${d.current}->${d.afterStory}->${d.target} [${d.confidence}]`));
    console.log("stories", r.report.stories.map(s => s.resumeSentence));
    console.log("actions", r.report.actions.map(a => `P${a.priority} ${a.from}->${a.to}`));
    console.log("questions", r.questions.map(q => q.question));
    console.log("baseline lines", r.resumes.baseline.sections.flatMap(s=>[...s.lines,...s.entries.flatMap(e=>e.lines)]).map(l=>`${l.basis}| ${l.text}`));
    console.log("story lines", r.resumes.story.sections.flatMap(s=>[...s.lines,...s.entries.flatMap(e=>e.lines)]).map(l=>`${l.basis}| ${l.text}`));
    console.log("future planned", r.resumes.future.sections.flatMap(s=>s.entries.flatMap(e=>e.lines)).filter(l=>l.basis==="planned").map(l=>l.text));
    console.log("narratives", [r.resumes.baseline, r.resumes.story, r.resumes.future].map(d=>`${d.variant}:${d.narrative.matchScore}%`));
    expect(r.report.dimensions.reduce((a,d)=>a+d.weight,0)).toBe(100);
  });
});
