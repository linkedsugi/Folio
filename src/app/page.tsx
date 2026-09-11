/**
 * 시작 화면 경로.
 *
 * 상태는 브라우저에만 보관하므로(지원자 자료는 기본 비공개) 클라이언트에서 읽는다.
 * hydration 이 끝나기 전에는 저장된 지원 건을 그리지 않는다 — 서버 렌더 결과와
 * 어긋나면 화면이 한 번 깜빡이기 때문.
 */
"use client";

import { useRouter } from "next/navigation";
import type { SampleId } from "@/lib/types";
import { SAMPLES, getSample } from "@/lib/samples";
import { useAppStore, useHydrated } from "@/store/app-store";
import { AppShell } from "@/components/AppShell";
import { StartScreen } from "@/components/screens/StartScreen";

export default function HomePage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const applications = useAppStore((s) => s.applications);
  const createApplication = useAppStore((s) => s.createApplication);
  const createFromSample = useAppStore((s) => s.createFromSample);
  const deleteApplication = useAppStore((s) => s.deleteApplication);
  const setActive = useAppStore((s) => s.setActive);

  function startOwn() {
    createApplication();
    router.push("/apply/intake");
  }

  function startSample(id: SampleId) {
    const sample = getSample(id);
    if (!sample) return;
    createFromSample(sample);
    // 샘플은 결과를 먼저 보여주는 것이 목적이므로 입력 단계를 건너뛴다.
    router.push("/apply/baseline");
  }

  function open(id: string) {
    setActive(id);
    const app = applications.find((a) => a.id === id);
    router.push(`/apply/${app?.stage ?? "intake"}`);
  }

  return (
    <AppShell app={null} stage="start">
      <StartScreen
        samples={SAMPLES}
        applications={hydrated ? applications : []}
        onStartOwn={startOwn}
        onStartSample={startSample}
        onOpen={open}
        onDelete={deleteApplication}
      />
    </AppShell>
  );
}
