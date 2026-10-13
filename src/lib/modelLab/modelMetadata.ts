import { readFile } from "node:fs/promises";
import path from "node:path";

export interface PosterModelMetadata {
  labels: string[];
  /** 가이드 5.1 메모 그대로 — 공식 "version" 필드가 없어 timeStamp를 버전 식별자로 쓴다. */
  modelVersion: string;
}

/**
 * /admin/model-lab의 "모델 등록" 섹션은 서버 컴포넌트에서 돈다(브라우저 fetch가 아니라 파일시스템
 * 직접 읽기) — 배포된 모델이 있는지와 그 labels를 등록 버튼을 그리기 전에 알아야 하기 때문이다.
 * 파일이 없거나 형식이 올바르지 않으면 null(= "모델 미설치")을 반환한다 — 가짜 메타데이터를 만들지 않는다.
 */
export async function loadPosterModelMetadataFromDisk(modelPath: string): Promise<PosterModelMetadata | null> {
  const relative = modelPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const filePath = path.join(process.cwd(), "public", relative, "metadata.json");

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const obj = parsed as { labels?: unknown; timeStamp?: unknown };
  if (!Array.isArray(obj.labels)) return null;
  const labels = obj.labels.filter((l): l is string => typeof l === "string");
  const modelVersion = typeof obj.timeStamp === "string" && obj.timeStamp.trim() !== "" ? obj.timeStamp : "unknown";
  return { labels, modelVersion };
}
