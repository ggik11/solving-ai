import { describe, expect, it } from "vitest";
import { computeSquarePlacement, PREPROCESS_TARGET_SIZE } from "@/lib/poster/preprocess";

describe("computeSquarePlacement (가이드 5.3 전처리 v1)", () => {
  it("정사각형 이미지는 그대로 꽉 채운다", () => {
    const plan = computeSquarePlacement({ width: 500, height: 500 });
    expect(plan.drawWidth).toBe(PREPROCESS_TARGET_SIZE);
    expect(plan.drawHeight).toBe(PREPROCESS_TARGET_SIZE);
    expect(plan.offsetX).toBe(0);
    expect(plan.offsetY).toBe(0);
  });

  it("가로가 긴 이미지는 가로를 기준으로 축소하고 위아래에 여백을 둔다", () => {
    const plan = computeSquarePlacement({ width: 1000, height: 500 });
    expect(plan.drawWidth).toBe(PREPROCESS_TARGET_SIZE);
    expect(plan.drawHeight).toBe(PREPROCESS_TARGET_SIZE / 2);
    expect(plan.offsetX).toBe(0);
    expect(plan.offsetY).toBeGreaterThan(0);
    // 위아래 여백이 대칭에 가까워야 한다(반올림 오차 1px 이내).
    const bottomMargin = PREPROCESS_TARGET_SIZE - plan.drawHeight - plan.offsetY;
    expect(Math.abs(bottomMargin - plan.offsetY)).toBeLessThanOrEqual(1);
  });

  it("세로가 긴 이미지는 세로를 기준으로 축소하고 좌우에 여백을 둔다", () => {
    const plan = computeSquarePlacement({ width: 300, height: 900 });
    expect(plan.drawHeight).toBe(PREPROCESS_TARGET_SIZE);
    expect(plan.drawWidth).toBeLessThan(PREPROCESS_TARGET_SIZE);
    expect(plan.offsetX).toBeGreaterThan(0);
    expect(plan.offsetY).toBe(0);
  });

  it("전체 포스터가 잘리지 않는다 — 그려지는 영역이 캔버스 범위를 넘지 않는다", () => {
    for (const dims of [{ width: 1000, height: 500 }, { width: 300, height: 900 }, { width: 500, height: 500 }]) {
      const plan = computeSquarePlacement(dims);
      expect(plan.offsetX + plan.drawWidth).toBeLessThanOrEqual(plan.targetSize);
      expect(plan.offsetY + plan.drawHeight).toBeLessThanOrEqual(plan.targetSize);
    }
  });

  it("크기가 0 이하인 이미지는 거부한다", () => {
    expect(() => computeSquarePlacement({ width: 0, height: 100 })).toThrow();
    expect(() => computeSquarePlacement({ width: 100, height: -1 })).toThrow();
  });
});
