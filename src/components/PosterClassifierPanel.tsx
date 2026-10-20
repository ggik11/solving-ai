"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_POSTER_CLASSIFIER_CONFIG,
  type ModelClassFieldMapRow,
  type PosterClassifierConfig,
} from "@/lib/poster/classifier";
import { analyzePoster, applyTextPostprocess, buildFailedAnalysisResult, type PosterAnalysisResult } from "@/lib/poster/analyze";
import { hashFile } from "@/lib/poster/hash";
import { PREPROCESS_VERSION, computeSquarePlacement, renderToSquareCanvas } from "@/lib/poster/preprocess";
import { ModelMissingError, teachableMachineLoader, type LoadedPosterModel, type PosterModelLoader } from "@/lib/poster/modelLoader";
import {
  findCachedPosterAnalysisAction,
  lookupModelClassFieldMapAction,
  lookupOrgFieldHistoryAction,
  recordPosterAnalysisAction,
  type OrgFieldHistoryItem,
} from "@/lib/poster/actions";
import { recognizeImageText, terminateOcrWorker } from "@/lib/poster/ocr";
import { loadEmbeddingReference, type EmbeddingReference } from "@/lib/poster/embeddingClassifier";

export interface InterestLabel {
  id: string;
  name: string;
}

type Stage = "idle" | "analyzing" | "done";

/**
 * 포스터로 분야 후보를 찾는 패널(가이드 5.4, 12장 P4). "confirm" 모드(수정 화면, activityId 있음)는
 * 분석 결과를 즉시 저장한다. "preview" 모드(등록/제보 단계, activityId 아직 없음)는 활동이 아직
 * 없어 바로 저장할 수 없으므로 분석 결과를 저장하지 않고 onAnalyzed로 원본값을 올린다 — 상위
 * 폼(ActivityForm/SubmitActivityForm)이 그 값을 들고 있다가 최종 저장(활동 생성)과 같은 트랜잭션
 * 으로 한 번에 보낸다(가이드 5.4 5번, PROGRESS.md 참조) — 그래서 저장 시 분석 결과가 사라지지
 * 않는다. 두 모드 모두 분야 후보 칩을 누를 수 있고, 어느 쪽이든 "저장 전까지는 확정이 아니다".
 *
 * TM(이미지) 분석 뒤에는 포스터 원본 이미지로 OCR을 돌리고, 제목·설명(있으면)을 OCR 텍스트
 * 앞에 붙여 키워드(2-A)·임베딩(2-B) 신호와 결합한다(가이드 12장). OCR이나 임베딩이 실패해도
 * (worker 로드 실패, 참조 세트 없음 등) 예외를 던지지 않고 TM 결과로 저장된다 — combinePosterSignals
 * 가 글자 신호 없음을 그 자체로 처리한다. 포스터 이미지·OCR 원문은 서버로 보내지 않는다 — 걸린
 * 키워드 단어와 결합 결과만 저장한다.
 *
 * loader는 테스트에서만 목으로 주입한다 — 실제 서비스는 기본값을 쓴다.
 */
export function PosterClassifierPanel({
  variant,
  activityId,
  config = DEFAULT_POSTER_CLASSIFIER_CONFIG,
  interests,
  onAcceptCandidate,
  onAnalyzed,
  loader = teachableMachineLoader,
  candidateHint,
  activityTitle,
  activityDescription,
  orgName,
}: {
  variant: "confirm" | "preview";
  activityId: string | null;
  config?: PosterClassifierConfig;
  interests: InterestLabel[];
  /** 분야 후보 칩을 누르면 호출된다. analysisId는 "confirm" 모드에서 이미 저장된 분석의 id이고,
   * "preview" 모드(저장 전)에서는 null — 저장은 상위 폼이 onAnalyzed로 받은 원본 분석값을
   * 한 번에 묶어 보낸다(가이드 5.4 5번). */
  onAcceptCandidate?: (interestId: string, analysisId: string | null) => void;
  /** 분석이 끝날 때마다(성공/실패 모두) 호출된다 — "preview" 모드는 이 값을 들고 있다가 최종
   * 저장 시점에 활동 생성과 함께 한 번에 보낸다(활동이 아직 없어 바로 저장할 수 없기 때문). */
  onAnalyzed?: (result: PosterAnalysisResult) => void;
  loader?: PosterModelLoader;
  /** 분야 후보 칩을 누르면 어디에 반영되는지 안내하는 문구. 쓰는 화면마다 다르다(등록/제보/수정). */
  candidateHint?: string;
  /** 2차 후처리(2-A/2-B) 입력에 OCR 텍스트와 함께 쓴다(가이드 12장) — 있으면 OCR 앞에 붙인다. */
  activityTitle?: string;
  activityDescription?: string;
  /** 있으면 분석 뒤 "같은 기관의 이전 확정" 참고 정보를 함께 보여준다(가이드 12장 5번, 관리자 전용
   * RPC라 일반 사용자 화면에서는 조용히 빈 배열로 돌아온다). 없으면 이 부분을 생략한다. */
  orgName?: string;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<PosterAnalysisResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [orgFieldHistory, setOrgFieldHistory] = useState<OrgFieldHistoryItem[] | null>(null);
  const modelRef = useRef<LoadedPosterModel | null>(null);
  const persistedAnalysisIdRef = useRef<string | null>(null);
  const embeddingReferencePromiseRef = useRef<Promise<EmbeddingReference | null> | null>(null);

  useEffect(() => {
    return () => {
      void terminateOcrWorker();
    };
  }, []);

  const interestName = (id: string) => interests.find((i) => i.id === id)?.name ?? id;

  function getEmbeddingReference(): Promise<EmbeddingReference | null> {
    if (!embeddingReferencePromiseRef.current) {
      embeddingReferencePromiseRef.current = loadEmbeddingReference();
    }
    return embeddingReferencePromiseRef.current;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setStage("analyzing");
    setNotice(null);
    setResult(null);
    setOrgFieldHistory(null);
    persistedAnalysisIdRef.current = null;

    const posterHash = await hashFile(file);
    let analyzed: PosterAnalysisResult;

    if (!modelRef.current) {
      try {
        modelRef.current = await loader.load(config.modelPath);
      } catch (error) {
        const failureReason = error instanceof ModelMissingError ? "model_missing" : "model_load_error";
        analyzed = buildFailedAnalysisResult({ posterHash, modelVersion: "unknown", preprocessingVersion: PREPROCESS_VERSION, failureReason });
        await finish(analyzed);
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
      await finish(analyzed);
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

    // 2차 후처리(가이드 12장): 원본 이미지(전처리 전)로 OCR을 돌리고, 제목·설명과 합쳐 키워드·
    // 임베딩 신호와 결합한다. OCR·임베딩이 실패해도(ok=false, 참조 세트 없음) 예외를 던지지
    // 않으므로 TM 결과로 계속 진행된다.
    const ocr = await recognizeImageText(file);
    const embeddingReference = await getEmbeddingReference();
    analyzed = await applyTextPostprocess({
      analysis: analyzed,
      ocrText: ocr.text,
      title: activityTitle ?? "",
      description: activityDescription ?? "",
      embeddingReference,
      classFieldMap,
      config,
    });

    if (orgName && orgName.trim().length > 0) {
      lookupOrgFieldHistoryAction(orgName).then(setOrgFieldHistory);
    }

    await finish(analyzed);
  }

  async function finish(analyzed: PosterAnalysisResult) {
    await persistIfNeeded(analyzed);
    setResult(analyzed);
    onAnalyzed?.(analyzed);
    setStage("done");
  }

  /** "confirm" 모드에서만 즉시 저장한다 — 분석 실패(모델 미설치 등)도 함께 남긴다(체크리스트 7번).
   * "preview" 모드(활동이 아직 없음)는 저장하지 않고 onAnalyzed로 올린 원본값을 상위 폼이 들고
   * 있다가 활동 생성과 한 번에 묶어 보낸다 — 그래야 저장 시 분석 결과가 사라지지 않는다. */
  async function persistIfNeeded(analyzed: PosterAnalysisResult) {
    if (variant !== "confirm" || !activityId || analyzed.fromCache) return;
    const saved = await recordPosterAnalysisAction({ activityId, ...analyzed });
    if (!saved.ok) setNotice(saved.error);
    else persistedAnalysisIdRef.current = saved.analysisId;
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
        모델은 분야 &ldquo;후보&rdquo;만 제안해요. {candidateHint ?? "후보를 누르면 아래 분야 선택 칸에 들어가요 — 저장 전까지는 확정이 아니에요."}
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        포스터 이미지 선택
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={stage === "analyzing"} className="text-sm font-normal" />
      </label>

      {stage === "analyzing" && <p className="text-sm text-[var(--color-muted-foreground)]">분석 중... (OCR·임베딩 포함, 몇 초 걸릴 수 있어요)</p>}
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

              {result.postprocess && (
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-2 text-xs text-[var(--color-muted-foreground)]">
                  {result.postprocess.finalRanking.length > 0 && (
                    <p>
                      최종 순위:{" "}
                      {result.postprocess.finalRanking.map((r, i) => `${i + 1}. ${r.classId} ${Math.round(r.score * 100)}%`).join(" · ")}
                    </p>
                  )}
                  <p>
                    {!result.postprocess.keywordTopClass && !result.postprocess.embedTopClass
                      ? "TM 단독 판정 — 글자 신호(키워드·임베딩) 없음"
                      : `신호별 1위: TM ${result.postprocess.tmTopClass ?? "-"} · 키워드 ${result.postprocess.keywordTopClass ?? "-"} · 임베딩 ${result.postprocess.embedTopClass ?? "-"} (${result.postprocess.signalAgreement ?? 0}개 일치)`}
                  </p>
                  {result.postprocess.matchedKeywords.length > 0 && <p>근거 키워드: {result.postprocess.matchedKeywords.join(", ")}</p>}
                </div>
              )}

              {orgFieldHistory && orgFieldHistory.length > 0 && (
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  같은 기관의 이전 확정(참고용): {orgFieldHistory.map((h) => `${interestName(h.interestId)} (${h.count}건)`).join(", ")}
                </p>
              )}

              {result.classFieldMapMissing ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">이 모델 버전의 분야 연결표가 없어요. 분야를 직접 선택해 주세요.</p>
              ) : result.status === "suggested" ? (
                <div className="flex flex-wrap gap-2">
                  {result.candidateInterestIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onAcceptCandidate?.(id, persistedAnalysisIdRef.current)}
                      className="rounded-full border border-[var(--color-brand-300)] bg-[var(--color-brand-50)] px-3 py-1 text-xs text-[var(--color-brand-700)]"
                    >
                      분야 후보 · {interestName(id)}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    {result.noServiceFieldClass
                      ? "교내 행정 공지로 보여요. 서비스 분야 후보를 제안하지 않아요 — 분야를 직접 선택해 주세요."
                      : "확신이 낮아요. 원문을 보고 직접 선택해 주세요."}
                  </p>
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
