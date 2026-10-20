/**
 * 포스터 2차 후처리 P1(가이드 8장) — 문장 임베딩. @huggingface/transformers(Transformers.js)를
 * 동적 import로 불러와 다국어 문장 임베딩 모델(Xenova/multilingual-e5-small, quantized ONNX,
 * 가이드 8.4)을 브라우저 안에서 돌린다. 모델·토크나이저·onnxruntime-web의 wasm 런타임 모두
 * public/models/text-embedding/의 로컬 경로만 가리킨다(allowRemoteModels=false) — 실행 중에
 * Hugging Face나 다른 CDN으로 요청하지 않는다. 임베딩 입력 텍스트는 이 함수 호출자가 서버로
 * 보내지 않는 한 브라우저 밖으로 나가지 않는다(이 모듈 자체는 네트워크 호출을 하지 않는다).
 */

const MODEL_ID = "Xenova/multilingual-e5-small";
const LOCAL_MODEL_PATH = "/models/text-embedding/";
const ORT_WASM_DIR = "/models/text-embedding/ort/";
/** e5 계열은 입력 앞에 역할별 접두어가 필요하다 — 여기서는 포스터 텍스트를 서로 비교하는
 * 용도이므로 전부 "query: "를 붙인다(e5 공식 사용법의 질의/문서 구분 중 질의 쪽 규칙). */
const E5_QUERY_PREFIX = "query: ";

interface EmbeddingTensor {
  tolist(): number[][];
}
type Extractor = (texts: string[], options: { pooling: "mean"; normalize: true }) => Promise<EmbeddingTensor>;

let extractorPromise: Promise<Extractor> | null = null;
let modelLoadDurationMs: number | null = null;

async function loadExtractor(): Promise<Extractor> {
  const loadStart = performance.now();
  const { pipeline, env } = await import("@huggingface/transformers");

  env.allowRemoteModels = false;
  // allowLocalModels는 브라우저 환경에서 기본값이 false다(Node 등에서는 기본 true) —
  // 명시적으로 켜지 않으면 "로컬도 원격도 둘 다 꺼짐" 오류가 난다
  // (node_modules/@huggingface/transformers/src/env.js, utils/hub.js 참고).
  env.allowLocalModels = true;
  env.localModelPath = LOCAL_MODEL_PATH;
  // onnx 백엔드는 @huggingface/transformers를 import하는 시점에 라이브러리가 이미 초기화해 둔다
  // (node_modules/@huggingface/transformers/src/backends/onnx.js) — 타입상으로는 optional이지만
  // 이 시점엔 항상 있다.
  const wasmEnv = env.backends.onnx.wasm;
  if (!wasmEnv) throw new Error("onnxruntime-web wasm 백엔드를 초기화하지 못했습니다.");
  // wasm 런타임 경로를 로컬로 고정한다 — 설정하지 않으면 라이브러리가 기본값으로 jsDelivr CDN을
  // 쓰려고 한다(위 backends/onnx.js 참고).
  wasmEnv.wasmPaths = {
    mjs: `${ORT_WASM_DIR}ort-wasm-simd-threaded.mjs`,
    wasm: `${ORT_WASM_DIR}ort-wasm-simd-threaded.wasm`,
  };
  // 가능하면 Web Worker에서 돌려 화면이 멈추지 않게 한다 — onnxruntime-web이 내부적으로 WASM
  // 백엔드를 별도 worker로 프록시하는 공식 옵션이다.
  wasmEnv.proxy = true;

  const extractor = (await pipeline("feature-extraction", MODEL_ID, { dtype: "q8" })) as unknown as (
    texts: string[],
    options: { pooling: "mean"; normalize: true }
  ) => Promise<EmbeddingTensor>;

  modelLoadDurationMs = performance.now() - loadStart;
  return extractor;
}

function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = loadExtractor().catch((error) => {
      extractorPromise = null; // 다음 호출이 다시 시도할 수 있게 한다.
      throw error;
    });
  }
  return extractorPromise;
}

/** 모델 로딩에 걸린 시간(ms) — 아직 로딩하지 않았거나 실패했으면 null. 관리자 화면에서
 * "모델 로딩 시간"을 보여주는 용도(가이드 8장 5번). */
export function getEmbeddingModelLoadDurationMs(): number | null {
  return modelLoadDurationMs;
}

export function getEmbeddingModelId(): string {
  return MODEL_ID;
}

/**
 * texts를 정규화된(길이 1) 벡터 배열로 바꾼다. texts가 비어 있거나 모델 로드·추론에 실패하면
 * null을 돌려주고 예외를 밖으로 던지지 않는다 — 호출부가 "임베딩을 못 구했다"로만 다루면 된다.
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return null;
  try {
    const extractor = await getExtractor();
    const prefixed = texts.map((t) => `${E5_QUERY_PREFIX}${t}`);
    const output = await extractor(prefixed, { pooling: "mean", normalize: true });
    return output.tolist();
  } catch {
    return null;
  }
}

/** 코사인 유사도. 두 벡터의 길이가 다르거나 비어 있으면(또는 둘 중 하나가 영벡터면) 0을 돌려준다. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
