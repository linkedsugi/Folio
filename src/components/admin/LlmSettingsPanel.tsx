/**
 * 정밀 분석 설정 — 관리 화면의 한 구역.
 *
 * 이 구역은 이 앱에서 유일하게 "지원자 자료가 기기 밖으로 나가는" 스위치다.
 * 그래서 켜는 것보다 **무엇이 달라지는지 읽게 하는 것**이 먼저다:
 * 켜기 전에 경고를 두고, 켠 뒤에는 지금 실제로 동작하는지 아닌지를 구분해 알린다.
 *
 * 화면의 관리자 확인은 편의일 뿐이다. 서버 배포에서는 /api/settings 가 토큰을 검증하고
 * 관리자만 변경을 허용하므로, 이 화면을 우회해도 거기서 막힌다.
 */
"use client";

import { useEffect, useId } from "react";
import clsx from "clsx";
import { DEFAULT_MODEL_ID, MODEL_OPTIONS, TIER_LABEL } from "@/lib/llm/models";
import { Badge, Callout } from "@/components/ui";
import { useIsAdmin } from "@/store/auth-store";
import {
  useLlmSettings,
  useSettingsError,
  useSettingsHydrated,
  useSettingsLoading,
  useSettingsStore,
  useSettingsStoreKind,
} from "@/store/settings-store";

export interface LlmSettingsPanelProps {
  className?: string;
}

/** 운영 기록은 읽는 사람의 시간대로 보여 준다. 값이 깨져 있으면 원문 그대로 둔다. */
function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LlmSettingsPanel({ className }: LlmSettingsPanelProps) {
  const hydrated = useSettingsHydrated();
  const admin = useIsAdmin();
  const settings = useLlmSettings();
  const loading = useSettingsLoading();
  const storeKind = useSettingsStoreKind();
  const error = useSettingsError();
  const load = useSettingsStore((s) => s.load);
  const update = useSettingsStore((s) => s.update);

  const toggleId = useId();
  const toggleHintId = `${toggleId}-hint`;
  const modelGroupId = `${toggleId}-models`;

  useEffect(() => {
    void load();
  }, [load]);

  // 서버가 없는 배포에는 API 키도 없다. 켜도 규칙 기반으로 동작한다.
  const serverless = storeKind === "local";
  const locked = !admin || loading;
  /*
   * 아직 저장소에 물어보지 않았거나 물어보는 중이다.
   * 이때 켜짐/꺼짐·키 유무로 상태를 단정하면, 브라우저에 남아 있던 참고값 때문에
   * "켜져 있지만 키가 없습니다" 같은 경고가 먼저 떴다가 곧 바뀐다.
   * 없는 고장을 알리는 셈이므로, 확인이 끝날 때까지는 아무 판정도 하지 않는다.
   */
  const checking = storeKind === "unknown" || loading;

  return (
    <section
      className={clsx("rounded-sm border border-rule bg-canvas", className)}
      aria-busy={loading}
    >
      <header className="border-b border-rule bg-surface-sunken px-4 py-2.5">
        <p className="text-[11px] font-semibold tracking-wide text-brand">선택 기능</p>
        <h2 className="mt-0.5 text-sm font-bold text-ink">정밀 분석</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
          분석과 이력서 작성은 켜지 않아도 규칙 기반으로 그대로 동작합니다. 정밀 분석은 그 결과를
          모델로 한 번 더 다듬는 선택 사항이고, 실패하면 조용히 규칙 기반 결과로 돌아갑니다.
        </p>
      </header>

      <div className="space-y-4 px-4 py-4">
        {/* 켜기 전에 반드시 읽어야 하는 내용. 상태와 상관없이 항상 보인다. */}
        <Callout tone="warn" title="켜기 전에 읽어 주세요">
          정밀 분석을 켜면 지원자의 공고와 이력이 모델 제공자에게 전송됩니다. 지금까지 이 앱은
          자료를 기기 밖으로 내보내지 않았습니다. 켜기 전에 이용자에게 무엇이 전송되는지 알리고,
          지원자가 분석할 때마다 직접 동의하도록 되어 있습니다.
        </Callout>

        {!hydrated ? (
          <p className="py-4 text-center text-[12px] text-ink-muted">설정을 불러오는 중…</p>
        ) : (
          <>
            {/* 0. 바꾸지 못했다면 그 이유를 먼저 말한다 — 체크박스만 되돌아가면 침묵이다. */}
            {error ? (
              <div role="alert">
                <Callout tone="danger" title="설정을 바꾸지 못했습니다">
                  <p>{error.reason}</p>
                  {/* 되돌아간 값이 무엇인지도 함께 말한다 — 화면에 남은 값을 오해하지 않도록. */}
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {error.status > 0
                      ? `서버 응답 ${error.status} · 아래 값은 지금 서버에 저장된 설정입니다.`
                      : "서버의 설정을 확인하지 못해 아래 값은 꺼짐으로 두었습니다."}
                  </p>
                </Callout>
              </div>
            ) : null}

            {/* 1. 켜기/끄기 */}
            <div className="rounded-sm border border-rule bg-surface px-3 py-2.5">
              <label htmlFor={toggleId} className="flex cursor-pointer items-start gap-2.5">
                <input
                  id={toggleId}
                  type="checkbox"
                  checked={settings.enabled}
                  disabled={locked}
                  aria-describedby={toggleHintId}
                  onChange={(e) => void update({ enabled: e.target.checked })}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)] disabled:cursor-not-allowed"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-[13px] font-bold text-ink">정밀 분석 켜기</span>
                    <Badge tone={settings.enabled ? "ok" : "neutral"} size="xs">
                      {settings.enabled ? "켜짐" : "꺼짐"}
                    </Badge>
                  </span>
                  <span
                    id={toggleHintId}
                    className="mt-0.5 block text-[12px] leading-snug text-ink-muted"
                  >
                    기본값은 꺼짐입니다. 켜도 지원자가 분석할 때마다 따로 동의해야 자료가
                    전송됩니다.
                  </span>
                </span>
              </label>
            </div>

            {/* 3. 지금 실제로 어떤 상태인가 */}
            <StatusNotice
              checking={checking}
              enabled={settings.enabled}
              keyConfigured={settings.keyConfigured}
              serverless={serverless}
            />

            {/* 2. 모델 선택 */}
            <fieldset className="min-w-0" aria-describedby={modelGroupId}>
              <legend className="text-[12px] font-semibold text-ink">분석에 쓸 모델</legend>
              <p id={modelGroupId} className="mt-0.5 text-[11px] leading-snug text-ink-faint">
                정밀 분석이 켜져 있을 때만 쓰입니다. 어느 모델을 고르든 점수와 문장은 지원자가 입력한
                실제 경험에서만 나옵니다.
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {MODEL_OPTIONS.map((model) => {
                  const inputId = `${toggleId}-${model.id}`;
                  const noteId = `${inputId}-note`;
                  const on = settings.modelId === model.id;
                  return (
                    <li key={model.id}>
                      <label
                        htmlFor={inputId}
                        className={clsx(
                          "flex cursor-pointer items-start gap-2.5 rounded-sm border px-3 py-2",
                          on ? "border-rule-strong bg-surface" : "border-rule bg-canvas",
                        )}
                      >
                        <input
                          id={inputId}
                          type="radio"
                          name={`${toggleId}-model`}
                          value={model.id}
                          checked={on}
                          disabled={locked}
                          aria-describedby={noteId}
                          onChange={() => void update({ modelId: model.id })}
                          className="mt-0.5 shrink-0 accent-[var(--color-ink)] disabled:cursor-not-allowed"
                        />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-baseline gap-1.5">
                            <span className="text-[13px] font-semibold text-ink">{model.label}</span>
                            <Badge tone={model.tier === "fast" ? "neutral" : "brand"} size="xs">
                              {TIER_LABEL[model.tier]}
                            </Badge>
                            {model.id === DEFAULT_MODEL_ID ? (
                              <Badge tone="neutral" size="xs" title="아무것도 고르지 않았을 때 쓰는 모델">
                                기본
                              </Badge>
                            ) : null}
                          </span>
                          <span
                            id={noteId}
                            className="mt-0.5 block text-[12px] leading-snug text-ink-muted"
                          >
                            {model.note}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            {/* 4. 마지막 변경 — 운영 기록 */}
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-rule pt-2.5 text-[11px] text-ink-faint">
              <span className="font-semibold">마지막 변경</span>
              {settings.updatedAt || settings.updatedBy ? (
                <>
                  <span className="tabular break-all text-ink-muted">
                    {settings.updatedAt ? formatMoment(settings.updatedAt) : "시각 기록 없음"}
                  </span>
                  <span className="break-all text-ink-muted">{settings.updatedBy ?? "기록 없음"}</span>
                </>
              ) : (
                <span className="text-ink-muted">아직 바뀐 적이 없습니다.</span>
              )}
            </div>

            {!admin ? (
              <p className="text-[11px] leading-snug text-ink-faint">
                설정을 바꾸는 것은 관리자만 할 수 있습니다. 지금은 보기만 할 수 있습니다.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * 켜짐/꺼짐만으로는 부족하다.
 * "켰는데 왜 규칙 기반으로 나오지" 를 화면이 먼저 말해 주지 않으면
 * 관리자는 원인을 찾을 방법이 없다.
 */
function StatusNotice({
  checking,
  enabled,
  keyConfigured,
  serverless,
}: {
  checking: boolean;
  enabled: boolean;
  keyConfigured: boolean;
  serverless: boolean;
}) {
  // 모르는 동안에는 모른다고 말한다. 잠깐 잘못된 경고를 띄웠다 바꾸면,
  // 다음에 진짜 경고가 떴을 때 관리자는 그것도 곧 사라질 것으로 읽는다.
  if (checking) {
    return (
      <Callout tone="neutral" title="설정을 확인하는 중입니다">
        저장된 설정을 읽고 있습니다. 확인이 끝나면 지금 상태를 알려 드립니다.
      </Callout>
    );
  }

  if (serverless) {
    return (
      <Callout tone="warn" title="이 배포에서는 정밀 분석을 쓸 수 없습니다">
        지금 배포에는 서버가 없어 정밀 분석을 쓸 수 없습니다. 이 설정은 이 브라우저에만 저장됩니다.
        분석은 규칙 기반으로 그대로 동작합니다.
      </Callout>
    );
  }

  if (!enabled) {
    return (
      <Callout tone="neutral" title="지금은 규칙 기반으로만 분석합니다">
        정밀 분석이 꺼져 있습니다. 지원자 자료는 기기 밖으로 나가지 않습니다.
      </Callout>
    );
  }

  if (!keyConfigured) {
    return (
      <Callout tone="warn" title="켜져 있지만 동작하지 않습니다">
        서버에 <code className="font-mono">ROLEFIT_ANTHROPIC_API_KEY</code> 가 없어 규칙 기반으로
        동작합니다. 키를 설정하고 서버를 다시 시작해 주세요.
      </Callout>
    );
  }

  return (
    <Callout tone="ok" title="정밀 분석이 동작합니다">
      지원자가 분석할 때마다 동의하면 공고와 이력을 모델에 보내 한 번 더 다듬습니다. 동의하지 않거나
      실패하면 규칙 기반 결과가 그대로 나옵니다.
    </Callout>
  );
}
