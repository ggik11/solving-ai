/**
 * 앱의 전처리(pad-square-v1, src/lib/poster/preprocess.ts)와 1차 판정 규칙
 * (src/lib/poster/classifier.ts의 judgePosterClassification, 기본값 0.80/0.20)을
 * 그대로 옮긴 순수 함수. 같은 이미지가 앱과 같은 점수를 내도록 로직을 바꾸지 않는다.
 */

export const TARGET_SIZE = 224;
export const SUGGEST_MIN_TOP_SCORE = 0.8;
export const SUGGEST_MIN_MARGIN = 0.2;

export const CLASS_LABELS = {
  IT_ENGINEERING: "IT·공학",
  BUSINESS_PLANNING: "경영·기획",
  DESIGN_MEDIA: "디자인·예술·미디어",
  SOCIAL_ENVIRONMENT: "사회·환경",
  LAW_POLICY: "법·정책",
  CAMPUS_NOTICE: "교내 행정 공지",
  HOBBY_CULTURE: "취미·문화생활",
};

export function classLabel(classId) {
  return CLASS_LABELS[classId] ?? classId;
}

/** src/lib/poster/preprocess.ts의 computeSquarePlacement와 동일한 계산. */
export function computeSquarePlacement(dims, targetSize = TARGET_SIZE) {
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

/** src/lib/poster/preprocess.ts의 renderToSquareCanvas와 동일한 드로잉(흰 여백 + 중앙 배치). */
export function renderToSquareCanvas(image, dims, targetSize = TARGET_SIZE) {
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

export function sortScoresDesc(scores) {
  return [...scores].sort((a, b) => b.score - a.score);
}

/**
 * src/lib/poster/classifier.ts의 judgePosterClassification과 동일한 규칙:
 * 1위 점수 >= suggestMinTopScore 이고 1위-2위 차이 >= suggestMinMargin이면 자동 제안.
 */
export function judgeDemoClassification(scores, opts = {}) {
  const topMin = opts.suggestMinTopScore ?? SUGGEST_MIN_TOP_SCORE;
  const marginMin = opts.suggestMinMargin ?? SUGGEST_MIN_MARGIN;
  if (!scores || scores.length === 0) {
    throw new Error("scores가 비어 있습니다.");
  }
  const sorted = sortScoresDesc(scores);
  const [first, second] = sorted;
  const margin = first.score - (second?.score ?? 0);
  const suggested = first.score >= topMin && margin >= marginMin;
  return {
    status: suggested ? "auto_suggested" : "needs_review",
    sorted,
    topClass: first.classId,
    topScore: first.score,
    secondClass: second?.classId ?? null,
    secondScore: second?.score ?? null,
    margin,
  };
}
