/**
 * 인쇄 전용 화면. (/print/resume · /print/report)
 *
 * PDF 는 브라우저 인쇄로 만든다. 라이브러리 변환과 달리 한글 글꼴이 그대로 들어가고,
 * 화면에서 본 지면과 인쇄 결과가 어긋나지 않는다.
 *
 * 이 경로는 조작 요소 없이 지면만 렌더링한다.
 */
import { PrintClient } from "./print-client";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ kind: "resume" }, { kind: "report" }];
}

export default async function PrintPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  return <PrintClient kind={kind === "report" ? "report" : "resume"} />;
}
