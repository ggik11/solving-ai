/**
 * datasets/manifest.csv 양식 파싱과 검사(가이드 6.2). 전부 순수 함수다 — 실제 이미지 폴더는
 * .gitignore 대상이고, 이 모듈은 텍스트(csv)만 다룬다.
 */

export type DatasetSplit = "train" | "dev" | "test" | "ood";

export interface ManifestRow {
  imagePath: string;
  eventId: string;
  seriesId: string | null;
  orgName: string | null;
  sourceUrl: string | null;
  collectedAt: string | null;
  label: string;
  secondaryLabels: string[];
  split: DatasetSplit;
  note: string | null;
}

const COLUMNS = [
  "image_path",
  "event_id",
  "series_id",
  "org_name",
  "source_url",
  "collected_at",
  "label",
  "secondary_labels",
  "split",
  "note",
] as const;

/** 아주 단순한 CSV 파서 — 쌍따옴표로 감싼 필드 안의 쉼표만 지원한다(이 양식 범위에 충분하다). */
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

export interface ManifestParseResult {
  rows: ManifestRow[];
  /** 파싱 자체에서 걸러진 문제(필수 컬럼 누락, split 값 오류 등) — 행 번호는 1-based, 헤더 제외. */
  errors: { line: number; message: string }[];
}

export function parseManifestCsv(csvText: string): ManifestParseResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { rows: [], errors: [{ line: 0, message: "빈 파일입니다." }] };

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const missingColumns = COLUMNS.filter((c) => !header.includes(c));
  if (missingColumns.length > 0) {
    return { rows: [], errors: [{ line: 1, message: `필수 컬럼이 없습니다: ${missingColumns.join(", ")}` }] };
  }
  const indexOf = (col: string) => header.indexOf(col);

  const rows: ManifestRow[] = [];
  const errors: { line: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const get = (col: string) => cells[indexOf(col)]?.trim() ?? "";
    const imagePath = get("image_path");
    const eventId = get("event_id");
    const label = get("label");
    const splitRaw = get("split");

    if (!imagePath) {
      errors.push({ line: i + 1, message: "image_path가 비어 있습니다." });
      continue;
    }
    if (!eventId) {
      errors.push({ line: i + 1, message: "event_id가 비어 있습니다." });
      continue;
    }
    if (!label) {
      errors.push({ line: i + 1, message: "label이 비어 있습니다." });
      continue;
    }
    if (splitRaw !== "train" && splitRaw !== "dev" && splitRaw !== "test" && splitRaw !== "ood") {
      errors.push({ line: i + 1, message: `split 값이 올바르지 않습니다(train/dev/test/ood만 허용): "${splitRaw}"` });
      continue;
    }

    rows.push({
      imagePath,
      eventId,
      seriesId: get("series_id") || null,
      orgName: get("org_name") || null,
      sourceUrl: get("source_url") || null,
      collectedAt: get("collected_at") || null,
      label,
      secondaryLabels: get("secondary_labels")
        ? get("secondary_labels").split(/[;,]/).map((s) => s.trim()).filter(Boolean)
        : [],
      split: splitRaw,
      note: get("note") || null,
    });
  }

  return { rows, errors };
}

export interface SplitLeak {
  key: string;
  kind: "event_id" | "series_id";
  splits: DatasetSplit[];
}

/** 같은 event_id나 series_id가 여러 split에 섞였는지(가이드 6.2) — 같은 행사의 변형본이 train과
 * test에 동시에 들어가면 평가가 과대평가된다. */
export function findCrossSplitLeaks(rows: ManifestRow[]): SplitLeak[] {
  const leaks: SplitLeak[] = [];
  for (const kind of ["event_id", "series_id"] as const) {
    const key = kind === "event_id" ? "eventId" : "seriesId";
    const groups = new Map<string, Set<DatasetSplit>>();
    for (const row of rows) {
      const value = row[key as "eventId" | "seriesId"];
      if (!value) continue;
      const set = groups.get(value) ?? new Set<DatasetSplit>();
      set.add(row.split);
      groups.set(value, set);
    }
    for (const [value, splits] of groups) {
      if (splits.size > 1) leaks.push({ key: value, kind, splits: [...splits].sort() });
    }
  }
  return leaks;
}

export interface ClassBalanceRow {
  label: string;
  count: number;
}

/** 분야별 개수 균형(가이드 6.2) — train/dev/test(ood 제외)만 센다. */
export function computeClassBalance(rows: ManifestRow[]): ClassBalanceRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.split === "ood") continue;
    counts.set(row.label, (counts.get(row.label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export interface OrgConcentration {
  label: string;
  dominantOrg: string;
  share: number;
}

/** 한 분야가 특정 기관에 70% 이상 몰렸는지(가이드 6.2, 기본 임계값 0.7). */
export function findOrgConcentration(rows: ManifestRow[], threshold = 0.7): OrgConcentration[] {
  const byLabel = new Map<string, ManifestRow[]>();
  for (const row of rows) {
    if (row.split === "ood" || !row.orgName) continue;
    const list = byLabel.get(row.label) ?? [];
    list.push(row);
    byLabel.set(row.label, list);
  }
  const results: OrgConcentration[] = [];
  for (const [label, labelRows] of byLabel) {
    const byOrg = new Map<string, number>();
    for (const row of labelRows) byOrg.set(row.orgName as string, (byOrg.get(row.orgName as string) ?? 0) + 1);
    const [dominantOrg, count] = [...byOrg.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = count / labelRows.length;
    if (share >= threshold) results.push({ label, dominantOrg, share });
  }
  return results;
}

/** 라벨이 모델 클래스 ID인지(가이드 6.2) — model_class_field_map의 class_id 집합과 비교한다. */
export function findInvalidLabels(rows: ManifestRow[], validClassIds: string[]): { line: ManifestRow; label: string }[] {
  const valid = new Set(validClassIds);
  return rows.filter((row) => !valid.has(row.label)).map((row) => ({ line: row, label: row.label }));
}
