import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 포스터 2차 후처리 P1(가이드 8/12장): tesseract.js는 실제 worker/wasm을 띄우므로 jsdom
// 단위 테스트에서는 라이브러리를 목(mock)으로 바꾸고, ocr.ts의 오케스트레이션(워커 재사용,
// 타임아웃, 실패를 예외로 던지지 않고 ok=false로 돌려주는 것)만 검증한다.

const createWorkerMock = vi.fn();
vi.mock("tesseract.js", () => ({
  createWorker: (...args: unknown[]) => createWorkerMock(...args),
}));

beforeEach(() => {
  vi.resetModules();
  createWorkerMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recognizeImageText", () => {
  it("성공하면 ok=true와 텍스트, 걸린 시간을 돌려준다", async () => {
    const recognize = vi.fn().mockResolvedValue({ data: { text: "안녕 Hello" } });
    createWorkerMock.mockResolvedValue({ recognize, terminate: vi.fn().mockResolvedValue(undefined) });

    const { recognizeImageText } = await import("@/lib/poster/ocr");
    const result = await recognizeImageText(new File([], "poster.png"));

    expect(result.ok).toBe(true);
    expect(result.text).toBe("안녕 Hello");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("public/ocr/의 로컬 경로로 worker를 만든다(외부 CDN 경로를 쓰지 않는다)", async () => {
    const recognize = vi.fn().mockResolvedValue({ data: { text: "" } });
    createWorkerMock.mockResolvedValue({ recognize, terminate: vi.fn() });

    const { recognizeImageText } = await import("@/lib/poster/ocr");
    await recognizeImageText(new File([], "poster.png"));

    expect(createWorkerMock).toHaveBeenCalledWith(
      "kor+eng",
      undefined,
      expect.objectContaining({
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr/core/",
        langPath: "/ocr/lang/",
      })
    );
  });

  it("createWorker 자체가 실패해도 ok=false, 빈 text를 돌려주고 예외를 던지지 않는다", async () => {
    createWorkerMock.mockRejectedValue(new Error("core load failed"));

    const { recognizeImageText } = await import("@/lib/poster/ocr");
    const result = await recognizeImageText(new File([], "poster.png"));

    expect(result).toEqual(expect.objectContaining({ ok: false, text: "" }));
  });

  it("recognize가 실패해도 ok=false, 빈 text를 돌려주고 예외를 던지지 않는다", async () => {
    const recognize = vi.fn().mockRejectedValue(new Error("decode failed"));
    createWorkerMock.mockResolvedValue({ recognize, terminate: vi.fn() });

    const { recognizeImageText } = await import("@/lib/poster/ocr");
    const result = await recognizeImageText(new File([], "poster.png"));

    expect(result.ok).toBe(false);
    expect(result.text).toBe("");
  });

  it("timeoutMs 안에 끝나지 않으면 ok=false를 돌려주고 멈춰 있는 worker를 종료한다", async () => {
    const terminate = vi.fn().mockResolvedValue(undefined);
    const recognize = vi.fn().mockImplementation(() => new Promise(() => {})); // 절대 끝나지 않음
    createWorkerMock.mockResolvedValue({ recognize, terminate });

    const { recognizeImageText } = await import("@/lib/poster/ocr");
    const result = await recognizeImageText(new File([], "poster.png"), 10);

    expect(result.ok).toBe(false);
    expect(result.text).toBe("");
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("worker를 재사용한다 — createWorker는 한 번만 호출된다", async () => {
    const recognize = vi.fn().mockResolvedValue({ data: { text: "x" } });
    createWorkerMock.mockResolvedValue({ recognize, terminate: vi.fn() });

    const { recognizeImageText } = await import("@/lib/poster/ocr");
    await recognizeImageText(new File([], "a.png"));
    await recognizeImageText(new File([], "b.png"));

    expect(createWorkerMock).toHaveBeenCalledTimes(1);
    expect(recognize).toHaveBeenCalledTimes(2);
  });
});

describe("terminateOcrWorker", () => {
  it("worker를 만든 적이 없으면 아무 일도 하지 않는다", async () => {
    const { terminateOcrWorker } = await import("@/lib/poster/ocr");
    await expect(terminateOcrWorker()).resolves.toBeUndefined();
    expect(createWorkerMock).not.toHaveBeenCalled();
  });

  it("만든 worker가 있으면 terminate를 호출한다(페이지를 떠날 때 정리)", async () => {
    const terminate = vi.fn().mockResolvedValue(undefined);
    createWorkerMock.mockResolvedValue({ recognize: vi.fn().mockResolvedValue({ data: { text: "" } }), terminate });

    const { recognizeImageText, terminateOcrWorker } = await import("@/lib/poster/ocr");
    await recognizeImageText(new File([], "a.png"));
    await terminateOcrWorker();

    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
