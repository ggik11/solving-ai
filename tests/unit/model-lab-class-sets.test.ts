import { describe, expect, it } from "vitest";
import { activeClassIds, labelsMatchClassSet, type ClassifierClassSet } from "@/lib/modelLab/classSets";

describe("activeClassIds (가이드 3.6 보완)", () => {
  it("활성 구성의 class_id를 반환한다", () => {
    const sets: ClassifierClassSet[] = [
      { id: "1", code: "old", name: "old", isActive: false, classIds: ["A"] },
      { id: "2", code: "pilot-4-v1", name: "예비 실험 4클래스 구성", isActive: true, classIds: ["IT_DATA", "DESIGN_MEDIA"] },
    ];
    expect(activeClassIds(sets)).toEqual(["IT_DATA", "DESIGN_MEDIA"]);
  });

  it("활성 구성이 없으면 빈 배열이다", () => {
    const sets: ClassifierClassSet[] = [{ id: "1", code: "old", name: "old", isActive: false, classIds: ["A"] }];
    expect(activeClassIds(sets)).toEqual([]);
  });
});

describe("labelsMatchClassSet", () => {
  it("순서가 달라도 같은 집합이면 일치한다", () => {
    expect(labelsMatchClassSet(["B", "A"], ["A", "B"])).toBe(true);
  });

  it("개수가 다르면 불일치한다", () => {
    expect(labelsMatchClassSet(["A"], ["A", "B"])).toBe(false);
  });

  it("값이 다르면 불일치한다", () => {
    expect(labelsMatchClassSet(["A", "C"], ["A", "B"])).toBe(false);
  });

  it("중복은 무시하고 비교한다", () => {
    expect(labelsMatchClassSet(["A", "A", "B"], ["A", "B"])).toBe(true);
  });
});
