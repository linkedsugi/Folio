@AGENTS.md

# RoleFit Canvas — 작업 규칙

「RoleFit Canvas 앱 기획서 v4.0」의 구현체. Next.js 16 App Router / React 19 / TS strict / Tailwind v4.

## 계약 파일 (바꾸기 전에 반드시 이유를 남길 것)

- `src/lib/types.ts` — 도메인 모델. 유일한 진실. 화면·엔진·샘플이 전부 여기에 맞춘다.
- `src/lib/scoring.ts` — 가중 매칭률, 재평가, 지원 판단.
- `src/lib/templates.ts` — 기본 템플릿 5종.
- `src/app/globals.css` — Tailwind v4 `@theme` 디자인 토큰.

## 기획 원칙 (코드로 강제되어야 하는 것)

깨뜨리는 변경을 하려면 기획서를 먼저 확인할 것. `npm test` 가 이 원칙들을 지킨다.

1. 수치는 **직무 매칭률**이다. 합격확률·서류통과율로 표현하지 않는다.
2. 근거 없는 내용을 만들지 않는다. 자료에 없으면 `needs-confirmation` 으로 남긴다.
3. **문장만 고쳐도 `afterStory` 가 오르지 않는다.** 실제 관련 경험이 있어야 한다.
4. **완료 체크만으로 목표 점수를 주지 않는다.** `reassess()` 는 제출된 증거만 반영한다.
5. 총점과 필수 조건은 서로 다른 정보다. `MustHaveStatus` 를 따로 계산·표시한다.
6. 학력·수료를 실무 연수로 바꾸지 않는다. 경력연수 부문의 `target` 에 미래 개월을 더하지 않는다.
7. 이력서 3(future)은 **제출 불가**. `[예정]` 문장을 담으므로 제출용 내보내기에서 막는다.
8. 분석서의 점수·약점·미래 계획을 기업 제출용 이력서에 자동 포함하지 않는다.
9. 직무와 무관한 나이·성별·외모·종교·가족관계를 인재상이나 점수에 쓰지 않는다.

## 스타일

- UI 문구와 주석은 한국어. 주석은 "무엇"이 아니라 **"왜"** 를 적는다.
- 색은 `globals.css` 의 토큰만 쓴다 (`text-ink`, `bg-now-soft`, `border-rule` …). 하드코딩 hex 금지.
- 한글 가독성을 위해 `word-break: keep-all` 이 body 에 걸려 있다. 표·코드는 `overflow-x-auto` 컨테이너에.
- 모바일 400px 폭에서 가로 스크롤이 생기면 안 된다.
- 결정적 출력이 필요한 곳(이력서 생성 등)에서 `Math.random()` / `Date.now()` 를 쓰지 않는다.

## 명령

```bash
npm run dev        # 개발 서버
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # 프로덕션 빌드
npm run lint
```
