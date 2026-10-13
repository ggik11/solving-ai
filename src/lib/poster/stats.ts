/**
 * 관리자 대시보드 통계(가이드 5.6) — 판정 비율과 분야별 모델 후보 수락률. 저장된 poster_analyses/
 * activity_fields 행을 집계만 하는 순수 함수라, 실제 모델 없이도(목 데이터로) 단위 테스트할 수 있다.
 */
import { resolveCandidateInterestIds, type ModelClassFieldMapRow, type PosterAnalysisStatus } from "./classifier";

export interface AnalysisVerdictRow {
  status: PosterAnalysisStatus;
}

export interface VerdictRatio {
  status: PosterAnalysisStatus;
  count: number;
  ratio: number;
}

const ALL_STATUSES: PosterAnalysisStatus[] = ["suggested", "needs_review", "failed"];

export function computeVerdictRatios(analyses: AnalysisVerdictRow[]): VerdictRatio[] {
  const total = analyses.length;
  return ALL_STATUSES.map((status) => {
    const count = analyses.filter((a) => a.status === status).length;
    return { status, count, ratio: total === 0 ? 0 : count / total };
  });
}

export interface SuggestedAnalysisRow {
  id: string;
  modelVersion: string;
  topClass: string | null;
}

export interface ConfirmedFieldRow {
  analysisId: string | null;
  interestId: string;
  acceptedModelCandidate: boolean | null;
}

export interface FieldAcceptanceRate {
  interestId: string;
  candidateCount: number;
  acceptedCount: number;
  rate: number;
}

/**
 * 분야별 모델 후보 수락률 — 판정이 suggested였고 이 분야가 후보였던 분석들 중, 실제로 그
 * 분석을 그대로 수락해(activity_fields.accepted_model_candidate=true) 확정한 비율.
 * suggestedAnalyses는 호출부가 status==='suggested'인 것만 미리 걸러서 넘긴다.
 */
export function computeFieldAcceptanceRates(
  suggestedAnalyses: SuggestedAnalysisRow[],
  classFieldMap: ModelClassFieldMapRow[],
  confirmedFields: ConfirmedFieldRow[]
): FieldAcceptanceRate[] {
  const candidateCount = new Map<string, number>();
  const acceptedCount = new Map<string, number>();

  for (const analysis of suggestedAnalyses) {
    if (!analysis.topClass) continue;
    const candidates = resolveCandidateInterestIds(analysis.topClass, analysis.modelVersion, classFieldMap);
    for (const interestId of candidates) {
      candidateCount.set(interestId, (candidateCount.get(interestId) ?? 0) + 1);
      const accepted = confirmedFields.some(
        (f) => f.analysisId === analysis.id && f.interestId === interestId && f.acceptedModelCandidate === true
      );
      if (accepted) acceptedCount.set(interestId, (acceptedCount.get(interestId) ?? 0) + 1);
    }
  }

  return [...candidateCount.entries()].map(([interestId, count]) => ({
    interestId,
    candidateCount: count,
    acceptedCount: acceptedCount.get(interestId) ?? 0,
    rate: count === 0 ? 0 : (acceptedCount.get(interestId) ?? 0) / count,
  }));
}
