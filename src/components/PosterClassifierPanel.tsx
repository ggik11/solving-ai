"use client";

import { useRef, useState } from "react";
import {
  DEFAULT_POSTER_CLASSIFIER_CONFIG,
  type ModelClassFieldMapRow,
  type PosterClassifierConfig,
} from "@/lib/poster/classifier";
import { analyzePoster, buildFailedAnalysisResult, type PosterAnalysisResult } from "@/lib/poster/analyze";
import { hashFile } from "@/lib/poster/hash";
import { PREPROCESS_VERSION, computeSquarePlacement, renderToSquareCanvas } from "@/lib/poster/preprocess";
import { ModelMissingError, teachableMachineLoader, type LoadedPosterModel, type PosterModelLoader } from "@/lib/poster/modelLoader";
import { findCachedPosterAnalysisAction, lookupModelClassFieldMapAction, recordPosterAnalysisAction } from "@/lib/poster/actions";

export interface InterestLabel {
  id: string;
  name: string;
}

type Stage = "idle" | "analyzing" | "done";

/**
 * 포스터로 분야 후보를 찾는 패널(가이드 5.4). "confirm" 모드(수정 화면, activityId 있음)는 분석
 * 결과를 저장하고 제안(suggested) 후보를 클릭하면 분야 확정 칸(ActivityFieldsManager)에 들어간다.
 * "preview" 모드(등록/제보 단계, activityId 아직 없음)는 미리보기만 하고 저장하지 않는다 —
 * "관리자가 등록한 실제 활동은 관리자가 직접 확정한다"는 원칙에 따라 확정은 수정 화면 한 곳에서만
 * 한다(PROGRESS.md 참조). loader는 테스트에서만 목으로 주입한다 — 실제 서비스는 기본값을 쓴다.
 */
export function PosterClassifierPanel({
  variant,
  activityId,
  config = DEFAULT_POSTER_CLASSIFIER_CONFIG,
  interests,
  onAcceptCandidate,
  loader = teachableMachineLoader,
}: {
  variant: "confirm" | "preview";
  activityId: string | null;
  config?: PosterClassifierConfig;
  interests: InterestLabel[];
  onAcceptCandidate?: (interestId: string) => void;
  loader?: PosterModelLoader;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<PosterAnalysisResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const modelRef = useRef<LoadedPosterModel | null>(null);

  const interestName = (id: string) => interests.find((i) => i.id === id)?.name ?? id;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setStage("analyzing");
    setNotice(null);
    setResult(null);

    const posterHash = await hashFile(file);
    let analyzed: PosterAnalysisResult;

    if (!modelRef.current) {
      try {
        modelRef.current = await loader.load(config.modelPath);
      } catch (error) {
        const failureReason = error instanceof ModelMissingError ? "model_missing" : "model_load_error";
        analyzed = buildFailedAnalysisResult({ posterHash, modelVersion: "unknown", preprocessingVersion: PREPROCESS_VERSION, failureReason });
        await persistIfNeeded(analyzed);
        setResult(analyzed);
        setStage("done");
        return;
      }
    }
    const model = modelRef.current;

    let canvas: HTMLCanvasElement;
    try {
      const bitmap = await createImageBitmap(file);
      computeSquarePlacement({ width: bitmap.width, height: bitmap.height }); // 입력 검증 겸 사전 계산
      canvas = renderToSquareCanvas(bitmap, { width: bitmap.width, height: bitmap.height });
    } catch {
      analyzed = buildFailedAnalysisResult({
        posterHash,
        modelVersion: model.modelVersion,
        preprocessingVersion: PREPROCESS_VERSION,
        failureReason: "image_decode_error",
      });
      await persistIfNeeded(analyzed);
      setResult(analyzed);
      setStage("done");
      return;
    }

    const classFieldMap: ModelClassFieldMapRow[] = await lookupModelClassFieldMapAction(model.modelVersion);
    analyzed = await analyzePoster({
      activityId,
      posterHash,
      preprocessingVersion: PREPROCESS_VERSION,
      model,
      canvas,
      config,
      classFieldMap,
      findCached: findCachedPosterAnalysisAction,
    });

    await persistIfNeeded(analyzed);
    setResult(analyzed);
    setStage("done");
  }

  /** "confirm" 모드에서만 저장한다 — 분석 실패(모델 미설치 등)도 함께 남긴다(체크리스트 7번). */
  async function persistIfNeeded(analyzed: PosterAnalysisResult) {
    if (variant !== "confirm" || !activityId || analyzed.fromCache) return;
    const saved = await recordPosterAnalysisAction({ activityId, ...analyzed });
    if (!saved.ok) setNotice(saved.error);
  }

  if (!config.enabled) {
    return (
      <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
        포스터 분야 추천 기능이 꺼져 있어요. 분야를 직접 선택해 주세요.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <h3 className="text-sm font-semibold text-[var(--color-muted-foreground)]">포스터로 분야 후보 찾기</h3>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        모델은 분야 &ldquo;후보&rdquo;만 제안해요. 실제 확정은 {variant === "confirm" ? "아래에서 직접" : "등록 후 수정 화면에서"} 해요.
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        포스터 이미지 선택
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={stage === "analyzing"} className="text-sm font-normal" />
      </label>

      {stage === "analyzing" && <p className="text-sm text-[var(--color-muted-foreground)]">분석 중...</p>}
      {notice && <p className="text-xs text-[var(--color-danger)]">{notice}</p>}

      {stage === "done" && result && (
        <div className="flex flex-col gap-2">
          {result.status === "failed" ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {{
                model_missing: "모델을 아직 사용할 수 없어요.",
                model_load_error: "모델을 불러오지 못했어요.",
                image_decode_error: "이미지를 읽지 못했어요.",
                class_map_mismatch: "이 모델 버전의 분야 연결표가 없어요.",
              }[result.failureReason ?? "model_missing"]}{" "}
              분야를 직접 선택해 주세요.
            </p>
          ) : (
            <>
              <p className="text-xs text-[var(--color-muted-foreground)]">모델 분류 점수(참고용 — 지원 적합도가 아니에요)</p>
              <ul className="flex flex-col gap-1">
                {[...result.scores]
                  .sort((a, b) => b.score - a.score)
                  .map((s) => (
                    <li key={s.classId} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0 truncate">{s.classId}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]">
                        <span className="block h-full rounded-full bg-[var(--color-brand-600)]" style={{ width: `${Math.round(s.score * 100)}%` }} />
                      </span>
                      <span className="w-10 text-right text-[var(--color-muted-foreground)]">{Math.round(s.score * 100)}%</span>
                    </li>
                  ))}
              </ul>

              {result.classFieldMapMissing ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">이 모델 버전의 분야 연결표가 없어요. 분야를 직접 선택해 주세요.</p>
              ) : result.status === "suggested" ? (
                <div className="flex flex-wrap gap-2">
                  {result.candidateInterestIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      disabled={variant !== "confirm"}
                      onClick={() => onAcceptCandidate?.(id)}
                      className="rounded-full border border-[var(--color-brand-300)] bg-[var(--color-brand-50)] px-3 py-1 text-xs text-[var(--color-brand-700)] disabled:opacity-70"
                    >
                      분야 후보 · {interestName(id)}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <p className="text-sm text-[var(--color-muted-foreground)]">확신이 낮아요. 원문을 보고 직접 선택해 주세요.</p>
                  <div className="flex flex-wrap gap-2">
                    {result.candidateInterestIds.map((id) => (
                      <span key={id} className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
                        참고 · {interestName(id)}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
