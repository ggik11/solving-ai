import { csvRowsToRecords, parseCsv } from "./parse";

export const ACTIVITY_CSV_COLUMNS = [
  "title",
  "summary",
  "org_name",
  "source_url",
  "location_type",
  "region",
  "activity_type",
  "eligibility",
  "participation_mode",
  "team_min_size",
  "team_max_size",
  "benefit",
  "apply_start_at",
  "apply_end_at",
  "activity_start_at",
  "activity_end_at",
] as const;

const LOCATION_TYPES = ["online", "offline", "hybrid"] as const;
const PARTICIPATION_MODES = ["solo", "team", "both"] as const;

export interface ActivityCsvRow {
  rowNumber: number; // 1-based, 헤더 다음 줄이 1
  raw: Record<string, string>;
  title: string;
  summary: string | null;
  orgName: string | null;
  sourceUrl: string | null;
  locationType: (typeof LOCATION_TYPES)[number] | null;
  region: string | null;
  activityTypeName: string | null;
  eligibility: string | null;
  participationMode: (typeof PARTICIPATION_MODES)[number] | null;
  teamMinSize: number | null;
  teamMaxSize: number | null;
  benefit: string | null;
  applyStartAt: string | null; // ISO
  applyEndAt: string | null;
  activityStartAt: string | null;
  activityEndAt: string | null;
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
}

function toNullableString(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function tryParseDate(value: string | null): { iso: string | null; invalid: boolean } {
  if (!value) return { iso: null, invalid: false };
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+09:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return { iso: null, invalid: true };
  }
  return { iso: date.toISOString(), invalid: false };
}

function tryParseInt(value: string | null): { value: number | null; invalid: boolean } {
  if (!value) return { value: null, invalid: false };
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return { value: null, invalid: true };
  }
  return { value: n, invalid: false };
}

/** 같은 (제목, 주최기관) 조합을 중복 후보 판단 키로 쓴다 — 대소문자/공백 차이는 무시한다. */
export function duplicateKey(title: string, orgName: string | null): string {
  return `${title.trim().toLowerCase()}::${(orgName ?? "").trim().toLowerCase()}`;
}

export interface ValidateOptions {
  existingKeys: Set<string>; // DB에 이미 있는 (title, org_name) 조합
}

export function parseAndValidateActivitiesCsv(csvText: string, options: ValidateOptions): ActivityCsvRow[] {
  const records = csvRowsToRecords(parseCsv(csvText));
  const seenInFile = new Set<string>();
  const rows: ActivityCsvRow[] = [];

  records.forEach((record, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const title = toNullableString(record.title);
    if (!title) errors.push("제목(title)이 비어 있습니다.");

    const orgName = toNullableString(record.org_name);

    let locationType: (typeof LOCATION_TYPES)[number] | null = null;
    const locationRaw = toNullableString(record.location_type);
    if (locationRaw) {
      if ((LOCATION_TYPES as readonly string[]).includes(locationRaw)) {
        locationType = locationRaw as (typeof LOCATION_TYPES)[number];
      } else {
        errors.push(`location_type 값이 올바르지 않습니다: "${locationRaw}" (online/offline/hybrid 중 하나)`);
      }
    }

    let participationMode: (typeof PARTICIPATION_MODES)[number] | null = null;
    const participationRaw = toNullableString(record.participation_mode);
    if (participationRaw) {
      if ((PARTICIPATION_MODES as readonly string[]).includes(participationRaw)) {
        participationMode = participationRaw as (typeof PARTICIPATION_MODES)[number];
      } else {
        errors.push(`participation_mode 값이 올바르지 않습니다: "${participationRaw}" (solo/team/both 중 하나)`);
      }
    }

    const teamMin = tryParseInt(toNullableString(record.team_min_size));
    if (teamMin.invalid) errors.push("team_min_size는 양의 정수여야 합니다.");
    const teamMax = tryParseInt(toNullableString(record.team_max_size));
    if (teamMax.invalid) errors.push("team_max_size는 양의 정수여야 합니다.");
    if (teamMin.value != null && teamMax.value != null && teamMax.value < teamMin.value) {
      errors.push("team_max_size는 team_min_size보다 크거나 같아야 합니다.");
    }

    const applyStart = tryParseDate(toNullableString(record.apply_start_at));
    if (applyStart.invalid) errors.push("apply_start_at 날짜 형식을 읽을 수 없습니다 (예: 2026-10-15).");
    const applyEnd = tryParseDate(toNullableString(record.apply_end_at));
    if (applyEnd.invalid) errors.push("apply_end_at 날짜 형식을 읽을 수 없습니다 (예: 2026-10-15).");
    if (applyStart.iso && applyEnd.iso && applyEnd.iso < applyStart.iso) {
      errors.push("apply_end_at이 apply_start_at보다 이릅니다.");
    }
    const activityStart = tryParseDate(toNullableString(record.activity_start_at));
    if (activityStart.invalid) errors.push("activity_start_at 날짜 형식을 읽을 수 없습니다.");
    const activityEnd = tryParseDate(toNullableString(record.activity_end_at));
    if (activityEnd.invalid) errors.push("activity_end_at 날짜 형식을 읽을 수 없습니다.");

    const activityTypeName = toNullableString(record.activity_type);
    if (activityTypeName) {
      warnings.push(`유형 "${activityTypeName}"은 등록 시 기존 목록에서 이름이 일치해야 연결됩니다. 일치하지 않으면 유형 없이 등록됩니다.`);
    }

    let isDuplicate = false;
    if (title) {
      const key = duplicateKey(title, orgName);
      if (options.existingKeys.has(key) || seenInFile.has(key)) {
        isDuplicate = true;
        warnings.push("같은 제목·주최기관 조합이 이미 있습니다 (중복 후보).");
      }
      seenInFile.add(key);
    }

    rows.push({
      rowNumber: index + 1,
      raw: record,
      title: title ?? "",
      summary: toNullableString(record.summary),
      orgName,
      sourceUrl: toNullableString(record.source_url),
      locationType,
      region: toNullableString(record.region),
      activityTypeName,
      eligibility: toNullableString(record.eligibility),
      participationMode,
      teamMinSize: teamMin.value,
      teamMaxSize: teamMax.value,
      benefit: toNullableString(record.benefit),
      applyStartAt: applyStart.iso,
      applyEndAt: applyEnd.iso,
      activityStartAt: activityStart.iso,
      activityEndAt: activityEnd.iso,
      errors,
      warnings,
      isDuplicate,
    });
  });

  return rows;
}
