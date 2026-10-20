import { beforeEach, describe, expect, it, vi } from "vitest";

// 포스터 2차 후처리 P1(가이드 8/12장): @huggingface/transformers는 실제 ONNX 모델을 불러오므로
// jsdom 단위 테스트에서는 라이브러리를 목(mock)으로 바꾸고, textEmbedding.ts의 오케스트레이션
// (로컬 경로 설정, 모델 재사용, 실패를 예외로 던지지 않고 null로 돌려주는 것)만 검증한다.

const pipelineMock = vi.fn();
function freshEnv() {
  return {
    allowRemoteModels: true,
    allowLocalModels: false,
    localModelPath: "",
    backends: { onnx: { wasm: {} as Record<string, unknown> } },
  };
}
let envMock = freshEnv();

vi.mock("@huggingface/transformers", () => ({
  pipeline: (...args: unknown[]) => pipelineMock(...args),
  get env() {
    return envMock;
  },
}));

beforeEach(() => {
  vi.resetModules();
  pipelineMock.mockReset();
  envMock = freshEnv();
});

describe("embedTexts", () => {
  it("texts가 비어 있으면 null을 돌려주고 pipeline을 불러오지 않는다", async () => {
    const { embedTexts } = await import("@/lib/poster/textEmbedding");
    const result = await embedTexts([]);
    expect(result).toBeNull();
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it("성공하면 정규화된 벡터 배열을 돌려주고, 로컬 경로·오프라인 설정을 적용한다", async () => {
    const extractor = vi.fn().mockResolvedValue({ tolist: () => [[0.6, 0.8]] });
    pipelineMock.mockResolvedValue(extractor);

    const { embedTexts } = await import("@/lib/poster/textEmbedding");
    const result = await embedTexts(["해커톤 모집"]);

    expect(result).toEqual([[0.6, 0.8]]);
    expect(envMock.allowRemoteModels).toBe(false);
    expect(envMock.allowLocalModels).toBe(true);
    expect(envMock.localModelPath).toBe("/models/text-embedding/");
    expect(envMock.backends.onnx.wasm).toEqual(
      expect.objectContaining({
        proxy: true,
        wasmPaths: {
          mjs: "/models/text-embedding/ort/ort-wasm-simd-threaded.mjs",
          wasm: "/models/text-embedding/ort/ort-wasm-simd-threaded.wasm",
        },
      })
    );
    expect(pipelineMock).toHaveBeenCalledWith("feature-extraction", "Xenova/multilingual-e5-small", { dtype: "q8" });
    expect(extractor).toHaveBeenCalledWith(["query: 해커톤 모집"], { pooling: "mean", normalize: true });
  });

  it("pipeline 로딩 자체가 실패하면 null을 돌려주고 예외를 던지지 않는다", async () => {
    pipelineMock.mockRejectedValue(new Error("model load failed"));
    const { embedTexts } = await import("@/lib/poster/textEmbedding");
    const result = await embedTexts(["텍스트"]);
    expect(result).toBeNull();
  });

  it("추론 자체가 실패해도 null을 돌려주고 예외를 던지지 않는다", async () => {
    const extractor = vi.fn().mockRejectedValue(new Error("inference failed"));
    pipelineMock.mockResolvedValue(extractor);
    const { embedTexts } = await import("@/lib/poster/textEmbedding");
    const result = await embedTexts(["텍스트"]);
    expect(result).toBeNull();
  });

  it("모델은 한 번만 로드해 재사용한다", async () => {
    const extractor = vi.fn().mockResolvedValue({ tolist: () => [[1, 0]] });
    pipelineMock.mockResolvedValue(extractor);

    const { embedTexts } = await import("@/lib/poster/textEmbedding");
    await embedTexts(["첫 번째"]);
    await embedTexts(["두 번째"]);

    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(extractor).toHaveBeenCalledTimes(2);
  });

  it("로딩이 실패한 뒤 다시 호출하면 재시도한다", async () => {
    const extractor = vi.fn().mockResolvedValue({ tolist: () => [[1, 0]] });
    pipelineMock.mockRejectedValueOnce(new Error("first attempt failed")).mockResolvedValueOnce(extractor);

    const { embedTexts } = await import("@/lib/poster/textEmbedding");
    const first = await embedTexts(["텍스트"]);
    const second = await embedTexts(["텍스트"]);

    expect(first).toBeNull();
    expect(second).toEqual([[1, 0]]);
    expect(pipelineMock).toHaveBeenCalledTimes(2);
  });
});

describe("getEmbeddingModelLoadDurationMs / getEmbeddingModelId", () => {
  it("로드하기 전에는 null이다", async () => {
    const { getEmbeddingModelLoadDurationMs } = await import("@/lib/poster/textEmbedding");
    expect(getEmbeddingModelLoadDurationMs()).toBeNull();
  });

  it("성공적으로 로드하면 로딩 시간(ms 이상 0)과 모델 이름을 돌려준다", async () => {
    const extractor = vi.fn().mockResolvedValue({ tolist: () => [[1, 0]] });
    pipelineMock.mockResolvedValue(extractor);

    const { embedTexts, getEmbeddingModelLoadDurationMs, getEmbeddingModelId } = await import("@/lib/poster/textEmbedding");
    await embedTexts(["텍스트"]);

    expect(getEmbeddingModelLoadDurationMs()).toBeGreaterThanOrEqual(0);
    expect(getEmbeddingModelId()).toBe("Xenova/multilingual-e5-small");
  });
});

describe("cosineSimilarity", () => {
  it("완전히 같은 벡터는 1이다", async () => {
    const { cosineSimilarity } = await import("@/lib/poster/textEmbedding");
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("정반대 벡터는 -1이다", async () => {
    const { cosineSimilarity } = await import("@/lib/poster/textEmbedding");
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("직교하는 벡터는 0이다", async () => {
    const { cosineSimilarity } = await import("@/lib/poster/textEmbedding");
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("길이가 다르면 0이다", async () => {
    const { cosineSimilarity } = await import("@/lib/poster/textEmbedding");
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("빈 벡터거나 영벡터면 0이다", async () => {
    const { cosineSimilarity } = await import("@/lib/poster/textEmbedding");
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
