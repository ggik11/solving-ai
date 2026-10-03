"use client";

import { useState } from "react";
import {
  parseAndValidateActivitiesCsv,
  duplicateKey,
  ACTIVITY_CSV_COLUMNS,
  type ActivityCsvRow,
} from "@/lib/csv/activities";
import { bulkImportActivities, fetchExistingActivityKeys, type BulkImportRow } from "../actions";
import { Badge } from "@/components/Badge";

type Phase = "pick" | "preview" | "done";

export function CsvImportClient() {
  const [phase, setPhase] = useState<Phase>("pick");
  const [rows, setRows] = useState<ActivityCsvRow[]>([]);
  const [included, setIncluded] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [insertedCount, setInsertedCount] = useState(0);

  async function handleFile(file: File) {
    setError(null);
    const text = await file.text();
    const existing = await fetchExistingActivityKeys();
    const existingKeys = new Set(existing.map((e) => duplicateKey(e.title, e.orgName)));
    const parsed = parseAndValidateActivitiesCsv(text, { existingKeys });

    if (parsed.length === 0) {
      setError("CSV에서 읽을 수 있는 행이 없습니다. 헤더와 데이터를 확인해 주세요.");
      return;
    }

    setRows(parsed);
    const initialIncluded: Record<number, boolean> = {};
    parsed.forEach((row) => {
      initialIncluded[row.rowNumber] = row.errors.length === 0 && !row.isDuplicate;
    });
    setIncluded(initialIncluded);
    setPhase("preview");
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);

    const toImport: BulkImportRow[] = rows
      .filter((row) => row.errors.length === 0 && included[row.rowNumber])
      .map((row) => ({
        title: row.title,
        summary: row.summary,
        orgName: row.orgName,
        sourceUrl: row.sourceUrl,
        locationType: row.locationType,
        region: row.region,
        activityTypeName: row.activityTypeName,
        eligibility: row.eligibility,
        participationMode: row.participationMode,
        teamMinSize: row.teamMinSize,
        teamMaxSize: row.teamMaxSize,
        benefit: row.benefit,
        applyStartAt: row.applyStartAt,
        applyEndAt: row.applyEndAt,
        activityStartAt: row.activityStartAt,
        activityEndAt: row.activityEndAt,
      }));

    const result = await bulkImportActivities(toImport);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInsertedCount(result.inserted);
    setPhase("done");
  }

  if (phase === "pick") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          CSV 헤더: <code className="break-all">{ACTIVITY_CSV_COLUMNS.join(", ")}</code>
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
          className="text-sm"
        />
        {error && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-bg)] p-4 text-sm text-[var(--color-success)]">
        {insertedCount}건을 비공개(draft) 상태로 등록했습니다. 활동 관리 화면에서 검토 후 공개로 전환해 주세요.
      </div>
    );
  }

  const importableCount = rows.filter((r) => r.errors.length === 0 && included[r.rowNumber]).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        총 {rows.length}행 — 가져올 행 <strong>{importableCount}</strong>건 선택됨
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.rowNumber}
            className={`rounded-lg border p-3 text-sm ${
              row.errors.length > 0 ? "border-[var(--color-danger)]/40 bg-[var(--color-danger-bg)]" : "border-[var(--color-border)] bg-[var(--color-surface)]"
            }`}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  disabled={row.errors.length > 0}
                  checked={Boolean(included[row.rowNumber])}
                  onChange={(e) => setIncluded((prev) => ({ ...prev, [row.rowNumber]: e.target.checked }))}
                />
                #{row.rowNumber} {row.title || "(제목 없음)"}
              </label>
              <div className="flex gap-1">
                {row.isDuplicate && <Badge variant="warning">중복 후보</Badge>}
                {row.errors.length > 0 && <Badge variant="danger">오류 {row.errors.length}건</Badge>}
              </div>
            </div>
            {row.errors.length > 0 && (
              <ul className="list-inside list-disc text-[var(--color-danger)]">
                {row.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            {row.warnings.length > 0 && (
              <ul className="list-inside list-disc text-[var(--color-muted-foreground)]">
                {row.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPhase("pick")}
          className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm"
        >
          다시 선택
        </button>
        <button
          type="button"
          disabled={submitting || importableCount === 0}
          onClick={handleConfirm}
          className="rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {submitting ? "등록 중..." : `선택한 ${importableCount}건 등록`}
        </button>
      </div>
    </div>
  );
}
