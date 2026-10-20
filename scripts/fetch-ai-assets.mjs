// 포스터 2차 후처리 P1(가이드 8장) — 브라우저에서 돌릴 OCR·문장 임베딩 파일을 준비한다.
// 실행: npm run fetch:ai-assets
//
// 설계:
// - OCR(tesseract.js) 쪽은 새로 CDN에서 받지 않는다. tesseract.js/tesseract.js-core/
//   @tesseract.js-data/{eng,kor}가 이미 package.json에 정확한 버전으로 고정돼 있고
//   npm install이 그 파일들을 node_modules에 받아 두므로, 이 스크립트는 그 파일들을
//   public/ocr/로 "복사"만 한다 — 버전 고정은 package.json/package-lock.json이 이미 한다.
// - 문장 임베딩 쪽은 npm 패키지가 없어(모델 가중치는 Hugging Face Hub에만 있음) 실제로
//   내려받는다. "정해진 버전"을 보장하기 위해 브랜치(main)가 아니라 고정 커밋(revision)을
//   가리킨다 — 그 커밋의 파일 내용은 절대 바뀌지 않는다.
// - 두 경우 모두 받은 뒤 SHA-256을 미리 적어 둔 값과 비교해 검증한다. 하나라도 다르면
//   스크립트가 실패하고(0이 아닌 종료 코드) 어떤 파일이 문제인지 출력한다 — 브라우저가 조용히
//   손상된 파일을 쓰는 것보다 설치 단계에서 바로 걸러내는 쪽을 택했다.
// - 이 스크립트 자체(실행 시점)에서만 네트워크를 쓴다. 브라우저 런타임 코드
//   (src/lib/poster/ocr.ts, textEmbedding.ts)는 public/ocr/, public/models/text-embedding/
//   같은 로컬 경로만 본다 — 실행 중에 CDN이나 Hugging Face로 요청하지 않는다.

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** node_modules에서 그대로 복사하는 OCR 파일(가이드 8.4) — tesseract.js의 기본 엔진(OEM.LSTM_ONLY)만
 * 쓰므로 LSTM 계열 코어 3종(plain/simd/relaxedsimd)만 받는다. 레거시 엔진용 파일은 받지 않는다. */
const OCR_ASSETS = [
  {
    from: "node_modules/tesseract.js/dist/worker.min.js",
    to: "public/ocr/worker.min.js",
    sha256: "576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d",
  },
  {
    from: "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
    to: "public/ocr/core/tesseract-core-lstm.wasm.js",
    sha256: "eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680",
  },
  {
    from: "node_modules/tesseract.js-core/tesseract-core-lstm.wasm",
    to: "public/ocr/core/tesseract-core-lstm.wasm",
    sha256: "66b17df6e20c5329a17ffa9c202a47eaa3e32500b253d4c7f38e7f2bc01457c3",
  },
  {
    from: "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
    to: "public/ocr/core/tesseract-core-simd-lstm.wasm.js",
    sha256: "c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38",
  },
  {
    from: "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm",
    to: "public/ocr/core/tesseract-core-simd-lstm.wasm",
    sha256: "34e8d50cac216427d86bf397d610fdd9f49492539bbcdfbfccc4eda20c810bea",
  },
  {
    from: "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
    to: "public/ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js",
    sha256: "861a536cf9ef8e63cb644d57bab39c388f37f7d6b6f60024b741c5f6b39a59b3",
  },
  {
    from: "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm",
    to: "public/ocr/core/tesseract-core-relaxedsimd-lstm.wasm",
    sha256: "7985c92d4c64e7267d24cadffe1b2a1da6bf8aa55fdcaf953fe94fe122a24545",
  },
  {
    from: "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    to: "public/ocr/lang/eng.traineddata.gz",
    sha256: "45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91",
  },
  {
    from: "node_modules/@tesseract.js-data/kor/4.0.0_best_int/kor.traineddata.gz",
    to: "public/ocr/lang/kor.traineddata.gz",
    sha256: "78c21276ab14c9bb734d83be1055d9fe5469a4e7e977c51ad385be5737e61126",
  },
];

/** onnxruntime-web의 WASM 런타임(가이드 8.4) — @huggingface/transformers가 기본값으로는
 * "wasmPaths가 설정돼 있지 않으면" jsDelivr CDN에서 내려받도록 돼 있다(node_modules/@huggingface/
 * transformers/src/backends/onnx.js). 그 기본 동작을 쓰면 실행 중에 외부 CDN 요청이 나가므로,
 * node_modules에 이미 받아져 있는 파일(@huggingface/transformers의 전이 의존성)을 복사해 두고
 * textEmbedding.ts가 env.backends.onnx.wasm.wasmPaths로 이 로컬 경로를 가리키게 한다. SIMD+threaded
 * 빌드 하나만 받는다(구형 Safari용 asyncify 빌드는 추가로 ~27MB라 이번 범위에서는 받지 않는다).
 */
const ORT_ASSETS = [
  {
    from: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
    to: "public/models/text-embedding/ort/ort-wasm-simd-threaded.mjs",
    sha256: "c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f",
  },
  {
    from: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
    to: "public/models/text-embedding/ort/ort-wasm-simd-threaded.wasm",
    sha256: "06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3",
  },
];

/** 문장 임베딩 모델(가이드 8.4) — Xenova/multilingual-e5-small, MIT 라이선스(원 모델
 * intfloat/multilingual-e5-small도 MIT). 고정 커밋(main 브랜치가 아님)에서 받는다. */
const EMBEDDING_MODEL_ID = "Xenova/multilingual-e5-small";
const EMBEDDING_REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
const EMBEDDING_FILES = [
  { file: "config.json", sha256: "cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1" },
  { file: "tokenizer.json", sha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39" },
  { file: "tokenizer_config.json", sha256: "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b" },
  { file: "special_tokens_map.json", sha256: "d05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7" },
  { file: "onnx/model_quantized.onnx", sha256: "f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193" },
];
const EMBEDDING_ASSETS = EMBEDDING_FILES.map(({ file, sha256 }) => ({
  url: `https://huggingface.co/${EMBEDDING_MODEL_ID}/resolve/${EMBEDDING_REVISION}/${file}`,
  to: `public/models/text-embedding/${EMBEDDING_MODEL_ID}/${file}`,
  sha256,
}));

function sha256Of(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function existingFileMatches(absPath, expectedSha256) {
  try {
    const buf = await readFile(absPath);
    return sha256Of(buf) === expectedSha256;
  } catch {
    return false;
  }
}

async function copyLocalAsset({ from, to, sha256 }) {
  const srcPath = path.join(projectRoot, from);
  const destPath = path.join(projectRoot, to);

  if (await existingFileMatches(destPath, sha256)) {
    const { size } = await stat(destPath);
    console.log(`  [건너뜀] ${to} (이미 있음, 체크섬 일치, ${size}바이트)`);
    return size;
  }

  let buf;
  try {
    buf = await readFile(srcPath);
  } catch {
    throw new Error(
      `${from}을(를) 찾을 수 없습니다. 먼저 "npm install"을 실행해 tesseract.js 관련 패키지를 받아주세요.`
    );
  }

  const actual = sha256Of(buf);
  if (actual !== sha256) {
    throw new Error(
      `${from}의 체크섬이 예상과 다릅니다(node_modules의 tesseract.js 버전이 package.json과 다른 것 같습니다 — ` +
        `npm install을 다시 실행해 보세요). 예상: ${sha256}, 실제: ${actual}`
    );
  }

  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, buf);
  console.log(`  [복사] ${from} -> ${to} (${buf.length}바이트)`);
  return buf.length;
}

async function downloadRemoteAsset({ url, to, sha256 }) {
  const destPath = path.join(projectRoot, to);

  if (await existingFileMatches(destPath, sha256)) {
    const { size } = await stat(destPath);
    console.log(`  [건너뜀] ${to} (이미 있음, 체크섬 일치, ${size}바이트)`);
    return size;
  }

  console.log(`  [다운로드] ${url}`);
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`${url} 요청에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`${url} 응답이 올바르지 않습니다(HTTP ${response.status}).`);
  }
  const buf = Buffer.from(await response.arrayBuffer());

  const actual = sha256Of(buf);
  if (actual !== sha256) {
    throw new Error(`${to}의 체크섬이 예상과 다릅니다. 예상: ${sha256}, 실제: ${actual} (${url})`);
  }

  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, buf);
  console.log(`  [저장] ${to} (${buf.length}바이트)`);
  return buf.length;
}

async function main() {
  let totalBytes = 0;

  console.log("1) OCR 파일 (tesseract.js worker/core + kor·eng 언어 데이터) -> public/ocr/");
  for (const asset of OCR_ASSETS) {
    totalBytes += await copyLocalAsset(asset);
  }

  console.log("\n2) onnxruntime-web WASM 런타임 (CDN 폴백 방지용) -> public/models/text-embedding/ort/");
  for (const asset of ORT_ASSETS) {
    totalBytes += await copyLocalAsset(asset);
  }

  console.log(`\n3) 문장 임베딩 모델 (${EMBEDDING_MODEL_ID}, 리비전 ${EMBEDDING_REVISION}) -> public/models/text-embedding/`);
  for (const asset of EMBEDDING_ASSETS) {
    totalBytes += await downloadRemoteAsset(asset);
  }

  console.log(`\n완료. 전체 ${(totalBytes / (1024 * 1024)).toFixed(1)}MB.`);
  console.log("이 폴더들은 .gitignore에 등록돼 있어 커밋되지 않습니다 — 다른 환경에서는 각자 이 스크립트를 실행해야 합니다.");
}

main().catch((error) => {
  console.error("\nAI 파일 준비 실패:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
