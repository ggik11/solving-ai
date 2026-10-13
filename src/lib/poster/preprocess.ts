/**
 * 전처리 v1(가이드 5.3): 정사각형 여백 채우기 → 224px. 학습 이미지 변환(6장, G4)과 서비스
 * 분석(5장)이 반드시 같은 함수를 쓴다(체크리스트 9번) — 배치 계산(순수 함수, 테스트 가능)과
 * 실제 캔버스 드로잉(브라우저 전용, canvas 2D 컨텍스트가 필요해 단위 테스트하지 않음)을 분리한다.
 */

export const PREPROCESS_VERSION = "pad-square-v1";
export const PREPROCESS_TARGET_SIZE = 224;

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface SquarePlacement {
  targetSize: number;
  scale: number;
  drawWidth: number;
  drawHeight: number;
  offsetX: number;
  offsetY: number;
}

/**
 * 종횡비를 유지한 채 정사각형 캔버스 중앙에 들어가도록 축소 비율과 위치를 계산한다.
 * 정사각형이므로(가이드 5.3 5번) 라이브러리 내부의 중앙 자르기가 내용을 잘라내지 않는다.
 */
export function computeSquarePlacement(
  dims: ImageDimensions,
  targetSize: number = PREPROCESS_TARGET_SIZE
): SquarePlacement {
  if (dims.width <= 0 || dims.height <= 0) {
    throw new Error("이미지 크기가 올바르지 않습니다.");
  }
  const scale = Math.min(targetSize / dims.width, targetSize / dims.height);
  const drawWidth = Math.round(dims.width * scale);
  const drawHeight = Math.round(dims.height * scale);
  const offsetX = Math.round((targetSize - drawWidth) / 2);
  const offsetY = Math.round((targetSize - drawHeight) / 2);
  return { targetSize, scale, drawWidth, drawHeight, offsetX, offsetY };
}

/**
 * 실제 드로잉(흰 배경 채우기 + drawImage, 가이드 5.3 1~5번). canvas 2D 컨텍스트가 있는
 * 브라우저에서만 호출한다 — 배치 계산은 computeSquarePlacement에 분리되어 있어 그쪽만 테스트한다.
 */
export function renderToSquareCanvas(
  image: CanvasImageSource,
  dims: ImageDimensions,
  targetSize: number = PREPROCESS_TARGET_SIZE
): HTMLCanvasElement {
  const plan = computeSquarePlacement(dims, targetSize);
  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 사용할 수 없습니다.");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.drawImage(image, plan.offsetX, plan.offsetY, plan.drawWidth, plan.drawHeight);
  return canvas;
}
