"use client";

import { useState } from "react";
import {
  computeComparisonReport,
  filterTestSplitFiles,
  type ComparisonReport,
  type ComparisonRow,
  type ManifestSplitLookup,
} from "@/lib/modelLab/postprocessCompare";
import { parseManifestCsv } from "@/lib/modelLab/manifest";
import { downloadTextFile, basename } from "@/lib/modelLab/download";
import { PREPROCESS_VERSION, computeSquarePlacement, renderToSquareCanvas } from "@/lib/poster/preprocess";
import { teachableMachineLoader, type PosterModelLoader } from "@/lib/poster/modelLoader";
import type { PosterClassifierConfig } from "@/lib/poster/classifier";
import { recognizeImageText, terminateOcrWorker } from "@/lib/poster/ocr";
import { classifyByKeywords, KEYWORDS_VERSION } from "@/lib/poster/keywordRules";
import { classifyByEmbedding, loadEmbeddingReference, EMBED_VERSION } from "@/lib/poster/embeddingClassifier";
import { POSTPROCESS_VERSION } from "@/lib/poster/combine";
import type { VariantReport } from "@/lib/modelLab/postprocessCompare";

const VARIANT_LABELS = { A: "A. TM만", B: "B. TM+키워드", C: "C. TM+임베딩", D: "D. TM+키워드+임베딩+합의" } as const;
const VARIANT_KEYS = ["A", "B", "C", "D"] as const;

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/**
 * 포스터 2차 후처리 P5(가이드 12장) — "단계별 비교". test split 이미지로 TM만(A)/TM+키워드(B)/
 * TM+임베딩(C)/TM+키워드+임베딩+합의(D) 네 방식을 같은 신호(TM·OCR·키워드·임베딩을 이미지마다
 * 한 번씩만 계산)로 한 번에 비교한다. keywordRules/embeddingClassifier/combine의 규칙·가중치·
 * 사전·참조 파일은 바꾸지 않는다 — test 사진은 한 번만 평가하고 결과를 보고 다시 고치지 않는다.
 */
export function PostprocessComparisonSection({
  posterConfig,
  loader = teachableMachineLoader,
}: {
  posterConfig: PosterClassifierConfig;
  loader?: PosterModelLoader;
}) {
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [trainWarnings, setTrainWarnings] = useState<string[]>([]);
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [modelVersion, setModelVersion] = useState("unknown");

  async function handleRun() {
    if (!manifestFile || imageFiles.length === 0) return;
    const confirmed = window.confirm(
      "평가용 사진은 한 번만 평가합니다. 결과를 보고 규칙을 바꾸지 않습니다. 계속할까요?"
    );
    if (!confirmed) return;

    setStatus("running");
    setProgress(0);
    setNotice(null);
    setTrainWarnings([]);
    setReport(null);

    const { rows: manifestRows, errors } = parseManifestCsv(await manifestFile.text());
    const manifestByFilename = new Map<string, ManifestSplitLookup>();
    for (const row of manifestRows) {
      manifestByFilename.set(basename(row.imagePath), { split: row.split, label: row.label, orgName: row.orgName });
    }
    const trainOrgNames = manifestRows.filter((r) => r.split === "train" && r.orgName).map((r) => r.orgName as string);

    const { testFilenames, trainWarnings: trainWarn } = filterTestSplitFiles(imageFiles.map((f) => f.name), manifestByFilename);
    setTrainWarnings(trainWarn);

    const byFilename = new Map(imageFiles.map((f) => [f.name, f]));
    const testFiles = testFilenames.map((name) => byFilename.get(name)).filter((f): f is File => !!f);

    let model: Awaited<ReturnType<PosterModelLoader["load"]>> | null = null;
    try {
      model = await loader.load(posterConfig.modelPath);
      setModelVersion(model.modelVersion);
    } catch {
      setModelVersion("unknown");
    }

    const embeddingReference = await loadEmbeddingReference();

    const comparisonRows: ComparisonRow[] = [];
    for (let i = 0; i < testFiles.length; i++) {
      const file = testFiles[i];
      const manifestRow = manifestByFilename.get(file.name);
      if (!manifestRow) continue;

      let tmScores: ComparisonRow["tmScores"] = [];
      if (model) {
        try {
          const bitmap = await createImageBitmap(file);
          const canvas = renderToSquareCanvas(bitmap, { width: bitmap.width, height: bitmap.height });
          computeSquarePlacement({ width: bitmap.width, height: bitmap.height });
          tmScores = await model.predict(canvas);
        } catch {
          tmScores = [];
        }
      }

      const ocr = await recognizeImageText(file);
      const keyword = classifyByKeywords(ocr.text);
      const embedding = embeddingReference ? await classifyByEmbedding(ocr.text, embeddingReference) : null;

      if (tmScores.length > 0) {
        comparisonRows.push({
          id: file.name,
          trueLabel: manifestRow.label,
          orgName: manifestRow.orgName,
          tmScores,
          ocrOk: ocr.ok,
          keyword,
          embedding,
        });
      }
      setProgress(i + 1);
    }

    const result = computeComparisonReport(comparisonRows, trainOrgNames, posterConfig);
    setReport(result);
    setNotice(
      [
        errors.length > 0 ? `${errors.length}개 manifest 행을 건너뜀(형식 오류)` : null,
        !model ? "모델을 사용할 수 없어 평가할 수 없어요" : null,
        comparisonRows.length === 0 ? "평가할 test 이미지가 없어요(manifest와 파일명이 맞는지 확인하세요)" : null,
      ]
        .filter(Boolean)
        .join(" / ") || null
    );
    setStatus("done");
    void terminateOcrWorker();
  }

  function buildExport(): { json: string; markdown: string } {
    if (!report) return { json: "", markdown: "" };
    const payload = {
      modelVersion,
      preprocessingVersion: PREPROCESS_VERSION,
      keywordsVersion: KEYWORDS_VERSION,
      embedVersion: EMBED_VERSION,
      postprocessVersion: POSTPROCESS_VERSION,
      measuredAt: new Date().toISOString(),
      total: report.total,
      noTextSignalRate: report.noTextSignalRate,
      standaloneAccuracy: report.standaloneAccuracy,
      variants: report.variants,
    };
    const md = [
      `## 2차 후처리 단계별 비교 (모델 ${modelVersion} / 전처리 ${PREPROCESS_VERSION} / 키워드 ${KEYWORDS_VERSION} / 임베딩 ${EMBED_VERSION} / 결합 ${POSTPROCESS_VERSION} / ${payload.measuredAt})`,
      "",
      `- 평가 대상: test ${report.total}건, 글자 신호 없음 비율 ${pct(report.noTextSignalRate)}`,
      `- 신호별 단독 1위 정확도(참고): TM만 ${pct(report.standaloneAccuracy.tm.accuracy)} · 키워드만 ${pct(report.standaloneAccuracy.keyword.accuracy)} · 임베딩만 ${pct(report.standaloneAccuracy.embedding.accuracy)}`,
      "",
      "| 방식 | 정확도 | macro-F1 | 자동 제안 비율 | 자동 제안 중 정확도 | 처음 보는 기관 정확도 |",
      "|---|---|---|---|---|---|",
      ...VARIANT_KEYS.map((k) => {
        const v = report.variants[k];
        return `| ${VARIANT_LABELS[k]} | ${pct(v.accuracy.accuracy)} (${v.accuracy.correct}/${v.accuracy.total}) | ${v.macroF1.toFixed(3)} | ${pct(v.suggestedRate)} | ${pct(v.accuracyAmongSuggested.accuracy)} | ${pct(v.unseenOrgAccuracy.accuracy)} (n=${v.unseenOrgAccuracy.total}) |`;
      }),
    ].join("\n");
    return { json: JSON.stringify(payload, null, 2), markdown: md };
  }

  function downloadRowsCsv() {
    if (!report) return;
    const header = ["filename", "label", "tm_top", "keyword_top", "embed_top", "final_top_A", "final_top_B", "final_top_C", "final_top_D", "signal_agreement", "matched_keywords"];
    const lines = report.rows.map((r) =>
      [
        r.id,
        r.trueLabel,
        r.variants.tmTopClass ?? "",
        r.variants.keywordTopClass ?? "",
        r.variants.embedTopClass ?? "",
        r.variants.A.predictedLabel ?? "",
        r.variants.B.predictedLabel ?? "",
        r.variants.C.predictedLabel ?? "",
        r.variants.D.predictedLabel ?? "",
        String(r.variants.signalAgreement),
        csvEscape(r.variants.matchedKeywords.join(";")),
      ].join(",")
    );
    downloadTextFile("postprocess-comparison.csv", [header.join(","), ...lines].join("\n"), "text/csv");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--color-muted-foreground)]">
        manifest.csv와 이미지 여러 장을 올리면 split=test 행만 골라 TM·OCR·키워드·임베딩을 한 번씩 계산하고, 네
        방식(A~D)을 한 번에 비교해요. train 이미지가 섞여 있으면 평가하지 않고 경고로만 보여줘요. 키워드 사전·
        임베딩 참조·결합 규칙은 바꾸지 않아요.
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        manifest.csv 선택
        <input type="file" accept=".csv,text/csv" onChange={(e) => setManifestFile(e.target.files?.[0] ?? null)} disabled={status === "running"} className="text-sm font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        이미지 파일 선택 (여러 장)
        <input type="file" accept="image/*" multiple onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))} disabled={status === "running"} className="text-sm font-normal" />
        {imageFiles.length > 0 && <span className="text-xs font-normal text-[var(--color-muted-foreground)]">{imageFiles.length}개 선택됨</span>}
      </label>
      <button
        type="button"
        onClick={handleRun}
        disabled={!manifestFile || imageFiles.length === 0 || status === "running"}
        className="self-start rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {status === "running" ? `평가 중... (${progress}/${imageFiles.length})` : "단계별 비교 실행"}
      </button>

      {notice && <p className="text-xs text-[var(--color-muted-foreground)]">{notice}</p>}
      {trainWarnings.length > 0 && (
        <p className="text-xs text-[var(--color-danger)]">
          train split 이미지 {trainWarnings.length}개는 평가하지 않았어요: {trainWarnings.join(", ")}
        </p>
      )}

      {status === "done" && report && (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            평가 대상 test {report.total}건 · 글자 신호 없음 비율 {pct(report.noTextSignalRate)}
          </p>

          <table className="text-xs">
            <thead>
              <tr className="text-left text-[var(--color-muted-foreground)]">
                <th className="pr-3">방식</th>
                <th className="pr-3">정확도</th>
                <th className="pr-3">macro-F1</th>
                <th className="pr-3">자동 제안 비율</th>
                <th className="pr-3">자동 제안 중 정확도</th>
                <th>처음 보는 기관 정확도</th>
              </tr>
            </thead>
            <tbody>
              {VARIANT_KEYS.map((k) => {
                const v: VariantReport = report.variants[k];
                return (
                  <tr key={k}>
                    <td className="pr-3 font-medium">{VARIANT_LABELS[k]}</td>
                    <td className="pr-3">
                      {pct(v.accuracy.accuracy)} ({v.accuracy.correct}/{v.accuracy.total})
                    </td>
                    <td className="pr-3">{v.macroF1.toFixed(3)}</td>
                    <td className="pr-3">{pct(v.suggestedRate)}</td>
                    <td className="pr-3">{pct(v.accuracyAmongSuggested.accuracy)}</td>
                    <td>
                      {pct(v.unseenOrgAccuracy.accuracy)} (n={v.unseenOrgAccuracy.total})
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="text-xs text-[var(--color-muted-foreground)]">
            신호별 단독 1위 정확도(참고용 — 결합 없이 그 신호 하나만): TM만 {pct(report.standaloneAccuracy.tm.accuracy)} · 키워드만{" "}
            {pct(report.standaloneAccuracy.keyword.accuracy)} · 임베딩만 {pct(report.standaloneAccuracy.embedding.accuracy)}
          </p>

          {VARIANT_KEYS.map((k) => (
            <details key={k} className="text-xs">
              <summary className="cursor-pointer font-medium">{VARIANT_LABELS[k]} — 분야별 지표·혼동행렬</summary>
              <table className="mt-2">
                <thead>
                  <tr className="text-left text-[var(--color-muted-foreground)]">
                    <th className="pr-3">분야</th>
                    <th className="pr-3">건수</th>
                    <th className="pr-3">정밀도</th>
                    <th className="pr-3">재현율</th>
                    <th>F1</th>
                  </tr>
                </thead>
                <tbody>
                  {report.variants[k].classMetrics.map((m) => (
                    <tr key={m.classId}>
                      <td className="pr-3">{m.classId}</td>
                      <td className="pr-3">{m.support}</td>
                      <td className="pr-3">{m.precision.toFixed(2)}</td>
                      <td className="pr-3">{m.recall.toFixed(2)}</td>
                      <td>{m.f1.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}

          <div className="flex gap-2">
            <button type="button" onClick={() => downloadTextFile("postprocess-comparison.json", buildExport().json, "application/json")} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs">
              JSON 다운로드
            </button>
            <button type="button" onClick={() => downloadTextFile("postprocess-comparison.md", buildExport().markdown, "text/markdown")} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs">
              마크다운 다운로드
            </button>
            <button type="button" onClick={downloadRowsCsv} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs">
              이미지별 CSV 다운로드
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
