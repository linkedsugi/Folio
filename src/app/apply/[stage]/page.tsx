import { notFound } from "next/navigation";
import { STAGE_ORDER, type StageId } from "@/lib/types";
import { ApplyClient } from "./apply-client";

export const dynamic = "force-static";

/** 단계별 경로를 미리 만들어 둔다 — 깊은 링크로 되돌아올 수 있어야 한다. */
export function generateStaticParams() {
  return STAGE_ORDER.filter((s) => s !== "start").map((stage) => ({ stage }));
}

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ stage: string }>;
}) {
  const { stage } = await params;
  if (!STAGE_ORDER.includes(stage as StageId) || stage === "start") notFound();
  return <ApplyClient stage={stage as Exclude<StageId, "start">} />;
}
