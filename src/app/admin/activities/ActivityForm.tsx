"use client";

import { useState } from "react";
import { createActivity, updateActivity, type ActivityFormInput, type FieldSelectionInput } from "./actions";
import { previewActivityImportUrlAction } from "./import-url-actions";
import type { Activity } from "@/lib/supabase/types";
import { UrlImportPanel, type UrlImportApplyAction } from "@/components/UrlImportPanel";
import { PosterClassifierPanel, type InterestLabel } from "@/components/PosterClassifierPanel";
import { FieldPicker } from "@/components/FieldPicker";
import { applyCandidateSelection, resolveSecondarySelection } from "@/lib/poster/fieldSelection";
import { toPendingPosterAnalysis, type PosterAnalysisResult } from "@/lib/poster/analyze";
import type { PosterClassifierConfig } from "@/lib/poster/classifier";

function toDateTimeLocalFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateTimeLocal(iso: string | null): string {
  return iso ? toDateTimeLocalFromIso(iso) : "";
}

export function ActivityForm({
  mode,
  activityId,
  activityTypes,
  majors,
  initial,
  posterConfig,
  interests,
  onFieldCandidateAccept,
}: {
  mode: "create" | "edit";
  activityId?: string;
  activityTypes: { id: string; name: string }[];
  majors: { id: string; name: string; department: string }[];
  initial?: Activity;
  /** 포스터 분류 설정(가이드 3.7). 없으면 패널이 기본값을 쓴다. */
  posterConfig?: PosterClassifierConfig;
  interests?: InterestLabel[];
  /** "confirm" 모드(수정)에서 분야 후보 칩을 누르면 호출된다 — 수정 화면이 ActivityFieldsManager로 넘긴다. */
  onFieldCandidateAccept?: (interestId: string, analysisId: string | null) => void;
}) {
  const [form, setForm] = useState<ActivityFormInput>({
    title: initial?.title ?? "",
    summary: initial?.summary ?? "",
    description: initial?.description ?? "",
    orgName: initial?.org_name ?? "",
    sourceUrl: initial?.source_url ?? "",
    locationType: initial?.location_type ?? "offline",
    region: initial?.region ?? "",
    activityTypeId: initial?.activity_type_id ?? "",
    eligibility: initial?.eligibility ?? "",
    participationMode: initial?.participation_mode ?? "both",
    teamMinSize: initial?.team_min_size != null ? String(initial.team_min_size) : "",
    teamMaxSize: initial?.team_max_size != null ? String(initial.team_max_size) : "",
    benefit: initial?.benefit ?? "",
    applyStartAt: toDateTimeLocal(initial?.apply_start_at ?? null),
    applyEndAt: toDateTimeLocal(initial?.apply_end_at ?? null),
    activityStartAt: toDateTimeLocal(initial?.activity_start_at ?? null),
    activityEndAt: toDateTimeLocal(initial?.activity_end_at ?? null),
    status: initial?.status ?? "draft",
    sourceUrlResolved: initial?.source_url_resolved ?? "",
    applyEndAtEvidence: initial?.apply_end_at_evidence ?? "",
    weeklyHours: initial?.weekly_hours != null ? String(initial.weekly_hours) : "",
    eligibilityScope: initial?.eligibility_scope ?? "unknown",
    eligibleMajorIds: initial?.eligible_major_ids ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // "create" 모드 전용 — 활동이 아직 없어 PosterClassifierPanel이 바로 저장하지 못하는 분석
  // 결과와 분야 선택을 들고 있다가, 저장 버튼을 누르는 순간 활동 생성과 한 번에 보낸다(가이드
  // 5.4 5번) — 그래야 등록 화면에서 분석한 결과가 저장 시 사라지지 않는다.
  const [primaryInterestId, setPrimaryInterestId] = useState("");
  const [secondaryInterestIds, setSecondaryInterestIds] = useState<string[]>([]);
  const [acceptedCandidateIds, setAcceptedCandidateIds] = useState<string[]>([]);
  const [pendingAnalysis, setPendingAnalysis] = useState<PosterAnalysisResult | null>(null);

  function set<K extends keyof ActivityFormInput>(key: K, value: ActivityFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleAcceptCandidate(interestId: string) {
    const next = applyCandidateSelection({ primary: primaryInterestId || null, secondary: secondaryInterestIds }, interestId);
    setPrimaryInterestId(next.primary ?? "");
    setSecondaryInterestIds(next.secondary);
    setAcceptedCandidateIds((prev) => (prev.includes(interestId) ? prev : [...prev, interestId]));
  }

  function handlePrimaryChange(interestId: string) {
    setAcceptedCandidateIds((prev) => prev.filter((id) => id !== primaryInterestId));
    setPrimaryInterestId(interestId);
  }

  function handleToggleSecondary(interestId: string) {
    setSecondaryInterestIds((prev) => (prev.includes(interestId) ? prev.filter((id) => id !== interestId) : [...prev, interestId]));
    setAcceptedCandidateIds((prev) => prev.filter((id) => id !== interestId));
  }

  /** 접수 마감을 손으로 바꾸면 더 이상 "원문에서 확인된 값"이 아니므로 근거를 비운다. */
  function handleApplyEndAtInputChange(value: string) {
    setForm((prev) => ({ ...prev, applyEndAt: value, applyEndAtEvidence: "" }));
  }

  function handleImportApply(action: UrlImportApplyAction) {
    switch (action.kind) {
      case "title":
        set("title", action.value);
        break;
      case "orgName":
        set("orgName", action.value);
        break;
      case "description":
        set("description", action.value);
        break;
      case "eligibility":
        set("eligibility", action.value);
        break;
      case "sourceUrl":
        setForm((prev) => ({ ...prev, sourceUrl: action.value, sourceUrlResolved: action.resolved }));
        break;
      case "date": {
        const local = toDateTimeLocalFromIso(action.iso);
        if (action.field === "applyEndAt") {
          setForm((prev) => ({ ...prev, applyEndAt: local, applyEndAtEvidence: action.raw }));
        } else {
          set(action.field, local);
        }
        break;
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    let result;
    if (mode === "create") {
      const secondary = resolveSecondarySelection(primaryInterestId || null, secondaryInterestIds);
      const fields: FieldSelectionInput = {
        primaryInterestId: primaryInterestId || null,
        secondaryInterestIds: secondary,
        acceptedCandidateInterestIds: acceptedCandidateIds,
        posterAnalysis: pendingAnalysis && !pendingAnalysis.fromCache ? toPendingPosterAnalysis(pendingAnalysis) : null,
      };
      result = await createActivity(form, fields);
    } else {
      result = await updateActivity(activityId!, form);
    }
    setSubmitting(false);
    if (result && !result.ok) {
      setError(result.error ?? "저장에 실패했습니다.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <UrlImportPanel
        previewAction={previewActivityImportUrlAction}
        onApply={handleImportApply}
        enabledFields={["title", "orgName", "description", "eligibility", "sourceUrl", "date"]}
        duplicateLinkBase="/admin/activities"
      />
      <PosterClassifierPanel
        variant={mode === "edit" ? "confirm" : "preview"}
        activityId={activityId ?? null}
        config={posterConfig}
        interests={interests ?? []}
        onAcceptCandidate={mode === "edit" ? onFieldCandidateAccept : (interestId) => handleAcceptCandidate(interestId)}
        onAnalyzed={mode === "create" ? setPendingAnalysis : undefined}
        candidateHint={mode === "create" ? "후보를 누르면 바로 아래 분야 선택 칸에 들어가요 — 등록 버튼을 눌러야 확정돼요." : undefined}
      />
      {mode === "create" && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <h3 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">분야 선택</h3>
          <FieldPicker
            interests={interests ?? []}
            primary={primaryInterestId}
            onPrimaryChange={handlePrimaryChange}
            secondary={secondaryInterestIds}
            onToggleSecondary={handleToggleSecondary}
          />
        </div>
      )}
      <Field label="제목 *">
        <input value={form.title} onChange={(e) => set("title", e.target.value)} required className={inputClass} />
      </Field>
      <Field label="한 줄 요약">
        <input value={form.summary} onChange={(e) => set("summary", e.target.value)} className={inputClass} />
      </Field>
      <Field label="설명">
        <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="주최기관">
          <input value={form.orgName} onChange={(e) => set("orgName", e.target.value)} className={inputClass} />
        </Field>
        <Field label="원문 URL">
          <input type="url" value={form.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} className={inputClass} />
        </Field>
        <Field label="진행 방식">
          <select value={form.locationType} onChange={(e) => set("locationType", e.target.value as ActivityFormInput["locationType"])} className={inputClass}>
            <option value="online">온라인</option>
            <option value="offline">오프라인</option>
            <option value="hybrid">혼합</option>
          </select>
        </Field>
        <Field label="지역">
          <input value={form.region} onChange={(e) => set("region", e.target.value)} className={inputClass} />
        </Field>
        <Field label="유형">
          <select value={form.activityTypeId} onChange={(e) => set("activityTypeId", e.target.value)} className={inputClass}>
            <option value="">미분류</option>
            {activityTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="참여 형태">
          <select value={form.participationMode} onChange={(e) => set("participationMode", e.target.value as ActivityFormInput["participationMode"])} className={inputClass}>
            <option value="solo">개인</option>
            <option value="team">팀</option>
            <option value="both">개인·팀 모두</option>
          </select>
        </Field>
        <Field label="팀 최소 인원">
          <input type="number" min={1} value={form.teamMinSize} onChange={(e) => set("teamMinSize", e.target.value)} className={inputClass} />
        </Field>
        <Field label="팀 최대 인원">
          <input type="number" min={1} value={form.teamMaxSize} onChange={(e) => set("teamMaxSize", e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="지원 자격 (원문 조건 문장)">
        <textarea value={form.eligibility} onChange={(e) => set("eligibility", e.target.value)} rows={2} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="지원 자격 범위">
          <select
            value={form.eligibilityScope}
            onChange={(e) => {
              const scope = e.target.value as ActivityFormInput["eligibilityScope"];
              setForm((prev) => ({ ...prev, eligibilityScope: scope, eligibleMajorIds: scope === "restricted" ? prev.eligibleMajorIds : [] }));
            }}
            className={inputClass}
          >
            <option value="unknown">확인 필요 (기본)</option>
            <option value="any">전공 무관</option>
            <option value="restricted">지정 전공만</option>
          </select>
        </Field>
        <Field label="주당 예상 투입 시간 (원문에 있을 때만)">
          <input
            type="number"
            min={0}
            value={form.weeklyHours}
            onChange={(e) => set("weeklyHours", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      {form.eligibilityScope === "restricted" && (
        <Field label="지정 전공 (복수 선택)">
          <select
            multiple
            value={form.eligibleMajorIds}
            onChange={(e) => set("eligibleMajorIds", Array.from(e.target.selectedOptions, (o) => o.value))}
            className={`${inputClass} h-32`}
          >
            {majors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.department})
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="비용·혜택">
        <input value={form.benefit} onChange={(e) => set("benefit", e.target.value)} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="접수 시작">
          <input type="datetime-local" value={form.applyStartAt} onChange={(e) => set("applyStartAt", e.target.value)} className={inputClass} />
        </Field>
        <Field label="접수 마감">
          <input
            type="datetime-local"
            value={form.applyEndAt}
            onChange={(e) => handleApplyEndAtInputChange(e.target.value)}
            className={inputClass}
          />
          {form.applyEndAt && (
            form.applyEndAtEvidence ? (
              <span className="text-xs text-[var(--color-brand-700)]">원문에서 확인됨: “{form.applyEndAtEvidence}”</span>
            ) : (
              <span className="text-xs text-[var(--color-muted-foreground)]">직접 입력됨 — 원문 확인 필요</span>
            )
          )}
        </Field>
        <Field label="활동 시작">
          <input type="datetime-local" value={form.activityStartAt} onChange={(e) => set("activityStartAt", e.target.value)} className={inputClass} />
        </Field>
        <Field label="활동 종료">
          <input type="datetime-local" value={form.activityEndAt} onChange={(e) => set("activityEndAt", e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="공개 상태">
        <select value={form.status} onChange={(e) => set("status", e.target.value as ActivityFormInput["status"])} className={inputClass}>
          <option value="draft">비공개(draft)</option>
          <option value="published">공개</option>
          <option value="closed">마감</option>
          <option value="archived">보관</option>
        </select>
      </Field>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[var(--color-brand-600)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {submitting ? "저장 중..." : mode === "create" ? "등록" : "수정 저장"}
      </button>
    </form>
  );
}

const inputClass = "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
