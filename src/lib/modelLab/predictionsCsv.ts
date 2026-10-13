/**
 * "예측 결과 CSV" 파싱 — 모델 평가 화면(가이드 6.3)이 두 입력 경로 중 하나로 쓴다. 실제
 * 이미지+모델을 브라우저에서 돌리는 경로가 기본이지만, 모델이 아직 없거나(G4, 모델 없이)
 * 이미 계산해 둔 예측값을 평가만 하고 싶을 때는 이 CSV를 올려 지표 계산 파이프라인만
 * 검증할 수 있다 — 실제 서비스 분석 코드에 가짜 예측값을 넣지 않고도 평가 화면을 테스트하는
 * 경로다(목 예측은 여기서만 쓰인다).
 */
import type { DatasetSplit, LabeledPrediction } from "./metrics";

const COLUMNS = ["id", "true_label", "predicted_label", "top_score", "margin", "split", "org_name"] as const;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

export interface PredictionsParseResult {
  predictions: LabeledPrediction[];
  errors: { line: number; message: string }[];
}

export function parsePredictionsCsv(csvText: string): PredictionsParseResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { predictions: [], errors: [{ line: 0, message: "빈 파일입니다." }] };

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return { predictions: [], errors: [{ line: 1, message: `필수 컬럼이 없습니다: ${missing.join(", ")}` }] };
  }
  const indexOf = (col: string) => header.indexOf(col);

  const predictions: LabeledPrediction[] = [];
  const errors: { line: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const get = (col: string) => cells[indexOf(col)]?.trim() ?? "";
    const id = get("id");
    const splitRaw = get("split");
    if (!id) {
      errors.push({ line: i + 1, message: "id가 비어 있습니다." });
      continue;
    }
    if (splitRaw !== "train" && splitRaw !== "dev" && splitRaw !== "test" && splitRaw !== "ood") {
      errors.push({ line: i + 1, message: `split 값이 올바르지 않습니다(train/dev/test/ood만 허용): "${splitRaw}"` });
      continue;
    }
    const topScoreRaw = get("top_score");
    const marginRaw = get("margin");
    predictions.push({
      id,
      trueLabel: get("true_label") || null,
      predictedLabel: get("predicted_label") || null,
      topScore: topScoreRaw === "" ? null : Number(topScoreRaw),
      margin: marginRaw === "" ? null : Number(marginRaw),
      split: splitRaw as DatasetSplit,
      orgName: get("org_name") || null,
    });
  }

  return { predictions, errors };
}
