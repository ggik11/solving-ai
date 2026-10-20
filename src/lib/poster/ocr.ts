/**
 * 포스터 2차 후처리 P1(가이드 8장) — OCR. tesseract.js를 동적 import로 불러와, 전처리 전
 * 원본 이미지에서 글자를 읽는다. worker/core/언어 파일은 모두 public/ocr/의 로컬 경로만
 * 가리킨다(가이드 8.4) — 실행 중에 외부 CDN으로 요청하지 않는다. 이미지와 OCR 결과 텍스트는
 * 이 함수 호출자가 서버로 보내지 않는 한 브라우저 밖으로 나가지 않는다(이 모듈 자체는 네트워크
 * 호출을 하지 않는다).
 */

const WORKER_PATH = "/ocr/worker.min.js";
const CORE_PATH = "/ocr/core/";
const LANG_PATH = "/ocr/lang/";
const LANGS = "kor+eng";
const DEFAULT_TIMEOUT_MS = 20000;

export interface OcrResult {
  text: string;
  durationMs: number;
  ok: boolean;
}

type TesseractWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker(LANGS, undefined, {
        workerPath: WORKER_PATH,
        corePath: CORE_PATH,
        langPath: LANG_PATH,
      });
    })().catch((error) => {
      workerPromise = null; // 다음 호출이 다시 시도할 수 있게 한다.
      throw error;
    });
  }
  return workerPromise;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`OCR이 ${ms}ms 안에 끝나지 않았습니다.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * 포스터 이미지(전처리 전 원본)에서 글자를 읽는다. 실패하거나 timeoutMs(기본 20초)를 넘기면
 * 예외를 던지지 않고 ok=false와 빈 text를 돌려준다 — 호출부가 "글자를 못 읽었다"로만 다루면
 * 된다. 시간 초과 시에는 멈춰 있을 수 있는 worker를 종료해 다음 호출이 새로 시작하게 한다.
 */
export async function recognizeImageText(image: File | Blob, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<OcrResult> {
  const start = performance.now();
  try {
    const worker = await getWorker();
    const result = await withTimeout(worker.recognize(image), timeoutMs);
    return { text: result.data.text ?? "", durationMs: performance.now() - start, ok: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes("안에 끝나지 않았습니다")) {
      await terminateOcrWorker();
    }
    return { text: "", durationMs: performance.now() - start, ok: false };
  }
}

/** worker를 정리한다 — 페이지를 떠날 때(컴포넌트 unmount) 호출한다. */
export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  const pending = workerPromise;
  workerPromise = null;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // 이미 실패했거나 종료 중인 worker — 정리 목적이므로 무시한다.
  }
}
