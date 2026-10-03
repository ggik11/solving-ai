import { describe, expect, it } from "vitest";
import { parseCsv, csvRowsToRecords } from "@/lib/csv/parse";
import { parseAndValidateActivitiesCsv, duplicateKey } from "@/lib/csv/activities";

describe("parseCsv", () => {
  it("쉼표로 구분된 일반 행을 읽는다", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("쌍따옴표로 감싼 필드 안의 쉼표를 보존한다", () => {
    expect(parseCsv('title,desc\n"공모전, 봉사",테스트')).toEqual([
      ["title", "desc"],
      ["공모전, 봉사", "테스트"],
    ]);
  });

  it("쌍따옴표 escape(\"\")를 처리한다", () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([["a"], ['say "hi"']]);
  });
});

describe("csvRowsToRecords", () => {
  it("헤더를 키로 매핑한다", () => {
    const records = csvRowsToRecords([
      ["title", "org_name"],
      ["활동1", "기관1"],
    ]);
    expect(records).toEqual([{ title: "활동1", org_name: "기관1" }]);
  });
});

const HEADER = "title,summary,org_name,source_url,location_type,region,activity_type,eligibility,participation_mode,team_min_size,team_max_size,benefit,apply_start_at,apply_end_at,activity_start_at,activity_end_at";

describe("parseAndValidateActivitiesCsv — 정상 행", () => {
  it("필수값만 있어도 통과한다", () => {
    const csv = `${HEADER}\n새 활동,,,,,,,,,,,,,,,`;
    const rows = parseAndValidateActivitiesCsv(csv, { existingKeys: new Set() });
    expect(rows).toHaveLength(1);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].title).toBe("새 활동");
  });

  it("날짜가 YYYY-MM-DD 형식이면 자정 KST로 해석한다", () => {
    const csv = `${HEADER}\n새 활동,,,,,,,,,,,,2026-10-15,2026-10-20,,`;
    const rows = parseAndValidateActivitiesCsv(csv, { existingKeys: new Set() });
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].applyStartAt).toBe(new Date("2026-10-15T00:00:00+09:00").toISOString());
  });
});

describe("parseAndValidateActivitiesCsv — 잘못된 행", () => {
  it("제목이 비어 있으면 에러를 낸다", () => {
    const csv = `${HEADER}\n,,,,,,,,,,,,,,,`;
    const rows = parseAndValidateActivitiesCsv(csv, { existingKeys: new Set() });
    expect(rows[0].errors).toContain("제목(title)이 비어 있습니다.");
  });

  it("location_type이 허용값이 아니면 에러를 낸다", () => {
    const csv = `${HEADER}\n활동,,,,offsite,,,,,,,,,,,`;
    const rows = parseAndValidateActivitiesCsv(csv, { existingKeys: new Set() });
    expect(rows[0].errors.some((e) => e.includes("location_type"))).toBe(true);
  });

  it("participation_mode가 허용값이 아니면 에러를 낸다", () => {
    const csv = `${HEADER}\n활동,,,,,,,,그룹,,,,,,,`;
    const rows = parseAndValidateActivitiesCsv(csv, { existingKeys: new Set() });
    expect(rows[0].errors.some((e) => e.includes("participation_mode"))).toBe(true);
  });

  it("apply_end_at이 apply_start_at보다 이르면 에러를 낸다", () => {
    const csv = `${HEADER}\n활동,,,,,,,,,,,,2026-10-20,2026-10-10,,`;
    const rows = parseAndValidateActivitiesCsv(csv, { existingKeys: new Set() });
    expect(rows[0].errors.some((e) => e.includes("apply_end_at"))).toBe(true);
  });

  it("날짜를 읽을 수 없으면 에러를 낸다", () => {
    const csv = `${HEADER}\n활동,,,,,,,,,,,,아무날,,,`;
    const rows = parseAndValidateActivitiesCsv(csv, { existingKeys: new Set() });
    expect(rows[0].errors.some((e) => e.includes("apply_start_at"))).toBe(true);
  });

  it("team_max_size가 team_min_size보다 작으면 에러를 낸다", () => {
    const csv = `${HEADER}\n활동,,,,,,,,,5,2,,,,,`;
    const rows = parseAndValidateActivitiesCsv(csv, { existingKeys: new Set() });
    expect(rows[0].errors.some((e) => e.includes("team_max_size"))).toBe(true);
  });
});

describe("parseAndValidateActivitiesCsv — 중복", () => {
  it("DB에 이미 있는 (제목, 주최기관) 조합은 중복으로 표시한다", () => {
    const csv = `${HEADER}\n기존 활동,,데모기관,,,,,,,,,,,,,`;
    const rows = parseAndValidateActivitiesCsv(csv, {
      existingKeys: new Set([duplicateKey("기존 활동", "데모기관")]),
    });
    expect(rows[0].isDuplicate).toBe(true);
    expect(rows[0].errors).toEqual([]); // 중복은 경고일 뿐 에러는 아니다
  });

  it("같은 파일 안에서 반복되면 두 번째 행부터 중복으로 표시한다", () => {
    const csv = `${HEADER}\n새 활동,,기관,,,,,,,,,,,,,\n새 활동,,기관,,,,,,,,,,,,,`;
    const rows = parseAndValidateActivitiesCsv(csv, { existingKeys: new Set() });
    expect(rows[0].isDuplicate).toBe(false);
    expect(rows[1].isDuplicate).toBe(true);
  });

  it("제목은 같지만 주최기관이 다르면 중복이 아니다", () => {
    const csv = `${HEADER}\n활동,,기관A,,,,,,,,,,,,,\n활동,,기관B,,,,,,,,,,,,,`;
    const rows = parseAndValidateActivitiesCsv(csv, { existingKeys: new Set() });
    expect(rows[0].isDuplicate).toBe(false);
    expect(rows[1].isDuplicate).toBe(false);
  });
});
