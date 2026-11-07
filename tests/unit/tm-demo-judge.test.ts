import { describe, expect, it } from "vitest";
import {
  classLabel,
  computeSquarePlacement,
  judgeDemoClassification,
  SUGGEST_MIN_MARGIN,
  SUGGEST_MIN_TOP_SCORE,
  TARGET_SIZE,
} from "../../docs/tm-demo/judge.js";
import { PREPROCESS_TARGET_SIZE } from "@/lib/poster/preprocess";
import { DEFAULT_POSTER_CLASSIFIER_CONFIG } from "@/lib/poster/classifier";

describe("docs/tm-demo/judge.js — 데모 판정 함수", () => {
  it("임계값이 앱의 기본 설정(0.80/0.20, 224px)과 같다", () => {
    expect(SUGGEST_MIN_TOP_SCORE).toBe(DEFAULT_POSTER_CLASSIFIER_CONFIG.suggestMinTopScore);
    expect(SUGGEST_MIN_MARGIN).toBe(DEFAULT_POSTER_CLASSIFIER_CONFIG.suggestMinMargin);
    expect(TARGET_SIZE).toBe(PREPROCESS_TARGET_SIZE);
  });

  it("1위 >= 0.80이고 1·2위 차이 >= 0.20이면 자동 제안이다", () => {
    const result = judgeDemoClassification([
      { classId: "IT_ENGINEERING", score: 0.85 },
      { classId: "HOBBY_CULTURE", score: 0.1 },
      { classId: "LAW_POLICY", score: 0.05 },
    ]);
    expect(result.status).toBe("auto_suggested");
    expect(result.topClass).toBe("IT_ENGINEERING");
    expect(result.secondClass).toBe("HOBBY_CULTURE");
    expect(result.margin).toBeCloseTo(0.75);
  });

  it("1위가 0.80 미만이면 관리자 검토 필요다", () => {
    const result = judgeDemoClassification([
      { classId: "DESIGN_MEDIA", score: 0.4 },
      { classId: "SOCIAL_ENVIRONMENT", score: 0.35 },
    ]);
    expect(result.status).toBe("needs_review");
  });

  it("1위는 높지만 1·2위 차이가 0.20 미만이면 관리자 검토 필요다", () => {
    const result = judgeDemoClassification([
      { classId: "DESIGN_MEDIA", score: 0.85 },
      { classId: "SOCIAL_ENVIRONMENT", score: 0.7 },
    ]);
    expect(result.status).toBe("needs_review");
    expect(result.margin).toBeCloseTo(0.15);
  });

  it("점수를 높은 순으로 정렬해 반환한다", () => {
    const result = judgeDemoClassification([
      { classId: "A", score: 0.1 },
      { classId: "B", score: 0.6 },
      { classId: "C", score: 0.3 },
    ]);
    expect(result.sorted.map((s) => s.classId)).toEqual(["B", "C", "A"]);
  });

  it("점수가 없으면 예외를 던진다", () => {
    expect(() => judgeDemoClassification([])).toThrow();
  });

  it("한글 분야 이름 매핑이 있고, 모르는 클래스는 원본 id를 그대로 돌려준다", () => {
    expect(classLabel("IT_ENGINEERING")).toBe("IT·공학");
    expect(classLabel("CAMPUS_NOTICE")).toBe("교내 행정 공지");
    expect(classLabel("UNKNOWN_CLASS")).toBe("UNKNOWN_CLASS");
  });

  it("전처리 배치 계산이 앱의 pad-square-v1과 같다(정사각형은 그대로 꽉 채운다)", () => {
    const plan = computeSquarePlacement({ width: 500, height: 500 });
    expect(plan.drawWidth).toBe(TARGET_SIZE);
    expect(plan.drawHeight).toBe(TARGET_SIZE);
    expect(plan.offsetX).toBe(0);
    expect(plan.offsetY).toBe(0);
  });

  it("가로가 긴 이미지는 위아래에 여백을 둔다(앱과 동일한 중앙 배치)", () => {
    const plan = computeSquarePlacement({ width: 1000, height: 500 });
    expect(plan.drawWidth).toBe(TARGET_SIZE);
    expect(plan.drawHeight).toBe(TARGET_SIZE / 2);
    expect(plan.offsetY).toBeGreaterThan(0);
  });
});
