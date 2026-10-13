import { describe, expect, it, vi } from "vitest";
import { analyzePoster, buildFailedAnalysisResult, type CachedPosterAnalysis } from "@/lib/poster/analyze";
import { DEFAULT_POSTER_CLASSIFIER_CONFIG, type ModelClassFieldMapRow } from "@/lib/poster/classifier";
import type { LoadedPosterModel } from "@/lib/poster/modelLoader";

// 9장 G3 지시사항: 모델 파일이 없으니 가짜 모델/임의 예측값은 서비스 코드에 만들지 않고,
// 테스트에서만 목(mock)으로 analyzePoster의 오케스트레이션 로직을 검증한다.

const CANVAS = document.createElement("canvas");
const MAP: ModelClassFieldMapRow[] = [{ modelVersion: "v1", classId: "IT_DATA", interestId: "interest-it-data" }];

function fakeModel(labels: string[], scores: { classId: string; score: number }[]): LoadedPosterModel {
  return {
    labels,
    modelVersion: "v1",
    predict: vi.fn().mockResolvedValue(scores),
  };
}

describe("analyzePoster", () => {
  it("캐시가 없으면 모델로 예측하고 판정·후보를 계산한다", async () => {
    const model = fakeModel(["IT_DATA"], [{ classId: "IT_DATA", score: 0.9 }]);
    const findCached = vi.fn().mockResolvedValue(null);

    const result = await analyzePoster({
      activityId: "activity-1",
      posterHash: "hash-1",
      preprocessingVersion: "pad-square-v1",
      model,
      canvas: CANVAS,
      config: DEFAULT_POSTER_CLASSIFIER_CONFIG,
      classFieldMap: MAP,
      findCached,
    });

    expect(model.predict).toHaveBeenCalledWith(CANVAS);
    expect(result.status).toBe("suggested");
    expect(result.candidateInterestIds).toEqual(["interest-it-data"]);
    expect(result.classFieldMapMissing).toBe(false);
    expect(result.fromCache).toBe(false);
  });

  it("캐시가 있으면 모델을 다시 돌리지 않고 기존 결과를 쓴다(가이드 3.5)", async () => {
    const model = fakeModel(["IT_DATA"], [{ classId: "IT_DATA", score: 0.9 }]);
    const cached: CachedPosterAnalysis = {
      scores: [{ classId: "IT_DATA", score: 0.95 }],
      status: "suggested",
      topClass: "IT_DATA",
      topScore: 0.95,
      margin: 0.9,
      failureReason: null,
    };
    const findCached = vi.fn().mockResolvedValue(cached);

    const result = await analyzePoster({
      activityId: "activity-1",
      posterHash: "hash-1",
      preprocessingVersion: "pad-square-v1",
      model,
      canvas: CANVAS,
      config: DEFAULT_POSTER_CLASSIFIER_CONFIG,
      classFieldMap: MAP,
      findCached,
    });

    expect(model.predict).not.toHaveBeenCalled();
    expect(result.fromCache).toBe(true);
    expect(result.topScore).toBe(0.95);
    expect(result.candidateInterestIds).toEqual(["interest-it-data"]);
  });

  it("연결표에 없는 클래스면 classFieldMapMissing을 표시하고 후보를 비운다", async () => {
    const model = fakeModel(["SPORTS"], [{ classId: "SPORTS", score: 0.9 }]);
    const findCached = vi.fn().mockResolvedValue(null);

    const result = await analyzePoster({
      activityId: null,
      posterHash: "hash-2",
      preprocessingVersion: "pad-square-v1",
      model,
      canvas: CANVAS,
      config: DEFAULT_POSTER_CLASSIFIER_CONFIG,
      classFieldMap: MAP,
      findCached,
    });

    expect(result.classFieldMapMissing).toBe(true);
    expect(result.candidateInterestIds).toEqual([]);
  });

  it("확신이 낮으면 needs_review이고 사용자 화면에는 점수를 적합도로 쓰지 않는다(후보만 참고용으로 남김)", async () => {
    const model = fakeModel(
      ["IT_DATA", "DESIGN_MEDIA"],
      [
        { classId: "IT_DATA", score: 0.5 },
        { classId: "DESIGN_MEDIA", score: 0.45 },
      ]
    );
    const findCached = vi.fn().mockResolvedValue(null);

    const result = await analyzePoster({
      activityId: "activity-1",
      posterHash: "hash-3",
      preprocessingVersion: "pad-square-v1",
      model,
      canvas: CANVAS,
      config: DEFAULT_POSTER_CLASSIFIER_CONFIG,
      classFieldMap: MAP,
      findCached,
    });

    expect(result.status).toBe("needs_review");
    expect(result.candidateInterestIds).toEqual(["interest-it-data"]);
  });
});

describe("buildFailedAnalysisResult", () => {
  it("모델 미설치 등 실패를 점수 0이나 특정 분야로 저장하지 않는다(가이드 3.5 체크리스트 7번)", () => {
    const result = buildFailedAnalysisResult({
      posterHash: "hash-4",
      modelVersion: "unknown",
      preprocessingVersion: "pad-square-v1",
      failureReason: "model_missing",
    });
    expect(result.status).toBe("failed");
    expect(result.scores).toEqual([]);
    expect(result.topClass).toBeNull();
    expect(result.candidateInterestIds).toEqual([]);
    expect(result.failureReason).toBe("model_missing");
  });
});
