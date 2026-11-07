import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error -- 테스트 환경임을 React에 알려 act() 경고를 없앤다(react-dom/test-utils 안내).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { PosterClassifierPanel } from "@/components/PosterClassifierPanel";
import type { PosterModelLoader } from "@/lib/poster/modelLoader";
import type { ModelClassFieldMapRow } from "@/lib/poster/classifier";

vi.mock("@/lib/poster/actions", () => ({
  findCachedPosterAnalysisAction: vi.fn().mockResolvedValue(null),
  recordPosterAnalysisAction: vi.fn().mockResolvedValue({ ok: true, analysisId: "analysis-1" }),
  lookupModelClassFieldMapAction: vi.fn(
    async (): Promise<ModelClassFieldMapRow[]> => [
      { modelVersion: "test-version-1", classId: "IT_ENGINEERING", interestId: "interest-it" },
    ]
  ),
  lookupOrgFieldHistoryAction: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/poster/ocr", () => ({
  recognizeImageText: vi.fn().mockResolvedValue({ text: "", durationMs: 0, ok: true }),
  terminateOcrWorker: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/poster/embeddingClassifier", () => ({
  loadEmbeddingReference: vi.fn().mockResolvedValue(null),
}));

// jsdom에는 2d 캔버스 백엔드가 없어 실제 드로잉을 할 수 없다 — 패널이 postprocess까지
// 도달하는지만 보는 이 테스트에서는 전처리 결과물 자체는 중요하지 않으므로 목으로 대체한다.
vi.mock("@/lib/poster/preprocess", () => ({
  PREPROCESS_VERSION: "pad-square-v1",
  computeSquarePlacement: vi.fn(),
  renderToSquareCanvas: vi.fn().mockReturnValue({} as HTMLCanvasElement),
}));

const SCORES = [
  { classId: "IT_ENGINEERING", score: 0.9 },
  { classId: "BUSINESS_PLANNING", score: 0.02 },
  { classId: "DESIGN_MEDIA", score: 0.02 },
  { classId: "SOCIAL_ENVIRONMENT", score: 0.02 },
  { classId: "LAW_POLICY", score: 0.02 },
  { classId: "CAMPUS_NOTICE", score: 0.01 },
  { classId: "HOBBY_CULTURE", score: 0.01 },
];

function buildMockLoader(): PosterModelLoader {
  return {
    load: vi.fn().mockResolvedValue({
      labels: SCORES.map((s) => s.classId),
      modelVersion: "test-version-1",
      predict: vi.fn().mockResolvedValue(SCORES),
    }),
  };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("PosterClassifierPanel — 2차 보완 결과 접이식 영역 (가이드 12장 패널 구성)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // jsdom에는 createImageBitmap이 없다 — 패널이 쓰는 치수(width/height)만 흉내 낸다.
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({ width: 800, height: 600 }) as unknown as typeof createImageBitmap;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("1차 TM 점수 막대를 맨 위에 보여주고, 2차 보완 결과는 그 아래 접힌 <details>로 보여준다", async () => {
    await act(async () => {
      root.render(
        <PosterClassifierPanel variant="preview" activityId={null} interests={[]} loader={buildMockLoader()} />
      );
    });

    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3, 4])], "poster.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });

    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      for (let i = 0; i < 10; i++) await flush();
    });

    const scoreHeading = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("모델 분류 점수")
    );
    expect(scoreHeading).toBeTruthy();

    const details = container.querySelector("details");
    expect(details).toBeTruthy();
    // 접이식 영역은 기본적으로 닫혀 있어야 한다.
    expect(details?.hasAttribute("open")).toBe(false);

    const summary = details?.querySelector("summary");
    expect(summary?.textContent).toBe("2차 보완 결과");

    // 1차 점수 막대가 2차 보완 결과보다 DOM상 먼저 와야 한다(맨 위에 보여줘야 한다는 요구사항).
    expect(scoreHeading!.compareDocumentPosition(details!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // 2차 보완 결과 내용(최종 후보/신호별 1위/근거 키워드 자리)이 접이식 영역 안에 있다.
    expect(details?.textContent).toContain("최종 순위");
    expect(details?.textContent).toMatch(/TM 단독 판정|신호별 1위/);
  });
});
