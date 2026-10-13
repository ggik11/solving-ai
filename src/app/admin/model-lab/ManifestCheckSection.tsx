"use client";

import { useState } from "react";
import {
  computeClassBalance,
  findCrossSplitLeaks,
  findInvalidLabels,
  findOrgConcentration,
  parseManifestCsv,
  type ClassBalanceRow,
  type OrgConcentration,
  type SplitLeak,
} from "@/lib/modelLab/manifest";

/** 6.2 데이터 목록 검사(가이드 6.2). datasets/manifest.csv 양식을 올리면 분할 누수·분야 개수
 * 불균형·기관 편중·라벨 유효성을 바로 확인한다. */
export function ManifestCheckSection({ knownClassIds }: { knownClassIds: string[] }) {
  const [parseErrors, setParseErrors] = useState<{ line: number; message: string }[]>([]);
  const [leaks, setLeaks] = useState<SplitLeak[] | null>(null);
  const [balance, setBalance] = useState<ClassBalanceRow[] | null>(null);
  const [concentration, setConcentration] = useState<OrgConcentration[] | null>(null);
  const [invalidLabels, setInvalidLabels] = useState<{ label: string }[] | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const { rows, errors } = parseManifestCsv(text);
    setParseErrors(errors);
    setRowCount(rows.length);
    setLeaks(findCrossSplitLeaks(rows));
    setBalance(computeClassBalance(rows));
    setConcentration(findOrgConcentration(rows));
    setInvalidLabels(knownClassIds.length > 0 ? findInvalidLabels(rows, knownClassIds) : null);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">6.2 데이터 목록 검사</h2>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        datasets/manifest.csv 양식을 올리면 분할 누수·분야 개수 불균형·기관 편중·라벨 유효성을 확인해요.
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        manifest.csv 선택
        <input type="file" accept=".csv,text/csv" onChange={handleFile} className="text-sm font-normal" />
      </label>

      {parseErrors.length > 0 && (
        <div className="text-xs text-[var(--color-danger)]">
          <p className="font-medium">형식 오류 ({parseErrors.length}건)</p>
          <ul className="list-inside list-disc">
            {parseErrors.slice(0, 20).map((e, i) => (
              <li key={i}>
                {e.line}행: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rowCount != null && (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-xs text-[var(--color-muted-foreground)]">유효한 행 {rowCount}개를 읽었어요.</p>

          <div>
            <p className="mb-1 text-xs font-medium">같은 event_id·series_id가 여러 split에 섞인 경우</p>
            {leaks && leaks.length > 0 ? (
              <ul className="list-inside list-disc text-xs text-[var(--color-danger)]">
                {leaks.map((l) => (
                  <li key={`${l.kind}-${l.key}`}>
                    {l.kind}={l.key}: {l.splits.join(", ")}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--color-muted-foreground)]">없음</p>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">분야별 개수(ood 제외)</p>
            <ul className="text-xs text-[var(--color-muted-foreground)]">
              {(balance ?? []).map((b) => (
                <li key={b.label}>
                  {b.label}: {b.count}건
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">기관 편중(70% 이상)</p>
            {concentration && concentration.length > 0 ? (
              <ul className="list-inside list-disc text-xs text-[var(--color-danger)]">
                {concentration.map((c) => (
                  <li key={c.label}>
                    {c.label}: {c.dominantOrg}이 {Math.round(c.share * 100)}%
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--color-muted-foreground)]">없음</p>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">라벨이 모델 클래스 ID인지</p>
            {invalidLabels == null ? (
              <p className="text-xs text-[var(--color-muted-foreground)]">모델 클래스 연결표가 아직 없어 건너뜀</p>
            ) : invalidLabels.length > 0 ? (
              <ul className="list-inside list-disc text-xs text-[var(--color-danger)]">
                {[...new Set(invalidLabels.map((i) => i.label))].map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--color-muted-foreground)]">모두 유효함</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
