/**
 * 포스터 2차 후처리 2-B 임베딩 분류(가이드 12장, embed-v1). 분야 설명문 + 학습용 포스터 OCR
 * 텍스트의 임베딩(참조 세트, public/models/text-reference/reference-v1.json)과 입력 텍스트의
 * 임베딩을 코사인 유사도로 비교한다. 참조 세트가 없으면(아직 만들지 않았으면) null을 돌려주고
 * 예외를 던지지 않는다 — 2-B 없이도 나머지 신호로 동작해야 한다.
 */
import { cosineSimilarity, embedTexts } from "./textEmbedding";

export const EMBED_VERSION = "embed-v1";
/** reference-v1.json의 version 필드 값이자 파일 경로의 버전 — 참조 세트(파일) 자체의 버전으로,
 * 분류 알고리즘 버전(EMBED_VERSION)과는 별개다(파일 포맷이 바뀌면 이 버전을 올린다). */
export const REFERENCE_VERSION = "reference-v1";

const MAX_INPUT_LENGTH = 1000;
const TOP_K = 3;
/** softmax 온도. 작을수록 1위 분야에 점수가 몰린다(가이드 12장: 점수/0.05 후 softmax). */
const SOFTMAX_TEMPERATURE = 0.05;

export interface EmbeddingReferenceItem {
  label: string;
  source: "description" | "train";
  vector: number[];
}

export interface EmbeddingReference {
  version: string;
  model: string;
  items: EmbeddingReferenceItem[];
}

const REFERENCE_URL = "/models/text-reference/reference-v1.json";

/** public/models/text-reference/reference-v1.json을 읽는다. 파일이 없거나 형식이 올바르지
 * 않으면 null — 2-B를 그냥 건너뛰라는 신호다(예외를 던지지 않는다). */
export async function loadEmbeddingReference(): Promise<EmbeddingReference | null> {
  try {
    const res = await fetch(REFERENCE_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (
      !data ||
      typeof data !== "object" ||
      !Array.isArray((data as { items?: unknown }).items) ||
      (data as { items: unknown[] }).items.length === 0
    ) {
      return null;
    }
    return data as EmbeddingReference;
  } catch {
    return null;
  }
}

/**
 * 임베딩 입력용 텍스트 정리(가이드 12장): 한글 2글자 이상, 영문 3글자 이상 단어만 남기고
 * 1000자에서 자른다. OCR이 섞어 내는 한 글자짜리 잡음·숫자만 있는 토큰을 걸러낸다. 남는 게
 * 없으면 null.
 */
export function cleanTextForEmbedding(text: string): string | null {
  const tokens = text.match(/[가-힣]+|[A-Za-z]+/g) ?? [];
  const kept = tokens.filter((t) => (/[가-힣]/.test(t) ? t.length >= 2 : t.length >= 3));
  if (kept.length === 0) return null;
  const joined = kept.join(" ");
  return joined.length > MAX_INPUT_LENGTH ? joined.slice(0, MAX_INPUT_LENGTH) : joined;
}

export interface EmbeddingClassification {
  /** label -> 분포(softmax, 합 1). */
  distribution: Record<string, number>;
}

/**
 * text를 정리해 임베딩하고, 참조 세트의 라벨별 벡터와 비교한다. 라벨마다 코사인 유사도 상위
 * TOP_K개를 평균 낸 값을 "원점수"로 쓰고, (원점수/0.05)에 softmax를 적용해 분포를 만든다.
 * 텍스트 정리 후 남는 게 없거나 임베딩 모델 로드·추론에 실패하면 null — 예외를 던지지 않는다.
 */
export async function classifyByEmbedding(
  text: string,
  reference: EmbeddingReference
): Promise<EmbeddingClassification | null> {
  const cleaned = cleanTextForEmbedding(text);
  if (!cleaned) return null;

  const vectors = await embedTexts([cleaned]);
  if (!vectors || vectors.length === 0) return null;
  const inputVector = vectors[0];

  const similaritiesByLabel = new Map<string, number[]>();
  for (const item of reference.items) {
    const list = similaritiesByLabel.get(item.label) ?? [];
    list.push(cosineSimilarity(inputVector, item.vector));
    similaritiesByLabel.set(item.label, list);
  }
  if (similaritiesByLabel.size === 0) return null;

  const rawScores = new Map<string, number>();
  for (const [label, sims] of similaritiesByLabel) {
    const top = [...sims].sort((a, b) => b - a).slice(0, TOP_K);
    rawScores.set(label, top.reduce((a, b) => a + b, 0) / top.length);
  }

  const maxScore = Math.max(...rawScores.values());
  let sumExp = 0;
  const exps = new Map<string, number>();
  for (const [label, score] of rawScores) {
    const e = Math.exp((score - maxScore) / SOFTMAX_TEMPERATURE);
    exps.set(label, e);
    sumExp += e;
  }

  const distribution: Record<string, number> = {};
  for (const [label, e] of exps) distribution[label] = e / sumExp;

  return { distribution };
}
