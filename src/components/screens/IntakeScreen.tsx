/**
 * 1 공고·이력 입력. (기획서 02·10)
 *
 * 좌측에는 공고, 우측에는 내 이력. 추출·정리된 내용과 확인 필요 부분을 함께 보여준다.
 *
 * 두 가지 사실을 화면에서 숨기지 않는다:
 *  - 페이지를 읽을 수 없으면 붙여넣기나 파일 입력으로 이어간다.
 *  - URL 만 입력해도 항상 내용을 가져오는 것은 아니다 ("링크만 저장됨").
 */
"use client";

import { useState } from "react";
import { extractTextFromFile, fetchJobPosting } from "@/lib/extract-client";

export interface IntakeValue {
  jdText: string;
  jdUrl: string;
  profileText: string;
  profileName: string;
  links: { label: string; url: string; status: "fetched" | "link-only" | "failed" }[];
}

export interface IntakeScreenProps {
  value: IntakeValue;
  onChange: (patch: Partial<IntakeValue>) => void;
  onSubmit: () => void;
  busy?: boolean;
}

type Notice = { tone: "info" | "warn" | "ok"; text: string } | null;

export function IntakeScreen({ value, onChange, onSubmit, busy }: IntakeScreenProps) {
  const [jdNotice, setJdNotice] = useState<Notice>(null);
  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [candidates, setCandidates] = useState<{ title: string; body: string }[]>([]);
  const [fetching, setFetching] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const ready = value.jdText.trim().length > 40 && value.profileText.trim().length > 40;

  async function fetchJd() {
    const url = value.jdUrl.trim();
    if (!url) return;
    setFetching(true);
    setJdNotice(null);
    try {
      const data = await fetchJobPosting(url);
      if (data?.ok && typeof data.text === "string" && data.text.trim().length > 40) {
        onChange({ jdText: data.text });
        // 한 페이지에 여러 공고가 있으면 지원할 공고 하나를 고르게 한다. (기획서 02)
        if (Array.isArray(data.postings) && data.postings.length > 1) {
          setCandidates(data.postings);
          setJdNotice({
            tone: "info",
            text: `이 페이지에서 공고 ${data.postings.length}건을 찾았습니다. 지원할 공고를 하나 고르세요.`,
          });
        } else {
          setJdNotice({ tone: "ok", text: "공고 본문을 가져왔습니다. 내용이 맞는지 확인해 주세요." });
        }
      } else {
        setJdNotice({
          tone: "warn",
          text:
            (data?.reason as string) ??
            "페이지를 읽을 수 없습니다. 공고 본문을 붙여넣거나 파일로 올려 주세요.",
        });
      }
    } catch {
      setJdNotice({
        tone: "warn",
        text: "페이지를 읽을 수 없습니다. 공고 본문을 붙여넣거나 파일로 올려 주세요.",
      });
    } finally {
      setFetching(false);
    }
  }

  /** 파일은 이 기기 안에서 읽는다. 이력서 파일을 서버로 보내지 않기 위해서다. */
  async function extractFile(file: File, target: "jd" | "profile") {
    setExtracting(true);
    const setNotice = target === "jd" ? setJdNotice : setProfileNotice;
    setNotice(null);
    try {
      const data = await extractTextFromFile(file);
      if (data.ok && data.text.trim()) {
        onChange(target === "jd" ? { jdText: data.text } : { profileText: data.text });
        setNotice({
          tone: data.warnings.length > 0 ? "warn" : "ok",
          text:
            data.warnings.length > 0
              ? data.warnings.join(" ")
              : `${file.name} 에서 텍스트를 가져왔습니다. 빠진 내용이 없는지 확인해 주세요.`,
        });
      } else {
        setNotice({
          tone: "warn",
          text: data.reason ?? "파일에서 텍스트를 찾지 못했습니다. 내용을 직접 붙여넣어 주세요.",
        });
      }
    } finally {
      setExtracting(false);
    }
  }

  function addLink(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    const label = /linkedin/i.test(trimmed)
      ? "LinkedIn"
      : /github/i.test(trimmed)
        ? "GitHub"
        : "프로필";
    // 내용을 확보하지 못한 링크는 "링크만 저장됨"으로 남긴다. 있는 척하지 않는다.
    onChange({ links: [...value.links, { label, url: trimmed, status: "link-only" }] });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── 좌: 공고 ── */}
        <Panel
          step="1"
          title="채용공고"
          lead="지원할 공고 하나의 본문이 필요합니다. 광고·메뉴는 빼고 본문만 넣어 주세요."
        >
          <label className="block text-[12px] font-semibold text-ink" htmlFor="jd-url">
            채용공고 URL
          </label>
          <div className="mt-1 flex gap-1.5">
            <input
              id="jd-url"
              type="url"
              inputMode="url"
              placeholder="https://..."
              value={value.jdUrl}
              onChange={(e) => onChange({ jdUrl: e.target.value })}
              className="min-w-0 flex-1 rounded-sm border border-rule-strong bg-canvas px-2 py-1.5 text-[13px]"
            />
            <button
              type="button"
              onClick={fetchJd}
              disabled={fetching || !value.jdUrl.trim()}
              className="shrink-0 rounded-sm border border-rule-strong bg-canvas px-2.5 py-1.5 text-[12px] font-medium text-ink hover:border-ink disabled:text-ink-faint"
            >
              {fetching ? "가져오는 중…" : "가져오기"}
            </button>
          </div>

          {candidates.length > 1 ? (
            <fieldset className="mt-2 rounded-sm border border-rule bg-surface p-2">
              <legend className="px-1 text-[11px] font-semibold text-ink">지원할 공고 선택</legend>
              <ul className="space-y-1">
                {candidates.map((c, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange({ jdText: c.body });
                        setCandidates([]);
                        setJdNotice({ tone: "ok", text: `“${c.title}” 공고를 선택했습니다.` });
                      }}
                      className="w-full rounded-sm px-2 py-1 text-left text-[12px] text-ink hover:bg-brand-soft"
                    >
                      {c.title}
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}

          <NoticeLine notice={jdNotice} />

          <label className="mt-3 block text-[12px] font-semibold text-ink" htmlFor="jd-text">
            공고 본문
          </label>
          <textarea
            id="jd-text"
            value={value.jdText}
            onChange={(e) => onChange({ jdText: e.target.value })}
            rows={14}
            placeholder={"모집 부문, 주요 업무, 자격 요건, 우대 사항을 그대로 붙여넣어 주세요."}
            className="mt-1 w-full rounded-sm border border-rule-strong bg-canvas px-2.5 py-2 font-mono text-[12px] leading-relaxed"
          />
          <FileRow
            id="jd-file"
            label="또는 공고 파일 올리기 (PDF · Word · 텍스트)"
            busy={extracting}
            onFile={(f) => extractFile(f, "jd")}
          />
          <CharCount value={value.jdText} min={40} />
        </Panel>

        {/* ── 우: 내 이력 ── */}
        <Panel
          step="2"
          title="내 이력"
          lead="직장 경력만이 아닙니다. 학위·수업·논문·인턴·대회·개인 프로젝트·자격·교육·오픈소스·봉사까지 넣어 주세요."
        >
          <label className="block text-[12px] font-semibold text-ink" htmlFor="profile-name">
            이름
          </label>
          <input
            id="profile-name"
            value={value.profileName}
            onChange={(e) => onChange({ profileName: e.target.value })}
            placeholder="이력서에 쓸 이름"
            className="mt-1 w-full rounded-sm border border-rule-strong bg-canvas px-2 py-1.5 text-[13px]"
          />

          <label className="mt-3 block text-[12px] font-semibold text-ink" htmlFor="profile-text">
            이력 내용
          </label>
          <textarea
            id="profile-text"
            value={value.profileText}
            onChange={(e) => onChange({ profileText: e.target.value })}
            rows={14}
            placeholder={
              "예)\n루멘플레이 · Unity 개발자 · 2025.09 ~ 2026.08\n- 퀘스트 UI와 데이터 연동 기능 구현\n- 기획·아트·QA와 협업하여 업데이트 2회 참여\n\n컴퓨터공학 학사 · 2019.03 ~ 2023.02"
            }
            className="mt-1 w-full rounded-sm border border-rule-strong bg-canvas px-2.5 py-2 font-mono text-[12px] leading-relaxed"
          />
          <FileRow
            id="profile-file"
            label="또는 이력서 파일 올리기 (PDF · Word · 텍스트)"
            busy={extracting}
            onFile={(f) => extractFile(f, "profile")}
          />
          <NoticeLine notice={profileNotice} />

          <LinkField links={value.links} onAdd={addLink} onRemove={(i) =>
            onChange({ links: value.links.filter((_, idx) => idx !== i) })
          } />
          <CharCount value={value.profileText} min={40} />
        </Panel>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-rule bg-canvas px-4 py-3">
        <p className="text-[12px] leading-snug text-ink-muted">
          {ready
            ? "두 자료가 준비되었습니다. 공고에서 인재상과 요구 조건을, 이력에서 경험을 정리합니다."
            : "공고 본문과 내 이력을 모두 넣어야 분석을 시작할 수 있습니다."}
        </p>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!ready || busy}
          className="shrink-0 rounded-sm bg-ink px-4 py-2 text-[13px] font-bold text-white disabled:bg-rule-strong"
        >
          {busy ? "분석 중…" : "분석 시작"}
        </button>
      </div>
    </div>
  );
}

function Panel({
  step,
  title,
  lead,
  children,
}: {
  step: string;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-sm border border-rule bg-canvas">
      <header className="border-b border-rule bg-surface-sunken px-4 py-2.5">
        <p className="text-[11px] font-semibold tracking-wide text-brand">{step} 단계</p>
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{lead}</p>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const tone =
    notice.tone === "warn"
      ? "bg-warn-soft text-warn"
      : notice.tone === "ok"
        ? "bg-ok-soft text-ok"
        : "bg-brand-soft text-brand";
  return (
    <p role="status" className={`mt-2 rounded-sm px-2 py-1.5 text-[12px] leading-snug ${tone}`}>
      {notice.text}
    </p>
  );
}

function FileRow({
  id,
  label,
  busy,
  onFile,
}: {
  id: string;
  label: string;
  busy?: boolean;
  onFile: (f: File) => void;
}) {
  return (
    <div className="mt-2">
      <label
        htmlFor={id}
        className="inline-block cursor-pointer rounded-sm border border-dashed border-rule-strong px-2.5 py-1.5 text-[12px] text-ink-muted hover:border-ink hover:text-ink"
      >
        {busy ? "읽는 중…" : label}
      </label>
      <input
        id={id}
        type="file"
        accept=".pdf,.docx,.txt,.md,text/plain"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function LinkField({
  links,
  onAdd,
  onRemove,
}: {
  links: IntakeValue["links"];
  onAdd: (url: string) => void;
  onRemove: (i: number) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="mt-3">
      <label className="block text-[12px] font-semibold text-ink" htmlFor="profile-link">
        프로필 주소 (선택)
      </label>
      <div className="mt-1 flex gap-1.5">
        <input
          id="profile-link"
          type="url"
          inputMode="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://linkedin.com/in/…"
          className="min-w-0 flex-1 rounded-sm border border-rule-strong bg-canvas px-2 py-1.5 text-[13px]"
        />
        <button
          type="button"
          onClick={() => {
            onAdd(draft);
            setDraft("");
          }}
          disabled={!draft.trim()}
          className="shrink-0 rounded-sm border border-rule-strong bg-canvas px-2.5 py-1.5 text-[12px] font-medium text-ink hover:border-ink disabled:text-ink-faint"
        >
          추가
        </button>
      </div>
      {links.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {links.map((l, i) => (
            <li
              key={`${l.url}-${i}`}
              className="flex items-center gap-2 rounded-sm bg-surface px-2 py-1 text-[12px]"
            >
              <span className="font-medium text-ink">{l.label}</span>
              <span className="min-w-0 flex-1 truncate text-ink-muted">{l.url}</span>
              {/* 내용을 확보하지 못했다는 사실을 그대로 표시한다. */}
              {l.status === "link-only" ? (
                <span className="shrink-0 rounded-sm bg-warn-soft px-1 text-[10px] font-medium text-warn">
                  링크만 저장됨
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="shrink-0 text-ink-faint hover:text-danger"
                aria-label={`${l.label} 링크 삭제`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-[11px] leading-snug text-ink-faint">
        링크는 저장하되 내용을 자동으로 가져오지 못할 수 있습니다. 그때는 텍스트나 파일로 이어서
        진행하세요.
      </p>
    </div>
  );
}

function CharCount({ value, min }: { value: string; min: number }) {
  const n = value.trim().length;
  return (
    <p className="tabular mt-1.5 text-right text-[11px] text-ink-faint">
      {n.toLocaleString("ko-KR")}자{n < min ? ` · 최소 ${min}자 필요` : ""}
    </p>
  );
}
