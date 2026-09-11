/**
 * 회원 관리.
 *
 * 관리자가 하는 일은 네 가지다: 누가 쓰는지 보기 / 권한 올리고 내리기 /
 * 이용 정지와 해제 / 운영 메모 남기기.
 *
 * 여기서 보이는 것은 계정 정보(이름·이메일·로그인 기록)뿐이다.
 * 회원이 입력한 공고·이력·분석서는 그 사람의 기기에만 있고 관리자도 볼 수 없다.
 * 그래야 "지원자 자료는 기본 비공개" 라는 약속이 말뿐이 아니게 된다.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ROLE_LABEL,
  ROLE_NOTE,
  STATUS_LABEL,
  isAdmin,
  type Member,
  type MemberRole,
} from "@/lib/auth/types";
import { canChangeRole, useAuthHydrated, useAuthStore, useSession } from "@/store/auth-store";
import { AppShell } from "@/components/AppShell";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export function AdminClient() {
  const hydrated = useAuthHydrated();
  const session = useSession();
  const { members, loadingMembers, storeKind, refreshMembers, setRole, setStatus, setNote, removeMember } =
    useAuthStore();

  const [query, setQuery] = useState("");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const admin = Boolean(session && isAdmin(session.member.role));

  useEffect(() => {
    if (admin) void refreshMembers();
  }, [admin, refreshMembers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.email.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
    );
  }, [members, query]);

  const counts = useMemo(
    () => ({
      total: members.length,
      admins: members.filter((m) => isAdmin(m.role)).length,
      suspended: members.filter((m) => m.status === "suspended").length,
    }),
    [members],
  );

  if (!hydrated) {
    return (
      <AppShell app={null} stage="start">
        <p className="py-16 text-center text-sm text-ink-muted">불러오는 중…</p>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell app={null} stage="start">
        <div className="mx-auto max-w-md rounded-sm border border-rule bg-canvas px-5 py-6">
          <h1 className="text-lg font-bold text-ink">회원 관리</h1>
          <p className="mt-1 mb-4 text-[13px] leading-relaxed text-ink-muted">
            관리자만 볼 수 있는 화면입니다. Google 계정으로 로그인해 주세요.
          </p>
          <GoogleSignInButton />
          <Link href="/" className="mt-3 inline-block text-[12px] text-brand hover:underline">
            ← 앱으로 돌아가기
          </Link>
        </div>
      </AppShell>
    );
  }

  if (!admin) {
    return (
      <AppShell app={null} stage="start">
        <div className="mx-auto max-w-md rounded-sm border border-rule bg-canvas px-5 py-6">
          <h1 className="text-lg font-bold text-ink">권한이 없습니다</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            이 화면은 관리자만 볼 수 있습니다. 현재 계정({session.member.email})은{" "}
            {ROLE_LABEL[session.member.role]} 권한입니다.
          </p>
          <Link href="/" className="mt-3 inline-block text-[12px] text-brand hover:underline">
            ← 앱으로 돌아가기
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell app={null} stage="start">
      <div className="space-y-5">
        <header>
          <p className="text-[11px] font-semibold tracking-wide text-brand">ADMIN</p>
          <h1 className="mt-0.5 text-xl font-bold text-ink sm:text-2xl">회원 관리</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            계정 정보와 이용 현황만 보입니다. 회원이 입력한 공고·이력·분석서는 그 사람의 기기에만
            있고 여기서 볼 수 없습니다.
          </p>
        </header>

        {/* 저장소가 이 기기뿐이라면 그 사실을 숨기지 않는다. */}
        {storeKind === "local" ? (
          <div className="rounded-sm border border-warn-soft bg-warn-soft px-4 py-3">
            <p className="text-[13px] font-bold text-warn">이 목록은 이 브라우저에만 있습니다</p>
            <p className="mt-0.5 text-[12px] leading-snug text-warn">
              지금 배포에는 회원 정보를 보관할 서버가 없습니다. 여기 보이는 것은 이 브라우저에서
              로그인한 계정뿐이고, 다른 기기에서 가입한 사람은 보이지 않습니다. 전체 가입자를
              관리하려면 서버가 있는 환경에 배포하고 <code className="font-mono">ROLEFIT_DATA_DIR</code>{" "}
              를 설정해야 합니다.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <Stat label="전체 회원" value={counts.total} />
          <Stat label="관리자" value={counts.admins} />
          <Stat label="정지" value={counts.suspended} tone={counts.suspended > 0 ? "warn" : undefined} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="member-search" className="sr-only">
            회원 검색
          </label>
          <input
            id="member-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 또는 이메일로 찾기"
            className="min-w-0 flex-1 rounded-sm border border-rule-strong bg-canvas px-2.5 py-1.5 text-[13px]"
          />
          <button
            type="button"
            onClick={() => void refreshMembers()}
            className="rounded-sm border border-rule-strong bg-canvas px-2.5 py-1.5 text-[12px] font-medium text-ink hover:border-ink"
          >
            {loadingMembers ? "새로고침 중…" : "새로고침"}
          </button>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-sm border border-dashed border-rule-strong px-4 py-8 text-center text-[13px] text-ink-muted">
            {members.length === 0
              ? "아직 로그인한 회원이 없습니다."
              : "검색 결과가 없습니다."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-rule">
            <table className="w-full min-w-[46rem] border-collapse text-left">
              <thead>
                <tr className="bg-ink text-white">
                  <th scope="col" className="px-3 py-2 text-[11px] font-semibold">회원</th>
                  <th scope="col" className="px-3 py-2 text-[11px] font-semibold">권한</th>
                  <th scope="col" className="px-3 py-2 text-[11px] font-semibold">상태</th>
                  <th scope="col" className="px-3 py-2 text-[11px] font-semibold">가입</th>
                  <th scope="col" className="px-3 py-2 text-[11px] font-semibold">최근 로그인</th>
                  <th scope="col" className="px-3 py-2 text-center text-[11px] font-semibold">방문</th>
                  <th scope="col" className="px-3 py-2 text-[11px] font-semibold">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {filtered.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    isSelf={m.id === session.member.id}
                    editingNote={editingNote === m.id}
                    noteDraft={noteDraft}
                    onNoteDraft={setNoteDraft}
                    onEditNote={(open) => {
                      setEditingNote(open ? m.id : null);
                      setNoteDraft(open ? (m.note ?? "") : "");
                    }}
                    onSaveNote={async () => {
                      await setNote(m.id, noteDraft);
                      setEditingNote(null);
                    }}
                    onRole={(role) => void setRole(m.id, role)}
                    onToggleStatus={() =>
                      void setStatus(m.id, m.status === "active" ? "suspended" : "active")
                    }
                    onRemove={() => void removeMember(m.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-ink-faint">
          소유자 계정은 권한을 내리거나 정지·삭제할 수 없습니다. 관리자 전원이 서로 권한을 내려
          아무도 들어갈 수 없게 되는 상황을 막기 위한 것입니다.
        </p>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div
      className={`rounded-sm border px-3 py-2.5 ${tone === "warn" ? "border-warn-soft bg-warn-soft" : "border-rule bg-canvas"}`}
    >
      <p className={`text-[11px] font-semibold ${tone === "warn" ? "text-warn" : "text-ink-faint"}`}>
        {label}
      </p>
      <p className={`tabular text-2xl leading-none font-bold ${tone === "warn" ? "text-warn" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  editingNote,
  noteDraft,
  onNoteDraft,
  onEditNote,
  onSaveNote,
  onRole,
  onToggleStatus,
  onRemove,
}: {
  member: Member;
  isSelf: boolean;
  editingNote: boolean;
  noteDraft: string;
  onNoteDraft: (v: string) => void;
  onEditNote: (open: boolean) => void;
  onSaveNote: () => void;
  onRole: (role: MemberRole) => void;
  onToggleStatus: () => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const locked = !canChangeRole(member);

  return (
    <>
      <tr className="align-top odd:bg-canvas even:bg-surface">
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            {member.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.picture} alt="" className="size-7 shrink-0 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
                {member.name.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">
                {member.name}
                {isSelf ? <span className="ml-1 text-[11px] text-ink-faint">(나)</span> : null}
              </p>
              <p className="truncate text-[11px] text-ink-muted">{member.email}</p>
            </div>
          </div>
        </td>

        <td className="px-3 py-2">
          {locked ? (
            <span className="rounded-sm bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-white" title={ROLE_NOTE[member.role]}>
              {ROLE_LABEL[member.role]}
            </span>
          ) : (
            <select
              value={member.role}
              onChange={(e) => onRole(e.target.value as MemberRole)}
              aria-label={`${member.name} 권한`}
              className="rounded-sm border border-rule-strong bg-canvas px-1.5 py-1 text-[12px]"
            >
              <option value="member">{ROLE_LABEL.member}</option>
              <option value="admin">{ROLE_LABEL.admin}</option>
            </select>
          )}
        </td>

        <td className="px-3 py-2">
          <span
            className={`rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${
              member.status === "active" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"
            }`}
          >
            {STATUS_LABEL[member.status]}
          </span>
        </td>

        <td className="tabular px-3 py-2 text-[12px] text-ink-muted">{member.joinedAt.slice(0, 10)}</td>
        <td className="tabular px-3 py-2 text-[12px] text-ink-muted">
          {member.lastSeenAt.slice(0, 10)}
        </td>
        <td className="tabular px-3 py-2 text-center text-[12px] text-ink-muted">{member.visits}</td>

        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => onEditNote(!editingNote)}
              className="rounded-sm border border-rule-strong px-1.5 py-0.5 text-[11px] text-ink-muted hover:border-ink hover:text-ink"
            >
              메모
            </button>
            {!locked ? (
              <>
                <button
                  type="button"
                  onClick={onToggleStatus}
                  className="rounded-sm border border-rule-strong px-1.5 py-0.5 text-[11px] text-ink-muted hover:border-warn hover:text-warn"
                >
                  {member.status === "active" ? "정지" : "해제"}
                </button>
                {confirming ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onRemove}
                      className="rounded-sm bg-danger px-1.5 py-0.5 text-[11px] font-medium text-white"
                    >
                      정말 삭제
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="text-[11px] text-ink-faint hover:text-ink"
                    >
                      취소
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="rounded-sm border border-rule-strong px-1.5 py-0.5 text-[11px] text-ink-muted hover:border-danger hover:text-danger"
                  >
                    삭제
                  </button>
                )}
              </>
            ) : null}
          </div>
        </td>
      </tr>

      {editingNote ? (
        <tr className="bg-surface-sunken">
          <td colSpan={7} className="px-3 py-2.5">
            <label htmlFor={`note-${member.id}`} className="text-[11px] font-semibold text-ink">
              운영 메모 — {member.name}
            </label>
            <p className="text-[11px] text-ink-faint">
              운영 기록을 남기는 칸입니다. 사람에 대한 평가를 적는 곳이 아닙니다.
            </p>
            <textarea
              id={`note-${member.id}`}
              value={noteDraft}
              onChange={(e) => onNoteDraft(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1 w-full rounded-sm border border-rule-strong bg-canvas px-2 py-1.5 text-[12px]"
            />
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={onSaveNote}
                className="rounded-sm bg-ink px-2.5 py-1 text-[12px] font-medium text-white"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => onEditNote(false)}
                className="rounded-sm border border-rule-strong px-2.5 py-1 text-[12px] text-ink-muted hover:border-ink hover:text-ink"
              >
                닫기
              </button>
            </div>
          </td>
        </tr>
      ) : (
        member.note && (
          <tr className="bg-surface">
            <td colSpan={7} className="px-3 pb-2 text-[11px] text-ink-muted">
              메모: {member.note}
            </td>
          </tr>
        )
      )}
    </>
  );
}
