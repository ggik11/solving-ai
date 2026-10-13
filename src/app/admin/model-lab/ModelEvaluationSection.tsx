"use client";

import { useState } from "react";
import {
  computeAccuracy,
  computeClassMetrics,
  computeConfusionMatrix,
  computeMacroF1,
  computeMajorityBaselineAccuracy,
  computeOodSuggestedRate,
  computeThresholdSweep,
  computeUnseenOrgAccuracy,
  type LabeledPrediction,
  type ThresholdConfig,
} from "@/lib/modelLab/metrics";
import { parsePredictionsCsv } from "@/lib/modelLab/predictionsCsv";
import { parseManifestCsv } from "@/lib/modelLab/manifest";
import { downloadTextFile, basename } from "@/lib/modelLab/download";
import { PREPROCESS_VERSION, renderToSquareCanvas } from "@/lib/poster/preprocess";
import { teachableMachineLoader, type PosterModelLoader } from "@/lib/poster/modelLoader";
import { judgePosterClassification } from "@/lib/poster/classifier";
import type { PosterClassifierConfig } from "@/lib/poster/classifier";

const SWEEP_TOP_SCORES = [0.6, 0.7, 0.8, 0.9];
const SWEEP_MARGINS = [0.1, 0.2, 0.3];
const SWEEP: ThresholdConfig[] = SWEEP_TOP_SCORES.flatMap((minTopScore) =>
  SWEEP_MARGINS.map((minMargin) => ({ minTopScore, minMargin }))
);

type InputMode = "predictions-csv" | "run-model";

/**
 * 6.3 모델 평가(가이드 6.3). 두 입력 경로를 지원한다.
 * - "run-model": manifest + 이미지 파일을 선택하면 서비스와 같은 전처리·모델 로더로 실제
 *   예측을 돌린다(모델이 없으면 전부 예측 실패로 남는다 — G3와 같은 원칙, 가짜 예측 없음).
 * - "predictions-csv": 이미 계산해 둔 예측 결과(CSV)를 올려 지표 계산만 검증한다 — 모델이
 *   아직 없는 지금 이 지표 파이프라인 자체를 확인하는 용도다(목 예측은 여기서만 쓰인다).
 */
export function ModelEvaluationSection({
  posterConfig,
  loader = teachableMachineLoader,
}: {
  posterConfig: PosterClassifierConfig;
  loader?: PosterModelLoader;
}) {
  const [mode, setMode] = useState<InputMode>("predictions-csv");
  const [predictions, setPredictions] = useState<LabeledPrediction[] | null>(null);
  const [parseNotice, setParseNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [modelVersion, setModelVersion] = useState("unknown");

  async function handlePredictionsCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const { predictions: parsed, errors } = parsePredictionsCsv(text);
    setPredictions(parsed);
    setParseNotice(errors.length > 0 ? `${errors.length}개 행을 건너뜀(형식 오류)` : null);
  }

  async function handleRunModel(manifestFile: File, imageFiles: File[]) {
    setRunning(true);
    setParseNotice(null);
    const { rows, errors } = parseManifestCsv(await manifestFile.text());
    const byBasename = new Map(imageFiles.map((f) => [f.name, f]));

    let model: Awaited<ReturnType<PosterModelLoader["load"]>> | null = null;
    try {
      model = await loader.load(posterConfig.modelPath);
      setModelVersion(model.modelVersion);
    } catch {
      setModelVersion("unknown");
    }

    const results: LabeledPrediction[] = [];
    let unmatched = 0;
    for (const row of rows) {
      const file = byBasename.get(basename(row.imagePath));
      if (!file) {
        unmatched++;
        continue;
      }
      let predictedLabel: string | null = null;
      let topScore: number | null = null;
      let margin: number | null = null;
      if (model) {
        try {
          const bitmap = await createImageBitmap(file);
          const canvas = renderToSquareCanvas(bitmap, { width: bitmap.width, height: bitmap.height });
          const scores = await model.predict(canvas);
          const judgment = judgePosterClassification(scores, posterConfig);
          predictedLabel = judgment.topClass;
          topScore = judgment.topScore;
          margin = judgment.margin;
        } catch {
          // 이미지 디코드 실패 등 — 예측 없음으로 남긴다(점수를 꾸며내지 않는다).
        }
      }
      results.push({
        id: row.imagePath,
        trueLabel: row.label,
        predictedLabel,
        topScore,
        margin,
        split: row.split,
        orgName: row.orgName,
      });
    }

    setPredictions(results);
    setParseNotice(
      [
        errors.length > 0 ? `${errors.length}개 manifest 행을 건너뜀(형식 오류)` : null,
        unmatched > 0 ? `${unmatched}개 행은 이미지 파일을 찾지 못해 건너뜀` : null,
        !model ? "모델을 사용할 수 없어 모든 예측이 비어 있어요(분야를 직접 확인해 주세요)" : null,
      ]
        .filter(Boolean)
        .join(" / ") || null
    );
    setRunning(false);
  }

  const testSplit = (predictions ?? []).filter((p) => p.split === "test");
  const accuracy = testSplit.length > 0 ? computeAccuracy(testSplit) : null;
  const baseline = testSplit.length > 0 ? computeMajorityBaselineAccuracy(testSplit) : null;
  const classMetrics = testSplit.length > 0 ? computeClassMetrics(testSplit) : null;
  const macroF1 = classMetrics ? computeMacroF1(classMetrics) : null;
  const confusion = testSplit.length > 0 ? computeConfusionMatrix(testSplit) : null;
  const sweep = testSplit.length > 0 ? computeThresholdSweep(testSplit, SWEEP) : null;
  const ood = predictions ? computeOodSuggestedRate(predictions, { minTopScore: posterConfig.suggestMinTopScore, minMargin: posterConfig.suggestMinMargin }) : null;
  const unseenOrg = predictions ? computeUnseenOrgAccuracy(predictions) : null;

  function buildReport(): { json: string; markdown: string } {
    const payload = {
      modelVersion,
      preprocessingVersion: PREPROCESS_VERSION,
      measuredAt: new Date().toISOString(),
      accuracy,
      majorityBaseline: baseline,
      macroF1,
      classMetrics,
      confusionMatrix: confusion,
      thresholdSweep: sweep,
      oodSuggestedRate: ood,
      unseenOrgAccuracy: unseenOrg,
    };
    const md = [
      `## 모델 평가 (모델 ${modelVersion} / 전처리 ${PREPROCESS_VERSION} / ${payload.measuredAt})`,
      "",
      `- 정확도: ${accuracy ? `${accuracy.correct}/${accuracy.total} (${Math.round(accuracy.accuracy * 100)}%)` : "데이터 없음"}`,
      `- 다수 클래스 기준선: ${baseline ? `${Math.round(baseline.accuracy * 100)}% (${baseline.majorityLabel})` : "데이터 없음"}`,
      `- macro-F1: ${macroF1 != null ? macroF1.toFixed(3) : "데이터 없음"}`,
      `- ood 중 suggested 비율: ${ood ? `${ood.suggestedCount}/${ood.total} (${Math.round(ood.suggestedRate * 100)}%)` : "데이터 없음"}`,
      `- 처음 보는 기관 정확도: ${unseenOrg ? `${Math.round(unseenOrg.accuracy * 100)}% (n=${unseenOrg.total})` : "데이터 없음"}`,
      "",
      "### 분야별 정밀도·재현율·F1",
      "| 분야 | 건수 | 정밀도 | 재현율 | F1 |",
      "|---|---|---|---|---|",
      ...(classMetrics ?? []).map(
        (m) => `| ${m.classId} | ${m.support} | ${m.precision.toFixed(2)} | ${m.recall.toFixed(2)} | ${m.f1.toFixed(2)} |`
      ),
    ].join("\n");
    return { json: JSON.stringify(payload, null, 2), markdown: md };
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">6.3 모델 평가</h2>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        manifest와 이미지로 실제 모델을 돌리거나, 이미 계산해 둔 예측 결과 CSV로 지표만 확인할 수 있어요.
      </p>

      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode("predictions-csv")}
          className={`rounded-full border px-3 py-1 ${mode === "predictions-csv" ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white" : "border-[var(--color-border)]"}`}
        >
          예측 결과 CSV 업로드
        </button>
        <button
          type="button"
          onClick={() => setMode("run-model")}
          className={`rounded-full border px-3 py-1 ${mode === "run-model" ? "border-[var(--color-brand-600)] bg-[var(--color-brand-600)] text-white" : "border-[var(--color-border)]"}`}
        >
          이미지 + manifest로 모델 실행
        </button>
      </div>

      {mode === "predictions-csv" ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          예측 결과 CSV (id,true_label,predicted_label,top_score,margin,split,org_name)
          <input type="file" accept=".csv,text/csv" onChange={handlePredictionsCsv} className="text-sm font-normal" />
        </label>
      ) : (
        <RunModelInputs onRun={handleRunModel} running={running} />
      )}

      {parseNotice && <p className="text-xs text-[var(--color-muted-foreground)]">{parseNotice}</p>}

      {predictions && (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {predictions.length}건 로드됨 (test {testSplit.length}건)
          </p>

          {accuracy && baseline && macroF1 != null ? (
            <ul className="text-sm">
              <li>
                정확도: {accuracy.correct}/{accuracy.total} ({Math.round(accuracy.accuracy * 100)}%)
              </li>
              <li>
                다수 클래스 기준선: {Math.round(baseline.accuracy * 100)}% ({baseline.majorityLabel ?? "-"})
              </li>
              <li>macro-F1: {macroF1.toFixed(3)}</li>
            </ul>
          ) : (
            <p className="text-xs text-[var(--color-muted-foreground)]">test split 자료가 없어 정확도를 계산할 수 없어요.</p>
          )}

          {classMetrics && classMetrics.length > 0 && (
            <table className="text-xs">
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
                {classMetrics.map((m) => (
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
          )}

          {ood && (
            <p className="text-xs">
              ood 중 suggested 비율: {ood.suggestedCount}/{ood.total} ({Math.round(ood.suggestedRate * 100)}%)
            </p>
          )}
          {unseenOrg && unseenOrg.total > 0 && (
            <p className="text-xs">
              처음 보는 기관 정확도: {Math.round(unseenOrg.accuracy * 100)}% (n={unseenOrg.total})
            </p>
          )}

          {sweep && sweep.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium">임계값 조합별 통과율·정확도</summary>
              <table className="mt-2">
                <thead>
                  <tr className="text-left text-[var(--color-muted-foreground)]">
                    <th className="pr-3">top_score</th>
                    <th className="pr-3">margin</th>
                    <th className="pr-3">통과율</th>
                    <th>통과 자료 정확도</th>
                  </tr>
                </thead>
                <tbody>
                  {sweep.map((row, i) => (
                    <tr key={i}>
                      <td className="pr-3">{row.minTopScore}</td>
                      <td className="pr-3">{row.minMargin}</td>
                      <td className="pr-3">{Math.round(row.passRate * 100)}%</td>
                      <td>{Math.round(row.accuracyAmongPassed * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => downloadTextFile("model-evaluation.json", buildReport().json, "application/json")}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs"
            >
              JSON 다운로드
            </button>
            <button
              type="button"
              onClick={() => downloadTextFile("model-evaluation.md", buildReport().markdown, "text/markdown")}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs"
            >
              마크다운 다운로드
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function RunModelInputs({ onRun, running }: { onRun: (manifestFile: File, imageFiles: File[]) => void; running: boolean }) {
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm font-medium">
        manifest.csv 선택
        <input type="file" accept=".csv,text/csv" onChange={(e) => setManifestFile(e.target.files?.[0] ?? null)} className="text-sm font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        이미지 파일 선택 (manifest의 파일 이름과 일치해야 해요)
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))}
          className="text-sm font-normal"
        />
      </label>
      {imageFiles.length > 0 && <p className="text-xs text-[var(--color-muted-foreground)]">{imageFiles.length}개 이미지 선택됨</p>}
      <button
        type="button"
        disabled={!manifestFile || imageFiles.length === 0 || running}
        onClick={() => manifestFile && onRun(manifestFile, imageFiles)}
        className="self-start rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {running ? "평가 실행 중..." : "평가 실행"}
      </button>
    </div>
  );
}
