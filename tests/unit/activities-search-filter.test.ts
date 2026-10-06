import { describe, expect, it } from "vitest";
import { buildActivitySearchOrFilter, escapeOrFilterValue } from "@/app/activities/queries";

/**
 * PostgREST의 or() 파서를 흉내 낸 아주 단순한 분해기 — 큰따옴표로 감싼 리터럴 안의 쉼표는
 * 구분자로 보지 않고, 그 바깥의 쉼표만 조건 구분자로 본다. 실제 서버가 이렇게 파싱하므로,
 * 검색어에 쉼표·괄호 등을 넣어도 조건이 늘어나지 않는지(= 필터 주입이 안 되는지) 확인하는 데 쓴다.
 */
function splitTopLevelConditions(filter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < filter.length; i++) {
    const ch = filter[i];
    if (ch === '"' && filter[i - 1] !== "\\") {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "," && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

describe("escapeOrFilterValue", () => {
  it("값 전체를 큰따옴표로 감싼다", () => {
    expect(escapeOrFilterValue("hello")).toBe('"hello"');
  });

  it("백슬래시와 큰따옴표를 이스케이프한다", () => {
    expect(escapeOrFilterValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});

describe("buildActivitySearchOrFilter", () => {
  it("일반 검색어는 title/org_name 양쪽에 대한 ILIKE 조건 2개로 조립된다", () => {
    const filter = buildActivitySearchOrFilter("동아리");
    expect(filter).toBe('title.ilike."%동아리%",org_name.ilike."%동아리%"');
    expect(splitTopLevelConditions(filter)).toHaveLength(2);
  });

  it.each([
    ["a,is_public.eq.false", "쉼표로 새 조건을 주입하려는 시도"],
    ["%", "ILIKE 와일드카드만 입력"],
    ["()", "괄호(그룹/in 리스트 문법) 주입 시도"],
    ['a".eq."b', "큰따옴표로 리터럴 경계를 깨려는 시도"],
    ["a\\b", "백슬래시 포함"],
    ["", "빈 문자열"],
  ])("검색어 %p (%s) 에도 조건은 정확히 2개로 유지된다(필터 주입 불가)", (q) => {
    const filter = buildActivitySearchOrFilter(q);
    // title.ilike.<값>, org_name.ilike.<값> 딱 2개여야 한다 — 그 이상이면 검색어가
    // 새로운 조건을 주입한 것이다.
    expect(splitTopLevelConditions(filter)).toHaveLength(2);
    // 조립된 문자열이 항상 큰따옴표로 감싼 값으로 시작하는지 확인(원문 그대로 노출되지 않음).
    expect(filter.startsWith('title.ilike."')).toBe(true);
    expect(filter).toContain('org_name.ilike."');
  });
});
