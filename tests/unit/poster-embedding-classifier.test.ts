import { beforeEach, describe, expect, it, vi } from "vitest";

// 포스터 2차 후처리 2-B(가이드 12장): embedTexts(실제 ONNX 모델)만 목으로 바꾸고,
// cosineSimilarity는 실제 구현을 그대로 쓴다 — 상위 3개 평균·softmax 계산 자체를 검증한다.
const embedTextsMock = vi.fn();
vi.mock("@/lib/poster/textEmbedding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/poster/textEmbedding")>();
  return { ...actual, embedTexts: (...args: unknown[]) => embedTextsMock(...args) };
});

import {
  classifyByEmbedding,
  cleanTextForEmbedding,
  loadEmbeddingReference,
  EMBED_VERSION,
  type EmbeddingReference,
} from "@/lib/poster/embeddingClassifier";

beforeEach(() => {
  embedTextsMock.mockReset();
});

describe("cleanTextForEmbedding (가이드 12장)", () => {
  it("한글 2글자 미만·영문 3글자 미만·숫자만 있는 토큰을 뺀다", () => {
    expect(cleanTextForEmbedding("AI 가 2026 팀 해커톤")).toBe("해커톤");
  });

  it("조건을 만족하는 단어는 원래 순서대로 공백으로 이어 붙인다", () => {
    expect(cleanTextForEmbedding("해커톤 Data 분석")).toBe("해커톤 Data 분석");
  });

  it("1000자를 넘으면 자른다", () => {
    const longWord = "가나다라마바사아자차".repeat(150); // 1500자, 전부 2글자 이상 조건 통과
    const cleaned = cleanTextForEmbedding(longWord);
    expect(cleaned).not.toBeNull();
    expect(cleaned!.length).toBeLessThanOrEqual(1000);
  });

  it("남는 단어가 없으면 null이다", () => {
    expect(cleanTextForEmbedding("22 1 2026 a to")).toBeNull();
  });
});

describe("EMBED_VERSION", () => {
  it("embed-v1이다", () => {
    expect(EMBED_VERSION).toBe("embed-v1");
  });
});

describe("loadEmbeddingReference (가이드 12장)", () => {
  it("응답이 실패(404 등)하면 null이다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false })
    );
    expect(await loadEmbeddingReference()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("fetch 자체가 실패해도(네트워크 오류) null이고 예외를 던지지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error"))
    );
    await expect(loadEmbeddingReference()).resolves.toBeNull();
    vi.unstubAllGlobals();
  });

  it("items가 없거나 비어 있으면 null이다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: "reference-v1", items: [] }) })
    );
    expect(await loadEmbeddingReference()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("정상 응답이면 그대로 돌려준다", async () => {
    const payload = { version: "reference-v1", model: "Xenova/multilingual-e5-small", items: [{ label: "A", source: "description", vector: [1, 0] }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    expect(await loadEmbeddingReference()).toEqual(payload);
    vi.unstubAllGlobals();
  });
});

describe("classifyByEmbedding — 정리·top3 평균·softmax(가이드 12장)", () => {
  const reference: EmbeddingReference = {
    version: "reference-v1",
    model: "test-model",
    items: [
      { label: "A", source: "description", vector: [1, 0] },
      { label: "A", source: "train", vector: [1, 0] },
      { label: "A", source: "train", vector: [0.9, 0.1] },
      { label: "B", source: "description", vector: [0, 1] },
    ],
  };

  it("입력 벡터와 가장 가까운 라벨이 압도적으로 높은 확률을 받는다", async () => {
    embedTextsMock.mockResolvedValue([[1, 0]]);
    const result = await classifyByEmbedding("해커톤 참가자 모집", reference);
    expect(result).not.toBeNull();
    expect(result!.distribution.A).toBeGreaterThan(0.99);
    expect(result!.distribution.B).toBeLessThan(0.01);
  });

  it("라벨의 참조 벡터가 3개보다 적으면 있는 만큼만 평균 낸다", async () => {
    embedTextsMock.mockResolvedValue([[0, 1]]);
    const result = await classifyByEmbedding("취미 동아리 모집", reference);
    expect(result).not.toBeNull();
    expect(result!.distribution.B).toBeGreaterThan(result!.distribution.A);
  });

  it("정리 후 남는 텍스트가 없으면 null이고 임베딩을 부르지 않는다", async () => {
    const result = await classifyByEmbedding("22 1 2026", reference);
    expect(result).toBeNull();
    expect(embedTextsMock).not.toHaveBeenCalled();
  });

  it("임베딩 모델이 null을 돌려주면(로드·추론 실패) null이다", async () => {
    embedTextsMock.mockResolvedValue(null);
    const result = await classifyByEmbedding("해커톤 참가자 모집", reference);
    expect(result).toBeNull();
  });

  it("참조 세트가 비어 있으면 null이다", async () => {
    embedTextsMock.mockResolvedValue([[1, 0]]);
    const result = await classifyByEmbedding("해커톤 참가자 모집", { version: "v1", model: "m", items: [] });
    expect(result).toBeNull();
  });
});
