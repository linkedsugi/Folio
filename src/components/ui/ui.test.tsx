/** 공용 프리미티브의 props 계약(화면들이 이미 이 시그니처로 쓰고 있다)과 키보드 접근을 고정한다. */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScoreTriad } from "./ScoreTriad";
import { MatchTable } from "./MatchTable";
import { StageRail } from "./StageRail";
import { ScoreBar, Button, Badge, Callout, Disclosure, TextInput, TextArea, Select, EmptyState, Spinner, DocFrame } from "./index";
import { computeOverall } from "@/lib/scoring";
import type { MatchDimension } from "@/lib/types";

const dim = (over: Partial<MatchDimension>): MatchDimension => ({
  id: "d1", label: "게임 개발 5년", kind: "must", weight: 20,
  current: 20, afterStory: 20, target: 20,
  teamExpectation: "", currentBasis: "", storyBasis: "게임 1년·비게임 2년 구분",
  nextStep: "동등 경력 인정 여부 확인", evidenceToProduce: "문의 회신", remainingGap: "",
  rationale: [], usedExperienceIds: [], confidence: "confirmed",
  storyLift: "already-reflected", ...over,
});

const dims = [
  dim({ targetCaveat: "유지", confidence: "needs-confirmation" }),
  dim({ id: "d2", label: "Unity·C#", kind: "preferred", weight: 80, current: 50, afterStory: 75, target: 100, storyLift: "lifted" }),
];

describe("ui primitives", () => {
  it("ScoreTriad 는 세 단계 제목·수치를 보여준다", () => {
    render(<ScoreTriad overall={computeOverall(dims)} active="afterStory" />);
    expect(screen.getByText("현재 매칭")).toBeTruthy();
    expect(screen.getByText("스토리텔링 후")).toBeTruthy();
    expect(screen.getByText("실행 목표")).toBeTruthy();
    // 가중 평균(비중 20·80): 현재 44 → 스토리 후 64 → 목표 84.
    // 세 값을 모두 확인한다. 하나만 보면 열이 밀려도 통과해 버린다.
    expect(screen.getByText("44")).toBeTruthy();
    expect(screen.getByText("64")).toBeTruthy();
    expect(screen.getByText("84")).toBeTruthy();
  });

  it("MatchTable 행은 키보드로 선택된다", () => {
    const onSelect = vi.fn();
    render(<MatchTable dimensions={dims} onSelect={onSelect} selectedId="d1" emphasize="target" />);
    const rows = screen.getAllByRole("row");
    const body = rows.filter((r) => r.getAttribute("aria-selected") !== null);
    expect(body.length).toBe(2);
    expect(body[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(body[1], { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("d2");
    fireEvent.click(body[0]);
    expect(onSelect).toHaveBeenCalledWith("d1");
    expect(screen.getByText("확인 필요")).toBeTruthy();
    expect(screen.getByText("유지")).toBeTruthy();
    expect(screen.getByText("비중 80%")).toBeTruthy();
  });

  it("StageRail 은 미도달 단계를 비활성화한다", () => {
    const onSelect = vi.fn();
    render(<StageRail current="baseline" completed={["intake", "review", "baseline"]} onSelect={onSelect} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(6);
    const current = buttons.find((b) => b.getAttribute("aria-current") === "step");
    expect(current?.textContent).toContain("현재 매핑");
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(false);
    expect((buttons[5] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(buttons[1]);
    expect(onSelect).toHaveBeenCalledWith("review");
    expect(screen.getByText("이력서 1 · Baseline")).toBeTruthy();
  });

  it("나머지 프리미티브가 렌더된다", () => {
    render(
      <div>
        <ScoreBar current={20} afterStory={50} target={75} label="성능" />
        <Button variant="primary" size="sm">다음</Button>
        <Badge tone="warn">확인 필요</Badge>
        <Callout tone="danger" title="제출 불가">이력서 3</Callout>
        <Disclosure summary="왜 이렇게 해석했나요?">근거</Disclosure>
        <TextInput label="회사" hint="공고의 회사명" />
        <TextArea label="공고 본문" error="비어 있습니다" />
        <Select label="언어" options={[{ value: "ko", label: "한국어" }]} />
        <EmptyState title="아직 없습니다" description="설명" action={<Button>추가</Button>} />
        <Spinner label="분석 중" showLabel />
        <DocFrame eyebrow="03" title="제목" lead="리드" footnote="읽는 법">본문</DocFrame>
      </div>,
    );
    expect(screen.getByRole("img", { name: "현재 20%, 스토리텔링 후 50%, 목표 75%" })).toBeTruthy();
    expect((screen.getByLabelText("회사") as HTMLInputElement).tagName).toBe("INPUT");
    const ta = screen.getByLabelText("공고 본문");
    expect(ta.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("비어 있습니다");
    expect(screen.getByRole("status").textContent).toContain("분석 중");
  });
});
