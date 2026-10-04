"use client";

import { useState } from "react";
import type { UrlImportPreviewData, UrlImportPreviewResult } from "@/lib/activity-import/preview";
import type { DateCandidate, DateRole } from "@/lib/activity-import/extract";
import { DATE_RANGE_ISSUE_LABEL } from "@/lib/activity-import/verify";

export type DateTargetField = "applyStartAt" | "applyEndAt" | "activityStartAt" | "activityEndAt";

export type UrlImportApplyAction =
  | { kind: "title"; value: string }
  | { kind: "orgName"; value: string }
  | { kind: "description"; value: string }
  | { kind: "eligibility"; value: string }
  | { kind: "sourceUrl"; value: string; resolved: string }
  | { kind: "date"; field: DateTargetField; iso: string; raw: string };

const DATE_FIELD_LABEL: Record<DateTargetField, string> = {
  applyStartAt: "접수 시작",
  applyEndAt: "접수 마감",
  activityStartAt: "활동 시작",
  activityEndAt: "활동 종료",
};

const ROLE_DEFAULT_FIELD: Record<DateRole, DateTargetField | null> = {
  apply_start: "applyStartAt",
  apply_end: "applyEndAt",
  unknown: null,
};

export interface UrlImportPanelProps {
  previewAction: (url: string) => Promise<UrlImportPreviewResult>;
  onApply: (action: UrlImportApplyAction) => void;
  /** 이 화면에서 지원하는 적용 대상 — 지원하지 않는 항목의 "적용" 버튼은 숨긴다. */
  enabledFields: ReadonlyArray<UrlImportApplyAction["kind"]>;
  /** 중복 후보를 눌렀을 때 이동할 관리자 경로(선택). 없으면 그냥 텍스트로만 보여준다. */
  duplicateLinkBase?: string;
}

function DateCandidateRow({
  candidate,
  enabled,
  onApply,
}: {
  candidate: DateCandidate;
  enabled: boolean;
  onApply: (field: DateTargetField) => void;
}) {
  const defaultField = ROLE_DEFAULT_FIELD[candidate.role];
  const [field, setField] = useState<DateTargetField>(defaultField ?? "applyEndAt");

  return (
    <li className="flex flex-col gap-1 rounded-md border border-[var(--color-border)] p-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="rounded bg-[var(--color-brand-50)] px-1.5 py-0.5 text-xs font-medium text-[var(--color-brand-700)]">
          원문에서 확인됨
        </span>
        {candidate.yearInferred && (
          <span className="rounded bg-[var(--color-warning-bg,#fff3cd)] px-1.5 py-0.5 text-xs text-[var(--color-warning,#8a6500)]">
            연도 추정됨 — 확인 필요
          </span>
        )}
        <span className="font-mono">{candidate.raw}</span>
      </div>
      <p className="text-xs text-[var(--color-muted-foreground)]">근거: “{candidate.context}”</p>
      {enabled && candidate.iso && (
        <div className="flex items-center gap-2">
          <select
            value={field}
            onChange={(e) => setField(e.target.value as DateTargetField)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
          >
            {(Object.keys(DATE_FIELD_LABEL) as DateTargetField[]).map((f) => (
              <option key={f} value={f}>
                {DATE_FIELD_LABEL[f]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onApply(field)}
            className="rounded-md bg-[var(--color-brand-600)] px-2 py-1 text-xs font-medium text-white"
          >
            이 값으로 적용
          </button>
        </div>
      )}
    </li>
  );
}

export function UrlImportPanel({ previewAction, onApply, enabledFields, duplicateLinkBase }: UrlImportPanelProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UrlImportPreviewData | null>(null);

  const isEnabled = (kind: UrlImportApplyAction["kind"]) => enabledFields.includes(kind);

  async function handleFetch() {
    if (!url.trim()) {
      setError("URL을 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    const response = await previewAction(url.trim());
    setLoading(false);
    if (!response.ok) {
      setError(response.error);
      setResult(null);
      return;
    }
    setResult(response.data);
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted,#f8f9fb)] p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          type="url"
          placeholder="https://notice.example.org/..."
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleFetch}
          disabled={loading}
          className="rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "가져오는 중..." : "URL로 가져오기"}
        </button>
      </div>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        주최기관의 공식 공고 페이지 주소를 붙여넣으면 제목·날짜 후보를 찾아줘요. 날짜는 원문에
        실제로 있는 문자열만 후보로 보여주며, 저장 전까지는 아무것도 자동으로 등록되지 않아요.
      </p>

      {error && (
        <p role="alert" className="rounded-md bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
          {result.finalUrl !== result.normalizedUrl && (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              리다이렉트된 최종 주소: <span className="font-mono">{result.finalUrl}</span>
            </p>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">추출된 정보</h3>
            <SuggestionRow
              label="제목"
              value={result.suggestedTitle}
              show={isEnabled("title")}
              onApply={() => result.suggestedTitle && onApply({ kind: "title", value: result.suggestedTitle })}
            />
            <SuggestionRow
              label="주최기관"
              value={result.suggestedOrgName}
              show={isEnabled("orgName")}
              onApply={() => result.suggestedOrgName && onApply({ kind: "orgName", value: result.suggestedOrgName })}
            />
            <SuggestionRow
              label="설명"
              value={result.suggestedDescription}
              show={isEnabled("description")}
              onApply={() => result.suggestedDescription && onApply({ kind: "description", value: result.suggestedDescription })}
            />
            {isEnabled("eligibility") && result.suggestedEligibility && (
              <SuggestionRow
                label="자격 요약(AI 제안 — 검토 필요)"
                value={result.suggestedEligibility}
                show
                onApply={() => onApply({ kind: "eligibility", value: result.suggestedEligibility! })}
              />
            )}
            {result.suggestedTags.length > 0 && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                태그 후보(AI 제안): {result.suggestedTags.join(", ")}
              </p>
            )}
            {isEnabled("sourceUrl") && (
              <button
                type="button"
                onClick={() => onApply({ kind: "sourceUrl", value: result.normalizedUrl, resolved: result.finalUrl })}
                className="self-start rounded-md border border-[var(--color-brand-600)] px-2 py-1 text-xs font-medium text-[var(--color-brand-700)]"
              >
                원문 링크 적용
              </button>
            )}
          </div>

          {result.rangeIssues.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md bg-[var(--color-warning-bg,#fff3cd)] p-2 text-xs text-[var(--color-warning,#8a6500)]">
              {result.rangeIssues.map((issue) => (
                <li key={issue}>{DATE_RANGE_ISSUE_LABEL[issue]}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">날짜 후보</h3>
            {result.dateCandidates.length === 0 ? (
              <p className="text-xs text-[var(--color-muted-foreground)]">원문에서 날짜 형식을 찾지 못했어요. 직접 입력해 주세요.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {result.dateCandidates.map((candidate, index) => (
                  <DateCandidateRow
                    key={`${candidate.index}-${index}`}
                    candidate={candidate}
                    enabled={isEnabled("date")}
                    onApply={(field) => candidate.iso && onApply({ kind: "date", field, iso: candidate.iso, raw: candidate.raw })}
                  />
                ))}
              </ul>
            )}
          </div>

          {result.duplicates.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md bg-[var(--color-danger-bg)] p-2 text-xs text-[var(--color-danger)]">
              <p className="font-medium">비슷한 활동이 이미 있어요(중복 후보):</p>
              <ul className="flex flex-col gap-1">
                {result.duplicates.map((dup) => (
                  <li key={dup.id}>
                    {duplicateLinkBase ? (
                      <a href={`${duplicateLinkBase}/${dup.id}/edit`} className="underline" target="_blank" rel="noreferrer">
                        {dup.title} {dup.orgName ? `(${dup.orgName})` : ""} — 일치: {dup.matchedBy.join(", ")}
                      </a>
                    ) : (
                      <span>
                        {dup.title} {dup.orgName ? `(${dup.orgName})` : ""} — 일치: {dup.matchedBy.join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SuggestionRow({
  label,
  value,
  show,
  onApply,
}: {
  label: string;
  value: string | null;
  show: boolean;
  onApply: () => void;
}) {
  if (!show || !value) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-[var(--color-muted-foreground)]">
        {label}: <span className="text-[var(--color-foreground)]">{value}</span>
      </span>
      <button type="button" onClick={onApply} className="shrink-0 rounded border border-[var(--color-border)] px-2 py-0.5 text-xs">
        적용
      </button>
    </div>
  );
}
