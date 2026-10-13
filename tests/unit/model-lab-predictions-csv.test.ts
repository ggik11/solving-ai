import { describe, expect, it } from "vitest";
import { parsePredictionsCsv } from "@/lib/modelLab/predictionsCsv";

const HEADER = "id,true_label,predicted_label,top_score,margin,split,org_name";

describe("parsePredictionsCsv (가이드 6.3, 모델 평가 화면의 목 예측 입력 경로)", () => {
  it("정상적인 행을 파싱한다", () => {
    const csv = [HEADER, "1,IT_DATA,IT_DATA,0.9,0.8,test,A재단"].join("\n");
    const { predictions, errors } = parsePredictionsCsv(csv);
    expect(errors).toEqual([]);
    expect(predictions).toEqual([
      { id: "1", trueLabel: "IT_DATA", predictedLabel: "IT_DATA", topScore: 0.9, margin: 0.8, split: "test", orgName: "A재단" },
    ]);
  });

  it("예측 실패(모델 없음) 행은 predicted_label·점수가 비어 있어도 된다", () => {
    const csv = [HEADER, "1,IT_DATA,,,,train,A재단"].join("\n");
    const { predictions, errors } = parsePredictionsCsv(csv);
    expect(errors).toEqual([]);
    expect(predictions[0]).toMatchObject({ predictedLabel: null, topScore: null, margin: null });
  });

  it("필수 컬럼이 없으면 전체를 거부한다", () => {
    const { predictions, errors } = parsePredictionsCsv("id,true_label\n1,IT_DATA");
    expect(predictions).toEqual([]);
    expect(errors[0].message).toContain("필수 컬럼");
  });

  it("split 값이 올바르지 않으면 그 행을 거부한다", () => {
    const csv = [HEADER, "1,IT_DATA,IT_DATA,0.9,0.8,invalid,A재단"].join("\n");
    const { predictions, errors } = parsePredictionsCsv(csv);
    expect(predictions).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});
