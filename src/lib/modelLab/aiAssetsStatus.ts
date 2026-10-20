import { stat } from "node:fs/promises";
import path from "node:path";

export interface AiAssetsStatus {
  ocrReady: boolean;
  embeddingReady: boolean;
}

/** public/ 아래 파일이 존재하는지만 본다 — 내용은 확인하지 않는다(가짜로 판정하지 않기 위해
 * 최소한만 확인). "텍스트 AI 미리보기" 섹션은 서버 컴포넌트에서 이 결과를 받아, 파일이 없으면
 * 미리보기를 끄고 "npm run fetch:ai-assets를 실행하세요" 안내만 보여준다(가이드 8장 1/5번). */
async function exists(relativeFromPublic: string): Promise<boolean> {
  try {
    await stat(path.join(process.cwd(), "public", relativeFromPublic));
    return true;
  } catch {
    return false;
  }
}

export async function loadAiAssetsStatus(): Promise<AiAssetsStatus> {
  const [ocrReady, embeddingReady] = await Promise.all([
    exists("ocr/worker.min.js"),
    exists("models/text-embedding/Xenova/multilingual-e5-small/onnx/model_quantized.onnx"),
  ]);
  return { ocrReady, embeddingReady };
}
