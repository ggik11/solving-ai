import { describe, expect, it } from "vitest";
import { applyCandidateSelection, resolveSecondarySelection } from "@/lib/poster/fieldSelection";

describe("applyCandidateSelection (가이드 5.4 4번)", () => {
  it("대표가 비어 있으면 후보를 대표로 채운다", () => {
    const result = applyCandidateSelection({ primary: null, secondary: [] }, "IT_DATA");
    expect(result).toEqual({ primary: "IT_DATA", secondary: [] });
  });

  it("대표가 이미 있고 후보가 다르면 부가에 추가한다", () => {
    const result = applyCandidateSelection({ primary: "IT_DATA", secondary: [] }, "DESIGN_MEDIA");
    expect(result).toEqual({ primary: "IT_DATA", secondary: ["DESIGN_MEDIA"] });
  });

  it("같은 후보를 두 번 눌러도 부가에 중복으로 쌓이지 않는다", () => {
    const once = applyCandidateSelection({ primary: "IT_DATA", secondary: [] }, "DESIGN_MEDIA");
    const twice = applyCandidateSelection(once, "DESIGN_MEDIA");
    expect(twice).toEqual(once);
  });

  it("후보가 이미 대표와 같으면 상태를 바꾸지 않는다", () => {
    const state = { primary: "IT_DATA", secondary: [] };
    const result = applyCandidateSelection(state, "IT_DATA");
    expect(result).toBe(state);
  });
});

describe("resolveSecondarySelection", () => {
  it("대표와 같은 분야를 부가에서 제거한다", () => {
    expect(resolveSecondarySelection("IT_DATA", ["IT_DATA", "DESIGN_MEDIA"])).toEqual(["DESIGN_MEDIA"]);
  });

  it("중복을 제거한다", () => {
    expect(resolveSecondarySelection(null, ["DESIGN_MEDIA", "DESIGN_MEDIA"])).toEqual(["DESIGN_MEDIA"]);
  });
});
